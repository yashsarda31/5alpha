import requests
url = "https://raw.githubusercontent.com/MrChartist/fii-dii-data/main/data.json"
try:
    r = requests.get(url)
    print(r.status_code)
    print(r.text[:200])
except Exception as e:
    print(e)
