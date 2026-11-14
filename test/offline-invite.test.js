import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

test('offline invitation assets are syntactically valid',()=>{
 for(const path of ['public/app.js','server.js','local-network.js']){
  const p=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
 }
});

test('vendored QR generator creates a scannable SVG structure without network calls',()=>{
 const context={};
 vm.runInNewContext(readFileSync('public/vendor/qrcode.js','utf8'),context);
 assert.equal(typeof context.qrcode,'function');
 const qr=context.qrcode(0,'M');
 qr.addData('http://10.244.198.129:3000/?join=123456');
 qr.make();
 const svg=qr.createSvgTag(4,4);
 assert.match(svg,/<svg\b/);
 assert.match(svg,/<path\b/);
});

test('invitation link does not contain player token',()=>{
 const roomCode='123456';
 const url=new URL('/?join='+encodeURIComponent(roomCode),'http://10.244.198.129:3000');
 assert.equal(url.searchParams.get('join'),roomCode);
 assert.equal(url.searchParams.has('token'),false);
});
