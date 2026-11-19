import { botPersona } from './bot-personas.js';

const priorities = {
 blackout: { power: 6, food: 3, stores: 4 },
 food: { food: 6, stores: 5 }, soil: { food: 5, stores: 4 },
 drought: { water: 6, food: 4 }, water: { water: 6 }, flood: { water: 5, shelter: 5 },
 airborne: { medicine: 6, shelter: 5 }, contact: { medicine: 6 },
 chemical: { water: 5, shelter: 5 }, radiation: { shelter: 6, power: 4 },
 cold: { shelter: 6, power: 5 }, machines: { power: 5 }, undead: { shelter: 5, medicine: 4 }
};

const cards = [
 ['profession', /пульмонолог/i, 'medicine', 2, 'помощь при дыхательных осложнениях по специальности'],
 ['profession', /эндокринолог/i, 'medicine', 1, 'медицинская помощь по своему профилю'],
 ['profession', /механизатор|механик/i, 'maintenance', 2, 'обслуживание техники по специальности'],
 ['profession', /радиотелефонист/i, 'communication', 1, 'работа со связью при наличии оборудования и канала'],
 ['profession', /электрик|электромонт|энергетик|электротехник/i, 'power', 2, 'обслуживание питания'],
 ['profession', /врач|фельдшер|медсестр|хирург|реаниматолог/i, 'medicine', 2, 'медицинская помощь'],
 ['profession', /сантехник|водоочист|водопровод/i, 'water', 2, 'обслуживание воды'],
 ['profession', /строитель|плотник|сварщик|слесарь/i, 'shelter', 1, 'ремонт по специальности'],
 ['profession', /агроном|фермер|садовод|биолог|ботаник/i, 'food', 1, 'знания о живых системах'],
 ['profession', /повар|пекарь|технолог пищ/i, 'stores', 1, 'работа с продуктами'],
 ['profession', /уч[её]ный/i, 'analysis', 1, 'анализ и проверка гипотез'],
 ['profession', /грузчик/i, 'mobility', 1, 'перенос запасов'],
 ['luggage', /консерв|суш[её]ных бобовых|питьевая вода/i, 'stores', 1, 'добавка к резервам'],
 ['luggage', /охотничий нож|инструмент/i, 'tools', 1, 'инструмент по назначению'],
 ['luggage', /аптечк|жгут|бинт|промывания ран/i, 'medicalSupply', 1, 'медицинское оснащение'],
 ['hobby', /гидропоник|микрозелен/i, 'grow', 1, 'гидропоника зависит от пригодной установки и питания'],
 ['hobby', /капкан|силк/i, 'outside', 1, 'добыча после разрешённого выхода'],
 ['hobby', /сохранение мяса/i, 'preservation', 1, 'сохранение мяса без холодильника при наличии мяса'],
 ['hobby', /первая помощь/i, 'medicine', 1, 'первая помощь'],
 ['interesting', /помогал медикам/i, 'medicine', 0.5, 'опыт помощи медикам'],
 ['interesting', /выжил|пережил.{0,60}тайг/i, 'outside', 1, 'опыт выживания снаружи'],
 ['health', /паралич нижних конечностей/i, 'access', -1, 'нужно проверить доступность проходов и физические задачи'],
 ['health', /чесотк/i, 'treatment', -1, 'нужны лечение и меры против передачи'],
 ['health', /тяж[её]лая клиническая депрессия|диабет/i, 'treatment', -0.5, 'нужно проверить доступность поддержки или лечения'],
 ['health', /бронхит|астм/i, 'air', -0.5, 'важно качество воздуха'],
 ['phobia', /клаустрофоб|страх замкнут/i, 'access', -0.5, 'важна переносимость замкнутого пространства']
];

function scenario(room, bot) {
 const bunker = room.bunker || {};
 const disaster = room.disaster || {};
 const hazard = disaster.hazard || '';
 const weight = { power: 2, water: 2, food: 2, stores: 3, medicine: 2, shelter: 2,
  analysis: 1.5, mobility: 0.5, tools: 1, medicalSupply: 1, grow: 1,
  outside: 1, preservation: 1.5, access: 1, treatment: 2, air: 1, maintenance: 2, communication: 1,
  ...priorities[hazard] };
 const supplies = [['еда', bunker.food_days], ['вода', bunker.water_days], ['энергия', bunker.energy_days]];
 const daysKnown = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
 const horizon = disaster.isolation_days || 0;
 const deficit = (days, minimum) => daysKnown(days) && days < Math.max(minimum, horizon);
 if (deficit(bunker.food_days, 30)) weight.stores += 2;
 if (deficit(bunker.water_days, 30)) weight.water += 2;
 if (deficit(bunker.energy_days, 30)) weight.power += 2;
 const airDays = bunker.air_days;
 const equipment = Array.isArray(bunker.equipment) ? bunker.equipment : [];
 const sealedAir = equipment.some(item => /фильтровентиляц|герметич/i.test(item)) ||
  disaster.requires?.includes('sealed_air');
 const airReserve = daysKnown(airDays) && sealedAir ?
  'По карточке резерв фильтрации в изоляции — '+airDays+' сут.' : '';
 if (sealedAir && (hazard === 'airborne' || (horizon > 0 && daysKnown(airDays) && airDays <= horizon))) {
  weight.maintenance += 3;
  weight.air += 1;
 }
 const growingEquipment = equipment.some(item => /теплиц|гидропон/i.test(item));
 if (!growingEquipment || hazard === 'blackout' || deficit(bunker.energy_days, 30)) weight.grow = 0;
 if (horizon > 0) weight.outside *= 0.5;
 const persona = botPersona(bot).id;
 if (persona === 'skeptic') { weight.stores += 1; weight.outside *= 0.5; }
 if (persona === 'gambler') weight.outside += 1;
 if (persona === 'leader') weight.power += 1;
 if (persona === 'diplomat') weight.medicine += 1;
 const reserve = supplies.filter(([,n]) => daysKnown(n)).map(([label,n]) => label+' — '+n+' сут.').join(', ');
 const constraint = hazard === 'blackout' ? 'Гидропонику нельзя считать источником еды без подтверждённого питания' :
  horizon ? 'Изоляция — '+horizon+' сут.; вылазки учитываю только после неё' :
   'Сначала проверяю, чем пополнить реальные запасы';
 return { weight, reserve, constraint, airReserve, disaster: disaster.name || (Array.isArray(disaster) ? disaster[0] : '') };
}

function assess(player, weight) {
 const open = Object.fromEntries((player.revealed || []).filter(key => key !== 'special' &&
  Object.hasOwn(player.cards || {}, key)).map(key => [key, String(player.cards[key] ?? '')]));
 const limitedMobility = /паралич нижних конечностей/i.test(open.health || '');
 const evidence = cards.filter(([key, test, role]) => test.test(open[key] || '') &&
  !(role === 'mobility' && limitedMobility)).map(([key,,role, level, reason]) => ({
  role, value: level * weight[role], label: open[key], reason
 })).sort((a,b) => b.value - a.value);
 return { id: player.id, name: player.name, profession: open.profession, evidence };
}

function teamScore(team) {
 const coverage = new Map();
 let score = 0;
 for (const person of team) {
  for (const fact of person.evidence) {
   if (fact.value <= 0 || fact.role === 'stores') score += fact.value;
   else coverage.set(fact.role, Math.max(coverage.get(fact.role) || 0, fact.value));
  }
 }
 for (const value of coverage.values()) score += value;
 if (coverage.has('medicalSupply') && coverage.has('medicine')) score += 1;
 if (coverage.has('tools') && coverage.has('outside')) score += 1;
 return score;
}

const compareTeams = (a,b) => b.score - a.score;

export function buildSurvivalStrategy(room, bot) {
 const situation = scenario(room, bot);
 const active = room.players.filter(p => p.alive).map(p => assess(p, situation.weight));
 const capacity = Number.isInteger(room.capacity) && room.capacity > 0 ? room.capacity : null;
 const size = Math.min(capacity || active.length, active.length);
 const self = active.find(p => p.id === bot.id);
 const ranked = active.map(person => {
  // For two seats this visits every pair. For larger rooms try every seed pair,
  // then fill remaining seats by marginal value to keep work bounded.
  const seeds = size > 1 ? active.filter(p => p !== person) : [null];
  const teams = seeds.map(partner => {
   const members = partner ? [person, partner] : [person];
   while (members.length < size) {
    const best = active.filter(p => !members.includes(p))
     .map(p => ({p, score:teamScore([...members,p])})).sort(compareTeams)[0];
    members.push(best.p);
   }
   return { members, score:teamScore(members) };
  }).sort(compareTeams);
  return { ...person, individual:teamScore([person]), bestTeam:teams[0] };
 }).sort((a,b) => b.bestTeam.score - a.bestTeam.score || b.individual - a.individual);
 return { capacity, activeCount:active.length, self:ranked.find(p => p.id === self?.id), ranked,
  reserve:situation.reserve, constraint:situation.constraint, airReserve:situation.airReserve, disaster:situation.disaster };
}

const short = value => String(value).slice(0, 75);
function strength(person) {
 const fact = person.evidence.find(item => item.value > 0);
 if (fact) return '«'+short(fact.label)+'» — '+fact.reason;
 const conditional = person.evidence.find(item => item.role === 'grow');
 if (conditional) return conditional.reason;
 return person.profession ? '«'+short(person.profession)+'» пока не закрывает критическую задачу' :
  'по открытым картам вклад пока неясен';
}
function concern(person) {
 const fact = person.evidence.findLast(item => item.value < 0);
 return fact ? '«'+short(fact.label)+'» — '+fact.reason : null;
}
function chooseTarget(strategy, bot, candidates) {
 const allowed = strategy.ranked.filter(p => p.id !== bot.id && candidates.includes(p.id));
 const protectedIds = new Set(strategy.self?.bestTeam.members.map(p => p.id));
 return [...allowed].reverse().find(p => !protectedIds.has(p.id)) || allowed.at(-1);
}

export function strategicBallot(room, bot, candidates) {
 const strategy = buildSurvivalStrategy(room, bot);
 const target = chooseTarget(strategy, bot, candidates);
 if (!target) return null;
 const evidence = strength(target);
 const risk = concern(target);
 return { id:target.id, reason:(evidence+(risk ? '. '+risk : '')).slice(0,180) };
}

const maintenanceTopic = /вентиляц|фильтр|кислород|запас воздуха|строительн.{0,12}фен|почин|ч[еи]нить|два\s+(?:медика|врача)|двух\s+(?:медиков|врачей)|один врач|1 врач/i;

export function isStrategicMessage(message) {
 return !message || maintenanceTopic.test(message) ||
  /мест|двое|две в бункер|выбрать|исключ|выгна|состав|полез|нужен|нужна|чем ты|зачем|бот\s*\d|горло|зареж|м[её]рт|труп|убью|поменял|гидропоник/i.test(message);
}

export function strategicDiscussion(room, bot, message = '', speaker) {
 const strategy = buildSurvivalStrategy(room, bot);
 const {self, ranked, capacity, activeCount, reserve, constraint, airReserve, disaster} = strategy;
 if (!self || !capacity) return null;
 const text = message.toLowerCase();
 const teammates = self.bestTeam.members.filter(p => p.id !== self.id);
 const rival = ranked.find(p => p.id !== bot.id && !teammates.some(member => member.id === p.id));
 const named = ranked.find(p => p.id !== bot.id && p.name.length > 1 && text.includes(p.name.toLowerCase()));
 const asker = ranked.find(p => p.id === speaker?.id);
 const subject = named || asker || rival;
 const previous = room.aiStrategyPositions?.[bot.id];
 const ids = teammates.map(p => p.id).sort().join(',');
 const fingerprint = JSON.stringify([capacity, reserve, constraint, airReserve, disaster,
  ranked.map(p => [p.id, p.profession, p.evidence])]);
 const changed = previous && previous.fingerprint !== fingerprint && previous.ids !== ids;
 const position = { fingerprint, ids };
 const prefix = 'Мест '+capacity+', претендентов '+activeCount+'. ';
 const partner = teammates[0];
 const pair = partner ? 'Мой выбор рядом со мной: '+teammates.map(p => p.name).join(', ')+'. ' : '';
 const revising = changed && partner ? 'Пересматриваю состав: '+partner.name+' — '+strength(partner)+'. ' : '';
 const selfCase = 'За моё место: '+strength(self)+'. ';
 const selfRisk = concern(self);
 const compare = subject && subject.id !== self.id ? subject.name+': '+strength(subject)+'. ' : '';
 const candidate = chooseTarget(strategy, bot, room.revoteCandidates || ranked.map(p => p.id));
 const same = previous?.fingerprint === fingerprint && previous?.message === text;
 const hasHydroponics = [self, ...teammates].some(p => p.evidence.some(item => item.role === 'grow'));
 let reply;
 const afterExpulsion = speaker && !speaker.alive && /выгна|исключ|был специалист/i.test(text);
 if (afterExpulsion) {
  reply = speaker.name+' уже выбыл(а) по итогам голосования. '+prefix+pair+
   (airReserve ? airReserve+' ' : '')+
   (ranked.some(p => p.evidence.some(e => e.role === 'maintenance')) ?
    'По оставшимся картам отдельно проверю, кто может обслуживать технику.' :
    'У оставшихся нет открытой карты с опытом обслуживания техники.');
 } else if (maintenanceTopic.test(text)) {
  const specialists = ranked.filter(p => p.evidence.some(e => e.role === 'maintenance'));
  const tech = specialists[0];
  const repair = tech ? tech.name+' — '+strength(tech)+'. ' :
   'Среди оставшихся не подтверждён опыт обслуживания техники. ';
  const limit = /фен/i.test(text) ? 'Строительный фен сам по себе не подтверждает возможность ремонта вентиляции. ' :
   'Обслуживание техники не гарантирует ремонт фильтров. ';
  const overlap = /медик|врач/i.test(text) ? 'У двух врачей есть перекрытие по медпомощи. ' : '';
  reply = prefix+(airReserve ? airReserve+' ' : '')+(same ? limit+repair : overlap+repair+limit)+pair;
 } else if (same) {
  const drawback = subject && concern(subject);
  reply = prefix+(reserve ? 'Резервы: '+reserve+'. ' : '')+constraint+'. '+
   (drawback ? subject.name+': '+drawback+'.' : rival ? 'Что '+rival.name+' может подтвердить открытой картой?' : selfCase);
 } else if (/зареж|горло|м[её]рт|убью|ты труп|поменял.{0,18}(?:хобби|карт)|(?:хобби|карт).{0,18}поменял/.test(text)) {
  const event = /поменял/.test(text) ? 'Обмен карт проверяется в журнале условий.' : 'Статус игроков определяет официальное голосование.';
  return {reply:event, position:previous};
 } else if (/(?:кого|кто).{0,30}(?:исключ|выгна)|(?:исключ|выгна).{0,30}(?:кого|кого-то)/.test(text) && candidate) {
  reply = prefix+revising+'Предлагаю обсудить исключение '+candidate.name+'. '+strength(candidate)+'. '+pair;
 } else if (/полез|нужен|нужна|зачем.{0,24}(?:нам|ты|тебе)|чем ты|тво[яё] место/.test(text)) {
  reply = prefix+revising+selfCase+(selfRisk ? selfRisk+'. ' : '')+compare+
   (self.evidence.some(f => f.value > 0) ? pair : 'За своё место могу спорить, если открою карту с конкретным вкладом. ');
 } else if (named) {
  reply = prefix+revising+compare+(concern(named) ? concern(named)+'. ' : '')+pair+selfCase;
 } else {
  reply = prefix+revising+pair+(partner && !changed ? partner.name+' — '+strength(partner)+'. ' : '')+
   selfCase+(hasHydroponics ? constraint+'. ' :
    (airReserve ? airReserve+' ' : reserve ? 'Резервы: '+reserve+'. ' : constraint+'. '));
  if (disaster && reply.length < 300) reply += 'Сценарий: '+disaster+'.';
 }
 reply = reply.trim();
 if (reply.length > 420) {
  const end = [...reply.slice(0,420).matchAll(/[.!?](?=\s)/gu)].at(-1)?.index;
  reply = end === undefined ? reply.slice(0,420).replace(/\s+\S*$/, '')+'.' : reply.slice(0,end+1);
 }
 return { reply,
  position:{...position, message:text} };
}

export function rememberSurvivalPosition(room, bot, result) {
 if (!result?.position) return;
 room.aiStrategyPositions ??= {};
 room.aiStrategyPositions[bot.id] = result.position;
}
