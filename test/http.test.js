import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
test('HTTP sessions, privacy, errors and durable restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-test-'));let child,base;
 async function start(){child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let output='';await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server startup timed out')),8000);child.on('error',reject);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/port (\d+)/);if(m){clearTimeout(timeout);base='http://127.0.0.1:'+m[1];resolve();}});child.on('exit',code=>{clearTimeout(timeout);reject(new Error('Server exited: '+code));});});}
 async function stop(){if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done;}}
 async function request(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Connection':'close',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
 try{
  await start();assert.equal((await request('/health')).data.ok,true);
  const solo=(await request('/api/rooms',{name:'Тестировщик'})).data;
  const soloPath='/api/rooms/'+solo.code;
  let demo=await request(soloPath+'/action',{action:'start_test'},solo.token);
  assert.equal(demo.status,200);assert.equal(demo.data.testMode,true);
  assert.equal(demo.data.players.filter(p=>p.bot).length,4);
  await request(soloPath+'/action',{action:'reveal',value:'profession'},solo.token);
  await request(soloPath+'/action',{action:'next'},solo.token);
  demo=await request(soloPath+'/action',{action:'bot_step'},solo.token);
  assert.equal(demo.status,200);assert.equal(demo.data.players[1].revealed[0],'profession');
  assert.equal(Object.keys(demo.data.players[1].cards).length,1);
  const host=(await request('/api/rooms',{name:'Ведущий'})).data;const path='/api/rooms/'+host.code;
  assert.equal((await request(path)).status,401);
  const people=[host];for(let i=2;i<=5;i++)people.push((await request(path+'/join',{name:'Участник '+i})).data);
  assert.equal((await request(path+'/action',{action:'start'},people[1].token)).status,400);
  const started=await request(path+'/action',{action:'start'},host.token);assert.equal(started.data.phase,'turn');
  assert.equal(Object.keys(started.data.players[1].cards).length,0);
  const reveal=await request(path+'/action',{action:'reveal',value:'profession'},host.token);assert.equal(reveal.status,200);
  const guest=(await request(path,undefined,people[1].token)).data;assert.deepEqual(Object.keys(guest.players[0].cards),['profession']);assert.ok(!JSON.stringify(guest).includes(host.token));
  const before=(await request(path,undefined,host.token)).data;
  await stop();await start();const after=(await request(path,undefined,host.token)).data;assert.deepEqual(after,before);
  assert.deepEqual((await request(soloPath,undefined,solo.token)).data,demo.data);
  assert.equal((await request(path+'/join',{name:'Опоздал'})).status,400);
  const page=await fetch(base,{headers:{Connection:'close'}});assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("default-src 'self'"));assert.ok((await page.text()).includes('lang="ru"'));
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
