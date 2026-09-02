from pathlib import Path


DASHBOARD = Path(__file__).resolve().parents[1] / "alphanova48-growth-dashboard.html"


def test_growth_dashboard_is_valid_utf8_without_mojibake():
    html = DASHBOARD.read_text(encoding="utf-8")

    for corrupted_marker in ("Ã", "Â", "â€"):
        assert corrupted_marker not in html

    assert "Active · 7 days" in html
    assert 'return "—"' not in html  # date fallback remains inside the ternary
    assert ' : "—";' in html


def test_growth_dashboard_renders_optional_daily_visitor_kpi():
    html = DASHBOARD.read_text(encoding="utf-8")
    validation = html.split("function validatePayload(data) {", 1)[1].split(
        "function setStatus", 1
    )[0]

    assert "visitors" not in validation
    assert '["Unique visitors today"' in html
    assert "state.data.visitors" in html
    assert "Yesterday ${fmt(visitors.yesterday)} · 7-day avg ${fmtOne(visitors.average_7d)}" in html
    assert '"Backend update required"' in html
