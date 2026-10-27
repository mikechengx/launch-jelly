import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze, area, attachWallItem, copy, footprint, initialProject, inside, isWallMounted, newItem,
  normalizeStructure, occupiesFloor, openingEnvelope, openingPosition,
  rectangle, validPolygon, validateProject,
} from '../src/domain.js';

const near=(actual,expected,epsilon=1e-8)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected} (±${epsilon})`);
function emptyProject(){
 const p=initialProject();
 p.items=[];p.structure.doors=[];p.structure.windows=[];
 return p;
}
function box(id,x,z,w,d,rotation=0,type='low-cabinet'){
 return newItem(type,{id,x,z,w,d,h:600,rotation,price:0});
}
function assertOpeningFits(s,o){
 const p=openingPosition(s,o);
 assert.ok(p&&Number.isFinite(p.len));
 assert.ok(Number.isInteger(o.wall)&&o.wall>=0&&o.wall<s.vertices.length);
 assert.ok(o.width>0&&o.width<=p.len-50,`opening width ${o.width} must fit ${p.len} mm wall`);
 assert.ok(o.offset-o.width/2>=24.999);
 assert.ok(o.offset+o.width/2<=p.len-24.999);
 assert.ok(o.height>0&&o.height<s.height);
 assert.ok(o.sill>=0&&o.sill+o.height<=s.height-49.999);
}

test('5000 × 4200 mm room has 21 m² net interior floor area',()=>{
 const p=emptyProject(),m=analyze(p);
 near(area(p.structure.vertices),21_000_000);
 near(m.area,21);near(m.freeArea,21);near(m.occupiedArea,0);near(m.occupancy,0);
 // Interior vertices define usable area; wall thickness must not be deducted twice.
 p.structure.wallThickness=300;
 near(analyze(p).area,21);
});

test('overlapping furniture uses the occupied union rather than adding both areas',()=>{
 const p=emptyProject();
 p.items=[box('a',1500,2100,1000,1000),box('b',2000,2100,1000,1000)];
 const m=analyze(p);
 near(m.occupiedArea,1.5);near(m.freeArea,19.5);near(m.occupancy,1.5/21);
 assert.equal(m.collisions.length,1);
});

test('coincident furniture is counted once even when duplicated three times',()=>{
 const p=emptyProject();p.items=['a','b','c'].map(id=>box(id,2500,2100,1000,1000));
 const m=analyze(p);near(m.occupiedArea,1);assert.equal(m.collisions.length,3);
});

test('90-degree rotation changes the union: crossed 2 × 1 m rectangles occupy 3 m²',()=>{
 const p=emptyProject();p.items=[box('a',2500,2100,2000,1000),box('b',2500,2100,2000,1000,Math.PI/2)];
 near(analyze(p).occupiedArea,3);
 near(area(footprint(p.items[1])),2_000_000);
});

test('occupied area clips furniture to the room and reports the outside part',()=>{
 const p=emptyProject();p.items=[box('clipped',0,2100,1000,1000)];
 const m=analyze(p);near(m.occupiedArea,.5);near(m.freeArea,20.5);
 assert.ok(m.warnings.some(w=>w.id==='clipped'&&/超出/.test(w.message)));
});

test('a 45-degree rotated footprint preserves furniture area',()=>{
 const p=emptyProject();p.items=[box('a',2500,2100,1700,800,Math.PI/4)];
 near(analyze(p).occupiedArea,1.36);
 near(area(footprint(p.items[0])),1_360_000,1e-6);
});

test('true oriented collision: parallel thin objects can have intersecting AABBs without colliding',()=>{
 const p=emptyProject(),shift=200/Math.sqrt(2);
 p.items=[box('a',2500,2100,1800,100,Math.PI/4),box('b',2500+shift,2100+shift,1800,100,Math.PI/4)];
 const m=analyze(p);assert.equal(m.collisions.length,0);near(m.occupiedArea,.36);
});

test('true oriented collision detects crossed thin objects',()=>{
 const p=emptyProject();p.items=[box('a',2500,2100,1800,100,Math.PI/4),box('b',2500,2100,1800,100,-Math.PI/4)];
 const m=analyze(p);assert.equal(m.collisions.length,1);near(m.occupiedArea,.35);
});

test('edge-touching furniture does not count as an overlap',()=>{
 const p=emptyProject();p.items=[box('a',1500,2100,1000,1000),box('b',2500,2100,1000,1000)];
 const m=analyze(p);assert.equal(m.collisions.length,0);near(m.occupiedArea,2);
});

test('a rug beneath furniture does not consume additional walkable floor or create a collision',()=>{
 const p=emptyProject();p.items=[box('a',2000,2000,1000,1000),newItem('rug',{id:'rug',x:2000,z:2000,w:2400,d:2400})];
 assert.equal(occupiesFloor(p.items[1]),false);
 const m=analyze(p);near(m.occupiedArea,1);assert.equal(m.collisions.length,0);
});

test('floor-standing shelves and mirrors retain their physical floor footprint',()=>{
 assert.equal(occupiesFloor(newItem('wall-shelf')),true,'catalog calls this a floor-standing open shelf');
 assert.equal(occupiesFloor(newItem('mirror')),true,'catalog describes a floor mirror with rear support');
});

test('an object inside the doorway opening area produces a door warning',()=>{
 const p=emptyProject();p.structure.doors=[{id:'door',wall:0,offset:2500,width:900,height:2100,hinge:'left',swing:'in'}];
 p.items=[box('blocker',2500,350,800,400)];
 assert.ok(analyze(p).warnings.some(w=>w.id==='blocker'&&/房门|门口|开启/.test(w.message)));
 p.items[0].z=1800;
 assert.equal(analyze(p).warnings.some(w=>w.id==='blocker'&&/房门|门口|开启/.test(w.message)),false);
});

test('door envelopes face inward on all four room walls',()=>{
 const p=emptyProject();
 for(let wall=0;wall<4;wall++){
  const a=p.structure.vertices[wall],b=p.structure.vertices[(wall+1)%4],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const d={id:'door-'+wall,wall,offset:len/2,width:900,height:2100};
  const e=openingEnvelope(p.structure,d,'doors');
  assert.ok(inside(e.x,e.z,p.structure.vertices),'door '+wall+' must open into the room');
 }
});

test('valid clockwise imported room still gives inward door envelopes',()=>{
 const p=emptyProject();p.structure.vertices=copy(p.structure.vertices).reverse();
 assert.equal(validPolygon(p.structure.vertices),true);
 p.structure.doors=[{id:'door',wall:0,offset:2500,width:900,height:2100}];
 const imported=validateProject(p),e=openingEnvelope(imported.structure,imported.structure.doors[0],'doors');
 assert.ok(inside(e.x,e.z,imported.structure.vertices),'polygon winding must not put the door clearance outside');
});

test('opening normalization repairs wall indices, sizes, sill heights and offsets together',()=>{
 const p=emptyProject(),s=p.structure;
 s.doors=[{id:'door',wall:99,offset:-3000,width:9000,height:7000,sill:900}];
 s.windows=[{id:'window',wall:-4,offset:90000,width:9000,height:2700,sill:2400}];
 normalizeStructure(s);
 for(const o of [...s.doors,...s.windows])assertOpeningFits(s,o);
 assert.equal(s.doors[0].sill,0);
});

test('opening on a 200 mm wall is rejected with a clear minimum-wall-length error',()=>{
 const p=emptyProject();p.structure.vertices=[[0,0],[5000,0],[5000,4200],[4800,4200],[4800,4000],[0,4000]];
 assert.equal(validPolygon(p.structure.vertices),true);
 p.structure.doors=[{id:'door',wall:2,offset:100,width:850,height:2100}];
 assert.throws(()=>validateProject(p),/400 mm|长度不足/);
});

test('valid room polygons include a genuine concave L-shaped interior',()=>{
 const l=[[0,0],[5000,0],[5000,2900],[3500,2900],[3500,4200],[0,4200]];
 assert.equal(validPolygon(l),true);
 near(area(l),19_050_000);
 const p=emptyProject();p.structure.vertices=l;near(analyze(p).area,19.05);
});

test('self-intersection is rejected even when shoelace area is nonzero',()=>{
 const crossing=[[0,0],[5000,4200],[0,4200],[4200,0],[5000,0]];
 assert.ok(area(crossing)>1_000_000);
 assert.equal(validPolygon(crossing),false);
 const p=emptyProject();p.structure.vertices=crossing;assert.throws(()=>validateProject(p));
});

test('zero-length, tiny, non-finite and out-of-range room geometry is rejected',()=>{
 for(const polygon of [
  [[0,0],[5000,0],[5000,0],[0,4200]],
  rectangle(500,500),
  [[0,0],[Infinity,0],[5000,4200],[0,4200]],
  [[0,0],[5000,0],[5000,NaN],[0,4200]],
  rectangle(50000,4200),
 ])assert.equal(validPolygon(polygon),false);
});

test('malformed point data is rejected without validPolygon throwing',()=>{
 for(const polygon of [null,[],[[0,0],null,[5000,4200],[0,4200]],[[0,0],7,[5000,4200],[0,4200]],[[0,0],['5000',0],[5000,4200],[0,4200]]]){
  assert.equal(validPolygon(polygon),false);
 }
});

test('project import rejects illegal furniture dimensions and non-finite positions',()=>{
 for(const patch of [{w:0},{w:-1},{d:0},{h:0},{w:10001},{x:Infinity},{z:NaN},{rotation:NaN},{w:'1000'}]){
  const p=emptyProject();p.items=[box('invalid',2500,2100,1000,1000)];Object.assign(p.items[0],patch);
  assert.throws(()=>validateProject(p),JSON.stringify(patch));
 }
});

test('project import rejects inconsistent or illegal room dimensions',()=>{
 for(const patch of [{width:-5000},{depth:0},{height:Infinity},{height:null},{width:'abc'},{wallThickness:NaN},{wallThickness:null}]){
  const p=emptyProject();Object.assign(p.structure,patch);
  assert.throws(()=>validateProject(p),JSON.stringify(patch));
 }
});

test('non-finite optional numeric data is rejected before JSON cloning can convert it to null',()=>{
 for(const patch of [p=>{p.environment.north=Infinity;},p=>{p.profile.budget=NaN;},p=>{p.variants=[{environment:{hour:Infinity}}];},p=>{p.items[0].price=NaN;}]){
  const p=initialProject();patch(p);assert.throws(()=>validateProject(p),/无效数值/);
 }
});

test('unknown furniture types and duplicate item IDs are rejected at import',()=>{
 const p=emptyProject();p.items=[box('duplicate',1500,2100,1000,1000),box('duplicate',3000,2100,1000,1000)];
 assert.throws(()=>validateProject(p));p.items=[box('a',1500,2100,1000,1000)];p.items[0].type='unknown-item';assert.throws(()=>validateProject(p));
});

test('validation returns an independent project and preserves a valid zero price',()=>{
 const p=emptyProject();p.items=[box('a',2500,2100,1000,1000)];
 const q=validateProject(p);assert.notEqual(q,p);assert.notEqual(q.structure.vertices,p.structure.vertices);
 q.items[0].x=3333;assert.equal(p.items[0].x,2500);assert.equal(q.items[0].price,0);
});

test('cost totals distinguish missing prices from legitimate zero-price items',()=>{
 const p=emptyProject();p.profile.budget=2000;
 p.items=[box('a',1000,1000,500,500),box('b',2500,1000,500,500),box('c',4000,1000,500,500)];
 p.items[0].price=500;p.items[1].price=0;p.items[2].price=null;
 const m=analyze(p);assert.equal(m.knownCost,500);assert.equal(m.missingPrices,1);assert.equal(m.budgetRemaining,1500);
});

test('initial project validates and all reported aggregate measurements are finite',()=>{
 const p=validateProject(initialProject()),m=analyze(p);
 for(const key of ['area','occupiedArea','occupancy','freeArea','minPassage','storage','knownCost','missingPrices','budgetRemaining','analysisStep'])assert.ok(Number.isFinite(m[key]),key+' must be finite');
 near(m.area,21);assert.ok(m.occupiedArea>=0&&m.occupiedArea<=m.area);assert.ok(m.freeArea>=0);assert.ok(m.occupancy>=0&&m.occupancy<=1);
 assert.equal(m.analysisStep,75);
 assert.ok(m.routes.every(r=>Number.isFinite(r.width)&&r.width>=0));
 for(const o of [...p.structure.doors,...p.structure.windows])assertOpeningFits(p.structure,o);
});

test('new wall items default to the visible back or left wall and preserve catalog mounting height',()=>{
 const p=emptyProject(),it=newItem('pegboard',{},p.structure,p.items);
 assert.equal(isWallMounted(it),true);assert.equal(it.mount,'wall');assert.equal(it.install,'screw');
 assert.ok(it.wall===0||it.wall===3);near(it.y,1050);
 const anchor=openingPosition(p.structure,{wall:it.wall,offset:it.wallOffset});
 near(it.x-anchor.x,anchor.nx*(it.d/2+p.structure.wallThickness/2+20));near(it.z-anchor.z,anchor.nz*(it.d/2+p.structure.wallThickness/2+20));
 // The vertices lie at wall centre lines; keep the model's back 20 mm beyond the indoor face.
 p.structure.wallThickness=300;attachWallItem(it,p.structure);
 near((it.x-anchor.x)*anchor.nx+(it.z-anchor.z)*anchor.nz-it.d/2,170);
 assert.equal(occupiesFloor(it),false);
});

test('wall attachments align local positive depth inward on every wall in both polygon windings',()=>{
 for(const reverse of [false,true]){
  const p=emptyProject();if(reverse)p.structure.vertices.reverse();
  for(let wall=0;wall<4;wall++){
   const it=newItem('floating-shelf',{wall,wallOffset:1500,y:1100},p.structure);
   const p0=openingPosition(p.structure,{wall,offset:1500});
   assert.equal(it.wall,wall);near(it.wallOffset,1500);
   near(Math.sin(it.rotation),p0.nx);near(Math.cos(it.rotation),p0.nz);
   const alongX=Math.cos(it.rotation),alongZ=-Math.sin(it.rotation),sign=reverse?-1:1;
   near(alongX,p0.dx*sign);near(alongZ,p0.dz*sign);
   assert.ok(footprint(it).every(v=>inside(...v,p.structure.vertices)));
  }
 }
});

test('wall sync derives x/z/rotation from the anchor after room dimensions change',()=>{
 const p=emptyProject(),it=newItem('wall-cabinet',{wall:1,wallOffset:1800},p.structure);
 const oldX=it.x;p.structure.vertices=rectangle(6000,4200);p.structure.width=6000;
 attachWallItem(it,p.structure);near(it.x-oldX,1000);near(it.wallOffset,1800);assert.equal(it.wall,1);
 near(it.x,6000-it.d/2-p.structure.wallThickness/2-20);
});

test('wall width, anchor, height and bottom elevation clamp to the selected wall and room ceiling',()=>{
 const p=emptyProject(),it=newItem('wall-cabinet',{wall:99,wallOffset:-500,y:10000,w:9000,h:5000},p.structure);
 assert.equal(it.wall,3);const wall=openingPosition(p.structure,{wall:it.wall,offset:it.wallOffset});
 assert.ok(it.w<=wall.len-50);assert.ok(it.wallOffset>=it.w/2+25);assert.ok(it.y>=0&&it.y+it.h<=p.structure.height);
 assert.ok([it.x,it.z,it.rotation,it.y,it.wallOffset].every(Number.isFinite));
});

test('new wall storage avoids a same-height window and does not stack repeatedly at one point',()=>{
 const p=emptyProject();p.structure.windows=[{id:'window',wall:0,offset:2500,width:2000,height:1300,sill:800}];
 for(let i=0;i<3;i++)p.items.push(newItem('pegboard',{id:'board-'+i},p.structure,p.items));
 const m=analyze(p);near(m.occupiedArea,0);assert.equal(m.collisions.length,0);
 assert.equal(m.warnings.filter(w=>w.openingId==='window').length,0);
 assert.equal(new Set(p.items.map(it=>`${it.wall}/${Math.round(it.wallOffset)}`)).size,3);
});

test('a shelf above a desk leaves floor area and walking analysis unchanged',()=>{
 const p=emptyProject();p.items=[newItem('desk',{id:'desk',x:2500,z:350,w:1200,d:600,h:750})];
 const before=analyze(p);p.items.push(newItem('floating-shelf',{id:'shelf',wall:0,wallOffset:2500,y:1350},p.structure,p.items));
 const after=analyze(p);near(after.occupiedArea,before.occupiedArea);near(after.freeArea,before.freeArea);
 assert.equal(after.collisions.length,0);assert.deepEqual(after.routes,before.routes);
});

test('same wall position at separate heights does not create a false collision',()=>{
 const p=emptyProject();p.items=[newItem('floating-shelf',{id:'low',wall:0,wallOffset:1800,y:900},p.structure),newItem('floating-shelf',{id:'high',wall:0,wallOffset:1800,y:1350},p.structure)];
 const separated=analyze(p);assert.equal(separated.collisions.length,0);near(separated.occupiedArea,0);
 p.items[1].y=1000;assert.equal(analyze(p).collisions.length,1);
});

test('hanging storage still collides with a tall floor cabinet occupying its height',()=>{
 const p=emptyProject();p.items=[newItem('wardrobe',{id:'wardrobe',x:2500,z:220,w:1200,d:400,h:2200}),newItem('wall-cabinet',{id:'wall',wall:0,wallOffset:2500,y:1450},p.structure)];
 const m=analyze(p);near(m.occupiedArea,.48);assert.ok(m.collisions.some(c=>new Set([c.a,c.b]).has('wall')));
});

test('wall/window warnings require overlap along the same wall and through the same vertical interval',()=>{
 const p=emptyProject();p.structure.windows=[{id:'window',wall:0,offset:2500,width:1600,height:800,sill:800}];
 const it=newItem('hook-rail',{id:'hooks',wall:0,wallOffset:2500,y:1800},p.structure);p.items=[it];
 assert.equal(analyze(p).warnings.some(w=>w.openingId==='window'),false);
 it.y=1000;assert.ok(analyze(p).warnings.some(w=>w.id===it.id&&w.openingId==='window'));
 it.wallOffset=800;attachWallItem(it,p.structure);assert.equal(analyze(p).warnings.some(w=>w.openingId==='window'),false);
 it.wall=2;it.wallOffset=2500;attachWallItem(it,p.structure);assert.equal(analyze(p).warnings.some(w=>w.openingId==='window'),false);
});

test('wall storage above a door is allowed while storage crossing the door opening warns',()=>{
 const p=emptyProject();p.structure.doors=[{id:'door',wall:0,offset:2500,width:1000,height:2100}];
 const it=newItem('hook-rail',{id:'hooks',wall:0,wallOffset:2500,y:2300},p.structure);p.items=[it];
 assert.equal(analyze(p).warnings.some(w=>w.openingId==='door'),false);
 it.y=1500;assert.ok(analyze(p).warnings.some(w=>w.openingId==='door'&&w.id===it.id));
});

test('wall import validates mounting numeric fields and can rebuild omitted derived coordinates',()=>{
 for(const patch of [{y:null},{y:'1200'},{wall:null},{wall:'0'},{wallOffset:NaN},{wallOffset:Infinity}]){
  const p=emptyProject();p.items=[newItem('pegboard',{},p.structure)];Object.assign(p.items[0],patch);assert.throws(()=>validateProject(p));
 }
 const p=emptyProject();p.items=[newItem('pegboard',{wall:3,wallOffset:1800,y:1200},p.structure)];
 delete p.items[0].x;delete p.items[0].z;delete p.items[0].rotation;
 const q=validateProject(p),it=q.items[0];assert.equal(it.wall,3);near(it.wallOffset,1800);assert.ok([it.x,it.z,it.rotation].every(Number.isFinite));
});

test('old furniture projects without elevation metadata import with floor placement intact',()=>{
 const p=initialProject();for(const it of p.items)delete it.y;
 p.items.push(newItem('wall-shelf',{id:'legacy-shelf',x:2600,z:3000}));delete p.items.at(-1).y;
 const q=validateProject(p);assert.ok(q.items.every(it=>it.y===0));
 assert.equal(isWallMounted(q.items.at(-1)),false);assert.equal(occupiesFloor(q.items.at(-1)),true);
});

test('wall recommendations create real catalog items at usable distinct anchors',()=>{
 const p=emptyProject(),all=analyze(p).recommendations,recommendations=all.filter(r=>['wall-pegboard','wall-hooks','rental-wall-rack'].includes(r.id));
 const cart=all.find(r=>r.id==='rolling-cart');assert.equal(cart.type,'rolling-cart');
 const cartItem=newItem(cart.type,cart.patch,p.structure,p.items);assert.equal(cartItem.type,'rolling-cart');assert.equal(isWallMounted(cartItem),false);assert.equal(occupiesFloor(cartItem),true);
 assert.equal(recommendations.length,3);
 for(const r of recommendations){const it=newItem(r.type,r.patch,p.structure,p.items);assert.equal(isWallMounted(it),true);p.items.push(it);}
 const q=validateProject(p),m=analyze(q);near(m.occupiedArea,0);assert.equal(m.collisions.length,0);
 assert.equal(new Set(q.items.map(it=>`${it.wall}/${Math.round(it.wallOffset)}/${it.y}`)).size,3);
 assert.ok(q.items.some(it=>it.install==='no-drill'));
 assert.ok(m.storage>0);
});
