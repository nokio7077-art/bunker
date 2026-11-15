import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {GIGACHAT_CA_URL,verifyRootPem,loadGigaChatCA,verifiedGigaChatRequest} from '../gigachat-tls.js';

test('only a valid self-signed root CA is acceptable',()=>{
 assert.match(GIGACHAT_CA_URL,/^https:\/\/gu-st\.ru\/content\/lending\//);
 assert.throws(()=>verifyRootPem('not a certificate'),/Некорректный/);
 assert.throws(()=>verifyRootPem('-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----'),/asn1|header|decode|wrong|certificate|PEM/i);
});
test('a failed official download is rejected and never silently turns off TLS',async()=>{
 await assert.rejects(loadGigaChatCA({env:{},sourceFetch:async()=>({ok:false,status:503})}),/503/);
});
test('GigaChat transport verifies hostname and CA, and rejects arbitrary destinations',async()=>{
 await assert.rejects(verifiedGigaChatRequest('https://example.com',{method:'GET'},{
  loadCA:async()=> 'TEST_CERT'}),/Запрещённый/);
 let used;
 const requestImpl=(target,options,callback)=>{
  used={target,options};
  const req=new EventEmitter();
  req.end=()=>{
   const response=new EventEmitter();
   response.statusCode=200;
   callback(response);
   queueMicrotask(()=>{response.emit('data',Buffer.from('{"answer":1}'));response.emit('end');});
  };
  return req;
 };
 const response=await verifiedGigaChatRequest('https://api.giga.chat/v1/models',{
  method:'POST',headers:{Authorization:'Bearer fake'},body:'{}'
 },{loadCA:async()=> 'CUSTOM_ROOT',requestImpl});
 assert.equal(used.target.hostname,'api.giga.chat');
 assert.equal(used.options.rejectUnauthorized,true);
 assert.equal(typeof used.options.checkServerIdentity,'function');
 assert.ok(used.options.ca.includes('CUSTOM_ROOT'));
 assert.ok(used.options.ca.length>1,'existing system certificates must be preserved');
 assert.deepEqual(await response.json(),{answer:1});
});
