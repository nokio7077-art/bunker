// Special cards are one-use actions. Names are saved in the same format as other cards.
const discard = (id, name, category, label) => ({ id, name, effect: 'discard', category, description: `Сбросьте карточку «${label}» у любого участника, включая себя. Она останется пустой до замены или обмена.` });
const choose = (id, name, category, label) => ({ id, name, effect: 'choose', category, description: `Выберите новую карточку «${label}» из колоды вместо своей. Открытая карточка останется открытой.` });
const swap = (id, name, category, label) => ({ id, name, effect: 'swap', category, description: `Обменяйтесь карточками «${label}» с выбранным участником. Открытость слотов сохраняется; можно обменять и пустой слот.` });
const shuffle = (id, name, category, label) => ({ id, name, effect: 'shuffle', category, description: `Случайно распределите заново все открытые несброшенные карточки «${label}». Закрытые карточки не участвуют. Нужны минимум две открытые карты.` });
export const specialCards = [
 discard(1, 'Сброс здоровья', 'health', 'Здоровье'),
 discard(2, 'Сброс фобии', 'phobia', 'Фобия'),
 discard(3, 'Сброс характера', 'personality', 'Характер'),
 discard(4, 'Сброс хобби', 'hobby', 'Хобби'),
 choose(5, 'Новая профессия', 'profession', 'Профессия'),
 choose(6, 'Новое здоровье', 'health', 'Здоровье'),
 choose(7, 'Новая фобия', 'phobia', 'Фобия'),
 choose(8, 'Новый багаж', 'luggage', 'Багаж'),
 choose(9, 'Новое хобби', 'hobby', 'Хобби'),
 choose(10, 'Новый характер', 'personality', 'Характер'),
 choose(11, 'Новый интересный факт', 'interesting', 'Интересный факт'),
 swap(12, 'Обмен багажом', 'luggage', 'Багаж'),
 swap(13, 'Обмен хобби', 'hobby', 'Хобби'),
 swap(14, 'Обмен профессиями', 'profession', 'Профессия'),
 shuffle(15, 'Перетасовка открытого багажа', 'luggage', 'Багаж'),
 shuffle(16, 'Перетасовка открытых хобби', 'hobby', 'Хобби'),
];
export const specialCard = name => specialCards.find(card => card.name === name);
