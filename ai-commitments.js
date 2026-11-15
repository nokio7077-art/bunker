// Public-information commitments must survive chat turns and be respected at
// voting time. No model is allowed to write the vote itself.
export function publicEvidenceFingerprint(room,player){
 const open=Object.fromEntries((player.revealed||[]).filter(k=>k!=='special')
  .map(k=>[k,player.cards?.[k]??null]));
 return JSON.stringify({open,disaster:room.disaster?.id,bunker:room.bunker?.id});
}
export function rememberBotEndorsements(room,bot,result){
 if(!room.aiMode||!bot?.bot||!result?.reply)return;
 const answer=String(result.reply).toLowerCase();
 const explicit=new Set(result.supportForIds||[]);
 for(const p of room.players||[]){
  if(p.id===bot.id||!p.alive)continue;
  const name=p.name.toLowerCase();
  const target=name.replace(/[^а-яёa-z0-9 ]/gi,'');
  // Only strong, directly expressed support counts as a commitment.
  const phrase=new RegExp('(?:оставить|сохранить|поддерживаю|защищаю)\\s+(?:в\\s+бункере\\s+)?'+target+
    '|'+target+'.{0,45}(?:стоит\\s+оставить|нужн[аоы]?\\s+нам|необходим[аоы]?\\s+нам)','i');
  const directPraise=new RegExp(target+'.{0,40}(?:полезн|важн|ценн|незаменим)','i');
  const praiseMatch=answer.match(directPraise);
  if(phrase.test(answer)||praiseMatch&&!/(?:^|\\s)не\\s/i.test(praiseMatch[0]))explicit.add(p.id);
 }
 room.aiBotEndorsements??={};
 const endorsements=room.aiBotEndorsements[bot.id]??={};
 for(const id of explicit){
  const candidate=room.players.find(p=>p.id===id&&p.alive&&p.id!==bot.id);
  if(!candidate)continue;
  endorsements[id]={round:room.round,evidence:publicEvidenceFingerprint(room,candidate)};
 }
 room.aiBotEndorsements[bot.id]=endorsements;
}
export function chooseConsistentBotTarget(room,bot,candidates,preferred,chooseAlternative){
 const options=candidates.filter(id=>id!==bot.id);
 if(!options.length)return null;
 const commitments=room.aiBotEndorsements?.[bot.id]||{};
 const unprotected=options.filter(id=>{
  const player=room.players.find(p=>p.id===id);
  const memory=commitments[id];
  return !memory||memory.evidence!==publicEvidenceFingerprint(room,player);
 });
 if(unprotected.includes(preferred))return preferred;
 if(!unprotected.length)return options.includes(preferred)?preferred:options[0];
 const alternative=chooseAlternative(unprotected);
 return unprotected.includes(alternative)?alternative:unprotected[0];
}
export function rememberBotVoteReason(room,bot,result){
 if(!room.aiMode||!bot?.bot||!result?.voteForId||!result.voteReason)return;
 if(!room.players.some(p=>p.id===result.voteForId&&p.alive&&p.id!==bot.id))return;
 room.aiBotVoteReasons??={};
 room.aiBotVoteReasons[bot.id]={targetId:result.voteForId,round:room.round,
  reason:result.voteReason.slice(0,180)};
}
