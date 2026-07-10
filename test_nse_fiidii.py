import requests
import json

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

session = requests.Session()
try:
    session.get("https://www.nseindia.com", headers=headers, timeout=10)
    r = session.get("https://www.nseindia.com/api/fiidiiTradeReact", headers=headers, timeout=10)
    print("Status:", r.status_code)
    print("Data:", r.text)
except Exception as e:
    print("Error:", e)
