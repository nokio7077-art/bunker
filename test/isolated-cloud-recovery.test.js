import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// Full network integration test using a fake, private Supabase REST endpoint.
// No network request or mutation is made against the production database.
test('a whole room recovers from cloud after losing the complete server disk',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-isolated-cloud-'));
 const secret='sb_secret_isolated_test_only';
 let snapshot=null,writes=0,cloud,child,base;
 const fakeCloud=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/rest/v1/bunker_room_snapshots'||req.headers.apikey!==secret){
   res.writeHead(403);res.end('forbidden');return;
  }
  if(req.method==='GET'){
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify(snapshot?[snapshot]:[]));return;
  }
  if(req.method==='POST'){
   try{
    let body='';
    for await(const data of req)body+=data;
    const data=JSON.parse(body);
    assert.equal(data.id,'active');
    assert.ok(Array.isArray(data.snapshot));
    snapshot={snapshot:data.snapshot,saved_at:data.saved_at};
    writes++;
    res.writeHead(201,{'Content-Type':'application/json'});
    res.end('{}');
   }catch(error){res.writeHead(400);res.end(error.message);}
   return;
  }
  res.writeHead(405);res.end();
 });
 async function startGameServer(){
  child=spawn(process.execPath,['server.js'],{
   cwd:new URL('..',import.meta.url),
   env:{...process.env,DATA_DIR:dir,HOST:'127.0.0.1',PORT:'0',
    SUPABASE_URL:'http://127.0.0.1:'+cloud.address().port,
    SUPABASE_SECRET_KEY:secret},
   stdio:['ignore','pipe','pipe']
  });
  let output='',errors='';
  child.stderr.on('data',part=>errors+=part);
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('Server boot timed out: '+errors)),10000);
   child.once('error',err=>{clearTimeout(timeout);reject(err);});
   child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Server exited '+code+' '+errors));});
   child.stdout.on('data',part=>{
    output+=part;const match=/port ([0-9]+)/.exec(output);
    if(match){clearTimeout(timeout);base='http://127.0.0.1:'+match[1];resolve();}
   });
  });
 }
 async function stopGameServer(){
  if(child&&child.exitCode===null){
   const ended=once(child,'exit');child.kill('SIGKILL');await ended;
  }
 }
 async function api(path,payload,token){
  const res=await fetch(base+path,{
   method:payload?'POST':'GET',
   headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
   body:payload?JSON.stringify(payload):undefined
  });
  return {status:res.status,data:await res.json()};
 }
 async function waitForBackup(check){
  for(let attempt=0;attempt<120;attempt++){
   if(snapshot&&check(snapshot.snapshot))return;
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('Cloud checkpoint was not written');
 }
 try{
  await new Promise(resolve=>cloud=fakeCloud.listen(0,'127.0.0.1',resolve));
  await startGameServer();
  const host=(await api('/api/rooms',{name:'Ведущий'})).data;
  assert.ok(host.token&&host.recoveryCode);
  const path='/api/rooms/'+host.code;
  const guests=[];
  for(let i=2;i<=5;i++){
   const joined=await api(path+'/join',{name:'Игрок '+i});
   assert.equal(joined.status,201);guests.push(joined.data);
  }
  const started=await api(path+'/action',{action:'start'},host.token);
  assert.equal(started.status,200);
  const opened=await api(path+'/action',{action:'reveal',value:'profession'},host.token);
  assert.equal(opened.status,200);
  const before=(await api(path,undefined,guests[0].token)).data;
  assert.equal(before.phase,'turn');
  assert.equal(before.players.length,5);
  assert.ok(before.players[0].revealed.includes('profession'));
  await waitForBackup(rows=>rows.some(([code,room])=>
   code===host.code&&room.players.length===5&&room.phase==='turn'&&
   room.players[0].revealed.includes('profession')));
  assert.ok(writes>=1,'the cloud mock received a snapshot');
  await stopGameServer();
  // Mimic an ephemeral Render host replacement: erase BOTH primary and backup.
  await rm(dir,{recursive:true,force:true});
  await startGameServer();
  const restored=await api(path,undefined,guests[0].token);
  assert.equal(restored.status,200);
  assert.equal(restored.data.phase,before.phase);
  assert.equal(restored.data.round,before.round);
  assert.equal(restored.data.turn,before.turn);
  assert.deepEqual(restored.data.players.map(p=>p.id),before.players.map(p=>p.id));
  assert.deepEqual(restored.data.players[0].revealed,before.players[0].revealed);
  assert.equal((await api(path,undefined,host.token)).status,200,
   'player tokens from cloud checkpoint are accepted');
  const advanced=await api(path+'/action',{action:'next'},host.token);
  assert.equal(advanced.status,200);
  assert.equal(advanced.data.turn,advanced.data.players[1].id);
  const local=JSON.parse(await readFile(join(dir,'rooms.json'),'utf8'));
  assert.equal(local.find(([code])=>code===host.code)[1].turn,advanced.data.turn);
 }finally{
  await stopGameServer();
  if(cloud)await new Promise(resolve=>cloud.close(resolve));
  await rm(dir,{recursive:true,force:true});
 }
});
