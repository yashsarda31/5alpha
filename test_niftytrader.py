import requests
import json

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.niftytrader.in/nse-option-chain"
}

url1 = "https://api.niftytrader.in/api/Symbol/symbol-expiry-all?symbol=NIFTY&exchange=nse"
r = requests.get(url1, headers=headers)
data = r.json()

filtered = [item for item in data.get("resultData", []) if item.get("symbol_name", "").upper() == "NIFTY"]
if filtered:
    exp_dates = sorted(list(set(item.get("expiry_date") for item in filtered)))
    print("NIFTY Expiries:", exp_dates[:5])
    
    # Try the first expiry date
    expiry = exp_dates[0]
    
    url2 = f"https://api.niftytrader.in/api/option/option-chain-data?symbol=NIFTY&exchange=nse&expiryDate={expiry}&atmBelow=20&atmAbove=20"
    r2 = requests.get(url2, headers=headers)
    print("First Expiry url:", url2)
    print("First Expiry result:", r2.text[:200])

    # Also try mapping the date to dd-MMM-yyyy maybe?
    from datetime import datetime
    dt = datetime.strptime(expiry, "%Y-%m-%dT%H:%M:%S")
    formatted = dt.strftime("%d-%b-%Y").upper()
    url3 = f"https://api.niftytrader.in/api/option/option-chain-data?symbol=NIFTY&exchange=nse&expiryDate={formatted}&atmBelow=20&atmAbove=20"
    r3 = requests.get(url3, headers=headers)
    print("Formatted Expiry url:", url3)
    print("Formatted Expiry result:", r3.text[:200])
    
    formatted2 = dt.strftime("%d-%b-%Y") # case sensitive? "21-May-2026"
    url4 = f"https://api.niftytrader.in/api/option/option-chain-data?symbol=NIFTY&exchange=nse&expiryDate={formatted2}&atmBelow=20&atmAbove=20"
    r4 = requests.get(url4, headers=headers)
    print("Formatted Expiry2 result:", r4.text[:200])

else:
    print("NIFTY not found in expiries.")
