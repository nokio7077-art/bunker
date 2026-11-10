import { randomInt } from 'node:crypto';
import disasters from './data/disasters.json' with { type: 'json' };
import bunkers from './data/bunkers.json' with { type: 'json' };

export { disasters, bunkers };

// Narrative compatibility, not a physical simulation or a promise of survival.
export function incompatibilities(disaster, bunker) {
 const reasons = [];
 for (const capability of disaster.requires) {
  if (!bunker.capabilities.includes(capability)) reasons.push(`missing:${capability}`);
 }
 for (const tag of disaster.exclude_tags) {
  if (bunker.tags.includes(tag)) reasons.push(`excluded:${tag}`);
 }
 if (bunker.food_days < disaster.isolation_days) reasons.push('food_reserve');
 if (bunker.water_days < disaster.isolation_days) reasons.push('water_reserve');
 if (disaster.requires.includes('sealed_air') && bunker.air_days < disaster.isolation_days) reasons.push('air_reserve');
 if ((disaster.requires.includes('sealed_air') || disaster.requires.includes('heating')) && bunker.energy_days < disaster.isolation_days) reasons.push('energy_reserve');
 return reasons;
}

export function chooseWorld(capacity, random = randomInt) {
 const disaster = disasters[random(disasters.length)];
 const compatible = bunkers.filter(b => incompatibilities(disaster,b).length === 0);
 if (!compatible.length) throw new Error('Для катастрофы нет совместимого убежища.');
 const bunker = structuredClone(compatible[random(compatible.length)]);
 bunker.capacity = capacity;
 bunker.scenario_notes = [
  `Ресурсы рассчитаны на ${capacity} мест для финальной группы.`,
  disaster.isolation_days > 0
   ? `Запасы покрывают первые ${disaster.isolation_days} суток обязательной изоляции.`
   : 'Начальной обязательной изоляции нет; вылазки требуют оценки местных рисков.',
  `Горизонт восстановления — ${disaster.duration_months} мес. Это не срок непрерывного пребывания без выхода: пополнение запасов и обслуживание придётся организовать.`
 ];
 return { disaster: structuredClone(disaster), bunker };
}
