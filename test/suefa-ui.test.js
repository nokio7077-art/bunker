import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=fileURLToPath(new URL('../',import.meta.url));
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const section=app.slice(app.indexOf('function rpsDialog(){'),app.indexOf('function specialNoticeKey(event){'));

function makeMarkup(myChoice,submitted=[]){
 const state={
  phase:'rps',me:'a',players:[{id:'a',name:'Первый'},{id:'b',name:'Второй'}],
  rps:{round:1,candidates:['a','b'],submitted,myChoice,deadline:Date.now()+90000}
 };
 return vm.runInNewContext(section+'\nrpsDialog()',{
  state,escape:value=>String(value),fmtTime:()=> '01:30'
 });
}

test('three original pixel-art PNGs are bundled and explicitly accessible',()=>{
 for(const move of ['rock','scissors','paper']){
  const path=new URL('../public/images/ui/suefa-'+move+'.png',import.meta.url);
  const img=readFileSync(path);
  assert.ok(img.length>400);
  assert.equal(img.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.match(server,new RegExp('suefa-\\$\\{move\\}\\.png'));
 }
});

test('available suefa choices render three different image buttons',()=>{
 const html=makeMarkup(null,[]);
 assert.equal((html.match(/class="suefa-choice"/g)||[]).length,3);
 for(const move of ['rock','scissors','paper']){
  assert.ok(html.includes('src="/images/ui/suefa-'+move+'.png"'));
  assert.ok(html.includes('data-move="'+move+'"'));
 }
});

test('after selecting, only the chosen image remains visible',()=>{
 for(const selected of ['rock','scissors','paper']){
  const html=makeMarkup(selected,['a']);
  assert.equal((html.match(/class="suefa-choice"/g)||[]).length,0);
  assert.equal((html.match(/class="suefa-icon"/g)||[]).length,1);
  assert.ok(html.includes('src="/images/ui/suefa-'+selected+'.png"'));
  for(const other of ['rock','scissors','paper'].filter(move=>move!==selected))
   assert.ok(!html.includes('suefa-'+other+'.png'),'other options hidden after selection');
  assert.ok(html.includes('Ваш выбор принят'));
 }
});
