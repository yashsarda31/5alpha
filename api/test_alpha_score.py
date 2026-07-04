import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

from main import _alpha_nova_score, _two_stage_fair_value  # noqa: E402


def test_fair_value_grows_with_growth():
    assert _two_stage_fair_value(10, 30) > _two_stage_fair_value(10, 5)


def test_growth_compounder_scores_well():
    # NVDA-ish: expensive on PE but elite quality + growth, no dividend
    score = _alpha_nova_score(
        price=200, eps=6.5, pe=30, growth_pct=60,
        rev_growth_pct=40, roe_pct=110, margin_pct=50, dte_pct=15, div_pct=None)
    assert score is not None and score >= 65


def test_leveraged_value_trap_scores_poorly():
    # Cheap PE, shrinking earnings, thin margins, heavy debt
    score = _alpha_nova_score(
        price=50, eps=8, pe=6, growth_pct=-10,
        rev_growth_pct=-5, roe_pct=4, margin_pct=3, dte_pct=250, div_pct=0.4)
    assert score is not None and score <= 45


def test_quality_value_stock_beats_trap():
    trap = _alpha_nova_score(50, 8, 6, -10, rev_growth_pct=-5, roe_pct=4,
                             margin_pct=3, dte_pct=250, div_pct=0.4)
    steady = _alpha_nova_score(100, 9, 11, 12, rev_growth_pct=9, roe_pct=18,
                               margin_pct=15, dte_pct=40, div_pct=2.5)
    assert steady > trap


def test_missing_pillars_renormalize():
    # Quality-only inputs: earned/30 scaled to 100
    q_only = _alpha_nova_score(price=None, eps=None, pe=None, growth_pct=None,
                               roe_pct=30, margin_pct=25, dte_pct=20)
    assert q_only == 99  # 14+8+8 = 30/30 -> 100 -> clamped to 99
    # Same quality inside a fuller picture scores lower than the perfect-pillar case
    fuller = _alpha_nova_score(price=100, eps=1, pe=100, growth_pct=1,
                               roe_pct=30, margin_pct=25, dte_pct=20, div_pct=0.0)
    assert fuller < q_only


def test_all_none_returns_none():
    assert _alpha_nova_score(None, None, None, None) is None
    # Zero price/eps kill the Value pillar; None everywhere else → no pillars at all
    assert _alpha_nova_score(0, 0, 0, None) is None
    # But a KNOWN zero growth is data — worst score, not None
    assert _alpha_nova_score(0, 0, 0, 0) == 5


def test_bounds_over_grid():
    for eps in (None, -5, 2, 20):
        for growth in (None, -20, 0, 10, 80):
            for roe in (None, -10, 12, 40):
                for dte in (None, 10, 500):
                    for div in (None, 0, 1, 6):
                        s = _alpha_nova_score(100, eps, 15, growth,
                                              rev_growth_pct=growth, roe_pct=roe,
                                              margin_pct=roe, dte_pct=dte, div_pct=div)
                        assert s is None or 5 <= s <= 99
