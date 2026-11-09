import { randomInt } from 'node:crypto';

// These are independently generated traits of fictional game characters.
export function createBiologyCard(random = randomInt) {
 const female = random(0, 2) === 1;
 const age = random(15, 106);
 const orientations = ['Гетеро', female ? 'Лесбиянка' : 'Гей', 'Би', female ? 'Асексуальна' : 'Асексуален'];
 const orientation = orientations[random(0, orientations.length)];
 const sterile = random(0, 2) === 1;
 const ageWord = age % 100 >= 11 && age % 100 <= 14 ? 'лет'
  : age % 10 === 1 ? 'год' : age % 10 >= 2 && age % 10 <= 4 ? 'года' : 'лет';
 const fertility = sterile ? (female ? 'Стерильна' : 'Стерилен') : (female ? 'Не стерильна' : 'Не стерилен');
 return `${female ? 'Женщина' : 'Мужчина'} · ${age} ${ageWord} · ${orientation} · ${fertility}`;
}
