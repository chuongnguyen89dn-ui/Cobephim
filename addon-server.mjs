import http from 'node:http';

const PORT=Number(process.env.PORT||10000);
const BASE=(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');
const SAMPLE={id:'cobephim:de-che-dai-han:775372',name:'Đế Chế Đại Hàn',poster:''};
const manifest={id:'community.cobephim.resolver',version:'0.4.0',name:'CobePhim Catalog + HLS Resolver',description:'CobePhim bridge with StreamVSMov fake-PNG HLS normalization.',resources:['catalog','meta','stream'],types:['movie','series'],catalogs:[{type:'series',id:'cobephim',name:'CobePhim'}],idPrefixes:['cobephim:']};

function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'});res.end(body)}
function item(){return {id:SAMPLE.id,type:'series',name:SAMPLE.name,poster:SAMPLE.poster||undefined,description:'CobePhim stream resolver'}}

function sourceFor(id){
 const raw=process.env.MEDIA_SOURCES_JSON;if(!raw)return [];
 try{return (JSON.parse(raw)?.[id]||[]).filter(x=>x&&/^https?:\/\//i.test(x.url))}catch{return []}
}
function headersFor(src){return {'user-agent':src?.userAgent||'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',...(src?.referer?{referer:src.referer}:{}),...(src?.origin?{origin:src.origin}:{}),...(src?.cookie?{cookie:src.cookie}:{})}}

async function get(url,src){
 const r=await fetch(url,{headers:headersFor(src),redirect:'follow'});
 if(!r.ok)throw new Error('upstream '+r.status);
 return r;
}
function proxyUrl(kind,url,id){return (BASE||'')+'/proxy/'+kind+'?id='+encodeURIComponent(id)+'&url='+encodeURIComponent(url)}
function stripFakePng(buf){
 // Common StreamVSMov/TikTok trick: a valid PNG prefix is prepended before MPEG-TS.
 // Locate a TS sync alignment (0x47 every 188 bytes) instead of trusting file extension.
 for(let i=0;i<Math.min(buf.length,1024*1024);i++){
  if(buf[i]!==0x47)continue;
  let ok=true;for(let n=1;n<=4;n++){if(i+n*188>=buf.length||buf[i+n*188]!==0x47){ok=false;break}}
  if(ok)return buf.subarray(i);
 }
 return buf;
}
async function route(req,res){
 try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/'||u.pathname==='/health')return json(res,200,{ok:true,mode:'fake-png-hls-proxy',manifest:(BASE||'')+'/manifest.json'});
  if(u.pathname==='/manifest.json')return json(res,200,manifest);
  if(u.pathname==='/catalog/series/cobephim.json')return json(res,200,{metas:[item()]});
  const mm=u.pathname.match(/^\/meta\/(movie|series)\/(.+)\.json$/);
  if(mm){const id=decodeURIComponent(mm[2]);return json(res,200,{meta:id===SAMPLE.id?{...item(),videos:[{id:SAMPLE.id,title:'Tập mẫu'}]}:null})}
  const sm=u.pathname.match(/^\/stream\/(movie|series)\/(.+)\.json$/);
  if(sm){
   const id=decodeURIComponent(sm[2]), list=sourceFor(id);
   return json(res,200,{streams:list.map((x,i)=>({name:x.name||'CobePhim',title:x.title||('Source '+(i+1)),url:proxyUrl('playlist',x.url,id)}))});
  }
  if(u.pathname==='/proxy/playlist'){
   const id=u.searchParams.get('id')||SAMPLE.id, upstream=u.searchParams.get('url');if(!upstream)return json(res,400,{error:'missing_url'});
   const src=sourceFor(id).find(x=>x.url===upstream)||{};
   const r=await get(upstream,src);let body=await r.text();
   body=body.split(/\r?\n/).map(line=>{
    const s=line.trim();if(!s||s.startsWith('#'))return line;
    try{return proxyUrl('segment',new URL(s,upstream).href,id)}catch{return line}
   }).join('\n');
   res.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return res.end(body);
  }
  if(u.pathname==='/proxy/segment'){
   const id=u.searchParams.get('id')||SAMPLE.id, upstream=u.searchParams.get('url');if(!upstream)return json(res,400,{error:'missing_url'});
   const src=sourceFor(id)[0]||{};const r=await get(upstream,src);const raw=Buffer.from(await r.arrayBuffer());const media=stripFakePng(raw);
   res.writeHead(200,{'content-type':'video/mp2t','content-length':String(media.length),'access-control-allow-origin':'*','cache-control':'public, max-age=3600'});return res.end(media);
  }
  return json(res,404,{error:'not_found'});
 }catch(e){console.error(e);return json(res,502,{error:'proxy_failed',message:String(e.message||e)})}
}
http.createServer((req,res)=>route(req,res)).listen(PORT,'0.0.0.0',()=>console.log('CobePhim HLS resolver listening on',PORT));
