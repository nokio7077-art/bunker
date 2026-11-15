import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('network multiplayer: five clients, polling, disconnect, recover and subsequent votes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-multiplayer-'));
 let child,base;
 async function start(){
  child=spawn(process.execPath,['server.js'],{
   cwd:new URL('..',import.meta.url),
   env:{...process.env,DATA_DIR:dir,HOST:'127.0.0.1',PORT:'0'},
   stdio:['ignore','pipe','pipe']
  });
  let out='',err='';
  child.stderr.on('data',chunk=>{err+=chunk;});
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Server startup timeout: '+err)),10000);
   child.once('error',error=>{clearTimeout(timer);reject(error);});
   child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited: '+code+' '+err));});
   child.stdout.on('data',chunk=>{
    out+=chunk;
    const match=/port (\d+)/.exec(out);
    if(match){clearTimeout(timer);base='http://127.0.0.1:'+match[1];resolve();}
   });
  });
 }
 async function stop(){
  if(child&&!child.killed&&child.exitCode===null){
   const exiting=once(child,'exit');child.kill();await exiting;
  }
 }
 async function req(path,body,token,options={}){
  const response=await fetch(base+path,{
   method:body?'POST':'GET',
   headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers},
   body:body?JSON.stringify(body):undefined,
   signal:options.signal
  });
  return {status:response.status,data:await response.json()};
 }
 try{
  await start();
  const host=(await req('/api/rooms',{name:'Ведущий'})).data,roomPath='/api/rooms/'+host.code;
  const players=[host];
  for(let i=2;i<=5;i++){
   const joined=await req(roomPath+'/join',{name:'Игрок '+i});
   assert.equal(joined.status,201);
   players.push(joined.data);
  }
  const sessions=await Promise.all(players.map(p=>req(roomPath,undefined,p.token)));
  assert.ok(sessions.every(x=>x.status===200));
  assert.ok(sessions.every(x=>x.data.players.length===5));
  assert.ok(sessions.every(x=>x.data.phase==='lobby'));

  assert.equal((await req(roomPath+'/action',{action:'start'},host.token)).status,200);
  const begun=await Promise.all(players.map(p=>req(roomPath,undefined,p.token)));
  const initial=begun[0].data;
  assert.ok(begun.every(x=>x.status===200&&x.data.turn===initial.turn&&x.data.round===1));
  assert.ok(begun.every(x=>x.data.disaster.id===initial.disaster.id));
  for(const [i,observer] of begun.entries()){
   for(const [j,p] of observer.data.players.entries()){
    if(i!==j)assert.deepEqual(p.cards,{},'unrevealed opponent cards stay private');
   }
  }

  // Simulate a participant losing connectivity: no requests while others play.
  const absent=players[4];
  for(let i=0;i<4;i++){
   const p=players[i];
   assert.equal((await req(roomPath+'/action',{action:'reveal',value:'profession'},p.token)).status,200);
   assert.equal((await req(roomPath+'/action',{action:'next'},p.token)).status,200);
  }
  const snapshotBefore=(await req(roomPath,undefined,absent.token)).data;
  assert.equal(snapshotBefore.round,1);
  assert.equal(snapshotBefore.turn,snapshotBefore.players[4].id);
  assert.equal(snapshotBefore.players.slice(0,4).filter(p=>p.revealed.includes('profession')).length,4);
  assert.equal((await req(roomPath+'/action',{action:'reveal',value:'profession'},absent.token)).status,200);
  assert.equal((await req(roomPath+'/action',{action:'next'},absent.token)).status,200);
  const synchronized=await Promise.all(players.map(p=>req(roomPath,undefined,p.token)));
  assert.ok(synchronized.every(x=>x.data.round===2&&x.data.turn===initial.players[0].id));

  // Revoke the old browser token and recover the same seat without creating
  // a sixth participant. Other four sessions stay authenticated.
  const recovered=await req(roomPath+'/recover',{name:'Игрок 5',recoveryCode:absent.recoveryCode});
  assert.equal(recovered.status,200);
  assert.notEqual(recovered.data.token,absent.token);
  assert.equal((await req(roomPath,undefined,absent.token)).status,401);
  const restored=await req(roomPath,undefined,recovered.data.token);
  assert.equal(restored.status,200);
  assert.equal(restored.data.me,initial.players[4].id);
  assert.equal(restored.data.players.length,5);
  assert.equal(restored.data.round,2);
  assert.equal((await req(roomPath,undefined,players[2].token)).status,200);
  players[4]=recovered.data;

  // Finish every turn of the next three rounds. Each client polls the same
  // authoritative state; room capacity and cast must remain stable.
  let guard=0;
  while(guard++<80&& (await req(roomPath,undefined,host.token)).data.phase!=='finished'){
   const poll=await req(roomPath,undefined,host.token);assert.equal(poll.status,200,JSON.stringify(poll.data));
   const current=poll.data;
   if(current.phase==='turn'){
    const actor=players.find((p,i)=>current.players[i].id===current.turn);
    assert.ok(actor);
    const ownPoll=await req(roomPath,undefined,actor.token);assert.equal(ownPoll.status,200,JSON.stringify(ownPoll.data));
   const own=ownPoll.data;
    if(!own.opened){
     const card=Object.keys(own.players.find(p=>p.id===own.me).cards).find(k=>k!=='special'&&!own.players.find(p=>p.id===own.me).revealed.includes(k));
     if(card)assert.equal((await req(roomPath+'/action',{action:'reveal',value:card},actor.token)).status,200);
    }
    assert.equal((await req(roomPath+'/action',{action:'next'},actor.token)).status,200);
   }else if(current.phase==='tie_discussion'){
    assert.equal((await req(roomPath+'/action',{action:'start_revote'},host.token)).status,200);
   }else if(current.phase==='vote'){
    const candidates=current.players.filter(p=>p.alive&&(!current.revoteCandidates||current.revoteCandidates.includes(p.id)));
    for(let i=0;i<players.length;i++){
     const voter=current.players[i], target=candidates.find(p=>p.id!==voter.id);
     assert.ok(target);
     const voted=await req(roomPath+'/action',{action:'vote',value:target.id},players[i].token);
     assert.equal(voted.status,200);
    }
   }else throw Error('Unexpected game phase '+current.phase);
  }
  const ended=await Promise.all(players.map(p=>req(roomPath,undefined,p.token)));
  assert.ok(guard<80,'full network session completed');
  assert.ok(ended.every(x=>x.status===200&&x.data.phase==='finished'));
  assert.ok(ended.every(x=>x.data.players.filter(p=>p.alive).length===2));
  assert.ok(ended.every(x=>x.data.players.length===5));

  await stop();await start();
  const afterRestart=await req(roomPath,undefined,recovered.data.token);
  assert.equal(afterRestart.status,200);
  assert.equal(afterRestart.data.phase,'finished');
  assert.equal(afterRestart.data.players.length,5);
  assert.equal((await req(roomPath,undefined,absent.token)).status,401);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
