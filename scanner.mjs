import fs from 'node:fs/promises';
const ORIGIN='https://cobephim.cfd', OUT='cobephim-sitemap.json';
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1';
const roots=['/','/phim-bo','/phim-le'], q=roots.map(x=>ORIGIN+x), seen=new Set(), nodes=new Map(), movies=new Map();
const clean=s=>String(s||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/');
const abs=u=>{try{return new URL(clean(u),ORIGIN).href}catch{return ''}};
const same=u=>{try{return new URL(u).origin===ORIGIN}catch{return false}};
const canonical=u=>{try{const x=new URL(u);x.hash='';for(const k of [...x.searchParams.keys()])if(!['page'].includes(k))x.searchParams.delete(k);return x.href}catch{return ''}};
const movieUrl=u=>{try{const x=new URL(u);return x.origin===ORIGIN&&/^\/phim\/[^/?#]+\/?$/.test(x.pathname)?x.origin+x.pathname.replace(/\/$/,''):''}catch{return ''}};
const episodeUrl=u=>{try{const x=new URL(u);return x.origin===ORIGIN&&/^\/phim\/[^/?#]+\/tap-[^/?#]+/.test(x.pathname)?x.origin+x.pathname:''}catch{return ''}};
const navPath=p=>/^\/(?:the-loai|quoc-gia|phim-bo|phim-le|nam|studio|dao-dien)(?:\/|$)/.test(p);
function links(html){return [...html.matchAll(/(?:href|src)=["']([^"'#]+)["']/gi)].map(x=>abs(x[1])).filter(Boolean)}
function jsonLd(html){const a=[];for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{a.push(JSON.parse(m[1]))}catch{}return a}
async function get(url){const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml'}});if(!r.ok)throw Error(r.status+' '+url);return r.text()}
async function checkpoint(){const groups={};for(const v of nodes.values()){const k=v.kind;(groups[k]??=[]).push(v)}await fs.writeFile(OUT,JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,pages:seen.size,movieCount:movies.size,groups,movies:[...movies.values()]},null,2))}
let pages=0;
while(q.length){
 const raw=q.shift(),url=canonical(raw);if(!url||seen.has(url)||!same(url))continue;seen.add(url);
 let html;try{html=await get(url)}catch(e){console.error('ERR',String(e));continue}pages++;
 const x=new URL(url),ls=links(html),title=((html.match(/<title[^>]*>([^<]+)/i)||[])[1]||'').trim();
 let kind='other';if(x.pathname==='/')kind='home';else if(x.pathname==='/phim-bo')kind='phim-bo';else if(x.pathname==='/phim-le')kind='phim-le';else if(x.pathname.startsWith('/the-loai/'))kind='the-loai';else if(x.pathname.startsWith('/quoc-gia/'))kind='quoc-gia';else if(x.pathname.startsWith('/nam/'))kind='nam';else if(x.pathname.startsWith('/studio/'))kind='studio';else if(x.pathname.startsWith('/dao-dien/'))kind='dao-dien';else if(movieUrl(url))kind='movie';
 nodes.set(url,{url,kind,title,page:Number(x.searchParams.get('page')||1)});
 for(const u0 of ls){const u=canonical(u0);if(!u||!same(u))continue;const m=movieUrl(u);if(m&&!movies.has(m))movies.set(m,{url:m,slug:new URL(m).pathname.split('/').pop(),title:'',poster:'',description:'',year:null,episodes:[]});
  const ux=new URL(u);if((m||navPath(ux.pathname))&&!seen.has(u))q.push(u);
 }
 const here=movieUrl(url);if(here){const row=movies.get(here),ld=jsonLd(html).flatMap(v=>Array.isArray(v)?v:[v]),obj=ld.find(v=>v&&/Movie|TVSeries|CreativeWork/i.test(v['@type']||''))||{};
  row.title=obj.name||title.replace(/\s*[-|].*$/,'').trim();row.description=obj.description||((html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)||[])[1]||'');
  row.poster=abs(obj.image?.url||obj.image||((html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)||[])[1]||''));row.year=Number((html.match(/(?:19|20)\d{2}/)||[])[0])||null;
  row.episodes=[...new Set(ls.map(episodeUrl).filter(Boolean))].map(u=>({url:u,id:new URL(u).pathname.split('/').pop()}));
 }
 if(pages%50===0){await checkpoint();console.log('SITEMAP pages='+pages+' nodes='+nodes.size+' movies='+movies.size+' queue='+q.length)}
 if(pages>50000)break;
}
await checkpoint();console.log('DONE sitemap pages='+pages+' nodes='+nodes.size+' movies='+movies.size+' -> '+OUT);
