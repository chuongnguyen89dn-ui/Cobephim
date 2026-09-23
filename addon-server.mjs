import http from 'node:http';

const PORT=Number(process.env.PORT||10000);
const BASE=(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');
const SAMPLE={
 id:'cobephim:de-che-dai-han:775372',
 name:'Đế Chế Đại Hàn',
 poster:''
};

const manifest={
 id:'community.cobephim.resolver',
 version:'0.3.0',
 name:'CobePhim Catalog + Media Resolver',
 description:'CobePhim catalog bridge with standards-compatible authorized media resolver support.',
 resources:['catalog','meta','stream'],
 types:['movie','series'],
 catalogs:[{type:'series',id:'cobephim',name:'CobePhim'}],
 idPrefixes:['cobephim:']
};

function send(res,status,obj){
 const body=JSON.stringify(obj);
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'});
 res.end(body);
}
function item(){
 return {id:SAMPLE.id,type:'series',name:SAMPLE.name,poster:SAMPLE.poster||undefined,description:'Catalog entry. Playback is returned only when an authorized standard media source is configured.'};
}
function configuredStreams(id){
 const raw=process.env.MEDIA_SOURCES_JSON;
 if(!raw) return [];
 try{
  const cfg=JSON.parse(raw);
  const list=Array.isArray(cfg?.[id])?cfg[id]:[];
  return list.filter(x=>x&&typeof x.url==='string'&&/^https?:\/\//i.test(x.url)).map((x,i)=>({
   name:x.name||'Authorized media',
   title:x.title||('Source '+(i+1)),
   url:x.url,
   ...(x.behaviorHints?{behaviorHints:x.behaviorHints}:{})
  }));
 }catch(err){
  console.error('Invalid MEDIA_SOURCES_JSON:',err.message);
  return [];
 }
}
function route(req,res){
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/'||u.pathname==='/health') return send(res,200,{
  ok:true,
  mode:'standard-media-resolver',
  manifest:(BASE||'')+'/manifest.json',
  configured:Boolean(process.env.MEDIA_SOURCES_JSON)
 });
 if(u.pathname==='/manifest.json') return send(res,200,manifest);
 if(u.pathname==='/catalog/series/cobephim.json') return send(res,200,{metas:[item()]});
 const mm=u.pathname.match(/^\/meta\/(movie|series)\/(.+)\.json$/);
 if(mm){
  const id=decodeURIComponent(mm[2]);
  if(id!==SAMPLE.id) return send(res,200,{meta:null});
  return send(res,200,{meta:{...item(),videos:[{id:SAMPLE.id,title:'Tập mẫu'}]}});
 }
 const sm=u.pathname.match(/^\/stream\/(movie|series)\/(.+)\.json$/);
 if(sm){
  const id=decodeURIComponent(sm[2]);
  return send(res,200,{streams:configuredStreams(id)});
 }
 return send(res,404,{error:'not_found'});
}
http.createServer(route).listen(PORT,'0.0.0.0',()=>console.log('CobePhim standard-media resolver listening on',PORT));
