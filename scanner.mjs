import { chromium } from 'playwright';
import fs from 'node:fs';
const target=process.argv[2]||'https://cobephim.ws/phim/de-che-dai-han/tap-770232';
const hits=[],all=[],seen=new Set();
function rec(kind,url,extra={}){if(!url||seen.has(kind+'|'+url))return;seen.add(kind+'|'+url);const row={time:new Date().toISOString(),kind,url,...extra};all.push(row);if(/streamvsmov|\.m3u8(?:\?|$)|master\.m3u8|\.mpd(?:\?|$)|\.mp4(?:\?|$)/i.test(url)){hits.push(row);console.log('HIT',kind,url)}}
const browser=await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled','--no-sandbox']});
const context=await browser.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',viewport:{width:1365,height:768},locale:'vi-VN'});
const page=await context.newPage();
page.on('request',q=>rec('request',q.url(),{method:q.method(),resourceType:q.resourceType(),headers:q.headers()}));
page.on('response',async s=>{const u=s.url(),ct=s.headers()['content-type']||'';rec('response',u,{status:s.status(),contentType:ct});if(/json|javascript|text/i.test(ct)){try{const body=await s.text(),urls=body.match(/https?:[^"'\\\s<>]+/g)||[];for(const x of urls)if(/streamvsmov|m3u8|\.mpd|\.mp4/i.test(x))rec('body-url',x.replace(/\\u0026/g,'&').replace(/\\\//g,'/'),{source:u})}catch{}}});
let navError=null;
try{await page.goto(target,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForTimeout(15000);for(const sel of ['video','button','[class*="play"]','[aria-label*="play" i]']){try{const el=page.locator(sel).first();if(await el.isVisible({timeout:1000}))await el.click({timeout:3000})}catch{}}await page.waitForTimeout(20000)}catch(e){navError=String(e)}
fs.writeFileSync('scan-result.json',JSON.stringify({target,navError,hits,all},null,2));
console.log(JSON.stringify({target,navError,hits:hits.length,requests:all.length},null,2));
await browser.close();