import requests

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
}
url = "https://api.stockedge.com/Api/FIIAndDIIApi/GetFIIDIIDailyActivity?page=1&pageSize=50"

try:
    r = requests.get(url, headers=headers)
    print("StockEdge Status:", r.status_code)
    if r.status_code == 200:
        print("Data preview:", r.text[:500])
except Exception as e:
    print("Error:", e)
