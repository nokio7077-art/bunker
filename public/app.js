import { disasterImageFor } from './card-images.js';
import { avatarIdentity } from './avatar-generator.js';
const app=document.querySelector('#app');
// Load lossless 144px WebP sheets in small 50-portrait chunks, only when visible.
// Preserves the exact pixels and alpha of the original uploaded PNG portraits.
const avatarSheets=new Map();
function avatarSheet(gender,part){
 if(!['female','male'].includes(gender)||!Number.isInteger(part)||part<0||part>5)return null;
 const key=gender+':'+part;
 if(!avatarSheets.has(key)){
  const img=new Image();
  avatarSheets.set(key,img);
  img.addEventListener('load',()=>{
   document.querySelectorAll('canvas.dossier-file-avatar, canvas.player-portrait').forEach(canvas=>{
    if(canvas.dataset.gender===gender&&Math.floor(Number(canvas.dataset.index)/50)===part)paintAvatar(canvas);
   });
  });
  img.addEventListener('error',()=>console.warn('Не удалось загрузить часть галереи портретов:',key));
  img.decoding='async';
  img.src='/images/ui/avatars-'+gender+'-144-part-'+String(part+1).padStart(2,'0')+'.webp';
 }
 return avatarSheets.get(key);
}
function paintAvatar(canvas){
 const gender=canvas.dataset.gender;
 const index=Number(canvas.dataset.index);
 if(!Number.isInteger(index)||index<0||index>=(gender==='female'?298:290))return;
 const part=Math.floor(index/50),localIndex=index%50;
 const sheet=avatarSheet(gender,part);
 const expectedHeight=part===5&&gender==='male'?576:720;
 if(!sheet||!sheet.complete||sheet.naturalWidth!==1440||sheet.naturalHeight!==expectedHeight)return;
 const context=canvas.getContext('2d');
 if(!context)return;
 context.clearRect(0,0,144,144);
 context.imageSmoothingEnabled=false;
 context.drawImage(sheet,(localIndex%10)*144,Math.floor(localIndex/10)*144,144,144,0,0,144,144);
}
function paintAvatars(){
 // Start every required chunk request immediately, including the owner's hidden dossier.
 // Loaded sheets are cached in avatarSheets and repainted after each game state refresh.
 document.querySelectorAll('canvas.dossier-file-avatar, canvas.player-portrait').forEach(paintAvatar);
}

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={profession:'⚒',personality:'◈',biology:'◎',health:'✚',phobia:'◉',luggage:'▣',hobby:'✦',interesting:'⌁',special:'⚑'};
const uiPaths={people:'<circle cx="9" cy="6" r="3"/><circle cx="18" cy="8" r="2.5"/><path d="M2 22v-7a7 7 0 0 1 14 0v7zm16 0v-7a9 9 0 0 0-.5-3 5 5 0 0 1 6 5v5z"/>',cards:'<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m4 3 9 2-4 17-9-2z"/><path d="m13 3 11 3-4 16-11-3z"/></g>',bunker:'<g fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 22v-7a11 11 0 0 1 22 0v7M5 22v-7a7 7 0 0 1 14 0v7M9 22v-9h6v9M0 22h24"/></g>',person:'<g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="7" r="4"/><path d="M3 23v-4a9 9 0 0 1 18 0v4"/></g>',radiation:'<circle cx="12" cy="12" r="2"/><path d="M9 3h6l-1 5h-4zm11 6 3 5-5 2-2-4zM8 15l-2 5H1l3-7z"/>'};
const uiIcon=name=>`<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${uiPaths[name]||''}</svg>`;
const bunkerBadge='<svg class="bunker-badge" viewBox="0 0 160 64" aria-hidden="true" focusable="false"><path d="M4 54h20V44h12V30h16V14h12V6h40v8h12v16h12v14h12v10h16v6H4z" fill="#263b1a" stroke="#8fa744" stroke-width="2"/><path d="M52 54V22l12-12h36l12 12v32" fill="#617333" stroke="#bac75a" stroke-width="2"/><path d="M60 54V26l9-9h26l9 9v28" fill="#354a21"/><path d="M69 54V32l6-8h15l7 8v22" fill="#0b1809" stroke="#bfce58" stroke-width="2"/><path d="M75 28h15v4H75z" fill="#ecfb88"/><path d="M74 54V36h17v18M67 14h30M63 20h39M10 56h140M30 48h17M116 48h17" fill="none" stroke="#718d36" stroke-width="2"/></svg>';
let session;try{session=JSON.parse(localStorage.getItem('bunker-session'));}catch{}
let state, busy=false, last='', mode='create', toastTimer, specialDraft=null;
let refreshInFlight=false, actionEpoch=0;
let inviteOpen=false, inviteOrigin=null, inviteMdnsOrigin=null;
const inviteCode=new URLSearchParams(location.search).get('join');
const prefillCode=/^\d{6}$/.test(inviteCode||'')?inviteCode:'';
if(prefillCode)mode='join';
let serverClockOffsetMs=0;
const fmtTime=deadline=>{const seconds=Math.max(0,Math.ceil((deadline-Date.now()-serverClockOffsetMs)/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
function updateTimers(){document.querySelectorAll('[data-deadline]').forEach(node=>{const deadline=Number(node.dataset.deadline);node.textContent=fmtTime(deadline);node.classList.toggle('timer-expired',deadline<=Date.now()+serverClockOffsetMs);});}
const disasterPreloads=new Map();
function prepareDisasterArtwork(disaster){
 const image=disasterImageFor(disaster);
 if(!image||disasterPreloads.has(image.webp||image.src))return;
 const preload=new Image();
 preload.decoding='async';
 preload.fetchPriority='high';
 preload.src=image.webp||image.src;
 disasterPreloads.set(preload.src,preload);
}
const seenDisasters=new Set();
const textDisasters=new Set(), failedDisasterImages=new Set();
let replayDisasterKey=null;
let renderedTurn=null;
let replayEnding=false,worldCollapsed=matchMedia('(max-width:860px)').matches;
try{const saved=localStorage.getItem('bunker-world-collapsed');if(saved!==null)worldCollapsed=saved==='true';}catch{}
const seenEndings=new Set();
function endingKey(){return `bunker-ending:${state.code}:${state.me}${(state.gameNumber||1)>1?':'+state.gameNumber:''}`;}
function showEnding(){if(state?.phase!=='finished')return false;if(replayEnding)return true;const key=endingKey();if(seenEndings.has(key))return false;try{return localStorage.getItem(key)!=='seen';}catch{return true;}}
function endingScreen(){
 const survived=Boolean(state.players.find(p=>p.id===state.me)?.alive);
 const kind=survived?'survived':'out';
 const mobile=matchMedia('(max-width:600px) and (orientation:portrait)').matches;
 const suffix=mobile?'-mobile':'';
 const imagePath=`/images/endings/ending-${kind}${suffix}.webp`;
 const fallbackPath=`/images/ui/ending-${kind}${suffix}.webp`;
 const label=survived?'Шлюз закрыт. Вы выжили':'Шлюз закрыт. Попрощайтесь с миром';
 const host=state.host===state.me;
 const winners=state.players.filter(p=>p.alive);
 const winnerNames=winners.map(p=>escape(p.name)).join(', ');
 return `<main class="ending-screen ${survived?'ending-win':'ending-loss'}" aria-labelledby="ending-title"><h1 class="sr-only" id="ending-title" tabindex="-1">${label}</h1><div class="ending-frame"><div class="ending-crt-display"><img class="ending-image" src="${imagePath}" data-fallback="${fallbackPath}" alt="${label}" loading="eager" decoding="async" fetchpriority="high"></div></div><section class="ending-winners" aria-label="Победители партии"><span class="ending-winners-kicker">ПОБЕДИТЕЛИ ПАРТИИ</span><h2>Остались в убежище</h2><p>${winnerNames||'Победителей нет'}</p><small>${winners.length} из ${state.players.length} участников</small></section><div class="ending-screen-actions"><button class="secondary" data-action="ending-continue">Посмотреть итоги</button>${host?'<button class="primary" data-action="next_game">Сыграть ещё →</button>':''}<button class="secondary" data-action="exit">На главную</button></div></main>`;
}

function collapsibleWorld(){if(!state.disaster)return '';return `<section class="world-section"><button class="secondary world-toggle" data-action="toggle-world" aria-expanded="${!worldCollapsed}" aria-controls="world-content">${worldCollapsed?'Показать':'Скрыть'} катастрофу и бункер <span aria-hidden="true">${worldCollapsed?'+':'−'}</span></button><div id="world-content" ${worldCollapsed?'hidden':''}>${worldPanels()}</div></section>`;}

const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused=reducedMotion.matches||Boolean(navigator.connection?.saveData);
function syncLandingMotion(){
 const video=document.querySelector('.landing-video');if(!video)return;
 video.muted=true;video.loop=true;
 video.onended=()=>{if(!motionPaused&&!document.hidden){video.currentTime=0;video.play().catch(()=>{});}};
 video.onplaying=()=>{video.classList.add('is-playing');};
 video.onpause=()=>{};
 video.onerror=()=>{video.classList.remove('is-playing');motionPaused=true;};
 if(motionPaused||document.hidden){video.pause();return;}
 if(!video.getAttribute('src'))video.src='/videos/bunker-entrance.mp4';
 video.play().catch(()=>{});
 
}
document.addEventListener('visibilitychange',syncLandingMotion);
reducedMotion.addEventListener('change',e=>{if(e.matches){motionPaused=true;syncLandingMotion();}});
function toast(message){document.querySelector('#toast').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>document.querySelector('#toast').textContent='',5500);}
async function api(path,body){const sent=Date.now();const r=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},body:body?JSON.stringify(body):undefined});const received=Date.now(),serverNow=Number(r.headers.get('X-Server-Time'));if(Number.isFinite(serverNow)&&serverNow>0)serverClockOffsetMs=serverNow-(sent+received)/2;const data=await r.json();if(!r.ok){if(r.status===401 || r.status===404 && session){localStorage.removeItem('bunker-session');session=null;state=null;render();}throw new Error(data.error);}return data;}
const brand=`<a class="brand" href="/" aria-label="Бункер — главная"><span class="brand-mark">Б</span>БУНКЕР<span class="edition">ONLINE / 01</span></a>`;
const header=()=>`<header class="site-header ${state?'game-header':''}">${brand}${!state?`<span class="header-emblem" aria-hidden="true">${bunkerBadge}<img class="header-emblem-art" src="/images/ui/bunker-header.webp" alt="" width="360" height="120" decoding="async" onerror="this.hidden=true"></span>`:''}<div class="header-right"><span class="signal"></span><span>${state?'СЕАНС АКТИВЕН':'СВЯЗЬ УСТАНОВЛЕНА'}</span><button class="text-btn primary rules-button" data-action="rules">Правила →</button>${state?'<button class="text-btn" data-action="exit">Выйти</button>':''}</div></header>`;
const rules="<dialog id=\"rules\" class=\"survival-rules\" aria-labelledby=\"rules-heading\"><div class=\"survival-rules-inner\"><div class=\"rules-masthead\"><span class=\"eyebrow\">ПРОТОКОЛ ВЫЖИВАНИЯ / 01</span><button type=\"button\" class=\"close text-btn\" data-action=\"close\" aria-label=\"Закрыть правила\">✕</button></div><div class=\"rules-heading\"><h2 id=\"rules-heading\">Докажите свою пользу.</h2><p>В комнате 5–16 игроков. Ведущий запускает игру, каждый получает 9 личных карточек, включая отдельную фобию и особое условие. Катастрофа и бункер общие для всех.</p></div><div class=\"rules-steps-label\">ОСНОВНОЙ ПРОТОКОЛ · 5 ШАГОВ</div><ol class=\"rules-steps\"><li>Первый круг: откройте профессию и расскажите, чем полезны группе. Нажмите «Передать слово».</li><li>Каждый следующий круг: откройте одну оставшуюся карточку и обсудите её.</li><li>Первое голосование: 5 игроков — круг 4, 6 — круг 3, 7 — круг 2, 8–16 — круг 1. Затем голосуйте после каждого круга.</li><li>Все участники, включая изгнанных, голосуют за другого живого игрока. Голосовать за себя нельзя. Нажатие на кнопку «Исключить» сразу отправляет голос. Голос нельзя изменить. При равенстве решает случайный жребий.</li><li>В бункере остаётся половина первоначального состава с округлением вниз: 5 → 2, 6 → 3, 7 → 3, 8 → 4.</li></ol><section class=\"rules-details\"><h3>Дополнительные правила</h3><p>Для проверки без компании создайте комнату и нажмите «Тестовая игра с ботами». Комната заполнится до пяти участников. Ведущий запускает ходы ботов кнопкой, а боты голосуют автоматически после всех людей; правила кругов и изгнания сохраняются.</p><p>Характер даёт повод для отыгрыша и спора о решениях. Голос выбираете вы; обсуждайте поступки персонажей и соблюдайте очередь.</p><p>Особое условие — одноразовое действие: сброс, обмен, перетасовка открытых карт или случайная замена из колоды. Нажмите «Применить условие» в свой ход, пока вы в бункере. Действие раскрывает само условие и не заменяет обычное раскрытие карточки; его также можно сначала раскрыть, а применить позже. Целью может стать любой участник, включая изгнанного. Сброс оставляет публичный пустой слот; при обмене и замене открытость слотов сохраняется. Замену случайно выбирает игра из подходящих карточек; возможны совпадения с чужими карточками. Фобии и интересные факты — повод для обсуждения, без принудительных голосов. Когда все карты раскрыты или сброшены, продолжайте обсуждать и передавать слово.</p><p>Играйте за одним столом: каждый открывает сайт на своём телефоне. Обсуждайте карточки вслух. На каждый ход даётся 3 минуты 16 секунд, на голосование — 2 минуты. По истечении времени ход продвигается автоматически; непроголосовавшие воздерживаются. Ведущий может передать роль другому игроку, а если ведущий неактивен более 3 минут, роль переходит активному участнику. Сессия автоматически сохраняется в браузере. При очистке данных браузера доступ к ней может потеряться.</p></section><div class=\"rules-end\"><span>УБЕЖИЩЕ / ИНСТРУКЦИЯ ЗАВЕРШЕНА</span><button class=\"primary\" type=\"button\" data-action=\"close\">ПОНЯТНО</button></div></div></dialog>";
function landing(){return `<div class="landing-shell">${header()}<main class="landing"><video class="landing-video" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1" disablepictureinpicture></video><section class="hero" aria-labelledby="welcome-title">
 <h1 id="welcome-title">Место есть<br><span>Не для всех.</span></h1>
 <p class="lead">Мир снаружи изменился навсегда.<br>За гермодверью — шанс начать сначала.<br>Убедите остальных, что он нужен<br class="desktop-break"> именно вам.</p>
 <div class="hero-hazard" aria-hidden="true"></div>
 
 
 </section><section class="entry-panel" aria-labelledby="entry-title">
 <div class="eyebrow entry-kicker">${uiIcon('radiation')} ДОПУСК В УБЕЖИЩЕ</div><h2 id="entry-title">Вы среди выживших?</h2><p>Соберите друзей. Остальное решит игра.</p>
 <div class="tabs" aria-label="Способ входа"><button class="${mode==='create'?'active':''}" data-mode="create" aria-pressed="${mode==='create'}">Создать</button><button class="${mode==='join'?'active':''}" data-mode="join" aria-pressed="${mode==='join'}">Войти</button></div>
 <form id="entry"><label for="name">Ваше имя</label><input id="name" name="name" placeholder="Введите имя…" minlength="2" maxlength="24" required autocomplete="nickname">${mode!=='create'?'<label for="code">Код комнаты</label><input id="code" name="code" placeholder="000000" pattern="[0-9]{6}" maxlength="6" inputmode="numeric" value="${prefillCode}" required>':''}<button class="primary full" type="submit">${mode==='create'?'Создать убежище':'Войти в убежище'} <span aria-hidden="true">→</span></button></form>
 ${localStorage.getItem('bunker-session')?'<button class="secondary full resume-button" data-action="resume">Вернуться в сохранённую комнату <span aria-hidden="true">→</span></button>':''}
 <div class="entry-note"><span aria-hidden="true">${uiIcon('person')}</span><p>Регистрация не требуется.<br>Просто создайте комнату и пригласите друзей.</p></div>
 <ol class="protocol"><li><b>01 /</b><span>ПОЛУЧИТЕ<br>РОЛЬ</span></li><li><b>02 /</b><span>УБЕДИТЕ<br>ГРУППУ</span></li><li><b>03 /</b><span>ОСТАНЬТЕСЬ<br>ВНУТРИ</span></li></ol>
 </section></main><footer class="landing-footer apocalypse-footer" aria-label="Сведения об игре и символы апокалипсиса"><div class="footer-layout"><div class="footer-symbols footer-symbols-left" aria-label="Угрозы радиации и инфекции"><span class="apocalypse-symbol" role="img" aria-label="Радиационная опасность">☢︎</span><span class="apocalypse-symbol" role="img" aria-label="Биологическая опасность">☣︎</span></div><div class="footer-stats"><div class="stats"><div><strong>${uiIcon('people')} 5–16</strong><span>ИГРОКОВ</span></div><div><strong>${uiIcon('cards')} 9</strong><span>КАРТОЧЕК</span></div><div><strong>${uiIcon('bunker')} ½</strong><span>ОСТАНУТСЯ</span></div></div></div><div class="footer-symbols footer-symbols-right" aria-label="Предупреждающие знаки"><span class="apocalypse-symbol" role="img" aria-label="Предупреждение об опасности">⚠︎</span><span class="apocalypse-symbol" role="img" aria-label="Опасность">⛔︎</span></div></div></footer></div>${rules}`;}
function disasterIntroKey(){return `bunker-intro:${state.code}:${state.me}${(state.gameNumber||1)>1?':'+state.gameNumber:''}`;}
function introArtwork(){
 const image=disasterImageFor(state.disaster);
 return image&&!textDisasters.has(disasterIntroKey())&&!failedDisasterImages.has(image.src)?image:null;
}
function disasterPresentationKey(){return `${disasterIntroKey()}:${introArtwork()?.src||'text'}`;}
function shouldShowDisaster(){
 if(!state?.disaster||state.phase==='lobby'||state.phase==='finished')return false;
 const key=disasterIntroKey();
 if(replayDisasterKey===key)return true;
 if(seenDisasters.has(key))return false;
 try{return localStorage.getItem(key)!=='seen';}catch{return true;}
}
function disasterIntro(){
 const image=introArtwork();
 if(image)return `<main id="disaster-intro" class="disaster-intro disaster-intro--art" data-intro-key="${escape(disasterPresentationKey())}" aria-labelledby="disaster-title"><h1 id="disaster-title" class="sr-only" tabindex="-1">${escape(state.disaster.name)}</h1><div class="intro-art-stage"><span class="intro-art-loading" role="status">Загрузка карточки…</span><img class="intro-art" data-disaster-image src="${escape(image.webp||image.src)}" width="${image.width}" height="${image.height}" alt="Карточка катастрофы: ${escape(state.disaster.name)}" loading="eager" fetchpriority="high"></div><div class="intro-footer"><div class="intro-art-tools"><span>УБЕЖИЩЕ № ${escape(state.code)}</span><button class="text-btn" data-action="intro-text">Читать текст</button></div><button class="primary intro-next" data-action="intro-continue">О ужас! Дальше <span aria-hidden="true">→</span></button></div></main>`;
 const disaster=state.disaster, legacy=Array.isArray(disaster);
 const name=legacy?disaster[0]:disaster.name, description=legacy?disaster[1]:disaster.description;
 return `<main id="disaster-intro" class="disaster-intro" data-intro-key="${escape(disasterPresentationKey())}" aria-labelledby="disaster-title"><div class="intro-topbar">${brand}<span class="eyebrow">УБЕЖИЩЕ № ${escape(state.code)}</span></div><section class="intro-card"><div class="intro-mark" aria-hidden="true">☢</div><span class="eyebrow orange">ЭКСТРЕННОЕ СООБЩЕНИЕ / КАТАСТРОФА</span><h1 id="disaster-title" tabindex="-1">${escape(name)}</h1><p class="intro-description">${escape(description)}</p>${!legacy?`<dl class="intro-facts">${disaster.isolation_days!=null?`<div><dt>Начальная изоляция</dt><dd>${escape(disaster.isolation_days)} <span>суток</span></dd></div>`:''}${disaster.survivors_percent!=null?`<div><dt>Выжившие</dt><dd>${escape(disaster.survivors_percent)}<span>% населения</span></dd></div>`:''}${disaster.duration_months!=null?`<div><dt>Горизонт восстановления</dt><dd>${escape(disaster.duration_months)} <span>мес.</span></dd></div>`:''}</dl>${disaster.death_toll?`<p class="intro-losses">${escape(disaster.death_toll)}</p>`:''}`:''}<p class="intro-prompt">Снаружи всё изменилось. Теперь вам предстоит решить, кто останется внутри.</p></section><div class="intro-footer">${disasterImageFor(disaster)?'<button class="text-btn intro-return-art" data-action="intro-image">Показать изображение</button>':''}<button class="primary intro-next" data-action="intro-continue">О ужас! Дальше <span aria-hidden="true">→</span></button></div></main>`;
}
function specialDialog(){
 if(!specialDraft)return '';
 const d=specialDraft, needsTarget=['discard','swap','reveal'].includes(d.effect);
 return `<dialog id="special-dialog"><button class="close text-btn" data-action="special-close">Закрыть ✕</button><span class="eyebrow">ОДИН РАЗ ЗА ПАРТИЮ</span><h2>${escape(d.name)}</h2><p>${escape(d.description)}</p><p class="muted">Применяется в свой ход или во время обсуждения ничьей, если вы ещё в бункере. Само особое условие станет открытым. Изменения появятся в отдельном блоке результатов сразу после применения.</p><div class="special-controls">${needsTarget?`<label for="special-target">Участник</label><select id="special-target"><option value="">Выберите участника</option>${state.players.filter(p=>(d.effect!=='swap'||p.id!==state.me)&&(!d.revealedOnly||p.revealed.includes(d.category))).map(p=>`<option value="${p.id}" ${d.targetId===p.id?'selected':''}>${escape(p.name)}${p.id===state.me?' (вы)':''}${!p.alive?' · изгнан':''}${!p.revealed.includes(d.category)?' · карточка закрыта':' · карточка открыта'}</option>`).join('')}</select>`:''}${d.effect==='redraw'?'<p>Игра случайно выдаст другую подходящую карточку. Узнаете результат после применения; выбрать или отменить выпавшую карту нельзя.</p>':''}${d.effect==='shuffle'?'<p>Участвуют только открытые несброшенные карточки. Закрытые карты остаются у своих владельцев без изменений.</p>':''}<button class="primary full" data-action="use_special">Применить один раз →</button></div></dialog>`;
}
// Inline icons avoid incomplete external SVG <use> rendering on mobile browsers.
function dossierIcon(category){const key=/^(profession|health|luggage|phobia|hobby|biology|personality|interesting|special)$/.test(category)?category:'interesting';return `<img class="dossier-category-icon" src="/images/ui/dossier-${key}.svg?v=archive-v23" alt="" aria-hidden="true" width="56" height="56" loading="lazy" decoding="async">`;}
function handCard(me, mine, k, label){
 const open=me.revealed.includes(k), empty=me.cards[k]===null;
 const can=mine&&!state.opened&&!open&&!empty&&(state.round!==1||k==='profession');
 const number=String(Object.keys(state.categories).indexOf(k)+1).padStart(2,'0');
 const status=empty?'СБРОШЕНО':k==='special'&&me.specialUsed?'ИСПОЛЬЗОВАНО':open?'РАСКРЫТО':'ЗАКРЫТО';
 const body=`<span class="dossier-card-top"><span class="dossier-card-index">${number}</span><span class="card-label">${dossierIcon(k)}${escape(label)}</span><small class="dossier-card-status">${status}</small></span><span class="dossier-card-content"><strong>${empty?'Карточка сброшена':escape(me.cards[k])}</strong>${me.descriptions?.[k]?`<span class="card-description">${escape(me.descriptions[k])}</span>`:''}</span>`;
 if(k==='special')return `<article class="card special-card ${open?'revealed':''}">${body}<p class="special-note">${me.specialUsed?'Действие уже применено.':state.specialAvailable?'Можно применить один раз в свой ход или во время обсуждения ничьей.':'Сюжетная карта из старой партии. Для карт действий начните новую игру.'}</p>${can?'<button class="secondary" data-card="special">Раскрыть без применения</button>':''}${state.specialAvailable?`<button class="primary" data-action="special-open" ${(mine||state.phase==='tie_discussion')&&me.alive?'':'disabled'}>Применить условие →</button>`:''}</article>`;
 return `<button class="card ${open?'revealed':''} ${can?'available':''}" data-card="${k}" ${can?'':'disabled'}>${body}${can?'<span class="reveal-hint">Раскрыть карточку →</span>':''}</button>`;
}
function worldPanels(){
 if(!state.disaster)return '';
 const d=state.disaster,b=state.bunker;
 // Existing rooms retain the compact array format they were dealt with.
 if(Array.isArray(d)||Array.isArray(b))return `<div class="world"><article><span class="eyebrow orange">☢ КАТАСТРОФА</span><h3>${escape(d[0])}</h3><p>${escape(d[1])}</p></article><article><span class="eyebrow">⌂ ВАШ БУНКЕР · ${state.capacity} МЕСТ</span><h3>${escape(b[0])}</h3><p>${escape(b[1])}</p></article></div>`;
 return `<div class="world"><article><span class="eyebrow orange">☢ КАТАСТРОФА</span><h3>${escape(d.name)}</h3>${disasterImageFor(d)?'<button class="secondary world-card-open" data-action="disaster-open">Открыть карточку катастрофы</button>':''}<p>${escape(d.description)}</p><dl class="world-facts"><div><dt>Горизонт восстановления</dt><dd>${d.duration_months} мес.</dd></div><div><dt>Начальная изоляция</dt><dd>${d.isolation_days ? d.isolation_days+' суток' : 'Не требуется'}</dd></div><div><dt>Потери</dt><dd>${escape(d.death_toll??'Нет данных')}</dd></div></dl><p class="world-hint">Дальнейшие вылазки и пополнение запасов — часть вашей истории. Успех зависит от решений группы.</p></article><article><span class="eyebrow">⌂ ВАШ БУНКЕР · ${state.capacity} МЕСТ</span><h3>${escape(b.name)}</h3><p>${escape(b.description)}</p><details class="world-details"><summary>Запасы и оснащение</summary><dl class="world-resources">${Object.entries(b.resources).map(([key,value])=>`<dt>${({food:'Еда',water:'Вода',energy:'Энергия'})[key]||escape(key)}</dt><dd>${escape(value)}</dd>`).join('')}</dl><h4>Оснащение</h4><ul>${b.equipment.map(x=>`<li>${escape(x)}</li>`).join('')}</ul></details><p class="world-hint">${(b.scenario_notes||[]).map(escape).join(' ')}</p></article></div>`;
}

// A synchronized announcement is visible to everyone. Secret card values are
// supplied only for the affected player's own cards by the authenticated API.
// Tie announcements use the same native modal treatment as special cards.
// Key by the unique discussion deadline so every tie in a long party is shown once.
function tieNoticeKey(){
 return `bunker-tie-notice:${state.code}:${state.me}:${state.gameNumber||1}:${state.discussionDeadline}`;
}
function pendingTieNotice(){
 if(!state||state.phase!=='tie_discussion'||!state.discussionDeadline||!state.revoteCandidates?.length)return false;
 try{return localStorage.getItem(tieNoticeKey())!=='seen';}catch{return true;}
}
function dismissTieNotice(){
 if(!pendingTieNotice())return;
 try{localStorage.setItem(tieNoticeKey(),'seen');}catch{}
 document.querySelector('#tie-notice')?.close();
}
function tieNoticeDialog(){
 if(!pendingTieNotice())return '';
 const candidates=state.revoteCandidates.map(id=>state.players.find(p=>p.id===id)).filter(Boolean);
 const scores=state.lastVote?.scores||{};
 return `<dialog id="tie-notice" class="special-notice tie-notice" aria-labelledby="tie-notice-title" aria-describedby="tie-notice-description">
 <div class="special-notice-heading"><span class="special-notice-signal" aria-hidden="true">⚖</span><span class="eyebrow">НИЧЬЯ · КРУГ ${escape(state.round)}</span></div>
 <h2 id="tie-notice-title">Голоса разделились поровну!</h2>
 <p id="tie-notice-description">Эти участники получили одинаковое максимальное количество голосов. Никто пока не исключён.</p>
 <ul class="tie-notice-candidates">${candidates.map(p=>`<li><strong>${escape(p.name)}</strong><span>${escape(scores[p.id]??0)} голосов</span></li>`).join('')}</ul>
 <p>Сейчас начинается <strong>обсуждение</strong>. Затем вы сможете проголосовать <strong>только за перечисленных кандидатов</strong>.</p>
 <p>Во время обсуждения живые игроки могут применить ещё не использованные особые условия. Ведущий вправе начать переголосование раньше таймера.</p>
 <button type="button" class="primary special-notice-ok" data-action="tie-notice-close">Понятно →</button>
 </dialog>`;
}
function specialNoticeKey(event){
 return `bunker-special-notice:${state.code}:${state.me}:${state.gameNumber||1}:${event.id}`;
}
function pendingSpecialNotice(){
 if(!state||!['turn','tie_discussion','vote'].includes(state.phase))return null;
 const event=state.specialEvents?.at(-1);
 if(!event?.id)return null;
 try{return localStorage.getItem(specialNoticeKey(event))==='seen'?null:event;}catch{return event;}
}
function dismissSpecialNotice(){
 const event=pendingSpecialNotice();
 if(!event)return;
 try{localStorage.setItem(specialNoticeKey(event),'seen');}catch{}
 document.querySelector('#special-notice')?.close();
}
function specialNoticeDialog(){
 const event=pendingSpecialNotice();if(!event)return '';
 const self=state.players.find(p=>p.id===state.me);
 const privateResult=state.specialPrivateResults?.find(r=>r.eventId===event.id);
 const impacted=event.results.some(r=>r.playerId===state.me);
 const intro=impacted?'ВАШЕ ДОСЬЕ ИЗМЕНИЛОСЬ':'ОСОБОЕ УСЛОВИЕ ПРИМЕНЕНО';
 return `<dialog id="special-notice" class="special-notice" aria-labelledby="special-notice-title" aria-describedby="special-notice-description">
  <div class="special-notice-heading"><span class="special-notice-signal" aria-hidden="true">✳</span><span class="eyebrow">${intro} · КРУГ ${escape(event.round)}</span></div>
  <h2 id="special-notice-title">${escape(event.actor)} применил(а) «${escape(event.name)}»</h2>
  <p id="special-notice-description">Затронута категория: <strong>${escape(event.category)}</strong>. ${impacted?'Посмотрите, что изменилось у вас и остальных.':'Вот какие карточки изменились.'}</p>
  <ul class="special-notice-changes">${event.results.map(r=>{
   const own=r.playerId===state.me;
   const before=own&&privateResult?privateResult.before??'Карточка сброшена':r.before;
   const after=own&&privateResult?privateResult.after??'Карточка сброшена':r.after;
   return `<li class="${own?'is-own':''}"><div class="special-notice-person"><strong>${own?'ВАШЕ ДОСЬЕ · ':''}${escape(r.playerName)}</strong><span>${escape(event.category)}</span></div><div class="special-notice-change"><span class="special-notice-before">${escape(before)}</span><span class="special-notice-arrow" aria-hidden="true">→</span><strong class="special-notice-after">${escape(after)}</strong></div>${r.unchanged?'<small>Карточка осталась прежней</small>':''}</li>`;
  }).join('')}</ul>
  <p class="special-notice-privacy">Закрытые карточки других игроков остаются секретными. Изменения сохранены в игре.</p>
  <button type="button" class="primary special-notice-ok" data-action="notice-close">Понятно →</button>
 </dialog>`;
}
function specialResults(){
 const event=state.specialEvents?.at(-1);if(!event)return '';
 return `<section class="special-results" aria-labelledby="special-result-title"><span class="eyebrow">ПОСЛЕДНЕЕ ОСОБОЕ УСЛОВИЕ · КРУГ ${escape(event.round)}</span><h3 id="special-result-title">${escape(event.actor)}: ${escape(event.name)}</h3><ul>${event.results.map(r=>`<li data-result-player="${escape(r.playerId)}"><strong>${escape(r.playerName)} <span>· ${escape(event.category)}</span></strong><p>${escape(r.before)} <span aria-hidden="true">→</span> <b>${escape(r.after)}</b>${r.unchanged?' <small>(без изменений)</small>':''}</p></li>`).join('')}</ul><p class="special-results-note">Изменения сохранены и видны всем. Значения закрытых карточек остаются скрытыми, кроме принудительного раскрытия. Подробности — в журнале.</p></section>`;
}
function dossier(me,current,mine){
 const keys=Object.entries(state.categories).filter(([k])=>Object.hasOwn(me.cards,k));
 const total=keys.length, opened=keys.filter(([k])=>me.revealed.includes(k)).length;
 const percent=total?Math.round(opened/total*100):0;
 const slots=keys.map(([k],i)=>`<span class="dossier-meter-slot ${me.revealed.includes(k)?'is-filled':''}" aria-hidden="true"></span>`).join('');
 const own=`<section class="dossier-file" data-dossier-key="${escape(state.code)}:${escape(me.id)}:${state.gameNumber||1}" data-progress-count="${opened}" aria-label="Досье выжившего">
 
 <div class="dossier-file-heading"><span class="dossier-file-stripes" aria-hidden="true">///</span><h3>ДОСЬЕ ВЫЖИВШЕГО</h3><span class="dossier-file-stripes" aria-hidden="true">///</span></div>
 <div class="dossier-file-profile"><canvas class="dossier-file-avatar" data-gender="${avatarIdentity(me.cards.biology,me.id,state.gameNumber||1).gender}" data-index="${avatarIdentity(me.cards.biology,me.id,state.gameNumber||1).index}" role="img" aria-label="Пиксельный портрет персонажа из коллекции" width="144" height="144"></canvas><div class="dossier-file-identity"><strong>${escape(me.name)}</strong><small>УЧАСТНИК УБЕЖИЩА · ${escape(state.code)}</small><div class="dossier-file-progress"><span>ПРОФИЛЬ: ${percent}% РАСКРЫТО</span><strong>${opened} ИЗ ${total}</strong></div><div class="dossier-progress" role="progressbar" aria-label="Раскрыто характеристик" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${opened}">${slots}</div></div></div>
 <div class="dossier-file-list">${keys.map(([k,label])=>handCard(me,mine,k,label)).join('')}</div>
 <p class="dossier-file-footnote">Закрытые карточки видны только вам. Открытые становятся доступны группе.</p>
 </section>`;
 if(state.phase!=='turn'||mine)return `<div id="active-dossier">${own}</div>`;
 return `<section id="active-dossier" class="active-dossier"><span class="eyebrow">СЕЙЧАС СЛОВО У</span><h3>${escape(current.name)}</h3><p class="private-note">Открытые карточки участника</p><div class="hand">${current.revealed.filter(k=>Object.hasOwn(current.cards,k)).map(k=>`<article class="card dossier-public-card"><span class="dossier-card-top"><span class="card-label">${dossierIcon(k)}${escape(state.categories[k])}</span><small class="dossier-card-status">РАСКРЫТО</small></span><span class="dossier-card-content"><strong>${current.cards[k]===null?'Карточка сброшена':escape(current.cards[k])}</strong>${current.descriptions?.[k]?`<p class="card-description">${escape(current.descriptions[k])}</p>`:''}</span></article>`).join('')||'<p class="muted">Участник ещё не открыл карточки.</p>'}</div></section><details class="own-dossier"><summary>Ваше досье · посмотреть свои карточки</summary>${own}</details>`;
}
function invitation(){
 if(!inviteOpen||!state)return '';
 const origin=inviteOrigin||location.origin;
 const link=new URL('/?join='+encodeURIComponent(state.code),origin).href;
 let svg='';
 try{const qr=window.qrcode(0,'M');qr.addData(link);qr.make();svg=qr.createSvgTag(4,4);}
 catch(e){svg='<p>QR-код недоступен. Воспользуйтесь ссылкой ниже.</p>';}
 const local=inviteMdnsOrigin?new URL('/?join='+encodeURIComponent(state.code),inviteMdnsOrigin).href:null;
 return `<section class="local-invite" aria-label="Приглашение игроков"><h3>Пригласить в бункер</h3><p>Подключитесь к одной Wi-Fi сети. Сканируйте QR-код или откройте адрес в браузере.</p><div class="local-invite-content"><div class="local-invite-qr" role="img" aria-label="QR-код входа в комнату">${svg}</div><div class="local-invite-address"><code>${escape(link)}</code><button type="button" class="secondary" data-action="copy-invite">Скопировать ссылку</button>${local?`<small>Экспериментальный адрес: ${escape(local)} (нужна поддержка mDNS на устройствах)</small>`:''}<small>QR-код содержит только ссылку и код комнаты, без личных данных. Если хост сменит IP, откройте приглашение заново.</small></div></div></section>`;
}
function room(){const me=state.players.find(p=>p.id===state.me), current=state.players.find(p=>p.id===state.turn), alive=state.players.filter(p=>p.alive), mine=state.phase==='turn'&&state.turn===me.id;
 // Reorder presentation only: active players first, expelled players last; retain join order within each group.
 const orderedPlayers=[...alive,...state.players.filter(p=>!p.alive)];
 const tieNames=(state.revoteCandidates||[]).map(id=>state.players.find(p=>p.id===id)?.name).filter(Boolean);
 const status=state.phase==='lobby'?'ЗАЛ ОЖИДАНИЯ':state.phase==='finished'?'СОСТАВ ОПРЕДЕЛЁН':state.phase==='tie_discussion'?'НИЧЬЯ · ОБСУЖДЕНИЕ':state.phase==='vote'?(state.revoteCandidates?'ПЕРЕГОЛОСОВАНИЕ':'ВРЕМЯ РЕШАТЬ'):`КРУГ ${state.round} / ОБСУЖДЕНИЕ`;
 const banner=state.phase==='lobby'?`<div><h2>Собираем выживших<span class="dots">…</span></h2><p>Пригласите друзей по коду комнаты. Нужно от 5 до 16 игроков.</p></div><button class="primary" data-action="start" ${state.host!==me.id||state.players.length<5?'disabled':''}>${state.host===me.id?'Начать игру →':'Ожидаем ведущего'}</button>`:state.phase==='finished'?`<div><h2>ПОБЕДИТЕЛИ ПАРТИИ</h2><p>В убежище остаются: <strong>${alive.map(p=>escape(p.name)).join(', ')||'никто'}</strong>.</p><p class="winners-count">Выжили: ${alive.length} из ${state.players.length}. Все карточки раскрыты.</p></div><div class="ending-actions"><button class="secondary" data-action="ending-replay">Посмотреть финальный экран</button>${state.host===me.id?'<button class="primary" data-action="next_game">Следующая партия тем же составом →</button>':'<span>Ожидаем следующую партию от ведущего</span>'}</div>`:state.phase==='tie_discussion'?`<div><h2>НИЧЬЯ · ОБСУЖДЕНИЕ</h2><p>Одинаковое максимальное число голосов: <strong>${tieNames.map(escape).join(', ')}</strong>.</p><p>Обсудите, кого оставить. После обсуждения можно будет голосовать <strong>только за этих участников</strong>. Пока идёт обсуждение, живые игроки могут применять неиспользованные особые условия.</p></div>${state.host===me.id?'<button type="button" class="primary" data-action="start_revote">Начать переголосование →</button>':'<span class="live-label">ОЖИДАЕМ ПЕРЕГОЛОСОВАНИЯ</span>'}`:state.phase==='vote'?`<div><h2>${state.revoteCandidates?'ПЕРЕГОЛОСОВАНИЕ':'Кто покинет бункер?'}</h2><p>${state.hasVoted?'Ваш голос принят. Ожидаем остальных.':state.revoteCandidates?`Выбирайте только между: ${tieNames.map(escape).join(', ')}. За себя голосовать нельзя.`:'Выберите другого живого участника. За себя голосовать нельзя.'} Изгнанные тоже голосуют.</p></div><div class="counter">${state.voteCount}<span> / ${state.players.length} голосов</span></div>`:`<div><h2>${mine?'Ваше слово.':`Слово у ${escape(current.name)}`}</h2><p>${mine?(state.opened?'Расскажите, почему это поможет группе.':state.round===1?'Откройте профессию и представьтесь.':'Выберите одну закрытую карточку для раскрытия.'):'Слушайте аргументы. Следующий выбор может изменить всё.'}</p></div>${mine?`<button class="primary" data-action="next" ${!state.opened&&Object.keys(me.cards).some(k=>me.cards[k]&&!me.revealed.includes(k))?'disabled':''}>Передать слово →</button>`:current?.bot&&state.host===me.id?`<button class="primary" data-action="bot_step" aria-label="Сыграть ход бота ${escape(current.name)}">Ход бота →</button>`:'<span class="live-label"><i class="signal"></i> ИДЁТ ОБСУЖДЕНИЕ</span>'}`;
 const deadline=state.phase==='turn'?state.turnDeadline:state.phase==='vote'?state.voteDeadline:state.phase==='tie_discussion'?state.discussionDeadline:null;
 const timer=deadline?`<div class="phase-timer"><span>${state.phase==='turn'?'ВРЕМЯ НА ХОД':state.phase==='tie_discussion'?'ДО ПЕРЕГОЛОСОВАНИЯ':'ГОЛОСОВАНИЕ ЗАКРОЕТСЯ ЧЕРЕЗ'}</span><strong data-deadline="${deadline}">${fmtTime(deadline)}</strong></div>`:'';
 const hostTools=state.host===me.id&&state.players.some(p=>!p.bot&&p.id!==me.id)?`<div class="host-tools"><label for="host-target">Передать роль ведущего</label><select id="host-target">${state.players.filter(p=>!p.bot&&p.id!==me.id).map(p=>`<option value="${p.id}">${escape(p.name)}</option>`).join('')}</select><button class="secondary" data-action="transfer_host">Передать управление</button></div>`:'';

 const mobilePlayAction=state.phase==='lobby'
  ?(state.host===me.id
    ?`<button type="button" data-action="start" ${state.players.length<5?'disabled':''}>${state.players.length<5?'Начать игру · нужно 5 игроков':'Начать игру →'}</button>`:'')
  :state.phase==='turn'
    ?(mine?`<button type="button" data-action="next" ${!state.opened&&Object.keys(me.cards).some(k=>me.cards[k]&&!me.revealed.includes(k))?'disabled':''}>Передать слово →</button>`
      :current?.bot&&state.host===me.id?`<button type="button" data-action="bot_step" aria-label="Передать ход боту ${escape(current.name)}">Передать ход боту →</button>`:'')
    :state.phase==='tie_discussion'&&state.host===me.id
      ?'<button type="button" data-action="start_revote">Начать переголосование →</button>'
    :state.phase==='vote'&&!state.hasVoted
      ?'<button type="button" data-action="jump-players">Выбрать игрока →</button>'
      :'';
 const mobileNavigation=(state.phase==='lobby'&&!mobilePlayAction)?'':`<nav class="mobile-playbar" aria-label="Управление игрой"><div class="mobile-playbar-status"><span>${state.phase==='lobby'?'ЗАЛ ОЖИДАНИЯ':state.phase==='turn'?`РАУНД ${state.round}`:state.phase==='tie_discussion'?'ОБСУЖДЕНИЕ НИЧЬЕЙ':state.phase==='vote'?(state.revoteCandidates?'ПЕРЕГОЛОСОВАНИЕ':'ГОЛОСОВАНИЕ'):'ИТОГИ'}</span><strong>${state.phase==='lobby'?'СОБИРАЕМ ИГРОКОВ':state.phase==='turn'?(mine?'ВАШ ХОД':escape(current?.name||'')):state.phase==='tie_discussion'?'ОБСУДИТЕ КАНДИДАТОВ':state.phase==='vote'?(state.hasVoted?'ГОЛОС ПРИНЯТ':'ВЫБЕРИТЕ ИГРОКА'):'ИГРА ЗАВЕРШЕНА'}</strong></div>${deadline?`<span class="mobile-playbar-clock" data-deadline="${deadline}">${fmtTime(deadline)}</span>`:''}${mobilePlayAction?`<div class="mobile-playbar-actions">${mobilePlayAction}</div>`:''}</nav>`;
 const testPanel=state.phase==='lobby'&&state.host===me.id&&state.players.length<5?`<section class="test-panel"><div><span class="eyebrow">ПРОВЕРИТЬ БЕЗ КОМПАНИИ</span><p>Можно начать одному или вдвоём. Добавим ботов до пяти участников: вы сможете пройти все круги и голосования.</p></div><button class="secondary" data-action="start_test">Тестовая игра с ботами</button></section>`:state.testMode?`<section class="test-panel"><div><span class="eyebrow">ТЕСТОВАЯ ПАРТИЯ · С БОТАМИ</span><p>${state.host===me.id?'Свой ход и голос выполняйте как обычно. Ходы ботов запускайте кнопкой: они открывают случайную карточку и передают слово. Боты голосуют случайно и автоматически после всех людей.':'Ведущий запускает ходы ботов. Боты голосуют автоматически после всех людей.'}</p></div></section>`:'';
 return `${header()}<main class="game phase-${state.phase}"><div class="room-heading"><div><span class="eyebrow">${status}</span><h1>Ваше убежище</h1><p class="room-subtitle">${state.phase==='lobby'?'Соберите команду. Решите, кто останется.':'Каждая карточка может изменить решение.'}</p></div><button class="room-code" data-action="copy" aria-label="Копировать код ${state.code}"><span>КОД КОМНАТЫ</span><strong>${state.code} <span aria-hidden="true">⧉</span></strong><small>Нажмите, чтобы скопировать</small></button></div>${hostTools}${state.phase==='lobby'?'<button type="button" class="secondary invite-toggle" data-action="invite">' +(inviteOpen?'Скрыть приглашение':'Показать QR-код приглашения')+'</button>':''}${state.phase==='lobby'?invitation():''}${collapsibleWorld()}<section class="banner">${banner}${timer}</section>${!me.alive&&state.phase!=='lobby'?`<section class="exile-notice" role="status" aria-live="polite"><strong>ВЫ ИЗГНАНЫ ИЗ БУНКЕРА</strong><span>Вы больше не претендуете на место в убежище, но можете наблюдать за игрой и участвовать в голосовании по правилам.</span></section>`:''}${testPanel}${specialResults()}<div class="game-columns"><section><div class="section-title"><h3>Участники <span>${state.players.length}</span></h3><small>${state.phase==='lobby'?`Первое голосование: круг ${Math.max(1,9-state.players.length)}`:`Внутри: ${alive.length} / мест: ${state.capacity}`}</small></div>${state.phase==='vote'?`<p class="vote-instruction">${state.revoteCandidates?'Переголосование: допустимы только '+tieNames.map(escape).join(', ')+'.':'Выберите кандидата на исключение.'} Голос отправляется сразу и не меняется.</p>`:state.phase==='tie_discussion'?'<p class="vote-instruction">Сейчас обсуждение. Голосование откроется после него; живые участники могут применять особые условия.</p>':''}<div class="players">${orderedPlayers.map(p=>`<article class="player ${p.id===state.turn&&state.phase==='turn'?'current':''} ${!p.alive?'out':''}"><div class="player-top">${(state.phase==='finished'||(p.revealed.includes('profession')&&p.revealed.includes('biology')))&&p.cards.biology?`<canvas class="avatar player-portrait" data-gender="${avatarIdentity(p.cards.biology,p.id,state.gameNumber||1).gender}" data-index="${avatarIdentity(p.cards.biology,p.id,state.gameNumber||1).index}" width="144" height="144" role="img" aria-label="Портрет ${escape(p.name)}"></canvas>`:`<span class="avatar" aria-label="Портрет скрыт">${escape(p.name[0].toUpperCase())}</span>`}<div><strong>${escape(p.name)}${p.id===me.id?' <small>ВЫ</small>':''}</strong><small>${!p.alive?'<span class="exile-label">ИЗГНАН</span> · Голосует':p.id===state.host?'Ведущий':p.bot?'Бот · тестовый участник':'Участник'}</small><span class="player-presence ${p.bot?'presence-bot':p.connected?'presence-online':'presence-offline'}" aria-label="${p.bot?'Виртуальный игрок':p.connected?'Игрок подключён':'Игрок не отвечает'}"><span class="player-presence-dot" aria-hidden="true"></span>${p.bot?'БОТ':p.connected?'В СЕТИ':'НЕТ СВЯЗИ'}</span></div>${state.phase==='vote'&&p.alive&&(!state.revoteCandidates||state.revoteCandidates.includes(p.id))&&p.id!==me.id&&!state.hasVoted?`<button class="vote-btn" data-vote="${p.id}" aria-label="Голосовать за исключение: ${escape(p.name)}"><span aria-hidden="true">✕</span> <span>Исключить</span></button>`:''}</div>${state.phase!=='lobby'?`<div class="public-cards">${Object.entries(p.cards).filter(([k])=>p.revealed.includes(k)||state.phase==='finished').map(([k,v])=>`<p><span>${escape(state.categories[k])}</span>${v===null?'Карточка сброшена':escape(v)}${k==='special'&&p.specialUsed?' · использовано':''}${p.descriptions?.[k]?`<small class="card-description">${escape(p.descriptions[k])}</small>`:''}</p>`).join('')||'<span class="muted">Карточки пока не раскрыты</span>'}</div>`:''}</article>`).join('')}</div></section><aside>${state.phase==='lobby'?`<div class="side-note"><span class="eyebrow">ПЕРЕД СТАРТОМ</span><h3>У каждого есть шанс.</h3><p>Соберитесь за одним столом и откройте игру каждый на своём телефоне. Обсуждайте карточки вслух — и не спешите с выводами.</p><p>Код комнаты: <strong>${state.code}</strong></p><p>Если вкладка закроется, зайдите снова в этом браузере: ваше место сохранится.</p></div>`:dossier(me,current,mine)}</aside></div>${state.log.length?`<details class="journal"><summary>Журнал событий · ${state.log.length}</summary>${state.log.slice().reverse().map(x=>`<p>${escape(x)}</p>`).join('')}</details>`:''}</main>${mobileNavigation}${rules}${specialDialog()}${specialNoticeDialog()}${tieNoticeDialog()}`;
}
function render(){if(showEnding()){if(!document.querySelector('.ending-screen')){app.innerHTML=endingScreen();const image=document.querySelector('.ending-image');image.addEventListener('error',()=>{const fallback=image.dataset.fallback;if(fallback&&image.getAttribute('src')!==fallback){image.src=fallback;image.removeAttribute('data-fallback');}});document.querySelector('#ending-title').focus({preventScroll:true});window.scrollTo(0,0);}return;}if(shouldShowDisaster()){specialDraft=null;if(document.querySelector('#disaster-intro')?.dataset.introKey!==disasterPresentationKey()){app.innerHTML=disasterIntro();document.querySelector('#disaster-title').focus({preventScroll:true});window.scrollTo(0,0);}return;}if(specialDraft&&(!state||!(state.phase==='tie_discussion'&&state.players.find(p=>p.id===state.me)?.alive || state.phase==='turn'&&state.turn===state.me)||!state.specialAvailable))specialDraft=null;const dialogOpen=document.querySelector('#rules')?.open;const expanded=['.world-details','.journal','.own-dossier'].filter(selector=>document.querySelector(selector)?.open);const previousScrollY=state?window.scrollY:0;const previousDossier=document.querySelector('.dossier-file');const oldDossierKey=previousDossier?.dataset.dossierKey;const oldFilledSlots=new Set([...previousDossier?.querySelectorAll('.dossier-meter-slot.is-filled')||[]].map(el=>[...el.parentNode.children].indexOf(el)));const oldVideo=document.querySelector('.landing-video');if(state)oldVideo?.pause();app.innerHTML=state?room():landing();paintAvatars();const currentDossier=document.querySelector('.dossier-file');if(oldDossierKey&&currentDossier?.dataset.dossierKey===oldDossierKey){currentDossier.querySelectorAll('.dossier-meter-slot.is-filled').forEach((slot,index)=>{if(!oldFilledSlots.has(index))slot.classList.add('is-new');});}if(!state){if(oldVideo)document.querySelector('.landing-video').replaceWith(oldVideo);syncLandingMotion();}for(const selector of expanded){const details=document.querySelector(selector);if(details)details.open=true;}if(dialogOpen)document.querySelector('#rules').showModal();if(specialDraft)document.querySelector('#special-dialog').showModal();const tieNotice=document.querySelector('#tie-notice');const notice=document.querySelector('#special-notice');
if(tieNotice&&!tieNotice.open)tieNotice.showModal();
else if(!tieNotice&&notice&&!notice.open)notice.showModal();renderedTurn=state?.phase==='turn'?state.turn:null;updateTimers();if(state)window.scrollTo({top:previousScrollY,left:0,behavior:'instant'});}
async function refresh(){
 if(!session||busy||refreshInFlight||document.hidden)return;
 refreshInFlight=true;
 const requestedSession=session, requestedEpoch=actionEpoch;
 try{
  const data=await api(`/api/rooms/${requestedSession.code}`);
  // A request started before a local action must never overwrite its newer result.
  if(busy||requestedEpoch!==actionEpoch||session!==requestedSession)return;
  const serial=JSON.stringify(data);
  if(serial!==last){state=data;prepareDisasterArtwork(state?.disaster);last=serial;render();}
 }catch(e){if(session===requestedSession&&!busy)toast(e.message);}
 finally{refreshInFlight=false;}
}
app.addEventListener('submit',async e=>{if(e.target.id!=='entry')return;e.preventDefault();if(busy)return;busy=true;actionEpoch++;const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;const data=new FormData(e.target);try{session=await api(mode==='create'?'/api/rooms':`/api/rooms/${data.get('code')}/join`,{name:data.get('name')});localStorage.setItem('bunker-session',JSON.stringify(session));last='';}catch(e){toast(e.message);}finally{busy=false;btn.disabled=false;await refresh();}});
app.addEventListener('click',async e=>{const btn=e.target.closest('button');if(!btn||btn.disabled)return;
 if(btn.dataset.mode){const name=document.querySelector('#name')?.value;const code=document.querySelector('#code')?.value;mode=btn.dataset.mode;render();const nameInput=document.querySelector('#name');if(nameInput)nameInput.value=name||'';const codeInput=document.querySelector('#code');if(codeInput)codeInput.value=code||'';return;}
 const action=btn.dataset.action;
 if(action==='invite'){
  if(inviteOpen){inviteOpen=false;render();return;}
  try{
   if(['localhost','127.0.0.1','::1'].includes(location.hostname)){
    const r=await fetch('/api/local-link');if(!r.ok)throw Error('Не удалось определить адрес хоста');
    const data=await r.json();if(!data.localOrigin)throw Error('Включите точку доступа Wi-Fi и повторите');
    inviteOrigin=data.localOrigin;inviteMdnsOrigin=data.mdnsOrigin;
   }else{inviteOrigin=location.origin;inviteMdnsOrigin=null;}
   inviteOpen=true;render();
  }catch(e){toast(e.message);}
  return;
 }
 if(action==='copy-invite'){
  const link=new URL('/?join='+encodeURIComponent(state.code),inviteOrigin||location.origin).href;
  try{await navigator.clipboard.writeText(link);toast('Ссылка скопирована');}
  catch{toast('Скопируйте ссылку над кнопкой');}
  return;
 }
 if(action==='jump-players'||action==='jump-dossier'){
  const target=action==='jump-players'?document.querySelector('.game .section-title'):document.querySelector('#active-dossier');
  target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
  return;
 }
 if(action==='toggle-world'){worldCollapsed=!worldCollapsed;try{localStorage.setItem('bunker-world-collapsed',String(worldCollapsed));}catch{}render();return;}
 if(action==='ending-continue'){replayEnding=false;seenEndings.add(endingKey());try{localStorage.setItem(endingKey(),'seen');}catch{}render();window.scrollTo(0,0);return;}
 if(action==='ending-replay'){replayEnding=true;render();return;}


 if(action==='intro-continue'){replayDisasterKey=null;const key=disasterIntroKey();seenDisasters.add(key);try{localStorage.setItem(key,'seen');}catch{}render();window.scrollTo(0,0);const heading=document.querySelector('.room-heading h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}return;}
 if(action==='intro-text'){textDisasters.add(disasterIntroKey());render();return;}
 if(action==='intro-image'){textDisasters.delete(disasterIntroKey());const image=disasterImageFor(state.disaster);if(image)failedDisasterImages.delete(image.src);render();return;}
 if(action==='disaster-open'){replayDisasterKey=disasterIntroKey();textDisasters.delete(disasterIntroKey());render();return;}
 if(action==='rules'){document.querySelector('#rules').showModal();return;}if(action==='close'){document.querySelector('#rules').close();return;}
 if(action==='exit'){replayEnding=false;replayDisasterKey=null;specialDraft=null;session=null;state=null;last='';render();return;}
 if(action==='resume'){try{session=JSON.parse(localStorage.getItem('bunker-session'));last='';await refresh();}catch{toast('Не удалось восстановить сессию.');}return;}
 if(action==='copy'){try{await navigator.clipboard.writeText(state.code);toast('Код комнаты скопирован');}catch{toast('Код комнаты: '+state.code);}return;}
 if(action==='tie-notice-close'){dismissTieNotice();render();return;}if(action==='notice-close'){dismissSpecialNotice();render();return;} if(action==='special-close'){specialDraft=null;render();return;}
 if(action==='special-open'){if(busy)return;busy=true;try{specialDraft={...await api(`/api/rooms/${session.code}/special`),targetId:''};render();}catch(e){toast(e.message);}finally{busy=false;}return;}
 if((!action&&!btn.dataset.card&&!btn.dataset.vote)||busy)return;busy=true;actionEpoch++;btn.disabled=true;
 try{state=await api(`/api/rooms/${session.code}/action`,{action:btn.dataset.vote?'vote':btn.dataset.card?'reveal':action,value:action==='use_special'?{targetId:specialDraft?.targetId}:action==='transfer_host'?document.querySelector('#host-target')?.value:btn.dataset.vote||btn.dataset.card});prepareDisasterArtwork(state?.disaster);last=JSON.stringify(state);if(action==='use_special'){specialDraft=null;}if(action==='next_game'){replayEnding=false;replayDisasterKey=null;renderedTurn=null;}render();}catch(e){toast(e.message);btn.disabled=false;}finally{busy=false;}
});
app.addEventListener('cancel',e=>{if(e.target.id==='special-dialog')specialDraft=null;if(e.target.id==='special-notice')dismissSpecialNotice();if(e.target.id==='tie-notice')dismissTieNotice();},true);
app.addEventListener('change',e=>{
 if(!specialDraft)return;
 if(e.target.id==='special-target')specialDraft.targetId=e.target.value;
});
app.addEventListener('load',e=>{if(e.target.matches?.('[data-disaster-image]')){e.target.parentElement.classList.add('art-loaded');e.target.parentElement.querySelector('.intro-art-loading')?.remove();}},true);
app.addEventListener('error',e=>{
 if(!e.target.matches?.('[data-disaster-image]')||!e.target.isConnected)return;
 const original=disasterImageFor(state?.disaster)?.src;if(original&&!e.target.dataset.originalFallback){e.target.dataset.originalFallback='true';e.target.src=original;return;}
 failedDisasterImages.add(disasterImageFor(state?.disaster)?.src||e.target.getAttribute('src'));render();toast('Не удалось загрузить изображение. Показан текст карточки.');
},true);
render();refresh();setInterval(refresh,800);setInterval(updateTimers,250);document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateTimers();refresh();}});
