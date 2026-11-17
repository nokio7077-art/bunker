import test from 'node:test';
import assert from 'node:assert/strict';
import {player, createRoom, act} from '../game.js';
import {buildBotPrompt, explainPrivateBallotBoundary, explainOwnBotVote, validateBotClaim, isRepetitiveBotReply} from '../ai-bot.js';

function session(){
 const host=player('Ольга'),guest=player('дристунище'),room=createRoom('189180',host);
 room.players.push(guest);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 room.round=5;
 room.aiBotVoteHistory={[bot.id]:[{round:4,targetId:guest.id,reason:'Выбор сделан автоматическим алгоритмом.'}]};
 return {room,bot,host,guest};
}

test('an AI bot cannot claim to know private votes of its interlocutor',()=>{
 const {room,bot,guest}=session();
 const a=explainPrivateBallotBoundary(room,bot,'за кого япроголосовало дристунище',guest);
 assert.match(a,/не вижу твоих тайных голосов/);
 assert.match(explainPrivateBallotBoundary(room,bot,'За кого я проголосовал?',guest),/тайных голосов/);
 assert.equal(explainOwnBotVote(room,bot,'За кого я проголосовал?'),null);
});

test('the bot can still describe only its own confirmed ballot',()=>{
 const {room,bot}=session();
 assert.equal(explainPrivateBallotBoundary(room,bot,'За кого ты голосовал?',room.players[0]),null);
 assert.match(explainOwnBotVote(room,bot,'За кого ты голосовал?'),/дристунище/);
});

test('fictitious punishments and other player ballot claims are rejected',()=>{
 const {room}=session();
 assert.equal(validateBotClaim('Вы будете изолированы для переосмысления поведения.',room),false);
 assert.equal(validateBotClaim('Твои голоса зафиксированы: против Ольги.',room),false);
 assert.equal(validateBotClaim('Ты проголосовал за Ольгу.',room),false);
 assert.equal(validateBotClaim('Предлагаю исключить садовода, потому что мало пищи.',room),true);
});

test('recurrent commanding catchphrases are considered repetitive',()=>{
 const {room,bot}=session();
 room.aiChat=[{botId:bot.id,text:'Нам нужна дисциплина и чёткий план выживания, выполняйте свои обязанности немедленно'}];
 assert.equal(isRepetitiveBotReply(room,bot,'Дисциплина и план выживания нужны нам, выполняйте обязанности немедленно'),true);
});

test('system prompt forbids authoritarian punishment and invented engineering skills',()=>{
 const {room,bot}=session();
 const instructions=buildBotPrompt(room,bot,'ты бесполезен')[0].content;
 assert.match(instructions,/Не угрожай изоляцией/);
 assert.match(instructions,/Садовод не равен инженеру/);
});
