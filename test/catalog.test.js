import test from 'node:test';
import assert from 'node:assert/strict';
import { professions } from '../professions.js';
import { professionDescriptions } from '../profession-descriptions.js';
import { catalog, eligibleCard } from '../card-catalog.js';
import { disasters, bunkers, incompatibilities, chooseWorld } from '../world.js';
import { player, createRoom, join, act, view } from '../game.js';

test('all 500 professions and imported cards have unique, concise descriptions', () => {
 assert.equal(professions.length,500);
 assert.deepEqual(Object.keys(professionDescriptions).sort(),[...professions].sort());
 for (const description of Object.values(professionDescriptions)) {
  assert.ok(description.trim().length > 20 && description.length <= 180);
  assert.ok(!description.includes('\n'));
 }
 for (const cards of Object.values(catalog)) {
  assert.ok(cards.length >= 16);
  assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
  assert.equal(new Set(cards.map(c=>c.name.toLowerCase().replaceAll('ё','е'))).size,cards.length);
  assert.ok(cards.every(c=>c.name && c.description));
 }
});

test('all 20 disasters and 81 shelters remain playable, with incompatible combinations excluded', () => {
 assert.equal(disasters.length,20);assert.equal(bunkers.length,81);
 const reachable = new Set();
 for (const disaster of disasters) {
  const matches=bunkers.filter(b=>incompatibilities(disaster,b).length===0);
  assert.ok(matches.length > 0,disaster.name);
  for (const b of matches) reachable.add(b.id);
 }
 assert.equal(reachable.size,81);
 const findD=id=>disasters.find(d=>d.id===id), findB=id=>bunkers.find(b=>b.id===id);
 assert.ok(incompatibilities(findD(1),findB(1)).includes('missing:sealed_air'));
 assert.ok(incompatibilities(findD(19),findB(37)).includes('excluded:dam'));
 assert.ok(incompatibilities(findD(19),findB(34)).includes('excluded:underwater'));
 assert.ok(incompatibilities(findD(20),findB(63)).includes('excluded:polar'));
 assert.deepEqual(incompatibilities(findD(1),findB(9)),[]);
 const noPower={...findB(9),energy_days:0};
 assert.ok(incompatibilities(findD(1),noPower).includes('energy_reserve'));
 assert.ok(incompatibilities(findD(1),{...findB(9),food_days:1}).includes('food_reserve'));
});

test('world selection follows capacity and never mutates the original catalog', () => {
 for (let index=0; index<disasters.length; index++) {
  const inputs=[index,0];
  const world=chooseWorld(3,max=>{const value=inputs.shift();assert.ok(value>=0&&value<max);return value;});
  assert.equal(world.disaster.id,disasters[index].id);
  assert.equal(world.bunker.capacity,3);
  assert.deepEqual(incompatibilities(world.disaster,world.bunker),[]);
  world.bunker.equipment.push('only in this game');
 }
 assert.ok(bunkers.every(b=>!b.equipment.includes('only in this game')&&!Object.hasOwn(b,'capacity')));
});

test('card eligibility respects anatomy, age and radiation context', () => {
 const female='Женщина · 15 лет · Гетеро · Не стерильна';
 const male='Мужчина · 30 лет · Гетеро · Не стерилен';
 const quiet={hazard:'logistics'},radiation={hazard:'radiation'};
 assert.equal(eligibleCard('health','Хронический простатит',female,quiet),false);
 assert.equal(eligibleCard('health','Хронический простатит',male,quiet),true);
 assert.equal(eligibleCard('interesting','Бывший профессиональный телохранитель',female,quiet),false);
 assert.equal(eligibleCard('health','Восстановление после облучения',male,quiet),false);
 assert.equal(eligibleCard('health','Восстановление после облучения',male,radiation),true);
});

test('descriptions do not disclose hidden professions or other private cards', () => {
 const host=player('Ведущий'),guest=player('Гость'),r=createRoom('123456',host);
 join(r,guest);act(r,host,'start_test');
 const own=view(r,host).players[0];
 assert.equal(own.descriptions.profession,professionDescriptions[host.cards.profession]);
 assert.deepEqual(view(r,guest).players[0].descriptions,{});
 act(r,host,'reveal','profession');
 const revealed=view(r,guest).players[0];
 assert.equal(revealed.descriptions.profession,own.descriptions.profession);
 assert.equal(revealed.descriptions.health,undefined);
 assert.equal(revealed.cards.health,undefined);
 for(const p of r.players) {
  for(const [category,name] of Object.entries(p.cards)) {
   if(category!=='biology')assert.ok(eligibleCard(category,name,p.cards.biology,r.disaster));
  }
 }
});
