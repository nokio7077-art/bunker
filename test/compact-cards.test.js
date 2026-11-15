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
 assert.match(html,/<summary aria-label="Подробности: Профессия"[^>]*><svg class="detail-chevron"[^>]*><path[^>]*\/><\/svg><\/summary>/);
 assert.match(html,/Большое описание профессии/);
 assert.doesNotMatch(html,/>Подробнее</);
 assert.ok(html.indexOf('</button>')<html.indexOf('<details class="card-detail"'),'the arrow disclosure is separate from the card action');
 assert.ok(html.includes('</button><details class="card-detail"'));
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
 assert.match(html,/<summary aria-label="Подробности: Профессия"[^>]*><svg class="detail-chevron"[^>]*><path[^>]*\/><\/svg><\/summary>/);
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

test('compact disclosure chevron is positioned beside category, not in a full height bar',()=>{
 assert.match(styles,/\.game \.card-detail>summary,[^}]*position:absolute/);
 assert.match(styles,/\.game \.card-detail>summary::after,[^}]*content:none/);
 assert.match(styles,/\.game \.compact-public-card>strong\{padding-right:26px/);
 assert.match(styles,/\.game \.dossier-file-list \.dossier-card-content\{padding-right:35px/);
 const html=context.publicCard(player,'profession');
 assert.match(html,/<summary aria-label="Подробности: Профессия"/);
 assert.doesNotMatch(html,/Подробнее/);
});

test('disclosure chevron is frameless and aligned alongside the characteristic value',()=>{
 const latest=styles.slice(styles.lastIndexOf('/* Dossier disclosures sit'));
 assert.match(latest,/border:0;border-radius:0;box-shadow:none;background:transparent/);
 assert.match(latest,/\.game \.compact-public-card \.card-detail>summary\{top:34px/);
 assert.match(latest,/\.game \.dossier-file-list \.dossier-card-content\{padding-right:35px/);
 assert.match(styles,/\.game \.card-detail>summary \.detail-chevron\{[^}]*width:21px;height:21px/);
});

test('active player appears in the lower dossier only; bot explanation belongs in rules',()=>{
 assert.doesNotMatch(source,/\$\{turnSpotlight\}/);
 assert.doesNotMatch(source,/ТЕСТОВАЯ ПАРТИЯ · С БОТАМИ/);
 assert.match(source,/rules-bot-mode/);
 assert.match(source,/Для перехода к следующему боту нажмите/);
 assert.match(source,/id="active-dossier"/);
});

test('mobile badge positioning uses one authoritative grid layout with no later column override',()=>{
 const marker='/* Mobile dossier layout — single authoritative rule set.';
 const final=styles.slice(styles.indexOf(marker));
 assert.ok(final.startsWith(marker),'single definitive mobile layout exists');
 assert.match(final,/grid-template-columns:minmax\(0,1fr\) max-content/);
 assert.match(final,/grid-column:2;grid-row:1/);
 assert.match(final,/align-self:start/);
 assert.doesNotMatch(final,/flex-direction:column;align-items:stretch/);
 assert.doesNotMatch(final,/\.dossier-card-status\{[^}]*align-self:flex-end/);
});
