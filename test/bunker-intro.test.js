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
 const versions=[...html.matchAll(/(?:style|game-pixel|theme)\.css\?v=([^"']+)|app\.js\?v=([^"']+)/g)].map(match=>match[1]||match[2]);
 assert.equal(versions.length,4,'all CSS and JS assets must be cache-versioned');
 assert.ok(versions.every(version=>/^\d{8}-[a-z0-9-]+-v\d+$/.test(version)),'asset versions use a dated build identifier');
 assert.equal(new Set(versions).size,1,'all client assets should use the same cache version');
 assert.ok(!app.slice(start,end).includes('bunkerVariant('));
});

test('the live room capacity and actual JSON measurements populate the four artwork cells',()=>{
 const card=context.bunkerIntro();
 assert.match(card,/\b3\b/);
 assert.match(card,/Мест/);
 for(const v of [state.bunker.area_sqm+' м²',state.bunker.depth_m+' м',state.bunker.food_days+' сут.'])
  assert.ok(card.includes(escape(v)),v);
 assert.equal((card.match(/class="bunker-card-stat"/g)||[]).length,4);
 assert.match(card,/class="bunker-card-contents bunker-card-contents--(?:regular|compact|dense)"/);
 assert.match(card,/data-action="bunker-continue"/);
 assert.match(card,/Го!лучше так чем в подвале умирать/);
});

test('all 81 bunker inventories remain complete on the introductory card',()=>{
 assert.equal(bunkers.length,81);
 for(const bunker of bunkers){
  const copy=structuredClone(bunker);
  copy.capacity=4;
  state.bunker=copy;
  const card=context.bunkerIntro();
  assert.ok(card.includes(escape(bunker.name)),bunker.name);
  assert.ok(card.includes(escape(bunker.type)),bunker.name+' type');
  assert.ok(!card.includes('<details class="bunker-intro-details">'),bunker.name+' has no separate details panel');
  const pane=card.slice(card.indexOf('class="bunker-card-content-list"'),card.indexOf('</section></article>'));
  for(const item of bunker.equipment){
   assert.ok(pane.includes(escape(item)),bunker.name+' missing equipment '+item);
  }
  assert.ok(!card.includes('<details class="bunker-intro-details">'));
  assert.match(card,/class="bunker-card-content-list" role="region"/);
  assert.ok(!card.includes('<h2>Угрозы и ограничения</h2>'),'No threats in bunker presentation');
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

test('artwork text regions are bounded; extra metadata stays out of introduction',()=>{
 for(const name of ['bunker-card-heading','bunker-card-type','bunker-card-stats','bunker-card-contents'])
  assert.ok(css.includes('.bunker-intro .'+name),'region '+name+' is explicitly styled');
 assert.match(css,/\.bunker-intro \.bunker-card-heading,[^}]*position:absolute/);
 assert.match(css,/\.bunker-intro \.bunker-card-contents\{[^}]*overflow:hidden/);
 assert.match(css,/\.bunker-intro \.bunker-card-content-list\{[^}]*overflow-y:auto/);
 assert.match(css,/\.bunker-intro \.bunker-card-heading strong\{[^}]*-webkit-line-clamp:2/);
 assert.doesNotMatch(context.bunkerIntro(),/Описание и запасы|Все сведения и угрозы/);
 assert.match(css,/\.bunker-intro \.bunker-card-content-list\{[^}]*overflow-y:auto/);
});

test('the bunker continue button uses the same visual treatment as the disaster button',()=>{
 const card=context.bunkerIntro();
 assert.match(card,/class="bunker-intro disaster-intro--art"/);
 assert.match(card,/class="primary intro-next" data-action="bunker-continue"/);
 assert.match(css,/\.bunker-intro \.bunker-intro-footer \.intro-next\{[^}]*border:2px solid #b5e527/);
});

test('full equipment list stays visible in card markup even for long inventories',()=>{
 const original=state.bunker;
 state.bunker={...original,equipment:Array.from({length:15},(_,i)=>'Оборудование '+i+' — '+('очень длинное название '.repeat(5))),threats:['Тайная угроза']};
 const card=context.bunkerIntro();
 const area=card.slice(card.indexOf('<section class="bunker-card-contents'),card.indexOf('</section></article>'));
 for(const item of state.bunker.equipment)assert.ok(area.includes(escape(item)),item);
 assert.match(area,/bunker-card-contents--dense/);
 assert.doesNotMatch(card,/Описание и запасы/);
 assert.ok(!card.includes('Тайная угроза'));
 assert.ok(!card.includes('Угрозы и ограничения'));
 assert.match(css,/\.bunker-intro \.bunker-card-contents--dense \.bunker-card-content-list li/);
 state.bunker=original;
});

test('subtitle is lowered, inventory inset from left decoration and scroll is restored',()=>{
 const latest=css.slice(css.lastIndexOf('/* Final bunker-card polish:'));
 assert.match(latest,/\.bunker-intro \.bunker-card-type\{[^}]*top:21%/);
 assert.match(latest,/\.bunker-intro \.bunker-card-content-list\{[^}]*padding:7px 5% 12px 7\.5%/);
 assert.match(latest,/overflow-y:auto/);
 assert.match(latest,/font-family:'IBM Plex Mono',monospace/);
 assert.ok(!context.bunkerIntro().includes('bunker-intro-details'));
 assert.match(app,/class="world-details"/);
});

test('bunker equipment list is inset farther right while keeping vertical scrolling',()=>{
 const final=css.slice(css.lastIndexOf('/* Keep the old scrollable equipment list'));
 assert.match(final,/padding-left:9\.5%/);
 assert.match(css,/\.bunker-intro \.bunker-card-content-list\{[^}]*overflow-y:auto/);
});
