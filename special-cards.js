// Special cards are one-use actions. Names are saved in the same format as other cards.
const discard = (id, name, category, label) => ({ id, name, effect: 'discard', category, description: `Сбросьте карточку «${label}» у любого участника, включая себя. Она останется пустой до замены или обмена.` });
const redraw = (id, name, category, label) => ({ id, name, effect: 'redraw', category, description: `Замените свою карточку «${label}» случайной другой из колоды. Результат выбирает игра. Открытая карточка останется открытой.` });
const swap = (id, name, category, label) => ({ id, name, effect: 'swap', category, description: `Обменяйтесь карточками «${label}» с выбранным участником. Открытость слотов сохраняется; можно обменять и пустой слот.` });
const reveal = (id, name, category, label) => ({ id, name, effect: 'reveal', category, description: `Раскройте любую закрытую карточку «${label}» выбранного участника — даже если это не его ход.` });
const shuffle = (id, name, category, label) => ({ id, name, effect: 'shuffle', category, description: `Случайно распределите заново все несброшенные карточки «${label}». Закрытые карточки тоже участвуют, но остаются закрытыми. Нужны минимум две карты.` });
export const specialCards = [
 discard(1, 'Сброс здоровья', 'health', 'Здоровье'),
 discard(2, 'Сброс фобии', 'phobia', 'Фобия'),
 discard(3, 'Сброс характера', 'personality', 'Характер'),
 discard(4, 'Сброс хобби', 'hobby', 'Хобби'),
 redraw(5, 'Новая профессия', 'profession', 'Профессия'),
 redraw(6, 'Новое здоровье', 'health', 'Здоровье'),
 redraw(7, 'Новая фобия', 'phobia', 'Фобия'),
 redraw(8, 'Новый багаж', 'luggage', 'Багаж'),
 redraw(9, 'Новое хобби', 'hobby', 'Хобби'),
 redraw(10, 'Новый характер', 'personality', 'Характер'),
 redraw(11, 'Новый интересный факт', 'interesting', 'Интересный факт'),
 swap(12, 'Обмен багажом', 'luggage', 'Багаж'),
 swap(13, 'Обмен хобби', 'hobby', 'Хобби'),
 swap(14, 'Обмен профессиями', 'profession', 'Профессия'),
 shuffle(15, 'Перетасовка открытого багажа', 'luggage', 'Багаж'),
 shuffle(16, 'Перетасовка открытых хобби', 'hobby', 'Хобби'),
 reveal(17, 'Раскрыть чужое здоровье', 'health', 'Здоровье'),
 reveal(18, 'Раскрыть чужой характер', 'personality', 'Характер'),
];
export const specialCard = name => specialCards.find(card => card.name === name);
