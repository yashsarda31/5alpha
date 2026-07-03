from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_screener_endpoint():
    response = client.post("/api/screener", json={"tickers": "AAPL"})
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

def test_momentum_endpoint():
    response = client.get("/api/momentum?market=us")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data

def test_fundamentals_endpoint():
    response = client.get("/api/fundamentals/AAPL")
    assert response.status_code == 200
    data = response.json()
    assert "ticker" in data
    assert data["ticker"] == "AAPL"
    assert "marketCap" in data

def test_news_endpoint():
    response = client.get("/api/news/AAPL")
    # 401 if missing key, 400 if invalid key, 200 if successful
    assert response.status_code in (200, 400, 401)
    if response.status_code == 200:
        data = response.json()
        assert "articles" in data


def test_option_chain_expiries():
    response = client.get("/api/option-chain/expiries/nifty")
    assert response.status_code == 200
    data = response.json()
    assert "expiries" in data
    assert "lotSize" in data
    assert len(data["expiries"]) > 0
    assert data["lotSize"] == 65


def test_option_chain_data():
    response = client.get("/api/option-chain/data/nifty")
    assert response.status_code == 200
    data = response.json()
    assert "spotData" in data
    assert "vixData" in data
    assert "optionChain" in data
    assert "opDatas" in data["optionChain"]
    assert "opTotals" in data["optionChain"]
    assert len(data["optionChain"]["opDatas"]) > 0


def test_druck_minervini_endpoint_without_key():
    response = client.post(
        "/api/ai/druck-minervini",
        data={"ticker": "AAPL", "apiKey": ""},
        files={"file": ("chart.png", b"mock_image_bytes")}
    )
    assert response.status_code == 400


def test_druck_minervini_endpoint_mock(monkeypatch):
    class MockResponse:
        text = "Mocked Analysis. Strategic Conviction Score (1-10): 9. Entry Trigger Price: $150.00. Stop-Loss Price: $140.00."

    class MockModels:
        def generate_content(self, model, contents):
            return MockResponse()

    class MockClient:
        def __init__(self, api_key):
            self.models = MockModels()

    from google import genai
    monkeypatch.setattr(genai, "Client", MockClient)

    response = client.post(
        "/api/ai/druck-minervini",
        data={
            "ticker": "AAPL",
            "macro_context": "Federal Reserve cuts rates",
            "apiKey": "mock_key"
        },
        files={"file": ("chart.png", b"mock_image_bytes")}
    )
    assert response.status_code == 200
    data = response.json()
    assert "report" in data
    assert "sepa_checks" in data
    assert "chart_data" in data
    assert "rule1" in data["sepa_checks"]
    assert "dates" in data["chart_data"]





def test_market_signals():
    response = client.get("/api/signals")
    assert response.status_code == 200
    data = response.json()
    assert "regime" in data and "options" in data and "setups" in data
    assert data["regime"]["overall"] in ("RISK-ON", "RISK-OFF", "MIXED")
    assert isinstance(data["options"]["indices"], list)
    assert isinstance(data["setups"]["plans"], list)
    for plan in data["setups"]["plans"]:
        assert plan["side"] in ("LONG", "SHORT")
        assert 0 <= plan["score"] <= 100
        assert plan["entry"] > 0 and plan["stop"] > 0 and plan["target"] > 0


def test_focus_list():
    response = client.get("/api/focus")
    assert response.status_code == 200
    data = response.json()
    assert "context" in data and "stocks" in data
    assert isinstance(data["stocks"], list)
    for s in data["stocks"]:
        assert s["symbol"] and s["weight"] > 0
        assert len(s["reasons"]) >= 1
        for r in s["reasons"]:
            assert r["tag"] and r["detail"]


def test_screener_guru_style_filters():
    # Greenblatt-style: cheap (PE<=20) + high return on equity (>=20)
    response = client.post("/api/screener", json={
        "tickers": "AAPL, MSFT, KO, TCS.NS, COALINDIA.NS",
        "max_pe": 20, "min_roe": 20
    })
    assert response.status_code == 200
    for row in response.json()["data"]:
        assert row["peRatio"] is None or row["peRatio"] <= 20
        assert row["roe"] >= 20
