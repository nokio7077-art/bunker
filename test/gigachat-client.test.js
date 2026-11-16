import test from 'node:test';
import assert from 'node:assert/strict';
import {createGigaChat} from '../gigachat-client.js';

const ok=(data)=>({ok:true,status:200,json:async()=>data});
test('disabled GigaChat client never sends network requests',async()=>{
 const client=createGigaChat({env:{},fetchImpl:()=>{throw Error('network should not run');}});
 assert.equal(client.enabled,false);
 await assert.rejects(client.generate([{role:'user',content:'test'}]),/not configured/);
});
test('GigaChat exchanges a Basic authorization key, caches OAuth token and serializes generations',async()=>{
 const calls=[],times=[];let clock=Date.now(),active=0,maxActive=0;
 const client=createGigaChat({env:{GIGACHAT_AUTH_KEY:'SECRET_TEST_KEY'},now:()=>clock,fetchImpl:async(url,options)=>{
  calls.push({url,headers:options.headers,body:options.body});
  assert.equal(options.signal.aborted,false);
  if(url.includes('/oauth')){
   assert.equal(options.headers.Authorization,'Basic SECRET_TEST_KEY');
   assert.equal(options.headers.RqUID.length,36);
   assert.equal(options.body,'scope=GIGACHAT_API_PERS');
   return ok({access_token:'TOKEN_TEST',expires_at:Math.floor((clock+1800000)/1000)});
  }
  assert.equal(options.headers.Authorization,'Bearer TOKEN_TEST');
  assert.equal(JSON.parse(options.body).max_tokens,650);
  active++;maxActive=Math.max(maxActive,active);
  await new Promise(r=>setTimeout(r,8));
  active--;
  return ok({choices:[{message:{content:'{"reply":"Помогу команде!"}'}}]});
 }});
 const result=await Promise.all([client.generate([{role:'user',content:'a'}]),
  client.generate([{role:'user',content:'b'}])]);
 assert.equal(result.length,2);
 assert.equal(maxActive,1,'Freemium must never receive concurrent requests');
 assert.equal(calls.filter(c=>c.url.includes('/oauth')).length,1);
 assert.equal(calls.filter(c=>c.url.includes('/chat/completions')).length,2);
 assert.equal(JSON.stringify(calls).includes('GIGACHAT_AUTH_KEY'),false);
});
test('the auth key is never interpreted as a Bearer token',async()=>{
 let basic=false;
 const client=createGigaChat({env:{GIGACHAT_AUTH_KEY:'Basic ENCODED'},fetchImpl:async(url,options)=>{
  if(url.includes('/oauth')){basic=options.headers.Authorization==='Basic ENCODED';return ok({access_token:'t',expires_at:Date.now()+1800000});}
  return ok({choices:[{message:{content:'ok'}}]});
 }});
 await client.generate([{role:'user',content:'ping'}]);
 assert.equal(basic,true);
});
test('provider errors reject cleanly and a queued subsequent request can recover',async()=>{
 let n=0;
 const client=createGigaChat({env:{GIGACHAT_AUTH_KEY:'x'},fetchImpl:async(url)=>{
  if(url.includes('/oauth'))return ok({access_token:'t',expires_at:Date.now()+1800000});
  return ++n===1?{ok:false,status:429}:ok({choices:[{message:{content:'hi'}}]});
 }});
 await assert.rejects(client.generate([]),/429/);
 assert.equal(await client.generate([]),'hi');
});
