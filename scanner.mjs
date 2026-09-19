import { chromium } from 'playwright';
import fs from 'node:fs';
const target=process.argv[2]||'https://cobephim.ws/phim/de-che-dai-han/tap-770232';
const hits=[],all=[],bodies=[],seen=new Set();
const interesting=/streamvsmov|m3u8|master\.m3u8|\.mpd|\.mp4|player|embed|iframe|stream|video/i;
function rec(kind,url,extra={}){if(!url)return;const key=kind+'|'+url;if(seen.has(key))return;seen.add(key);const row={time:new Date().toISOString(),kind,url,...extra};all.push(row);if(interesting.test(url)){hits.push(row);console.log('HIT',kind,url)}}
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
fs.writeFileSync('scan-result.json',JSON.stringify({target,finalUrl:page.url(),title,navError,frames,hits,all,bodies},null,2));
console.log(JSON.stringify({target,finalUrl:page.url(),title,navError,frames,hits:hits.length,requests:all.length,bodies:bodies.length},null,2));
await browser.close();