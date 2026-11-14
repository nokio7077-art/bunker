import http from 'node:http';
import { getLocalIpv4, startLocalMdns } from './local-network.js';
import { readFileSync, mkdirSync, writeFileSync, renameSync, existsSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join as pathJoin } from 'node:path';
import { randomInt, randomBytes } from 'node:crypto';
import { player, createRoom, join, act, view, advanceRoom } from './game.js';
import { specialOptions } from './special-actions.js';
import { disasterImages, landscapeImage } from './public/card-images.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = process.env.DATA_DIR || pathJoin(root,'.data');
mkdirSync(dataDir,{recursive:true,mode:0o700});
const file=pathJoin(dataDir,'rooms.json');
const rooms=new Map(existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : []);
let postgres=null,writeQueue=Promise.resolve();
async function initPersistentRooms(){
 if(!process.env.DATABASE_URL)return;
 const {Pool}=await import('pg');
 postgres=new Pool({connectionString:process.env.DATABASE_URL,max:3,
  ...(process.env.DATABASE_SSL==='require'?{ssl:{rejectUnauthorized:true}}:{})});
 await postgres.query('CREATE TABLE IF NOT EXISTS bunker_room_state (key TEXT PRIMARY KEY, snapshot JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
 const stored=await postgres.query("SELECT snapshot FROM bunker_room_state WHERE key='rooms'");
 if(stored.rows.length){
  rooms.clear();
  for(const [code,room] of stored.rows[0].snapshot)rooms.set(code,room);
 }else if(rooms.size){
  await postgres.query("INSERT INTO bunker_room_state(key,snapshot) VALUES('rooms',$1::jsonb)",[JSON.stringify([...rooms])]);
 }
 console.log('Bunker rooms: PostgreSQL persistent storage active.');
}
// Existing rooms predate the explicit idle clock; preserve their last real event.
for(const room of rooms.values())if(!room.lastActivityAt)room.lastActivityAt=room.updated||Date.now();
// On deployment, clamp previously issued five-minute turns to the new 3:16 maximum.
for(const room of rooms.values())if(room.phase==='turn'&&room.turnDeadline){room.turnDeadline=Math.min(room.turnDeadline,Date.now()+196000);}
// A PostgreSQL instance with DATABASE_URL is durable across Render redeploys.
// Without it local file storage is safe only on a persistent disk, not on free ephemeral hosts.
const save=()=>{
 if(!postgres){
  writeFileSync(file+'.tmp',JSON.stringify([...rooms]),{mode:0o600});
  renameSync(file+'.tmp',file);
  return Promise.resolve();
 }
 const data=JSON.stringify([...rooms]);
 const operation=writeQueue.then(()=>postgres.query(
  "INSERT INTO bunker_room_state(key,snapshot,updated_at) VALUES('rooms',$1::jsonb,now()) ON CONFLICT(key) DO UPDATE SET snapshot=EXCLUDED.snapshot, updated_at=now()",
  [data]));
 writeQueue=operation.catch(error=>{console.error('Persistent storage write failed:',error);});
 return operation;
};
// Idle room expiration depends on actual player activity, not automatic timer actions.
const IDLE_LOBBY_MS=24*60*60*1000,IDLE_FINISHED_MS=24*60*60*1000,IDLE_GAME_MS=72*60*60*1000;
function cleanupRooms(now=Date.now()){
 let changed=false;
 for(const [code,room] of rooms){
  const ttl=room.phase==='lobby'?IDLE_LOBBY_MS:room.phase==='finished'?IDLE_FINISHED_MS:IDLE_GAME_MS;
  if(now-(room.lastActivityAt??room.updated??now)>=ttl){rooms.delete(code);changed=true;}
 }
 return changed;
}
await initPersistentRooms();
let maintenanceTicks=0;
const maintenance=setInterval(async()=>{
 try{
  const now=Date.now();
  let changed=false;
  for(const room of rooms.values())if(advanceRoom(room,now))changed=true;
  if(++maintenanceTicks%60===0 && cleanupRooms(now))changed=true;
  if(changed)await save();
 }catch(e){console.error('Bunker maintenance:',e);}
},1000);
maintenance.unref();
const limits=new Map();
function rate(req) { const key=req.socket.remoteAddress; const now=Date.now(); let x=limits.get(key); if(!x || now-x.time>60000) { x={time:now,count:0}; limits.set(key,x); } if(++x.count>120) throw new Error('Слишком много запросов. Подождите минуту.'); }
async function body(req) { let text=''; for await (const chunk of req) {text+=chunk; if(text.length>4096) throw new Error('Слишком большой запрос.');} return JSON.parse(text || '{}'); }
const assets={'/vendor/qrcode.js':['vendor/qrcode.js','text/javascript; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/card-images.js':['card-images.js','text/javascript; charset=utf-8'],'/avatar-generator.js':['avatar-generator.js','text/javascript; charset=utf-8'],'/avatar-atlases.js':['avatar-atlases.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/theme.css':['theme.css','text/css; charset=utf-8'],'/game-pixel.css':['game-pixel.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
// Only registered media and fonts are public; never serve arbitrary repository files.
const binaryAssets=new Map(Object.values(disasterImages).map(image=>[image.src,{path:pathJoin(root,'public',image.src),type:'image/png'}]));
for(const gender of ['female','male']){const name=`avatars-${gender}-96.webp`;binaryAssets.set(`/images/ui/${name}`,{path:pathJoin(root,'public','images','ui',name),type:'image/webp',immutable:true});}
for(const gender of ['female','male']){const name=`avatars-${gender}-92.webp`;binaryAssets.set(`/images/ui/${name}`,{path:pathJoin(root,'public','images','ui',name),type:'image/webp',immutable:true});}
// Lossless portraits are served in 50-character chunks. Explicitly whitelist each asset.
for(const gender of ['female','male'])for(let part=1;part<=6;part++){
 const name=`avatars-${gender}-144-part-${String(part).padStart(2,'0')}.webp`;
 binaryAssets.set(`/images/ui/${name}`,{path:pathJoin(root,'public','images','ui',name),type:'image/webp',immutable:true});
}
binaryAssets.set('/images/ui/bunker-header.webp',{path:pathJoin(root,'public','images','ui','bunker-header.webp'),type:'image/webp',immutable:true});
for(const asset of ['dossier-avatar.svg','dossier-icons.svg'])binaryAssets.set(`/images/ui/${asset}`,{path:pathJoin(root,'public','images','ui',asset),type:'image/svg+xml'});
for(const category of ['profession','health','luggage','phobia','hobby','biology','personality','interesting','special']){const asset=`dossier-${category}.svg`;binaryAssets.set(`/images/ui/${asset}`,{path:pathJoin(root,'public','images','ui',asset),type:'image/svg+xml'});}
for(const image of Object.values(disasterImages))binaryAssets.set(image.webp,{path:pathJoin(root,'public',image.webp),type:'image/webp',immutable:true});
binaryAssets.set(landscapeImage,{path:pathJoin(root,'public',landscapeImage),type:'image/webp',immutable:true});
// Four responsive still-image endings. Only explicitly listed files may be served.
for(const suffix of ['', '-mobile'])for(const kind of ['survived','out']){
 const url=`/images/endings/ending-${kind}${suffix}.png`;
 binaryAssets.set(url,{path:pathJoin(root,'public',url),type:'image/png'});
}
for(const name of ['ending-survived','ending-out','ending-survived-mobile','ending-out-mobile'])binaryAssets.set(`/images/endings/${name}.webp`,{path:pathJoin(root,'public','images','endings',`${name}.webp`),type:'image/webp'});
for(const [url,type] of [['/images/ui/bunker-landscape.png','image/png'],['/fonts/RubikMonoOne-Regular.ttf','font/ttf'],['/videos/bunker-entrance.mp4','video/mp4'],['/videos/ending-out-mobile.mp4','video/mp4'],['/videos/ending-survived-mobile.mp4','video/mp4'],['/images/ui/ending-out-mobile.webp','image/webp'],['/images/ui/ending-survived-mobile.webp','image/webp'],['/videos/ending-out.mp4','video/mp4'],['/videos/ending-survived.mp4','video/mp4'],['/images/ui/ending-out.webp','image/webp'],['/images/ui/ending-survived.webp','image/webp']])binaryAssets.set(url,{path:pathJoin(root,'public',url),type});
export const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Server-Time',String(Date.now())); res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
 try {
  const url=new URL(req.url,'http://localhost');
  if((req.method==='GET'||req.method==='HEAD') && binaryAssets.has(url.pathname)) {
   const {path,type,immutable}=binaryAssets.get(url.pathname);
   if(!existsSync(path)) return send(404,{error:'Файл оформления не найден.'});
   const stat=statSync(path), etag=`"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
   res.setHeader('Cache-Control',immutable?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate');res.setHeader('ETag',etag);
   if(type==='video/mp4')res.setHeader('Accept-Ranges','bytes');
   if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end();}
   if(type==='video/mp4'&&req.method==='GET'&&req.headers.range&&(!req.headers['if-range']||req.headers['if-range']===etag)){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    let start=0,end=stat.size-1;
    if(match&&(match[1]||match[2])){
     if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}
     else start=Math.max(0,stat.size-Number(match[2]));
    }else start=NaN;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}
    res.writeHead(206,{'Content-Type':type,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${stat.size}`});
    const stream=createReadStream(path,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy()).pipe(res);return;
   }
   res.writeHead(200,{'Content-Type':type,'Content-Length':stat.size});
   if(req.method==='HEAD')return res.end();
   const stream=createReadStream(path);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy()).pipe(res);return;
  }
  if(req.method==='GET' && assets[url.pathname]) {const [f,t]=assets[url.pathname];res.writeHead(200,{'Content-Type':t});return res.end(readFileSync(pathJoin(root,'public',f)));}
  if(req.method==='GET' && url.pathname==='/api/local-link') {
   const ip=getLocalIpv4();
   return send(200,{localOrigin:ip?`http://${ip}:${server.address().port}`:null,mdnsOrigin:process.env.BUNKER_MDNS==='1'?'http://bunker.local:'+server.address().port:null});
  }
  if(req.method==='GET' && url.pathname==='/health') return send(200,{ok:true,persistence:postgres?'postgres':'local',uiVersion:'20261113-timer-v7'});
  if(!url.pathname.startsWith('/api/')) return send(404,{error:'Не найдено.'});
  if(req.method==='POST') {
   rate(req);
   if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) return send(403,{error:'Недопустимый источник запроса.'});
  }
  if(req.method==='POST' && url.pathname==='/api/rooms') {
   if(cleanupRooms())await save();
   if(rooms.size>=500)return send(503,{error:'Временно достигнут лимит комнат. Попробуйте позже.'});
   const b=await body(req), p=player(b.name); let code;
   do {code=String(randomInt(100000,1000000));} while(rooms.has(code));
   const room=createRoom(code,p);room.lastActivityAt=Date.now();rooms.set(code,room);await save();return send(201,{code,token:p.token,recoveryCode:p.recoveryCode});
  }
  const match=url.pathname.match(/^\/api\/rooms\/(\d{6})(?:\/(join|action|special|recover))?$/);
  if(!match) return send(404,{error:'Не найдено.'});
  const room=rooms.get(match[1]);if(!room) return send(404,{error:'Комната не найдена. Проверьте код.'});
  if(req.method==='POST' && match[2]==='join') {
   const b=await body(req),p=player(b.name);join(room,p);room.lastActivityAt=Date.now();await save();
   return send(201,{code:room.code,token:p.token,recoveryCode:p.recoveryCode});
  }
  if(req.method==='POST' && match[2]==='recover'){
   const b=await body(req);
   const name=String(b.name??'').trim().toLowerCase(),recoveryCode=String(b.recoveryCode??'').trim().toLowerCase();
   const found=room.players.find(p=>!p.bot&&p.name.toLowerCase()===name&&p.recoveryCode===recoveryCode);
   if(!found || !/^[0-9a-f]{24}$/.test(recoveryCode))return send(403,{error:'Неверное имя или резервный код восстановления.'});
   found.token=randomBytes(18).toString('hex');found.lastSeen=Date.now();room.lastActivityAt=Date.now();await save();
   return send(200,{code:room.code,token:found.token,recoveryCode:found.recoveryCode});
  }
  const token=req.headers.authorization?.replace(/^Bearer /,''); const me=room.players.find(p=>p.token===token);
  if(!me) return send(401,{error:'Сессия не найдена. Используйте резервный код для восстановления роли.'});
  const now=Date.now();
  // Save heartbeats periodically, but not on every 1.5-second client poll.
  let changed=false;
  if(!me.recoveryCode){me.recoveryCode=randomBytes(12).toString('hex');changed=true;}
  if(!me.lastSeen || now-me.lastSeen>=15000){me.lastSeen=now;changed=true;}
  if(advanceRoom(room,now))changed=true;
  if(changed)await save();
  if(req.method==='GET' && !match[2]) return send(200,view(room,me));
  if(req.method==='GET' && match[2]==='special') return send(200,specialOptions(room,me));
  if(req.method==='POST' && match[2]==='action') {
   const b=await body(req);act(room,me,b.action,b.value);
   me.lastSeen=Date.now();room.lastActivityAt=Date.now();await save();
   return send(200,view(room,me));
  }
  return send(405,{error:'Метод не поддерживается.'});
 } catch(e) {send(400,{error:e instanceof SyntaxError ? 'Некорректный запрос.' : e.message});}
});
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '0.0.0.0',()=>{
 console.log(`Bunker listening on port ${server.address().port}`);
 if(process.env.BUNKER_MDNS==='1')startLocalMdns();
});
