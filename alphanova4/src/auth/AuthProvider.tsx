import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, apiRequest } from '../lib/apiClient';
export interface User { id?: string; email: string; displayName?: string | null }
type AuthValue = { currentUser: User | null; loading: boolean; loginWithEmail(email:string,password:string):Promise<User>; signupWithEmail(email:string,password:string,displayName:string):Promise<User>; loginWithGoogle(credential:string):Promise<User>; logout():Promise<void> };
const Context=createContext<AuthValue | null>(null); const TOKEN='alphanova_auth_token'; const USER='alphanova_auth_user';
const cached=():User|null=>{ try { return localStorage.getItem(TOKEN) ? JSON.parse(localStorage.getItem(USER)??'null') as User|null : null; } catch { return null; } };
const persist=(result:{token:string;user:User})=>{ localStorage.setItem(TOKEN,result.token); localStorage.setItem(USER,JSON.stringify(result.user)); };

export const AuthProvider=({children}:{children:ReactNode})=>{
  const [currentUser,setCurrentUser]=useState<User|null>(cached); const [loading,setLoading]=useState(()=>!cached()&&Boolean(localStorage.getItem(TOKEN)));
  useEffect(()=>{ if(!localStorage.getItem(TOKEN))return; apiRequest<{user:User}>('/api/auth/me').then(({user})=>{localStorage.setItem(USER,JSON.stringify(user));setCurrentUser(user);}).catch((error)=>{if(error instanceof ApiError&&[401,403].includes(error.status)){localStorage.removeItem(TOKEN);localStorage.removeItem(USER);setCurrentUser(null);}}).finally(()=>setLoading(false)); },[]);
  const complete=useCallback((result:{token:string;user:User})=>{persist(result);setCurrentUser(result.user);return result.user;},[]);
  const loginWithEmail=useCallback(async(email:string,password:string)=>complete(await apiRequest('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})}) as {token:string;user:User}),[complete]);
  const signupWithEmail=useCallback(async(email:string,password:string,displayName:string)=>complete(await apiRequest('/api/auth/signup',{method:'POST',body:JSON.stringify({email,password,displayName})}) as {token:string;user:User}),[complete]);
  const loginWithGoogle=useCallback(async(credential:string)=>complete(await apiRequest('/api/auth/google',{method:'POST',body:JSON.stringify({credential})}) as {token:string;user:User}),[complete]);
  const logout=useCallback(async()=>{await apiRequest('/api/auth/logout',{method:'POST'}).catch(()=>null);localStorage.removeItem(TOKEN);localStorage.removeItem(USER);setCurrentUser(null);},[]);
  const value=useMemo(()=>({currentUser,loading,loginWithEmail,signupWithEmail,loginWithGoogle,logout}),[currentUser,loading,loginWithEmail,signupWithEmail,loginWithGoogle,logout]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
};
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth=()=>{const value=useContext(Context);if(!value)throw new Error('useAuth requires AuthProvider');return value;};
