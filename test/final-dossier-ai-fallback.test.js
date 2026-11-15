import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {player,createRoom,act} from '../game.js';
import {aiFallback,buildBotPrompt} from '../ai-bot.js';

const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('final dossier distinguishes expelled participants from bunker survivors',()=>{
 assert.ok(ui.includes("me.alive?'ВЫЖИВШИЙ':'ИЗГНАН ИЗ БУНКЕРА'"));
 assert.ok(ui.includes("me.alive?'ДОСЬЕ ВЫЖИВШЕГО':'ДОСЬЕ ИЗГНАННОГО'"));
 assert.ok(ui.includes("${participantStatus} · ${escape(state.code)}"));
 assert.ok(ui.includes("${dossierTitle}</h3>"));
});
test('fallback speech matches bot persona and reveals no closed profession',()=>{
 const host=player('Ольга'),room=createRoom('123123',host);
 act(room,host,'start_ai_test');
 const bots=room.players.filter(p=>p.bot);
 const replies=bots.map(bot=>{
  bot.cards.profession='НЕРАСКРЫТАЯ ПРОФЕССИЯ';
  bot.revealed=[];
  return aiFallback(bot,room);
 });
 assert.equal(new Set(replies).size,4);
 assert.ok(replies.every(reply=>!reply.includes('НЕРАСКРЫТАЯ ПРОФЕССИЯ')));
 bots[0].revealed=['profession'];
 assert.ok(aiFallback(bots[0],room).includes('НЕРАСКРЫТАЯ ПРОФЕССИЯ'));
});
test('bot cannot claim to know private reasons for previous votes',()=>{
 const host=player('Ольга'),room=createRoom('123123',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 const prompt=buildBotPrompt(room,bot,'Почему вы меня выгнали?')[0].content;
 assert.ok(prompt.includes('личные мотивы голосовавших неизвестны'));
});
