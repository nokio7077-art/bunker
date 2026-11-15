import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('re-render saves AI conversation scroll before replacing its DOM',()=>{
 const before=app.indexOf("const oldChat=document.querySelector('.ai-chat-history')");
 const render=app.indexOf("app.innerHTML=state?room():landing()");
 const after=app.indexOf("const newChat=document.querySelector('.ai-chat-history')");
 assert.ok(before>=0&&before<render);
 assert.ok(after>render);
 assert.ok(app.includes('chatPreviousTop=oldChat?.scrollTop'));
 assert.ok(app.includes('chatWasAtBottom?newChat.scrollHeight:chatPreviousTop'));
});

test('chat follows newest messages only when already reading near the bottom',()=>{
 assert.match(app,/oldChat\.scrollHeight-oldChat\.clientHeight-oldChat\.scrollTop<=48/);
 assert.match(app,/const chatWasAtBottom=oldChat\?.*:true;/);
 assert.match(app,/const summary=newlyRevealedBot&&!chatWasVisible/);
});

test('room refresh does not erase partially written chat messages or selected bot',()=>{
 assert.ok(app.includes("chatDraft=oldChatInput?.value"));
 assert.ok(app.includes('newChatInput.value=chatDraft'));
 assert.ok(app.includes('newChatInput.focus({preventScroll:true})'));
 assert.ok(app.includes('newChatInput.setSelectionRange(chatSelection.start,chatSelection.end)'));
 assert.ok(app.includes('newChatTarget.value=oldChatTarget'));
});
