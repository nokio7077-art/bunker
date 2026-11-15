import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotVote, chooseBotReveal, chooseBotSpecialTarget, publicSurvivalScore } from '../bot-ai.js';

const random=()=>3;
const room={disaster:{hazard:'airborne'},round:2,players:[
 {id:'bot',bot:true,cards:{profession:'Врач',health:'Здоров'},revealed:[]},
 {id:'doctor',cards:{profession:'Вирусолог',health:'Здоров'},revealed:['profession','health']},
 {id:'blogger',cards:{profession:'Блогер',health:'Здоров'},revealed:['profession']}
]};
test('bot votes against weakest public survival profile under a pandemic',()=>{
 assert.equal(chooseBotVote(room,room.players[0],['doctor','blogger'],random),'blogger');
});
test('bot strategy does not cheat by reading other players hidden cards',()=>{
 const unknown={id:'secret',cards:{profession:'Вирусолог',health:'Здоров'},revealed:[]};
 const weak={id:'weak',cards:{profession:'Блогер'},revealed:['profession']};
 assert.equal(publicSurvivalScore(unknown,room.disaster),0);
 const before=chooseBotVote({...room,players:[room.players[0],unknown,weak]},room.players[0],['secret','weak'],random);
 unknown.cards.profession='Блогер';unknown.cards.health='Тяжелое заболевание';
 assert.equal(publicSurvivalScore(unknown,room.disaster),0);
 assert.equal(chooseBotVote({...room,players:[room.players[0],unknown,weak]},room.players[0],['secret','weak'],random),before);
});
test('bot picks profession first, then a useful known card over a worthless special',()=>{
 const bot={cards:{profession:'Врач',luggage:'Аптечка',interesting:'Люблю кино',special:'Сброс здоровья'}};
 assert.equal(chooseBotReveal({...room,round:1},bot,['profession','luggage','special'],random),'profession');
 assert.equal(chooseBotReveal(room,bot,['interesting','luggage','special'],random),'luggage');
});
test('bot reveals action card only when no regular cards remain',()=>{
 const bot={cards:{special:'Сброс здоровья',interesting:'Люблю кино'}};
 assert.equal(chooseBotReveal(room,bot,['special','interesting'],random),'interesting');
 assert.equal(chooseBotReveal(room,bot,['special'],random),'special');
});
test('bot special selects a useful public target rather than random one',()=>{
 const bot={id:'bot',cards:{health:'Здоров'}};
 const targets=[
 {id:'fragile',cards:{health:'Тяжелое заболевание'},revealed:['health']},
 {id:'healthy',cards:{health:'Здоров'},revealed:['health']}
 ];
 assert.equal(chooseBotSpecialTarget(room,bot,{effect:'discard',category:'health'},targets,random).id,'healthy');
});
test('voting respects restricted candidates and never targets voter',()=>{
 const bot=room.players[0];
 assert.equal(chooseBotVote(room,bot,['doctor'],random),'doctor');
 assert.equal(chooseBotVote(room,bot,['bot'],random),null);
});
