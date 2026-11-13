// Pixel portraits: 250 variants per biological sex; deterministic per character.
const skins=[["#F0C68C","#BD885A"],["#DDAD78","#AB744E"],["#C38A62","#88583F"],["#A56D50","#6D4836"],["#EDD1A1","#B99B73"]];
const hairs=["#2B2119","#513324","#79512A","#AA8E52","#3A3830","#6C3A22","#201F1C","#6C5941","#34291E","#8B7051"];
const coats=[["#46603B","#243825"],["#5A653E","#303A27"],["#76613E","#443627"],["#345447","#1A3429"],["#586849","#2D3D2C"]];
const box=(x,y,w,h,c)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+c+'"/>';
const path=(d,c)=>'<path d="'+d+'" fill="'+c+'"/>';
function hash(value){let h=2166136261;for(const c of String(value)){h=Math.imul(h^c.codePointAt(0),16777619);}return h>>>0;}
export function avatarIdentity(biology,id,game=1){return {gender:String(biology).startsWith("Женщина")?"female":"male",index:hash(String(id)+":"+game)%(String(biology).startsWith("Женщина")?298:290)};}
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
