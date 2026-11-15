import test from 'node:test';
import assert from 'node:assert/strict';
import {player,createRoom,join,act,view,advanceRoom,firstVoteRound} from '../game.js';

function makeRoom(humans){
 const host=player('Игрок 1'),room=createRoom('SIM123',host);
 for(let i=2;i<=humans;i++)join(room,player('Игрок '+i));
 return room;
}
const alive=room=>room.players.filter(p=>p.alive);
const nextCard=(room,p)=>room.round===1&&p.cards.profession&&!p.revealed.includes('profession')
 ?'profession':Object.keys(p.cards).find(k=>k!=='special'&&p.cards[k]&&!p.revealed.includes(k))
  ??Object.keys(p.cards).find(k=>p.cards[k]&&!p.revealed.includes(k));

function assertPrivacy(room){
 const observer=room.players.find(p=>!p.bot);
 const snapshot=view(room,observer);
 assert.equal(snapshot.dealHistory,undefined);
 assert.equal(snapshot.votes,undefined);
 for(const p of room.players){
  const representation=snapshot.players.find(candidate=>candidate.id===p.id);
  assert.ok(!JSON.stringify(snapshot).includes(p.token),'session tokens stay private');
  if(room.phase!=='finished'&&p.id!==observer.id){
   assert.deepEqual(Object.keys(representation.cards).sort(),p.revealed.slice().sort(),
    'other players have only publicly revealed keys');
  }
 }
}
function finishGame(room,{tieFirst=false,timeout=false}={}){
 const initialCount=room.players.length,capacity=room.capacity;
 let steps=0,votes=0,ties=0,specials=0;
 // Keep unrelated automatically applied bot specials out of generic game-flow
 // tests; special actions are explicitly exercised in their own test below.
 for(const bot of room.players.filter(p=>p.bot))bot.specialUsed=true;
 while(room.phase!=='finished'){
  assert.ok(++steps<1200,`simulation stuck (phase=${room.phase}, round=${room.round})`);
  if(steps%11===0)assertPrivacy(room);
  if(room.phase==='turn'){
   const p=room.players.find(p=>p.id===room.turn);
   assert.ok(p?.alive);
   if(timeout){
    assert.equal(advanceRoom(room,room.turnDeadline+1),true);
   }else if(p.bot){
    act(room,room.players.find(p=>p.id===room.host),'bot_step');
   }else{
    if(!room.opened){
     const key=nextCard(room,p);
     if(key)act(room,p,'reveal',key);
    }
    act(room,p,'next');
   }
  }else if(room.phase==='tie_discussion'){
   ties++;
   const host=room.players.find(p=>p.id===room.host);
   if(timeout)assert.equal(advanceRoom(room,room.discussionDeadline+1),true);
   else act(room,host,'start_revote');
  }else if(room.phase==='vote'){
   const firstBallot=!room.revoteCandidates;
   const candidates=alive(room).filter(p=>!room.revoteCandidates||room.revoteCandidates.includes(p.id));
   assert.ok(candidates.length>=2);
   const target=candidates.find(p=>p.id!==room.players[0].id)||candidates[0];
   if(timeout)assert.equal(advanceRoom(room,room.voteDeadline+1),true);
   else if(tieFirst&&votes===0&&firstBallot&&!room.testMode){
    // Force an exact 4:4 tie in the first round of an eight-person game.
    assert.equal(room.players.length,8);
    const [first,second]=candidates;
    for(const [index,voter] of room.players.entries())
     act(room,voter,'vote',index<2?room.players[1-index].id:room.players[index%2].id);
    assert.equal(room.phase,'tie_discussion');
   }else{
    for(const human of room.players.filter(p=>!p.bot)){
     const valid=candidates.find(p=>p.id!==human.id&&p.id===target.id)
      ||candidates.find(p=>p.id!==human.id);
     if(!Object.hasOwn(room.votes,human.id))act(room,human,'vote',valid.id);
    }
    // Bot votes are automatically entered when all humans have voted;
    // explicit fallback is only for cases where the game is still voting.
    if(room.phase==='vote'&&room.testMode&&room.players.some(p=>p.bot&&!Object.hasOwn(room.votes,p.id))){
     act(room,room.players.find(p=>p.id===room.host),'bot_votes');
    }
   }
   votes++;
  }else throw new Error('Unexpected phase: '+room.phase);
 }
 assert.equal(alive(room).length,capacity,'final shelter capacity respected');
 assert.equal(room.players.length,initialCount,'no players lost');
 assert.equal(room.players.filter(p=>!p.alive).length,initialCount-capacity,'one elimination per vote');
 assert.equal(room.turn,null);
 assert.equal(room.voteDeadline,undefined);
 assert.equal(room.turnDeadline,undefined);
 assertPrivacy(room);
 return {steps,votes,ties,specials};
}
test('complete games finish for all 5–16 human player counts',()=>{
 for(let count=5;count<=16;count++){
  const room=makeRoom(count),host=room.players[0];
  act(room,host,'start');
  assert.equal(room.firstVote,firstVoteRound(count));
  const {steps}=finishGame(room);
  assert.ok(steps>count,`expected multiple phases for ${count} players`);
 }
});
test('one through four humans finish full test games with smart bots',()=>{
 for(let count=1;count<=4;count++){
  const room=makeRoom(count);
  act(room,room.players[0],'start_test');
  assert.equal(room.players.length,5);
  assert.equal(room.players.filter(p=>p.bot).length,5-count);
  finishGame(room);
 }
});
test('same room finishes three consecutive matches with real host rotation',()=>{
 for(const count of [5,8,16]){
  const room=makeRoom(count),original=room.players.map(p=>p.token);
  for(let match=1;match<=3;match++){
   const host=room.players.find(p=>p.id===room.host);
   act(room,host,'start');
   finishGame(room);
   assert.equal(room.gameNumber,match);
   if(match<3){
    act(room,host,'next_game');
    assert.equal(room.phase,'lobby');
    assert.equal(room.players.length,count);
    assert.deepEqual(room.players.map(p=>p.token).sort(),original.slice().sort());
   }
  }
 }
});
test('a forced first-vote tie flows through discussion and restricted revote to the ending',()=>{
 const room=makeRoom(8);
 act(room,room.players[0],'start');
 const {ties}=finishGame(room,{tieFirst:true});
 assert.ok(ties>=1);
});
test('server deadlines alone can complete a whole eight-person match',()=>{
 const room=makeRoom(8);
 act(room,room.players[0],'start');
 finishGame(room,{timeout:true});
 assert.ok(room.log.some(msg=>msg.includes('автоматически открывает')));
 assert.ok(room.log.some(msg=>msg.includes('воздержанием')));
});
test('an action card used during a genuine full game survives until final results',()=>{
 const room=makeRoom(5),host=room.players[0];
 act(room,host,'start');
 host.cards.special='Сброс здоровья';
 const initialHealth=host.cards.health;
 act(room,host,'use_special',{targetId:host.id});
 assert.equal(host.cards.health,null);
 assert.equal(host.specialUsed,true);
 assert.ok(room.specialEvents?.length);
 assert.equal(room.specialEvents[0].results[0].before,'Закрытая карточка');
 // A discarded slot becomes public, but the hidden original must remain private.
 assert.ok(!JSON.stringify(view(room,room.players[1]).specialEvents).includes(initialHealth));
 finishGame(room);
 assert.equal(room.specialEvents.length,1);
 assert.equal(room.phase,'finished');
});
