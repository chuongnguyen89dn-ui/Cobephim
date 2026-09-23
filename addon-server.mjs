import http from 'node:http';
const PORT=Number(process.env.PORT||10000), BASE=(process.env.PUBLIC_BASE_URL||'https://cobephim-one-shot.onrender.com').replace(/\/$/,'');
const ID='cobephim:de-che-dai-han:775372', NAME='Đế Chế Đại Hàn';
const MASTER='https://v1.streamvsmov.com/stream/db6efbfc-892b-4f05-8789-ccc4c6fad901/master.m3u8?expires=1789817888&signature=e4a63449ffb8f4a98e407d5df68ffd18f903886e44258306b5629ee20b506ab6';
const manifest={id:'community.cobephim.resolver',version:'0.4.1',name:'CobePhim HLS Resolver',description:'CobePhim StreamVSMov fake-PNG HLS normalization test.',resources:['catalog','meta','stream'],types:['series'],catalogs:[{type:'series',id:'cobephim',name:'CobePhim'}],idPrefixes:['cobephim:']};
const item=()=>({id:ID,type:'series',name:NAME,description:'CobePhim playback test'});
function send(r,s,o){const b=JSON.stringify(o);r.writeHead(s,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'});r.end(b)}
function hdr(){return {'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1','referer':'https://cobephim.ws/','origin':'https://cobephim.ws'}}
function p(kind,url){return BASE+'/proxy/'+kind+'?url='+encodeURIComponent(url)}
async function fetchUp(url){const r=await fetch(url,{headers:hdr(),redirect:'follow'});if(!r.ok)throw Error('upstream '+r.status);return r}
function strip(buf){for(let i=0;i<Math.min(buf.length,1048576);i++){if(buf[i]!==0x47)continue;let ok=true;for(let n=1;n<=4;n++)if(i+n*188>=buf.length||buf[i+n*188]!==0x47){ok=false;break}if(ok)return buf.subarray(i)}return buf}
async function route(q,r){try{const u=new URL(q.url,'http://x');
 if(u.pathname==='/'||u.pathname==='/health')return send(r,200,{ok:true,version:manifest.version,manifest:BASE+'/manifest.json',testStream:BASE+'/stream/series/'+encodeURIComponent(ID)+'.json'});
 if(u.pathname==='/manifest.json')return send(r,200,manifest);
 if(u.pathname==='/catalog/series/cobephim.json')return send(r,200,{metas:[item()]});
 const m=u.pathname.match(/^\/meta\/series\/(.+)\.json$/);if(m)return send(r,200,{meta:decodeURIComponent(m[1])===ID?{...item(),videos:[{id:ID,title:'Tập thử'}]}:null});
 const s=u.pathname.match(/^\/stream\/series\/(.+)\.json$/);if(s){const id=decodeURIComponent(s[1]);return send(r,200,{streams:id===ID?[{name:'CobePhim',title:'StreamVSMov proxy #1',url:p('playlist',MASTER)}]:[]})}
 if(u.pathname==='/proxy/playlist'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});const z=await fetchUp(up);let body=await z.text();body=body.split(/\r?\n/).map(x=>{const t=x.trim();if(!t||t[0]==='#')return x;try{return p('segment',new URL(t,up).href)}catch{return x}}).join('\n');r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(body)}
 if(u.pathname==='/proxy/segment'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});const z=await fetchUp(up),raw=Buffer.from(await z.arrayBuffer()),media=strip(raw);r.writeHead(200,{'content-type':'video/mp2t','content-length':media.length,'access-control-allow-origin':'*','cache-control':'public,max-age=3600'});return r.end(media)}
 return send(r,404,{error:'not_found'});
}catch(e){return send(r,502,{error:'proxy_failed',message:e.message})}}
http.createServer(route).listen(PORT,'0.0.0.0',()=>console.log('CobePhim',manifest.version,PORT));
