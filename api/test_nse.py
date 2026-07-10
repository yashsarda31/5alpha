import requests
import json
import time

def test_nse_with_session():
    session = requests.Session()
    
    # Realistic browser headers
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Cache-Control": "max-age=0",
    }
    
    # Step 1: Visit homepage to get cookies
    print("Step 1: Warming up cookies with NSE homepage...")
    try:
        r1 = session.get("https://www.nseindia.com", headers=headers, timeout=15)
        print(f"  Homepage status: {r1.status_code}")
        print(f"  Cookies received: {dict(session.cookies)}")
    except Exception as e:
        print(f"  Homepage error: {e}")
    
    time.sleep(1)
    
    # Step 2: Visit option chain page
    print("\nStep 2: Visiting option chain page...")
    try:
        r2 = session.get("https://www.nseindia.com/option-chain", headers={**headers, "Referer": "https://www.nseindia.com/"}, timeout=15)
        print(f"  OC page status: {r2.status_code}")
    except Exception as e:
        print(f"  OC page error: {e}")
    
    time.sleep(1)
    
    # Step 3: Fetch option chain API
    print("\nStep 3: Fetching option chain API...")
    api_headers = {
        "User-Agent": headers["User-Agent"],
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.nseindia.com/option-chain",
        "X-Requested-With": "XMLHttpRequest",
        "Connection": "keep-alive",
    }
    
    try:
        r3 = session.get("https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY", headers=api_headers, timeout=15)
        print(f"  API status: {r3.status_code}")
        
        if r3.status_code == 200:
            data = r3.json()
            records = data.get("records", {})
            expiry_dates = records.get("expiryDates", [])
            print(f"  Expiry dates ({len(expiry_dates)}): {expiry_dates[:5]}...")
            
            underlying = records.get("underlyingValue")
            print(f"  Underlying: {underlying}")
            
            # Get data for nearest expiry
            all_data = records.get("data", [])
            if expiry_dates:
                nearest = expiry_dates[0]
                filtered = [d for d in all_data if d.get("expiryDate") == nearest]
                print(f"\n  Data for {nearest}: {len(filtered)} strikes")
                
                # Show ATM strikes
                if underlying:
                    atm = [d for d in filtered if abs(d.get("strikePrice", 0) - underlying) < 200]
                    for d in atm[:5]:
                        ce = d.get("CE", {})
                        pe = d.get("PE", {})
                        print(f"    Strike {d['strikePrice']}: CE OI={ce.get('openInterest', 'N/A')}, PE OI={pe.get('openInterest', 'N/A')}, CE LTP={ce.get('lastPrice', 'N/A')}, PE LTP={pe.get('lastPrice', 'N/A')}")
        else:
            print(f"  Response: {r3.text[:300]}")
    except Exception as e:
        print(f"  API error: {e}")

if __name__ == "__main__":
    test_nse_with_session()
