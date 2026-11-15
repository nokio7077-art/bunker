import {statSync,existsSync} from 'node:fs';
import {join} from 'node:path';

// Optional cloud checkpoint for ONE Node.js server instance. This stores the
// whole active-room snapshot in a single private Supabase/PostgREST row.
// Client-side code never receives the key or the database URL.
export function createCloudRoomBackup({env=process.env,fetchImpl=fetch,now=()=>Date.now(),logger=console}={}){
 const url=env.SUPABASE_URL?.replace(/\/+$/,'');
 const key=env.SUPABASE_SECRET_KEY;
 const enabled=Boolean(url&&key);
 if(Boolean(url)!==Boolean(key))logger.warn('Supabase backup disabled: supply BOTH SUPABASE_URL and SUPABASE_SECRET_KEY.');
 if(enabled&&!/^https:\/\/[^/]+$/.test(url)&&!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(url))
  throw new Error('SUPABASE_URL must be a secure HTTPS project origin.');
 const endpoint=enabled?url+'/rest/v1/bunker_room_snapshots':null;
 let queue=Promise.resolve(),retryAfter=0;
 const headers=()=>({'apikey':key,'Content-Type':'application/json','Accept':'application/json'});
 async function request(path,options={}){
  const response=await fetchImpl(endpoint+path,{
   ...options,headers:{...headers(),...options.headers},
   signal:AbortSignal.timeout(4000)
  });
  if(!response.ok)throw new Error('Supabase checkpoint HTTP '+response.status);
  return response;
 }
 async function restore(localRooms,localDataDir){
  if(!enabled)return localRooms;
  try{
   const result=await (await request('?id=eq.active&select=snapshot,saved_at')).json();
   if(!Array.isArray(result)||result.length===0)return localRooms;
   const row=result[0];
   if(!Array.isArray(row.snapshot)||!Number.isFinite(Number(row.saved_at)))
    throw new Error('Invalid cloud snapshot');
   // Prefer a local snapshot with more recent writes made during cloud outages.
   const file=join(localDataDir,'rooms.json');
   const localMtime=existsSync(file)?statSync(file).mtimeMs:0;
   if(localRooms.size&&localMtime>Number(row.saved_at)+1000)return localRooms;
   const recovered=new Map(row.snapshot);
   // Only accept proper game room records; never overwrite a valid local file
   // with a corrupted/incorrect cloud snapshot.
   for(const [code,room] of recovered){
    if(!/^[0-9]{6}$/.test(code)||room?.code!==code||!Array.isArray(room.players)||
       !['lobby','turn','vote','tie_discussion','finished'].includes(room.phase))
     throw new Error('Invalid cloud room data');
   }
   logger.info('Recovered '+recovered.size+' rooms from Supabase checkpoint.');
   return recovered;
  }catch(error){
   logger.warn('Supabase checkpoint unavailable at startup; using local data:',error.message);
   return localRooms;
  }
 }
 async function persist(rooms){
  if(!enabled||now()<retryAfter)return false;
  // Snapshot at call time, so later mutations cannot reorder saved game turns.
  const snapshot=structuredClone(rooms);
  const saved_at=now();
  const task=queue.then(async()=>{
   if(now()<retryAfter)return false;
   try{
    await request('?on_conflict=id',{
     method:'POST',
     headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
     body:JSON.stringify({id:'active',snapshot,saved_at})
    });
    return true;
   }catch(error){
    retryAfter=now()+15000;
    logger.warn('Supabase checkpoint failed; local room persistence remains active:',error.message);
    return false;
   }
  });
  queue=task.then(()=>{},()=>{});
  return task;
 }
 return {enabled,restore,persist};
}
