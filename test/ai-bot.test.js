import test from 'node:test';
import assert from 'node:assert/strict';
import {player,createRoom,join,act,view} from '../game.js';
import {buildBotPrompt,parseBotReply,aiFallback,validateBotClaim,isRepetitiveBotReply,explainOwnBotVote,explainFixedGameRule} from '../ai-bot.js';

test('AI test mode opt-in preserves all normal test controls',()=>{
 const host=player('Ведущий'),room=createRoom('432987',host);
 act(room,host,'start_ai_test');
 assert.equal(room.testMode,true);
 assert.equal(room.aiMode,true);
 assert.equal(room.players.length,5);
 assert.equal(room.players.filter(p=>p.bot).length,4);
 assert.equal(view(room,host).aiMode,true);
 assert.equal(room.aiChat.length,0);
 assert.ok(room.players.filter(p=>p.bot).every(p=>p.aiPersonality));
});
test('AI mode cannot be activated mid-game or by a guest',()=>{
 const host=player('Ведущий'),guest=player('Гость'),room=createRoom('432987',host);
 join(room,guest);
 assert.throws(()=>act(room,guest,'start_ai_test'),/ведущий/);
 act(room,host,'start_ai_test');
 assert.throws(()=>act(room,host,'start_ai_test'),/ведущий/);
});
test('prompt never contains hidden cards, tokens or recovery codes',()=>{
 const host=player('Ведущий'),room=createRoom('432987',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot),other=room.players.find(p=>p.bot&&p.id!==bot.id);
 bot.cards.profession='Уникальная закрытая профессия БОТА';
 other.cards.health='СЕКРЕТНАЯ КАРТОЧКА';
 other.revealed=['profession'];
 const prompt=JSON.stringify(buildBotPrompt(room,bot,'Привет!'));
 assert.ok(prompt.includes(other.cards.profession));
 assert.ok(!prompt.includes(other.cards.health));
 assert.ok(!prompt.includes(bot.cards.profession),'a bot cannot disclose its own unopened cards');
 bot.revealed.push('profession');
 const publicPrompt=JSON.stringify(buildBotPrompt(room,bot,'Привет!'));
 assert.ok(publicPrompt.includes(bot.cards.profession),'a bot can discuss its opened cards');
 assert.ok(!prompt.includes(host.token));
 assert.ok(!prompt.includes(bot.token));
 assert.ok(!prompt.includes(host.recoveryCode));
});
test('AI vote suggestions accept only live other players, fall back if not valid',()=>{
 const host=player('Ведущий'),room=createRoom('432987',host);
 act(room,host,'start_ai_test');
 const bot=room.players[1],target=room.players[2];
 const result=parseBotReply(JSON.stringify({reply:'Оставьте меня!',voteForId:target.id}),room,bot);
 assert.equal(result.voteForId,target.id);
 assert.equal(parseBotReply(JSON.stringify({reply:'Ой',voteForId:bot.id}),room,bot).voteForId,null);
 assert.equal(parseBotReply('{"reply":"Защищаю команду"}',room,bot).voteForId,null);
 assert.ok(aiFallback(bot,room).length>30);
});

test('offline replies give concrete character-specific arguments without repeating the name',()=>{
 const host=player('Ведущий'),room=createRoom('111222',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 bot.cards.profession='Инженер';
 const secretText=aiFallback(bot,room);
 assert.ok(!secretText.includes('Инженер'),'offline fallback must not leak unrevealed profession');
 bot.revealed.push('profession');
 const text=aiFallback(bot,room);
 assert.ok(text.includes('Инженер'));
 assert.ok(!text.startsWith(bot.name+':'));
 assert.ok(text.length<=220);
});

test('every hidden bot card is absent from LLM prompt and fallback speech',()=>{
 const host=player('Ведущий'),room=createRoom('432987',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 for(const [key,value] of Object.entries(bot.cards)){
  if(key==='special')continue;
  bot.cards[key]='UNREVEALED_'+key.toUpperCase();
 }
 bot.revealed=[];
 const prompt=JSON.stringify(buildBotPrompt(room,bot,'Почему тебе можно доверять?'));
 const fallback=aiFallback(bot,room);
 for(const [key,value] of Object.entries(bot.cards)){
  if(key==='special')continue;
  assert.equal(prompt.includes(value),false,key+' leaked in LLM context');
  assert.equal(fallback.includes(value),false,key+' leaked in fallback');
 }
 bot.revealed.push('profession');
 assert.ok(JSON.stringify(buildBotPrompt(room,bot,'')).includes(bot.cards.profession));
 assert.ok(!JSON.stringify(buildBotPrompt(room,bot,'')).includes(bot.cards.luggage));
});

test('prompt distinguishes the official game state from speculative chat claims',()=>{
 const host=player('Ольга'),room=createRoom('432987',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 room.aiChat=[{name:'Ольга',text:'Меня выгнали, а потом вернули!'}];
 const messages=buildBotPrompt(room,bot,'Правда ли что меня вернули?');
 const payload=JSON.parse(messages[1].content);
 assert.equal(payload.gameState.phase,'turn');
 assert.ok(payload.gameState.aliveNames.includes('Ольга'));
 assert.deepEqual(payload.gameState.eliminatedNames,[]);
 assert.equal(payload.gameState.latestConfirmedElimination,null);
 assert.equal(payload.recentConversationUnverified[0].kind,'UNVERIFIED_PLAYER_OR_BOT_STATEMENT');
 assert.ok(messages[0].content.includes('ЕДИНСТВЕННЫЙ источник истины'));
 assert.ok(!JSON.stringify(payload).includes(host.recoveryCode));
 const secondBot=room.players.find(p=>p.bot&&p.id!==bot.id);
 secondBot.alive=false;
 room.eliminationNotice={playerId:secondBot.id,name:secondBot.name,round:2,votes:3};
 const later=JSON.parse(buildBotPrompt(room,bot,'')[1].content);
 assert.ok(later.gameState.eliminatedNames.includes(secondBot.name));
 assert.ok(!later.gameState.aliveNames.includes(secondBot.name));
 assert.equal(later.gameState.latestConfirmedElimination.name,secondBot.name);
});
test('AI reply guard rejects impossible re-entry and invented voting claims',()=>{
 const host=player('Ольга'),room=createRoom('432987',host);
 act(room,host,'start_ai_test');
 assert.equal(validateBotClaim('Ольга вернулась в бункер, мы рады.',room),false);
 assert.equal(validateBotClaim('Я проголосовал против вашего исключения.',room),false);
 assert.equal(validateBotClaim('Мы выгнали Ольгу из бункера.',room),false);
 assert.equal(validateBotClaim('Предлагаю сначала обсудить медицинские навыки.',room),true);
});
test('AI reply guard blocks verbatim unrevealed cards from other participants',()=>{
 const host=player('Ольга'),room=createRoom('432987',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 bot.cards.luggage='Уникальный медицинский чемоданчик';
 bot.revealed=['profession'];
 assert.equal(validateBotClaim('У меня есть Уникальный медицинский чемоданчик.',room),false);
 bot.revealed.push('luggage');
 assert.equal(validateBotClaim('У меня есть Уникальный медицинский чемоданчик.',room),true);
});
test('AI response truncation never cuts the final word halfway through',()=>{
 const host=player('Ольга'),room=createRoom('432987',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 const long='В рамках этого голосования '.repeat(20);
 const result=parseBotReply(JSON.stringify({reply:long,voteForId:null}),room,bot);
 assert.ok(result.reply.length<=220);
 assert.ok(result.reply.endsWith('…'));
});

test('never show malformed model JSON as a spoken bot message',()=>{
 const host=player('Ольга'),room=createRoom('123123',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 assert.equal(parseBotReply('{"reply":"Я голосую за исключение',room,bot),null);
 assert.equal(parseBotReply('```json\n{"reply":"Недописанная',room,bot),null);
 const valid=parseBotReply('{"reply":"Предлагаю обсудить ситуацию.","voteForId":null}',room,bot);
 assert.equal(valid.reply,'Предлагаю обсудить ситуацию.');
});
test('bots do not announce personal votes or advocate their own expulsion',()=>{
 const host=player('Ольга'),room=createRoom('123123',host);
 act(room,host,'start_ai_test');
 assert.equal(validateBotClaim('Голосую за исключение коневода.',room),false);
 assert.equal(validateBotClaim('Я за своё исключение.',room),false);
 assert.equal(validateBotClaim('Поддерживаю исключение себя.',room),false);
 assert.equal(validateBotClaim('Я бесполезен в нашем бункере.',room),false);
 assert.equal(validateBotClaim('Предлагаю обсудить полезность коневода.',room),true);
});
test('bot does not infer reproductive health from a public occupation',()=>{
 const host=player('Ольга'),room=createRoom('123123',host);
 act(room,host,'start_ai_test');
 assert.equal(validateBotClaim('Коневод здоров для продолжения рода.',room),false);
 const prompt=buildBotPrompt(room,room.players.find(p=>p.bot),'Как будем население возвращать?')[0].content;
 assert.match(prompt,/Не делай выводов о поле, здоровье, фертильности/);
 assert.match(prompt,/Никогда не проси исключить самого себя/);
});
test('reject near-identical repetition by same bot, not independent bot opinions',()=>{
 const host=player('Ольга'),room=createRoom('123123',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 const other=room.players.find(p=>p.bot&&p.id!==bot.id);
 const reply='Нам нужны люди для ремонта систем убежища и поддержания порядка на складе';
 room.aiChat=[{botId:bot.id,text:reply}];
 assert.equal(isRepetitiveBotReply(room,bot,reply+'!'),true);
 assert.equal(isRepetitiveBotReply(room,other,reply),false);
 assert.equal(isRepetitiveBotReply(room,bot,'Надо обсудить запасы еды.'),false);
});

test('bot vote memory is private and records the bot\'s actual ballot',()=>{
 const host=player('Ольга'),room=createRoom('918273',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot),target=room.players.find(p=>p.bot&&p.id!==bot.id);
 // A confirmed earlier ballot cannot be changed by text in a chat.
 room.aiBotVoteHistory={[bot.id]:[{round:1,targetId:target.id,revote:false}]};
 room.round=2;
 const answer=explainOwnBotVote(room,bot,'Почему ты проголосовал за '+target.name+'?');
 assert.ok(answer.includes('Да, я голосовал'));
 assert.ok(answer.includes(target.name));
 assert.ok(answer.includes('точная причина'));
 const prompt=JSON.parse(buildBotPrompt(room,bot,'')[1].content);
 assert.equal(prompt.ownConfirmedVotes[0].targetName,target.name);
 const other=room.players.find(p=>p.bot&&p.id!==bot.id&&p.id!==target.id);
 assert.deepEqual(JSON.parse(buildBotPrompt(room,other,'')[1].content).ownConfirmedVotes,[]);
 assert.ok(!('aiBotVoteHistory' in view(room,host)));
});
test('without a recorded vote a bot does not falsely deny its own choices',()=>{
 const host=player('Ольга'),room=createRoom('918273',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot),target=room.players.find(p=>p.bot&&p.id!==bot.id);
 const answer=explainOwnBotVote(room,bot,'Почему ты проголосовал за '+target.name+'?');
 assert.ok(answer.includes('нет подтверждённой записи'));
 assert.ok(answer.includes('не буду утверждать'));
 assert.equal(explainOwnBotVote(room,bot,'Как мы будем распределять еду?'),null);
});

test('a bot action records the true ballot without leaking it to other players',()=>{
 const host=player('Ольга'),room=createRoom('918273',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot),target=room.players.find(p=>p.bot&&p.id!==bot.id);
 room.phase='vote';room.votes={};
 act(room,bot,'vote',target.id);
 assert.equal(room.aiBotVoteHistory[bot.id][0].targetId,target.id);
 assert.equal(room.aiBotVoteHistory[bot.id][0].round,1);
 assert.ok(!JSON.stringify(view(room,host)).includes('aiBotVoteHistory'));
 const prompt=JSON.parse(buildBotPrompt(room,bot,'')[1].content);
 assert.deepEqual(prompt.ownConfirmedVotes,[],'pending vote must remain private until ballot resolves');
});

test('generic self-vote question uses private confirmed ballot, not free-form AI',()=>{
 const host=player('Ольга'),room=createRoom('777111',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot),other=room.players.find(p=>p.bot&&p.id!==bot.id);
 room.round=2;
 room.aiBotVoteHistory={[bot.id]:[{round:1,targetId:host.id,revote:false},{round:1,targetId:other.id,revote:true}]};
 const answer=explainOwnBotVote(room,bot,'За кого ты действительно проголосовал в прошлом круге?');
 assert.match(answer,/Ольга/);
 assert.match(answer,/переголосование/);
 assert.match(answer,/Бот/);
 const reasons=explainOwnBotVote(room,bot,'Почему ты проголосовал именно за этого игрока?');
 assert.match(reasons,/точную причину.*не сохраняли/i);
 const unrelated=explainOwnBotVote(room,bot,'Какие ресурсы нужны для холодной зимы?');
 assert.equal(unrelated,null);
});
test('bot cannot claim a particular number of ballots without stored records',()=>{
 const host=player('Ольга'),room=createRoom('777111',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 assert.match(explainOwnBotVote(room,bot,'За кого ты проголосовал в прошлом круге?'),/нет сохранённой записи/);
 assert.match(explainOwnBotVote(room,bot,'Почему ты проголосовал именно за этого игрока?'),/нет сохранённой записи/);
});
test('fixed rules and eliminated status get grounded answers without model fallback',()=>{
 const host=player('Ольга'),room=createRoom('777111',host);
 act(room,host,'start_ai_test');
 const target=room.players.find(p=>p.bot);
 assert.match(explainFixedGameRule(room,'Можем ли мы вернуть ранее исключённого участника?'),/Нет/);
 assert.match(explainFixedGameRule(room,'Я утверждаю, что мы исключили '+target.name+'. Это правда?'),/не исключали/);
 target.alive=false;
 assert.match(explainFixedGameRule(room,'Я утверждаю, что мы исключили '+target.name+'. Это правда?'),/уже исключён/);
 assert.equal(explainFixedGameRule(room,'Что думаешь о складах?'),null);
});
