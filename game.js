import { randomInt, randomBytes } from 'node:crypto';
import { categories, decks } from './cards.js';
import { createBiologyCard } from './biology.js';
import { chooseWorld } from './world.js';
import { cardDescription, eligibleCard, healthyCard } from './card-catalog.js';
import { applySpecial } from './special-actions.js';
import { specialCard } from './special-cards.js';
export { categories };
const pick = a => a[randomInt(a.length)];
const id = () => randomBytes(18).toString('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
export const firstVoteRound = n => Math.max(1, 9 - n);
// Server-authoritative deadlines: absence must not block an entire session.
export const TURN_TIMEOUT_MS = 3 * 60 * 1000 + 16 * 1000;
export const VOTE_TIMEOUT_MS = 2 * 60 * 1000;
export const GAME_MODES={fast:{name:'Быстрая',turn:60_000,vote:60_000,discussion:75_000},classic:{name:'Классическая',turn:TURN_TIMEOUT_MS,vote:VOTE_TIMEOUT_MS,discussion:120_000},long:{name:'Длинная',turn:240_000,vote:180_000,discussion:180_000}};
const modeSettings=room=>GAME_MODES[room.mode]||GAME_MODES.classic;
export const HOST_INACTIVE_MS = 3 * 60 * 1000;
const human = p => !p.bot;
export function player(name) {
 name = String(name ?? '').trim();
 check(name.length >= 2 && name.length <= 24, 'Имя должно содержать от 2 до 24 символов.');
 return { id: id(), token: id(), recoveryCode: randomBytes(12).toString('hex'), lastSeen: Date.now(), name, alive: true, revealed: [], cards: {} };
}
export function createRoom(code, p) {
 return { code, host: p.id, players: [p], phase: 'lobby', gameNumber: 1, round: 0, mode:'classic', votes: {}, voteHistory:[], log: [], updated: Date.now() };
}
export function join(room, p) {
 check(room.phase === 'lobby', 'Игра уже началась. Присоединиться можно к новой комнате.');
 check(room.players.length < 16, 'В комнате уже 16 игроков.');
 check(!room.players.some(x => x.name.toLowerCase() === p.name.toLowerCase()), 'Это имя уже занято.');
 room.players.push(p);
}
export function act(room, p, action, value) {
 if (action === 'next_game') {
  check(room.phase === 'finished' && room.host === p.id, 'Следующую партию готовит ведущий после завершения игры.');
  const humans=room.players.filter(x=>!x.bot),next=humans[(humans.findIndex(x=>x.id===room.host)+1)%humans.length];
  const index=room.players.findIndex(x=>x.id===next.id),players=[...room.players.slice(index),...room.players.slice(0,index)];
  const gameNumber=(room.gameNumber||1)+1,testMode=room.testMode,mode=room.mode||'classic';
  for(const person of players){person.alive=true;person.cards={};person.revealed=[];delete person.specialUsed;}
  const fresh={...createRoom(room.code,next),players,gameNumber,mode};if(testMode)fresh.testMode=true;
  for(const key of Object.keys(room))delete room[key];Object.assign(room,fresh);
  room.log.push(`Партия ${gameNumber}. Ведущий и первое слово: ${next.name}.`);
  } else if (action === 'set_mode') {
  check(room.host===p.id && room.phase==='lobby', 'Режим может изменить только ведущий до начала партии.');
  check(Object.hasOwn(GAME_MODES,value), 'Неизвестный режим партии.');
  room.mode=value;
  room.log.push(`Режим игры: ${GAME_MODES[value].name}.`);
 } else if (action === 'transfer_host') {
  check(room.host === p.id, 'Передать роль ведущего может только действующий ведущий.');
  const target = room.players.find(x => x.id === value && human(x));
  check(target && target.id !== p.id, 'Выберите другого участника (не бота).');
  room.host = target.id;
  room.log.push(`Ведущий теперь ${target.name}.`);
 } else if (action === 'start_test') {
  check(room.host === p.id && room.phase === 'lobby', 'Тестовую игру запускает ведущий до начала партии.');
  check(room.players.length < 5, 'В комнате уже достаточно участников для обычной игры.');
  let number = 1;
  while (room.players.length < 5) {
   const name = `Бот ${number++}`;
   if (room.players.some(x => x.name.toLowerCase() === name.toLowerCase())) continue;
   const bot = player(name); bot.bot = true; join(room, bot);
  }
  room.testMode = true;
  act(room, p, 'start');
  room.log.push('Тестовая партия: ведущий запускает ходы ботов, их голоса поступают автоматически после голосов всех людей.');
 } else if (action === 'bot_step') {
  check(room.testMode && room.host === p.id && room.phase === 'turn', 'Управление ботами доступно ведущему в тестовой партии.');
  const bot = room.players.find(x => x.id === room.turn);
  check(bot?.bot && bot.alive, 'Сейчас ход живого участника, а не бота.');
  if (!room.opened) {
   const remaining = Object.keys(bot.cards).filter(k => bot.cards[k] && !bot.revealed.includes(k));
   if (remaining.length) act(room, bot, 'reveal', room.round === 1 ? 'profession' : pick(remaining));
  }
  act(room, bot, 'next');
 } else if (action === 'bot_votes') {
  check(room.testMode && room.host === p.id && ['vote','tiebreak'].includes(room.phase), 'Голоса ботов запускает ведущий во время голосования.');
  const bots = room.players.filter(x => x.bot && !Object.hasOwn(room.votes, x.id));
  check(bots.length > 0, 'Все боты уже проголосовали.');
  const candidates = room.phase==='tiebreak' ? room.tiedCandidates : room.players.filter(x => x.alive).map(x => x.id);
  for (const bot of bots) act(room, bot, 'vote', pick(candidates.filter(id=>id!==bot.id)));
 } else if (action === 'start') {
  check(room.host === p.id && room.phase === 'lobby', 'Только ведущий может начать игру.');
  check(room.players.length >= 5, 'Для игры нужно от 5 до 16 участников.');
  // Stage the entire round separately: if card generation fails no player receives
  // partial cards and the lobby remains intact.
  const draft=structuredClone(room);
  draft.capacity=Math.floor(draft.players.length/2);
  draft.firstVote= draft.mode==='fast' ? Math.min(2,firstVoteRound(draft.players.length)) : firstVoteRound(draft.players.length);
  Object.assign(draft,chooseWorld(draft.capacity));
  const pools=Object.fromEntries(Object.entries(decks).map(([k,v])=>[k,[...v]]));
  for(const person of draft.players){
   person.cards.biology=createBiologyCard();
   for(const [k,pool] of Object.entries(pools)){
    let eligible=pool.filter(name=>eligibleCard(k,name,person.cards.biology,draft.disaster));
    if(k==='health'){
     const wantHealthy=randomInt(4)===0;
     const preferred=eligible.filter(name=>healthyCard(name)===wantHealthy);
     if(preferred.length)eligible=preferred;
    }
    if(!eligible.length)throw new Error(`Недостаточно подходящих карточек: ${k}`);
    const name=pick(eligible);person.cards[k]=name;pool.splice(pool.indexOf(name),1);
   }
  }
  draft.phase='turn';draft.round=1;draft.turn=draft.players[0].id;draft.opened=false;
  draft.turnDeadline=Date.now()+modeSettings(draft).turn;delete draft.voteDeadline;
  draft.log.push('Шлюз закрыт. Начинается знакомство.');
  Object.assign(room,draft);
 } else if (action === 'use_special') {
  applySpecial(room, p, value);
 } else if (action === 'reveal') {
  check(room.phase === 'turn' && room.turn === p.id && p.alive, 'Сейчас ход другого игрока.');
  check(!room.opened && Object.hasOwn(categories,value) && p.cards[value] && !p.revealed.includes(value), 'Эту карточку сейчас нельзя открыть.');
  check(room.round !== 1 || value === 'profession', 'В первом круге откройте профессию.');
  p.revealed.push(value); room.opened = true;
  room.log.push(`${p.name} открывает: ${categories[value]}.`);
 } else if (action === 'next') {
  check(room.phase === 'turn' && room.turn === p.id, 'Передать слово может только текущий игрок.');
  check(room.opened || !Object.keys(p.cards).some(k => p.cards[k] && !p.revealed.includes(k)), 'Сначала откройте карточку.');
  nextTurn(room);
 } else if (action === 'vote') {
  check(['vote','tiebreak'].includes(room.phase), 'Голосование ещё не началось.');
  check(!Object.hasOwn(room.votes,p.id), 'Ваш голос уже принят.');
  const eligibleTargets=room.phase==='tiebreak' ? room.tiedCandidates : room.players.filter(x=>x.alive).map(x=>x.id);
  check(eligibleTargets.includes(value)&&value!==p.id, room.phase==='tiebreak' ? 'Сейчас можно голосовать только за участников с равным числом голосов, кроме себя.' : 'Нельзя голосовать за себя. Выберите другого игрока в бункере.');
  room.votes[p.id] = value;
  if (room.testMode && room.players.filter(x => !x.bot).every(x => Object.hasOwn(room.votes,x.id))) {
   const candidates = room.phase==='tiebreak' ? room.tiedCandidates : room.players.filter(x => x.alive).map(x => x.id);
   for (const bot of room.players.filter(x => x.bot && !Object.hasOwn(room.votes,x.id)))room.votes[bot.id]=pick(candidates.filter(id=>id!==bot.id));
  }
  if (Object.keys(room.votes).length === room.players.length) finishVote(room);
 } else throw new Error('Неизвестное действие.');
 room.updated = Date.now();
}
function newRound(room, now=Date.now()) {
 room.round++;room.phase='turn';room.turn=room.players.find(x=>x.alive).id;room.opened=false;room.votes={};
 room.turnDeadline=now+modeSettings(room).turn;delete room.voteDeadline;delete room.tiedCandidates;
}
function nextTurn(room,now=Date.now()){
 const alive=room.players.filter(x=>x.alive),pos=alive.findIndex(x=>x.id===room.turn);
 if(pos<0)throw new Error('Текущий игрок не найден в списке выживших.');
 if(pos<alive.length-1){room.turn=alive[pos+1].id;room.opened=false;room.turnDeadline=now+modeSettings(room).turn;}
 else if(room.round>=room.firstVote){room.phase='vote';room.votes={};delete room.turnDeadline;room.voteDeadline=now+modeSettings(room).vote;room.log.push(`Круг ${room.round}: начинается голосование.`);}
 else newRound(room,now);
}
function finishVote(room,now=Date.now()){
 const runoff=room.phase==='tiebreak';
 const scores={};for(const target of Object.values(room.votes))scores[target]=(scores[target]||0)+1;
 const max=Math.max(0,...Object.values(scores));
 const eligible=runoff?[...room.tiedCandidates]:room.players.filter(x=>x.alive).map(x=>x.id);
 const candidates=max===0?eligible:eligible.filter(id=>scores[id]===max);
 room.voteHistory??=[];
 room.voteHistory.push({
  round:room.round,runoff,ballots:{...room.votes},scores:{...scores},candidates:[...eligible],
  tied:[...candidates],abstained:room.players.length-Object.keys(room.votes).length,
  at:now
 });
 if(!runoff&&candidates.length>1){
  room.phase='tiebreak';room.tiedCandidates=[...candidates];room.votes={};
  room.voteDeadline=now+modeSettings(room).discussion;
  room.log.push(`Обсуждение при ничьей. Повторное голосование только за: ${candidates.map(id=>room.players.find(p=>p.id===id)?.name).join(', ')}. Другие игроки могут использовать особые условия.`);
  return;
 }
 // If the second ballot ties as well, a visible random draw resolves it.
 const loserId=pick(candidates),loser=room.players.find(x=>x.id===loserId);
 loser.alive=false;
 room.lastVote={scores,eliminated:loser.id,tie:runoff||candidates.length>1,
  draw:runoff&&candidates.length>1,abstained:room.players.length-Object.keys(room.votes).length};
 room.voteHistory.at(-1).eliminated=loser.id;
 room.log.push(`${loser.name} покидает бункер (${max} голосов)${runoff&&candidates.length>1?'. После повторной ничьей решает жребий':''}.`);
 delete room.tiedCandidates;
 if(room.players.filter(x=>x.alive).length<=room.capacity){
  room.phase='finished';room.turn=null;delete room.turnDeadline;delete room.voteDeadline;
  room.log.push('Состав убежища определён.');
 }else newRound(room,now);
}
// Mutates only when a deadline expires or an inactive host needs replacement.
// Called by the server's periodic scheduler and before processing incoming actions.
export function advanceRoom(room,now=Date.now()){
 let changed=false;
 if(room.phase==='turn'){
  if(!room.turnDeadline){room.turnDeadline=now+modeSettings(room).turn;changed=true;}
  else if(now>=room.turnDeadline){
   const p=room.players.find(x=>x.id===room.turn);
   if(p&&!room.opened){
    const available=Object.keys(p.cards).filter(k=>p.cards[k]&&!p.revealed.includes(k));
    const key=room.round===1&&available.includes('profession')?'profession':available[0];
    if(key){p.revealed.push(key);room.opened=true;room.log.push(`Время вышло: ${p.name} автоматически открывает ${categories[key]}.`);}
   }
   room.log.push(`Время хода ${p?.name||'участника'} истекло. Слово передано автоматически.`);
   nextTurn(room,now);changed=true;
  }
 }else if(['vote','tiebreak'].includes(room.phase)){
  if(!room.voteDeadline){room.voteDeadline=now+(room.phase==='tiebreak'?modeSettings(room).discussion:modeSettings(room).vote);changed=true;}
  else if(now>=room.voteDeadline){
   room.log.push('Время голосования вышло. Отсутствующие голоса считаются воздержанием.');
   finishVote(room,now);changed=true;
  }
 }
 const current=room.players.find(x=>x.id===room.host);
 if(current&&!current.bot&&now-(current.lastSeen??room.updated??now)>=HOST_INACTIVE_MS){
  const replacement=room.players.filter(x=>human(x)&&x.id!==current.id&&(now-(x.lastSeen??0))<HOST_INACTIVE_MS).sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0))[0];
  if(replacement){room.host=replacement.id;room.log.push(`Ведущий ${current.name} неактивен. Роль передана ${replacement.name}.`);changed=true;}
 }
 if(changed)room.updated=now;
 return changed;
}
export function view(room, me) {
 const { players, votes, voteHistory, lastActivityAt, privateSpecialHistory, ...rest } = room;
 const ownSpecialChanges=(privateSpecialHistory||[]).flatMap(event=>event.results.filter(r=>r.playerId===me.id).map(r=>({eventId:event.id,before:r.before,after:r.after})));
 return { ...rest, voteHistory:room.phase==='finished'?(voteHistory||[]):[], gameModes:GAME_MODES, specialPrivateResults:ownSpecialChanges, categories, me: me.id, recoveryCode: me.recoveryCode, specialAvailable: Boolean(specialCard(me.cards.special)) && !me.specialUsed, hasVoted: Object.hasOwn(votes,me.id), votedFor: votes[me.id] || null, voteCount: Object.keys(votes).length,
  pendingBotVotes: players.filter(p => p.bot && !Object.hasOwn(votes,p.id)).length,
  players: players.map(({token, recoveryCode, lastSeen, cards, ...p}) => {
   const visible = p.id===me.id || room.phase==='finished' ? cards : Object.fromEntries(p.revealed.map(k=>[k,cards[k]]));
   return {...p, connected: p.bot ? null : Date.now() - (lastSeen ?? 0) < 35000, cards: visible, descriptions: Object.fromEntries(Object.entries(visible).map(([k,name])=>[k,cardDescription(k,name)]).filter(([,description])=>description))};
  }) };
}
