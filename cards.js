import { professions } from './professions.js';
import { catalog } from './card-catalog.js';
export { disasters, bunkers } from './world.js';

export const categories = { profession: 'Профессия', personality: 'Характер', biology: 'Биология', health: 'Здоровье', luggage: 'Багаж', hobby: 'Хобби', interesting: 'Интересный факт', special: 'Особые условия' };
// Catalogs are curated from user-provided lists; legacy supportive traits and special conditions are retained.
// All conditions are discussion prompts, not automatic actions.
export const decks = {
 profession: professions,
 personality: [...catalog.personality.map(card => card.name), 'Спокоен даже в кризис', 'Всегда ищет компромисс', 'Не доверяет незнакомцам', 'Предпочитает действовать в одиночку', 'Берёт ответственность на себя', 'Замечает мельчайшие детали', 'Склонен к рискованным решениям', 'Прямолинеен до неловкости', 'Соблюдает любые договорённости', 'Оптимист вопреки обстоятельствам', 'Тяжело переносит споры', 'Умеет слушать других', 'Сначала планирует, потом действует', 'Не выносит несправедливости', 'Очень бережлив', 'Любит соревноваться'],
 health: catalog.health.map(card => card.name),
 luggage: catalog.luggage.map(card => card.name),
 hobby: catalog.hobby.map(card => card.name),
 interesting: catalog.interesting.map(card => card.name),
 special: ['Обещал сохранить в тайне координаты другого убежища', 'Знает, где находится заброшенная теплица', 'С собой дневник предыдущего смотрителя бункера', 'Снаружи остался верный пёс', 'Знает о запасном выходе, которого нет на плане', 'Хранит ключ от неизвестного складского помещения', 'Получил по радио сообщение о выживших', 'Узнал в одном из участников давнего знакомого', 'Знает способ экономить треть запасов воды', 'Имеет незавершённый эксперимент по выращиванию еды', 'Обнаружил следы недавнего пребывания людей у входа', 'Видел рабочий генератор в соседнем здании', 'Помнит код аварийного радиоканала', 'Знает маршрут к подземному озеру', 'Нашёл инструкцию по ремонту шлюза', 'Слышал, что в окрестностях есть безопасная зона']
};
