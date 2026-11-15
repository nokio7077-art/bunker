import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCloudRoomBackup} from '../cloud-room-backup.js';

const env={SUPABASE_URL:'https://testing.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test_only'};
const room=(round)=>({code:'123456',phase:'turn',round,players:[{id:'host',token:'secret-token'}]});
const response=(body=[])=>({ok:true,status:200,json:async()=>body});

test('without Supabase credentials game stays fully local',async()=>{
 const b=createCloudRoomBackup({env:{},logger:{warn:()=>{},info:()=>{}}});
 const rooms=new Map([['123456',room(1)]]);
 assert.equal(b.enabled,false);
 assert.equal(await b.restore(rooms,'/not/a/real/path'),rooms);
 assert.equal(await b.persist([...rooms]),false);
});

test('cloud writes are serialized, preserve private snapshot and use secret header',async()=>{
 const calls=[],pending=[];
 const fetchImpl=(url,options)=>new Promise(resolve=>{
  calls.push({url,options});
  pending.push(resolve);
 });
 const b=createCloudRoomBackup({env,fetchImpl,now:()=>10000,logger:{warn:()=>{},info:()=>{}}});
 const first=[['123456',room(1)]],second=[['123456',room(2)]];
 const saving1=b.persist(first);
 const saving2=b.persist(second);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,1,'second write waits for first');
 assert.equal(calls[0].options.headers.apikey,env.SUPABASE_SECRET_KEY);
 assert.equal(calls[0].options.headers.Authorization,undefined);
 assert.equal(JSON.parse(calls[0].options.body).snapshot[0][1].round,1);
 assert.equal(JSON.parse(calls[0].options.body).snapshot[0][1].players[0].token,'secret-token');
 pending.shift()(response());
 assert.equal(await saving1,true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,2);
 assert.equal(JSON.parse(calls[1].options.body).snapshot[0][1].round,2);
 pending.shift()(response());
 assert.equal(await saving2,true);
});

test('cloud restoration recovers rooms if local storage is missing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-cloud-'));
 try{
  const calls=[];
  const backup=createCloudRoomBackup({
   env,
   now:()=>15000,
   logger:{warn:()=>{},info:()=>{}},
   fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return response([{snapshot:[['123456',room(7)]],saved_at:13000}]);
   }
  });
  const local=new Map();
  const restored=await backup.restore(local,dir);
  assert.equal(restored.get('123456').round,7);
  assert.equal(restored.get('123456').players[0].token,'secret-token');
  assert.match(calls[0].url,/select=snapshot,saved_at/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('newer local checkpoint beats stale cloud snapshot',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-cloud-local-'));
 try{
  const local=new Map([['123456',room(9)]]);
  await writeFile(join(dir,'rooms.json'),JSON.stringify([...local]));
  const modified=(await stat(join(dir,'rooms.json'))).mtimeMs;
  const backup=createCloudRoomBackup({
   env,logger:{warn:()=>{},info:()=>{}},
   fetchImpl:async()=>response([{snapshot:[['123456',room(2)]],saved_at:modified-10000}])
  });
  assert.equal(await backup.restore(local,dir),local);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('invalid cloud snapshots never overwrite local rooms',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-cloud-bad-'));
 try{
  const local=new Map([['123456',room(4)]]),warnings=[];
  const backup=createCloudRoomBackup({
   env,logger:{warn:(...args)=>warnings.push(args),info:()=>{}},
   fetchImpl:async()=>response([{snapshot:[['bad',room(7)]],saved_at:Date.now()+300000}])
  });
  assert.equal(await backup.restore(local,dir),local);
  assert.equal(warnings.length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('temporary cloud outage does not block local actions',async()=>{
 const warnings=[];
 let attempts=0,t=10000;
 const backup=createCloudRoomBackup({
  env,now:()=>t,logger:{warn:(...args)=>warnings.push(args),info:()=>{}},
  fetchImpl:async()=>{attempts++;throw Error('network is offline');}
 });
 assert.equal(await backup.persist([['123456',room(1)]]),false);
 assert.equal(attempts,1);
 assert.equal(await backup.persist([['123456',room(2)]]),false);
 assert.equal(attempts,1,'backoff prevents request storm');
 t+=16000;
 assert.equal(await backup.persist([['123456',room(3)]]),false);
 assert.equal(attempts,2);
 assert.equal(warnings.length,2);
});
