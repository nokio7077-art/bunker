// Character portraits: 588 transparent illustrations; deterministic per character, sex, and visual-age band.
const skins=[["#F0C68C","#BD885A"],["#DDAD78","#AB744E"],["#C38A62","#88583F"],["#A56D50","#6D4836"],["#EDD1A1","#B99B73"]];
const hairs=["#2B2119","#513324","#79512A","#AA8E52","#3A3830","#6C3A22","#201F1C","#6C5941","#34291E","#8B7051"];
const coats=[["#46603B","#243825"],["#5A653E","#303A27"],["#76613E","#443627"],["#345447","#1A3429"],["#586849","#2D3D2C"]];
const box=(x,y,w,h,c)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+c+'"/>';
const path=(d,c)=>'<path d="'+d+'" fill="'+c+'"/>';
function hash(value){let h=2166136261;for(const c of String(value)){h=Math.imul(h^c.codePointAt(0),16777619);}return h>>>0;}
// Approximate visual age groups curated from the supplied illustrations (not factual age labels).
const youngPortraits={male:[0,1,2,3,5,6,8,9,10,12,14,15,17,18,20,21,23,25,27,28,29,31,33,34,37,38,41,43,45,46,47,49,51,53,54,57,60,62,63,65,67,68,70,71,74,75,78,80,81,82,84,85,87,89,90,92,93,95,96,98,100,103,105,107,110,112,113,114,117,119,120,123,124,126,128,131,132,135,137,139,140,143,146,147,148,151,152,155,157,158,159,160,162,166,167,169,171,172,174,176,178,179,180,182,183,186,188,190,192,194,195,197,198,200,201,203,205,206,208,210,212,214,216,219,220,222,223,227,229,231,234,236,239,242,244,246,249,250,252,253,254,256,258,259,261,262,266,267,268,270,271,272,275,277,278,280,281,282,284,285,289],female:[0,1,2,3,4,5,6,7,8,11,12,13,15,16,17,18,19,20,21,22,24,25,26,28,29,30,31,32,34,35,36,37,38,39,40,41,42,43,44,46,47,48,49,50,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,70,71,72,73,74,75,76,77,78,79,81,82,83,85,86,87,88,90,91,92,93,94,95,96,97,99,100,101,102,103,104,106,107,108,109,110,111,112,113,114,115,116,117,118,120,121,122,123,124,125,126,127,129,130,131,132,133,135,136,137,138,140,141,142,143,144,145,146,147,148,149,150,151,152,153,155,156,157,159,160,161,162,163,164,165,166,167,170,171,172,173,174,175,176,177,178,179,180,181,182,183,185,186,187,188,189,191,192,193,194,195,196,197,198,199,200,201,202,203,205,206,207,208,209,210,211,212,213,214,215,217,218,220,221,222,223,224,225,226,228,229,231,232,233,234,235,237,238,239,240,241,242,244,245,246,247,248,249,250,251,252,253,254,255,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271,272,273,275,276,277,278,279,281,282,283,284,285,286,288,289,290,291,292,293,294,295,296,297]};
const seniorPortraits={male:[7,13,19,30,42,55,58,64,76,86,91,99,102,104,109,111,118,122,129,133,141,149,153,165,168,177,184,189,193,199,202,207,213,218,224,230,238,240,245,248,255,260,276,287,288],female:[10,27,33,45,51,69,84,105,119,139,168,169,190,204,216,219,236,256,287]};
const portraitCount={male:290,female:298};
const adultPortraits=Object.fromEntries(Object.keys(portraitCount).map(gender=>{
 const excluded=new Set([...youngPortraits[gender],...seniorPortraits[gender]]);
 return [gender,Array.from({length:portraitCount[gender]},(_,i)=>i).filter(i=>!excluded.has(i))];
}));
export function avatarIdentity(biology,id,game=1){
 const value=String(biology??'');
 const gender=value.startsWith('Женщина')?'female':'male';
 const age=Number(value.match(/\b(\d{1,3})\s*(?:лет|года|год)\b/u)?.[1]);
 const pool=age>=60?seniorPortraits[gender]:age>=30?adultPortraits[gender]:age>=15?youngPortraits[gender]:adultPortraits[gender];
 return {gender,index:pool[hash(String(id)+':'+game)%pool.length]};
}

export function avatarSvg(gender,index){
 const female=gender==="female",n=((Math.trunc(index)%250)+250)%250;
 const tone=Math.floor(n/50),outfit=Math.floor(n/10)%5,hairStyle=n%10;
 const [skin,shade]=skins[tone],hair=hairs[(hairStyle+3*tone)%hairs.length],[coat,coatShadow]=coats[outfit];
 let p=[box(0,0,64,64,"#081D11"),box(3,12,58,2,"#14371C"),box(5,26,54,2,"#112A16")];
 if(female){p.push(box(15,15,35,38,hair),box(13,23,9,30,hair));if(hairStyle%2)p.push(box(47,25,9,25,hair));}
 else {p.push(box(16,13,34,23,hair),box(14,22,8,16,hair));}
 p.push(path("M5 64V55L16 47H47L59 55V64Z",coatShadow));
 p.push(path("M9 64V56L19 49H45L55 56V64Z",coat));
 if(outfit===0)p.push(path("M19 49L29 57L38 49L45 52L34 62H26L15 53Z","#778C57"));
 if(outfit===1)p.push(box(27,49,12,3,"#9AA97D"),box(31,52,4,12,"#647A5A"));
 if(outfit===2)p.push(box(15,54,4,10,"#BDAD78"),box(47,54,4,10,"#BDAD78"));
 if(outfit===3)p.push(path("M22 50L29 57L25 63L13 53ZM40 50L34 57L38 63L51 53Z","#82937A"));
 if(outfit===4)p.push(box(19,52,27,4,"#9F996F"));
 p.push(box(28,41,12,12,shade),box(19,21,29,23,skin),box(17,28,4,9,skin));
 p.push(box(20,36,4,5,shade),box(43,33,5,10,shade));
 p.push(box(25,30,7,2,"#302720"),box(37,30,7,2,"#302720"));
 p.push(box(27,32,3,2,"#EDE4C8"),box(39,32,3,2,"#EDE4C8"));
 p.push(box(28,32,1,2,"#17231A"),box(40,32,1,2,"#17231A"));
 p.push(box(35,34,2,5,shade),box(32,40,8,1,"#835943"));
 const fringe=hairStyle%5;
 if(fringe===0)p.push(box(18,17,29,6,hair),box(20,22,9,4,hair));
 if(fringe===1)p.push(box(18,16,26,6,hair),box(18,21,14,6,hair));
 if(fringe===2)p.push(box(20,15,27,8,hair),box(22,23,9,3,hair));
 if(fringe===3)p.push(box(16,17,34,6,hair),box(43,23,8,4,hair));
 if(fringe===4)p.push(box(19,15,31,7,hair),box(19,22,8,5,hair));
 if(female){p.push(box(16,25,5,17,hair));if(hairStyle>=5)p.push(box(47,25,6,22,hair));}
 else {p.push(box(18,25,4,8,hair));if(hairStyle%4===2)p.push(box(24,42,21,4,hair),box(20,37,5,7,hair));if(hairStyle===7)p.push(box(17,13,34,5,"#526648"),box(13,20,40,4,"#526648"));}
 if(n%7===0)p.push(box(25,38,3,1,"#AD795B"));
 if(n%11===0)p.push(box(24,31,9,1,"#BBD09B"),box(36,31,9,1,"#BBD09B"),box(33,31,3,1,"#BBD09B"));
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128" shape-rendering="crispEdges">'+p.join("")+'</svg>';
}
export function avatarDataUri(biology,id,game=1){const {gender,index}=avatarIdentity(biology,id,game);return "data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(avatarSvg(gender,index));}
