import test from 'node:test';
import assert from 'node:assert/strict';
import { player, createRoom, join, act, view, categories, firstVoteRound } from '../game.js';
function setup(n){const host=player('Игрок 1'),r=createRoom('123456',host);for(let i=2;i<=n;i++)join(r,player('Игрок '+i));return r;}
test('first voting rounds and capacities for 5–16 players',()=>{
 for(let n=5;n<=16;n++){
  const r=setup(n);act(r,r.players[0],'start');assert.equal(r.firstVote,Math.max(1,9-n));assert.equal(r.capacity,Math.floor(n/2));
  assert.equal(new Set(r.players.map(p=>p.cards.profession)).size,n);
 }
 assert.deepEqual([5,6,7,8].map(firstVoteRound),[4,3,2,1]);
});
test('every supported party reaches the correct final survivors; expelled players keep voting',()=>{
 for(let n=5;n<=16;n++){
  const r=setup(n);act(r,r.players[0],'start');let steps=0, votes=0;
  while(r.phase!=='finished'){
   assert.ok(++steps<500);
   if(r.phase==='turn'){
    const p=r.players.find(p=>p.id===r.turn);
    const key=Object.keys(categories).find(k=>!p.revealed.includes(k));
    if(key)act(r,p,'reveal',key);
    act(r,p,'next');
   }else{
    assert.ok(r.round>=r.firstVote);votes++;
    const target=r.players.find(p=>p.alive);
    for(const p of r.players)act(r,p,'vote',target.id);
   }
  }
  assert.equal(votes,n-Math.floor(n/2));assert.equal(r.players.filter(p=>p.alive).length,Math.floor(n/2));
 }
});
test('privacy and turn authority',()=>{
 const r=setup(5),[a,b]=r.players;assert.throws(()=>act(r,b,'start'));act(r,a,'start');
 let v=view(r,b);assert.deepEqual(v.players[0].cards,{});assert.equal(Object.keys(v.players[1].cards).length,Object.keys(categories).length);assert.ok(!JSON.stringify(v).includes(a.token));
 assert.throws(()=>act(r,b,'reveal','profession'));assert.throws(()=>act(r,a,'next'));assert.throws(()=>act(r,a,'reveal','hobby'));
 act(r,a,'reveal','profession');assert.throws(()=>act(r,a,'reveal','health'));
 assert.deepEqual(Object.keys(view(r,b).players[0].cards),['profession']);act(r,a,'next');assert.equal(r.turn,b.id);
 assert.throws(()=>join(r,player('Поздний гость')));
});
test('limits, duplicate names, invalid actions and votes',()=>{
 const small=setup(4);assert.throws(()=>act(small,small.players[0],'start'));
 const full=setup(16);assert.throws(()=>join(full,player('Новый')));assert.throws(()=>join(setup(5),player('игрок 1')));
 assert.throws(()=>player(' '));assert.throws(()=>player('x'.repeat(25)));
 const r=setup(8);act(r,r.players[0],'start');
 for(const p of r.players){act(r,p,'reveal','profession');act(r,p,'next');}
 assert.equal(r.phase,'vote');assert.throws(()=>act(r,r.players[0],'vote','invalid'));
 act(r,r.players[0],'vote',r.players[1].id);assert.throws(()=>act(r,r.players[0],'vote',r.players[2].id));
 assert.equal(view(r,r.players[1]).voteCount,1);assert.equal(view(r,r.players[1]).votes,undefined);
});
test('tied vote expels exactly one tied candidate across 100 trials',()=>{
 for(let trial=0;trial<100;trial++){
 const r=setup(8);act(r,r.players[0],'start');for(const p of r.players){act(r,p,'reveal','profession');act(r,p,'next');}
 r.players.forEach((p,i)=>act(r,p,'vote',r.players[i%2].id));
 assert.equal(r.lastVote.tie,true);assert.ok(r.players.slice(0,2).some(p=>p.id===r.lastVote.eliminated));assert.equal(r.players.filter(p=>!p.alive).length,1);assert.equal(r.round,2);
 }
});

test('a solo host can complete a full test game, even after expulsion',()=>{
 const r=setup(1),host=r.players[0];act(r,host,'start_test');
 assert.equal(r.players.length,5);assert.equal(r.players.filter(p=>p.bot).length,4);
 assert.equal(r.firstVote,4);assert.equal(r.capacity,2);assert.equal(r.testMode,true);
 assert.throws(()=>act(r,host,'bot_step'));
 let steps=0,forcedExpulsion=false;
 while(r.phase!=='finished'){
  assert.ok(++steps<100);
  if(r.phase==='turn'){
   if(r.turn===host.id){
    act(r,host,'reveal',Object.keys(categories).find(k=>!host.revealed.includes(k)));
    act(r,host,'next');
   }else act(r,host,'bot_step');
  }else if(!forcedExpulsion){
   for(const p of r.players)act(r,p,'vote',host.id);
   assert.equal(host.alive,false);forcedExpulsion=true;
  }else{
   act(r,host,'bot_votes');
   assert.equal(view(r,host).pendingBotVotes,0);
   assert.throws(()=>act(r,host,'bot_votes'));
   act(r,host,'vote',r.players.find(p=>p.alive).id);
  }
 }
 assert.equal(r.players.filter(p=>p.alive).length,2);
});

test('test controls are host-only and never reveal private bot or human cards',()=>{
 const r=setup(2),[host,guest]=r.players;
 assert.throws(()=>act(r,guest,'start_test'));assert.equal(r.players.length,2);
 act(r,host,'start_test');assert.equal(r.players.filter(p=>p.bot).length,3);
 assert.throws(()=>act(r,guest,'bot_step'));assert.throws(()=>act(r,guest,'bot_votes'));
 assert.throws(()=>act(r,host,'start_test'));assert.throws(()=>act(r,host,'bot_votes'));
 const hostView=view(r,host);
 for(const p of hostView.players.filter(p=>p.id!==host.id))assert.deepEqual(p.cards,{});
 assert.ok(r.players.every(p=>!JSON.stringify(hostView).includes(p.token)));
 const ordinary=setup(5);act(ordinary,ordinary.players[0],'start');
 assert.throws(()=>act(ordinary,ordinary.players[0],'bot_step'));
 const collision=createRoom('123456',player('Бот 1'));act(collision,collision.players[0],'start_test');
 assert.equal(new Set(collision.players.map(p=>p.name)).size,5);
});
