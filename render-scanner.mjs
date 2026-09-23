import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ORIGIN='https://cobephim.cfd';
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1';
const state={status:'starting',started:new Date().toISOString(),pages:0,movies:0,catalog:[],errors:[],lastUrl:'',lastError:''};
const map=new Map(), seen=new Set(), queued=new Set();
const q=[ORIGIN+'/'];
const movieUrl=u=>{try{const x=new URL(u,ORIGIN);return x.origin===ORIGIN&&/^\/phim\/[^/?#]+\/?$/.test(x.pathname)?x.origin+x.pathname.replace(/\/$/,''):''}catch{return ''}};
const episodeUrl=u=>{try{const x=new URL(u,ORIGIN);return x.origin===ORIGIN&&/^\/phim\/[^/?#]+\/tap-[^/?#]+/.test(x.pathname)?x.origin+x.pathname:''}catch{return ''}};
const addMovie=u=>{const m=movieUrl(u);if(!m)return; if(!map.has(m)){const slug=new URL(m).pathname.split('/').pop();map.set(m,{url:m,slug,title:slug.replace(/-/g,' '),poster:'',description:'',year:null,episodes:[],status:'discovered'});q.push(m)}};
const publish=()=>{state.movies=map.size;state.catalog=[...map.values()]};

async function run(){
 let browser;
 try{
  console.log('BOOT installing Chromium');
  execFileSync('npx',['playwright','install','chromium'],{stdio:'inherit',timeout:240000});
  console.log('BOOT Chromium ready');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({userAgent:UA,viewport:{width:1280,height:900}});
  const page=await ctx.newPage();
  page.on('request',r=>{const u=r.url();addMovie(u);});
  state.status='running';
  while(q.length){
   const url=q.shift(); if(seen.has(url))continue; seen.add(url); state.lastUrl=url;
   try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForTimeout(1200);
    for(let i=0;i<3;i++){await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(500)}
    const data=await page.evaluate(()=>({
      title:document.title,
      desc:document.querySelector('meta[name="description"],meta[property="og:description"]')?.content||'',
      poster:document.querySelector('meta[property="og:image"]')?.content||'',
      hrefs:[...document.querySelectorAll('a[href]')].map(a=>a.href),
      text:document.documentElement.innerHTML
    }));
    const urls=new Set(data.hrefs);
    for(const m of data.text.matchAll(/(?:https?:\\?\/\\?\/[^"'<>\\s]+|\\?\/phim\\?\/[^"'<>\\s]+)/g))try{urls.add(new URL(m[0].replace(/\\\//g,'/'),ORIGIN).href)}catch{}
    for(const u of urls){addMovie(u)}
    const here=movieUrl(url);
    if(here){
      const row=map.get(here); row.title=(data.title||row.title).replace(/\s*[-|].*$/,'').trim();row.description=data.desc;row.poster=data.poster;
      row.year=Number(((data.text.match(/(?:19|20)\d{2}/)||[])[0]))||null;
      row.episodes=[...new Set([...urls].map(episodeUrl).filter(Boolean))].map((u,i)=>({url:u,id:new URL(u).pathname.split('/').pop(),index:i+1,resolver:'pending'}));
      row.status='indexed';
    }
    state.pages++;publish();console.log('SCAN pages='+state.pages+' movies='+state.movies+' queue='+q.length+' url='+url);
   }catch(e){state.lastError=String(e);state.errors.push(String(e));console.error('ERR '+url+' '+e)}
   publish();
  }
  state.status='done';
 }catch(e){state.status='error';state.lastError=String(e);state.errors.push(String(e));console.error(e)}
 finally{if(browser)await browser.close();state.finished=new Date().toISOString()}
}
run();
http.createServer((req,res)=>{res.setHeader('content-type','application/json; charset=utf-8');if(req.url==='/health')return res.end(JSON.stringify({status:state.status,pages:state.pages,movies:state.movies,lastUrl:state.lastUrl,lastError:state.lastError,errors:state.errors.length}));res.end(JSON.stringify(state))}).listen(process.env.PORT||10000,'0.0.0.0');
