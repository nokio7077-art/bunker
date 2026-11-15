import {readFileSync,writeFileSync,renameSync,existsSync,copyFileSync,openSync,closeSync,fsyncSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';

// Synchronous, atomic on the same filesystem. A backup is updated BEFORE
// replacing the primary, so an interrupted write retains a valid checkpoint.
// The directory must be persistent for this to survive replacement of a host.
function validate(data){
 if(!Array.isArray(data))throw new Error('Некорректный формат сохранённых комнат.');
 const seen=new Set();
 for(const entry of data){
  if(!Array.isArray(entry)||entry.length!==2)throw new Error('Некорректная запись комнаты.');
  const [code,room]=entry;
  if(typeof code!=='string'||!/^[0-9]{6}$/.test(code)||seen.has(code)||
    !room||typeof room!=='object'||room.code!==code||
    !Array.isArray(room.players)||!room.players.length||
    !['lobby','turn','vote','tie_discussion','rps','finished'].includes(room.phase))
   throw new Error('Повреждено сохранение комнаты.');
  seen.add(code);
 }
 return data;
}
function readSnapshot(path){
 const data=JSON.parse(readFileSync(path,'utf8'));
 // Backwards compatibility with existing rooms.json, which is a raw array.
 return validate(Array.isArray(data)?data:data?.version===1?data.rooms:null);
}
function syncFile(path){
 const fd=openSync(path,'r');
 try{fsyncSync(fd);}finally{closeSync(fd);}
}
function atomicCopy(source,destination){
 copyFileSync(source,destination+'.tmp');
 syncFile(destination+'.tmp');
 renameSync(destination+'.tmp',destination);
}
export function createRoomStore(dataDir){
 mkdirSync(dataDir,{recursive:true,mode:0o700});
 const primary=join(dataDir,'rooms.json'),backup=primary+'.bak',temporary=primary+'.tmp';
 function load(){
  if(!existsSync(primary)&&!existsSync(backup))return new Map();
  try{
   if(!existsSync(primary))throw new Error('Основной файл отсутствует');
   return new Map(readSnapshot(primary));
  }catch(error){
   if(!existsSync(backup))throw new Error('Не удалось прочитать комнаты; безопасной копии нет.',{cause:error});
   try{
    const recovered=readSnapshot(backup);
    // Restore the validated backup before any next save. Otherwise a normal
    // save could accidentally replace the good backup with a corrupt primary.
    atomicCopy(backup,primary);
    console.warn('Bunker rooms restored from last valid local checkpoint.');
    return new Map(recovered);
   }catch(backupError){
    throw new Error('Повреждены основной файл комнат и резервная копия. Запуск остановлен.',{cause:backupError});
   }
  }
 }
 function save(rooms){
  // Validate before touching disk. Never silently persist partial states.
  const serialized=JSON.stringify([...rooms]);
  validate(JSON.parse(serialized));
  if(existsSync(primary)){
   // Preserve an older, known-good snapshot. The current primary might be
   // corrupt only if tampered with outside this process.
   readSnapshot(primary);
   atomicCopy(primary,backup);
  }
  writeFileSync(temporary,serialized,{mode:0o600});
  syncFile(temporary);
  renameSync(temporary,primary);
  // Best effort durability of the rename on systems supporting fsync(dir).
  try{syncFile(dataDir);}catch{}
 }
 return {load,save};
}
