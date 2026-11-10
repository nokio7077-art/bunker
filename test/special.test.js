import test from 'node:test';
import assert from 'node:assert/strict';
import { player, createRoom, act, view } from '../game.js';
import { specialOptions } from '../special-actions.js';
import { specialCards } from '../special-cards.js';
import { catalog, eligibleCard } from '../card-catalog.js';

function setup(name) {
 const host=player('Ведущий'), room=createRoom('123456',host);
 act(room,host,'start_test');host.cards.special=name;
 return {room, host, guest:room.players[1]};
}
const unchanged=(room,operation)=>{const before=structuredClone(room);assert.throws(operation);assert.deepEqual(room,before);};

test('discard is public without leaking the former value, one-use, and not a normal reveal',()=>{
 const {room,host,guest}=setup('Сброс здоровья'), previous=guest.cards.health;
 act(room,host,'use_special',{targetId:guest.id});
 assert.equal(guest.cards.health,null);assert.ok(guest.revealed.includes('health'));
 assert.equal(room.opened,false);assert.equal(host.specialUsed,true);
 assert.deepEqual(Object.keys(view(room,host).players[1].cards),['health']);
 assert.ok(!room.log.join(' ').includes(previous));
 assert.equal(view(room,guest).players[0].cards.special,'Сброс здоровья');
 unchanged(room,()=>act(room,host,'use_special',{targetId:host.id}));
 unchanged(room,()=>act(room,host,'next'));
 act(room,host,'reveal','profession');act(room,host,'next');
 act(room,guest,'reveal','profession');assert.equal(room.opened,true);
});

test('invalid targets, phases, turn owners and empty slots never consume an action',()=>{
 const {room,host,guest}=setup('Сброс фобии');
 unchanged(room,()=>act(room,host,'use_special',{targetId:'missing'}));
 unchanged(room,()=>act(room,host,'use_special',null));
 unchanged(room,()=>act(room,host,'use_special',[]));
 unchanged(room,()=>act(room,guest,'use_special',{targetId:host.id}));
 assert.throws(()=>specialOptions(room,guest));
 guest.cards.phobia=null;
 unchanged(room,()=>act(room,host,'use_special',{targetId:guest.id}));
 for(const phase of ['lobby','vote','finished']){room.phase=phase;unchanged(room,()=>act(room,host,'use_special',{targetId:host.id}));}
 room.phase='turn';host.alive=false;
 unchanged(room,()=>act(room,host,'use_special',{targetId:host.id}));
});

test('selection uses the right public deck, respects biology, and keeps a closed card private',()=>{
 const {room,host,guest}=setup('Новое здоровье');
 host.cards.biology='Женщина · 15 лет · Гетеро · Не стерильна';
 host.cards.health='Хроническая бессонница';
 const options=specialOptions(room,host);
 assert.ok(options.choices.length>0);
 assert.ok(options.choices.every(c=>c.name!==host.cards.health&&eligibleCard('health',c.name,host.cards.biology,room.disaster)));
 assert.ok(!options.choices.some(c=>c.name==='Хронический простатит'));
 unchanged(room,()=>act(room,host,'use_special',{card:'Хронический простатит'}));
 unchanged(room,()=>act(room,host,'use_special',{card:host.cards.profession}));
 unchanged(room,()=>act(room,host,'use_special',{card:host.cards.health}));
 // Assign an option to somebody else: this must not remove it from the selection list.
 guest.cards.health=options.choices[0].name;
 assert.deepEqual(specialOptions(room,host),options);
 act(room,host,'use_special',{card:options.choices[0].name});
 assert.equal(host.cards.health,guest.cards.health);
 assert.equal(view(room,guest).players[0].cards.health,undefined);
 assert.ok(!room.log.join(' ').includes(host.cards.health));
});

test('replacement restores discarded cards and updates public descriptions',()=>{
 const {room,host,guest}=setup('Новая профессия');
 act(room,host,'reveal','profession');
 const choice=specialOptions(room,host).choices[0];
 act(room,host,'use_special',{card:choice.name});
 assert.equal(view(room,guest).players[0].cards.profession,choice.name);
 assert.equal(view(room,guest).players[0].descriptions.profession,choice.description);
 assert.equal(room.opened,true);
 const restored=setup('Новое здоровье');restored.host.cards.health=null;restored.host.revealed.push('health');
 const health=specialOptions(restored.room,restored.host).choices[0];
 act(restored.room,restored.host,'use_special',{card:health.name});
 assert.equal(view(restored.room,restored.guest).players[0].cards.health,health.name);
});

test('swaps preserve the visibility of slots and can transfer an empty slot',()=>{
 const {room,host,guest}=setup('Обмен багажом');
 guest.revealed.push('luggage');const oldHost=host.cards.luggage,oldGuest=guest.cards.luggage;
 unchanged(room,()=>act(room,host,'use_special',{targetId:host.id}));
 act(room,host,'use_special',{targetId:guest.id});
 assert.equal(host.cards.luggage,oldGuest);assert.equal(guest.cards.luggage,oldHost);
 assert.equal(view(room,guest).players[0].cards.luggage,undefined);
 assert.equal(view(room,host).players[1].cards.luggage,oldHost);
 const other=setup('Обмен хобби');other.host.cards.hobby=null;other.host.revealed.push('hobby');
 act(other.room,other.host,'use_special',{targetId:other.guest.id});
 assert.ok(other.host.cards.hobby);assert.equal(other.guest.cards.hobby,null);
 assert.equal(view(other.room,other.host).players[1].cards.hobby,null);
});

test('shuffle preserves the exact multiset of open cards, including expelled players, and never touches closed or discarded cards',()=>{
 for(let trial=0;trial<30;trial++){
  const {room,host}=setup('Перетасовка открытого багажа');
  unchanged(room,()=>act(room,host,'use_special'));
  room.players[0].revealed.push('luggage');
  unchanged(room,()=>act(room,host,'use_special'));
  room.players[1].revealed.push('luggage');room.players[1].alive=false;
  room.players[2].revealed.push('luggage');room.players[3].revealed.push('luggage');room.players[3].cards.luggage=null;
  const before=room.players.slice(0,3).map(p=>p.cards.luggage).sort(),hidden=room.players[4].cards.luggage;
  act(room,host,'use_special');
  assert.deepEqual(room.players.slice(0,3).map(p=>p.cards.luggage).sort(),before);
  assert.equal(room.players[3].cards.luggage,null);assert.equal(room.players[4].cards.luggage,hidden);
  assert.equal(view(room,host).players[4].cards.luggage,undefined);
 }
});

test('all 16 special cards execute and persist through serialization',()=>{
 for(const card of specialCards){
  const {room,host,guest}=setup(card.name);let value={};
  if(card.effect==='choose')value.card=specialOptions(room,host).choices[0].name;
  if(['discard','swap'].includes(card.effect))value.targetId=guest.id;
  if(card.effect==='shuffle'){host.revealed.push(card.category);guest.revealed.push(card.category);}
  act(room,host,'use_special',value);
  const loaded=JSON.parse(JSON.stringify(room));
  assert.equal(loaded.players[0].specialUsed,true,card.name);
  unchanged(loaded,()=>act(loaded,loaded.players[0],'use_special',value));
 }
});

test('discarded slots and legacy eight-card hands cannot block turn completion',()=>{
 const {room,host}=setup('Сброс здоровья');
 host.revealed=Object.keys(host.cards).filter(k=>k!=='health');
 act(room,host,'use_special',{targetId:host.id});act(room,host,'next');
 const legacy=setup('Неизвестное старое особое условие');delete legacy.host.cards.phobia;
 legacy.host.revealed=Object.keys(legacy.host.cards);
 assert.equal(view(legacy.room,legacy.host).specialAvailable,false);
 unchanged(legacy.room,()=>act(legacy.room,legacy.host,'use_special'));
 act(legacy.room,legacy.host,'next');
});

test('phobias are separately dealt and private; fatal insomnia is excluded while chronic insomnia remains',()=>{
 const {room,host,guest}=setup('Сброс фобии');
 assert.equal(catalog.phobia.length,90);
 assert.ok(room.players.every(p=>catalog.phobia.some(c=>c.name===p.cards.phobia)));
 assert.equal(view(room,guest).players[0].cards.phobia,undefined);
 assert.ok(!/смертел/i.test(JSON.stringify(catalog.health)));
 assert.ok(catalog.health.some(c=>c.name==='Хроническая бессонница'));
 room.round=2;act(room,host,'reveal','phobia');
 assert.equal(view(room,guest).players[0].cards.phobia,host.cards.phobia);
});
