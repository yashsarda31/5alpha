import pandas as pd
import requests

url = "https://www.chittorgarh.com/report/fii-dii-trading-activity/73/"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}
try:
    r = requests.get(url, headers=headers)
    tables = pd.read_html(r.text)
    print(f"Found {len(tables)} tables")
    for i, t in enumerate(tables):
        print(f"Table {i} size: {t.shape}")
        if t.shape[0] > 10:
            print(t.head())
            break
except Exception as e:
    print(e)
