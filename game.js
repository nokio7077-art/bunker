import { randomInt, randomBytes } from 'node:crypto';
import { categories, decks, disasters, bunkers } from './cards.js';
export { categories };
const pick = a => a[randomInt(a.length)];
const id = () => randomBytes(18).toString('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
export const firstVoteRound = n => Math.max(1, 9 - n);
export function player(name) {
 name = String(name ?? '').trim();
 check(name.length >= 2 && name.length <= 24, 'Имя должно содержать от 2 до 24 символов.');
 return { id: id(), token: id(), name, alive: true, revealed: [], cards: {} };
}
export function createRoom(code, p) {
 return { code, host: p.id, players: [p], phase: 'lobby', round: 0, votes: {}, log: [], updated: Date.now() };
}
export function join(room, p) {
 check(room.phase === 'lobby', 'Игра уже началась. Присоединиться можно к новой комнате.');
 check(room.players.length < 16, 'В комнате уже 16 игроков.');
 check(!room.players.some(x => x.name.toLowerCase() === p.name.toLowerCase()), 'Это имя уже занято.');
 room.players.push(p);
}
export function act(room, p, action, value) {
 if (action === 'start_test') {
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
  room.log.push('Тестовая партия: ведущий запускает ходы и голоса ботов кнопками.');
 } else if (action === 'bot_step') {
  check(room.testMode && room.host === p.id && room.phase === 'turn', 'Управление ботами доступно ведущему в тестовой партии.');
  const bot = room.players.find(x => x.id === room.turn);
  check(bot?.bot && bot.alive, 'Сейчас ход живого участника, а не бота.');
  if (!room.opened) {
   const remaining = Object.keys(categories).filter(k => !bot.revealed.includes(k));
   if (remaining.length) act(room, bot, 'reveal', room.round === 1 ? 'profession' : pick(remaining));
  }
  act(room, bot, 'next');
 } else if (action === 'bot_votes') {
  check(room.testMode && room.host === p.id && room.phase === 'vote', 'Голоса ботов запускает ведущий во время голосования.');
  const bots = room.players.filter(x => x.bot && !Object.hasOwn(room.votes, x.id));
  check(bots.length > 0, 'Все боты уже проголосовали.');
  const candidates = room.players.filter(x => x.alive).map(x => x.id);
  for (const bot of bots) act(room, bot, 'vote', pick(candidates));
 } else if (action === 'start') {
  check(room.host === p.id && room.phase === 'lobby', 'Только ведущий может начать игру.');
  check(room.players.length >= 5, 'Для игры нужно от 5 до 16 участников.');
  room.capacity = Math.floor(room.players.length / 2);
  room.firstVote = firstVoteRound(room.players.length);
  room.disaster = pick(disasters); room.bunker = pick(bunkers);
  const pools = Object.fromEntries(Object.entries(decks).map(([k,v])=>[k,[...v]]));
  for (const person of room.players) {
   for (const [k, pool] of Object.entries(pools)) person.cards[k] = pool.splice(randomInt(pool.length),1)[0];
   person.cards.biology = `${randomInt(20,76)} лет · ${pick(['женщина', 'мужчина'])} · ${pick(['легко адаптируется к новому режиму','хорошо переносит физическую нагрузку','чувствителен к холоду','предпочитает ночной режим','быстро восстанавливается после нагрузки','нуждается в стабильном режиме сна'])}`;
  }
  room.phase = 'turn'; room.round = 1; room.turn = room.players[0].id; room.opened = false;
  room.log.push('Шлюз закрыт. Начинается знакомство.');
 } else if (action === 'reveal') {
  check(room.phase === 'turn' && room.turn === p.id && p.alive, 'Сейчас ход другого игрока.');
  check(!room.opened && Object.hasOwn(categories,value) && !p.revealed.includes(value), 'Эту карточку сейчас нельзя открыть.');
  check(room.round !== 1 || value === 'profession', 'В первом круге откройте профессию.');
  p.revealed.push(value); room.opened = true;
  room.log.push(`${p.name} открывает: ${categories[value]}.`);
 } else if (action === 'next') {
  check(room.phase === 'turn' && room.turn === p.id, 'Передать слово может только текущий игрок.');
  check(room.opened || p.revealed.length === Object.keys(categories).length, 'Сначала откройте карточку.');
  const alive = room.players.filter(x=>x.alive); const pos = alive.findIndex(x=>x.id === p.id);
  if (pos < alive.length - 1) { room.turn = alive[pos+1].id; room.opened = false; }
  else if (room.round >= room.firstVote) { room.phase = 'vote'; room.votes = {}; room.log.push(`Круг ${room.round}: начинается голосование.`); }
  else newRound(room);
 } else if (action === 'vote') {
  check(room.phase === 'vote', 'Голосование ещё не началось.');
  check(!Object.hasOwn(room.votes,p.id), 'Ваш голос уже принят.');
  check(room.players.some(x=>x.id===value && x.alive), 'Выберите игрока в бункере.');
  room.votes[p.id] = value;
  if (Object.keys(room.votes).length === room.players.length) {
   const scores = {}; for (const target of Object.values(room.votes)) scores[target] = (scores[target] || 0) + 1;
   const max = Math.max(...Object.values(scores)); const tied = Object.keys(scores).filter(k=>scores[k]===max);
   const loserId = pick(tied);
   const loser = room.players.find(x=>x.id===loserId); loser.alive = false;
   room.lastVote = { scores, eliminated: loser.id, tie: tied.length>1 };
   room.log.push(`${loser.name} покидает бункер (${max} голосов)${tied.length>1 ? '. При равенстве голосов решает случайный жребий' : ''}.`);
   if (room.players.filter(x=>x.alive).length === room.capacity) { room.phase = 'finished'; room.turn = null; room.log.push('Состав убежища определён.'); }
   else newRound(room);
  }
 } else throw new Error('Неизвестное действие.');
 room.updated = Date.now();
}
function newRound(room) { room.round++; room.phase='turn'; room.turn=room.players.find(x=>x.alive).id; room.opened=false; room.votes={}; }
export function view(room, me) {
 const { players, votes, ...rest } = room;
 return { ...rest, categories, me: me.id, hasVoted: Object.hasOwn(votes,me.id), voteCount: Object.keys(votes).length,
  pendingBotVotes: players.filter(p => p.bot && !Object.hasOwn(votes,p.id)).length,
  players: players.map(({token, cards, ...p}) => ({...p, cards: p.id===me.id || room.phase==='finished' ? cards : Object.fromEntries(p.revealed.map(k=>[k,cards[k]]))})) };
}
