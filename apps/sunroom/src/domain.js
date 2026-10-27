import polygonClipping from 'polygon-clipping';
import { CATALOG } from './catalog.js';
import { normalizeFloorStructure } from './floor-config.js';

export const copy = value => JSON.parse(JSON.stringify(value));
export const uid = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
export const template = type => CATALOG.find(v => v.id === type);
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function rectangle(w,d){return [[0,0],[w,0],[w,d],[0,d]];}
export function shapeVertices(s){return s.shape==='L'?[[0,0],[s.width,0],[s.width,s.depth-1300],[s.width-1500,s.depth-1300],[s.width-1500,s.depth],[0,s.depth]]:rectangle(s.width,s.depth);}
function signedArea(p){return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;}
export function area(p){return Math.abs(signedArea(p));}
export function inside(x,z,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function footprint(item,pad=0){const c=Math.cos(item.rotation||0),s=Math.sin(item.rotation||0),w=item.w/2+pad,d=item.d/2+pad;return [[-w,-d],[w,-d],[w,d],[-w,d]].map(([x,z])=>[item.x+c*x+s*z,item.z-s*x+c*z]);}
export function pointDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
function onSegment(a,b,c){return Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<.001&&c[0]>=Math.min(a[0],b[0])-.001&&c[0]<=Math.max(a[0],b[0])+.001&&c[1]>=Math.min(a[1],b[1])-.001&&c[1]<=Math.max(a[1],b[1])+.001;}
function intersects(a,b,c,d){const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);return ab1*ab2<0&&cd1*cd2<0||(!ab1&&onSegment(a,b,c))||(!ab2&&onSegment(a,b,d))||(!cd1&&onSegment(c,d,a))||(!cd2&&onSegment(c,d,b));}
export function validPolygon(vertices){if(!Array.isArray(vertices)||vertices.length<3||vertices.length>24||vertices.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>30000)))return false;if(area(vertices)<1000000)return false;for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];if(Math.hypot(b[0]-a[0],b[1]-a[1])<200)return false;for(let j=i+1;j<vertices.length;j++){if(j===i+1||i===0&&j===vertices.length-1)continue;if(intersects(a,b,vertices[j],vertices[(j+1)%vertices.length]))return false;}}return true;}
export function openingPosition(s,o){
 const a=s.vertices[o.wall],b=s.vertices[(o.wall+1)%s.vertices.length];
 if(!a||!b)return null;
 const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
 if(!Number.isFinite(len)||len<=0)return null;
 const dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len,winding=signedArea(s.vertices)<0?-1:1;
 // Preserve wall IDs and offset direction for imported clockwise room outlines.
 return {x:a[0]+dx*o.offset,z:a[1]+dz*o.offset,dx,dz,len,nx:-dz*winding,nz:dx*winding};
}
export function normalizeStructure(s){
 if(!s||!validPolygon(s.vertices))throw Error('房间轮廓无效');
 normalizeFloorStructure(s);
 const numberOr=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
 s.height=clamp(numberOr(s.height,2800),2100,5000);
 s.wallThickness=clamp(numberOr(s.wallThickness,120),60,500);
 for(const kind of ['doors','windows']){
  s[kind]??=[];
  if(!Array.isArray(s[kind])||s[kind].length>60)throw Error('门窗列表无效');
  for(const o of s[kind]){
   if(!o||typeof o!=='object'||Array.isArray(o))throw Error('门窗数据无效');
   o.wall=clamp(Math.round(numberOr(o.wall,0)),0,s.vertices.length-1);
   const p=openingPosition(s,o);
   if(!p||p.len<400)throw Error('第 '+(o.wall+1)+' 面墙长度不足，门窗需要至少 400 mm 的墙段，请选择其他墙面');
   o.width=clamp(numberOr(o.width,800),300,p.len-100);
   o.height=clamp(numberOr(o.height,1200),300,s.height-100);
   o.sill=kind==='windows'?clamp(numberOr(o.sill,0),0,s.height-o.height-50):0;
   o.offset=clamp(numberOr(o.offset,p.len/2),o.width/2+25,p.len-o.width/2-25);
  }
 }
 return s;
}
export const isWallMounted = item => template(item.type)?.mount==='wall';
const itemBottom = item => Number.isFinite(item.y)?item.y:0;
const verticalOverlap = (a,b) => Math.min(itemBottom(a)+a.h,itemBottom(b)+b.h)-Math.max(itemBottom(a),itemBottom(b))>1;
function preferredWallOrder(structure){
 const v=structure.vertices,minX=Math.min(...v.map(p=>p[0])),minZ=Math.min(...v.map(p=>p[1])),spanX=Math.max(...v.map(p=>p[0]))-minX,spanZ=Math.max(...v.map(p=>p[1]))-minZ;
 return v.map((a,i)=>{const b=v[(i+1)%v.length];return {wall:i,len:Math.hypot(b[0]-a[0],b[1]-a[1]),score:((a[0]+b[0])/2-minX)/Math.max(spanX,1)+((a[1]+b[1])/2-minZ)/Math.max(spanZ,1)};}).sort((a,b)=>a.score-b.score||b.len-a.len||a.wall-b.wall);
}
/** Mutates and returns a wall-mounted item; all coordinates and heights are mm.
 * options.place + options.items are for new-item placement only. Normal updates
 * preserve wall/wallOffset so rotating a room outline never changes wall IDs.
 */
export function attachWallItem(item,structure,options={}){
 if(!isWallMounted(item))return item;
 if(!validPolygon(structure?.vertices))throw Error('挂墙物件需要有效的房间轮廓');
 const t=template(item.type),walls=preferredWallOrder(structure),ceiling=Number.isFinite(structure.height)?structure.height:2800;
 item.mount='wall';item.install=['no-drill','screw'].includes(item.install)?item.install:t.install||'screw';
 item.h=clamp(Number.isFinite(item.h)?item.h:t.h,10,Math.max(10,ceiling-20));
 item.y=clamp(Number.isFinite(item.y)?item.y:Number.isFinite(t.y)?t.y:1200,0,Math.max(0,ceiling-item.h-20));
 item.w=Number.isFinite(item.w)?Math.max(50,item.w):t.w;
 item.d=Number.isFinite(item.d)?Math.max(20,item.d):t.d;
 const synchronize=(wall,offset)=>{
  item.wall=clamp(Math.round(wall),0,structure.vertices.length-1);
  const p=openingPosition(structure,{wall:item.wall,offset:0});
  item.w=clamp(item.w,50,Math.max(50,p.len-50));
  item.wallOffset=clamp(offset,item.w/2+25,p.len-item.w/2-25);
  const anchor=openingPosition(structure,{wall:item.wall,offset:item.wallOffset});
  const inset=item.d/2+(structure.wallThickness||120)/2+20;
  item.x=anchor.x+anchor.nx*inset;item.z=anchor.z+anchor.nz*inset;
  item.rotation=Math.atan2(anchor.nx,anchor.nz);
 };
 const auto=options.place||!Number.isFinite(item.wall)||!Number.isFinite(item.wallOffset);
 if(!auto){synchronize(item.wall,item.wallOffset);return item;}
 const originalWidth=item.w,existing=(options.items||[]).filter(other=>other!==item&&other.id!==item.id&&other.type!=='rug'),allowed=Number.isFinite(options.preferredWall)?walls.filter(w=>w.wall===clamp(Math.round(options.preferredWall),0,structure.vertices.length-1)):walls;
 let best=null;
 for(const w of allowed){
  if(w.len<originalWidth+50&&allowed.some(v=>v.len>=originalWidth+50))continue;
  item.w=Math.min(originalWidth,w.len-50);
  const min=item.w/2+25,max=w.len-item.w/2-25,offsets=new Set([min,max,w.len/2,w.len/4,w.len*3/4]);
  for(let offset=min;offset<=max;offset+=160)offsets.add(offset);
  for(const other of existing.filter(o=>isWallMounted(o)&&o.wall===w.wall))for(const sign of [-1,1])offsets.add(other.wallOffset+sign*((other.w+item.w)/2+80));
  for(const raw of offsets){
   synchronize(w.wall,clamp(raw,min,max));
   let penalty=0;
   try{const clipped=multiArea(polygonClipping.intersection([footprint(item)],[structure.vertices]));penalty+=Math.max(0,item.w*item.d-clipped)*10;}catch{penalty+=1e9;}
   for(const other of existing)if(verticalOverlap(item,other))penalty+=overlap(item,other);
   for(const kind of ['doors','windows'])for(const o of structure[kind]||[]){
    if(o.wall!==item.wall)continue;
    const bottom=kind==='doors'?0:o.sill||0,shared=Math.min(item.wallOffset+item.w/2,o.offset+o.width/2)-Math.max(item.wallOffset-item.w/2,o.offset-o.width/2);
    if(shared>0&&verticalOverlap(item,{y:bottom,h:o.height}))penalty+=shared*item.d*2;
   }
   const score=penalty*10000+w.score*1000+Math.abs(item.wallOffset-w.len/2)/100;
   if(!best||score<best.score)best={wall:item.wall,offset:item.wallOffset,w:item.w,score};
  }
 }
 item.w=best?.w||originalWidth;
 synchronize(best?.wall??walls[0].wall,best?.offset??walls[0].len/2);
 return item;
}
export function newItem(type,patch={},structure=null,items=[]){
 const t=template(type);if(!t)throw Error('未找到这个家具模板');
 const item={id:uid('item'),type,name:t.label,w:t.w,d:t.d,h:t.h,color:t.color||'#d3c4ac',material:t.material||'wood',price:Number.isFinite(t.price)?t.price:null,x:2500,z:2200,rotation:0,y:Number.isFinite(t.y)?t.y:t.mount==='wall'?1200:0,...(t.mount?{mount:t.mount,install:t.install}:{}),...patch};
 if(isWallMounted(item))attachWallItem(item,structure||{vertices:rectangle(5000,4200),height:2800,doors:[],windows:[]},{items,place:!Number.isFinite(patch.wall)||!Number.isFinite(patch.wallOffset),preferredWall:patch.wall});
 return item;
}
export function initialProject(){return {schemaVersion:1,name:'我的第一间日光小屋',structure:{shape:'rectangle',width:5000,depth:4200,height:2800,wallThickness:120,wallColor:'#e9e5db',floorMaterial:'wood_floor',floorType:'tile',floorColor:'#d9dddb',floorUnitWidth:600,floorUnitLength:600,floorPattern:'straight',floorGap:2,floorGroutColor:'#b8bcb9',floorFinish:'matte',vertices:rectangle(5000,4200),doors:[{id:uid('door'),wall:2,offset:900,width:850,height:2100,hinge:'left',swing:'in'}],windows:[{id:uid('window'),wall:0,offset:3500,width:2100,height:1450,sill:850,depth:220}]},items:[
newItem('rug',{x:1350,z:2200,w:2400,d:2800,h:20,color:'#d9d4c7',material:'carpet'}),
newItem('bed',{x:1300,z:1450,w:1500,d:2100,h:1050,color:'#c4b79c'}),
newItem('bedside',{x:2380,z:700,w:480,d:420,h:520,color:'#a3af93',material:'board-sage'}),
newItem('desk',{x:3650,z:640,w:1500,d:650,h:750,color:'#ffffff',material:'board-white'}),
newItem('chair',{x:3650,z:1360,w:540,d:550,h:840,color:'#777e68'}),
newItem('wardrobe',{x:340,z:3300,w:1500,d:580,h:2250,rotation:Math.PI/2,color:'#ffffff',material:'board-white'}),
newItem('plant',{x:4500,z:2600,w:600,d:600,h:1500,color:'#68734d'}),
newItem('floor-lamp',{x:2520,z:1900,w:380,d:380,h:1600,color:'#d6c8aa'}),
newItem('mirror',{x:4560,z:3280,w:620,d:80,h:1650,rotation:-Math.PI/6,color:'#b18a59'})
],environment:{hour:10.5,season:'autumn',latitude:31.2,north:0},profile:{budget:18000,minPassage:600,rental:true,needs:['sleep','work','storage']},variants:[]};}
// Rugs cover the floor without obstructing it; catalog shelves and mirrors stand on it.
const excluded=new Set(['rug']);
export const occupiesFloor = item => !excluded.has(item.type)&&itemBottom(item)<=20;
function multiArea(result){return result.reduce((sum,poly)=>sum+poly.reduce((a,ring,i)=>a+(i? -1:1)*area(ring),0),0);}
function overlap(a,b){try{return multiArea(polygonClipping.intersection([footprint(a)],[footprint(b)]));}catch{return 0;}}
export function openingEnvelope(s,o,kind){const p=openingPosition(s,o);if(!p)return null;const depth=kind==='doors'?o.width:350,sign=kind==='doors'&&o.swing==='out'?-1:1;return {id:o.id,type:kind,x:p.x+sign*p.nx*depth/2,z:p.z+sign*p.nz*depth/2,w:o.width,d:depth,rotation:-Math.atan2(p.dz,p.dx)};}
function furnitureDistance(x,z,it){const c=Math.cos(it.rotation||0),s=Math.sin(it.rotation||0),dx=x-it.x,dz=z-it.z,px=c*dx-s*dz,pz=s*dx+c*dz;return Math.hypot(Math.max(Math.abs(px)-it.w/2,0),Math.max(Math.abs(pz)-it.d/2,0));}
export function analyze(project){const s=project.structure,items=project.items,floor=items.filter(occupiesFloor),solid=items.filter(i=>!excluded.has(i.type)),floorPoly=[s.vertices],gross=area(s.vertices),collisions=[],warnings=[];let occupied=0;
try{const union=floor.length?polygonClipping.union(...floor.map(i=>[footprint(i)])):[];occupied=union.length?multiArea(polygonClipping.intersection(union,floorPoly)):0;}catch{warnings.push({message:'占地计算暂不可用，请检查房间轮廓'});}
for(let i=0;i<solid.length;i++){const it=solid[i];try{const clipped=multiArea(polygonClipping.intersection([footprint(it)],floorPoly));if(clipped<it.w*it.d*.985)warnings.push({id:it.id,message:it.name+' 部分超出房间，请调整位置'});}catch{}
if(itemBottom(it)+it.h>s.height+1)warnings.push({id:it.id,message:it.name+' 高于房间层高，请核对离地高度和物件高度'});
for(let j=i+1;j<solid.length;j++){const other=solid[j];if(!verticalOverlap(it,other))continue;if(['desk','desk-corner','dining-table','round-table'].includes(it.type)&&['chair','dining-chair'].includes(other.type)||['desk','desk-corner','dining-table','round-table'].includes(other.type)&&['chair','dining-chair'].includes(it.type))continue;if(overlap(it,other)>1600)collisions.push({a:it.id,b:other.id,message:it.name+' 与 '+other.name+' 空间重叠'});}}
for(const door of s.doors){const e=openingEnvelope(s,door,'doors');for(const it of solid)if(verticalOverlap(it,{y:0,h:door.height})&&overlap(e,it)>2500)warnings.push({id:it.id,openingId:door.id,message:it.name+' 可能挡住房门开启区'});}
for(const it of solid.filter(isWallMounted))for(const kind of ['doors','windows'])for(const o of s[kind]||[]){
 if(it.wall!==o.wall)continue;
 const shared=Math.min(it.wallOffset+it.w/2,o.offset+o.width/2)-Math.max(it.wallOffset-it.w/2,o.offset-o.width/2),bottom=kind==='doors'?0:o.sill||0;
 if(shared>1&&verticalOverlap(it,{y:bottom,h:o.height})&&!warnings.some(w=>w.id===it.id&&w.openingId===o.id))warnings.push({id:it.id,openingId:o.id,message:it.name+' 与'+(kind==='doors'?'房门':'窗户')+'位置重叠，请调整挂墙位置或离地高度'});
}
for(const it of solid.filter(i=>/wardrobe|cabinet|dresser/.test(i.type))){const front=it.type==='wardrobe-sliding'?80:Math.min(480,it.w/2),c=Math.cos(it.rotation),ss=Math.sin(it.rotation);const envelope={...it,x:it.x+ss*(it.d/2+front/2),z:it.z+c*(it.d/2+front/2),d:front};for(const other of solid){if(it===other||!verticalOverlap(it,other))continue;if(overlap(envelope,other)>3000)warnings.push({id:it.id,message:it.name+' 前方开合空间被 '+other.name+' 占用'});}}
// Sample navigable floor at 75 mm; routes report their grid resolution explicitly.
const minX=Math.min(...s.vertices.map(v=>v[0])),minZ=Math.min(...s.vertices.map(v=>v[1])),maxX=Math.max(...s.vertices.map(v=>v[0])),maxZ=Math.max(...s.vertices.map(v=>v[1])),step=75,nx=Math.ceil((maxX-minX)/step),nz=Math.ceil((maxZ-minZ)/step),clear=new Float32Array(nx*nz);clear.fill(-1);
for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const px=minX+(x+.5)*step,pz=minZ+(z+.5)*step;if(!inside(px,pz,s.vertices))continue;let d=Infinity;for(let e=0;e<s.vertices.length;e++)d=Math.min(d,pointDistance(px,pz,s.vertices[e],s.vertices[(e+1)%s.vertices.length]));for(const it of floor)d=Math.min(d,furnitureDistance(px,pz,it));clear[z*nx+x]=d;}
const door=s.doors[0],pos=door?openingPosition(s,door):null,start=pos?{x:pos.x+pos.nx*500,z:pos.z+pos.nz*500}:{x:(minX+maxX)/2,z:(minZ+maxZ)/2};
let startId=-1,best=Infinity;for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const k=z*nx+x;if(clear[k]<150)continue;const d=Math.hypot(minX+(x+.5)*step-start.x,minZ+(z+.5)*step-start.z);if(d<best){best=d;startId=k;}}
const capacity=new Float32Array(nx*nz),visited=new Uint8Array(nx*nz),queue=[];if(startId>=0){capacity[startId]=Math.min(clear[startId]*2,door?.width||1000);queue.push(startId);}
// Widest-path flood fill with bucket priority, avoiding a quadratic scan over the grid.
const buckets=Array.from({length:81},()=>[]);if(startId>=0)buckets[Math.min(80,Math.floor(capacity[startId]/50))].push(startId);let current=80;
while(current>=0){if(!buckets[current].length){current--;continue;}const k=buckets[current].pop();if(visited[k])continue;visited[k]=1;const x=k%nx,z=Math.floor(k/nx);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz;if(xx<0||xx>=nx||zz<0||zz>=nz)continue;const n=zz*nx+xx;if(clear[n]<=0||visited[n])continue;const c=Math.min(capacity[k],clear[n]*2);if(c>capacity[n]){capacity[n]=c;const b=Math.min(80,Math.floor(c/50));buckets[b].push(n);if(b>current)current=b;}}}
const routes=[];for(const it of floor.filter(i=>['bed','bed-single','bed-storage','desk','desk-corner','wardrobe','wardrobe-sliding'].includes(i.type))){let c=0;const poly=footprint(it,Math.max(600,project.profile.minPassage/2+150));for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const px=minX+(x+.5)*step,pz=minZ+(z+.5)*step;if(inside(px,pz,poly)&&furnitureDistance(px,pz,it)>=project.profile.minPassage/2)c=Math.max(c,capacity[z*nx+x]);}routes.push({id:it.id,label:it.name,width:Math.round(c/10)*10,connected:c>=project.profile.minPassage});}
let minimum=routes.length?Math.min(...routes.map(v=>v.width)):0;if(routes.some(r=>!r.connected))warnings.push({message:'部分路线小于你设置的 '+project.profile.minPassage+' mm 通道偏好，请查看路线提示'});
let storage=0,knownCost=0,missingPrices=0;for(const it of items){const t=template(it.type);storage+=(t?.storageRatio||0)*it.w*it.d*it.h/1e6;if(Number.isFinite(it.price))knownCost+=it.price;else missingPrices++;}
const needs=[{label:'睡眠区',met:items.some(i=>i.type.startsWith('bed'))},{label:'办公位',met:items.some(i=>i.type.startsWith('desk'))},{label:'衣物收纳',met:items.some(i=>i.type.startsWith('wardrobe')||i.type==='clothes-rack')}];
return {area:gross/1e6,occupiedArea:occupied/1e6,occupancy:occupied/gross,freeArea:(gross-occupied)/1e6,minPassage:minimum,storage:Math.round(storage),knownCost,missingPrices,budgetRemaining:project.profile.budget-knownCost,collisions,warnings,routes,routeConnected:routes.every(r=>r.connected),needs,analysisStep:75,recommendations:recommendations(project,{routes,collisions,knownCost})};}
export function recommendations(project,metrics){const results=[],items=project.items,small=area(project.structure.vertices)<16000000;const cabinet=items.find(i=>i.type==='wardrobe'&&i.d>450);if(cabinet)results.push({id:'sliding-cabinet',title:'换成移门窄柜',reason:'减少柜前开门所需空间；容量会随深度减少，替换后重新检查。',itemId:cabinet.id,type:'wardrobe-sliding',patch:{type:'wardrobe-sliding',d:450,name:'移门窄衣柜'}});
const bed=items.find(i=>['bed','bed-single'].includes(i.type));if(bed)results.push({id:'underbed',title:'把床下空间用起来',reason:'保持床的长宽，增加床下收纳结构；为估算容量。',itemId:bed.id,type:'bed-storage',patch:{type:'bed-storage',name:'收纳床'}});
if(!items.some(i=>i.type==='shoe-cabinet'))results.push({id:'entry-storage',title:'玄关窄深鞋柜',reason:'建议深度 220–300 mm，试放后检查房门和入口通道。',type:'shoe-cabinet',patch:{d:260,w:700}});
if(!items.some(i=>i.type==='floor-lamp'))results.push({id:'reading-light',title:'为阅读角补一盏灯',reason:'可移动落地灯适合租房布置，试放后调整到床侧或书桌旁。',type:'floor-lamp'});
if(small)results.push({id:'compact-desk',title:'选择紧凑办公桌',reason:'先试放 1000 × 500 mm 桌面，再根据设备和使用习惯调整。',type:'desk',patch:{w:1000,d:500}});
const wallTemplates=CATALOG.filter(t=>t.mount==='wall'),wallPicks=[{id:'wall-pegboard',match:/pegboard|洞洞板/i,title:'把零碎工具收上墙'},{id:'wall-hooks',match:/hook|挂钩/i,title:'给钥匙和轻小物一个固定位置'},...(project.profile.rental?[{id:'rental-wall-rack',match:/no-drill|免打孔/i,title:'用免打孔小架补充竖向收纳'}]:[])],placed=[];
for(const pick of wallPicks){
 const candidates=wallTemplates.filter(t=>pick.match.test(t.id+' '+t.label)&&!items.some(i=>i.type===t.id));
 const t=project.profile.rental?candidates.find(t=>t.install==='no-drill')||candidates[0]:candidates[0];
 if(!t)continue;
 const candidate=newItem(t.id,{},project.structure,[...items,...placed]);placed.push(candidate);
 const {wall,wallOffset,y,x,z,rotation}=candidate;
 results.push({id:pick.id,title:pick.title,reason:t.install==='no-drill'?'利用离地空间；免打孔款仍需核对实际墙面、固定方式与承重，试放后检查门窗。':'利用离地空间；螺丝固定款需先确认安装许可与墙体条件，试放后检查门窗。',type:t.id,patch:{wall,wallOffset,y,x,z,rotation}});
}
results.push({id:'rolling-cart',title:'用移动三层推车补充收纳',reason:'分层整理常用小物，留出推行和抽出通道，适合租房；价格为示意预算。',type:'rolling-cart'});return results;}
function validateSourceNumbers(value,depth=0){
 if(depth>64)throw Error('项目数据嵌套过深');
 if(typeof value==='number'&&!Number.isFinite(value))throw Error('项目包含无效数值，请检查尺寸和环境参数');
 if(value&&typeof value==='object')for(const child of Object.values(value))validateSourceNumbers(child,depth+1);
}
export function validateProject(value){
 if(!value||value.schemaVersion!==1||!value.structure||!validPolygon(value.structure.vertices)||!Array.isArray(value.items)||value.items.length>150)throw Error('项目格式或房间轮廓无效');
 // Validate before JSON cloning: NaN/Infinity would otherwise silently become null.
 validateSourceNumbers(value);
 const source=value.structure;
 normalizeFloorStructure({...source},{strict:true});
 for(const key of ['width','depth','height','wallThickness']){
  const max=key==='width'||key==='depth'?60000:key==='height'?10000:2000;
  if(!Number.isFinite(source[key])||source[key]<=0||source[key]>max)throw Error('房间尺寸无效，请使用有限的正数毫米值');
 }
 for(const kind of ['doors','windows']){
  if(source[kind]!==undefined&&(!Array.isArray(source[kind])||source[kind].length>60))throw Error('门窗列表无效');
  for(const o of source[kind]||[]){
   if(!o||typeof o!=='object'||Array.isArray(o))throw Error('门窗数据无效');
   for(const key of ['wall','offset','width','height','sill','depth'])if(key in o&&!Number.isFinite(o[key]))throw Error('门窗尺寸或墙面编号无效');
  }
 }
 for(const key of ['hour','latitude','north'])if(value.environment&&key in value.environment&&!Number.isFinite(value.environment[key]))throw Error('时间与阳光参数无效');
 const p=copy(value);p.variants=Array.isArray(p.variants)?p.variants.slice(0,12):[];
 p.profile={budget:18000,minPassage:600,rental:true,...p.profile};p.profile.budget=clamp(Number(p.profile.budget)||0,0,10000000);p.profile.minPassage=clamp(Number(p.profile.minPassage)||600,300,2000);
 p.environment={hour:10.5,latitude:31.2,north:0,season:'autumn',...p.environment};p.environment.hour=clamp(Number(p.environment.hour)||0,0,24);
 p.name=String(p.name||'我的家').slice(0,60);normalizeStructure(p.structure);
 const ids=new Set();
 for(const it of p.items){
  if(!it||typeof it!=='object'||!template(it.type)||!it.id||ids.has(it.id)||['w','d','h'].some(k=>!Number.isFinite(it[k]))||it.w<50||it.d<20||it.h<10||Math.max(it.w,it.d,it.h)>10000)throw Error('家具数据无效');
  for(const key of ['y','wall','wallOffset'])if(key in it&&!Number.isFinite(it[key]))throw Error('物件离地高度或挂墙位置无效');
  if(isWallMounted(it))attachWallItem(it,p.structure,{items:p.items});
  else it.y=Number.isFinite(it.y)?clamp(it.y,0,Math.max(0,p.structure.height-it.h)):0;
  if(['x','z','rotation'].some(k=>!Number.isFinite(it[k]))||Math.abs(it.x)>50000||Math.abs(it.z)>50000)throw Error('家具位置无效');
  ids.add(it.id);it.name=String(it.name||template(it.type).label).slice(0,60);it.color=/^#[0-9a-f]{6}$/i.test(it.color)?it.color:'#c9bda7';it.price=Number.isFinite(it.price)?clamp(it.price,0,10000000):null;
 }
 return p;
}
