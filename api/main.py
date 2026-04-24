from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import numpy as np
from statsmodels.tsa.statespace.sarimax import SARIMAX
from google import genai
import os
import concurrent.futures

app = FastAPI(title="5Alpha API V2", description="Institutional Analytics API")

# Connect React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Models ---
class DCFRequest(BaseModel):
    ticker: str
    wacc: float = 8.5
    perpetual_growth: float = 2.5

class ARIMARequest(BaseModel):
    ticker: str
    days: int = 10

class AIChartRequest(BaseModel):
    ticker: str
    data_summary: str
    apiKey: str

class AIDCFRequest(BaseModel):
    ticker: str
    dcf_data: dict
    apiKey: str

class AIARIMARequest(BaseModel):
    ticker: str
    forecast_data: dict
    apiKey: str

class AIPositionSizingRequest(BaseModel):
    capital: float
    risk_percent: float
    entry_price: float
    stop_loss: float
    shares: int
    apiKey: str

class AIScreenerRequest(BaseModel):
    screener_data: list
    apiKey: str

class ScreenerRequest(BaseModel):
    tickers: str = "AAPL, MSFT, NVDA, RELIANCE.NS, TCS.NS, HDFCBANK.NS"
    max_pe: float = None
    min_div_yield: float = None

# --- Endpoints ---

@app.post("/api/screener")
def run_screener(req: ScreenerRequest):
    tickers = [t.strip() for t in req.tickers.split(",") if t.strip()]
    results = []

    def process_ticker(ticker):
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            pe = info.get("trailingPE")
            div = info.get("dividendYield")
            if div is None:
                div = 0
            
            if req.max_pe is not None and pe is not None and pe > req.max_pe:
                return None
            if req.min_div_yield is not None and (div * 100) < req.min_div_yield:
                return None
                
            return {
                "ticker": ticker,
                "price": info.get("currentPrice", 0),
                "marketCap": info.get("marketCap", 0) / 1e9,
                "peRatio": pe,
                "divYield": div * 100
            }
        except Exception:
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(process_ticker, t): t for t in tickers}
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res:
                results.append(res)
                
    return {"data": results}


@app.get("/api/chart/{ticker}")
def get_chart(ticker: str):
    stock = yf.Ticker(ticker)
    # Fetch 1y + extra days to avoid SMA "warm-up" period (0/NaN values at start)
    df = stock.history(period="2y") # Fetch 2y but we will slice to 1y
    if df.empty:
        raise HTTPException(status_code=404, detail="Ticker not found")
        
    df['SMA_20'] = df['Close'].rolling(window=20).mean()
    
    # Slice to the last 1 year (approx 252 trading days) to ensure MA is fully calculated
    df = df.tail(252)
    
    # Clean index to string format
    df.index = df.index.strftime('%Y-%m-%d')
    # Fill any remaining NaNs (though tail(252) should be clean)
    df = df.ffill().bfill()
    
    payload = {
        "dates": df.index.tolist(),
        "open": df['Open'].tolist(),
        "high": df['High'].tolist(),
        "low": df['Low'].tolist(),
        "close": df['Close'].tolist(),
        "volume": df['Volume'].tolist(),
        "sma20": df['SMA_20'].tolist()
    }
    return payload


@app.post("/api/dcf")
def calculate_dcf(req: DCFRequest):
    stock = yf.Ticker(req.ticker)
    info = stock.info
    
    current_price = info.get("currentPrice", 0)
    shares_out = info.get("sharesOutstanding", 0)
    
    # Auto-populate using yfinance cashflow
    cashflow = stock.cashflow
    balance_sheet = stock.balance_sheet
    
    fcf = 0
    net_debt = 0
    
    try:
        fcf = cashflow.loc["Free Cash Flow"].iloc[0]
    except Exception:
        if "Operating Cash Flow" in cashflow.index and "Capital Expenditure" in cashflow.index:
            # Capital expenditure is usually reported as negative
            capex = cashflow.loc["Capital Expenditure"].iloc[0]
            fcf = cashflow.loc["Operating Cash Flow"].iloc[0] + (capex if capex < 0 else -capex)
        else:
            fcf = 1000000000
        
    try:
        total_debt = balance_sheet.loc["Total Debt"].iloc[0]
        cash = balance_sheet.loc["Cash And Cash Equivalents"].iloc[0]
        net_debt = total_debt - cash
    except Exception:
        net_debt = info.get("totalDebt", 0) - info.get("totalCash", 0)

    # Simplified Model Implementation for speed
    g1 = 0.10
    g2 = 0.05
    wacc = req.wacc / 100
    pg = req.perpetual_growth / 100
    
    fcfs = []
    current_fcf = fcf
    for y in range(1, 11):
        g = g1 if y <= 5 else g2
        current_fcf *= (1 + g)
        fcfs.append(current_fcf)
        
    discount_factor = (1 + wacc)
    pv_fcfs = [f / (discount_factor ** y) for y, f in zip(range(1, 11), fcfs)]
    tv = (fcfs[-1] * (1 + pg)) / max(0.001, wacc - pg)
    pv_tv = tv / (discount_factor ** 10)
    
    equity_val = sum(pv_fcfs) + pv_tv - net_debt
    val_per_share = equity_val / shares_out if shares_out > 0 else 0
    
    upside = ((val_per_share / current_price) - 1) * 100 if current_price > 0 else 0

    return {
        "ticker": req.ticker,
        "currentPrice": current_price,
        "intrinsicValue": round(val_per_share, 2),
        "upside": round(upside, 2),
        "autoPopulated": {
            "baseFcf": fcf,
            "netDebt": net_debt,
            "sharesOut": shares_out
        }
    }


@app.post("/api/arima")
def forecast_sarimax(req: ARIMARequest):
    stock = yf.Ticker(req.ticker)
    df = stock.history(period="2y")
    if df.empty:
        raise HTTPException(status_code=404, detail="Data not found")
        
    df = df.ffill().bfill()
    prices = df['Close'].values[-252:] # last year of trading days
    dates = df.index[-252:].strftime('%Y-%m-%d').tolist()
    
    # SARIMAX Implementation
    try:
        # Add constant drift (trend='c') and weekly seasonality (s=5) 
        # to prevent standard ARIMA random-walk flatlining.
        model = SARIMAX(prices, order=(1, 1, 1), seasonal_order=(1, 0, 1, 5), trend='c') 
        fit_model = model.fit(disp=False)
        
        forecast_res = fit_model.get_forecast(steps=req.days)
        forecast = forecast_res.predicted_mean
        conf_int = forecast_res.conf_int()
        
        lower_bound = conf_int[:, 0]
        upper_bound = conf_int[:, 1]
        
        last_date = df.index[-1]
        future_dates = [(last_date + pd.Timedelta(days=i)).strftime('%Y-%m-%d') for i in range(1, req.days + 1)]
        
        return {
            "historical": {"dates": dates, "prices": prices.tolist()},
            "forecast": {
                "dates": future_dates, 
                "prices": forecast.tolist(),
                "lower": lower_bound.tolist(),
                "upper": upper_bound.tolist()
            }
        }
    except Exception as e:
         raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/ai/chart")
def ai_chart_summary(req: AIChartRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = genai.Client(api_key=req.apiKey)
    prompt = f"""
    You are an automated analytical system. Ensure your output is purely factual and objective.
    Do NOT provide any predictive financial advice or investment recommendations.
    Summarize the following price action and technical data for '{req.ticker}'.
    Format the response using markdown bullet points. Highlight key support/resistance inference and trend strength from an institutional perspective.
    
    Data:
    {req.data_summary}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return {"report": f"AI Error: {str(e)}"}

@app.post("/api/ai/dcf")
def ai_dcf_summary(req: AIDCFRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = genai.Client(api_key=req.apiKey)
    prompt = f"""
    You are an automated analytical system. Ensure your output is purely factual and objective.
    Do NOT provide predictive financial advice or investment recommendations.
    Review the following mathematically derived Discounted Cash Flow (DCF) output for '{req.ticker}'.
    Format using markdown bullet points. State objectively if the asset appears overvalued, undervalued, or fairly valued based purely on the presented implied intrinsic margin of safety. Detail assumption sensitivities.
    
    DCF Data Summary:
    {req.dcf_data}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return {"report": f"AI Error: {str(e)}"}

@app.post("/api/ai/arima")
def ai_arima_summary(req: AIARIMARequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = genai.Client(api_key=req.apiKey)
    prompt = f"""
    You are an automated analytical system. Ensure your output is purely factual and objective.
    Review the following SARIMAX statistical projection for '{req.ticker}'. 
    Format using markdown bullet points. Detail the projected trend direction, potential volatility bounds, and any mean-reverting tendencies based on the numbers.
    Do NOT provide predictive financial advice.
    
    Forecast Data:
    {req.forecast_data}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return {"report": f"AI Error: {str(e)}"}

@app.post("/api/ai/position-sizing")
def ai_position_sizing_summary(req: AIPositionSizingRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = genai.Client(api_key=req.apiKey)
    prompt = f"""
    You are an automated quantitative risk management system. 
    Analyze the following trade setup from an institutional capital preservation perspective.
    Format your response in markdown bullet points. Highlight risk concentration, Risk:Reward assumptions needed, and the impact of the sizing on the overall portfolio.
    
    Capital: ${req.capital}
    Risk: {req.risk_percent}%
    Entry: ${req.entry_price}
    Stop Loss: ${req.stop_loss}
    Computed Shares: {req.shares}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return {"report": f"AI Error: {str(e)}"}

@app.post("/api/ai/screener")
def ai_screener_summary(req: AIScreenerRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = genai.Client(api_key=req.apiKey)
    prompt = f"""
    You are an institutional quantitative system.
    Evaluate the following cross-section of equities derived from a quantitative screen.
    Format using markdown bullet points. Identify statistical outliers regarding P/E and Dividend Yield, identify potential value traps, and provide a comparative macro perspective.
    Do NOT provide investment advice.
    
    Screener Data:
    {req.screener_data}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return {"report": f"AI Error: {str(e)}"}

# --- Static File Serving (Production) ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIST_DIR = os.path.join(BASE_DIR, '..', 'web', 'dist')

if os.path.isdir(WEB_DIST_DIR):
    app.mount("/", StaticFiles(directory=WEB_DIST_DIR, html=True), name="static")

    @app.exception_handler(404)
    async def custom_404_handler(request, exc):
        path = request.url.path
        from fastapi.responses import JSONResponse
        if path.startswith("/api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        
        index_path = os.path.join(WEB_DIST_DIR, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return {"detail": "Frontend build not found"}

