import http from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join as pathJoin } from 'node:path';
import { randomInt } from 'node:crypto';
import { player, createRoom, join, act, view } from './game.js';
import { specialOptions } from './special-actions.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = process.env.DATA_DIR || pathJoin(root,'.data');
mkdirSync(dataDir,{recursive:true,mode:0o700});
const file=pathJoin(dataDir,'rooms.json');
const rooms=new Map(existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : []);
const save=()=>{writeFileSync(file+'.tmp',JSON.stringify([...rooms]),{mode:0o600});renameSync(file+'.tmp',file);};
const limits=new Map();
function rate(req) { const key=req.socket.remoteAddress; const now=Date.now(); let x=limits.get(key); if(!x || now-x.time>60000) { x={time:now,count:0}; limits.set(key,x); } if(++x.count>120) throw new Error('Слишком много запросов. Подождите минуту.'); }
async function body(req) { let text=''; for await (const chunk of req) {text+=chunk; if(text.length>4096) throw new Error('Слишком большой запрос.');} return JSON.parse(text || '{}'); }
const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
export const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
 try {
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET' && assets[url.pathname]) {const [f,t]=assets[url.pathname];res.writeHead(200,{'Content-Type':t});return res.end(readFileSync(pathJoin(root,'public',f)));}
  if(req.method==='GET' && url.pathname==='/health') return send(200,{ok:true});
  if(!url.pathname.startsWith('/api/')) return send(404,{error:'Не найдено.'});
  if(req.method==='POST') {
   rate(req);
   if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) return send(403,{error:'Недопустимый источник запроса.'});
  }
  if(req.method==='POST' && url.pathname==='/api/rooms') {
   const b=await body(req), p=player(b.name); let code;
   do {code=String(randomInt(100000,1000000));} while(rooms.has(code));
   const room=createRoom(code,p);rooms.set(code,room);save();return send(201,{code,token:p.token});
  }
  const match=url.pathname.match(/^\/api\/rooms\/(\d{6})(?:\/(join|action|special))?$/);
  if(!match) return send(404,{error:'Не найдено.'});
  const room=rooms.get(match[1]);if(!room) return send(404,{error:'Комната не найдена. Проверьте код.'});
  if(req.method==='POST' && match[2]==='join') {const b=await body(req),p=player(b.name);join(room,p);save();return send(201,{code:room.code,token:p.token});}
  const token=req.headers.authorization?.replace(/^Bearer /,''); const me=room.players.find(p=>p.token===token);
  if(!me) return send(401,{error:'Сессия не найдена. Войдите в комнату заново.'});
  if(req.method==='GET' && !match[2]) return send(200,view(room,me));
  if(req.method==='GET' && match[2]==='special') return send(200,specialOptions(room,me));
  if(req.method==='POST' && match[2]==='action') {const b=await body(req);act(room,me,b.action,b.value);save();return send(200,view(room,me));}
  return send(405,{error:'Метод не поддерживается.'});
 } catch(e) {send(400,{error:e instanceof SyntaxError ? 'Некорректный запрос.' : e.message});}
});
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '0.0.0.0',()=>console.log(`Bunker listening on port ${server.address().port}`));
