import pytest
from pydantic import ValidationError
from api.screener_engine import ScreenerRules


def test_conflicting_pe_bounds_rejected():
    with pytest.raises(ValidationError):
        ScreenerRules(min_pe=50, max_pe=20)


@pytest.mark.parametrize('field', ['max_pe', 'min_pe', 'min_roe', 'min_momentum'])
def test_nonfinite_filters_rejected(field):
    with pytest.raises(ValidationError):
        ScreenerRules(**{field: float('nan')})
