from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_screener_endpoint():
    response = client.get("/api/screener")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert len(data["data"]) > 0
    assert "ticker" in data["data"][0]

def test_chart_endpoint():
    response = client.get("/api/chart/AAPL")
    assert response.status_code == 200
    data = response.json()
    assert "dates" in data
    assert "close" in data
    assert len(data["dates"]) > 0

def test_dcf_endpoint():
    # AAPL generally has robust yfinance fundamentals
    payload = {"ticker": "AAPL", "wacc": 8.5, "perpetual_growth": 2.5}
    response = client.post("/api/dcf", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "intrinsicValue" in data
    assert "autoPopulated" in data
    assert data["autoPopulated"]["baseFcf"] is not None

def test_arima_endpoint():
    payload = {"ticker": "AAPL", "days": 5}
    response = client.post("/api/arima", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "forecast" in data
    assert len(data["forecast"]["dates"]) == 5
