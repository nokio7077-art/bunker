import { professions } from './professions.js';
import { catalog } from './card-catalog.js';
export { disasters, bunkers } from './world.js';

export const categories = { profession: 'Профессия', personality: 'Характер', biology: 'Биология', health: 'Здоровье', phobia: 'Фобия', luggage: 'Багаж', hobby: 'Хобби', interesting: 'Интересный факт', special: 'Особые условия' };
// Catalogs are curated from user-provided lists; specials have server-validated effects.
export const decks = {
 profession: professions,
 personality: catalog.personality.map(card => card.name),
 health: catalog.health.map(card => card.name),
 phobia: catalog.phobia.map(card => card.name),
 luggage: catalog.luggage.map(card => card.name),
 hobby: catalog.hobby.map(card => card.name),
 interesting: catalog.interesting.map(card => card.name),
 special: catalog.special.map(card => card.name)
};
