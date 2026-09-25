import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ORIGIN='https://cobephim.cfd';
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1';
const state={status:'starting',mode:'full-site-sitemap+episodes+media',started:new Date().toISOString(),pages:0,movies:0,catalog:[],media:[],errors:[],lastUrl:'',lastError:'',apiResponses:0,episodeApi:0};
const mediaSeen=new Set();
const map=new Map(), seen=new Set(), queued=new Set();
const SAMPLE_NAMES=['reacher','interstellar','the avengers','guardians of the galaxy','hố đen tử thần','biệt đội siêu anh hùng','vệ binh dải ngân hà'];
const DIRECT_SAMPLES=[ORIGIN+'/phim/reacher',ORIGIN+'/phim/ho-den-tu-than',ORIGIN+'/phim/biet-doi-sieu-anh-hung',ORIGIN+'/phim/ve-binh-dai-ngan-ha'];
const q=[ORIGIN+'/',ORIGIN+'/phim-bo',ORIGIN+'/phim-le',ORIGIN+'/the-loai/hanh-dong',ORIGIN+'/the-loai/phieu-luu',ORIGIN+'/the-loai/vien-tuong',ORIGIN+'/the-loai/chieu-rap'];
const movieQ=[];
const retryCount=new Map();
const BATCH_SIZE=20;
let batchNo=1,batch=[];
const flushBatch=()=>{if(!batch.length)return;console.log('BATCH20 '+JSON.stringify({batch:batchNo,count:batch.length,movies:batch}));state.lastBatch={batch:batchNo,count:batch.length,movies:batch};batchNo++;batch=[]};
const sampleMovie=u=>{try{const s=decodeURIComponent(new URL(u,ORIGIN).pathname).toLowerCase();return SAMPLE_NAMES.some(n=>s.includes(n.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/\s+/g,'-')))||/\/(?:reacher|ho-den-tu-than|biet-doi-sieu-anh-hung|ve-binh-dai-ngan-ha)(?:-|\/|$)/.test(s)}catch{return false}};
const movieUrl=u=>{try{const x=new URL(u,ORIGIN);return x.origin===ORIGIN&&/^\/phim\/[^/?#]+\/?$/.test(x.pathname)?x.origin+x.pathname.replace(/\/$/,''):''}catch{return ''}};
const episodeUrl=u=>{try{const x=new URL(u,ORIGIN);return x.origin===ORIGIN&&/^\/phim\/[^/?#]+\/tap-[^/?#]+/.test(x.pathname)?x.origin+x.pathname:''}catch{return ''}};
const addMovie=u=>{const m=movieUrl(u);if(!m)return; if(!map.has(m)){const slug=new URL(m).pathname.split('/').pop();map.set(m,{url:m,slug,title:slug.replace(/-/g,' '),poster:'',description:'',year:null,episodes:[],status:'discovered'});movieQ.push(m)}};
const navSeen=new Set();
const navUrl=u=>{try{const x=new URL(u,ORIGIN);if(x.origin!==ORIGIN)return '';x.hash='';x.search='';const href=x.origin+x.pathname.replace(/\/$/,'');return /^\/(?:the-loai|quoc-gia|phim-bo|phim-le|nam|studio|dao-dien)(?:\/|$)/.test(x.pathname)?href:''}catch{return ''}};
const addNav=u=>{const n=navUrl(u);if(n&&!seen.has(n)&&!navSeen.has(n)){navSeen.add(n);q.push(n)}};
const publish=()=>{state.movies=map.size;state.catalog=[...map.values()]};

async function run(){
 let browser;
 try{
  console.log('BOOT installing Chromium');
  execFileSync('npx',['playwright','install','chromium'],{stdio:'inherit',timeout:240000});
  console.log('BOOT Chromium ready');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let ctx,page;
  const ensureBrowser=async()=>{if(browser&&browser.isConnected())return;try{await browser?.close()}catch{};browser=null;for(let i=1;i<=3;i++){try{browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});if(browser.isConnected())return}catch(e){console.error('BROWSER_RELAUNCH attempt='+i+' '+e);browser=null}await new Promise(r=>setTimeout(r,1200*i))}throw Error('browser_relaunch_failed')};
  const openPage=async()=>{
   try{await ctx?.close()}catch{}
   await ensureBrowser();
   ctx=await browser.newContext({userAgent:UA,viewport:{width:1280,height:900}});
   page=await ctx.newPage();
   page.on('request',r=>{const u=r.url();addMovie(u);captureMedia('REQ',u);});
   page.on('response',async r=>{captureMedia('RES'+r.status(),r.url());try{if(new URL(r.url()).hostname===APIHOST&&r.url().includes('/api/v1/')){const j=await r.json();walk(j);state.apiResponses++;console.log('API '+r.url())}}catch{}});
   return page;
  };
  const APIHOST='egluy2hhb21vaw5ndw9pbmhl.darkbytes.xyz';
  const movieIds=new Set();
  const walk=(v)=>{
   if(!v||typeof v!=='object')return;
   if(Array.isArray(v)){for(const x of v)walk(x);return}
   const id=v.idMovie??v.movieId??v.movie_id??((v.slug||v.name||v.title)&&v.id);
   if(id!=null&&/^\d+$/.test(String(id))) movieIds.add(String(id));
   for(const x of Object.values(v))walk(x);
  };
  const bulkEpisodes=async()=>{
   const ids=[...movieIds]; let n=0;
   console.log('BULK episode IDs='+ids.length);
   const workers=Array.from({length:12},async()=>{
    while(n<ids.length){const id=ids[n++];try{
     const r=await ctx.request.get('https://'+APIHOST+'/api/v1/episodes/by-idMovie/'+id,{timeout:8000});
     if(r.ok()){const j=await r.json();walk(j);state.episodeApi++;state.media.push({kind:'EPISODE_API',movieId:id,data:j,at:new Date().toISOString()});}
    }catch(e){state.errors.push('EPAPI '+id+' '+e)}
   }});
   await Promise.all(workers);console.log('BULK episodes done='+state.episodeApi);
  };
  const captureMedia=(kind,u)=>{try{const x=new URL(u);if(/\.(?:webp|gif|jpe?g|svg|ico)(?:$|\?)/i.test(u)||x.hostname==='icdn.darkbytes.xyz'||x.hostname==='zcdn.darkbytes.xyz')return;if(/\.m3u8(?:$|\?)/i.test(u)||/\/streamaaa\d+\.png(?:$|\?)/i.test(u)||/streamvsmov|streamc\.|cyin\d*\.|darkbytes|vsphim/i.test(x.hostname)){const k=u.replace(/streamaaa\d+\.png.*$/i,'streamaaa{n}.png');if(!mediaSeen.has(k)){mediaSeen.add(k);state.media.push({kind,url:k,page:page.url(),at:new Date().toISOString()});console.log('MEDIA '+kind+' '+k)}}}catch{}};
  await openPage();
  state.status='discovering';
  // Discovery is HTTP-only: Chromium is reserved for phase 2 media harvesting.
  const httpDiscover=async(url)=>{
    const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml'}});
    if(!r.ok)throw Error('HTTP_DISCOVER '+r.status+' '+url);
    const html=await r.text();
    const urls=new Set();
    for(const m of html.matchAll(/href=["']([^"'#]+)["']/gi))try{urls.add(new URL(m[1].replace(/&amp;/g,'&'),url).href)}catch{}
    for(const m of html.matchAll(/(?:https?:\\?\/\\?\/[^"'<>\\s]+|\\?\/phim\\?\/[^"'<>\\s]+)/g))try{urls.add(new URL(m[0].replace(/\\\//g,'/'),ORIGIN).href)}catch{}
    for(const u of urls){addMovie(u);addNav(u)}
    return {urls,html};
  };
  try{await ctx?.close()}catch{};ctx=null;page=null;try{await browser?.close()}catch{};browser=null;
  while(q.length){
   const url=q.shift(); if(seen.has(url))continue; state.lastUrl=url;
   let ok=false;
   for(let attempt=1;attempt<=3&&!ok;attempt++){
   try{
    const {urls,html}=await httpDiscover(url);
    const data={title:'',desc:'',poster:'',hrefs:[...urls],text:html};
    const here='';
    if(here){
      const row=map.get(here); row.title=(data.title||row.title).replace(/\s*[-|].*$/,'').trim();row.description=data.desc;row.poster=data.poster;
      row.year=Number(((data.text.match(/(?:19|20)\d{2}/)||[])[0]))||null;
      const eps=[...new Set([...urls].map(episodeUrl).filter(Boolean))].filter(u=>!/\/tap-latest(?:$|[?#])/.test(u));
      row.episodes=eps.map((u,i)=>({url:u,id:new URL(u).pathname.split('/').pop(),index:i+1,resolver:'pending'}));
      if(row.episodes.length){
       for(const ep of row.episodes){
        await page.goto(ep.url,{waitUntil:'domcontentloaded',timeout:12000}).catch(()=>{});
        await page.waitForTimeout(1200);
        const variants=await page.evaluate(()=>[...document.querySelectorAll('button,[role="button"],select option,a')].map((e,i)=>({i,text:(e.innerText||e.textContent||'').trim()})).filter(x=>/phụ đề|thuyết minh|lồng tiếng|server|#\d+/i.test(x.text)).slice(0,20)).catch(()=>[]);
        const rounds=Math.max(1,variants.length);
        for(let v=0;v<rounds;v++){
         if(variants[v]){for(const fr of page.frames())try{const loc=fr.getByText(variants[v].text,{exact:true}).first();if(await loc.count())await loc.click({timeout:700})}catch{}}
         for(const fr of page.frames())for(const sel of ['video','.jw-display-icon-container','.jw-icon-playback','[class*="play" i]','[id*="play" i]'])try{const es=fr.locator(sel),n=Math.min(await es.count(),6);for(let i=0;i<n;i++)try{sel==='video'?await es.nth(i).evaluate(x=>{x.muted=true;return x.play()}):await es.nth(i).click({timeout:350})}catch{}}catch{}
         await page.mouse.click(640,450).catch(()=>{});await page.waitForTimeout(2600);
        }
        ep.variants=variants.map(x=>x.text);ep.resolver='harvested';
       }
      }
      row.status='indexed';
      batch.push({title:row.title,url:row.url,poster:row.poster,year:row.year,episodes:row.episodes,media:state.media.filter(m=>m.page&&m.page.startsWith(row.url))});
      if(batch.length>=BATCH_SIZE)flushBatch();
    }
    state.pages++;ok=true;seen.add(url);publish();console.log('DISCOVER pages='+state.pages+' movies='+state.movies+' navQueue='+q.length+' movieQueue='+movieQ.length+' url='+url);
   }catch(e){state.lastError=String(e);state.errors.push(String(e));console.error('ERR attempt='+attempt+' '+url+' '+e);try{await ctx?.close()}catch{};ctx=null;page=null;try{if(browser&&!browser.isConnected()){try{await browser.close()}catch{};browser=null}}catch{};}
   }
   if(!ok){const n=(retryCount.get(url)||0)+1;retryCount.set(url,n);if(n<=1){q.push(url);console.log('REQUEUE '+url)}else{seen.add(url);console.log('GIVEUP '+url)}}
   publish();
  }
  console.log('DISCOVERY_DONE uniqueMovies='+map.size);await openPage();
  // Phase 2: process unique movie URLs only after sitemap discovery is complete.
  state.status='harvesting';
  for(const m of movieQ) q.push(m);
  seen.clear();
  while(q.length){
   const url=q.shift(); if(seen.has(url))continue; state.lastUrl=url;
   let ok=false;
   for(let attempt=1;attempt<=2&&!ok;attempt++)try{
    if(!page||page.isClosed())await openPage();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000}); await page.waitForTimeout(900);
    const data=await page.evaluate(()=>({title:document.title,desc:document.querySelector('meta[name="description"],meta[property="og:description"]')?.content||'',poster:document.querySelector('meta[property="og:image"]')?.content||'',hrefs:[...document.querySelectorAll('a[href]')].map(a=>a.href),text:document.documentElement.innerHTML}));
    const row=map.get(url); if(!row){ok=true;seen.add(url);continue}
    row.title=(data.title||row.title).replace(/\s*[-|].*$/,'').trim();row.description=data.desc;row.poster=data.poster;row.year=Number(((data.text.match(/(?:19|20)\d{2}/)||[])[0]))||null;
    const eps=[...new Set(data.hrefs.map(episodeUrl).filter(Boolean))].filter(u=>!/\/tap-latest(?:$|[?#])/.test(u));
    row.episodes=eps.map((u,i)=>({url:u,id:new URL(u).pathname.split('/').pop(),index:i+1,resolver:'pending'}));
    for(const ep of row.episodes){
      await page.goto(ep.url,{waitUntil:'domcontentloaded',timeout:12000}).catch(()=>{}); await page.waitForTimeout(700);
      const variants=await page.evaluate(()=>[...document.querySelectorAll('button,[role="button"],select option,a')].map(e=>(e.innerText||e.textContent||'').trim()).filter(x=>/phụ đề|thuyết minh|lồng tiếng|server|#\d+/i.test(x)).slice(0,20)).catch(()=>[]);
      for(const label of (variants.length?variants:[''])){if(label)for(const fr of page.frames())try{const loc=fr.getByText(label,{exact:true}).first();if(await loc.count())await loc.click({timeout:500})}catch{};for(const fr of page.frames())for(const sel of ['video','.jw-display-icon-container','.jw-icon-playback','[class*="play" i]','[id*="play" i]'])try{const es=fr.locator(sel),n=Math.min(await es.count(),4);for(let i=0;i<n;i++)try{sel==='video'?await es.nth(i).evaluate(x=>{x.muted=true;return x.play()}):await es.nth(i).click({timeout:250})}catch{}}catch{};await page.waitForTimeout(1600)}
      ep.variants=variants;ep.resolver='harvested';
    }
    row.status='indexed';batch.push({title:row.title,url:row.url,poster:row.poster,year:row.year,episodes:row.episodes,media:state.media.filter(x=>x.page&&x.page.startsWith(row.url))});if(batch.length>=BATCH_SIZE)flushBatch();
    ok=true;seen.add(url);console.log('HARVEST done='+seen.size+'/'+movieQ.length+' title='+row.title);
   }catch(e){state.errors.push(String(e));state.lastError=String(e);console.error('HARVEST_ERR attempt='+attempt+' '+url+' '+e);try{await ctx?.close()}catch{};ctx=null;page=null;try{if(browser&&!browser.isConnected())browser=null}catch{}}
   if(!ok)console.log('HARVEST_GIVEUP '+url);
  }
  flushBatch();state.status='done'; console.log('FULL_SCAN_DONE '+JSON.stringify([...map.values()].map(x=>({title:x.title,url:x.url,episodes:x.episodes.length}))));
 }catch(e){state.status='error';state.lastError=String(e);state.errors.push(String(e));console.error(e)}
 finally{try{await ctx?.close()}catch{};if(browser)await browser.close();state.finished=new Date().toISOString()}
}
run();
http.createServer((req,res)=>{res.setHeader('content-type','application/json; charset=utf-8');if(req.url==='/health')return res.end(JSON.stringify({status:state.status,pages:state.pages,movies:state.movies,media:state.media.length,lastUrl:state.lastUrl,lastError:state.lastError,errors:state.errors.length}));res.end(JSON.stringify(state))}).listen(process.env.PORT||10000,'0.0.0.0');
