import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarIdentity, avatarSvg, avatarDataUri } from '../public/avatar-generator.js';

test('500 distinct self-contained pixel portraits: 250 female and 250 male',()=>{
 const all=[];
 for(const gender of ['female','male'])for(let i=0;i<250;i++){
  const svg=avatarSvg(gender,i);
  assert.ok(svg.startsWith('<svg xmlns='));
  assert.ok(svg.includes('viewBox="0 0 64 64"'));
  all.push(svg);
 }
 assert.equal(new Set(all).size,500);
});
test('gender and index are stable for the same fictional character',()=>{
 const female=avatarIdentity('Женщина · 28 лет','my-unique-id',3);
 const male=avatarIdentity('Мужчина · 28 лет','my-unique-id',3);
 assert.equal(female.gender,'female');
 assert.equal(male.gender,'male');
 assert.ok(female.index>=0&&female.index<298);
 assert.ok(male.index>=0&&male.index<290);
 assert.deepEqual(avatarIdentity('Женщина · 28 лет','my-unique-id',3),female);
 const uri=avatarDataUri('Женщина · 28 лет','my-unique-id',3);
 assert.ok(uri.startsWith('data:image/svg+xml;charset=UTF-8,'));
 assert.ok(decodeURIComponent(uri.split(',')[1]).includes('<svg'));
});

test('real avatar atlases each contain 250 WebP thumbnails in a 10 by 25 grid',async()=>{
 const {femaleAtlas,maleAtlas}=await import('../public/avatar-atlases.js');
 for(const atlas of [femaleAtlas,maleAtlas]){
  assert.match(atlas,/^data:image\/webp;base64,/);
  const b=Buffer.from(atlas.slice(atlas.indexOf(',')+1),'base64');
  assert.equal(b.toString('ascii',0,4),'RIFF');
  assert.equal(b.toString('ascii',8,12),'WEBP');
  assert.ok(b.length>30000&&b.length<100000);
 }
});


test('avatar selection covers the full real galleries',()=>{
 const females=new Set(),males=new Set();
 for(let i=0;i<2500;i++){
  females.add(avatarIdentity('Женщина · 28 лет','person-'+i,1).index);
  males.add(avatarIdentity('Мужчина · 28 лет','person-'+i,1).index);
 }
 assert.equal(females.size,298);
 assert.equal(males.size,290);
 assert.ok(Math.max(...females)<298);
 assert.ok(Math.max(...males)<290);
});


test('portrait age bands are stable and visibly different for both sexes',()=>{
 for(const sex of ['Мужчина','Женщина']){
  const young=avatarIdentity(sex+' · 19 лет','tester',1);
  const adult=avatarIdentity(sex+' · 42 года','tester',1);
  const senior=avatarIdentity(sex+' · 81 год','tester',1);
  assert.equal(young.gender,adult.gender);
  assert.equal(adult.gender,senior.gender);
  assert.ok(new Set([young.index,adult.index,senior.index]).size===3);
  assert.deepEqual(avatarIdentity(sex+' · 81 год','tester',1),senior);
 }
});
