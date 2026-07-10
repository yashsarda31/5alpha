import requests
import json
from datetime import datetime, timezone, timedelta

BASE_URL = "http://localhost:8000"

def test_expiries(symbol):
    print(f"\n--- Testing Expiries for {symbol} ---")
    url = f"{BASE_URL}/api/option-chain/expiries/{symbol}"
    try:
        r = requests.get(url, timeout=10)
        print("Status Code:", r.status_code)
        if r.status_code == 200:
            data = r.json()
            expiries = data.get("expiries", [])
            print("Lot Size:", data.get("lotSize"))
            print(f"Number of expiries found: {len(expiries)}")
            print("First 3 Expiries:", expiries[:3])
            
            # Verify past expiries are filtered out
            ist = timezone(timedelta(hours=5, minutes=30))
            today = datetime.now(ist).date()
            past_found = False
            for exp in expiries:
                dt = datetime.strptime(exp.split("T")[0], "%Y-%m-%d").date()
                if dt < today:
                    print(f"Warning: Past expiry found! {exp}")
                    past_found = True
            if not past_found:
                print("Success: No past expiries found.")
            return expiries
        else:
            print("Error Response:", r.text)
    except Exception as e:
        print("Request failed:", e)
    return []

def test_data(symbol, expiry):
    print(f"\n--- Testing Data for {symbol} (Expiry: {expiry}) ---")
    url = f"{BASE_URL}/api/option-chain/data/{symbol}?expiryDate={expiry}"
    try:
        r = requests.get(url, timeout=10)
        print("Status Code:", r.status_code)
        if r.status_code == 200:
            data = r.json()
            spot = data.get("spotData", {})
            vix = data.get("vixData", {})
            chain = data.get("optionChain", {})
            op_datas = chain.get("opDatas", [])
            
            print(f"Spot Symbol: {spot.get('symbol_name')}")
            print(f"Spot Price (Fresh yfinance backup): {spot.get('last_trade_price')}")
            print(f"Spot Daily Change: {spot.get('change_value')} ({spot.get('change_per')}%)")
            print(f"VIX Price: {vix.get('last_trade_price')}")
            print(f"Number of strike rows: {len(op_datas)}")
            
            if op_datas:
                sample = op_datas[len(op_datas)//2]
                print("Sample Mid-Strike Row:")
                print(json.dumps(sample, indent=2))
                
                # Check index_close
                if sample.get("index_close") == spot.get("last_trade_price"):
                    print("Success: Row index_close matches the fresh spot price.")
                else:
                    print(f"Mismatch: index_close={sample.get('index_close')}, spot_price={spot.get('last_trade_price')}")
            else:
                print("Warning: opDatas is empty!")
        else:
            print("Error Response:", r.text)
    except Exception as e:
        print("Request failed:", e)

if __name__ == "__main__":
    # Test NIFTY (Primary NSE)
    nifty_exp = test_expiries("NIFTY")
    if nifty_exp:
        test_data("NIFTY", nifty_exp[0])
        
    # Test US Stock (yfinance Fallback)
    aapl_exp = test_expiries("AAPL")
    if aapl_exp:
        test_data("AAPL", aapl_exp[0])
