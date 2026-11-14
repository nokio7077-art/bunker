import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';

const isPrivateIp = ip => /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

export function getLocalIpv4() {
 const interfaces=networkInterfaces();
 const candidates=Object.entries(interfaces).flatMap(([name,addresses])=>(addresses||[])
  .filter(a=>a.family==='IPv4'&&!a.internal&&isPrivateIp(a.address))
  .map(a=>({name,address:a.address})));
 candidates.sort((a,b)=>{
  const weight=n=>/^(swlan|ap|wlan|wifi|eth|en)/i.test(n)?0:10;
  return weight(a.name)-weight(b.name);
 });
 return candidates[0]?.address||null;
}

// Optional, best-effort multicast DNS. Android hotspot clients may filter mDNS.
export function startLocalMdns(address=getLocalIpv4(), logger=console) {
 if(!address) return null;
 const socket=dgram.createSocket({type:'udp4',reuseAddr:true});
 socket.on('error',e=>logger.warn?.('Bunker mDNS unavailable:',e.message));
 socket.on('message',(message,peer)=>{
  if(message.length<17||message.readUInt16BE(2)&0x8000)return;
  const count=message.readUInt16BE(4);
  let p=12,found=false,unicast=false;
  for(let q=0;q<count&&p<message.length;q++){
   const labels=[];
   while(p<message.length){
    const len=message[p++];
    if(len===0)break;
    if((len&0xc0)!==0||p+len>message.length)return;
    labels.push(message.toString('ascii',p,p+len).toLowerCase());p+=len;
   }
   if(p+4>message.length)return;
   const type=message.readUInt16BE(p),cls=message.readUInt16BE(p+2);p+=4;
   if(labels.join('.')==='bunker.local'&&(type===1||type===255)&&(cls&0x7fff)===1){found=true;unicast=(cls&0x8000)!==0;}
  }
  if(!found)return;
  const qname=Buffer.from([6,98,117,110,107,101,114,5,108,111,99,97,108,0]);
  const ans=Buffer.alloc(14);
  ans.writeUInt16BE(1,0);ans.writeUInt16BE(0x8001,2);
  ans.writeUInt32BE(120,4);ans.writeUInt16BE(4,8);
  address.split('.').forEach((n,i)=>{ans[10+i]=Number(n)});
  const header=Buffer.alloc(12);header.writeUInt16BE(0x8400,2);header.writeUInt16BE(1,6);
  const packet=Buffer.concat([header,qname,ans]);
  socket.send(packet,unicast?peer.port:5353,unicast?peer.address:'224.0.0.251',()=>{});
 });
 socket.bind(5353,'0.0.0.0',()=>{
  try{socket.addMembership('224.0.0.251',address);socket.setMulticastTTL(255);
   logger.log?.('Bunker mDNS experimental: bunker.local -> '+address);
  }catch(e){logger.warn?.('Bunker mDNS membership unavailable:',e.message);socket.close();}
 });
 return socket;
}
