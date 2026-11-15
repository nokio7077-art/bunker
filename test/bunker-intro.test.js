import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {bunkers} from '../world.js';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const image=readFileSync(new URL('../public/images/bunkers/bunker-blank-layout.webp',import.meta.url));
const start=app.indexOf('function bunkerIntroKey(){');
const end=app.indexOf('function disasterIntroKey(){',start);
assert.ok(start>=0&&end>start);
const seenBunkers=new Set();
const storage=new Map();
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const state={code:'384921',me:'playerA',gameNumber:2,phase:'turn',capacity:3,disaster:{name:'Катастрофа'},bunker:structuredClone(bunkers[0])};
state.bunker.capacity=3;
const context={state,escape,seenBunkers,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},replayBunkerKey:null,shouldShowDisaster:()=>false};
runInNewContext(app.slice(start,end),context);

test('only the exact uploaded blank card is used, optimized and served safely',()=>{
 assert.equal(image.toString('ascii',8,12),'WEBP');
 assert.ok(image.length>50000&&image.length<300000,'optimized artwork should be light enough for mobile');
 assert.match(server,/binaryAssets\.set\('\/images\/bunkers\/bunker-blank-layout\.webp'/);
 assert.match(css,/background:url\('\/images\/bunkers\/bunker-blank-layout\.webp'\)/);
 assert.match(css,/aspect-ratio:982\/1602/);
 assert.match(html,/bunker-json-overlay-v13/);
 assert.ok(!app.slice(start,end).includes('bunkerVariant('));
});

test('the live room capacity and actual JSON measurements populate the four artwork cells',()=>{
 const card=context.bunkerIntro();
 assert.match(card,/\b3\b/);
 assert.match(card,/Мест/);
 for(const v of [state.bunker.area_sqm+' м²',state.bunker.depth_m+' м',state.bunker.food_days+' сут.'])
  assert.ok(card.includes(escape(v)),v);
 assert.equal((card.match(/class="bunker-card-stat"/g)||[]).length,4);
 assert.match(card,/class="bunker-card-contents"/);
 assert.match(card,/data-action="bunker-continue"/);
 assert.match(card,/Го!лучше так чем в подвале умирать/);
});

test('every one of the 81 real JSON bunkers keeps all equipment, threats and detailed resources',()=>{
 assert.equal(bunkers.length,81);
 for(const bunker of bunkers){
  const copy=structuredClone(bunker);
  copy.capacity=4;
  state.bunker=copy;
  const card=context.bunkerIntro();
  assert.ok(card.includes(escape(bunker.name)),bunker.name);
  assert.ok(card.includes(escape(bunker.type)),bunker.name+' type');
  assert.ok(card.includes(escape(bunker.description)),bunker.name+' description');
  const pane=card.slice(card.indexOf('class="bunker-card-content-list"'),card.indexOf('</section></article>'));
  for(const item of bunker.equipment){
   assert.ok(pane.includes(escape(item)),bunker.name+' missing equipment '+item);
  }
  const details=card.slice(card.indexOf('<details class="bunker-intro-details">'));
  for(const item of [...Object.values(bunker.resources),...bunker.threats]){
   assert.ok(details.includes(escape(item)),bunker.name+' missing details '+item);
  }
  assert.match(card,/class="bunker-card-content-list" role="region"/);
  assert.match(card,/tabindex="0"/);
 }
 state.bunker=structuredClone(bunkers[0]);state.bunker.capacity=3;
});

test('bunker introduction comes after catastrophe and is stored per player and game',()=>{
 const key=context.bunkerIntroKey();
 assert.equal(context.shouldShowBunker(),true);
 context.shouldShowDisaster=()=>true;
 assert.equal(context.shouldShowBunker(),false);
 context.shouldShowDisaster=()=>false;
 storage.set(key,'seen');
 assert.equal(context.shouldShowBunker(),false);
 context.replayBunkerKey=key;
 assert.equal(context.shouldShowBunker(),true);
 context.replayBunkerKey=null;
 state.phase='finished';
 assert.equal(context.shouldShowBunker(),false);
 state.phase='turn';
 assert.ok(app.indexOf('if(shouldShowDisaster())')<app.indexOf('if(shouldShowBunker())'));
 assert.match(app,/if\(action==='bunker-open'\)/);
});

test('user-derived content is safely escaped rather than interpreted as HTML',()=>{
 const saved=state.bunker.name;
 state.bunker.name='<img src=x onerror=alert(1)>';
 const card=context.bunkerIntro();
 assert.ok(card.includes('&lt;img'));
 assert.ok(!card.includes('<img src=x'));
 state.bunker.name=saved;
});

test('artwork text regions are independent, bounded and complete information remains below',()=>{
 for(const name of ['bunker-card-heading','bunker-card-type','bunker-card-stats','bunker-card-contents'])
  assert.ok(css.includes('.bunker-intro .'+name),'region '+name+' is explicitly styled');
 assert.match(css,/\.bunker-intro \.bunker-card-heading,[^}]*position:absolute/);
 assert.match(css,/\.bunker-intro \.bunker-card-contents\{[^}]*overflow:hidden/);
 assert.match(css,/\.bunker-intro \.bunker-card-content-list\{[^}]*overflow-y:auto/);
 assert.match(css,/\.bunker-intro \.bunker-card-heading strong\{[^}]*-webkit-line-clamp:2/);
 assert.match(context.bunkerIntro(),/Все сведения и угрозы/);
});

test('the bunker continue button uses the same visual treatment as the disaster button',()=>{
 const card=context.bunkerIntro();
 assert.match(card,/class="bunker-intro disaster-intro--art"/);
 assert.match(card,/class="primary intro-next" data-action="bunker-continue"/);
 assert.match(css,/\.bunker-intro \.bunker-intro-footer \.intro-next\{[^}]*border:2px solid #b5e527/);
});
