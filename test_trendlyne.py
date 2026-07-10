import requests
from bs4 import BeautifulSoup

url = "https://trendlyne.com/equity/fii-dii-data/"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
}
try:
    r = requests.get(url, headers=headers)
    soup = BeautifulSoup(r.text, 'html.parser')
    table = soup.find('table')
    print("Table found:", table is not None)
    if table:
        rows = table.find_all('tr')
        print(f"Found {len(rows)} rows")
except Exception as e:
    print(e)
