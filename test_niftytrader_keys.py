import requests
import json

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.niftytrader.in/nse-option-chain"
}
# Using NIFTY for testing
url = "https://api.niftytrader.in/api/option/option-chain-data?symbol=NIFTY&exchange=nse&atmBelow=5&atmAbove=5"
r = requests.get(url, headers=headers)
if r.status_code == 200:
    data = r.json().get("resultData", {})
    opDatas = data.get("opDatas", [])
    if opDatas:
        print("KEYS IN opDatas row:")
        print(json.dumps(opDatas[0], indent=2))
        
    spot_url = "https://api.niftytrader.in/api/symbol/today-spot-data?symbol=NIFTY+50"
    r2 = requests.get(spot_url, headers=headers)
    if r2.status_code == 200:
        spot = r2.json().get("resultData", {})
        print("KEYS IN spotData:")
        print(json.dumps(spot, indent=2))
else:
    print(f"Failed: {r.status_code}")
