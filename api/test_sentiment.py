import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

from main import _news_sentiment, _SENTIMENT, FINANCE_LEXICON  # noqa: E402


def test_analyzer_available():
    assert _SENTIMENT is not None


def test_finance_lexicon_loaded():
    # Plain VADER has no idea what a buyback or a downgrade is
    for term in ("buyback", "downgrade", "breakout", "multibagger"):
        assert term in _SENTIMENT.lexicon
    assert FINANCE_LEXICON["fraud"] < 0 < FINANCE_LEXICON["beats"]


def test_bullish_headline():
    s = _news_sentiment("Company beats estimates, raises guidance; shares surge to record high")
    assert s["label"] == "Bullish"
    assert s["score"] >= 60


def test_bearish_headline():
    s = _news_sentiment("Regulator opens fraud probe; shares plunge after downgrade and layoffs")
    assert s["label"] == "Bearish"
    assert s["score"] <= 40


def test_neutral_headline():
    s = _news_sentiment("Company schedules annual general meeting for September 12")
    assert 40 <= s["score"] <= 60


def test_bounds_and_empty():
    assert _news_sentiment("") is None
    assert _news_sentiment(None) is None
    for text in ("soars surges rally record breakout " * 10,
                 "fraud bankruptcy crash plunge scam " * 10):
        s = _news_sentiment(text)
        assert 0 <= s["score"] <= 100
