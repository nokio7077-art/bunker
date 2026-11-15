import test from 'node:test';
import assert from 'node:assert/strict';
import {player,createRoom,act,view} from '../game.js';
import {buildBotPrompt,answerBunkerFacts,explainOwnBotVote} from '../ai-bot.js';
import {rememberBotEndorsements,chooseConsistentBotTarget,rememberBotVoteReason} from '../ai-commitments.js';

function game(){
 const host=player('Ольга'),room=createRoom('198732',host);
 act(room,host,'start_ai_test');
 return {host,room,bot:room.players.find(p=>p.bot)};
}
test('bunker AI receives official food, water, equipment, threats, and area',()=>{
 const {room,bot}=game();
 const details={name:'Тестовый бункер',type:'Метро',area_sqm:95,depth_m:20,
  resources:{food:'Запас еды на 40 суток',water:'Запас воды на 20 суток',energy:'Дизель на 7 суток'},
  equipment:['Дизель-генератор','Обычная аптечка','3 лампы'],
  threats:['Повреждённая вентиляция'],food_days:40,water_days:20,energy_days:7};
 room.bunker=details;
 const data=JSON.parse(buildBotPrompt(room,bot,'Какие у нас припасы?')[1].content);
 assert.equal(data.bunker.resources.food,'Запас еды на 40 суток');
 assert.ok(data.bunker.equipment.includes('Обычная аптечка'));
 assert.equal(data.bunker.depth_m,20);
 const answer=answerBunkerFacts(room,'Что у нас есть в бункере?');
 assert.match(answer,/40 суток/);
 assert.match(answer,/Дизель-генератор/);
 assert.doesNotMatch(answer,/надо сходить|не знаю|ищите/i);
 assert.match(answerBunkerFacts(room,'Какие запасы воды?'),/20 суток/);
 assert.equal(answerBunkerFacts(room,'Почему ты выгнал Ольгу?'),null);
});
test('explicit support prevents an unexplained switch against same revealed cards',()=>{
 const {host,room,bot}=game(),other=room.players.find(p=>p.bot&&p.id!==bot.id);
 rememberBotEndorsements(room,bot,{reply:'Ольга очень полезна нашей группе, я за то, чтобы оставить её.',supportForIds:[]});
 assert.ok(room.aiBotEndorsements[bot.id][host.id]);
 const choice=chooseConsistentBotTarget(room,bot,[host.id,other.id],host.id,()=>other.id);
 assert.equal(choice,other.id);
 assert.equal('aiBotEndorsements' in view(room,host),false);
 host.revealed.push('profession');
 assert.equal(chooseConsistentBotTarget(room,bot,[host.id,other.id],host.id,()=>other.id),host.id);
});
test('negative statement does not protect candidate from elimination',()=>{
 const {host,room,bot}=game(),other=room.players.find(p=>p.bot&&p.id!==bot.id);
 rememberBotEndorsements(room,bot,{reply:'Ольга бесполезна и не нужна группе.',supportForIds:[]});
 assert.equal(room.aiBotEndorsements[bot.id]?.[host.id],undefined);
 assert.equal(chooseConsistentBotTarget(room,bot,[host.id,other.id],host.id,()=>other.id),host.id);
});
test('AI retains real vote reason only when recorded before casting the vote',()=>{
 const {host,room,bot}=game(),target=room.players.find(p=>p.bot&&p.id!==bot.id);
 rememberBotVoteReason(room,bot,{voteForId:target.id,voteReason:'На момент обсуждения не хватало открытых навыков ремонта.'});
 room.phase='vote';room.votes={};
 act(room,bot,'vote',target.id);
 assert.equal(room.aiBotVoteHistory[bot.id][0].reason,'На момент обсуждения не хватало открытых навыков ремонта.');
 room.round=2;
 const explanation=explainOwnBotVote(room,bot,'Почему ты проголосовал за '+target.name+'?');
 assert.match(explanation,/На момент обсуждения/);
 assert.equal('aiBotVoteReasons' in view(room,host),false);
});
test('protected target can be chosen when no other legal option exists',()=>{
 const {host,room,bot}=game();
 rememberBotEndorsements(room,bot,{reply:'Надо оставить Ольгу.',supportForIds:[host.id]});
 assert.equal(chooseConsistentBotTarget(room,bot,[host.id],host.id,()=>null),host.id);
});
