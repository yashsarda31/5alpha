import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { fakeUniverse } from './fakeUniverse';
const user={ id:'u1', email:'analyst@example.com', displayName:'Analyst' };
const ok=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
afterEach(()=>{ localStorage.clear(); vi.unstubAllGlobals(); });

describe('authentication and watchlist',()=>{
  it('keeps a cached user through a transient session failure',async()=>{ localStorage.setItem('alphanova_auth_token','token'); localStorage.setItem('alphanova_auth_user',JSON.stringify(user)); vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(new TypeError('offline')))); const Probe=()=> <span>{useAuth().currentUser?.email}</span>; render(<AuthProvider><Probe/></AuthProvider>); expect(await screen.findByText(user.email)).toBeVisible(); });
  it('rolls back optimistic removal when the API rejects it',async()=>{
    localStorage.setItem('alphanova_auth_token','token'); localStorage.setItem('alphanova_auth_user',JSON.stringify(user));
    vi.stubGlobal('fetch',vi.fn((path:string,init?:RequestInit)=>{ if(path==='/api/auth/me') return Promise.resolve(ok({user})); if(path==='/api/watchlist/quotes') return Promise.resolve(ok([{symbol:'ITC',last:420,change_pct:.4}])); if(path==='/api/watchlist/ITC'&&init?.method==='DELETE') return Promise.resolve(ok({detail:'failed'},500)); return Promise.resolve(ok({symbols:[{symbol:'ITC',market:'IN'}]})); }));
    render(<MemoryRouter initialEntries={['/watchlist']}><App universeFactory={fakeUniverse}/></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button',{name:'Remove ITC'}));
    expect(await screen.findByText('ITC')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('failed');
  });
});
