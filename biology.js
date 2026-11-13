import { randomInt } from 'node:crypto';

// These are independently generated traits of fictional game characters.
export function createBiologyCard(random = randomInt) {
 const female = random(0, 2) === 1;
 // Weighted fictional population: most survivors are adults, older ages are uncommon.
 // Bucket shares total 100%; age is uniform within the selected bucket.
 const ageRoll = random(0, 100);
 const ageGroups = [
  [15, 25, 15], // 15–24: 15%
  [25, 35, 24], // 25–34: 24%
  [35, 45, 22], // 35–44: 22%
  [45, 55, 18], // 45–54: 18%
  [55, 65, 12], // 55–64: 12%
  [65, 75, 6],  // 65–74:  6%
  [75, 85, 2],  // 75–84:  2%
  [85, 106, 1]  // 85–105: 1%
 ];
 let threshold = 0;
 const [minAge, maxAge] = ageGroups.find(([, , weight]) => (threshold += weight) > ageRoll);
 const age = random(minAge, maxAge);
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
