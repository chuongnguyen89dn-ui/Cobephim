import fs from 'node:fs/promises';
const ORIGIN='https://cobephim.cfd', OUT='cobephim-catalog.json';
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1';
const q=[ORIGIN+'/'], seen=new Set(), movies=new Map();
const clean=s=>String(s||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/');
const abs=u=>{try{return new URL(clean(u),ORIGIN).href}catch{return ''}};
function movieUrl(u){try{const x=new URL(u);return x.origin===ORIGIN&&/^\/phim\/[^/?#]+\/?$/.test(x.pathname)?x.origin+x.pathname.replace(/\/$/,''):''}catch{return ''}}
function episodeUrl(u){try{const x=new URL(u);return x.origin===ORIGIN&&/^\/phim\/[^/?#]+\/tap-[^/?#]+/.test(x.pathname)?x.origin+x.pathname:''}catch{return ''}}
function links(html){return [...html.matchAll(/(?:href|src)=["']([^"'#]+)["']/gi)].map(x=>abs(x[1])).filter(Boolean)}
function jsonLd(html){const a=[];for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{a.push(JSON.parse(m[1]))}catch{}return a}
async function get(url){const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml'}});if(!r.ok)throw Error(r.status+' '+url);return r.text()}
async function checkpoint(){await fs.writeFile(OUT,JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,count:movies.size,movies:[...movies.values()]},null,2))}
let pages=0;
while(q.length){
 const url=q.shift(); if(seen.has(url))continue; seen.add(url);
 let html; try{html=await get(url)}catch(e){console.error('ERR',String(e));continue} pages++;
 const ls=links(html);
 for(const u of ls){const m=movieUrl(u);if(m&&!movies.has(m))movies.set(m,{url:m,slug:new URL(m).pathname.split('/').pop(),title:'',poster:'',backdrop:'',description:'',year:null,genres:[],episodes:[],status:'indexed'}); if(m&&!seen.has(m))q.push(m)}
 const here=movieUrl(url);
 if(here){
  const row=movies.get(here)||{url:here,episodes:[]}; const ld=jsonLd(html).flatMap(x=>Array.isArray(x)?x:[x]);
  const obj=ld.find(x=>x&&/Movie|TVSeries|CreativeWork/i.test(x['@type']||''))||{};
  row.title=obj.name||((html.match(/<title[^>]*>([^<]+)/i)||[])[1]||'').replace(/\s*[-|].*$/,'').trim();
  row.description=obj.description||((html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)||[])[1]||'');
  row.poster=abs(obj.image?.url||obj.image||((html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)||[])[1]||''));
  row.backdrop=abs(((html.match(/<meta[^>]+(?:property|name)=["'](?:twitter:image|og:image)["'][^>]+content=["']([^"']+)/i)||[])[1]||row.poster));
  row.year=Number((html.match(/(?:19|20)\d{2}/)||[])[0])||null;
  row.episodes=[...new Set(ls.map(episodeUrl).filter(Boolean))].map(u=>({url:u,id:new URL(u).pathname.split('/').pop(),resolver:'pending'}));
  movies.set(here,row);
 }
 if(pages%25===0){await checkpoint();console.log('CHECKPOINT pages='+pages+' movies='+movies.size+' queue='+q.length)}
 if(pages>20000)break;
}
await checkpoint(); console.log('DONE pages='+pages+' movies='+movies.size+' -> '+OUT);
