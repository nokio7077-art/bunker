import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('function tieNoticeKey(){');
const end=source.indexOf('function specialNoticeKey(event){',start);
assert.ok(start>=0&&end>start,'Tie notice functions must exist');

function scenario(){
 const seen=new Map();
 const state={
  code:'123456',me:'p3',gameNumber:2,phase:'tie_discussion',round:3,
  discussionDeadline:1750000000000,revoteCandidates:['p1','p2'],
  players:[{id:'p1',name:'Максим'},{id:'p2',name:'Анна'},{id:'p3',name:'Оля'}],
  lastVote:{scores:{p1:3,p2:3}}
 };
 const localStorage={getItem:key=>seen.get(key)??null,setItem:(key,value)=>seen.set(key,value)};
 let closeCount=0;
 const context={state,localStorage,escape:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;'),document:{querySelector:()=>({close:()=>{closeCount++}})}};
 runInNewContext(source.slice(start,end),context);
 return {context,state,seen,get closeCount(){return closeCount;}};
}

test('tie notice names only tied candidates and displays their equal scores',()=>{
 const ctx=scenario(),html=ctx.context.tieNoticeDialog();
 assert.match(html,/НИЧЬЯ/);
 assert.match(html,/Максим/);
 assert.match(html,/Анна/);
 assert.match(html,/3 голосов/);
 assert.doesNotMatch(html,/Оля<\/strong>/);
 assert.match(html,/data-action="tie-notice-close"/);
 assert.match(html,/особые условия/);
 assert.match(html,/только за перечисленных кандидатов/);
});

test('once dismissed, a tie modal stays dismissed through refresh and reopens on a new tie',()=>{
 const ctx=scenario();
 assert.equal(ctx.context.pendingTieNotice(),true);
 ctx.context.dismissTieNotice();
 assert.equal(ctx.closeCount,1);
 assert.equal(ctx.context.pendingTieNotice(),false);
 assert.equal(ctx.context.tieNoticeDialog(),'');
 ctx.state.discussionDeadline+=120000;
 assert.equal(ctx.context.pendingTieNotice(),true);
 ctx.state.phase='vote';
 assert.equal(ctx.context.pendingTieNotice(),false);
});

test('tie modal is not displayed outside discussion or without candidates',()=>{
 const ctx=scenario();
 ctx.state.revoteCandidates=[];
 assert.equal(ctx.context.pendingTieNotice(),false);
 ctx.state.revoteCandidates=['p1','p2'];
 ctx.state.phase='finished';
 assert.equal(ctx.context.pendingTieNotice(),false);
});
