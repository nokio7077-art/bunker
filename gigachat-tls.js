import https from 'node:https';
import tls from 'node:tls';
import {X509Certificate} from 'node:crypto';

// Official Russian National Certification Authority root, as specified
// by Sber's GigaChat certificate documentation. Never turn off TLS checks.
export const GIGACHAT_CA_URL='https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt';
let officialCertPromise=null;

export function verifyRootPem(pem,now=Date.now()){
 const text=String(pem).trim();
 if(!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(text)
  ||text.length>16000)throw Error('Некорректный корневой сертификат GigaChat.');
 const cert=new X509Certificate(text);
 if(!cert.ca||cert.subject!==cert.issuer||!cert.verify(cert.publicKey)||
    !/Russian Trusted Root CA|Минцифр|Russian Trusted CA/i.test(cert.subject))
  throw Error('Загружен не корневой сертификат НУЦ Минцифры.');
 if(now<Date.parse(cert.validFrom)||now>Date.parse(cert.validTo))
  throw Error('Срок действия корневого сертификата GigaChat истёк.');
 return text+'\n';
}
export async function loadGigaChatCA({sourceFetch=fetch,env=process.env}={}){
 if(env.GIGACHAT_CA_PEM)return verifyRootPem(env.GIGACHAT_CA_PEM);
 if(!officialCertPromise){
  officialCertPromise=(async()=>{
   const ctrl=new AbortController();
   const timer=setTimeout(()=>ctrl.abort(),8000);
   try{
    const response=await sourceFetch(GIGACHAT_CA_URL,{signal:ctrl.signal,redirect:'error'});
    if(!response.ok)throw Error('Не удалось скачать сертификат Минцифры: HTTP '+response.status);
    return verifyRootPem(await response.text());
   }finally{clearTimeout(timer);}
  })().catch(error=>{officialCertPromise=null;throw error;});
 }
 return officialCertPromise;
}

// This transport is used ONLY for GigaChat endpoints. The normal system
// CA bundle stays trusted alongside the official GigaChat root.
export async function verifiedGigaChatRequest(url,options,{loadCA=loadGigaChatCA,requestImpl=https.request}={}){
 const target=new URL(url);
 if(target.protocol!=='https:'||!['ngw.devices.sberbank.ru','api.giga.chat'].includes(target.hostname))
  throw Error('Запрещённый адрес API GigaChat.');
 let ca;
 try{ca=await loadCA();}
 catch(error){throw Error('Не удалось загрузить доверенный сертификат Минцифры: '+error.message);}
 return await new Promise((resolve,reject)=>{
  const req=requestImpl(target,{
   method:options.method,headers:options.headers,signal:options.signal,
   ca:[...tls.rootCertificates,ca],rejectUnauthorized:true,
   checkServerIdentity:tls.checkServerIdentity
  },response=>{
   const chunks=[];let size=0;
   response.on('data',chunk=>{
    size+=chunk.length;
    if(size>1024*1024){req.destroy(Error('Ответ GigaChat слишком большой.'));return;}
    chunks.push(chunk);
   });
   response.on('error',reject);
   response.on('end',()=>{
    const content=Buffer.concat(chunks).toString('utf8');
    resolve({ok:response.statusCode>=200&&response.statusCode<300,
     status:response.statusCode,json:async()=>JSON.parse(content)});
   });
  });
  req.on('error',reject);
  req.end(options.body);
 });
}
