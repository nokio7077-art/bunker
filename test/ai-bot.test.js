import test from 'node:test';
import assert from 'node:assert/strict';
import {player,createRoom,join,act,view} from '../game.js';
import {buildBotPrompt,parseBotReply,aiFallback} from '../ai-bot.js';

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
