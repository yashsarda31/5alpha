import { createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';
import type { WatchlistItem } from '../data/contracts';
import { normalizeSymbol } from '../data/watchlist';
import { apiRequest } from '../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
type Value={items:WatchlistItem[];loading:boolean;error:string|null;add(symbol:string,market?:'IN'|'US'):Promise<void>;remove(symbol:string):Promise<void>;reload():Promise<void>};
const Context=createContext<Value|null>(null);
const itemsFrom=(raw:unknown):WatchlistItem[]=>{const rows=Array.isArray(raw)?raw:(raw&&typeof raw==='object'&&'symbols'in raw&&Array.isArray(raw.symbols)?raw.symbols:[]);return rows.map((entry)=>{const row=entry as Record<string,unknown>;return {symbol:normalizeSymbol(row.symbol),market:String(row.market).toUpperCase()==='US'?'US':'IN'} as WatchlistItem;}).filter((item)=>item.symbol);};
export const WatchlistProvider=({children}:{children:ReactNode})=>{
  const {currentUser}=useAuth();const[items,setItems]=useState<WatchlistItem[]>([]);const[loading,setLoading]=useState(false);const[error,setError]=useState<string|null>(null);
  const reload=useCallback(async()=>{if(!currentUser){setItems([]);return;}setLoading(true);try{setItems(itemsFrom(await apiRequest('/api/watchlist')));}catch{/* preserve cached state */}finally{setLoading(false);}},[currentUser]);
  useEffect(()=>{void reload();},[reload]);
  const add=useCallback(async(raw:string,market:'IN'|'US'='IN')=>{const symbol=normalizeSymbol(raw);if(!symbol||items.some((item)=>item.symbol===symbol))return;const next={symbol,market:raw.toUpperCase().endsWith('.NS')?'IN':market} as WatchlistItem;setItems((current)=>[...current,next]);setError(null);try{await apiRequest('/api/watchlist',{method:'POST',body:JSON.stringify(next)});}catch(reason){setItems((current)=>current.filter((item)=>item.symbol!==symbol));setError(reason instanceof Error?reason.message:'Could not add to watchlist.');throw reason;}},[items]);
  const remove=useCallback(async(raw:string)=>{const symbol=normalizeSymbol(raw);let snapshot:WatchlistItem[]=[];setItems((current)=>{snapshot=current;return current.filter((item)=>item.symbol!==symbol);});setError(null);try{await apiRequest(`/api/watchlist/${encodeURIComponent(symbol)}`,{method:'DELETE'});}catch(reason){setItems(snapshot);setError(reason instanceof Error?reason.message:'Could not remove from watchlist.');}},[]);
  const value=useMemo(()=>({items,loading,error,add,remove,reload}),[items,loading,error,add,remove,reload]);return <Context.Provider value={value}>{children}</Context.Provider>;
};
// eslint-disable-next-line react-refresh/only-export-components
export const useWatchlist=()=>{const value=useContext(Context);if(!value)throw new Error('useWatchlist requires WatchlistProvider');return value;};
