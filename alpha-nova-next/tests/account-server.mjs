// Isolated browser fixtures. Never packaged or used by the production app.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(import.meta.dirname,'../dist');
let loggedIn=false;
let symbols=[];
const user={uid:'local-browser-fixture',displayName:'Research Test',email:'research@example.test'};
const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4188');
  if(url.pathname.startsWith('/api/')){
    let text='';for await(const part of req)text+=part;
    let body={};try{body=JSON.parse(text||'{}');}catch{ return json(res,{detail:'Invalid JSON'},400); }
    if(url.pathname==='/api/auth/login'){loggedIn=true;return json(res,{user,token:'LOCAL-TEST-TOKEN-NOT-A-CREDENTIAL'});}
    if(url.pathname==='/api/auth/me')return loggedIn?json(res,{user}):json(res,{detail:'Sign in'},401);
    if(url.pathname==='/api/auth/logout'){loggedIn=false;return json(res,{ok:true});}
    if(url.pathname==='/api/watchlist'){
      if(!loggedIn)return json(res,{detail:'Sign in'},401);
      if(req.method==='POST'&&!symbols.some(item=>item.symbol===body.symbol))symbols.push({symbol:body.symbol,market:body.market,added_at:'2026-09-18T12:00:00Z'});
      return json(res,{symbols});
    }
    if(url.pathname.startsWith('/api/watchlist/')&&req.method==='DELETE'){symbols=symbols.filter(item=>item.symbol!==decodeURIComponent(url.pathname.split('/').pop()));return json(res,{ok:true});}
    if(url.pathname==='/api/watchlist/quotes')return json(res,{quotes:symbols.map((item,i)=>({...item,last:100+i,change_pct:i===0?1.25:-.5,day_low:98,day_high:105})),market_open:false});
    if(url.pathname==='/api/symbol-search')return json(res,{results:[{symbol:'RELIANCE.NS',shortname:'Reliance Industries',exchange:'NSE'}]});
    if(url.pathname==='/api/signals')return json(res,{as_of:'2026-09-18T15:30:00+05:30',market_open:false,signals_market:'IN',data_status:{status:'stale',required_inputs_complete:false,warnings:['test_fixture']},regime:{overall:'NEUTRAL',breadth:{adv:0,dec:0}},setups:{plans:[{symbol:'TEST',side:'LONG',score:80,entry:100,stop:95,target:110}],watchlist:[]}});
    return json(res,{});
  }
  try{
    const local=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(local!==root&&!local.startsWith(root+sep))return json(res,{detail:'Invalid path'},400);
    const path=extname(local)?local:resolve(root,'index.html');
    const content=await readFile(path);
    res.writeHead(200,{'content-type':({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.woff2':'font/woff2','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(content);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4188,'127.0.0.1',()=>console.log('Local account fixtures at http://127.0.0.1:4188'));
