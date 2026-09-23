import http from 'node:http';
import { chromium } from 'playwright';
const PORT=Number(process.env.PORT||10000), BASE=(process.env.PUBLIC_BASE_URL||'https://cobephim-one-shot.onrender.com').replace(/\/$/,'');
const ID='cobephim:de-che-dai-han:775372', NAME='Đế Chế Đại Hàn';
const TARGET='https://cobephim.ws/phim/de-che-dai-han/tap-770232';
let cached={url:'',at:0};
async function resolveMaster(){
 if(cached.url && Date.now()-cached.at<5*60*1000)return cached.url;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-blink-features=AutomationControlled','--autoplay-policy=no-user-gesture-required']});
  const cx=await browser.newContext({userAgent:hdr()['user-agent'],viewport:{width:390,height:844},locale:'vi-VN'});
  const p=await cx.newPage(); let found='';
  const capture=u=>{try{const x=new URL(u);if(x.hostname.includes('streamvsmov.com')&&x.pathname.endsWith('/master.m3u8'))found=u}catch{}};
  p.on('request',q=>capture(q.url())); p.on('response',r=>capture(r.url()));
  await p.goto(TARGET,{waitUntil:'domcontentloaded',timeout:60000});
  for(let round=0;round<4&&!found;round++){
   for(const fr of p.frames())for(const sel of ['video','button','[class*="play" i]','[id*="play" i]'])try{
    const es=fr.locator(sel),n=Math.min(await es.count(),8);
    for(let i=0;i<n&&!found;i++)try{sel==='video'?await es.nth(i).evaluate(v=>{v.muted=true;return v.play()}):await es.nth(i).click({timeout:800})}catch{}
   }catch{}
   await p.mouse.click(195,420).catch(()=>{}); await p.waitForTimeout(4000);
  }
  if(!found)throw Error('fresh_master_not_found');
  cached={url:found,at:Date.now()}; return found;
 }finally{await browser?.close()}
}
const manifest={id:'community.cobephim.resolver',version:'0.4.4',name:'CobePhim HLS Resolver',description:'CobePhim StreamVSMov fake-PNG HLS normalization test.',resources:['catalog','meta','stream'],types:['series'],catalogs:[{type:'series',id:'cobephim',name:'CobePhim'}],idPrefixes:['cobephim:']};
const item=()=>({id:ID,type:'series',name:NAME,description:'CobePhim playback test'});
function send(r,s,o){const b=JSON.stringify(o);r.writeHead(s,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'});r.end(b)}
function hdr(){return {'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1','referer':'https://cobephim.ws/','origin':'https://cobephim.ws'}}
function p(kind,url){return BASE+'/proxy/'+kind+'?url='+encodeURIComponent(url)}
async function fetchUp(url){const r=await fetch(url,{headers:hdr(),redirect:'follow'});if(!r.ok)throw Error('upstream '+r.status);return r}
function strip(buf){for(let i=0;i<Math.min(buf.length,1048576);i++){if(buf[i]!==0x47)continue;let ok=true;for(let n=1;n<=4;n++)if(i+n*188>=buf.length||buf[i+n*188]!==0x47){ok=false;break}if(ok)return buf.subarray(i)}return buf}
async function route(q,r){try{const u=new URL(q.url,'http://x');
 if(u.pathname==='/'||u.pathname==='/health')return send(r,200,{ok:true,version:manifest.version,manifest:BASE+'/manifest.json',testStream:BASE+'/stream/series/'+encodeURIComponent(ID)+'.json'});
 if(u.pathname==='/manifest.json')return send(r,200,manifest);
 if(u.pathname==='/catalog/series/cobephim.json')return send(r,200,{metas:[item()]});
 const m=u.pathname.match(/^\/meta\/series\/(.+)\.json$/);if(m)return send(r,200,{meta:decodeURIComponent(m[1])===ID?{...item(),videos:[{id:ID,title:'Tập thử'}]}:null});
 const s=u.pathname.match(/^\/stream\/series\/(.+)\.json$/);if(s){const id=decodeURIComponent(s[1]);return send(r,200,{streams:id===ID?[{name:'CobePhim',title:'StreamVSMov proxy #1',url:BASE+'/resolve/'+encodeURIComponent(ID)+'.m3u8'}]:[]})}
 if(u.pathname.startsWith('/resolve/')){
   const master=await resolveMaster();
   const z=await fetchUp(master); let body=await z.text();
   body=body.split(/\\r?\\n/).map(x=>{const t=x.trim();if(!t||t[0]==='#')return x;try{return p('segment',new URL(t,master).href)}catch{return x}}).join('\\n');
   r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(body)
 }
 if(u.pathname==='/proxy/playlist'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});const z=await fetchUp(up);let body=await z.text();body=body.split(/\r?\n/).map(x=>{const t=x.trim();if(!t||t[0]==='#')return x;try{return p('segment',new URL(t,up).href)}catch{return x}}).join('\n');r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(body)}
 if(u.pathname==='/proxy/segment'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});const z=await fetchUp(up),raw=Buffer.from(await z.arrayBuffer()),media=strip(raw);r.writeHead(200,{'content-type':'video/mp2t','content-length':media.length,'access-control-allow-origin':'*','cache-control':'public,max-age=3600'});return r.end(media)}
 return send(r,404,{error:'not_found'});
}catch(e){return send(r,502,{error:'proxy_failed',message:e.message})}}
http.createServer(route).listen(PORT,'0.0.0.0',()=>console.log('CobePhim',manifest.version,PORT));
