import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Dashboard from './pages/Dashboard';
import Dcf from './pages/Dcf';
import Chart from './pages/Chart';
import Screener from './pages/Screener';
import Arima from './pages/Arima';
import PositionSizing from './pages/PositionSizing';
import Momentum from './pages/Momentum';
import Fundamentals from './pages/Fundamentals';
import News from './pages/News';
import OptionChain from './pages/OptionChain';
import DruckMinervini from './pages/DruckMinervini';
import TradingGame from './pages/TradingGame';


import FiiDii from './pages/FiiDii';
import Login from './pages/Login';
import Disclaimer from './components/Disclaimer';

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const AppLayout = () => {
  const { currentUser, logout } = useAuth();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleKeyChange = (e) => {
    setApiKey(e.target.value);
    localStorage.setItem('gemini_api_key', e.target.value);
  };

  return (
    <>
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu">☰</button>
        <span className="mobile-title">
          <span style={{ color: 'var(--primary-gold)' }}>Alpha</span> Nova
        </span>
      </div>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--primary-gold)' }}>Alpha</span> Nova
        </h2>
        <div style={{color: "var(--text-secondary)", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "32px"}}>Pro Edition V3</div>
        
        <nav onClick={() => setMenuOpen(false)}>
          <NavLink to="/dashboard" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>⌘</span> Dashboard
          </NavLink>
          <NavLink to="/chart" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>📈</span> Chart Analyser
          </NavLink>
          <NavLink to="/druck-minervini" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🦅</span> Druck & Minervini
          </NavLink>
          <NavLink to="/screener" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🔍</span> Quant Screener
          </NavLink>

          <NavLink to="/fiidii" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🏦</span> FII / DII Activity
          </NavLink>
          <NavLink to="/dcf" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>💵</span> DCF Calculator
          </NavLink>
          <NavLink to="/fundamentals" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>📊</span> Fundamentals
          </NavLink>
          <NavLink to="/momentum" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🚀</span> Momentum Leaders
          </NavLink>
          <NavLink to="/arima" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🔮</span> SARIMAX Forecaster
          </NavLink>
          <NavLink to="/position-sizing" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>⚖️</span> Position Sizing
          </NavLink>
          <NavLink to="/news" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>📰</span> News
          </NavLink>
          <NavLink to="/option-chain" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>⛓️</span> Option Chain
          </NavLink>
          <NavLink to="/trading-game" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🎮</span> Discipline Arena
          </NavLink>
        </nav>
        
        <div style={{marginTop: 'auto', paddingTop: '40px'}}>
          <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Logged in as</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--primary-gold)', marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser?.email}</div>
            <button onClick={logout} className="secondary" style={{ padding: '8px', fontSize: '12px' }}>Sign Out</button>
          </div>
          
          <label>Gemini API Key</label>
          <input 
            type="password" 
            value={apiKey} 
            onChange={handleKeyChange} 
            placeholder="Enter AI Key..." 
            style={{marginBottom: '0'}}
          />
        </div>
      </div>

      <div className="content">
        <Disclaimer />
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dcf" element={<Dcf />} />
          <Route path="/fundamentals" element={<Fundamentals />} />
          <Route path="/momentum" element={<Momentum />} />
          <Route path="/chart" element={<Chart />} />
          <Route path="/druck-minervini" element={<DruckMinervini />} />
          <Route path="/screener" element={<Screener />} />

          <Route path="/fiidii" element={<FiiDii />} />
          <Route path="/arima" element={<Arima />} />
          <Route path="/position-sizing" element={<PositionSizing />} />
          <Route path="/news" element={<News />} />
          <Route path="/option-chain" element={<OptionChain />} />
          <Route path="/trading-game" element={<TradingGame />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route 
            path="*" 
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
