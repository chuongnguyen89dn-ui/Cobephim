import http from 'node:http';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const PORT=Number(process.env.PORT||10000), BASE=(process.env.PUBLIC_BASE_URL||'https://cobephim-one-shot.onrender.com').replace(/\/$/,'');
const ID='cobephim:de-che-dai-han:775372', NAME='Đế Chế Đại Hàn';
const TARGET='https://cobephim.cfd/phim/de-che-dai-han';
const caches=new Map(), warmings=new Map();
const HLS_FRESH_MS=20*60*1000, PREWARM_MS=15*60*1000;
function cacheFor(key){if(!caches.has(key))caches.set(key,{url:'',at:0,kind:'',playlist:'',playlistBase:''});return caches.get(key)}
function targetFor(id){
 const parts=id.split(':'); const slug=parts[1]||'de-che-dai-han', ep=parts.slice(2).join(':');
 return ep&&ep.startsWith('tap-') ? `https://cobephim.cfd/phim/${slug}/${ep}` : `https://cobephim.cfd/phim/${slug}`;
}
function decodeBootstrapPayload(obj,url){
 try{
  if(!obj||!obj.iv||!obj.data)return '';
  const iv=Buffer.from(String(obj.iv),'hex');
  const enc=Buffer.from(String(obj.data),'base64');
  if(iv.length!==12||enc.length<17)return '';
  const aad=Buffer.from('stream-bootstrap-v1\n'+url);
  const key=crypto.createHash('sha256').update(aad).digest();
  const tag=enc.subarray(enc.length-16), body=enc.subarray(0,enc.length-16);
  const d=crypto.createDecipheriv('aes-256-gcm',key,iv);
  d.setAAD(aad); d.setAuthTag(tag);
  const out=Buffer.concat([d.update(body),d.final()]).toString('utf8');
  return out;
 }catch(e){console.log('[bootstrap-decode] fail '+e.message);return ''}
}
async function resolveMaster(key,target=targetFor(key)){
 const cached=cacheFor(key);
 if(cached.url && cached.kind==='hls' && Date.now()-cached.at<HLS_FRESH_MS)return cached.url;
 if(cached.url && cached.kind==='decrypted' && cached.playlist && Date.now()-cached.at<20*60*1000)return cached.url;
 if(cached.url && cached.kind==='segments' && Date.now()-cached.at<10*60*1000)return cached.url;
 if(cached.kind==='segments' && Date.now()-cached.at>=10*60*1000){cached.url='';cached.at=0;cached.kind=''}
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-blink-features=AutomationControlled','--autoplay-policy=no-user-gesture-required']});
  const cx=await browser.newContext({userAgent:hdr()['user-agent'],viewport:{width:390,height:844},locale:'vi-VN'});
  await cx.route('**/*',route=>{const u=route.request().url();if(/jwpltx\.com|whos\.amung\.us|google-analytics|googletagmanager|doubleclick|facebook\.com\/tr/i.test(u))return route.abort();return route.continue()});
  await cx.addInitScript(() => {
    try{
      const subtle=crypto.subtle, original=subtle.decrypt.bind(subtle);
      subtle.decrypt=async function(...args){
        const out=await original(...args);
        try{
          const txt=new TextDecoder().decode(out);
          if(txt.includes('#EXTM3U')){
            globalThis.__STREAMC_DECRYPTED={text:txt,base:location.href};
            console.log('__STREAMC_M3U8__'+btoa(unescape(encodeURIComponent(txt))));
          }
        }catch{}
        return out;
      };
    }catch{}
  });
  const p=await cx.newPage(); let found='', segmentFound='', decryptedPlaylist='', decryptedBase=''; const seen=[];
  p.on('console',msg=>{
    const t=msg.text();
    if(t.startsWith('__STREAMC_M3U8__')){
      try{decryptedPlaylist=decodeURIComponent(escape(atob(t.slice(18))));decryptedBase=p.url();console.log('[resolver] decrypted_playlist '+key+' bytes='+decryptedPlaylist.length)}catch{}
    }
  });
  p.on('response',async resp=>{
    try{
      const u=resp.url(), ct=(await resp.headerValue('content-type'))||'';
      if(/embed\d*\.streamc\.xyz/i.test(u)&&(/\.js(?:\?|$)/i.test(u)||/javascript/i.test(ct))){
        const txt=await resp.text().catch(()=> '');
        if(txt){
          const hits=[...txt.matchAll(/.{0,100}(?:ENC-AESGCM|AES-GCM|subtle|decrypt|WebAssembly|Worker|streamaaa|playlist|m3u8).{0,180}/gi)].slice(0,12).map(x=>x[0].replace(/\s+/g,' '));
          if(hits.length)console.log('[streamc-js]',key,new URL(u).pathname,'bytes='+txt.length,JSON.stringify(hits));
        }
      }
      if(/embed\d*\.streamc\.xyz/i.test(u)&&!/\.js(?:\?|$)/i.test(u)&&resp.status()===200){
        const len=Number((await resp.headerValue('content-length'))||0), typ=ct.toLowerCase();
        if(/mpegurl|octet-stream|text\/plain|application\/json/.test(typ)||(!typ&&len<2000000)){
          const b=await resp.body().catch(()=>null);
          if(b){
            const s=b.toString('utf8');
            if(/#EXTM3U|#ENC-AESGCM|AESGCM|streamaaa|m3u8|aesgcm-v1/i.test(s))console.log('[streamc-payload]',key,u.slice(0,220),'ct='+ct,'bytes='+b.length,'head='+JSON.stringify(s.slice(0,500)));
            if(/application\/json/i.test(typ)){
              try{
                const obj=JSON.parse(s), plain=decodeBootstrapPayload(obj,u);
                if(plain){
                  console.log('[bootstrap-decode] '+key+' bytes='+plain.length+' head='+JSON.stringify(plain.slice(0,300)));
                  if(plain.includes('#EXTM3U')){decryptedPlaylist=plain;decryptedBase=u}
                  else{
                    try{
                      const j=JSON.parse(plain);
                      const pl=j.playlist||j.url||j.src||'';
                      if(typeof pl==='string'&&pl){found=pl;cached.url=pl;cached.at=Date.now();cached.kind=/\.m3u8(?:\?|$)/i.test(pl)?'hls':'hls';console.log('[bootstrap-decode] media '+key+' '+pl.slice(0,220))}
                    }catch{}
                  }
                }
              }catch{}
            }
          }
        }
      }
    }catch(e){console.log('[probe-error]',key,e.message)}
  });
  const note=(kind,u)=>{if(/stream|m3u8|player|embed|video|tap-/i.test(u)){seen.push(kind+': '+u);console.log('[resolver]',key,kind,u.slice(0,500))}};
  const capture=u=>{try{const x=new URL(u);if(x.hostname.includes('streamvsmov.com')&&x.pathname.endsWith('/master.m3u8')){found=u;cached.url=u;cached.at=Date.now();cached.kind='hls';console.log('[resolver] preferred_hls '+key)}else if(/\/streamaaa\d+\.png$/i.test(x.pathname)&&!segmentFound){segmentFound=u.replace(/streamaaa\d+\.png.*$/i,'streamaaa{n}.png');console.log('[resolver] segment_fallback_seen '+key+' host='+x.hostname)}}catch{}};
  p.on('request',q=>{note('REQ',q.url());capture(q.url())}); p.on('response',r=>{note('RES '+r.status(),r.url());if(r.status()===200){try{const x=new URL(r.url());if(/\/streamaaa\d+\.png$/i.test(x.pathname)&&!found){segmentFound=r.url().replace(/streamaaa\d+\.png.*$/i,'streamaaa{n}.png');cached.url=segmentFound;cached.at=Date.now();cached.kind='segments';found=segmentFound;console.log('[resolver] segment_200_fast_lock '+key+' host='+x.hostname)}}catch{}}capture(r.url())});
  p.on('framenavigated',fr=>note('FRAME',fr.url()));
  await p.goto(target,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('[resolver] goto timeout '+key+' '+e.message));
  await p.waitForTimeout(1800);
  if(!/\/tap-/.test(new URL(target).pathname)){
   let episode=''; for(const fr of p.frames())try{episode=await fr.locator('a[href*="/tap-"]').evaluateAll(as=>as.map(a=>a.href).find(Boolean)||'');if(episode)break}catch{}
   if(episode){console.log('[resolver] episode_found '+episode);await p.goto(episode,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});await p.waitForTimeout(1200)}
  }
  for(let round=0;round<8&&!found&&!segmentFound;round++){
   for(const fr of p.frames())for(const sel of ['video','button','[class*="play" i]','[id*="play" i]'])try{const es=fr.locator(sel),n=Math.min(await es.count(),8);for(let i=0;i<n&&!found;i++)try{sel==='video'?await es.nth(i).evaluate(v=>{v.muted=true;return v.play()}):await es.nth(i).click({timeout:800})}catch{}}catch{}
   await p.mouse.click(195,420).catch(()=>{});for(let i=0;i<11&&!found&&!segmentFound;i++)await p.waitForTimeout(200);
   if(!decryptedPlaylist){
     for(const fr of p.frames())try{
       const d=await fr.evaluate(()=>globalThis.__STREAMC_DECRYPTED||null);
       if(d?.text){decryptedPlaylist=d.text;decryptedBase=d.base||fr.url();break}
     }catch{}
   }
   if(decryptedPlaylist&&!found)break;
  }
  if(!found&&decryptedPlaylist){
    cached.playlist=decryptedPlaylist;cached.playlistBase=decryptedBase||target;cached.url='decrypted://playlist';cached.at=Date.now();cached.kind='decrypted';
    found=cached.url;console.log('[resolver] using_decrypted_playlist '+key+' bytes='+decryptedPlaylist.length);
  }
  if(!found&&segmentFound){found=segmentFound;cached.url=segmentFound;cached.at=Date.now();cached.kind='segments';console.log('[resolver] using_segment_fallback '+key)}
  if(!found&&!cached.url){console.error('[resolver] media_not_found '+key+' final='+p.url()+' seen='+JSON.stringify(seen.slice(-50)));throw Error('fresh_master_not_found')}
  if(found&&cached.kind==='hls'){cached.url=found;cached.at=Date.now()}
  return cached.url;
 }finally{await browser?.close()}
}
function warm(key=ID,target=targetFor(key)){
 if(warmings.has(key))return warmings.get(key);
 const job=resolveMaster(key,target).catch(e=>{console.error('[warm]',key,e?.stack||e);return ''}).finally(()=>warmings.delete(key));
 warmings.set(key,job); return job;
}
const manifest={id:'community.cobephim.resolver',version:'0.4.27',name:'CobePhim HLS Resolver',description:'CobePhim prefers directly playable StreamVSMov HLS and keeps StreamC only as fallback.',resources:['catalog','meta','stream'],types:['series'],catalogs:[{type:'series',id:'cobephim',name:'CobePhim'}],idPrefixes:['cobephim:']};
const EXTRA_EPISODES=[{episode:101,title:'Tập 01',sub:'tap-770232',dub:''}];
const TEST_EPISODES=[
 {episode:1,title:'Tập 1',sub:'tap-775372',dub:'tap-775376'},
 {episode:2,title:'Tập 2',sub:'tap-775373',dub:'tap-775377'},
 {episode:3,title:'Tập 3',sub:'tap-775374',dub:'tap-780552'},
 {episode:4,title:'Tập 4',sub:'tap-775375',dub:'tap-780553'},
 {episode:5,title:'Tập 5',sub:'tap-780551',dub:'tap-780554'},
 {episode:6,title:'Tập 6',sub:'tap-780574',dub:'tap-780575'}
];
function variantKey(ep,variant){const x=[...TEST_EPISODES,...EXTRA_EPISODES].find(e=>e.episode===ep);if(!x)return '';const tap=variant==='dub'?x.dub:x.sub;return tap?'cobephim:de-che-dai-han:'+tap:''}
const TEST_INFO={
 name:'Đế Chế Đại Hàn',
 altName:'메이드 인 코리아',
 description:'Lấy bối cảnh những năm 1970, Baek Gi Tae là một người đàn ông đầy tham vọng, khao khát giàu sang và quyền lực. Jang Gun Yeong là một công tố viên với bản năng hoang dã và sự ngoan cường đáng sợ. Đối mặt với một vụ án lớn, Jang Gun Yeong dốc toàn lực để ngăn chặn Baek Gi Tae. Những người xung quanh họ bao gồm nhà vận động hành lang Choi Yu Ji, điều tra viên O Ye Jin, Bae Geum Ji và Chánh văn phòng Cheon Seok Jeong.',
 releaseInfo:'2026',
 runtime:'53m',
 country:'Hàn Quốc',
 genres:['Hình Sự','Chính Kịch'],
 cast:['Hyun Bin','Jung Woo-sung','Cha Hee','Lee Se-ho'],
 imdbRating:'9.0',
 status:'Hoàn Tất (6/6)',
 network:'Disney+',
 production:'Hive Media Corp',
 tags:['thriller','1970s','double life']
};
const item=(extra={})=>({id:'cobephim:de-che-dai-han',type:'series',name:TEST_INFO.name,description:TEST_INFO.description,releaseInfo:TEST_INFO.releaseInfo,runtime:TEST_INFO.runtime,country:TEST_INFO.country,genres:TEST_INFO.genres,cast:TEST_INFO.cast,imdbRating:TEST_INFO.imdbRating,...extra});
const SCANNER=(process.env.SCANNER_URL||'https://cobephim-full-scan.onrender.com').replace(/\/$/,'');
let liveCatalog={at:0,metas:[],rows:[]};
let pageArt={at:0,poster:'',background:''};
async function pullPageArt(){
 try{
  if(Date.now()-pageArt.at<30*60*1000&&(pageArt.poster||pageArt.background))return pageArt;
  const z=await fetch(TARGET,{headers:hdr(),redirect:'follow'}); if(!z.ok)throw Error('page '+z.status);
  const h=await z.text();
  const pick=(prop)=>{for(const tag of (h.match(/<meta\b[^>]*>/gi)||[])){if(!tag.toLowerCase().includes(prop.toLowerCase()))continue;const m=tag.match(/content=(?:"([^"]+)"|'([^']+)')/i);if(m)return (m[1]||m[2]||'').replace(/&amp;/g,'&')}return ''};
  const poster=pick('og:image')||pick('twitter:image');
  pageArt={at:Date.now(),poster,background:poster}; console.log('[art] poster='+(poster||'none')); return pageArt;
 }catch(e){console.error('[art]',e.message);return pageArt}
}

async function pullCatalog(){try{if(Date.now()-liveCatalog.at<15000&&liveCatalog.metas.length)return liveCatalog;const z=await fetch(SCANNER+'/',{headers:{'user-agent':hdr()['user-agent']}});if(!z.ok)throw Error('scanner '+z.status);const d=await z.json(),rows=Array.isArray(d.catalog)?d.catalog:[];const metas=rows.filter(x=>x.title).map(x=>({id:'cobephim:'+x.slug,type:'series',name:x.title,poster:x.poster||undefined,description:x.description||undefined,releaseInfo:x.year?String(x.year):undefined}));liveCatalog={at:Date.now(),metas,rows};console.log('[catalog] live movies='+metas.length+' scannerStatus='+d.status);return liveCatalog}catch(e){console.error('[catalog]',e.message);return liveCatalog}}
function send(r,s,o){const b=JSON.stringify(o);r.writeHead(s,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'});r.end(b)}
function hdr(){return {'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1','referer':'https://cobephim.cfd/','origin':'https://cobephim.cfd'}}
function p(kind,url){return BASE+'/proxy/'+kind+'?url='+encodeURIComponent(url)}
async function fetchUp(url){const r=await fetch(url,{headers:hdr(),redirect:'follow'});if(!r.ok){const e=Error('upstream '+r.status);e.status=r.status;throw e}return r}
function invalidateByUrl(url){for(const [k,v] of caches)if(v.url&&v.kind==='segments'&&url.startsWith(v.url.split('{n}')[0])){console.log('[cache] invalidate dead segment source '+k);v.url='';v.at=0;v.kind=''}}
function tsOffset(buf){for(let i=0;i<Math.min(buf.length,1048576);i++){if(buf[i]!==0x47)continue;let ok=true;for(let n=1;n<=4;n++)if(i+n*188>=buf.length||buf[i+n*188]!==0x47){ok=false;break}if(ok)return i}return -1}
async function streamSegment(z,r){
 const reader=z.body?.getReader?.(); if(!reader){const raw=Buffer.from(await z.arrayBuffer()),off=tsOffset(raw),media=off>=0?raw.subarray(off):raw;r.writeHead(200,{'content-type':'video/mp2t','content-length':media.length,'access-control-allow-origin':'*','cache-control':'public,max-age=3600'});return r.end(media)}
 let pending=Buffer.alloc(0),started=false;
 r.on('close',()=>reader.cancel().catch(()=>{}));
 while(true){const {done,value}=await reader.read();if(done)break;const chunk=Buffer.from(value);
  if(!started){pending=Buffer.concat([pending,chunk]);const off=tsOffset(pending);if(off>=0){started=true;r.writeHead(200,{'content-type':'video/mp2t','access-control-allow-origin':'*','cache-control':'public,max-age=3600'});r.write(pending.subarray(off));pending=Buffer.alloc(0)}
   else if(pending.length>=1048576){started=true;r.writeHead(200,{'content-type':'video/mp2t','access-control-allow-origin':'*','cache-control':'public,max-age=3600'});r.write(pending);pending=Buffer.alloc(0)}
  }else r.write(chunk);
 }
 if(!started){r.writeHead(200,{'content-type':'video/mp2t','access-control-allow-origin':'*','cache-control':'public,max-age=3600'});if(pending.length)r.write(pending)}
 r.end();
}
async function route(q,r){try{const u=new URL(q.url,'http://x');
 if(u.pathname==='/'||u.pathname==='/health')return send(r,200,{ok:true,version:manifest.version,manifest:BASE+'/manifest.json',testStream:BASE+'/stream/series/'+encodeURIComponent(ID)+'.json'});
 if(u.pathname==='/manifest.json')return send(r,200,manifest);
 if(u.pathname==='/catalog/series/cobephim.json'){const [lc,art]=await Promise.all([pullCatalog(),pullPageArt()]);const live=lc.rows.find(x=>x.slug==='de-che-dai-han')||{};const test=item({poster:live.poster||art.poster||undefined,background:live.background||live.backdrop||art.background||undefined});const metas=[test,...lc.metas.filter(x=>x.id!==test.id)];return send(r,200,{metas})}
 const m=u.pathname.match(/^\/meta\/series\/(.+)\.json$/);if(m){const mid=decodeURIComponent(m[1]);if(mid==='cobephim:de-che-dai-han'||mid===ID){const [lc,art]=await Promise.all([pullCatalog(),pullPageArt()]);const live=lc.rows.find(x=>x.slug==='de-che-dai-han')||{};return send(r,200,{meta:{...item({poster:live.poster||art.poster||undefined,background:live.background||live.backdrop||art.background||undefined}),videos:[...TEST_EPISODES,...EXTRA_EPISODES].map(e=>({id:'cobephim:de-che-dai-han:episode-'+e.episode,title:e.title,season:2,episode:e.episode}))}})}const lc=await pullCatalog(),slug=mid.replace(/^cobephim:/,'');const row=lc.rows.find(x=>x.slug===slug);return send(r,200,{meta:row?{id:mid,type:'series',name:row.title,poster:row.poster||undefined,description:row.description||undefined,releaseInfo:row.year?String(row.year):undefined,videos:(row.episodes||[]).map((e,i)=>({id:mid+':'+e.id,title:'Tập '+(i+1)}))}:null})}
 const s=u.pathname.match(/^\/stream\/series\/(.+)\.json$/);if(s){const id=decodeURIComponent(s[1]);const em=id.match(/^cobephim:de-che-dai-han:episode-(\d+)$/);if(em){const ep=Number(em[1]),sub=variantKey(ep,'sub'),dub=variantKey(ep,'dub');for(const k of [sub,dub].filter(Boolean)){const c=cacheFor(k);if(!c.url||Date.now()-c.at>=HLS_FRESH_MS)warm(k)}const label=ep===101?'Tập 01':'Tập '+ep;const streams=[];if(sub)streams.push({name:'Phụ đề #1',title:label+' • Phụ đề #1',url:BASE+'/resolve/'+encodeURIComponent(sub)+'.m3u8'});if(dub)streams.push({name:'Thuyết Minh #1',title:label+' • Thuyết Minh #1',url:BASE+'/resolve/'+encodeURIComponent(dub)+'.m3u8'});return send(r,200,{streams})}const old=cacheFor(id);if(!old.url||Date.now()-old.at>=HLS_FRESH_MS)warm(id);return send(r,200,{streams:[{name:'CobePhim',title:old.url?'CobePhim cached fast start':'CobePhim resolver',url:BASE+'/resolve/'+encodeURIComponent(id)+'.m3u8'}]})}
 if(u.pathname.startsWith('/resolve/')){
   const id=decodeURIComponent(u.pathname.slice('/resolve/'.length).replace(/\.m3u8$/,''));
   const cached=cacheFor(id);
   if(!cached.url){
     const job=warm(id);
     await Promise.race([job,new Promise(resolve=>setTimeout(resolve,25000))]);
   }
   if(!cached.url){
     console.log('[resolve] first attempt missed '+id+'; retrying once');
     await warm(id);
   }
   if(!cached.url)throw Error('master_not_ready');
   if(cached.kind==='decrypted'&&cached.playlist){
     const base=cached.playlistBase||targetFor(id);
     const body=cached.playlist.split(/\r?\n/).map(x=>{
       const t=x.trim(); if(!t||t[0]==='#')return x;
       try{return p('segment',new URL(t,base).href)}catch{return x}
     }).join('\n');
     r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});
     return r.end(body)
   }
   if(cached.kind==='segments'){const lines=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-TARGETDURATION:6','#EXT-X-MEDIA-SEQUENCE:0'];for(let i=0;i<1200;i++){lines.push('#EXTINF:4.000,');lines.push(p('segment',cached.url.replace('{n}',String(i).padStart(4,'0'))))}lines.push('#EXT-X-ENDLIST');r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(lines.join('\n'))}
   const master=cached.url,z=await fetchUp(master);let body=await z.text();
   body=body.split(/\r?\n/).map(x=>{const t=x.trim();if(!t||t[0]==='#')return x;try{const abs=new URL(t,master).href;return /streamvsmov\.com|streamvsphim\.top|vsphim\.com/i.test(new URL(abs).hostname)?abs:p('segment',abs)}catch{return x}}).join('\n');
   r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(body)
 }
 if(u.pathname==='/proxy/playlist'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});const z=await fetchUp(up);let body=await z.text();body=body.split(/\r?\n/).map(x=>{const t=x.trim();if(!t||t[0]==='#')return x;try{return p('segment',new URL(t,up).href)}catch{return x}}).join('\n');r.writeHead(200,{'content-type':'application/vnd.apple.mpegurl','access-control-allow-origin':'*','cache-control':'no-store'});return r.end(body)}
 if(u.pathname==='/proxy/segment'){const up=u.searchParams.get('url');if(!up)return send(r,400,{error:'missing_url'});try{const z=await fetchUp(up);return await streamSegment(z,r)}catch(e){if([401,403,404].includes(e.status)){let deadKey='';for(const [k,v] of caches){if(v.url&&v.kind==='segments'&&up.startsWith(v.url.split('{n}')[0]))deadKey=k;else if(v.kind==='decrypted'&&v.playlist&&v.playlist.includes(new URL(up).pathname.split('/').pop()))deadKey=k}console.error('[segment] expired upstream '+e.status+' '+up+' key='+deadKey);if(deadKey){const old=caches.get(deadKey);old.url='';old.at=0;old.kind='';old.playlist='';old.playlistBase='';await warm(deadKey);const fresh=caches.get(deadKey);if(fresh?.kind==='decrypted'&&fresh.playlist){const name=new URL(up).pathname.split('/').pop();const line=fresh.playlist.split(/\r?\n/).find(x=>x.trim()&&!x.startsWith('#')&&x.includes(name));if(line){const freshUrl=new URL(line.trim(),fresh.playlistBase||targetFor(deadKey)).href;console.log('[segment] retry fresh '+name);const z2=await fetchUp(freshUrl);return await streamSegment(z2,r)}}if(fresh?.kind==='segments'&&fresh.url){const m=up.match(/streamaaa(\d+)\.png/i);if(m){const freshUrl=fresh.url.replace('{n}',m[1]);console.log('[segment] retry fresh '+m[1]);const z2=await fetchUp(freshUrl);return await streamSegment(z2,r)}}} }throw e}}
 return send(r,404,{error:'not_found'});
}catch(e){console.error('[route]',q.url,e?.stack||e);return send(r,502,{error:'proxy_failed',message:e.message})}}
function prewarm(){for(const [key,v] of caches)if(v.url&&(v.kind==='hls'||v.kind==='decrypted')&&Date.now()-v.at>=PREWARM_MS)warm(key)}
setInterval(prewarm,60*1000).unref();
http.createServer(route).listen(PORT,'0.0.0.0',()=>{console.log('CobePhim',manifest.version,PORT);warm('cobephim:de-che-dai-han:tap-770232');warm('cobephim:de-che-dai-han:tap-775372');warm('cobephim:de-che-dai-han:tap-775376')});
