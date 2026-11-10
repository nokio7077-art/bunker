import { randomInt } from 'node:crypto';
import { decks, categories } from './cards.js';
import { eligibleCard, cardDescription } from './card-catalog.js';
import { specialCard } from './special-cards.js';

const check = (ok, message) => { if (!ok) throw new Error(message); };
function usable(room, player) {
 check(room.phase === 'turn' && room.turn === player.id && player.alive, 'Особое условие можно применить только в свой ход, пока вы в бункере.');
 check(!player.specialUsed, 'Особое условие уже использовано.');
 const card = specialCard(player.cards.special);
 check(card, 'В этой старой партии нет карты действия. Начните новую игру.');
 return card;
}

export function specialOptions(room, player) {
 const card = usable(room, player);
 // Offer the public deck, not the undealt remainder: options must not reveal other hands.
 const choices = card.effect === 'choose' ? decks[card.category]
  .filter(name => name !== player.cards[card.category] && eligibleCard(card.category, name, player.cards.biology, room.disaster))
  .map(name => ({ name, description: cardDescription(card.category, name) })) : [];
 return { ...card, choices };
}

export function applySpecial(room, player, value = {}) {
 const card = usable(room, player);
 check(value && typeof value === 'object' && !Array.isArray(value), 'Некорректные параметры особого условия.');
 const key = card.category;
 let changes = [], target;
 if (card.effect === 'discard' || card.effect === 'swap') {
  target = room.players.find(p => p.id === value.targetId);
  check(target, 'Выберите участника комнаты.');
 }
 if (card.effect === 'discard') {
  check(target.cards[key], 'Эта карточка уже сброшена или отсутствует.');
  changes = [[target, null]];
 } else if (card.effect === 'choose') {
  check(typeof value.card === 'string' && decks[key].includes(value.card), 'Выберите карточку из указанной колоды.');
  check(value.card !== player.cards[key], 'Выберите другую карточку.');
  check(eligibleCard(key, value.card, player.cards.biology, room.disaster), 'Карточка не подходит биологии персонажа или катастрофе.');
  changes = [[player, value.card]];
 } else if (card.effect === 'swap') {
  check(target.id !== player.id, 'Для обмена выберите другого участника.');
  check(Object.hasOwn(target.cards, key) && Object.hasOwn(player.cards, key), 'Участник не получил эту категорию. Начните новую игру.');
  check(target.cards[key] !== player.cards[key], 'Такой обмен ничего не изменит.');
  changes = [[player, target.cards[key]], [target, player.cards[key]]];
 } else if (card.effect === 'shuffle') {
  const participants = room.players.filter(p => p.revealed.includes(key) && p.cards[key]);
  check(participants.length >= 2, 'Нужны хотя бы две открытые несброшенные карточки этой категории.');
  const names = participants.map(p => p.cards[key]);
  for (let i = names.length - 1; i > 0; i--) { const j = randomInt(i + 1); [names[i], names[j]] = [names[j], names[i]]; }
  changes = participants.map((p, i) => [p, names[i]]);
 }
 // Validate the entire operation before changing any hand or consuming the special.
 for (const [recipient, name] of changes) {
  check(name === null || eligibleCard(key, name, recipient.cards.biology, room.disaster), 'Обмен несовместим с персонажем или катастрофой.');
 }
 for (const [recipient, name] of changes) {
  recipient.cards[key] = name;
  // A discard is public, but its previous hidden value is never disclosed.
  if (name === null && !recipient.revealed.includes(key)) recipient.revealed.push(key);
 }
 player.specialUsed = true;
 if (!player.revealed.includes('special')) player.revealed.push('special');
 room.log.push(`${player.name} применяет «${card.name}»${target ? ` → ${target.name}` : ''}. Категория: ${categories[key]}.`);
}
