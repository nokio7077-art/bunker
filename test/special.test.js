import test from 'node:test';
import assert from 'node:assert/strict';
import { player, createRoom, act, view } from '../game.js';
import { specialOptions } from '../special-actions.js';
import { specialCards } from '../special-cards.js';
import { catalog, eligibleCard, cardDescription } from '../card-catalog.js';

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

test('random replacement excludes the old card, respects biology, and keeps a closed card private',()=>{
 for(let trial=0;trial<30;trial++){
  const {room,host,guest}=setup('Новое здоровье');
  host.cards.biology='Женщина · 15 лет · Гетеро · Не стерильна';
  host.cards.health='Хроническая бессонница';
  const options=specialOptions(room,host);
  assert.equal(options.effect,'redraw');assert.equal(options.choices,undefined);
  unchanged(room,()=>act(room,host,'use_special',{card:'Хронический простатит'}));
  unchanged(room,()=>act(room,host,'use_special',{card:host.cards.health}));
  const otherHealth=guest.cards.health;
  act(room,host,'use_special');
  assert.notEqual(host.cards.health,'Хроническая бессонница');
  assert.ok(catalog.health.some(c=>c.name===host.cards.health));
  assert.ok(eligibleCard('health',host.cards.health,host.cards.biology,room.disaster));
  assert.equal(guest.cards.health,otherHealth);
  assert.equal(view(room,guest).players[0].cards.health,undefined);
  assert.ok(!room.log.join(' ').includes(host.cards.health));
 }
});

test('replacement restores discarded cards and updates public descriptions',()=>{
 const {room,host,guest}=setup('Новая профессия');
 act(room,host,'reveal','profession');
 const old=host.cards.profession;
 act(room,host,'use_special');
 assert.notEqual(host.cards.profession,old);
 assert.equal(view(room,guest).players[0].cards.profession,host.cards.profession);
 assert.equal(view(room,guest).players[0].descriptions.profession,cardDescription('profession',host.cards.profession));
 assert.equal(room.opened,true);
 const restored=setup('Новое здоровье');restored.host.cards.health=null;restored.host.revealed.push('health');
 act(restored.room,restored.host,'use_special');
 assert.ok(restored.host.cards.health);
 assert.equal(view(restored.room,restored.guest).players[0].cards.health,restored.host.cards.health);
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

test('open-only shuffle affects just opened nonempty cards, including expelled players',()=>{
 for(let trial=0;trial<20;trial++){
  const {room,host,guest}=setup('Перетасовка открытого багажа');
  const original=room.players.map(p=>p.cards.luggage);
  unchanged(room,()=>act(room,host,'use_special'));
  host.revealed.push('luggage');
  unchanged(room,()=>act(room,host,'use_special'));
  guest.revealed.push('luggage');
  guest.alive=false;
  room.players[2].revealed.push('luggage');
  room.players[3].revealed.push('luggage');
  room.players[3].cards.luggage=null;
  const openedBefore=[host,guest,room.players[2]].map(p=>p.cards.luggage).sort();
  act(room,host,'use_special');
  assert.deepEqual([host,guest,room.players[2]].map(p=>p.cards.luggage).sort(),openedBefore);
  assert.equal(room.players[3].cards.luggage,null);
  assert.equal(room.players[4].cards.luggage,original[4]);
  assert.equal(room.players[4].revealed.includes('luggage'),false);
  assert.equal(view(room,host).players[4].cards.luggage,undefined);
  assert.equal(room.specialEvents.at(-1).results.length,3);
 }
});

test('unrestricted discard and swap can select unrevealed cards',()=>{
 const discarded=setup('Сброс здоровья');
 assert.equal(discarded.guest.revealed.includes('health'),false);
 act(discarded.room,discarded.host,'use_special',{targetId:discarded.guest.id});
 assert.equal(discarded.guest.cards.health,null);
 const swapped=setup('Обмен багажом');
 const before=[swapped.host.cards.luggage,swapped.guest.cards.luggage];
 act(swapped.room,swapped.host,'use_special',{targetId:swapped.guest.id});
 assert.equal(swapped.host.cards.luggage,before[1]);
 assert.equal(swapped.guest.cards.luggage,before[0]);
 assert.equal(swapped.guest.revealed.includes('luggage'),false);
});

test('special card descriptions and their revealed-only restrictions agree',()=>{
 for(const card of specialCards){
  const openOnly=/(?:только открытые|только вскрытые)/i.test(card.description);
  assert.equal(Boolean(card.revealedOnly),openOnly,card.name);
 }
});

test('all 18 special cards execute and persist through serialization',()=>{
 for(const card of specialCards){
  const {room,host,guest}=setup(card.name);let value={};
  const previous=host.cards[card.category];
  if(['discard','swap','reveal'].includes(card.effect))value.targetId=guest.id;
  if(card.effect==='shuffle'){host.revealed.push(card.category);guest.revealed.push(card.category);}
  act(room,host,'use_special',value);
  if(card.effect==='redraw')assert.notEqual(host.cards[card.category],previous);
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

test('special results show before and after for open cards and persist for every observer',()=>{
 const {room,host,guest}=setup('Новая профессия');act(room,host,'reveal','profession');const old=host.cards.profession;
 act(room,host,'use_special');
 const event=view(room,guest).specialEvents.at(-1);assert.equal(event.category,'Профессия');assert.equal(event.results[0].before,old);assert.equal(event.results[0].after,host.cards.profession);
 const saved=JSON.parse(JSON.stringify(room));assert.deepEqual(view(saved,saved.players[1]).specialEvents,[event]);
});
test('public event snapshots never disclose hidden values, including closed-to-closed swaps and discarded cards',()=>{
 for(const special of ['Обмен багажом','Новое здоровье','Сброс здоровья']){
  const {room,host,guest}=setup(special),key=special==='Обмен багажом'?'luggage':'health';
  const hidden=[host.cards[key],guest.cards[key]];act(room,host,'use_special',{targetId:guest.id});hidden.push(host.cards[key],guest.cards[key]);
  const publicText=JSON.stringify({events:view(room,guest).specialEvents,log:room.log});
  for(const name of hidden.filter(Boolean))assert.ok(!publicText.includes(name),name);
  const event=room.specialEvents.at(-1);assert.equal(event.category,special==='Обмен багажом'?'Багаж':'Здоровье');
  assert.ok(event.results.every(r=>r.before==='Закрытая карточка'));
  assert.ok(event.results.every(r=>r.after===(special==='Сброс здоровья'?'Карточка сброшена':'Новая закрытая карточка')));
 }
});
test('shuffle results list all open recipients and report unchanged outcomes honestly',()=>{
 const {room,host,guest}=setup('Перетасовка открытого багажа');host.revealed.push('luggage');guest.revealed.push('luggage');
 const before=new Map([host,guest].map(p=>[p.id,p.cards.luggage]));act(room,host,'use_special');
 const results=room.specialEvents.at(-1).results;assert.equal(results.length,2);
 for(const result of results){const p=room.players.find(p=>p.id===result.playerId);assert.equal(result.before,before.get(p.id));assert.equal(result.after,p.cards.luggage);assert.equal(result.unchanged,result.before===result.after);}
});


test('revealing a closed card of another participant works and publishes the result',()=>{
 const {room,host,guest}=setup('Раскрыть чужое здоровье');
 const hidden=guest.cards.health;
 assert.equal(view(room,host).players[1].cards.health,undefined);
 act(room,host,'use_special',{targetId:guest.id});
 assert.equal(view(room,host).players[1].cards.health,hidden);
 assert.ok(guest.revealed.includes('health'));
 assert.equal(room.specialEvents.at(-1).results[0].before,'Закрытая карточка');
 assert.equal(room.specialEvents.at(-1).results[0].after,hidden);
 unchanged(room,()=>act(room,host,'use_special',{targetId:guest.id}));
});

test('each special action gets a unique public event id and private before/after for the recipient only',()=>{
 const {room,host,guest}=setup('Обмен багажом');
 const previousHost=host.cards.luggage,previousGuest=guest.cards.luggage;
 act(room,host,'use_special',{targetId:guest.id});
 const event=room.specialEvents.at(-1);
 assert.match(event.id,/^[0-9a-f]{20}$/);
 assert.equal(event.actorId,host.id);
 assert.equal(event.categoryKey,'luggage');
 assert.equal(event.effect,'swap');
 const hostView=view(room,host),guestView=view(room,guest);
 assert.equal(hostView.privateSpecialHistory,undefined);
 assert.equal(guestView.privateSpecialHistory,undefined);
 assert.deepEqual(hostView.specialPrivateResults,[{eventId:event.id,before:previousHost,after:previousGuest}]);
 assert.deepEqual(guestView.specialPrivateResults,[{eventId:event.id,before:previousGuest,after:previousHost}]);
 assert.equal(hostView.specialPrivateResults.some(x=>x.before===previousGuest),false);
 assert.equal(guestView.specialPrivateResults.some(x=>x.before===previousHost),false);
 assert.equal(JSON.stringify(guestView.specialEvents).includes(previousHost),false);
 assert.equal(JSON.stringify(hostView.specialEvents).includes(previousGuest),false);
});

test('discard of hidden card provides exact previous value only to its owner',()=>{
 const {room,host,guest}=setup('Сброс здоровья');
 const discarded=guest.cards.health;
 act(room,host,'use_special',{targetId:guest.id});
 const event=room.specialEvents.at(-1);
 assert.deepEqual(view(room,guest).specialPrivateResults,[{eventId:event.id,before:discarded,after:null}]);
 assert.deepEqual(view(room,host).specialPrivateResults,[]);
 assert.equal(JSON.stringify(view(room,host)).includes(discarded),false);
});

test('publicly revealed card and the player private event remain consistent',()=>{
 const {room,host,guest}=setup('Раскрыть чужой характер');
 const prior=guest.cards.personality;
 act(room,host,'use_special',{targetId:guest.id});
 const evt=view(room,host).specialEvents.at(-1);
 assert.equal(evt.results[0].after,prior);
 assert.equal(evt.results[0].before,'Закрытая карточка');
 const secret=view(room,guest).specialPrivateResults[0];
 assert.equal(secret.before,prior);
 assert.equal(secret.after,prior);
});
