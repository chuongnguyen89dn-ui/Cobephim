import http from 'node:http';
import { chromium } from 'playwright';
const PORT=Number(process.env.PORT||10000), BASE=(process.env.PUBLIC_BASE_URL||'https://cobephim-one-shot.onrender.com').replace(/\/$/,'');
const ID='cobephim:de-che-dai-han:775372', NAME='Đế Chế Đại Hàn';
const TARGET='https://cobephim.cfd/phim/de-che-dai-han';
const caches=new Map(), warmings=new Map();
const HLS_FRESH_MS=20*60*1000, PREWARM_MS=15*60*1000;
function cacheFor(key){if(!caches.has(key))caches.set(key,{url:'',at:0,kind:''});return caches.get(key)}
function targetFor(id){
 const parts=id.split(':'); const slug=parts[1]||'de-che-dai-han', ep=parts.slice(2).join(':');
 return ep&&ep.startsWith('tap-') ? `https://cobephim.cfd/phim/${slug}/${ep}` : `https://cobephim.cfd/phim/${slug}`;
}
async function resolveMaster(key,target=targetFor(key)){
 const cached=cacheFor(key);
 if(cached.url && cached.kind==='hls' && Date.now()-cached.at<HLS_FRESH_MS)return cached.url;
 if(cached.kind==='segments'){cached.url='';cached.at=0;cached.kind=''}
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-blink-features=AutomationControlled','--autoplay-policy=no-user-gesture-required']});
  const cx=await browser.newContext({userAgent:hdr()['user-agent'],viewport:{width:390,height:844},locale:'vi-VN'});
  await cx.route('**/*',route=>{const u=route.request().url();if(/jwpltx\.com|whos\.amung\.us|google-analytics|googletagmanager|doubleclick|facebook\.com\/tr/i.test(u))return route.abort();return route.continue()});
  const p=await cx.newPage(); let found=''; const seen=[];
  const note=(kind,u)=>{if(/stream|m3u8|player|embed|video|tap-/i.test(u)){seen.push(kind+': '+u);console.log('[resolver]',key,kind,u.slice(0,500))}};
  const capture=u=>{try{const x=new URL(u);if(x.hostname.includes('streamvsmov.com')&&x.pathname.endsWith('/master.m3u8')){found=u;cached.kind='hls'}else if(/\/streamaaa\d+\.png$/i.test(x.pathname)){if(!cached.url){cached.url=u.replace(/streamaaa\d+\.png.*$/i,'streamaaa{n}.png');cached.at=Date.now();cached.kind='segments';found=cached.url;console.log('[resolver] segment_pattern_found '+key+' host='+x.hostname)}}}catch{}};
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
const manifest={id:'community.cobephim.resolver',version:'0.4.16',name:'CobePhim HLS Resolver',description:'CobePhim StreamVSMov fake-PNG HLS normalization test.',resources:['catalog','meta','stream'],types:['series'],catalogs:[{type:'series',id:'cobephim',name:'CobePhim'}],idPrefixes:['cobephim:']};
const TEST_EPISODES=[
 {id:'tap-775372',title:'Tập 1 • Phụ đề #1',src:'https://seouls11.amass11.top/254565070f42e77cc7912d915820b662/streamaaa{n}.png'},
 {id:'tap-775373',title:'Tập 2 • Phụ đề #1',src:'https://cyin1.sbs/7a18bffd97d671647a1e173527959f48/streamaaa{n}.png'},
 {id:'tap-775374',title:'Tập 3 • Phụ đề #1',src:'https://jps14.hihihoho4.top/e494830634c062645ab628bd617a36e9/streamaaa{n}.png'},
 {id:'tap-775375',title:'Tập 4 • Phụ đề #1',src:'https://seouls11.amass11.top/807501744fd99bd4160305de28365c4c/streamaaa{n}.png'},
 {id:'tap-780551',title:'Tập 5 • Phụ đề #1',src:'https://cyin1.sbs/5f437f3b6281e1b3b00b7ce7bae6e99b/streamaaa{n}.png'},
 {id:'tap-780574',title:'Tập 6 • Phụ đề #1',src:'https://seouls11.amass11.top/5d10d7c6ba9c257f4a919a0047830dab/streamaaa{n}.png'},
 {id:'tap-775376',title:'Tập 1 • Thuyết Minh #1',src:'https://cyin1.sbs/f2fa3bcd3ff3a02f42daa2664e4ed7ff/streamaaa{n}.png'},
 {id:'tap-775377',title:'Tập 2 • Thuyết Minh #1',src:'https://thais.hihihoho3.top/f10b7cc385143c458b1f09e640bf6957/streamaaa{n}.png'},
 {id:'tap-780552',title:'Tập 3 • Thuyết Minh #1',src:'https://jps14.hihihoho4.top/bc8079008d158584412d63a776849557/streamaaa{n}.png'},
 {id:'tap-780553',title:'Tập 4 • Thuyết Minh #1',src:'https://jps14.hihihoho4.top/78808a0447c63722104136865e1db127/streamaaa{n}.png'},
 {id:'tap-780554',title:'Tập 5A • Thuyết Minh #1',src:'https://seouls11.amass11.top/dfdd6daf0be4a469319055efa22b0e0e/streamaaa{n}.png'},
 {id:'tap-780555',title:'Tập 5B • Thuyết Minh #1',src:'https://seouls11.amass11.top/dfdd6daf0be4a469319055efa22b0e0e/streamaaa{n}.png'},
 {id:'tap-780575',title:'Tập 6 • Thuyết Minh #1',src:'https://seouls11.amass11.top/963c1a9d03912bb0da78800ea47e25b9/streamaaa{n}.png'}
];
for(const e of TEST_EPISODES){const k='cobephim:de-che-dai-han:'+e.id;caches.set(k,{url:e.src,at:Date.now(),kind:'segments'})}
const item=()=>({id:'cobephim:de-che-dai-han',type:'series',name:NAME,description:'Test toàn bộ Đế Chế Đại Hàn • Phụ đề #1 + Thuyết Minh #1'});
const SCANNER=(process.env.SCANNER_URL||'https://cobephim-full-scan.onrender.com').replace(/\/$/,'');
let liveCatalog={at:0,metas:[],rows:[]};
async function pullCatalog(){try{if(Date.now()-liveCatalog.at<15000&&liveCatalog.metas.length)return liveCatalog;const z=await fetch(SCANNER+'/',{headers:{'user-agent':hdr()['user-agent']}});if(!z.ok)throw Error('scanner '+z.status);const d=await z.json(),rows=Array.isArray(d.catalog)?d.catalog:[];const metas=rows.filter(x=>x.title).map(x=>({id:'cobephim:'+x.slug,type:'series',name:x.title,poster:x.poster||undefined,description:x.description||undefined,releaseInfo:x.year?String(x.year):undefined}));liveCatalog={at:Date.now(),metas,rows};console.log('[catalog] live movies='+metas.length+' scannerStatus='+d.status);return liveCatalog}catch(e){console.error('[catalog]',e.message);return liveCatalog}}
function send(r,s,o){const b=JSON.stringify(o);r.writeHead(s,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'});r.end(b)}
function hdr(){return {'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1','referer':'https://cobephim.cfd/','origin':'https://cobephim.cfd'}}
function p(kind,url){return BASE+'/proxy/'+kind+'?url='+encodeURIComponent(url)}
async function fetchUp(url){const r=await fetch(url,{headers:hdr(),redirect:'follow'});if(!r.ok){const e=Error('upstream '+r.status);e.status=r.status;throw e}return r}
function invalidateByUrl(url){for(const [k,v] of caches)if(v.url&&v.kind==='segments'&&url.startsWith(v.url.split('{n}')[0])){console.log('[cache] invalidate dead segment source '+k);v.url='';v.at=0;v.kind=''}}
function tsOffset(buf){for(let i=0;i<Math.min(buf.length,1048576);i++){if(buf[i]!==0x47)continue;let ok=true;for(let n=1;n<=4;n++)if(i+n*188>=buf.length||buf[i+n*188]!==0x47){ok=false;break}if(ok)return i}return -1}
async function streamSegment(z,r){
 const reader=z.body?.getReader?.(); if(!reader){const raw=Buffer.from(await z.arrayBuffer()),off=tsOffset(raw),media=off>=0?raw.subarray(off):raw;r.writeHead(200,{'content-type':'video/mp2t','content-length':media.length,'access-control-allow-origin':'*','cache-control':'public,max-age=3600'});return r.end(media)}
 let pending=Buffer.alloc(0),started=false;
 r.on('close',()=>reader.cancel().catch(()=>{}));
 while(true){const {done,value}=await reader.read();if(done)break;const chunk=Buffer.from(value);
  if(!started){pending=Buffer.concat([pending,chunk]);const off=tsOffset(pending);if(off>=0){started=true;r.writeHead(200,{'content-type':'video/mp2t','access-control-allow-origin':'*','cache-control':'public,max-age=3600'});r.write(pending.subarray(off));pending=Buffer.alloc(0)}
   else if(pending.length>=1048576){started=true;r.writeHead(200,{'content-type':'video/mp2t','access-control-allow-origin':'*','cache-control':'public,max-age=3600'});r.write(pending);pending=Buffer.alloc(0)}
  }else r.write(chunk);
 }
 if(!started){r.writeHead(200,{'content-type':'video/mp2t','access-control-allow-origin':'*','cache-control':'public,max-age=3600'});if(pending.length)r.write(pending)}
 r.end();
}
async function route(q,r){try{const u=new URL(q.url,'http://x');
 if(u.pathname==='/'||u.pathname==='/health')return send(r,200,{ok:true,version:manifest.version,manifest:BASE+'/manifest.json',testStream:BASE+'/stream/series/'+encodeURIComponent(ID)+'.json'});
 if(u.pathname==='/manifest.json')return send(r,200,manifest);
 if(u.pathname==='/catalog/series/cobephim.json'){const lc=await pullCatalog();const test=item(),metas=[test,...lc.metas.filter(x=>x.id!==test.id)];return send(r,200,{metas})}
 const m=u.pathname.match(/^\/meta\/series\/(.+)\.json$/);if(m){const mid=decodeURIComponent(m[1]);if(mid==='cobephim:de-che-dai-han'||mid===ID)return send(r,200,{meta:{...item(),videos:TEST_EPISODES.map(e=>({id:'cobephim:de-che-dai-han:'+e.id,title:e.title}))}});const lc=await pullCatalog(),slug=mid.replace(/^cobephim:/,'');const row=lc.rows.find(x=>x.slug===slug);return send(r,200,{meta:row?{id:mid,type:'series',name:row.title,poster:row.poster||undefined,description:row.description||undefined,releaseInfo:row.year?String(row.year):undefined,videos:(row.episodes||[]).map((e,i)=>({id:mid+':'+e.id,title:'Tập '+(i+1)}))}:null})}
 const s=u.pathname.match(/^\/stream\/series\/(.+)\.json$/);if(s){const id=decodeURIComponent(s[1]);const old=cacheFor(id);if(!old.url||Date.now()-old.at>=HLS_FRESH_MS)warm(id);return send(r,200,{streams:[{name:'CobePhim',title:old.url?'CobePhim cached fast start':'CobePhim resolver',url:BASE+'/resolve/'+encodeURIComponent(id)+'.m3u8'}]})}
 if(u.pathname.startsWith('/resolve/')){
   const id=decodeURIComponent(u.pathname.slice('/resolve/'.length).replace(/\.m3u8$/,''));
   const cached=cacheFor(id);
   if(!cached.url){const job=warm(id);await Promise.race([job,new Promise((_,rej)=>setTimeout(()=>rej(Error('warming_timeout')),45000))])}
   if(!cached.url)throw Error('master_not_ready');
   if(cached.kind==='segments'){const lines=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-TARGETDURATION:6','#EXT-X-MEDIA-SEQUENCE:0'];for(let i=0;i<1200;i++){lines.push('#EXTINF:4.000,');lines.push(p('segment',cached.url.replace('{n}',String(i).padStart(4,'0'))))}lines.push('#EXT-X-ENDLIST');r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(lines.join('\n'))}
   const master=cached.url,z=await fetchUp(master);let body=await z.text();
   body=body.split(/\r?\n/).map(x=>{const t=x.trim();if(!t||t[0]==='#')return x;try{const abs=new URL(t,master).href;return /streamvsmov\.com|streamvsphim\.top|vsphim\.com/i.test(new URL(abs).hostname)?abs:p('segment',abs)}catch{return x}}).join('\n');
   r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(body)
 }
 if(u.pathname==='/proxy/playlist'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});const z=await fetchUp(up);let body=await z.text();body=body.split(/\r?\n/).map(x=>{const t=x.trim();if(!t||t[0]==='#')return x;try{return p('segment',new URL(t,up).href)}catch{return x}}).join('\n');r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(body)}
 if(u.pathname==='/proxy/segment'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});try{const z=await fetchUp(up);return await streamSegment(z,r)}catch(e){if([401,403,404].includes(e.status)){invalidateByUrl(up);console.error('[segment] dead upstream '+e.status+' '+up)}throw e}}
 return send(r,404,{error:'not_found'});
}catch(e){console.error('[route]',q.url,e?.stack||e);return send(r,502,{error:'proxy_failed',message:e.message})}}
function prewarm(){for(const [key,v] of caches)if(v.url&&v.kind==='hls'&&Date.now()-v.at>=PREWARM_MS)warm(key)}
setInterval(prewarm,60*1000).unref();
http.createServer(route).listen(PORT,'0.0.0.0',()=>{console.log('CobePhim',manifest.version,PORT);warm(ID)});
