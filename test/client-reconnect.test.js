import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const apiStart=source.indexOf('async function api('),apiEnd=source.indexOf('const brand=',apiStart);
const refreshStart=source.indexOf('async function refresh()'),refreshEnd=source.indexOf("app.addEventListener('submit'",refreshStart);
assert.ok(apiStart>=0&&apiEnd>apiStart&&refreshStart>=0&&refreshEnd>refreshStart);
const apiCode=source.slice(apiStart,apiEnd);
const refreshCode=source.slice(refreshStart,refreshEnd);

test('obsolete 401 cannot delete a successfully recovered multiplayer session',async()=>{
 const previous={code:'123456',token:'old-token'},current={code:'123456',token:'new-token'};
 let unblock;
 const response=new Promise(resolve=>{unblock=resolve;});
 let deleted=0,renders=0;
 const context={
  session:previous,state:{phase:'turn'},last:'old-state',
  localStorage:{removeItem:()=>{deleted++;}},
  render:()=>{renders++;},
  fetch:()=>response,
  serverClockOffsetMs:0,Date,Number,JSON,Error
 };
 runInNewContext(apiCode,context);
 const stale=context.api('/api/rooms/123456');
 context.session=current;
 unblock({ok:false,status:401,headers:{get:()=>null},json:async()=>({error:'old token expired'})});
 await assert.rejects(stale,/old token expired/);
 assert.equal(context.session.token,'new-token');
 assert.equal(deleted,0);
 assert.equal(renders,0);
});

test('current-session 401 still clears invalid credentials',async()=>{
 const context={
  session:{code:'123456',token:'invalid'},state:{phase:'turn'},last:'stale',
  localStorage:{removeItem:()=>{context.deleted++;}},
  render:()=>{context.rendered++;},deleted:0,rendered:0,
  fetch:async()=>({ok:false,status:401,headers:{get:()=>null},json:async()=>({error:'invalid credentials'})}),
  serverClockOffsetMs:0,Date,Number,JSON,Error
 };
 runInNewContext(apiCode,context);
 await assert.rejects(context.api('/api/rooms/123456'),/invalid credentials/);
 assert.equal(context.session,null);
 assert.equal(context.deleted,1);
 assert.equal(context.rendered,1);
});

test('temporary network failures never log out the player, and notification is not spammed',async()=>{
 const notices=[];
 let offline=true, fetched=0;
 const context={
  session:{code:'123456',token:'active'},busy:false,refreshInFlight:false,
  actionEpoch:0,last:'',state:null,restoringSession:false,
  nextRefreshAt:0,refreshFailures:0,connectionInterrupted:false,
  document:{hidden:false},Date,JSON,Math,
  api:async()=>{fetched++;if(offline)throw new Error('Failed to fetch');return {phase:'lobby',players:[]};},
  toast:s=>notices.push(s),
  prepareDisasterArtwork:()=>{},prepareBunkerArtwork:()=>{},render:()=>{}
 };
 runInNewContext(refreshCode,context);
 await context.refresh();
 assert.equal(notices.length,1);
 assert.equal(context.session.token,'active');
 assert.ok(context.nextRefreshAt>Date.now());
 await context.refresh();
 assert.equal(fetched,1,'throttled reconnect prevents request storms');
 context.nextRefreshAt=0;
 await context.refresh();
 assert.equal(notices.length,1,'same interruption is reported once');
 context.nextRefreshAt=0;offline=false;
 await context.refresh();
 assert.equal(context.refreshFailures,0);
 assert.equal(context.connectionInterrupted,false);
 assert.equal(notices.length,2,'successful reconnect is announced once');
});
