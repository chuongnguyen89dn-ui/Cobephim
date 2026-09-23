import http from 'node:http';
import { chromium } from 'playwright';
const PORT=Number(process.env.PORT||10000), BASE=(process.env.PUBLIC_BASE_URL||'https://cobephim-one-shot.onrender.com').replace(/\/$/,'');
const ID='cobephim:de-che-dai-han:775372', NAME='Đế Chế Đại Hàn';
const TARGET='https://cobephim.cfd/phim/de-che-dai-han';
const caches=new Map(), warmings=new Map();
function cacheFor(key){if(!caches.has(key))caches.set(key,{url:'',at:0,kind:''});return caches.get(key)}
function targetFor(id){
 const parts=id.split(':'); const slug=parts[1]||'de-che-dai-han', ep=parts.slice(2).join(':');
 return ep&&ep.startsWith('tap-') ? `https://cobephim.cfd/phim/${slug}/${ep}` : `https://cobephim.cfd/phim/${slug}`;
}
async function resolveMaster(key,target=targetFor(key)){
 const cached=cacheFor(key);
 if(cached.url && Date.now()-cached.at<30*60*1000)return cached.url;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-blink-features=AutomationControlled','--autoplay-policy=no-user-gesture-required']});
  const cx=await browser.newContext({userAgent:hdr()['user-agent'],viewport:{width:390,height:844},locale:'vi-VN'});
  const p=await cx.newPage(); let found=''; const seen=[];
  const note=(kind,u)=>{if(/stream|m3u8|player|embed|video|tap-/i.test(u)){seen.push(kind+': '+u);console.log('[resolver]',key,kind,u.slice(0,500))}};
  const capture=u=>{try{const x=new URL(u);if(x.hostname.includes('streamvsmov.com')&&x.pathname.endsWith('/master.m3u8')){found=u;cached.kind='hls'}else if(/\/streamaaa\d+\.png$/i.test(x.pathname)&&(x.hostname.includes('cyin')||x.hostname.includes('streamc'))){if(!cached.url){cached.url=u.replace(/streamaaa\d+\.png.*$/i,'streamaaa{n}.png');cached.at=Date.now();cached.kind='segments';found=cached.url;console.log('[resolver] segment_pattern_found '+key+' host='+x.hostname)}}}catch{}};
  p.on('request',q=>{note('REQ',q.url());capture(q.url())}); p.on('response',r=>{note('RES '+r.status(),r.url());capture(r.url())});
  p.on('framenavigated',fr=>note('FRAME',fr.url()));
  await p.goto(target,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('[resolver] goto timeout '+key+' '+e.message));
  await p.waitForTimeout(1800);
  if(!/\/tap-/.test(new URL(target).pathname)){
   let episode=''; for(const fr of p.frames())try{episode=await fr.locator('a[href*="/tap-"]').evaluateAll(as=>as.map(a=>a.href).find(Boolean)||'');if(episode)break}catch{}
   if(episode){console.log('[resolver] episode_found '+episode);await p.goto(episode,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});await p.waitForTimeout(1200)}
  }
  for(let round=0;round<4&&!found;round++){
   for(const fr of p.frames())for(const sel of ['video','button','[class*="play" i]','[id*="play" i]'])try{const es=fr.locator(sel),n=Math.min(await es.count(),8);for(let i=0;i<n&&!found;i++)try{sel==='video'?await es.nth(i).evaluate(v=>{v.muted=true;return v.play()}):await es.nth(i).click({timeout:800})}catch{}}catch{}
   await p.mouse.click(195,420).catch(()=>{});await p.waitForTimeout(3000);
  }
  if(!found&&!cached.url){console.error('[resolver] media_not_found '+key+' final='+p.url()+' seen='+JSON.stringify(seen.slice(-50)));throw Error('fresh_master_not_found')}
  if(found&&cached.kind==='hls'){cached.url=found;cached.at=Date.now()}
  return cached.url;
 }finally{await browser?.close()}
}
function warm(key=ID,target=targetFor(key)){
 if(warmings.has(key))return warmings.get(key);
 const job=resolveMaster(key,target).catch(e=>{console.error('[warm]',key,e?.stack||e);return ''}).finally(()=>warmings.delete(key));
 warmings.set(key,job); return job;
}
const manifest={id:'community.cobephim.resolver',version:'0.4.11',name:'CobePhim HLS Resolver',description:'CobePhim StreamVSMov fake-PNG HLS normalization test.',resources:['catalog','meta','stream'],types:['series'],catalogs:[{type:'series',id:'cobephim',name:'CobePhim'}],idPrefixes:['cobephim:']};
const item=()=>({id:ID,type:'series',name:NAME,description:'CobePhim playback test'});
const SCANNER=(process.env.SCANNER_URL||'https://cobephim-full-scan.onrender.com').replace(/\/$/,'');
let liveCatalog={at:0,metas:[],rows:[]};
async function pullCatalog(){try{if(Date.now()-liveCatalog.at<15000&&liveCatalog.metas.length)return liveCatalog;const z=await fetch(SCANNER+'/',{headers:{'user-agent':hdr()['user-agent']}});if(!z.ok)throw Error('scanner '+z.status);const d=await z.json(),rows=Array.isArray(d.catalog)?d.catalog:[];const metas=rows.filter(x=>x.title).map(x=>({id:'cobephim:'+x.slug,type:'series',name:x.title,poster:x.poster||undefined,description:x.description||undefined,releaseInfo:x.year?String(x.year):undefined}));liveCatalog={at:Date.now(),metas,rows};console.log('[catalog] live movies='+metas.length+' scannerStatus='+d.status);return liveCatalog}catch(e){console.error('[catalog]',e.message);return liveCatalog}}
function send(r,s,o){const b=JSON.stringify(o);r.writeHead(s,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'});r.end(b)}
function hdr(){return {'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1','referer':'https://cobephim.ws/','origin':'https://cobephim.ws'}}
function p(kind,url){return BASE+'/proxy/'+kind+'?url='+encodeURIComponent(url)}
async function fetchUp(url){const r=await fetch(url,{headers:hdr(),redirect:'follow'});if(!r.ok)throw Error('upstream '+r.status);return r}
function strip(buf){for(let i=0;i<Math.min(buf.length,1048576);i++){if(buf[i]!==0x47)continue;let ok=true;for(let n=1;n<=4;n++)if(i+n*188>=buf.length||buf[i+n*188]!==0x47){ok=false;break}if(ok)return buf.subarray(i)}return buf}
async function route(q,r){try{const u=new URL(q.url,'http://x');
 if(u.pathname==='/'||u.pathname==='/health')return send(r,200,{ok:true,version:manifest.version,manifest:BASE+'/manifest.json',testStream:BASE+'/stream/series/'+encodeURIComponent(ID)+'.json'});
 if(u.pathname==='/manifest.json')return send(r,200,manifest);
 if(u.pathname==='/catalog/series/cobephim.json'){const lc=await pullCatalog();return send(r,200,{metas:lc.metas.length?lc.metas:[item()]})}
 const m=u.pathname.match(/^\/meta\/series\/(.+)\.json$/);if(m){const mid=decodeURIComponent(m[1]);if(mid===ID)return send(r,200,{meta:{...item(),videos:[{id:ID,title:'Tập thử'}]}});const lc=await pullCatalog(),slug=mid.replace(/^cobephim:/,'');const row=lc.rows.find(x=>x.slug===slug);return send(r,200,{meta:row?{id:mid,type:'series',name:row.title,poster:row.poster||undefined,description:row.description||undefined,releaseInfo:row.year?String(row.year):undefined,videos:(row.episodes||[]).map((e,i)=>({id:mid+':'+e.id,title:'Tập '+(i+1)}))}:null})}
 const s=u.pathname.match(/^\/stream\/series\/(.+)\.json$/);if(s){const id=decodeURIComponent(s[1]);warm(id);return send(r,200,{streams:[{name:'CobePhim',title:'CobePhim dynamic resolver',url:BASE+'/resolve/'+encodeURIComponent(id)+'.m3u8'}]})}
 if(u.pathname.startsWith('/resolve/')){
   const id=decodeURIComponent(u.pathname.slice('/resolve/'.length).replace(/\.m3u8$/,''));
   const cached=cacheFor(id);
   if(!cached.url){const job=warm(id);await Promise.race([job,new Promise((_,rej)=>setTimeout(()=>rej(Error('warming_timeout')),45000))])}
   if(!cached.url)throw Error('master_not_ready');
   if(cached.kind==='segments'){const lines=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-TARGETDURATION:6','#EXT-X-MEDIA-SEQUENCE:0'];for(let i=0;i<1200;i++){lines.push('#EXTINF:4.000,');lines.push(p('segment',cached.url.replace('{n}',String(i).padStart(4,'0'))))}lines.push('#EXT-X-ENDLIST');r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(lines.join('\n'))}
   const master=cached.url,z=await fetchUp(master);let body=await z.text();
   body=body.split(/\r?\n/).map(x=>{const t=x.trim();if(!t||t[0]==='#')return x;try{return p('segment',new URL(t,master).href)}catch{return x}}).join('\n');
   r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(body)
 }
 if(u.pathname==='/proxy/playlist'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});const z=await fetchUp(up);let body=await z.text();body=body.split(/\r?\n/).map(x=>{const t=x.trim();if(!t||t[0]==='#')return x;try{return p('segment',new URL(t,up).href)}catch{return x}}).join('\n');r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(body)}
 if(u.pathname==='/proxy/segment'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});const z=await fetchUp(up),raw=Buffer.from(await z.arrayBuffer()),media=strip(raw);r.writeHead(200,{'content-type':'video/mp2t','content-length':media.length,'access-control-allow-origin':'*','cache-control':'public,max-age=3600'});return r.end(media)}
 return send(r,404,{error:'not_found'});
}catch(e){console.error('[route]',q.url,e?.stack||e);return send(r,502,{error:'proxy_failed',message:e.message})}}
http.createServer(route).listen(PORT,'0.0.0.0',()=>{console.log('CobePhim',manifest.version,PORT);warm(ID)});
