import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
import {disasterImages} from '../public/card-images.js';

const root=new URL('../',import.meta.url);
const client=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const localPath=src=>new URL('../public'+src,import.meta.url);

test('all 23 disaster cards have light preview and full assets with their originals intact',()=>{
 assert.equal(Object.keys(disasterImages).length,23);
 for(const [id,image] of Object.entries(disasterImages)){
  for(const key of ['src','webp','preview']){
   assert.ok(image[key],id+' missing '+key);
   assert.ok(existsSync(localPath(image[key])),id+' missing file '+image[key]);
  }
  assert.ok(statSync(localPath(image.preview)).size<100000,id+' preview too large');
  assert.ok(statSync(localPath(image.webp)).size<350000,id+' full image too large');
  assert.ok(statSync(localPath(image.webp)).size<statSync(localPath(image.src)).size,id+' should be smaller than PNG');
 }
});
test('matched entrance poster exists and is preloaded with priority',()=>{
 const poster='/images/ui/bunker-entrance-poster.webp';
 assert.ok(existsSync(localPath(poster)));
 assert.ok(statSync(localPath(poster)).size<150000);
 assert.ok(html.includes('rel="preload" as="image" href="'+poster+'"'));
 assert.ok(client.includes('poster="'+poster+'"'));
 assert.ok(css.includes('background-image:url(\''+poster+'\')'));
 assert.ok(server.includes("binaryAssets.set('"+poster+"'"));
});
test('client displays preview immediately and upgrades from one deduplicated full-size preload',()=>{
 assert.match(client,/disasterPreloads\.has\(key\)/);
 assert.match(client,/disasterPreloads\.set\(key,preload\)/);
 assert.match(client,/image\.preview\|\|image\.webp/);
 assert.match(client,/data-full-src=/);
 assert.match(client,/node\.dataset\.fullSrc===key/);
 assert.match(server,/if\(image\.preview\)binaryAssets\.set\(image\.preview/);
});
