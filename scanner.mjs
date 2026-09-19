import { chromium } from 'playwright';
import fs from 'node:fs';
const target=process.argv[2]||'https://cobephim.ws/phim/de-che-dai-han/tap-770232';
const hits=[],all=[],bodies=[],seen=new Set();
const interesting=/streamvsmov|m3u8|master\.m3u8|\.mpd|\.mp4|player|embed|iframe|stream|video/i;
function rec(kind,url,extra={}){if(!url)return;const key=kind+'|'+url;if(seen.has(key))return;seen.add(key);const row={time:new Date().toISOString(),kind,url,...extra};all.push(row);if(interesting.test(url)){hits.push(row);console.log('HIT',kind,url)}}
// Browser-network discovery on accessible mirror pages.
const mirrorTargets=['https://motchilltv.zip/episodes/bay-vao-trai-tim-anh-tap-21/','https://motchilltv.zip/episodes/lan-huong-nhu-co-tap-4/'];
const mirrorScan=[];
async function scanMirror(url){
 const b=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const cx=await b.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'}); const p=await cx.newPage(); const rows=[];
 const keep=u=>/streamvsmov|streamc|m3u8|embed|player|video|ajax|api/i.test(u);
 p.on('request',q=>{if(keep(q.url())){rows.push({kind:'request',url:q.url(),method:q.method(),type:q.resourceType()});console.log('MIRROR REQ',q.method(),q.resourceType(),q.url())}});
 p.on('response',async r=>{if(keep(r.url())){rows.push({kind:'response',url:r.url(),status:r.status(),contentType:r.headers()['content-type']||''});console.log('MIRROR RES',r.status,r.url())}});
 try{await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForTimeout(5000);for(const fr of p.frames()){for(const sel of ['video','button','[class*="play" i]','[id*="play" i]']){try{const es=fr.locator(sel),n=Math.min(await es.count(),10);for(let i=0;i<n;i++){try{if(sel==='video')await es.nth(i).evaluate(v=>{v.muted=true;return v.play()});else if(await es.nth(i).isVisible())await es.nth(i).click({timeout:1000})}catch{}}}catch{}}}await p.mouse.click(683,450).catch(()=>{});await p.waitForTimeout(15000);const perf=await p.evaluate(()=>performance.getEntriesByType('resource').map(x=>x.name));mirrorScan.push({url,title:await p.title(),frames:p.frames().map(x=>x.url()),rows,performance:perf.filter(keep)});}catch(e){mirrorScan.push({url,error:String(e),rows})} await b.close();
}
for(const u of mirrorTargets) await scanMirror(u);
// Seed direct-provider intelligence from confirmed working stream.
const knownStream='https://v1.streamvsmov.com/stream/db6efbfc-892b-4f05-8789-ccc4c6fad901/master.m3u8?expires=1789817888&signature=e4a63449ffb8f4a98e407d5df68ffd18f903886e44258306b5629ee20b506ab6';
const providerProbe={knownStream,tests:[],discovery:[]};
// Public pages using the same provider can expose the embed/player contract without Cobephim's Cloudflare wall.
for (const url of ['https://motchilltv.zip/episodes/bay-vao-trai-tim-anh-tap-21/','https://motchilltv.zip/episodes/lan-huong-nhu-co-tap-4/']) {
  try {
    const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0'}}); const body=await r.text();
    const found=[...body.matchAll(/https?:[^"'\\\\\\s<>]+/g)].map(x=>x[0].replace(/\\\\\//g,'/')).filter(x=>/streamvsmov|streamc|embed|m3u8|player/i.test(x));
    const uuids=[...new Set(body.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)||[])];
    providerProbe.discovery.push({url,status:r.status,found:[...new Set(found)].slice(0,100),uuids,bodyMatches:(body.match(/.{0,150}(?:streamvsmov|streamc|embed|m3u8|player).{0,250}/gi)||[]).slice(0,50)});
    console.log('DISCOVERY',url,r.status,'urls',found.length,'uuids',uuids.length); for(const x of [...new Set(found)].slice(0,30)) console.log('DISCOVERED',x);
  } catch(e){providerProbe.discovery.push({url,error:String(e)})}
}
try {
  const u=new URL(knownStream);
  for (const path of ['/', '/stream/db6efbfc-892b-4f05-8789-ccc4c6fad901/master.m3u8'+u.search]) {
    const r=await fetch(u.origin+path,{headers:{'user-agent':'Mozilla/5.0','referer':'https://cobephim.ws/'}});
    const text=await r.text();
    providerProbe.tests.push({url:u.origin+path,status:r.status,contentType:r.headers.get('content-type'),server:r.headers.get('server'),allow:r.headers.get('allow'),body:text.slice(0,5000)});
    console.log('PROVIDER',r.status,u.origin+path,r.headers.get('content-type'));
  }
} catch(e){providerProbe.error=String(e)}
const browser=await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',viewport:{width:1365,height:900},locale:'vi-VN'});
context.on('page',p=>{console.log('NEW PAGE',p.url());});
const page=await context.newPage();
page.on('console',m=>console.log('PAGE',m.type(),m.text().slice(0,500)));
page.on('frameattached',f=>console.log('FRAME ATTACHED',f.url()));
page.on('framenavigated',f=>console.log('FRAME NAV',f.url()));
page.on('websocket',ws=>{rec('websocket',ws.url());ws.on('framereceived',e=>{if(interesting.test(e.payload||''))bodies.push({kind:'ws-recv',url:ws.url(),text:String(e.payload).slice(0,10000)})})});
page.on('request',q=>rec('request',q.url(),{method:q.method(),resourceType:q.resourceType(),frame:q.frame()?.url()||'',headers:q.headers()}));
page.on('response',async s=>{const u=s.url(),ct=s.headers()['content-type']||'';rec('response',u,{status:s.status(),contentType:ct,frame:s.request().frame()?.url()||''});if(/json|javascript|text|html/i.test(ct)){try{const body=await s.text();if(interesting.test(body)){bodies.push({kind:'body',url:u,status:s.status(),contentType:ct,text:body.slice(0,200000)});console.log('BODY HIT',u,body.length)}}catch{}}});
let navError=null,title='',html='',frames=[];
try{
 await page.goto(target,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForTimeout(8000);
 title=await page.title(); html=await page.content();
 console.log('TITLE',title); console.log('URL',page.url()); console.log('HTML LEN',html.length);
 frames=page.frames().map(f=>({url:f.url(),name:f.name()})); console.log('FRAMES',JSON.stringify(frames));
 const selectors=['video','iframe','button','[class*="play" i]','[id*="play" i]','[aria-label*="play" i]','[class*="player" i]'];
 for(const sel of selectors){try{const n=await page.locator(sel).count();console.log('SELECTOR',sel,n)}catch{}}
 for(const f of page.frames()){
   try{
     const vids=f.locator('video'); const n=await vids.count();
     for(let i=0;i<n;i++){try{await vids.nth(i).evaluate(v=>{v.muted=true;return v.play()})}catch{}}
     for(const sel of ['button','[class*="play" i]','[id*="play" i]','[aria-label*="play" i]']){try{const els=f.locator(sel);const n=Math.min(await els.count(),8);for(let i=0;i<n;i++){try{if(await els.nth(i).isVisible())await els.nth(i).click({timeout:1500})}catch{}}}catch{}}
   }catch{}
 }
 await page.mouse.click(683,450).catch(()=>{});
 await page.waitForTimeout(20000);
 frames=page.frames().map(f=>({url:f.url(),name:f.name()}));
 await page.screenshot({path:'page.png',fullPage:true}).catch(()=>{});
 html=await page.content();
}catch(e){navError=String(e)}
fs.writeFileSync('page.html',html);
fs.writeFileSync('scan-result.json',JSON.stringify({target,finalUrl:page.url(),title,navError,frames,hits,all,bodies,providerProbe,mirrorScan},null,2));
console.log(JSON.stringify({target,finalUrl:page.url(),title,navError,frames,hits:hits.length,requests:all.length,bodies:bodies.length},null,2));
await browser.close();