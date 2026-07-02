import yfinance as yf
import pandas as pd

def test_momentum():
    ticker = "AAPL"
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="14mo")
        print(f"Ticker: {ticker}")
        print(f"History length: {len(hist)}")
        if hist.empty or len(hist) < 252:
            print("FAILED: History too short or empty")
            return
        
        current_price = hist['Close'].iloc[-1]
        price_1m = hist['Close'].iloc[-21]
        price_6m = hist['Close'].iloc[-126]
        price_12m = hist['Close'].iloc[-252]

        mom_1m = ((current_price / price_1m) - 1) * 100
        mom_6m = ((current_price / price_6m) - 1) * 100
        mom_12m = ((current_price / price_12m) - 1) * 100
        
        print(f"Price: {current_price:.2f}")
        print(f"1M: {mom_1m:.2f}%")
        print(f"6M: {mom_6m:.2f}%")
        print(f"12M: {mom_12m:.2f}%")
    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    test_momentum()
