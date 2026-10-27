// Furniture finishes are intentionally separate from architectural surfaces.
// A cabinet is board / veneer / lacquer, never an arbitrary floor stone texture.
const finish=(id,label,color,group,textureRef=null,roughness=.62)=>({id,label,color,group,textureRef,roughness});
export const BOARD_FINISHES=[
 finish('board-oak','浅橡木饰面板','#c5aa7f','木纹板','oak_wood_planks'),
 finish('board-ash','白蜡木饰面板','#dfc9a5','木纹板','plywood'),
 finish('board-walnut','胡桃木饰面板','#78513a','木纹板','dark_wood'),
 finish('board-cherry','樱桃木饰面板','#b47650','木纹板','lacquered_cherry_wood'),
 finish('board-white','纯白 · 烤漆板','#ffffff','烤漆板',null,.32),
 finish('board-cream','奶油 · 双饰面板','#e5d7ba','纯色板'),
 finish('board-greige','燕麦灰 · 双饰面板','#bcb5a6','纯色板'),
 finish('board-sage','鼠尾草绿 · 双饰面板','#a3af93','纯色板'),
 finish('board-blue','雾霭蓝 · 双饰面板','#8ba6b2','纯色板'),
 finish('board-charcoal','炭灰 · 双饰面板','#50554f','纯色板'),
 finish('board-rose','灰粉 · 烤漆板','#c7a6a0','烤漆板',null,.35),
 finish('board-ochre','姜黄 · 烤漆板','#c6a262','烤漆板',null,.35),
 finish('board-rust','陶土 · 烤漆板','#b77960','烤漆板',null,.35),
 finish('board-forest','松林绿 · 烤漆板','#52695c','烤漆板',null,.35),
];
const fabrics=[finish('fabric','亚麻感织物','#c9bea8','布艺','fabric_pattern_05',.93),finish('fabric-sage','鼠尾草织物','#93a18b','布艺','fabric_pattern_07',.94),finish('fabric-blue','雾蓝织物','#859da9','布艺','denim_fabric',.94),finish('fabric-rose','豆沙织物','#c4a29b','布艺','quatrefoil_jacquard_fabric',.94),finish('leather','棕色皮革','#a57651','皮革','brown_leather',.58)];
const metals=[finish('metal','哑光暖白金属','#e2dfd3','金属',null,.54),finish('metal-charcoal','炭黑喷涂金属','#464c47','金属',null,.58),finish('metal-sage','浅绿喷涂金属','#a2b1a0','金属',null,.58),finish('metal-chrome','拉丝不锈钢','#aeb8b7','金属','metal_plate_02',.36)];
const plastics=[finish('plastic','暖白塑料','#e4dfd1','塑料'),finish('plastic-sage','浅绿塑料','#a5b39b','塑料'),finish('plastic-blue','雾蓝塑料','#9bb6bf','塑料'),finish('plastic-charcoal','深灰塑料','#5a615b','塑料')];
const rugs=[finish('rug','燕麦编织','#c7baa2','织物','dirty_carpet',.96),finish('rug-cream','奶白编织','#e5decd','织物','dirty_carpet',.96),finish('rug-sage','浅绿编织','#aab39c','织物','dirty_carpet',.96)];
export const ALL_FINISHES=[...BOARD_FINISHES,...fabrics,...metals,...plastics,...rugs,finish('leaf','自然叶绿','#68815e','植物'),finish('woven','藤编 / 棉麻编织','#c8af81','编织','dirty_carpet',.96)];
export function finishesFor(type,catalog){const t=catalog.find(c=>c.id===type);if(!t)return BOARD_FINISHES;
 if(t.id==='rug')return rugs;
 if(t.id==='plant')return ALL_FINISHES.filter(f=>f.id==='leaf');
 if(t.id==='laundry-basket')return ALL_FINISHES.filter(f=>f.id==='woven').concat(plastics);
 if(t.material==='metal')return metals;
 if(t.material==='plastic')return plastics;
 if(t.material==='fabric')return fabrics;
 return BOARD_FINISHES;
}
export function normalizeFinish(item,catalog){const t=catalog.find(c=>c.id===item.type);if(!t)return item;
 const allowed=finishesFor(item.type,catalog);
 // Migrate old unfiltered material choices without losing dimensions or layout.
 if(!allowed.some(f=>f.id===item.material)){
  const wood=t.material==='wood'||!t.material;
  item.material=wood?'board-oak':allowed[0].id;
 }
 return item;
}
export const isPaintFinish = id => id.startsWith('board-')&&!ALL_FINISHES.find(f=>f.id===id)?.textureRef;
