import test from 'node:test';
import assert from 'node:assert/strict';
import { createBiologyCard } from '../biology.js';
import { player, createRoom, join, act, view } from '../game.js';

function withValues(values) {
 return createBiologyCard((min, max) => {
  const value = values.shift();
  assert.ok(value >= min && value < max, `Value ${value} outside [${min}, ${max})`);
  return value;
 });
}

test('biology includes both age boundaries, all orientations and both fertility states', () => {
 for (const age of [15, 105]) {
  for (const female of [0, 1]) {
   const expected = female ? ['Гетеро', 'Лесбиянка', 'Би', 'Асексуальна'] : ['Гетеро', 'Гей', 'Би', 'Асексуален'];
   for (let index = 0; index < expected.length; index++) {
    for (const sterile of [0, 1]) {
     const parts = withValues([female, age===15?0:99, age, [0,93,96,99][index], sterile]).split(' · ');
     assert.equal(parts.length, 4);
     assert.equal(parts[0], female ? 'Женщина' : 'Мужчина');
     assert.equal(parts[1], `${age} лет`);
     assert.equal(parts[2], expected[index]);
     assert.equal(parts[3], `${sterile ? '' : 'Не '}${female ? 'стерильна' : 'стерилен'}`.replace(/^./, c => c.toUpperCase()));
    }
   }
  }
 }
});

test('age text uses Russian year forms', () => {
 for (const [age, text] of [[21,'21 год'],[22,'22 года'],[25,'25 лет'],[31,'31 год'],[101,'101 год'],[102,'102 года'],[104,'104 года']]) {
  assert.equal(withValues([0,age<25?0:age<35?15:age<45?39:age<55?61:age<65?79:age<75?91:age<85?97:99,age,0,0]).split(' · ')[1], text);
 }
});

test('new biology is dealt to real players and bots, stays private until revealed', () => {
 const host = player('Ведущий'), guest = player('Гость'), room = createRoom('123456', host);
 join(room, guest); act(room, host, 'start_test');
 for (const p of room.players) {
  const parts = p.cards.biology.split(' · ');
  assert.equal(parts.length, 4);
  const age = Number.parseInt(parts[1]); assert.ok(age >= 15 && age <= 105);
 }
 assert.equal(view(room,guest).players[0].cards.biology, undefined);
 for (const p of room.players) { act(room,p,'reveal','profession'); act(room,p,'next'); }
 act(room,host,'reveal','biology');
 assert.equal(view(room,guest).players[0].cards.biology, host.cards.biology);
 assert.equal(view(room,host).players[1].cards.biology, undefined);
});

test('orientation weights cover all 100 outcomes exactly, independently of sex and fertility',()=>{
 for(const female of [0,1]){
  const counts={};for(let roll=0;roll<100;roll++){
   const parts=withValues([female,20,30,roll,0]).split(' · ');counts[parts[2]]=(counts[parts[2]]||0)+1;
   assert.match(parts[3],/^Не стерил/);
  }
  assert.deepEqual(counts,{'Гетеро':93,[female?'Лесбиянка':'Гей']:3,'Би':3,[female?'Асексуальна':'Асексуален']:1});
 }
});

test('age selection follows an adult-majority distribution with rare elderly characters',()=>{
 const expected=[
  {range:[15,25],weight:15},
  {range:[25,35],weight:24},
  {range:[35,45],weight:22},
  {range:[45,55],weight:18},
  {range:[55,65],weight:12},
  {range:[65,75],weight:6},
  {range:[75,85],weight:2},
  {range:[85,106],weight:1}
 ];
 const counts=expected.map(()=>0);
 // Enumerate every percentile rather than relying on a flaky random sample.
 for(let roll=0;roll<100;roll++){
  let call=0;
  const card=createBiologyCard((min,max)=>{
   if(call++===0)return 0; // male
   if(call===2){assert.equal(min,0);assert.equal(max,100);return roll;}
   if(call===3)return min; // lower edge of the chosen age bucket
   if(call===4)return 0; // orientation
   return 0; // fertility
  });
  const age=Number.parseInt(card.split(' · ')[1],10);
  const index=expected.findIndex(({range})=>age>=range[0]&&age<range[1]);
  assert.ok(index>=0,`Unexpected generated age ${age}`);
  counts[index]++;
 }
 assert.deepEqual(counts,expected.map(x=>x.weight));
 assert.equal(counts.slice(5).reduce((a,b)=>a+b,0),9); // 65+ = 9%
 assert.equal(counts.slice(6).reduce((a,b)=>a+b,0),3); // 75+ = 3%
});
