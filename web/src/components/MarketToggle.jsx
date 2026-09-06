import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMarket, useMarketParam } from '../MarketContext';

const MarketToggle = () => {
  const { setMarket } = useMarket();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedMarket = useMarketParam(searchParams.get('market'));

  const selectMarket = (nextMarket) => {
    setMarket(nextMarket);
    if (searchParams.has('market')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('market', nextMarket);
      setSearchParams(nextParams, { replace: true });
    }
  };

  return (
    <div className="market-toggle" role="group" aria-label="Market mode" data-market={selectedMarket}>
      <span className="market-toggle-label">Market</span>
      <div className="market-toggle-options">
        <button
          type="button"
          className={selectedMarket === 'IN' ? 'active' : ''}
          onClick={() => selectMarket('IN')}
          aria-pressed={selectedMarket === 'IN'}
        >
          India
        </button>
        <button
          type="button"
          className={selectedMarket === 'US' ? 'active' : ''}
          onClick={() => selectMarket('US')}
          aria-pressed={selectedMarket === 'US'}
        >
          US
        </button>
      </div>
    </div>
  );
};

export default MarketToggle;
