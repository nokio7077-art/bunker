import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {bunkers} from '../world.js';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const asset=new URL('../public/images/bunkers/bunker-cards-atlas.webp',import.meta.url);
const image=readFileSync(asset);

const start=app.indexOf('function bunkerIntroKey(){');
const end=app.indexOf('function disasterIntroKey(){',start);
assert.ok(start>=0&&end>start);
const seenBunkers=new Set();
const storage=new Map();
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state={code:'384921',me:'playerA',gameNumber:2,phase:'turn',capacity:3,disaster:{name:'Катастрофа'},bunker:structuredClone(bunkers[0])};
state.bunker.capacity=3;
const context={state,escape,seenBunkers,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},replayBunkerKey:null,shouldShowDisaster:()=>false};
runInNewContext(app.slice(start,end),context);

test('the 11 real bunker designs are shipped as one optimized image and served safely',()=>{
 assert.equal(image.toString('ascii',8,12),'WEBP');
 assert.ok(image.length>300000&&image.length<900000,'atlas should be optimized without losing the real artwork');
 assert.match(server,/binaryAssets\.set\('\/images\/bunkers\/bunker-cards-atlas\.webp'/);
 assert.match(css,/background-image:url\('\/images\/bunkers\/bunker-cards-atlas\.webp'\)/);
 assert.match(css,/background-size:400% 300%/);
 assert.match(html,/bunker-intro-v11/);
});

test('a bunker card populates actual attributes, resources, equipment and all threats',()=>{
 const bunker=state.bunker,card=context.bunkerIntro();
 for(const item of [bunker.name,bunker.type,bunker.description,...Object.values(bunker.resources),...bunker.equipment,...bunker.threats,...bunker.scenario_notes||[]]){
  assert.ok(card.includes(escape(item)),String(item).slice(0,100));
 }
 for(const item of ['Вместимость','Площадь','Глубина','Запас еды','Герметичный воздух','ОБОРУДОВАНИЕ','УГРОЗЫ'])assert.ok(card.includes(item),item);
 assert.match(card,/Го!лучше так чем в подвале умирать/);
 assert.match(card,/data-action="bunker-continue"/);
 assert.equal(context.bunkerVariant(bunker),(bunker.id-1)%11);
});

test('the artwork is stable for a given shelter and supports all 11 variants',()=>{
 for(let id=1;id<=22;id++)assert.equal(context.bunkerVariant({id}),(id-1)%11);
 assert.match(context.bunkerIntro(),/--bunker-x:/);
 assert.match(context.bunkerIntro(),/--bunker-y:/);
});

test('bunker introduction appears only after disaster, only once per player and party',()=>{
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
 storage.delete(key);
 state.gameNumber=3;
 assert.equal(context.shouldShowBunker(),true);
 state.phase='finished';
 assert.equal(context.shouldShowBunker(),false);
 state.phase='turn';state.gameNumber=2;
});

test('bunker text is escaped and full long fields move below the illustration',()=>{
 const saved=state.bunker.name;
 state.bunker.name='<img src=x onerror=alert(1)>';
 const card=context.bunkerIntro();
 assert.ok(card.includes('&lt;img'));
 assert.ok(!card.includes('<img src=x'));
 state.bunker.name=saved;
 for(const part of ['bunker-card-description','bunker-card-equipment','bunker-card-threats'])assert.match(css,new RegExp('\\.'+part+'\\{[^}]*overflow-y:auto'));
 assert.ok(app.indexOf('if(shouldShowDisaster())')<app.indexOf('if(shouldShowBunker())'));
 assert.match(app,/if\(action==='bunker-open'\)/);
});

test('the illustrated bunker overview does not contain unbounded resource paragraphs or lists',()=>{
 const card=context.bunkerIntro();
 const picture=card.slice(card.indexOf('<article class="bunker-card-panel"'),card.indexOf('</article>'));
 const extra=card.slice(card.indexOf('<details class="bunker-intro-details">'));
 assert.ok(!picture.includes(state.bunker.resources.food));
 assert.ok(extra.includes(escape(state.bunker.resources.food)));
 assert.equal((picture.match(/<li>/g)||[]).length,4,'at most two visible equipment items and two threats');
 assert.ok(extra.includes(escape(state.bunker.equipment.at(-1))));
 assert.ok(extra.includes(escape(state.bunker.threats.at(-1))));
 assert.match(css,/\.bunker-intro \.bunker-card-description p\{[^}]*-webkit-line-clamp:4/);
 assert.match(css,/\.bunker-intro \.bunker-card-equipment li[^}]*text-overflow:ellipsis/);
 assert.match(css,/\.bunker-intro \.bunker-card-heading strong\{[^}]*-webkit-line-clamp:2/);
});
test('bunker continue action visually matches the catastrophe continue button',()=>{
 const card=context.bunkerIntro();
 assert.match(card,/class="bunker-intro disaster-intro--art"/);
 assert.match(card,/class="intro-footer bunker-intro-footer"/);
 assert.match(card,/class="primary intro-next" data-action="bunker-continue"/);
 assert.match(card,/Го!лучше так чем в подвале умирать/);
 assert.match(css,/\.bunker-intro \.bunker-intro-footer \.intro-next\{[^}]*border:2px solid #b5e527/);
});
