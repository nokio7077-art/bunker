import { randomInt } from 'node:crypto';

// Interpretable, offline strategy. Bots assess OTHER players using public
// revelations only: private server-side cards never enter candidate scoring.
const PROFESSION_GROUPS=[
 {pattern:/врач|хирург|медик|фельдшер|медсестр|фармацевт|эпидемиолог|вирусолог|бактериолог|иммунолог|санитар|анестезиолог|реаниматолог|биолог|микробиолог/i,base:5,hazards:['airborne','contact','undead','chemical']},
 {pattern:/агроном|фермер|садовод|ботаник|зоотехник|животновод|пчеловод|овощевод|земледел|почвовед|ветеринар|рыбак|рыболов/i,base:4,hazards:['food','soil','drought','insects']},
 {pattern:/электрик|электромонт|энергетик|электроник|инженер|механик|техник|слесарь|сварщик|ремонтник|программист|системный администратор|кибербезопас/i,base:4,hazards:['blackout','machines','radiation','logistics']},
 {pattern:/строитель|архитектор|плотник|каменщик|шахтёр|горняк|геолог|бурильщик|сантехник|водопровод|водоочист|гидролог/i,base:4,hazards:['flood','water','cold','drought']},
 {pattern:/военн|спасател|пожарн|полицейск|охранник|следователь|разведчик|кинолог|стрелок/i,base:3,hazards:['undead','alien','logistics','machines']},
 {pattern:/повар|пекарь|технолог пищ|консерв|диетолог/i,base:3,hazards:['food','water','logistics']}
];
const NONESSENTIAL=/блогер|инфлюенсер|стример|промоутер|модель|звезда|актёр|ведущ|артист/i;
const NEGATIVE_HEALTH=/тяжел|тяжёл|терминальн|инвалидност|паралич|слепот|глухот|онколог|рак |астм|диабет|зависимост|иммунодефицит|инфаркт/i;
const POSITIVE_HEALTH=/здоров|отличн|спортсмен|крепк|без заболеван/i;
const RISK_PHOBIA=/паническ|агорафоб|клаустрофоб|страх замкнут|страх темнот/i;
const USEFUL_LUGGAGE=/аптечк|лекарств|антибиот|инструмент|набор|семен|фильтр|радиостанц|фонар|генератор|оружи|консерв|еда|вода|солнечн/i;
const USEFUL_HOBBY=/садовод|ремонт|электрон|первая помощь|поход|выживан|рыбалк|охот|кулинар|столяр|медицин/i;

function scoreCharacteristic(key,value,hazard=''){
 if(value==null)return -2;
 const text=String(value).toLowerCase();
 if(key==='profession'){
  const matching=PROFESSION_GROUPS.filter(group=>group.pattern.test(text));
  if(matching.length)return Math.max(...matching.map(g=>g.base+(g.hazards.includes(hazard)?4:0)));
  return NONESSENTIAL.test(text)?0:2;
 }
 if(key==='health')return NEGATIVE_HEALTH.test(text)?-3:POSITIVE_HEALTH.test(text)?3:0;
 if(key==='phobia')return RISK_PHOBIA.test(text)?-2:0;
 if(key==='luggage')return USEFUL_LUGGAGE.test(text)?3:0;
 if(key==='hobby')return USEFUL_HOBBY.test(text)?2:0;
 if(key==='personality')return /агрессив|эгоист|жесток|лжив|конфликт/i.test(text)?-2:/добр|ответствен|спокой|забот|команд/i.test(text)?2:0;
 return 0;
}
export function publicSurvivalScore(person,disaster){
 const hazard=disaster?.hazard||'';
 const revealed=person.revealed||[];
 // Public information only. An unseen profession is NOT scored secretly.
 return revealed.reduce((total,key)=>key==='special'?total:total+scoreCharacteristic(key,person.cards?.[key],hazard),0);
}
function noisyBest(items,score,random=randomInt){
 if(!items.length)return null;
 let chosen=items[0],best=-Infinity;
 for(const item of items){
  // Narrow bounded noise avoids identical votes without defeating strategy.
  const value=score(item)+(random(7)-3)*0.7;
  if(value>best){best=value;chosen=item;}
 }
 return chosen;
}

// A useful team needs complementary roles, not simply the most high-scoring
// individuals. Only revealed professions count when examining other players.
// The bot may use its own profession even before revealing it.
const TEAM_ROLES=[
 {id:'medical',match:PROFESSION_GROUPS[0].pattern,hazards:PROFESSION_GROUPS[0].hazards,base:3},
 {id:'food',match:PROFESSION_GROUPS[1].pattern,hazards:PROFESSION_GROUPS[1].hazards,base:3},
 {id:'engineering',match:PROFESSION_GROUPS[2].pattern,hazards:PROFESSION_GROUPS[2].hazards,base:3},
 {id:'construction',match:PROFESSION_GROUPS[3].pattern,hazards:PROFESSION_GROUPS[3].hazards,base:2},
 {id:'security',match:PROFESSION_GROUPS[4].pattern,hazards:PROFESSION_GROUPS[4].hazards,base:2},
 {id:'cooking',match:PROFESSION_GROUPS[5].pattern,hazards:PROFESSION_GROUPS[5].hazards,base:2}
];
function knownRoles(person,observer){
 if(!person?.alive)return [];
 if(person.id!==observer.id&&!person.revealed?.includes('profession'))return [];
 const profession=person.cards?.profession;
 if(!profession)return [];
 return TEAM_ROLES.filter(role=>role.match.test(String(profession))).map(role=>role.id);
}
function teamRoleWeights(room){
 const hazard=room.disaster?.hazard;
 const inventory=(room.bunker?.equipment||[]).join(' ').toLowerCase();
 const weights=Object.fromEntries(TEAM_ROLES.map(role=>[
  role.id,role.base+(role.hazards.includes(hazard)?4:0)
 ]));
 // Shelter deficiencies change which specialists the team needs.
 if(/генератор|электр|кабель|насос|вентиляц|фильтр/i.test(inventory))weights.engineering+=2;
 if(/теплиц|грядк|семен|гидропон|грибниц/i.test(inventory))weights.food+=2;
 if(/аптечк|медицин|операцион/i.test(inventory))weights.medical+=1;
 if(/затоплен|обвал|протеч|неустойчив/i.test((room.bunker?.threats||[]).join(' ')))weights.construction+=2;
 return weights;
}
// How much one participant contributes to a balanced *remaining* team.
// Second/third expert in the same area still helps, but less than the first.
export function teamSkillContribution(room,person,observer){
 const skills=knownRoles(person,observer);
 if(!skills.length)return 0;
 const others=room.players.filter(p=>p.alive&&p.id!==person.id);
 const weights=teamRoleWeights(room);
 return skills.reduce((sum,role)=>{
  const existing=others.filter(p=>knownRoles(p,observer).includes(role)).length;
  return sum+weights[role]/(1+existing*1.5);
 },0);
}

export function chooseBotVote(room,bot,candidates,random=randomInt){
 const eligible=room.players.filter(p=>p.id!==bot.id&&candidates.includes(p.id));
 if(!eligible.length)return null;
 // Favor removal of the weakest publicly-known survival profile.
 return noisyBest(eligible,p=>-(publicSurvivalScore(p,room.disaster)+teamSkillContribution(room,p,bot)*1.65),random)?.id||null;
}
export function chooseBotReveal(room,bot,available,random=randomInt){
 if(room.round===1&&available.includes('profession'))return 'profession';
 const candidates=available.filter(k=>k!=='special');
 // Don't waste a normal turn on an action card if other cards remain.
 const pool=candidates.length?candidates:available;
 if(!pool.length)return null;
 return noisyBest(pool,key=>scoreCharacteristic(key,bot.cards[key],room.disaster?.hazard)+(key==='profession'?teamSkillContribution(room,bot,bot)*1.2:0),random);
}
export function chooseBotSpecialTarget(room,bot,card,targets,random=randomInt){
 if(!targets.length)return null;
 const category=card.category;
 const hazard=room.disaster?.hazard;
 const own=scoreCharacteristic(category,bot.cards[category],hazard);
 return noisyBest(targets,p=>{
  const theirPublic=publicSurvivalScore(p,room.disaster);
  const theirCard=p.revealed.includes(category)?scoreCharacteristic(category,p.cards[category],hazard):0;
  if(card.effect==='reveal')return p.id===bot.id?-4:2+theirPublic;
  if(card.effect==='discard')return p.id===bot.id?-own:theirCard+theirPublic*.2;
  if(card.effect==='swap')return theirCard-own+(p.revealed.includes(category)?1:0);
  return 0;
 },random);
}
