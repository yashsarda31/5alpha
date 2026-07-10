import pandas as pd
import requests

url = "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/index.php"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
}
try:
    r = requests.get(url, headers=headers)
    tables = pd.read_html(r.text)
    print(f"Found {len(tables)} tables")
    for i, t in enumerate(tables):
        print(f"Table {i}:")
        print(t.head())
except Exception as e:
    print(e)
