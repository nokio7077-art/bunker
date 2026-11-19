import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSurvivalStrategy, strategicBallot, isStrategicMessage, strategicDiscussion, rememberSurvivalPosition } from '../bot-strategy.js';
import { buildBotPrompt, explainOwnBotVote } from '../ai-bot.js';
import { act, createRoom, player, view } from '../game.js';

// The final dossier in 867872 included cards still closed at elimination.
// Replay those as closed until explicitly revealed in each test.
function replay() {
 const make = (id, name, cards, revealed, aiPersona) => ({
  ...player(name), id, name, cards, revealed, aiPersona, bot:Boolean(aiPersona), alive:true
 });
 const olga = make('olga','Ольга',{profession:'Учёный',luggage:'Охотничий нож в чехле',
  hobby:'Создание капканов и силков',health:'Запущенная чесотка',interesting:'Помогал медикам в полевых условиях'},
 ['profession','luggage','hobby']);
 const bio = make('bio','Бот 1',{profession:'Биолог',luggage:'Коробка консервированных овощей',
  hobby:'Выращивание микрозелени (Гидропоника)'},['profession','luggage','hobby'],'leader');
 const law = make('law','Бот 2',{profession:'Юрисконсульт',luggage:'Пачка бумаги А4 (500 листов)',
  health:'Тяжелая клиническая депрессия'},['profession','luggage'],'diplomat');
 const music = make('music','Бот 3',{profession:'Музыкант',luggage:'Пять килограммов сушёных бобовых',
  hobby:'Сохранение мяса без холодильника'},['profession','luggage','hobby'],'skeptic');
 const loader = make('loader','Бот 4',{profession:'Грузчик',health:'Паралич нижних конечностей',
  luggage:'Армейский жгут Эсмарха',interesting:'Пережил 3 месяца в тайге без снаряжения'},
 ['profession','health','luggage','interesting'],'gambler');
 const room = {...createRoom('867872',olga),players:[olga,bio,law,music,loader],testMode:true,aiMode:true,
  capacity:2,round:4,phase:'turn',disaster:{name:'Кибератака',hazard:'blackout',isolation_days:30},
  bunker:{food_days:300,water_days:30,energy_days:0,equipment:['Стеллажная теплица с фитолампами']},
  votes:{olga:'law'}};
 return { room,olga,bio,law,music,loader };
}

test('867872 scores every active candidate in pairs and conditions hydroponics on power',()=>{
 const {room,bio,law,loader}=replay();
 const strategy=buildSurvivalStrategy(room,bio);
 assert.equal(strategy.ranked.length,5);
 assert.ok(strategy.ranked.every(p=>p.bestTeam.members.length===2));
 assert.equal(strategy.self.evidence.find(e=>e.role==='grow').value,0);
 assert.ok(strategy.ranked.find(p=>p.id===loader.id).evidence.every(e=>e.role!=='mobility'));
 const reply=strategicDiscussion(room,law,'нас будет две в бункере ты зачем нам нужен то',room.players[0]).reply;
 assert.match(reply,/Мест 2, претендентов 5/);
 assert.match(reply,/Юрисконсульт.*Ольга/);
 assert.doesNotMatch(reply,/моральный дух|гармони|конфликт|ремонт|чесотка/i);
});

test('867872 changes its preferred partner when relevant evidence is opened',()=>{
 const {room,bio,music,olga,loader}=replay();
 room.turn=music.id;
 music.revealed=['profession','hobby'];
 loader.revealed=['profession','health'];
 assert.equal(buildSurvivalStrategy(room,bio).self.bestTeam.members[1].id,olga.id);
 rememberSurvivalPosition(room,bio,strategicDiscussion(room,bio));
 act(room,music,'reveal','luggage');
 const result=strategicDiscussion(room,bio,'Надо выбрать 2');
 assert.match(result.reply,/Пересматриваю состав: Бот 3.*бобовых/);
 music.alive=false;
 assert.ok(!buildSurvivalStrategy(room,bio).ranked.some(p=>p.id===music.id));
});

test('867872 builds a prospective ballot from open evidence and preserves private state',()=>{
 const {room,olga,bio,law,loader}=replay();
 room.aiVotePlans={[bio.id]:olga.id};
 const expected=strategicBallot(room,bio,[bio.id,law.id,loader.id]);
 assert.equal(expected.id,law.id);
 const reply=strategicDiscussion(room,bio,'Ты выбрал кого исключить?',olga).reply;
 assert.match(reply,/Предлагаю обсудить исключение/);
 assert.doesNotMatch(reply,/голосовал/);
 const threat=strategicDiscussion(room,loader,'бот 4 мертв, я его зарезал',olga);
 assert.match(threat.reply,/официальное голосование/);
 assert.equal(loader.alive,true);
 const prompt=JSON.parse(buildBotPrompt(room,bio).at(-1).content);
 assert.doesNotMatch(JSON.stringify(prompt.survivalStrategy),/чесотка|Помогал медикам|депрессия/);
 assert.ok(!Object.hasOwn(prompt,'votes'));
 rememberSurvivalPosition(room,bio,strategicDiscussion(room,bio));
 assert.ok(!Object.hasOwn(view(room,olga),'aiStrategyPositions'));
 room.phase='vote';
 room.votes={olga:law.id,law:bio.id};
 room.revoteCandidates=[law.id,loader.id];
 act(room,olga,'bot_votes');
 assert.equal(room.aiBotVoteHistory[bio.id][0].targetId,expected.id);
 assert.equal(room.aiBotVoteHistory[bio.id][0].reason,expected.reason);
});

function replay492837() {
 const {room,olga,bio,law,music,loader}=replay();
 room.code='492837';
 room.disaster={name:'Корь на фоне разрушения медицины',hazard:'airborne',isolation_days:45,requires:['sealed_air']};
 room.bunker={air_days:45,energy_days:90,equipment:['Фильтровентиляция с резервом на 45 суток изоляции']};
 for(const [person,cards] of [
  [olga,{profession:'Механизатор',health:'Синдром Котара',luggage:'Мешок овсяных хлопьев 10 кг'}],
  [bio,{profession:'Радиотелефонист'}],
  [law,{profession:'Пульмонолог'}],
  [music,{profession:'Дизайнер',luggage:'Портативный набор для промывания ран'}],
  [loader,{profession:'Эндокринолог',luggage:'Строительный фен'}]
 ]){
  person.cards=cards;
  person.revealed=Object.keys(cards).filter(key=>person!==olga||key!=='luggage');
 }
 return {room,olga,bio,law,music,loader};
}

test('492837 values technical and medical coverage within two seats',()=>{
 const {room,olga,bio,law,loader}=replay492837();
 const strategy=buildSurvivalStrategy(room,law);
 assert.equal(strategy.self.bestTeam.members[1].id,olga.id);
 assert.ok(strategy.ranked.find(p=>p.id===olga.id).evidence.every(e=>e.role!=='treatment'&&e.role!=='stores'));
 assert.equal(isStrategicMessage('Зачем нам два медика? Кто вам ченить что-либо будет'),true);
 const answer=strategicDiscussion(room,law,'Зачем нам два медика? Кто вам ченить что-либо будет',olga).reply;
 assert.match(answer,/Мест 2.*резерв фильтрации.*45.*перекрытие.*Механизатор.*не гарантирует/);
 assert.doesNotMatch(answer,/кончится кислород|Котара/);
 const radio=strategicDiscussion(room,bio,'а ты зачем нам нужен?',olga).reply;
 assert.match(radio,/при наличии оборудования и канала/);
 assert.equal(strategy.ranked.find(p=>p.id===loader.id).evidence.some(e=>e.label==='Строительный фен'),false);
});

test('492837 excludes expelled candidates and treats a building heat gun as insufficient',()=>{
 const {room,olga,bio,law,loader}=replay492837();
 loader.alive=false;
 const repair=strategicDiscussion(room,bio,'Строительный фен починит вентиляцию?',olga).reply;
 assert.match(repair,/фен сам по себе не подтверждает/);
 assert.doesNotMatch(repair,/Бот 4/);
 olga.alive=false;
 const reply=strategicDiscussion(room,law,'У вас был специалист, но вы меня выгнали',olga).reply;
 assert.match(reply,/Ольга уже выбыл.*Мест 2.*нет открытой карты с опытом обслуживания/);
 assert.doesNotMatch(reply,/фен|Бот 4|Прошу прощения/);
 const target=strategicBallot(room,law,[olga.id,loader.id,bio.id]);
 assert.equal(target.id,bio.id);
});

test('492837 explains the named ballot when asked about “4 бота”',()=>{
 const {room,bio,law,loader}=replay492837();
 room.aiBotVoteHistory={[bio.id]:[
  {round:2,targetId:loader.id,reason:'Медицина уже была представлена.'},
  {round:3,targetId:law.id,reason:'Другая причина.'}
 ]};
 const answer=explainOwnBotVote(room,bio,'Ты почему за 4 бота проголосовал?');
 assert.match(answer,/Бот 4.*Медицина уже была представлена/);
 assert.doesNotMatch(answer,/Бот 2|Другая причина/);
});
