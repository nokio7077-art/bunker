import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {player,createRoom,act,view} from '../game.js';
import {buildBotPrompt} from '../ai-bot.js';

const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('AI chat displays all messages and server no longer discards previous ones',()=>{
 assert.ok(app.includes('state.aiChat.map(entry'));
 assert.equal(app.includes('state.aiChat.slice(-20)'),false);
 assert.equal(server.includes('room.aiChat.slice(-32)'),false);
 assert.equal((server.match(/room\.aiChat\.push\(/g)||[]).length,3);
});
test('full chat is persisted in room view while LLM context remains bounded',()=>{
 const host=player('Ольга'),room=createRoom('123456',host);
 act(room,host,'start_ai_test');
 const bot=room.players.find(p=>p.bot);
 room.aiChat=Array.from({length:70},(_,i)=>({name:'Ольга',text:'Сообщение '+i,round:1}));
 const publicRoom=view(room,host);
 assert.equal(publicRoom.aiChat.length,70);
 assert.equal(publicRoom.aiChat[0].text,'Сообщение 0');
 const prompt=JSON.parse(buildBotPrompt(room,bot,'')[1].content);
 assert.equal(prompt.recentConversationUnverified.length,12);
 assert.ok(!JSON.stringify(prompt).includes('Сообщение 0'));
});
test('history resets between games rather than carrying messages into a new party',()=>{
 const host=player('Ольга'),room=createRoom('123456',host);
 act(room,host,'start_ai_test');
 room.aiChat=[{name:host.name,text:'Прошлая партия'}];
 room.phase='finished';
 act(room,host,'next_game');
 assert.deepEqual(room.aiChat,[]);
 assert.equal(room.aiMode,true);
});
