import requests
from bs4 import BeautifulSoup
import re

url = "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/index.php"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
}
try:
    r = requests.get(url, headers=headers)
    soup = BeautifulSoup(r.text, 'html.parser')
    tables = soup.find_all('table')
    print(f"Found {len(tables)} tables")
    
    for i, t in enumerate(tables):
        if 'fii' in t.text.lower() or 'dii' in t.text.lower():
            print(f"Table {i} might be FII DII")
            rows = t.find_all('tr')
            for r in rows[:3]:
                print([c.text.strip() for c in r.find_all(['th', 'td'])])
                
except Exception as e:
    print(e)
