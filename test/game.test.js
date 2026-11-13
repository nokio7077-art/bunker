import test from 'node:test';
import assert from 'node:assert/strict';
import { player, createRoom, join, act, view, categories, firstVoteRound, advanceRoom, TURN_TIMEOUT_MS, VOTE_TIMEOUT_MS, HOST_INACTIVE_MS } from '../game.js';
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
    for(const p of r.players)act(r,p,'vote',p.id===target.id?r.players.find(x=>x.alive&&x.id!==p.id).id:target.id);
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
 assert.equal(view(r,r.players[1]).voteCount,1);
 assert.throws(()=>act(r,r.players[2],'vote',r.players[2].id),/Нельзя голосовать за себя/);assert.equal(view(r,r.players[1]).votes,undefined);
});
test('tied vote expels exactly one tied candidate across 100 trials',()=>{
 for(let trial=0;trial<100;trial++){
 const r=setup(8);act(r,r.players[0],'start');for(const p of r.players){act(r,p,'reveal','profession');act(r,p,'next');}
 r.players.forEach((p,i)=>act(r,p,'vote',r.players[i<2?1-i:i%2].id));
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
   for(const p of r.players.filter(p=>p.bot))act(r,p,'vote',host.id);
   act(r,host,'vote',r.players.find(p=>p.bot&&p.alive).id);
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

test('test bots vote automatically only after every human, including an expelled host, has voted',()=>{
 const r=setup(2),[host,guest]=r.players;act(r,host,'start_test');r.phase='vote';r.votes={};host.alive=false;
 act(r,guest,'vote',r.players.find(p=>p.bot&&p.alive).id);assert.equal(r.phase,'vote');assert.equal(Object.keys(r.votes).length,1);
 assert.notEqual(view(r,guest).votedFor,guest.id);assert.equal(view(r,host).votedFor,null);
 act(r,host,'vote',guest.id);assert.notEqual(r.phase,'vote');assert.equal(Object.values(r.lastVote.scores).reduce((a,b)=>a+b,0),5);
 assert.throws(()=>act(r,host,'vote',guest.id));
});
test('one human vote completes a solo test ballot with no bot action',()=>{
 const r=setup(1),host=r.players[0];act(r,host,'start_test');r.phase='vote';r.votes={};
 act(r,host,'vote',r.players[1].id);assert.equal(r.phase,'turn');assert.equal(r.players.filter(p=>p.alive).length,4);
 assert.equal(Object.values(r.lastVote.scores).reduce((a,b)=>a+b,0),5);
});

test('same team rotates host and first speaker across matches, retaining sessions and clearing old state',()=>{
 const r=setup(5),original=[...r.players],tokens=original.map(p=>p.token);
 act(r,original[0],'start');
 for(let n=1;n<=6;n++){
  r.phase='finished';r.players[0].alive=false;r.specialEvents=[{old:true}];r.lastVote={old:true};r.players[0].specialUsed=true;
  const host=r.players.find(p=>p.id===r.host);assert.throws(()=>act(r,r.players.find(p=>p.id!==r.host),'next_game'));
  act(r,host,'next_game');const next=original[n%5];assert.equal(r.host,next.id);assert.equal(r.players[0].id,next.id);assert.equal(r.gameNumber,n+1);assert.equal(r.phase,'lobby');
  assert.equal(r.specialEvents,undefined);assert.equal(r.lastVote,undefined);assert.equal(r.disaster,undefined);
  for(const p of r.players){assert.equal(p.alive,true);assert.deepEqual(p.cards,{});assert.deepEqual(p.revealed,[]);assert.equal(p.specialUsed,undefined);}
  assert.deepEqual(original.map(p=>p.token),tokens);assert.throws(()=>act(r,next,'next_game'));
  act(r,next,'start');assert.equal(r.turn,next.id);assert.equal(Object.keys(next.cards).length,9);assert.equal(view(r,next).players[1].cards.profession,undefined);
  const saved=JSON.parse(JSON.stringify(r));assert.equal(saved.host,r.host);assert.equal(saved.gameNumber,r.gameNumber);
 }
});
test('test match host rotation skips bots and keeps solo tests usable',()=>{
 for(const n of [1,2]){const r=setup(n),humans=[...r.players];act(r,humans[0],'start_test');r.phase='finished';act(r,humans[0],'next_game');assert.equal(r.host,humans[n===1?0:1].id);assert.equal(r.testMode,true);act(r,r.players[0],'start');assert.equal(r.turn,r.host);}
});

test('new turn timer is exactly three minutes sixteen seconds and survives read-only views',()=>{
 assert.equal(TURN_TIMEOUT_MS,196000);
 const r=setup(5),host=r.players[0];
 const before=Date.now();act(r,host,'start');const after=Date.now();
 assert.ok(r.turnDeadline>=before+196000&&r.turnDeadline<=after+196000);
 const deadline=r.turnDeadline;
 for(let i=0;i<5;i++)assert.equal(view(r,host).turnDeadline,deadline);
 act(r,host,'reveal','profession');
 assert.equal(r.turnDeadline,deadline,'revealing a card does not reset the timer');
 act(r,host,'next');
 assert.ok(r.turnDeadline>=deadline-196000+196000);
});
test('deadline auto-opens a mandatory profession and advances without absent player',()=>{
 const r=setup(8),first=r.players[0];act(r,first,'start');
 assert.equal(r.turn,first.id);assert.equal(r.phase,'turn');
 assert.equal(advanceRoom(r,r.turnDeadline-1),false);
 assert.equal(advanceRoom(r,r.turnDeadline+1),true);
 assert.ok(first.revealed.includes('profession'));
 assert.equal(r.turn,r.players[1].id);
 assert.ok(r.turnDeadline>0);
});
test('vote deadline counts missing ballots as abstentions and always eliminates exactly one',()=>{
 const r=setup(8);act(r,r.players[0],'start');
 for(const p of r.players){act(r,p,'reveal','profession');act(r,p,'next');}
 assert.equal(r.phase,'vote');
 act(r,r.players[0],'vote',r.players[1].id);
 assert.equal(advanceRoom(r,r.voteDeadline+1),true);
 assert.equal(r.lastVote.abstained,7);
 assert.equal(r.lastVote.eliminated,r.players[1].id);
 assert.equal(r.players.filter(x=>!x.alive).length,1);
 assert.equal(r.phase,'turn');
});
test('zero-vote timeout uses a draw rather than locking the game',()=>{
 const r=setup(8);act(r,r.players[0],'start');
 for(const p of r.players){act(r,p,'reveal','profession');act(r,p,'next');}
 assert.equal(advanceRoom(r,r.voteDeadline+1),true);
 assert.equal(r.lastVote.abstained,8);
 assert.equal(Object.keys(r.lastVote.scores).length,0);
 assert.equal(r.players.filter(x=>!x.alive).length,1);
});
test('host may transfer leadership, and inactive host is replaced by active human',()=>{
 const r=setup(5),[host,guest,third]=r.players;
 assert.throws(()=>act(r,guest,'transfer_host',third.id));
 assert.throws(()=>act(r,host,'transfer_host',host.id));
 act(r,host,'transfer_host',guest.id);
 assert.equal(r.host,guest.id);
 guest.lastSeen=Date.now()-HOST_INACTIVE_MS-1000;
 third.lastSeen=Date.now();
 assert.equal(advanceRoom(r,Date.now()),true);
 assert.ok([host.id,third.id].includes(r.host));
 assert.throws(()=>act(r,guest,'start'),/Только ведущий/);
 act(r,r.players.find(x=>x.id===r.host),'start');assert.equal(r.phase,'turn');
});
test('private recovery secret is isolated in observer view',()=>{
 const r=setup(5),[a,b]=r.players;
 const mine=view(r,a);const theirs=view(r,b);
 assert.equal(mine.recoveryCode,a.recoveryCode);
 assert.ok(!JSON.stringify(mine).includes(b.recoveryCode));
 assert.ok(!JSON.stringify(theirs).includes(a.recoveryCode));
 assert.match(a.recoveryCode,/^[a-f0-9]{24}$/);
});


test('all shelter areas and descriptions stay within the agreed 30–350 m² range',async()=>{
 const {bunkers:active,chooseWorld,disasters}=await import('../world.js');
 const {readFile}=await import('node:fs/promises');
 const mirrored=JSON.parse(await readFile(new URL('../bunkers.json',import.meta.url),'utf8'));
 assert.equal(active.length,mirrored.length);
 const byId=new Map(mirrored.map(b=>[b.id,b]));
 for(const bunker of active){
  assert.ok(Number.isInteger(bunker.area_sqm)&&bunker.area_sqm>=30&&bunker.area_sqm<=350,`Invalid area for ${bunker.name}: ${bunker.area_sqm}`);
  assert.match(bunker.description,new RegExp(`общая площадь ${bunker.area_sqm} м²`));
  assert.equal(byId.get(bunker.id)?.area_sqm,bunker.area_sqm);
 }
 assert.ok(new Set(active.map(b=>b.area_sqm)).size>=15,'Shelter sizes should be varied');
 for(let i=0;i<disasters.length;i++){
  const picked=chooseWorld(3,n=>0);
  assert.ok(picked.bunker.area_sqm<=350&&picked.bunker.area_sqm>=30);
 }
});
