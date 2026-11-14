import { randomInt, randomBytes } from 'node:crypto';
import { decks, categories } from './cards.js';
import { eligibleCard } from './card-catalog.js';
import { specialCard } from './special-cards.js';

const check = (ok, message) => { if (!ok) throw new Error(message); };
function usable(room, player) {
 check(player.alive && ((room.phase === 'turn' && room.turn === player.id) || room.phase === 'tie_discussion'), 'Особое условие можно применить в свой ход или при обсуждении ничьей, пока вы в бункере.');
 check(!player.specialUsed, 'Особое условие уже использовано.');
 const card = specialCard(player.cards.special);
 check(card, 'В этой старой партии нет карты действия. Начните новую игру.');
 return card;
}

export function specialOptions(room, player) {
 return { ...usable(room, player) };
}

export function applySpecial(room, player, value = {}) {
 const card = usable(room, player);
 check(value && typeof value === 'object' && !Array.isArray(value), 'Некорректные параметры особого условия.');
 const key = card.category;
 let changes = [], target;
 if (['discard','swap','reveal'].includes(card.effect)) {
  target = room.players.find(p => p.id === value.targetId);
  check(target, 'Выберите участника комнаты.');
  if(card.revealedOnly)check(target.revealed.includes(key), 'Это условие действует только на открытые карточки.');
 }
 if (card.effect === 'discard') {
  check(target.cards[key], 'Эта карточка уже сброшена или отсутствует.');
  changes = [[target, null]];
 } else if (card.effect === 'reveal') {
  check(target.cards[key] && !target.revealed.includes(key), 'Выберите участника с закрытой несброшенной карточкой этой категории.');
  changes = [[target, target.cards[key]]];
 } else if (card.effect === 'redraw') {
  check(!Object.hasOwn(value, 'card'), 'Новая карточка определяется случайно. Обновите страницу и примените условие снова.');
  const candidates = decks[key].filter(name => name !== player.cards[key] && eligibleCard(key, name, player.cards.biology, room.disaster));
  check(candidates.length, 'В колоде нет другой подходящей карточки.');
  changes = [[player, candidates[randomInt(candidates.length)]]];
 } else if (card.effect === 'swap') {
  check(target.id !== player.id, 'Для обмена выберите другого участника.');
  check(Object.hasOwn(target.cards, key) && Object.hasOwn(player.cards, key), 'Участник не получил эту категорию. Начните новую игру.');
  check(target.cards[key] !== player.cards[key], 'Такой обмен ничего не изменит.');
  changes = [[player, target.cards[key]], [target, player.cards[key]]];
 } else if (card.effect === 'shuffle') {
  // Card wording controls eligibility. Explicit "open only" specials must never touch hidden slots.
  const participants = room.players.filter(p => p.cards[key] && (!card.revealedOnly || p.revealed.includes(key)));
  check(participants.length >= 2, card.revealedOnly ? 'Нужны хотя бы две открытые несброшенные карточки этой категории.' : 'Нужны хотя бы две несброшенные карточки этой категории.');
  const original = participants.map(p => p.cards[key]);
  let shuffled = null;
  for (let attempt=0;attempt<80;attempt++) {
   const names = [...original];
   for (let i=names.length-1;i>0;i--){const j=randomInt(i+1);[names[i],names[j]]=[names[j],names[i]];}
   if(names.every((name,i)=>eligibleCard(key,name,participants[i].cards.biology,room.disaster))){shuffled=names;break;}
  }
  check(shuffled, 'Не удалось безопасно перетасовать карточки. Попробуйте снова.');
  changes = participants.map((p,i)=>[p,shuffled[i]]);
 }
 // Validate the entire operation before changing any hand or consuming the special.
 for (const [recipient, name] of changes) {
  check(name === null || eligibleCard(key, name, recipient.cards.biology, room.disaster), 'Обмен несовместим с персонажем или катастрофой.');
 }
 const privateResults=changes.map(([recipient,name])=>({playerId:recipient.id,before:recipient.cards[key]??null,after:name}));
 const results = changes.map(([recipient, name]) => ({
  playerId: recipient.id,
  playerName: recipient.name,
  before: recipient.revealed.includes(key) ? recipient.cards[key] ?? 'Карточка сброшена' : 'Закрытая карточка',
  after: name === null ? 'Карточка сброшена' : (recipient.revealed.includes(key) || card.effect === 'reveal') ? name : 'Новая закрытая карточка',
  unchanged: recipient.revealed.includes(key) && recipient.cards[key] === name
 }));
 for (const [recipient, name] of changes) {
  recipient.cards[key] = name;
  // A discard and an explicit reveal are public; other hidden values stay private.
  if ((name === null || card.effect === 'reveal') && !recipient.revealed.includes(key)) recipient.revealed.push(key);
 }
 player.specialUsed = true;
 if (!player.revealed.includes('special')) player.revealed.push('special');
 const eventId=randomBytes(10).toString('hex');
 const event = { id:eventId, actor: player.name, actorId:player.id, effect:card.effect, categoryKey:key, name: card.name, category: categories[key], round: room.round, results };
 // Keep secret before/after snapshots separate from public events; only the affected
 // player receives their own details through the server's per-player view.
 room.privateSpecialHistory=[...(room.privateSpecialHistory||[]),{id:eventId,results:privateResults}].slice(-16);
 // Persist only public snapshots, so hidden cards never leak through events or the log.
 room.specialEvents = [...(room.specialEvents || []), event].slice(-16);
 room.log.push(`${player.name} применяет «${card.name}». ${categories[key]}: ${results.map(r => `${r.playerName} — ${r.before} → ${r.after}${r.unchanged ? ' (без изменений)' : ''}`).join('; ')}.`);
}
