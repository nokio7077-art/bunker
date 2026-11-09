import test from 'node:test';
import assert from 'node:assert/strict';
import { createBiologyCard } from '../biology.js';
import { player, createRoom, join, act, view } from '../game.js';

function withValues(values) {
 return createBiologyCard((min, max) => {
  const value = values.shift();
  assert.ok(value >= min && value < max, `Value ${value} outside [${min}, ${max})`);
  return value;
 });
}

test('biology includes both age boundaries, all orientations and both fertility states', () => {
 for (const age of [15, 105]) {
  for (const female of [0, 1]) {
   const expected = female ? ['Гетеро', 'Лесбиянка', 'Би', 'Асексуальна'] : ['Гетеро', 'Гей', 'Би', 'Асексуален'];
   for (let index = 0; index < expected.length; index++) {
    for (const sterile of [0, 1]) {
     const parts = withValues([female, age, index, sterile]).split(' · ');
     assert.equal(parts.length, 4);
     assert.equal(parts[0], female ? 'Женщина' : 'Мужчина');
     assert.equal(parts[1], `${age} лет`);
     assert.equal(parts[2], expected[index]);
     assert.equal(parts[3], `${sterile ? '' : 'Не '}${female ? 'стерильна' : 'стерилен'}`.replace(/^./, c => c.toUpperCase()));
    }
   }
  }
 }
});

test('age text uses Russian year forms', () => {
 for (const [age, text] of [[21,'21 год'],[22,'22 года'],[25,'25 лет'],[31,'31 год'],[101,'101 год'],[102,'102 года'],[104,'104 года']]) {
  assert.equal(withValues([0,age,0,0]).split(' · ')[1], text);
 }
});

test('new biology is dealt to real players and bots, stays private until revealed', () => {
 const host = player('Ведущий'), guest = player('Гость'), room = createRoom('123456', host);
 join(room, guest); act(room, host, 'start_test');
 for (const p of room.players) {
  const parts = p.cards.biology.split(' · ');
  assert.equal(parts.length, 4);
  const age = Number.parseInt(parts[1]); assert.ok(age >= 15 && age <= 105);
 }
 assert.equal(view(room,guest).players[0].cards.biology, undefined);
 for (const p of room.players) { act(room,p,'reveal','profession'); act(room,p,'next'); }
 act(room,host,'reveal','biology');
 assert.equal(view(room,guest).players[0].cards.biology, host.cards.biology);
 assert.equal(view(room,host).players[1].cards.biology, undefined);
});
