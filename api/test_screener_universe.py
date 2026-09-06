from api.screener_universe import resolve_universe, _CACHE


def test_official_constituents_replace_old_list_and_are_cached():
    _CACHE.clear()
    calls = []
    def fetch(filename):
        calls.append(filename)
        return [f'STOCK{i}' for i in range(100)]
    symbols, meta = resolve_universe('nifty100', ['OLD.NS'], fetch)
    assert len(symbols) == 100 and symbols[0] == 'STOCK0.NS'
    assert meta['universe_source'] == 'Nifty Indices official constituents'
    assert meta['universe_fallback'] is False
    resolve_universe('nifty100', ['OLD.NS'], fetch)
    assert calls == ['ind_nifty100list.csv']
    _CACHE.clear()


def test_missing_or_incomplete_official_list_is_labelled_fallback():
    _CACHE.clear()
    for fetch in (lambda _: [], lambda _: ['ONLYONE']):
        symbols, meta = resolve_universe('nifty100', ['OLD.NS'], fetch)
        assert symbols == ['OLD.NS']
        assert meta['universe_fallback'] is True
        assert 'configured' in meta['universe_source'].lower()
    symbols, meta = resolve_universe('sp100', ['AAPL'], lambda _: 1/0)
    assert symbols == ['AAPL'] and meta['universe_fallback'] is True
