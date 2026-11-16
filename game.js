import { randomInt, randomBytes } from 'node:crypto';
import { categories, decks } from './cards.js';
import { createBiologyCard } from './biology.js';
import { chooseWorld } from './world.js';
import { cardDescription, eligibleCard, healthyCard } from './card-catalog.js';
import { applySpecial } from './special-actions.js';
import { specialCard } from './special-cards.js';
import { chooseBotVote, chooseBotReveal, chooseBotSpecialTarget } from './bot-ai.js';
import {assignBotPersonas} from './bot-personas.js';
import {chooseConsistentBotTarget} from './ai-commitments.js';
export { categories };
const pick = a => a[randomInt(a.length)];
// Independently randomize who draws first for each category.
const shuffledIndices = length => {
 const order=Array.from({length},(_,i)=>i);
 for(let i=order.length-1;i>0;i--){const j=randomInt(i+1);[order[i],order[j]]=[order[j],order[i]];}
 return order;
};
const recordedHistory = room => room.dealHistory&&typeof room.dealHistory==='object'?room.dealHistory:{};

const id = () => randomBytes(18).toString('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
export const firstVoteRound = n => Math.max(1, 9 - n);
// Server-authoritative deadlines: absence must not block an entire session.
export const TURN_TIMEOUT_MS = 3 * 60 * 1000 + 16 * 1000;
export const VOTE_TIMEOUT_MS = 2 * 60 * 1000;
export const TIE_DISCUSSION_MS = 90 * 1000;
export const RPS_TIMEOUT_MS = 90 * 1000;
const RPS_MOVES=['rock','paper','scissors'];
const beats={rock:'scissors',paper:'rock',scissors:'paper'};
export const HOST_INACTIVE_MS = 3 * 60 * 1000;
const human = p => !p.bot;
export function player(name) {
 name = String(name ?? '').trim();
 check(name.length >= 2 && name.length <= 24, 'Имя должно содержать от 2 до 24 символов.');
 return { id: id(), token: id(), recoveryCode: randomBytes(12).toString('hex'), lastSeen: Date.now(), name, alive: true, revealed: [], cards: {} };
}
export function createRoom(code, p) {
 return { code, host: p.id, players: [p], phase: 'lobby', gameNumber: 1, round: 0, votes: {}, log: [], updated: Date.now() };
}
export function join(room, p) {
 check(room.phase === 'lobby', 'Игра уже началась. Присоединиться можно к новой комнате.');
 check(room.players.length < 16, 'В комнате уже 16 игроков.');
 check(!room.players.some(x => x.name.toLowerCase() === p.name.toLowerCase()), 'Это имя уже занято.');
 room.players.push(p);
}
// Prepare the entire starting state off-room. No mutation is committed until every
// character has a valid, complete hand and a compatible disaster/bunker exists.
function prepareStart(players,history={}) {
 const capacity=Math.floor(players.length/2);
 const {disaster,bunker}=chooseWorld(capacity,randomInt,{disasters:history.disasters,bunkers:history.bunkers});
 const pools=Object.fromEntries(Object.entries(decks).map(([key,values])=>[key,[...values]]));
 const hands=players.map(()=>({biology:createBiologyCard()}));
 for(const [key,pool] of Object.entries(pools)){
  const seen=new Set(history[key]||[]);
  for(const index of shuffledIndices(players.length)){
   const cards=hands[index];
   let eligible=pool.filter(name=>eligibleCard(key,name,cards.biology,disaster));
   if(!eligible.length)throw new Error(`Недостаточно подходящих карточек: ${key}`);
   // Previously the health preference ran BEFORE the unseen-card filter.
   // With only a few "healthy" entries this could repeat a previous game's
   // health card despite many unseen eligible alternatives in the deck.
   // Freshness takes precedence; the 1-in-4 preference applies only within
   // the currently available freshness tier.
   const unused=eligible.filter(name=>!seen.has(name));
   let candidates=unused.length?unused:eligible;
   if(key==='health'){
    const wantHealthy=randomInt(4)===0;
    const preferred=candidates.filter(name=>healthyCard(name)===wantHealthy);
    if(preferred.length)candidates=preferred;
   }
   const name=pick(candidates);
   cards[key]=name;
   pool.splice(pool.indexOf(name),1);
  }
 }
 for(const cards of hands)check(Object.keys(cards).length===Object.keys(decks).length+1,'Раздача карточек неполная.');
 return {capacity,firstVote:firstVoteRound(players.length),disaster,bunker,hands};
}
function commitStart(room,players,prepared,testMode=false){
 // All potentially failing catalog lookups and eligibility checks happened above.
 room.players=players;
 for(let i=0;i<players.length;i++)players[i].cards=prepared.hands[i];
 room.capacity=prepared.capacity;room.firstVote=prepared.firstVote;
 room.disaster=prepared.disaster;room.bunker=prepared.bunker;
 // Successful deals only: persisted server-side across the room's games.
 const history=recordedHistory(room);
 for(const [key,values] of Object.entries(decks)){
  history[key]=[...new Set([...(history[key]||[]),...prepared.hands.map(hand=>hand[key])])].filter(name=>values.includes(name));
 }
 history.disasters=[...new Set([...(history.disasters||[]),prepared.disaster.id])];
 history.bunkers=[...new Set([...(history.bunkers||[]),prepared.bunker.id])];
 room.dealHistory=history;
 if(testMode)room.testMode=true;
 room.phase='turn';room.round=1;room.turn=players[0].id;
 room.opened=false;room.turnDeadline=Date.now()+TURN_TIMEOUT_MS;
 delete room.voteDeadline;
 room.log.push('Шлюз закрыт. Начинается знакомство.');
}
// Test bots may play their one-use special during their turn. Select only
// legitimate targets and never let an inapplicable card interrupt a bot turn.
function botSpecialMove(room,bot){
 const card=specialCard(bot.cards.special);
 if(!card||bot.specialUsed)return false;
 const key=card.category;
 const targets=room.players.filter(p=>{
  if(card.revealedOnly&&!p.revealed.includes(key))return false;
  if(card.effect==='reveal')return Boolean(p.cards[key])&&!p.revealed.includes(key);
  if(card.effect==='discard')return Boolean(p.cards[key])&&(p.id===bot.id||p.revealed.includes(key));
  if(card.effect==='swap')return p.id!==bot.id&&Object.hasOwn(p.cards,key)&&p.cards[key]!==bot.cards[key]&&
   (p.cards[key]===null||eligibleCard(key,p.cards[key],bot.cards.biology,room.disaster))&&
   (bot.cards[key]===null||eligibleCard(key,bot.cards[key],p.cards.biology,room.disaster));
  return false;
 });
 const selected=chooseBotSpecialTarget(room,bot,card,targets);
 if(['discard','swap','reveal'].includes(card.effect)&&!selected)return false;
 // Shuffles can fail to find a legal permutation; retry next round instead of
 // consuming the special. Do not swallow unexpected application errors.
 try{applySpecial(room,bot,selected?{targetId:selected.id}:{});return true;}
 catch(e){if(/Не удалось безопасно перетасовать|Нужны хотя бы|В колоде нет другой|Недостаточно|не получил|несовместим/.test(e.message))return false;throw e;}
}
// Record only each bot's own actual ballot for later self-explanation.
// It is kept server-side and never exposed to other players or bots.
function recordBotBallot(room,bot,targetId){
 if(!room.aiMode||!bot.bot)return;
 room.aiBotVoteHistory??={};
 const history=room.aiBotVoteHistory[bot.id]??=[];
 const stored=room.aiBotVoteReasons?.[bot.id];
 const target=room.players.find(p=>p.id===targetId);
 const publicProfession=target?.revealed?.includes('profession')?String(target.cards?.profession||''):null;
 const energy=Number(room.bunker?.energy_days);
 const fallbackReason=publicProfession
  ?'Сравнил открытую профессию «'+publicProfession+'» с текущими потребностями убежища и другими кандидатами.'
  :Number.isFinite(energy)&&energy===0
   ?'При отсутствии энергоснабжения предпочёл сохранить участников с подтверждёнными практическими навыками.'
   :'При недостатке подтверждённых сведений выбрал этого кандидата по доступным открытым карточкам.';
 const reason=stored?.targetId===targetId&&stored.round===room.round?stored.reason:fallbackReason;
 history.push({round:room.round,targetId,revote:Boolean(room.revoteCandidates),reason});
 room.aiBotVoteHistory[bot.id]=history.slice(-12);
}
export function act(room, p, action, value) {
 if (action === 'next_game') {
  check(room.phase === 'finished' && room.host === p.id, 'Следующую партию готовит ведущий после завершения игры.');
  const humans=room.players.filter(x=>!x.bot),next=humans[(humans.findIndex(x=>x.id===room.host)+1)%humans.length];
  const index=room.players.findIndex(x=>x.id===next.id),players=[...room.players.slice(index),...room.players.slice(0,index)];
  const gameNumber=(room.gameNumber||1)+1,testMode=room.testMode,aiMode=room.aiMode;
  for(const person of players){person.alive=true;person.cards={};person.revealed=[];delete person.specialUsed;}
  const fresh={...createRoom(room.code,next),players,gameNumber,dealHistory:recordedHistory(room)};if(testMode)fresh.testMode=true;if(aiMode){fresh.aiMode=true;fresh.aiChat=[];}
  for(const key of Object.keys(room))delete room[key];Object.assign(room,fresh);
  room.log.push(`Партия ${gameNumber}. Ведущий и первое слово: ${next.name}.`);
  } else if (action === 'transfer_host') {
  check(room.host === p.id, 'Передать роль ведущего может только действующий ведущий.');
  const target = room.players.find(x => x.id === value && human(x));
  check(target && target.id !== p.id, 'Выберите другого участника (не бота).');
  room.host = target.id;
  room.log.push(`Ведущий теперь ${target.name}.`);
 } else if (action === 'start_test' || action === 'start_ai_test') {
  check(room.host === p.id && room.phase === 'lobby', 'Тестовую игру запускает ведущий до начала партии.');
  check(room.players.length < 5, 'В комнате уже достаточно участников для обычной игры.');
  // Bots are staged locally: failed dealing leaves the lobby and its humans intact.
  const participants=[...room.players];
  let number=1;
  while(participants.length<5){
   const name=`Бот ${number++}`;
   if(participants.some(x=>x.name.toLowerCase()===name.toLowerCase()))continue;
   const bot=player(name);bot.bot=true;participants.push(bot);
  }
  const prepared=prepareStart(participants,recordedHistory(room));
  commitStart(room,participants,prepared,true);
  if(action==='start_ai_test'){
   room.aiMode=true;
   room.aiChat=[];
   assignBotPersonas(participants.filter(x=>x.bot));
  }
  room.log.push(room.aiMode?'Тестовая игра с ИИ-персонажами: чат включён, решения проверяются правилами.':
   'Тестовая партия: ведущий запускает ходы ботов, их голоса поступают автоматически после голосов всех людей.');
 } else if (action === 'bot_step') {
  check(room.testMode && room.host === p.id && room.phase === 'turn', 'Управление ботами доступно ведущему в тестовой партии.');
  const bot=room.players.find(x=>x.id===room.turn);
  check(bot?.bot && bot.alive, 'Сейчас ход живого участника, а не бота.');
  // This button passes the word to exactly ONE next player. The bot's
  // new card was already revealed when its turn began, just like a human.
  nextTurn(room);
  revealCurrentBot(room);
 } else if (action === 'rps_move') {
  check(room.phase==='rps'&&room.rps?.candidates.includes(p.id),'В су-е-фа участвуют только кандидаты с равным числом голосов.');
  check(RPS_MOVES.includes(value),'Выберите камень, ножницы или бумагу.');
  check(!Object.hasOwn(room.rps.choices,p.id),'Вы уже сделали выбор в этом раунде.');
  room.rps.choices[p.id]=value;
  resolveRps(room);
 } else if (action === 'start_revote') {
  check(room.phase === 'tie_discussion' && room.host === p.id, 'Начать переголосование может ведущий после ничьей.');
  beginRevote(room);
 } else if (action === 'bot_votes') {
  check(room.testMode && room.host === p.id && room.phase === 'vote', 'Голоса ботов запускает ведущий во время голосования.');
  const bots = room.players.filter(x => x.bot && !Object.hasOwn(room.votes, x.id));
  check(bots.length > 0, 'Все боты уже проголосовали.');
  const candidates = voteCandidates(room);
  for (const bot of bots) {
   const aiChoice=room.aiVotePlans?.[bot.id];
   const preferred=aiChoice&&candidates.includes(aiChoice)&&aiChoice!==bot.id
    ?aiChoice:chooseBotVote(room,bot,candidates);
   const consistent=room.aiMode?chooseConsistentBotTarget(room,bot,candidates,preferred,
    pool=>chooseBotVote(room,bot,pool)):preferred;
   act(room,bot,'vote',consistent);
  }
 } else if (action === 'start') {
  check(room.host === p.id && room.phase === 'lobby', 'Только ведущий может начать игру.');
  check(room.players.length >= 5 && room.players.length <= 16, 'Для игры нужно от 5 до 16 участников.');
  const prepared=prepareStart(room.players,recordedHistory(room));
  commitStart(room,room.players,prepared);
 } else if (action === 'use_special') {
  applySpecial(room, p, value);
 } else if (action === 'reveal') {
  check(room.phase === 'turn' && room.turn === p.id && p.alive, 'Сейчас ход другого игрока.');
  check(!room.opened && Object.hasOwn(categories,value) && p.cards[value] && !p.revealed.includes(value), 'Эту карточку сейчас нельзя открыть.');
  check(room.round !== 1 || value === 'profession', 'В первом круге откройте профессию.');
  p.revealed.push(value); room.opened = true;
  if(!p.bot)delete room.botReveals;
  room.lastReveal={playerId:p.id,category:value,round:room.round};
  room.log.push(`${p.name} открывает: ${categories[value]}.`);
 } else if (action === 'next') {
  check(room.phase === 'turn' && room.turn === p.id, 'Передать слово может только текущий игрок.');
  check(room.opened || !Object.keys(p.cards).some(k => p.cards[k] && !p.revealed.includes(k)), 'Сначала откройте карточку.');
  nextTurn(room);
  revealCurrentBot(room);
 } else if (action === 'vote') {
  check(room.phase === 'vote', 'Голосование ещё не началось.');
  const eligible=voteCandidates(room);
  check(!Object.hasOwn(room.votes,p.id), 'Ваш голос уже принят.');
  check(eligible.includes(value) && p.id!==value, room.revoteCandidates ? 'В переголосовании доступны только участники с равным числом голосов. За себя голосовать нельзя.' : 'Нельзя голосовать за себя. Выберите другого игрока в бункере.');
  room.votes[p.id] = value;
  recordBotBallot(room,p,value);
  if (room.testMode && room.players.filter(x => !x.bot).every(x => Object.hasOwn(room.votes,x.id))) {
   const candidates = voteCandidates(room);
   for (const bot of room.players.filter(x => x.bot && !Object.hasOwn(room.votes,x.id))) {
    const aiChoice=room.aiVotePlans?.[bot.id];
    const preferred=aiChoice&&candidates.includes(aiChoice)&&aiChoice!==bot.id
     ?aiChoice:chooseBotVote(room,bot,candidates);
    room.votes[bot.id]=room.aiMode?chooseConsistentBotTarget(room,bot,candidates,preferred,
     pool=>chooseBotVote(room,bot,pool)):preferred;
    recordBotBallot(room,bot,room.votes[bot.id]);
   }
  }
  if (Object.keys(room.votes).length === room.players.length) finishVote(room);
 } else throw new Error('Неизвестное действие.');
 room.updated = Date.now();
}
function newRound(room, now=Date.now()) {
 room.round++;room.phase='turn';room.turn=room.players.find(x=>x.alive).id;room.opened=false;room.votes={};
 delete room.aiVotePlans;
 room.turnDeadline=now+TURN_TIMEOUT_MS;delete room.voteDeadline;
}
function nextTurn(room,now=Date.now()){
 const alive=room.players.filter(x=>x.alive),pos=alive.findIndex(x=>x.id===room.turn);
 if(pos<0)throw new Error('Текущий игрок не найден в списке выживших.');
 if(pos<alive.length-1){room.turn=alive[pos+1].id;room.opened=false;room.turnDeadline=now+TURN_TIMEOUT_MS;}
 else if(room.round>=room.firstVote){room.phase='vote';room.votes={};delete room.turnDeadline;room.voteDeadline=now+VOTE_TIMEOUT_MS;room.log.push(`Круг ${room.round}: начинается голосование.`);}
 else newRound(room,now);
}
// When a bot receives the word, open only its own next card and stay on
// that bot's turn. The host decides when to press "Передать слово боту" again.
function revealCurrentBot(room){
 if(!room.testMode||room.phase!=='turn')return;
 const bot=room.players.find(p=>p.id===room.turn);
 if(!bot?.bot||!bot.alive||room.opened)return;
 const available=Object.keys(bot.cards).filter(k=>bot.cards[k]&&!bot.revealed.includes(k));
 const key=chooseBotReveal(room,bot,available);
 if(key){
  bot.revealed.push(key);room.opened=true;
  room.lastReveal={playerId:bot.id,category:key,round:room.round};
  room.log.push(`${bot.name} открывает: ${categories[key]}.`);
 }
 if(!bot.specialUsed)botSpecialMove(room,bot);
 // Remove stale batch results left by previously saved test sessions.
 delete room.botReveals;
}
function voteCandidates(room){
 const eligible=room.players.filter(p=>p.alive).map(p=>p.id);
 return room.revoteCandidates ? eligible.filter(id=>room.revoteCandidates.includes(id)) : eligible;
}
function beginRevote(room,now=Date.now()){
 check(room.phase==='tie_discussion' && Array.isArray(room.revoteCandidates) && room.revoteCandidates.length>=2,'Нет кандидатов для переголосования.');
 room.phase='vote';room.votes={};room.voteDeadline=now+VOTE_TIMEOUT_MS;
 delete room.discussionDeadline;
 room.log.push('Переголосование: можно голосовать только за '+room.players.filter(p=>room.revoteCandidates.includes(p.id)).map(p=>p.name).join(', ')+'.');
}
function finishVote(room,now=Date.now()){
 const scores={};for(const target of Object.values(room.votes))scores[target]=(scores[target]||0)+1;
 const max=Math.max(0,...Object.values(scores));
 const candidates=max===0?voteCandidates(room):Object.keys(scores).filter(k=>scores[k]===max);
 const abstained=room.players.length-Object.keys(room.votes).length;
 // Nobody voted in the ordinary ballot: retain the existing timeout draw.
 // Su-e-fa is reserved for a repeated tie after an actual first ballot.
 if(max===0&&!room.revoteCandidates){
  eliminate(room,pick(candidates),0,false,scores,abstained,now);
  return;
 }
 // First tie is resolved by discussion followed by a fresh, restricted ballot.
 if(candidates.length>1&&!room.revoteCandidates&&max>0){
  room.phase='tie_discussion';room.revoteCandidates=candidates;room.votes={};
  delete room.voteDeadline;room.discussionDeadline=now+TIE_DISCUSSION_MS;
  room.lastVote={scores,tie:true,abstained,discussion:true,candidates};
  room.log.push('Ничья: '+room.players.filter(p=>candidates.includes(p.id)).map(p=>p.name).join(', ')+'. Обсудите выбор и переголосуйте только между ними.');
  return;
 }
 // A second tied ballot starts a private rock-paper-scissors showdown, not a random expulsion.
 if(candidates.length>1){
  room.lastVote={scores,tie:true,revote:Boolean(room.revoteCandidates),abstained,candidates};
  delete room.rpsReveal;
  room.rps={candidates,choices:{},round:1,deadline:now+RPS_TIMEOUT_MS,ballotScores:scores};
  room.phase='rps';delete room.voteDeadline;delete room.discussionDeadline;delete room.revoteCandidates;
  room.log.push('Повторная ничья! Кандидаты играют в су-е-фа до определения проигравшего.');
  resolveRps(room);
  return;
 }
 eliminate(room,candidates[0],max,Boolean(room.revoteCandidates),scores,abstained,now);
}

// The eliminated player is the loser of the duel. Non-candidates are never
// allowed to submit gestures; nobody sees an opponent's pending choice.
function eliminate(room,loserId,votes,revote,scores,abstained,now=Date.now(),viaRps=false){
 const loser=room.players.find(x=>x.id===loserId);
 check(loser?.alive,'Нельзя исключить отсутствующего игрока.');
 loser.alive=false;
 room.lastVote={scores,eliminated:loserId,tie:viaRps,revote,abstained};
 room.eliminationSequence=(room.eliminationSequence||0)+1;
 room.eliminationNotice={id:`${room.gameNumber||1}:${room.eliminationSequence}`,
  playerId:loserId,name:loser.name,votes,round:room.round,viaRps};
 room.log.push(`${loser.name} покидает бункер (${votes} голосов)${viaRps?' после су-е-фа':''}.`);
 delete room.rps;delete room.revoteCandidates;delete room.discussionDeadline;
 delete room.voteDeadline;
 if(room.players.filter(x=>x.alive).length<=room.capacity){
  room.phase='finished';room.turn=null;delete room.turnDeadline;
  room.log.push('Состав убежища определён.');
 }else{newRound(room,now);revealCurrentBot(room);}
}
function botRpsChoices(room){
 const rps=room.rps;
 for(const [i,id] of rps.candidates.entries()){
  const p=room.players.find(p=>p.id===id);
  if(p?.bot&&!Object.hasOwn(rps.choices,id)){
   // After several all-bot draws force progress, without affecting humans.
   const allBots=rps.candidates.every(id=>room.players.find(p=>p.id===id)?.bot);
   rps.choices[id]=allBots&&rps.round>=6?(i===0?'rock':'scissors'):RPS_MOVES[randomInt(3)];
  }
 }
}
function resolveRps(room,now=Date.now()){
 if(room.phase!=='rps')return;
 for(let attempts=0;attempts<20;attempts++){
  botRpsChoices(room);
  const rps=room.rps;
  if(rps.candidates.some(id=>!Object.hasOwn(rps.choices,id)))return;
  const selected=new Set(Object.values(rps.choices));
  const moves=Object.fromEntries(rps.candidates.map(id=>[id,rps.choices[id]]));
  const candidatesAtReveal=[...rps.candidates];
  const announce=(loserIds,draw)=>{
   room.rpsRevealSequence=(room.rpsRevealSequence||0)+1;
   room.rpsReveal={id:`${room.gameNumber||1}:${room.rpsRevealSequence}`,
    round:rps.round,moves,candidates:candidatesAtReveal,
    draw,losers:[...loserIds]};
  };
  if(selected.size===2){
   const winning=[...selected].find(move=>beats[move]&&selected.has(beats[move]));
   const losing=rps.candidates.filter(id=>moves[id]!==winning);
   if(losing.length===1){
    announce(losing,false);
    const score=rps.ballotScores[losing[0]]??0;
    eliminate(room,losing[0],score,true,rps.ballotScores,0,now,true);
    return;
   }
   // Multiple losing gestures: winners survive, losing group plays again.
   announce(losing,false);
   rps.candidates=losing;
  }
  // Three gestures or all identical: nobody wins, retry with same candidates.
  if(selected.size!==2)announce([],true);
  rps.lastResult={moves,draw:selected.size!==2,round:rps.round};
  rps.choices={};rps.round++;
  rps.deadline=now+RPS_TIMEOUT_MS;
 }
}

// Mutates only when a deadline expires or an inactive host needs replacement.
// Called by the server's periodic scheduler and before processing incoming actions.
export function advanceRoom(room,now=Date.now()){
 let changed=false;
 if(room.phase==='turn'){
  if(!room.turnDeadline){room.turnDeadline=now+TURN_TIMEOUT_MS;changed=true;}
  else if(now>=room.turnDeadline){
   const p=room.players.find(x=>x.id===room.turn);
   if(p&&!room.opened){
    const available=Object.keys(p.cards).filter(k=>p.cards[k]&&!p.revealed.includes(k));
    const key=room.round===1&&available.includes('profession')?'profession':available[0];
    if(key){p.revealed.push(key);room.opened=true;room.lastReveal={playerId:p.id,category:key,round:room.round};room.log.push(`Время вышло: ${p.name} автоматически открывает ${categories[key]}.`);}
   }
   room.log.push(`Время хода ${p?.name||'участника'} истекло. Слово передано автоматически.`);
   nextTurn(room,now);revealCurrentBot(room);changed=true;
  }
 }else if(room.phase==='tie_discussion'){
  if(!room.discussionDeadline){room.discussionDeadline=now+TIE_DISCUSSION_MS;changed=true;}
  else if(now>=room.discussionDeadline){beginRevote(room,now);changed=true;}
 }else if(room.phase==='rps'){
  if(now>=room.rps.deadline){
   for(const id of room.rps.candidates)if(!Object.hasOwn(room.rps.choices,id))room.rps.choices[id]=RPS_MOVES[randomInt(3)];
   resolveRps(room,now);changed=true;
  }
 }else if(room.phase==='vote'){
  if(!room.voteDeadline){room.voteDeadline=now+VOTE_TIMEOUT_MS;changed=true;}
  else if(now>=room.voteDeadline){
   room.log.push('Время голосования вышло. Отсутствующие голоса считаются воздержанием.');
   finishVote(room,now);changed=true;
  }
 }
 const current=room.players.find(x=>x.id===room.host);
 if(current&&!current.bot&&now-(current.lastSeen??room.updated??now)>=HOST_INACTIVE_MS){
  const replacement=room.players.filter(x=>human(x)&&x.id!==current.id&&(now-(x.lastSeen??0))<HOST_INACTIVE_MS).sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0))[0];
  if(replacement){room.host=replacement.id;room.log.push(`Ведущий ${current.name} неактивен. Роль передана ${replacement.name}.`);changed=true;}
 }
 if(changed)room.updated=now;
 return changed;
}
export function view(room, me) {
 const { players, votes, rps, aiVotePlans, aiBotVoteHistory, aiBotEndorsements, aiBotVoteReasons, aiChatLocks, lastActivityAt, privateSpecialHistory, dealHistory, ...rest } = room;
 const ownSpecialChanges=(privateSpecialHistory||[]).flatMap(event=>event.results.filter(r=>r.playerId===me.id).map(r=>({eventId:event.id,before:r.before,after:r.after})));
 return { ...rest, rps:rps?{candidates:rps.candidates,round:rps.round,deadline:rps.deadline,submitted:rps.candidates.filter(id=>Object.hasOwn(rps.choices,id)),myChoice:rps.choices[me.id]||null,lastResult:rps.lastResult||null}:null, specialPrivateResults:ownSpecialChanges, categories, me: me.id, recoveryCode: me.recoveryCode, specialAvailable: Boolean(specialCard(me.cards.special)) && !me.specialUsed, hasVoted: Object.hasOwn(votes,me.id), votedFor: votes[me.id] || null, voteCount: Object.keys(votes).length,
  pendingBotVotes: players.filter(p => p.bot && !Object.hasOwn(votes,p.id)).length,
  players: players.map(({token, recoveryCode, lastSeen, cards, ...p}) => {
   const visible = p.id===me.id || room.phase==='finished' ? cards : Object.fromEntries(p.revealed.map(k=>[k,cards[k]]));
   return {...p, connected: p.bot ? null : Date.now() - (lastSeen ?? 0) < 35000, cards: visible, descriptions: Object.fromEntries(Object.entries(visible).map(([k,name])=>[k,cardDescription(k,name)]).filter(([,description])=>description))};
  }) };
}
