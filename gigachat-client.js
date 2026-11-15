import {randomUUID} from 'node:crypto';

// GigaChat personal Freemium: one concurrent generation; all credentials
// remain strictly server-side. Never disable TLS certificate verification.
export function createGigaChat({env=process.env,fetchImpl=fetch,now=Date.now,logger=console}={}){
 const key=(env.GIGACHAT_AUTH_KEY||'').trim().replace(/^Basic\s+/i,'');
 const model=env.GIGACHAT_MODEL||'GigaChat-2-Pro';
 const enabled=Boolean(key);
 let accessToken=null,expiry=0,refreshing=null;
 let sequence=Promise.resolve();
 async function request(url,options,timeoutMs=10000){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{return await fetchImpl(url,{...options,signal:ctrl.signal,redirect:'error'});}
  finally{clearTimeout(timer);}
 }
 async function token(){
  if(accessToken&&now()<expiry-60000)return accessToken;
  if(refreshing)return refreshing;
  refreshing=(async()=>{
   const response=await request('https://ngw.devices.sberbank.ru:9443/api/v2/oauth',{
    method:'POST',headers:{Authorization:'Basic '+key,RqUID:randomUUID(),
     Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
    body:'scope=GIGACHAT_API_PERS'
   });
   if(!response.ok)throw Error('GigaChat OAuth '+response.status);
   const result=await response.json();
   if(typeof result.access_token!=='string')throw Error('GigaChat OAuth did not return a token');
   accessToken=result.access_token;
   const raw=Number(result.expires_at);
   expiry=Number.isFinite(raw)&&raw>0?(raw<1e11?raw*1000:raw):now()+29*60000;
   return accessToken;
  })().finally(()=>{refreshing=null;});
  return refreshing;
 }
 async function generate(messages){
  if(!enabled)throw Error('GigaChat is not configured');
  const task=async()=>{
   for(let attempt=0;attempt<2;attempt++){
    const bearer=await token();
    const response=await request('https://api.giga.chat/v1/chat/completions',{
     method:'POST',headers:{Authorization:'Bearer '+bearer,Accept:'application/json','Content-Type':'application/json'},
     body:JSON.stringify({model,messages,temperature:0.65,max_tokens:230,stream:false})
    },14000);
    if(response.status===401&&attempt===0){accessToken=null;expiry=0;continue;}
    if(!response.ok)throw Error('GigaChat generation '+response.status);
    const json=await response.json();
    const result=json.choices?.[0]?.message?.content;
    if(typeof result!=='string'||!result.trim())throw Error('GigaChat returned empty reply');
    return result.slice(0,2000);
   }
   throw Error('GigaChat authorization expired');
  };
  const pending=sequence.then(task);
  sequence=pending.catch(()=>{});
  return pending;
 }
 return {enabled,generate,model};
}
