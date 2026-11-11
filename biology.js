import { randomInt } from 'node:crypto';

// These are independently generated traits of fictional game characters.
export function createBiologyCard(random = randomInt) {
 const female = random(0, 2) === 1;
 const age = random(15, 106);
 // Game balance requested by the host, not a demographic estimate: 93 / 3 / 3 / 1%.
 const roll = random(0, 100);
 const orientation = roll < 93 ? 'Гетеро' : roll < 96 ? (female ? 'Лесбиянка' : 'Гей')
  : roll < 99 ? 'Би' : (female ? 'Асексуальна' : 'Асексуален');
 const sterile = random(0, 2) === 1;
 const ageWord = age % 100 >= 11 && age % 100 <= 14 ? 'лет'
  : age % 10 === 1 ? 'год' : age % 10 >= 2 && age % 10 <= 4 ? 'года' : 'лет';
 const fertility = sterile ? (female ? 'Стерильна' : 'Стерилен') : (female ? 'Не стерильна' : 'Не стерилен');
 return `${female ? 'Женщина' : 'Мужчина'} · ${age} ${ageWord} · ${orientation} · ${fertility}`;
}
