import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createRoomStore} from '../room-storage.js';

test('room checkpoint restores last valid data if primary is corrupt or missing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-store-'));
 try{
  const store=createRoomStore(dir);
  const entry=(round)=>({code:'123456',phase:'turn',round,players:[{id:'p1',name:'Ведущий'}]});
  const rooms=new Map([['123456',entry(1)]]);
  store.save(rooms);
  rooms.set('123456',entry(2));store.save(rooms);
  assert.equal(store.load().get('123456').round,2);
  assert.equal((await stat(join(dir,'rooms.json'))).mode&0o777,0o600);
  assert.equal((await stat(join(dir,'rooms.json.bak'))).mode&0o777,0o600);
  await writeFile(join(dir,'rooms.json'),'{"broken":');
  assert.equal(store.load().get('123456').round,1,'valid backup is recovered');
  assert.equal(store.load().get('123456').round,1,'primary was restored');
  rooms.set('123456',entry(3));store.save(rooms);
  assert.equal(store.load().get('123456').round,3);
  await writeFile(join(dir,'rooms.json'),'BAD');
  await writeFile(join(dir,'rooms.json.bak'),'BAD');
  assert.throws(()=>store.load(),/Повреждены основной файл комнат и резервная копия/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('interrupted partial temp file is ignored when primary checkpoint is valid',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-store-tmp-'));
 try{
  const store=createRoomStore(dir),room={code:'123456',phase:'lobby',players:[{id:'a'}]};
  store.save(new Map([['123456',room]]));
  await writeFile(join(dir,'rooms.json.tmp'),'partial interrupted checkpoint');
  assert.equal(store.load().get('123456').phase,'lobby');
  // Old on-disk format continues to load.
  await writeFile(join(dir,'rooms.json'),JSON.stringify([['123456',room]]));
  assert.equal(store.load().get('123456').players.length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('SIGKILL during an active match leaves the last acknowledged action recoverable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-crash-'));
 let child,base,output='';
 async function start(){
  output='';
  child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),
   env:{...process.env,DATA_DIR:dir,PORT:'0',HOST:'127.0.0.1'},
   stdio:['ignore','pipe','pipe']});
  let stderr='';
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Startup timed out: '+stderr)),10000);
   child.once('error',error=>{clearTimeout(timer);reject(error);});
   child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+': '+stderr));});
   child.stdout.on('data',chunk=>{
    output+=chunk;const match=/port ([0-9]+)/.exec(output);
    if(match){clearTimeout(timer);base='http://127.0.0.1:'+match[1];resolve();}
   });
  });
 }
 async function kill(signal='SIGKILL'){
  if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill(signal);await exited;}
 }
 async function request(path,payload,token){
  const response=await fetch(base+path,{
   method:payload?'POST':'GET',
   headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
   body:payload?JSON.stringify(payload):undefined});
  return {status:response.status,data:await response.json()};
 }
 try{
  await start();
  const host=(await request('/api/rooms',{name:'Ведущий'})).data;
  const path='/api/rooms/'+host.code,people=[host];
  for(let i=2;i<=5;i++){
   const joined=await request(path+'/join',{name:'Игрок '+i});
   assert.equal(joined.status,201);people.push(joined.data);
  }
  assert.equal((await request(path+'/action',{action:'start'},host.token)).status,200);
  const reveal=await request(path+'/action',{action:'reveal',value:'profession'},host.token);
  assert.equal(reveal.status,200);
  const before=(await request(path,undefined,people[1].token)).data;
  assert.equal(before.phase,'turn');
  assert.deepEqual(before.players[0].revealed,['profession']);
  await kill('SIGKILL');
  await start();
  const after=(await request(path,undefined,people[1].token)).data;
  assert.equal(after.phase,before.phase);
  assert.equal(after.round,before.round);
  assert.equal(after.turn,before.turn);
  assert.deepEqual(after.players[0].revealed,before.players[0].revealed);
  assert.equal(after.players.length,5);
  assert.equal(after.players[0].cards.profession,before.players[0].cards.profession);
  const continued=await request(path+'/action',{action:'next'},host.token);
  assert.equal(continued.status,200);
  assert.equal(continued.data.turn,continued.data.players[1].id);
  const file=JSON.parse(await readFile(join(dir,'rooms.json'),'utf8'));
  assert.equal(file.length,1);
  assert.equal(file[0][1].players.length,5);
 }finally{await kill();await rm(dir,{recursive:true,force:true});}
});
