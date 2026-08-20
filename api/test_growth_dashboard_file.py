from pathlib import Path


DASHBOARD = Path(__file__).resolve().parents[1] / "alphanova48-growth-dashboard.html"


def test_growth_dashboard_is_valid_utf8_without_mojibake():
    html = DASHBOARD.read_text(encoding="utf-8")

    for corrupted_marker in ("Ã", "Â", "â€"):
        assert corrupted_marker not in html

    assert "Active · 7 days" in html
    assert 'return "—"' not in html  # date fallback remains inside the ternary
    assert ' : "—";' in html
