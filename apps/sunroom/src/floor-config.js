// Architectural floor settings use millimetres. Colour is the chosen visible
// base colour, independent of the source texture's original colour.
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hex = /^#[0-9a-f]{6}$/i;
const legacyTile = /tile|marble|stone|terrazzo|granite|concrete/i;
const enums = {
  floorType: ['tile', 'plank'],
  floorPattern: ['straight', 'staggered', 'herringbone'],
  floorFinish: ['matte', 'satin', 'polished'],
};
const numeric = ['floorUnitWidth', 'floorUnitLength', 'floorGap'];
const colors = ['floorColor', 'floorGroutColor'];
const labels = {
  floorType: '地面类型', floorPattern: '铺设方式', floorFinish: '表面效果',
  floorUnitWidth: '单块短边', floorUnitLength: '单块长边', floorGap: '接缝宽度',
  floorColor: '地面颜色', floorGroutColor: '接缝颜色',
};

/** Mutates and returns structure. Invalid declared values throw in strict
 * mode; valid numbers outside the allowed range are clamped in either mode.
 * Missing settings migrate from the legacy material ID without changing an
 * existing explicit white base colour.
 */
export function normalizeFloorStructure(s, { strict = false } = {}) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw Error('地面配置无效');
  if (strict) {
    for (const [key, allowed] of Object.entries(enums)) {
      if (has(s, key) && !allowed.includes(s[key])) throw Error(`${labels[key]}无效`);
    }
    for (const key of numeric) {
      if (has(s, key) && !Number.isFinite(s[key])) throw Error(`${labels[key]}需要有效的毫米数值`);
    }
    for (const key of colors) {
      if (has(s, key) && (typeof s[key] !== 'string' || !hex.test(s[key]))) throw Error(`${labels[key]}格式无效`);
    }
  }
  const materialId = typeof s.floorMaterial === 'string' ? s.floorMaterial : s.floorMaterial?.type || '';
  s.floorType = enums.floorType.includes(s.floorType) ? s.floorType : legacyTile.test(materialId) ? 'tile' : 'plank';
  const tile = s.floorType === 'tile';
  s.floorUnitWidth = clamp(Number.isFinite(s.floorUnitWidth) ? s.floorUnitWidth : tile ? 600 : 180, 80, 2000);
  s.floorUnitLength = clamp(Number.isFinite(s.floorUnitLength) ? s.floorUnitLength : tile ? 600 : 1200, 80, 3000);
  s.floorPattern = enums.floorPattern.includes(s.floorPattern) ? s.floorPattern : 'straight';
  if (tile && s.floorPattern === 'herringbone') s.floorPattern = 'straight';
  const shortSide = Math.min(s.floorUnitWidth, s.floorUnitLength);
  s.floorGap = clamp(Number.isFinite(s.floorGap) ? s.floorGap : 2, 0, Math.min(12, shortSide / 8));
  s.floorColor = typeof s.floorColor === 'string' && hex.test(s.floorColor) ? s.floorColor : tile ? '#d5d8d6' : '#c8bda7';
  s.floorGroutColor = typeof s.floorGroutColor === 'string' && hex.test(s.floorGroutColor) ? s.floorGroutColor : '#b8bcb9';
  s.floorFinish = enums.floorFinish.includes(s.floorFinish) ? s.floorFinish : 'matte';
  return s;
}
