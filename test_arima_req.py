import requests
import json

try:
    res = requests.post("http://127.0.0.1:8000/api/arima", json={"ticker": "RELIANCE.NS", "days": 10})
    print(res.status_code)
    print(str(res.text)[:500])
except Exception as e:
    print(e)
