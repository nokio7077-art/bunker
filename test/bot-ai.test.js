import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotVote, chooseBotReveal, chooseBotSpecialTarget, publicSurvivalScore, teamSkillContribution } from '../bot-ai.js';

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

test('special swap target scores do not inspect a closed opponent card',()=>{
 const bot={id:'bot',cards:{health:'Тяжелое заболевание'}};
 const hidden={id:'hidden',cards:{health:'Здоров'},revealed:[]};
 const visible={id:'visible',cards:{health:'Здоров'},revealed:['health']};
 const local={...room,players:[bot,hidden,visible]};
 const before=chooseBotSpecialTarget(local,bot,{effect:'swap',category:'health'},[hidden,visible],random).id;
 hidden.cards.health='Тяжелое заболевание';
 const after=chooseBotSpecialTarget(local,bot,{effect:'swap',category:'health'},[hidden,visible],random).id;
 assert.equal(before,after);
 assert.equal(after,'visible');
});

test('bot protects the only engineer when two doctors already cover pandemic care',()=>{
 const people=[
  {id:'bot',alive:true,cards:{profession:'Вирусолог'},revealed:['profession'],bot:true},
  {id:'medic2',alive:true,cards:{profession:'Вирусолог'},revealed:['profession']},
  {id:'engineer',alive:true,cards:{profession:'Инженер'},revealed:['profession']}
 ];
 const group={disaster:{hazard:'airborne'},bunker:{equipment:['Дизель-генератор']},players:people};
 assert.ok(teamSkillContribution(group,people[2],people[0])>teamSkillContribution(group,people[1],people[0]));
 assert.equal(chooseBotVote(group,people[0],['medic2','engineer'],random),'medic2');
});
test('single doctor is more valuable than another engineer during pandemic',()=>{
 const people=[
  {id:'bot',alive:true,cards:{profession:'Инженер'},revealed:['profession'],bot:true},
  {id:'engineer2',alive:true,cards:{profession:'Электрик'},revealed:['profession']},
  {id:'doctor',alive:true,cards:{profession:'Вирусолог'},revealed:['profession']}
 ];
 const group={disaster:{hazard:'airborne'},bunker:{equipment:['Дизель-генератор']},players:people};
 assert.equal(chooseBotVote(group,people[0],['engineer2','doctor'],random),'engineer2');
});
test('hidden profession of another player cannot alter team skill valuation or vote',()=>{
 const people=[
  {id:'bot',alive:true,cards:{profession:'Инженер'},revealed:['profession'],bot:true},
  {id:'hidden',alive:true,cards:{profession:'Вирусолог'},revealed:[]},
  {id:'known',alive:true,cards:{profession:'Вирусолог'},revealed:['profession']}
 ];
 const group={disaster:{hazard:'airborne'},players:people};
 const before=teamSkillContribution(group,people[2],people[0]);
 const voteBefore=chooseBotVote(group,people[0],['hidden','known'],random);
 people[1].cards.profession='Инженер';
 assert.equal(teamSkillContribution(group,people[2],people[0]),before);
 assert.equal(chooseBotVote(group,people[0],['hidden','known'],random),voteBefore);
});
test('excluded players do not provide team skill coverage',()=>{
 const people=[
  {id:'bot',alive:true,cards:{profession:'Инженер'},revealed:['profession'],bot:true},
  {id:'excludedDoctor',alive:false,cards:{profession:'Вирусолог'},revealed:['profession']},
  {id:'remainingDoctor',alive:true,cards:{profession:'Вирусолог'},revealed:['profession']}
 ];
 const group={disaster:{hazard:'airborne'},players:people};
 assert.equal(teamSkillContribution(group,people[2],people[0]),7);
});
test('bot favors disclosing a skill missing from the team',()=>{
 const bot={id:'bot',alive:true,cards:{profession:'Инженер',health:'Здоров'},revealed:[]};
 const group={round:2,disaster:{hazard:'blackout'},bunker:{equipment:['Генератор']},players:[
  bot,{id:'cook',alive:true,cards:{profession:'Повар'},revealed:['profession']}
 ]};
 assert.equal(chooseBotReveal(group,bot,['profession','health'],random),'profession');
});
