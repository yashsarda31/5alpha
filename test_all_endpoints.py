import requests

BASE_URL = "http://localhost:8000/api"

def check(name, url, method="GET", json_payload=None, params=None):
    try:
        if method == "GET":
            r = requests.get(url, params=params, timeout=15)
        else:
            r = requests.post(url, json=json_payload, timeout=15)
        
        status = r.status_code
        if status == 200:
            print(f"[PASS] {name} - Status: {status}")
            return r.json()
        else:
            print(f"[FAIL] {name} - Status: {status}, Response: {r.text[:200]}")
    except Exception as e:
        print(f"[ERROR] {name} - Failed to request: {str(e)}")
    return None

def test_all():
    print("--- Testing API Endpoints ---")
    
    # 1. Chart
    check("Chart Endpoint", f"{BASE_URL}/chart/AAPL")
    
    # 2. Screener
    check("Screener Endpoint", f"{BASE_URL}/screener", method="POST", json_payload={"tickers": "AAPL"})
    
    # 3. DCF
    check("DCF Endpoint", f"{BASE_URL}/dcf", method="POST", json_payload={"ticker": "AAPL", "wacc": 8.5, "perpetual_growth": 2.5})
    
    # 4. DCF Data
    check("DCF Data Endpoint", f"{BASE_URL}/dcf/data/AAPL")
    
    # 5. ARIMA
    check("ARIMA Endpoint", f"{BASE_URL}/arima", method="POST", json_payload={"ticker": "AAPL", "days": 5})
    
    # 6. Momentum
    check("Momentum Endpoint (US)", f"{BASE_URL}/momentum", params={"market": "us"})
    
    # 7. Fundamentals
    check("Fundamentals Endpoint", f"{BASE_URL}/fundamentals/AAPL")
    
    # 8. News
    check("News Endpoint", f"{BASE_URL}/news/AAPL")
    
    # 9. FII/DII
    check("FII/DII Endpoint", f"{BASE_URL}/fiidii")
    
    # 10. Option Chain Expiries
    expiries = check("Option Chain Expiries (NIFTY)", f"{BASE_URL}/option-chain/expiries/nifty")
    
    # 11. Option Chain Data
    if expiries and "expiries" in expiries and len(expiries["expiries"]) > 0:
        expiry = expiries["expiries"][0]
        check(f"Option Chain Data (NIFTY - Expiry {expiry})", f"{BASE_URL}/option-chain/data/nifty", params={"expiryDate": expiry})
    else:
        check("Option Chain Data (NIFTY - Default Expiry)", f"{BASE_URL}/option-chain/data/nifty")

if __name__ == "__main__":
    test_all()
