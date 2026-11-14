import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const client=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const gate=client.match(/function render\(\)\{(if\(restoringSession&&!state\)\{.*?return;\})if\(showEnding\(\)\)/s);
assert.ok(gate,'render must protect initial state from flashing landing before restore');
const runGate=(restoringSession,state)=>{
 const app={innerHTML:''};
 const render=new Function('app','restoringSession','state',`return function(){${gate[1]}return "continue";}`)(app,restoringSession,state);
 return {outcome:render(),html:app.innerHTML};
};

test('saved room renders a neutral recovery screen, not landing/video, until server responds',()=>{
 const result=runGate(true,undefined);
 assert.equal(result.outcome,undefined);
 assert.match(result.html,/Восстанавливаем вашу комнату/);
 assert.doesNotMatch(result.html,/landing-video|landing-shell|Создать убежище/);
});
test('public visitor without session still proceeds directly to landing',()=>{
 const result=runGate(false,undefined);
 assert.equal(result.outcome,'continue');
 assert.equal(result.html,'');
});
test('valid restored state proceeds to the actual room, without a loading frame',()=>{
 const result=runGate(true,{phase:'turn'});
 assert.equal(result.outcome,'continue');
 assert.equal(result.html,'');
});
test('successful refresh clears restoring flag before rendering, failed refresh releases spinner',()=>{
 assert.match(client,/last=serial;restoringSession=false;render\(\)/);
 assert.match(client,/finally\{refreshInFlight=false;if\(restoringSession\)\{restoringSession=false;render\(\);\}\}/);
});
