import { useEffect,useRef,useState } from 'react';
import type { UniverseRuntime } from '../scene/createUniverse';import { FrameBudgetMonitor,selectInitialTier } from '../scene/quality';import type { Capabilities,RenderTier } from '../scene/types';
interface Options{factory?:()=>UniverseRuntime;tier:RenderTier}
type State={tier:RenderTier;message:string|null;fallback:boolean};
const rank:Record<RenderTier,number>={essential:0,balanced:1,full:2};
const capabilities=(injected:boolean):Capabilities=>({reducedMotion:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,webgl:injected||Boolean(document.createElement('canvas').getContext('webgl2')),cores:navigator.hardwareConcurrency||2,memoryGb:'deviceMemory'in navigator?Number((navigator as Navigator&{deviceMemory?:number}).deviceMemory):null});
const chooseTier=(requested:RenderTier,injected:boolean)=>{const detected=selectInitialTier(capabilities(injected));return rank[detected]<rank[requested]?detected:requested;};
export const useUniverse=({factory,tier}:Options)=>{
  const hostRef=useRef<HTMLDivElement>(null);const[runtime,setRuntime]=useState<UniverseRuntime|null>(()=>factory?.()??null);const initial=chooseTier(tier,Boolean(factory));const[state,setState]=useState<State>({tier:initial,message:null,fallback:false});
  useEffect(()=>{if(factory)return;let active=true;import('../scene/createUniverse').then(({createUniverse})=>{if(active)setRuntime(createUniverse());}).catch(()=>{if(active)setState({tier:'essential',message:'Simplified graphics active',fallback:true});});return()=>{active=false;};},[factory]);
  useEffect(()=>{if(!runtime||!hostRef.current)return;const host=hostRef.current;runtime.mount(host);const canvas=host.querySelector('canvas');const lost=(event:Event)=>{event.preventDefault();runtime.pause();};const restored=()=>{if(!runtime.rebuild()){runtime.setTier('essential');setState({tier:'essential',message:'Simplified graphics active',fallback:true});}else runtime.resume();};canvas?.addEventListener('webglcontextlost',lost);canvas?.addEventListener('webglcontextrestored',restored);const visibility=()=>document.hidden?runtime.pause():runtime.resume();document.addEventListener('visibilitychange',visibility);return()=>{canvas?.removeEventListener('webglcontextlost',lost);canvas?.removeEventListener('webglcontextrestored',restored);document.removeEventListener('visibilitychange',visibility);runtime.dispose();};},[runtime]);
  useEffect(()=>{runtime?.setTier(state.tier);},[runtime,state.tier]);
  useEffect(()=>{if(!runtime?.subscribeFrame)return;const monitor=new FrameBudgetMonitor(state.tier);return runtime.subscribeFrame((frameMs)=>{const next=monitor.push(frameMs);if(next!==state.tier)setState({tier:next,message:`Graphics adapted to ${next} mode`,fallback:false});});},[runtime,state.tier]);
  return{hostRef,runtime,sceneState:state};
};
