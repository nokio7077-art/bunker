import test from 'node:test';
import assert from 'node:assert/strict';
import {player,createRoom,join,act,view} from '../game.js';
import {buildBotPrompt,parseBotReply,aiFallback,validateBotClaim} from '../ai-bot.js';

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
