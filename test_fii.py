import requests

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Referer": "https://www.niftytrader.in/"
}
urls = [
    "https://api.niftytrader.in/api/Fiidii/fii-dii-activity",
    "https://api.niftytrader.in/api/Fiidii/fii-dii-cash-market",
    "https://api.niftytrader.in/api/Fiidii/cash-market",
    "https://api.niftytrader.in/api/fii-dii",
    "https://api.niftytrader.in/api/Fiidii/get-fii-dii-data"
]

for url in urls:
    r = requests.get(url, headers=headers)
    print(f"URL: {url} -> Status: {r.status_code}")
    if r.status_code == 200:
        print(r.text[:300])
