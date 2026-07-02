from fastapi.testclient import TestClient
from main import app
import pytest

client = TestClient(app)

def test_arima_valid_ticker():
    # Test a highly liquid stock which should converge easily
    payload = {
        "ticker": "AAPL",
        "days": 5
    }
    response = client.post("/api/arima", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "historical" in data
    assert "forecast" in data
    assert len(data["forecast"]["prices"]) == 5
    assert len(data["forecast"]["dates"]) == 5
    assert len(data["forecast"]["lower"]) == 5
    assert len(data["forecast"]["upper"]) == 5

def test_arima_invalid_ticker():
    # Test a ticker that doesn't exist
    payload = {
        "ticker": "INVALIDTICKER123",
        "days": 5
    }
    response = client.post("/api/arima", json=payload)
    assert response.status_code == 404
    assert response.json()["detail"] in ["Data not found", "Not Found"]

def test_arima_low_liquidity_fallback():
    # Test a stock that might have weird price action and trigger fallbacks
    # Often very small caps or penny stocks have flat price action
    payload = {
        "ticker": "GME", # Just a volatile stock to test robustness
        "days": 10
    }
    response = client.post("/api/arima", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "forecast" in data
    assert len(data["forecast"]["prices"]) == 10
