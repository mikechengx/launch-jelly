/**
 * Sunroom's editable, brand-neutral, procedural furniture library.
 * Dimensions are millimetres. Prices are design-budget examples, NOT offers.
 * A real product must keep its verified SKU dimensions instead of being stretched.
 */
export const CATALOG_PRICE_NOTE = '以下价格仅为方案示意预算，非真实商品报价，不代表在售、库存或安装费用。';

const entry = (id, label, category, w, d, h, price, storageRatio, color, material, description, extras = {}) => ({
  id, label, category, w, d, h, price, storageRatio, color, material,
  description: `${description} 预算仅为示意，非真实报价。`,
  ...extras,
});

export const CATALOG = [
  entry('bed', '软包双人床', 'bed', 1650, 2150, 1050, 2200, 0, '#b7b098', 'fabric', '可调床宽、床长和床头高度；带分层床垫、床品及软包缝线。'),
  entry('bed-single', '紧凑单人床', 'bed', 1050, 2050, 920, 1300, 0, '#b7c0b0', 'fabric', '适合次卧与小房间，保留床侧通道后再调整桌柜。'),
  entry('bed-storage', '抽屉收纳床', 'bed', 1550, 2100, 1000, 2600, 0.18, '#c6ae8b', 'wood', '床下双抽屉，开启空间需额外预留；收纳量为参数估算。'),
  entry('wardrobe', '平开门衣柜', 'storage', 1600, 600, 2200, 2900, 0.66, '#d9d5c9', 'wood', '四门分格与细长把手，检查柜门开启范围及顶部余量。'),
  entry('wardrobe-sliding', '移门衣柜', 'storage', 1800, 620, 2300, 3400, 0.64, '#b6aa93', 'wood', '双移门、底轨及木质边框，适合正面净距较小的空间。'),
  entry('low-cabinet', '低矮边柜', 'storage', 1400, 400, 780, 1150, 0.59, '#bd956e', 'wood', '细腿、抽屉与分门柜体，可作客厅或餐区补充收纳。'),
  entry('bookcase', '开放书架', 'storage', 850, 320, 1850, 980, 0.50, '#bc9a72', 'wood', '多层开放格与少量示意书籍；高柜应按实际条件固定。'),
  entry('bedside', '床头小柜', 'storage', 450, 400, 520, 350, 0.43, '#c9b08b', 'wood', '两只抽屉与细把手，顶面可放阅读灯和随手物品。'),
  entry('shoe-cabinet', '玄关薄鞋柜', 'storage', 900, 320, 1080, 880, 0.48, '#d9d6cb', 'wood', '较薄柜身与三层翻门轮廓；选购前须核对实际鞋长。'),
  entry('dresser', '六斗抽屉柜', 'storage', 1200, 450, 820, 1450, 0.55, '#9c7353', 'wood', '六只抽屉、圆角顶板与木脚，用抽屉前方净距评估可用性。'),
  entry('wall-shelf', '落地格架', 'storage', 1100, 280, 1450, 650, 0.46, '#b7a180', 'wood', '轻型开放分格，可作书架、展示架与小物收纳。'),
  entry('storage-box', '带盖收纳箱', 'storage', 550, 400, 350, 99, 0.72, '#c7baa3', 'plastic', '带叠放盖、侧提手与标签位；实际承重需查商品规格。'),
  entry('desk', '抽屉书桌', 'work', 1200, 600, 750, 980, 0.10, '#c9ae85', 'wood', '带薄抽屉、细腿与走线孔；桌面深度可按设备调整。'),
  entry('desk-corner', '转角工作桌', 'work', 1500, 1200, 750, 1600, 0.08, '#bda17d', 'wood', 'L 形双面工作区，适合墙角；占地按真实 L 形轮廓估算。'),
  entry('chair', '人体工学转椅', 'seating', 650, 650, 1080, 1100, 0, '#66736e', 'fabric', '网感靠背、扶手与五爪脚；需为后退和转身留出活动范围。'),
  entry('dining-chair', '木质餐椅', 'seating', 480, 520, 800, 360, 0, '#b7926e', 'wood', '弯曲靠背、软垫座面和横撑，适用于餐桌或小书桌。'),
  entry('sofa', '三人布艺沙发', 'seating', 2100, 880, 820, 3600, 0, '#c4baa4', 'fabric', '分块坐垫、靠垫与滚边细节，可调整成适合房间的宽度。'),
  entry('loveseat', '双人小沙发', 'seating', 1450, 820, 800, 2300, 0, '#99aaa1', 'fabric', '紧凑双坐垫、细木脚，适合租房客厅和阅读角。'),
  entry('bench', '玄关换鞋凳', 'seating', 900, 350, 460, 450, 0.12, '#b7a07d', 'wood', '软垫长凳与下层隔板，适合玄关临时坐靠及少量收纳。'),
  entry('side-table', '圆角小边几', 'table', 500, 450, 500, 330, 0.08, '#ba8f66', 'wood', '圆角双层桌板和四脚，适合床边、沙发边。'),
  entry('dining-table', '四人餐桌', 'table', 1300, 750, 750, 1500, 0, '#b58a61', 'wood', '圆角长方桌面、木纹与内收桌腿；椅子单独布置。'),
  entry('round-table', '圆形餐桌', 'table', 950, 950, 750, 1350, 0, '#d1c4ad', 'wood', '圆桌与中柱底座；桌面按宽深生成椭圆，不强行限制方形。'),
  entry('rug', '编织地毯', 'decor', 1800, 2400, 12, 480, 0, '#bfb39e', 'rug', '低矮织物层、包边与细密织纹，可作为分区参照。'),
  entry('floor-lamp', '暖光落地灯', 'light', 420, 420, 1550, 480, 0, '#d8cfb8', 'metal', '布罩、细杆、配重底盘与柔暖灯芯，适合阅读角。'),
  entry('plant', '室内阔叶绿植', 'decor', 550, 550, 1250, 180, 0, '#68815e', 'leaf', '陶盆、土层、枝干与层次叶片；生长适宜性需结合真实环境。'),
  entry('mirror', '落地穿衣镜', 'decor', 550, 180, 1650, 320, 0, '#c6ac87', 'wood', '细边框与后支架；金属镜面为环境反射示意。'),
  entry('divider', '木格栅屏风', 'decor', 1000, 220, 1750, 780, 0, '#a38361', 'wood', '通透竖格栅与两只支脚，划分工作、休息区域。'),
  entry('clothes-rack', '开放挂衣架', 'storage', 1000, 450, 1550, 260, 0.05, '#878c80', 'metal', '细管挂架、下层置物板与衣架，适合租房临时收纳。'),
  entry('floating-shelf', '实木悬浮层板', 'wall', 800, 220, 160, 160, 0.34, '#c4a379', 'wood', '木质层板、细金属托架与示意书籍，释放桌面；需核对墙体及固定件承载。', { mount: 'wall', install: 'screw', y: 1350 }),
  entry('pegboard', '洞洞板收纳组合', 'wall', 650, 150, 650, 260, 0.16, '#d0b994', 'wood', '真实通孔木板，配挂钩、小篮和笔筒；常用小物竖向收纳，固定方式须按墙体选择。', { mount: 'wall', install: 'screw', y: 1050 }),
  entry('wall-cabinet', '双门挂墙储物柜', 'wall', 900, 320, 680, 980, 0.64, '#c6ab84', 'wood', '独立木板柜体、双门、层板与细把手；计入悬挂收纳，不占地面，需可靠固定。', { mount: 'wall', install: 'screw', y: 1450 }),
  entry('hook-rail', '木底五联挂钩', 'wall', 600, 80, 140, 89, 0, '#b78d62', 'wood', '圆角木底板和五只金属弯钩，适合钥匙、轻便包及常用衣物。', { mount: 'wall', install: 'screw', y: 1450 }),
  entry('entry-organizer', '玄关随手收纳站', 'wall', 600, 180, 340, 230, 0.24, '#bd9b72', 'wood', '信件槽、托盘、小镜面和钥匙钩组合，让进门随手物品各有位置。', { mount: 'wall', install: 'screw', y: 1000 }),
  entry('wall-rail', '厨房挂杆与小篮', 'wall', 800, 160, 300, 190, 0.18, '#768076', 'metal', '金属横杆、S 钩和开放小篮，适合厨房或工作区；避开门窗与既有管线。', { mount: 'wall', install: 'screw', y: 1250 }),
  entry('no-drill-rack', '免打孔浴室置物架', 'wall', 450, 150, 260, 99, 0.32, '#deddd2', 'metal', '双贴片、护栏托盘与示意瓶罐；仅适用于商品说明允许的平整基面，承重以实物为准。', { mount: 'wall', install: 'no-drill', y: 1100 }),
  entry('towel-rail', '免打孔毛巾挂杆', 'wall', 600, 90, 200, 69, 0, '#9c9f92', 'metal', '双固定座、细横杆与柔软折叠毛巾，适合轻量收纳；黏贴条件需核对实际墙面。', { mount: 'wall', install: 'no-drill', y: 1100 }),
  entry('rolling-cart', '三层带轮收纳车', 'utility', 450, 350, 780, 220, 0.35, '#a2b4a2', 'metal', '三层护栏托盘、推手、四只脚轮和少量示意小物，能随生活动线移动。', { mount: 'floor', install: 'no-drill', y: 0 }),
  entry('slim-cart', '窄缝带轮收纳车', 'utility', 200, 550, 850, 160, 0.40, '#ded8c9', 'metal', '细长三层车体、提手与脚轮；留出抽出方向，避免仅按静态缝隙宽度判断可用。', { mount: 'floor', install: 'no-drill', y: 0 }),
  entry('laundry-basket', '可移动布艺洗衣篮', 'utility', 420, 360, 600, 120, 0.64, '#b8ad95', 'fabric', '开口布袋、支撑框、织带提手与少量衣物；放在衣柜或洗衣区旁便于分类。', { mount: 'floor', install: 'no-drill', y: 0 }),
  entry('cable-tray', '桌边墙面理线槽', 'wall', 600, 120, 120, 79, 0.12, '#6c746d', 'metal', '开放线篮、固定耳、示意插排和束线，整理桌下墙边线材；实际安装遵从配件说明。', { mount: 'wall', install: 'screw', y: 530 }),
];

export const CATEGORY_LABELS = {
  bed: '床与休息', storage: '柜与收纳', work: '书桌办公',
  seating: '椅与沙发', table: '桌与边几', decor: '软装绿植', light: '灯具照明',
  wall: '挂墙收纳', utility: '实用工具',
};
