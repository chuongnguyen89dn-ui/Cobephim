import http from 'node:http';

const PORT=Number(process.env.PORT||10000);
const BASE=process.env.PUBLIC_BASE_URL||'';
const SAMPLE={
 id:'cobephim:de-che-dai-han:775372',
 name:'Đế Chế Đại Hàn',
 episode:'https://cobephim.cfd/phim/de-che-dai-han/tap-775372',
 poster:''
};
const manifest={
 id:'community.cobephim.browser',
 version:'0.2.0',
 name:'CobePhim Browser Player',
 description:'CobePhim catalog bridge. Playback uses the provider-authorized browser player when no standard media URL is available.',
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
 return {id:SAMPLE.id,type:'series',name:SAMPLE.name,poster:SAMPLE.poster||undefined,description:'Playback opens the authorized CobePhim browser player.'};
}
function route(req,res){
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/'||u.pathname==='/health') return send(res,200,{ok:true,mode:'browser-player',manifest:(BASE||'')+'/manifest.json'});
 if(u.pathname==='/manifest.json') return send(res,200,manifest);
 if(u.pathname==='/catalog/series/cobephim.json') return send(res,200,{metas:[item()]});
 const mm=u.pathname.match(/^\/meta\/(movie|series)\/(.+)\.json$/);
 if(mm){
  const id=decodeURIComponent(mm[2]);
  if(id!==SAMPLE.id) return send(res,200,{meta:null});
  return send(res,200,{meta:{...item(),videos:[{id:SAMPLE.id,title:'Xem trên CobePhim',released:new Date().toISOString()}]}});
 }
 const sm=u.pathname.match(/^\/stream\/(movie|series)\/(.+)\.json$/);
 if(sm){
  const id=decodeURIComponent(sm[2]);
  if(id!==SAMPLE.id) return send(res,200,{streams:[]});
  return send(res,200,{streams:[{
   name:'CobePhim • Browser',
   title:'Mở player gốc của CobePhim',
   externalUrl:SAMPLE.episode,
   behaviorHints:{notWebReady:true}
  }]});
 }
 return send(res,404,{error:'not_found'});
}
http.createServer(route).listen(PORT,'0.0.0.0',()=>console.log('CobePhim browser-player addon listening on',PORT));
