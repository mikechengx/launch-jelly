import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {buildRoom} from '../src/geometry.js';

let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const close = (a,b,tolerance=1e-5) => assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
function room(patch={}) {
  return buildRoom({vertices:[[0,0],[1200,0],[1200,1200],[0,1200]],height:2700,doors:[],windows:[],floorType:'tile',floorUnitWidth:600,floorUnitLength:600,floorGap:0,...patch}, (kind,color) => {
    const material=new THREE.MeshStandardMaterial({color});material.userData.kind=kind;return material;
  });
}
const surface = r => r.getObjectByName('floor-tile') || r.getObjectByName('floor-board');
function area(r) {
  const p=surface(r).geometry.attributes.position;
  let total=0;
  for(let i=0;i<p.count;i+=3)total+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i)))/2;
  return total;
}
function coverage(r,x,z) {
  const p=surface(r).geometry.attributes.position;
  let count=0;
  for(let i=0;i<p.count;i+=3){
    const edge=(a,b)=>(p.getX(b)-p.getX(a))*(z-p.getZ(a))-(p.getZ(b)-p.getZ(a))*(x-p.getX(a));
    const values=[edge(i,i+1),edge(i+1,i+2),edge(i+2,i)];
    if(values.every(v=>v>1e-8)||values.every(v=>v< -1e-8))count++;
  }
  return count;
}

test('600 × 600 mm tiles produce exactly four pieces',()=>{
  const r=room();assert.equal(r.userData.floorLayout.pieceCount,4);close(area(r),1.44);
  assert.equal(r.userData.floorLayout.pieces.length,4);
  for(const outline of r.userData.floorLayout.pieces)assert.equal(outline.length,4,'plan outlines should contain no room triangulation seams');
});
test('300 × 600 mm tiles visibly double the unit count',()=>assert.equal(room({floorUnitWidth:300}).userData.floorLayout.pieceCount,8));
test('4 mm joints reveal grout rather than a wood-colored underlay',()=>{
  const r=room({floorGap:4,floorGroutColor:'#ff0088'});
  close(area(r),4*.596*.596);
  const base=r.getObjectByName('room-floor');assert.equal(base.material.userData.kind,'floor-grout');assert.equal(base.material.color.getHexString(),'ff0088');
});
test('surface receives chosen neutral color without wood tint variation',()=>{
  const r=room({floorColor:'#ffffff'});assert.equal(surface(r).material.color.getHexString(),'ffffff');assert.equal(surface(r).material.userData.kind,'floor:tile');
});
test('UVs are measured in local metres, not normalized per tile',()=>{
  const r=room({floorGap:4});const uv=surface(r).geometry.attributes.uv;
  for(let i=0;i<uv.count;i++){assert.ok(uv.getX(i)>=.00199&&uv.getX(i)<=.59801);assert.ok(uv.getY(i)>=.00199&&uv.getY(i)<=.59801);}
});
test('staggered tiles create half-width end cuts and retain full coverage',()=>{
  const r=room({floorPattern:'staggered'});assert.equal(r.userData.floorLayout.pieceCount,5);close(area(r),1.44);
});
test('legacy tile and herringbone material IDs still infer correct layouts',()=>{
  assert.equal(room({floorType:undefined,floorMaterial:'terrazzo_tiles'}).userData.floorLayout.type,'tile');
  assert.equal(room({floorType:undefined,floorPattern:undefined,floorMaterial:'herringbone_parquet'}).userData.floorLayout.pattern,'herringbone');
});
test('tile herringbone request normalizes to straight paving',()=>assert.equal(room({floorPattern:'herringbone'}).userData.floorLayout.pattern,'straight'));
test('true herringbone has orthogonal plank directions and exact coverage',()=>{
  const r=room({floorType:'plank',floorPattern:'herringbone',floorUnitWidth:180,floorUnitLength:1200});
  close(area(r),1.44);
  const angles=new Set(surface(r).userData.floorUnits.map(u=>u.angle.toFixed(5)));assert.equal(angles.size,2);
  for(let x=.073;x<1.2;x+=.113)for(let z=.041;z<1.2;z+=.127)assert.equal(coverage(r,x,z),1,`overlap/gap at ${x}, ${z}`);
});
test('herringbone tiles arbitrary aspect ratios without overlaps',()=>{
  for(const [width,length] of [[200,600],[250,640],[80,1500],[400,400]]){
    const r=room({floorType:'plank',floorPattern:'herringbone',floorUnitWidth:width,floorUnitLength:length});close(area(r),1.44);
    for(let x=.073;x<1.2;x+=.213)for(let z=.041;z<1.2;z+=.227)assert.equal(coverage(r,x,z),1,`${width} × ${length} overlap/gap at ${x}, ${z}`);
  }
});
test('reversed plank dimensions stay literal in staggered and herringbone paving',()=>{
  for(const pattern of ['staggered','herringbone'])for(const [width,length] of [[600,180],[640,250],[1500,80],[2000,80]]){
    const r=room({floorType:'plank',floorPattern:pattern,floorUnitWidth:width,floorUnitLength:length});
    close(r.userData.floorLayout.unitWidth,width);close(r.userData.floorLayout.unitLength,length);close(area(r),1.44);
    for(const unit of surface(r).userData.floorUnits){close(unit.width,width/1000);close(unit.length,length/1000);}
    for(let x=.073;x<1.2;x+=.213)for(let z=.041;z<1.2;z+=.227)assert.equal(coverage(r,x,z),1,`${pattern}, ${width} × ${length} overlap/gap at ${x}, ${z}`);
  }
});
test('concave room crops units exactly, including re-entrant corner',()=>{
  const r=room({vertices:[[0,0],[2000,0],[2000,1000],[1000,1000],[1000,2000],[0,2000]],floorType:'plank',floorPattern:'herringbone',floorUnitWidth:180,floorUnitLength:1200});close(area(r),3);
  assert.equal(coverage(r,1.567,1.765),0);assert.equal(coverage(r,.567,1.765),1);assert.equal(coverage(r,1.567,.765),1);
});
test('shared plan contours cover exactly the same clipped surface as 3D',()=>{
  const r=room({vertices:[[0,0],[2000,0],[2000,1000],[1000,1000],[1000,2000],[0,2000]],floorType:'plank',floorPattern:'herringbone',floorUnitWidth:180,floorUnitLength:1200,floorGap:2});
  const contourArea=r.userData.floorLayout.pieces.reduce((total,outline)=>total+Math.abs(outline.reduce((sum,p,i)=>{const q=outline[(i+1)%outline.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2,0);
  close(contourArea,area(r));
});
test('clockwise and counterclockwise room outlines have matching coverage',()=>{
  const a=room({vertices:[[0,0],[1200,0],[1200,1200],[0,1200]]});
  const b=room({vertices:[[0,1200],[1200,1200],[1200,0],[0,0]]});close(area(a),area(b));
});
test('grout gaps reduce herringbone surface area while keeping positive geometry',()=>{
  const r=room({floorType:'plank',floorPattern:'herringbone',floorUnitWidth:180,floorUnitLength:1200,floorGap:4});assert.ok(area(r)>1.35&&area(r)<1.44);
  const n=surface(r).geometry.attributes.normal;for(let i=0;i<n.count;i++)assert.ok(n.getY(i)>.99);
});
console.log(`${checks} floor geometry checks passed`);
