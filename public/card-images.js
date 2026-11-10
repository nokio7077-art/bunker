// User-provided artwork, matched to the stable disaster IDs.
export const disasterImages = {
  "1": {
    "src": "/images/cards/disasters/1.png",
    "name": "Глобальный ядерный обмен",
    "width": 941,
    "height": 1672
  },
  "2": {
    "src": "/images/cards/disasters/2.png",
    "name": "Пандемия «Чёрная лихорадка»",
    "width": 941,
    "height": 1672
  },
  "3": {
    "src": "/images/cards/disasters/3.png",
    "name": "Глобальный голод",
    "width": 941,
    "height": 1672
  },
  "4": {
    "src": "/images/cards/disasters/4.png",
    "name": "Эпидемия геморрагической лихорадки",
    "width": 941,
    "height": 1672
  },
  "5": {
    "src": "/images/cards/disasters/5.png",
    "name": "Холодная зима и отказ энергосетей",
    "width": 941,
    "height": 1672
  },
  "6": {
    "src": "/images/cards/disasters/6.png",
    "name": "Коллапс водоснабжения и холера",
    "width": 941,
    "height": 1672
  },
  "7": {
    "src": "/images/cards/disasters/7.png",
    "name": "Кибератака на энергетику страны",
    "width": 941,
    "height": 1672
  },
  "8": {
    "src": "/images/cards/disasters/8.png",
    "name": "Гражданская война с применением химического оружия",
    "width": 941,
    "height": 1672
  },
  "9": {
    "src": "/images/cards/disasters/9.png",
    "name": "Засуха и саранча",
    "width": 941,
    "height": 1672
  },
  "10": {
    "src": "/images/cards/disasters/10.png",
    "name": "Вспышка вируса Эбола",
    "width": 941,
    "height": 1672
  },
  "11": {
    "src": "/images/cards/disasters/11.png",
    "name": "Массовый падёж скота и продовольственный коллапс",
    "width": 941,
    "height": 1672
  },
  "12": {
    "src": "/images/cards/disasters/12.png",
    "name": "Экологический коллапс почв",
    "width": 941,
    "height": 1672
  },
  "13": {
    "src": "/images/cards/disasters/13.png",
    "name": "Вспышка резистентной чумы",
    "width": 941,
    "height": 1672
  },
  "14": {
    "src": "/images/cards/disasters/14.png",
    "name": "Глобальная холодная зима",
    "width": 941,
    "height": 1672
  },
  "15": {
    "src": "/images/cards/disasters/15.png",
    "name": "Корь на фоне разрушения медицины",
    "width": 941,
    "height": 1672
  },
  "16": {
    "src": "/images/cards/disasters/16.png",
    "name": "Вирус мутировавшего гриппа птиц",
    "width": 941,
    "height": 1672
  },
  "17": {
    "src": "/images/cards/disasters/17.png",
    "name": "Падение метеорита на континент",
    "width": 941,
    "height": 1672
  },
  "18": {
    "src": "/images/cards/disasters/18.png",
    "name": "Коллапс логистики и отказ поставок",
    "width": 941,
    "height": 1672
  },
  "19": {
    "src": "/images/cards/disasters/19.png",
    "name": "Гигантское землетрясение с цунами и эпидемией",
    "width": 941,
    "height": 1672
  },
  "20": {
    "src": "/images/cards/disasters/20.png",
    "name": "Вспышка денге после наводнений",
    "width": 941,
    "height": 1672
  },
  "21": {
    "src": "/images/cards/disasters/21.png",
    "name": "Зомбиапокалипсис",
    "width": 1024,
    "height": 1536
  },
  "22": {
    "src": "/images/cards/disasters/22.png",
    "name": "Восстание машин",
    "width": 1024,
    "height": 1536
  },
  "23": {
    "src": "/images/cards/disasters/23.png",
    "name": "Инопланетное вторжение",
    "width": 1024,
    "height": 1536
  }
};

export function disasterImageFor(disaster) {
 if (!disaster || Array.isArray(disaster)) return null;
 return Object.hasOwn(disasterImages, disaster.id) ? disasterImages[disaster.id] : null;
}
