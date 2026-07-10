import requests
from datetime import datetime, timedelta

session = requests.Session()
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
    "Accept": "application/json"
}
try:
    session.get("https://www.nseindia.com", headers=headers, timeout=10)
    url = "https://www.nseindia.com/api/historical/fiidii?from=01-May-2026&to=06-Jun-2026"
    r = session.get(url, headers=headers, timeout=10)
    print("Status:", r.status_code)
    print("Data:", r.text[:200])
except Exception as e:
    print(e)
