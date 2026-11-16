import test from 'node:test';
import assert from 'node:assert/strict';
import {player, createRoom, act} from '../game.js';
import {answerBunkerFacts, buildBotPrompt, parseBotReply, aiFallback, explainOwnBotVote} from '../ai-bot.js';

function setup(){
 const host=player('Ольга'),room=createRoom('489800',host);
 act(room,host,'start_ai_test');
 return {host,room,bot:room.players.find(p=>p.bot)};
}

test('self-promotion mentioning a bunker is not mistaken for a resource inquiry',()=>{
 const {room}=setup();
 assert.equal(answerBunkerFacts(room,'Я инженер, могу починить что угодно и наладить связь с другими убежищами'),null);
});

test('explicit bunker inventory requests receive authoritative data',()=>{
 const {room}=setup();
 room.bunker={name:'Каменоломни',equipment:['Бочки','Бутылки'],food_days:360,water_days:360,energy_days:0};
 const answer=answerBunkerFacts(room,'Перечисли реальные запасы и оборудование убежища');
 assert.match(answer,/Каменоломни/);
 assert.match(answer,/360/);
 assert.match(answer,/Энергии на 0/);
 assert.match(answer,/Бочки/);
});

test('the model receives more conversation and a confirmed ballot reason, never hidden cards',()=>{
 const {room,bot}=setup();
 const target=room.players.find(p=>p.bot&&p.id!==bot.id);
 room.round=4;
 room.aiBotVoteHistory={[bot.id]:[{round:3,targetId:target.id,reason:'Недостаточно практических навыков',revote:false}]};
 room.aiChat=Array.from({length:10},(_,i)=>({name:'Ольга',text:'реплика '+i}));
 const context=JSON.parse(buildBotPrompt(room,bot,'')[1].content);
 assert.equal(context.recentConversationUnverified.length,10);
 assert.equal(context.ownConfirmedVotes[0].reason,'Недостаточно практических навыков');
 assert.match(explainOwnBotVote(room,bot,'Почему ты проголосовал за '+target.name+'?'),/Недостаточно практических навыков/);
});

test('replies remain readable and are not chopped at 220 characters',()=>{
 const {room,bot}=setup();
 const reply='План действий: '+('проверяем оборудование, распределяем обязанности и защищаем продовольствие. ').repeat(5);
 const parsed=parseBotReply(JSON.stringify({reply}),room,bot);
 assert.ok(parsed.reply.length>220);
 assert.ok(parsed.reply.length<=421);
});

test('fallback considers energy shortfall without inventing a generator',()=>{
 const {room,bot}=setup();
 room.bunker={energy_days:0};
 const text=aiFallback(bot,room);
 assert.match(text,/Электричества на ноль суток/);
 assert.doesNotMatch(text,/у нас есть генератор/i);
});
