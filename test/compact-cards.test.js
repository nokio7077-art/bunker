import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
const start=source.indexOf('function cardDetails(');
const end=source.indexOf('function worldPanels(',start);
assert.ok(start>=0&&end>start,'card rendering helpers exist');
const state={
 categories:{profession:'Профессия',health:'Здоровье',special:'Особое условие'},
 phase:'turn',round:2,opened:false,specialAvailable:true
};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const context={state,escape,dossierIcon:()=>'',Object};
runInNewContext(source.slice(start,end),context);
const player={
 id:'p1',name:'Игрок',alive:true,charts:{},cards:{profession:'Инженер',health:'Здоров',special:'Обмен хобби'},
 descriptions:{profession:'Большое описание профессии',health:'Очень длинное описание здоровья',special:'Подробности особого условия'},
 revealed:['profession'],specialUsed:false
};

test('own card shows category and value, but hides description behind an explicit details toggle',()=>{
 const html=context.handCard(player,true,'profession','Профессия');
 assert.match(html,/Инженер/);
 assert.match(html,/Профессия/);
 assert.match(html,/<details class="card-detail"/);
 assert.match(html,/<summary>Подробнее<\/summary>/);
 assert.match(html,/Большое описание профессии/);
 assert.doesNotMatch(html,/<button[^>]*>.*<details/s);
});
test('special card retains its action button and separate description disclosure',()=>{
 const html=context.handCard(player,true,'special','Особое условие');
 assert.match(html,/data-action="special-open"/);
 assert.match(html,/Подробности особого условия/);
 assert.match(html,/class="dossier-tile is-special"/);
});
test('public spotlight card hides only optional description and retains public value',()=>{
 const html=context.publicCard(player,'profession');
 assert.match(html,/Инженер/);
 assert.match(html,/<summary>Подробнее<\/summary>/);
 assert.match(html,/Большое описание профессии/);
 const plain=context.publicCard({...player,descriptions:{}},'health');
 assert.doesNotMatch(plain,/<details/);
});
test('mobile CSS has two columns for own, spotlight and other player cards',()=>{
 assert.match(styles,/\.dossier-file-list\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(styles,/\.turn-spotlight-cards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(styles,/details\.public-dossier \.public-cards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(source,/const openDetails=new Set\(/);
 assert.match(source,/node\.open=openDetails\.has\(node\.dataset\.detailKey\)/);
});
