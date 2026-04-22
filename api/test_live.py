import requests

BASE_URL = "http://localhost:8000/api"

def test_screener_endpoint():
    response = requests.get(f"{BASE_URL}/screener")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert len(data["data"]) > 0

def test_chart_endpoint():
    response = requests.get(f"{BASE_URL}/chart/AAPL")
    assert response.status_code == 200
    data = response.json()
    assert "dates" in data
    assert "close" in data

def test_dcf_endpoint():
    payload = {"ticker": "AAPL", "wacc": 8.5, "perpetual_growth": 2.5}
    response = requests.post(f"{BASE_URL}/dcf", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "intrinsicValue" in data
    assert "autoPopulated" in data

def test_arima_endpoint():
    payload = {"ticker": "AAPL", "days": 5}
    response = requests.post(f"{BASE_URL}/arima", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "forecast" in data
