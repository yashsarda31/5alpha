import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dcf from './pages/Dcf';
import Chart from './pages/Chart';
import Screener from './pages/Screener';
import Arima from './pages/Arima';
import PositionSizing from './pages/PositionSizing';
import Disclaimer from './components/Disclaimer';

function App() {
  const [apiKey, setApiKey] = useState('');
  
  useEffect(() => {
    setApiKey(localStorage.getItem('gemini_api_key') || '');
  }, []);
  
  const handleKeyChange = (e) => {
    setApiKey(e.target.value);
    localStorage.setItem('gemini_api_key', e.target.value);
  };

  return (
    <BrowserRouter>
      <div className="sidebar">
        <h2>5Alpha 📈</h2>
        <div style={{color: "var(--primary-gold)", fontSize: "12px", marginBottom: "30px"}}>Institutional Platform</div>
        
        <nav>
          <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} end>DCF Calculator</NavLink>
          <NavLink to="/chart" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Chart Analyser</NavLink>
          <NavLink to="/screener" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Quant Screener</NavLink>
          <NavLink to="/arima" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>SARIMAX Forecaster</NavLink>
          <NavLink to="/position-sizing" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Position Sizing</NavLink>
        </nav>
        
        <div style={{marginTop: 'auto', paddingTop: '40px'}}>
          <label style={{fontSize: '12px', color: 'var(--text-secondary)'}}>Gemini API Key</label>
          <input 
            type="password" 
            value={apiKey} 
            onChange={handleKeyChange} 
            placeholder="AI Key..." 
            style={{marginTop: '5px'}}
          />
        </div>
      </div>

      <div className="content">
        <Disclaimer />
        <Routes>
          <Route path="/" element={<Dcf />} />
          <Route path="/chart" element={<Chart />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/arima" element={<Arima />} />
          <Route path="/position-sizing" element={<PositionSizing />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
