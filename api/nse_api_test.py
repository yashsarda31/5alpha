import requests
import json

def fetch_nse_option_chain(symbol):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }
    session = requests.Session()
    # First get the cookies
    try:
        session.get("https://www.nseindia.com", headers=headers, timeout=10)
    except:
        pass
        
    url = f"https://www.nseindia.com/api/option-chain-indices?symbol={symbol.upper()}"
    if symbol.upper() not in ['NIFTY', 'FINNIFTY', 'BANKNIFTY', 'MIDCPNIFTY']:
        url = f"https://www.nseindia.com/api/option-chain-equities?symbol={symbol.upper()}"
        
    try:
        r = session.get(url, headers=headers, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print("Records keys:", data['records'].keys())
            print("Expiry dates:", data['records']['expiryDates'][:5])
            print("First row:", data['records']['data'][0])
            return True
    except Exception as e:
        print(f"Error: {e}")
    return False

if __name__ == "__main__":
    fetch_nse_option_chain("NIFTY")
