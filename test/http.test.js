import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { disasterImages } from '../public/card-images.js';
import { disasters } from '../world.js';
test('HTTP sessions, private cards, registered artwork, caching and durable restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-test-'));let child,base;
 async function start(){child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let output='';await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server startup timed out')),8000);child.on('error',reject);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/port (\d+)/);if(m){clearTimeout(timeout);base='http://127.0.0.1:'+m[1];resolve();}});child.on('exit',code=>{clearTimeout(timeout);reject(new Error('Server exited: '+code));});});}
 async function stop(){if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done;}}
 async function request(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Connection':'close',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
 try{
  await start();assert.equal((await request('/health')).data.ok,true);
  assert.deepEqual(Object.keys(disasterImages).map(Number).sort((a,b)=>a-b),disasters.map(d=>d.id).sort((a,b)=>a-b));
  for(const disaster of disasters){
   const image=disasterImages[disaster.id];assert.equal(image.name,disaster.name);
   const response=await fetch(base+image.src,{headers:{Connection:'close'}});
   assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
   const bytes=Buffer.from(await response.arrayBuffer());
   assert.deepEqual(bytes,await readFile(new URL('../public'+image.src,import.meta.url)));
   assert.equal(bytes.readUInt32BE(16),image.width);assert.equal(bytes.readUInt32BE(20),image.height);
   assert.equal(Number(response.headers.get('content-length')),bytes.length);
  }
  const imagePath=disasterImages[1].src;
  const head=await fetch(base+imagePath,{method:'HEAD',headers:{Connection:'close'}});
  assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  const cached=await fetch(base+imagePath,{headers:{Connection:'close','If-None-Match':head.headers.get('etag')}});
  assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
  for(const path of ['/images/cards/disasters/999.png','/images/cards/disasters/01.png','/images/cards/disasters/%2e%2e/%2e%2e/%2e%2e/server.js','/images/cards/disasters/%2e%2e%2f%2e%2e%2f.data%2frooms.json','/.data/rooms.json','/1.png']){
   assert.equal((await request(path)).status,404,path);
  }
  const imageModule=await fetch(base+'/card-images.js',{headers:{Connection:'close'}});
  assert.equal(imageModule.status,200);assert.match(await imageModule.text(),/export const disasterImages/);
  for(const [path,type] of [['/images/ui/bunker-landscape.png','image/png'],['/fonts/RubikMonoOne-Regular.ttf','font/ttf']]){
   const response=await fetch(base+path,{headers:{Connection:'close'}});
   assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),type);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(new URL('../public'+path,import.meta.url)));
  }
  const theme=await fetch(base+'/theme.css',{headers:{Connection:'close'}});
  assert.equal(theme.status,200);assert.match(theme.headers.get('content-type'),/text\/css/);assert.match(await theme.text(),/\.landing-shell/);
  // Safari and mobile browsers request byte ranges for MP4 playback and looping.
  const videoPath='/videos/bunker-entrance.mp4',videoBytes=await readFile(new URL('../public'+videoPath,import.meta.url));
  const videoHead=await fetch(base+videoPath,{method:'HEAD'});
  assert.equal(videoHead.headers.get('content-type'),'video/mp4');
  assert.equal(videoHead.headers.get('accept-ranges'),'bytes');
  assert.equal(Number(videoHead.headers.get('content-length')),videoBytes.length);
  for(const [range,start,end] of [['bytes=0-1',0,1],['bytes=100-',100,videoBytes.length-1],['bytes=-32',videoBytes.length-32,videoBytes.length-1],['bytes=0-999999999',0,videoBytes.length-1]]){
   const response=await fetch(base+videoPath,{headers:{Range:range}});
   assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/${videoBytes.length}`);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),videoBytes.subarray(start,end+1));
  }
  for(const range of ['bytes=9-2','bytes=-0','bytes=999999999-','bytes=0-1,5-9','bytes=-','garbage']){
   const response=await fetch(base+videoPath,{headers:{Range:range}});
   assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),`bytes */${videoBytes.length}`);await response.arrayBuffer();
  }
  const fullVideo=await fetch(base+videoPath,{headers:{Range:'bytes=0-1','If-Range':'"stale"'}});
  assert.equal(fullVideo.status,200);assert.deepEqual(Buffer.from(await fullVideo.arrayBuffer()),videoBytes);
  const cachedVideo=await fetch(base+videoPath,{headers:{'If-None-Match':videoHead.headers.get('etag')}});assert.equal(cachedVideo.status,304);
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
