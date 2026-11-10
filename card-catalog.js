import health from './data/health.json' with { type: 'json' };
import luggage from './data/luggage.json' with { type: 'json' };
import hobby from './data/hobby.json' with { type: 'json' };
import interesting from './data/interesting.json' with { type: 'json' };
import personality from './data/personality.json' with { type: 'json' };
import { professionDescriptions } from './profession-descriptions.js';

export const catalog = { health, luggage, hobby, interesting, personality };
const indexes = Object.fromEntries(Object.entries(catalog).map(([k, cards]) => [k, new Map(cards.map(c => [c.name,c]))]));

export function cardDescription(category, name) {
 return category === 'profession' ? professionDescriptions[name] || '' : indexes[category]?.get(name)?.description || '';
}

export function eligibleCard(category, name, biology, disaster) {
 const card = indexes[category]?.get(name);
 if (!card) return true;
 const [sex, ageText] = biology.split(' · ');
 const age = Number.parseInt(ageText);
 if (card.minAge && age < card.minAge) return false;
 if (card.sex && card.sex !== (sex === 'Женщина' ? 'female' : 'male')) return false;
 if (card.requiresDisaster && card.requiresDisaster !== disaster.hazard) return false;
 return true;
}

export function healthyCard(name) { return Boolean(indexes.health.get(name)?.healthy); }
