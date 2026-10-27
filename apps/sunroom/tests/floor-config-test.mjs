import assert from 'node:assert/strict';
import { normalizeFloorStructure } from '../src/floor-config.js';
import { initialProject, normalizeStructure, rectangle, validateProject } from '../src/domain.js';

let passed = 0;
const test = (name, fn) => {
  fn(); passed++;
  console.log(`✓ ${name}`);
};
const config = patch => normalizeFloorStructure({ floorMaterial: 'wood_floor', ...patch });
const strict = patch => normalizeFloorStructure({ floorMaterial: 'wood_floor', ...patch }, { strict: true });

test('legacy wooden floor gets plank dimensions and a neutral wood base colour', () => {
  const s = config({});
  assert.deepEqual([s.floorType, s.floorUnitWidth, s.floorUnitLength, s.floorColor], ['plank', 180, 1200, '#c8bda7']);
});
test('all legacy stone and tile identifiers migrate to tiles', () => {
  for (const id of ['floor_tiles_04', 'marble_01', 'stone', 'terrazzo_tiles', 'granite_tile', 'concrete']) {
    const s = config({ floorMaterial: id });
    assert.deepEqual([s.floorType, s.floorUnitWidth, s.floorUnitLength, s.floorColor], ['tile', 600, 600, '#d5d8d6']);
  }
});
test('legacy object material identifiers also migrate', () => {
  assert.equal(config({ floorMaterial: { type: 'marble_01' } }).floorType, 'tile');
});
test('explicit floor type overrides a legacy texture category', () => {
  assert.equal(config({ floorMaterial: 'wood_floor', floorType: 'tile' }).floorType, 'tile');
  assert.equal(config({ floorMaterial: 'marble_01', floorType: 'plank' }).floorType, 'plank');
});
test('pure white remains pure white instead of meaning the original texture colour', () => {
  assert.equal(config({ floorColor: '#ffffff' }).floorColor, '#ffffff');
  assert.equal(strict({ floorColor: '#FFFFFF' }).floorColor, '#FFFFFF');
});
test('all explicit floor settings survive unchanged when valid', () => {
  const source = { floorType: 'tile', floorUnitWidth: 300, floorUnitLength: 600, floorPattern: 'staggered', floorGap: 3, floorGroutColor: '#102030', floorFinish: 'polished', floorColor: '#ffffff' };
  const s = strict(source);
  for (const key of Object.keys(source)) assert.equal(s[key], source[key]);
});
test('normalization mutates and returns the original structure', () => {
  const s = {};
  assert.equal(normalizeFloorStructure(s), s);
  assert.equal(s.floorType, 'plank');
});
test('valid numeric values clamp to physical bounds even in strict mode', () => {
  const s = strict({ floorUnitWidth: -20, floorUnitLength: 9000, floorGap: 40 });
  assert.deepEqual([s.floorUnitWidth, s.floorUnitLength, s.floorGap], [80, 3000, 10]);
  const t = strict({ floorUnitWidth: 3000, floorUnitLength: -10, floorGap: -2 });
  assert.deepEqual([t.floorUnitWidth, t.floorUnitLength, t.floorGap], [2000, 80, 0]);
});
test('grout width uses the shorter of both tile edges and has a 12 mm maximum', () => {
  assert.equal(config({ floorUnitWidth: 600, floorUnitLength: 80, floorGap: 12 }).floorGap, 10);
  assert.equal(config({ floorUnitWidth: 600, floorUnitLength: 600, floorGap: 20 }).floorGap, 12);
});
test('tiles do not accept a herringbone layout while planks do', () => {
  assert.equal(strict({ floorType: 'tile', floorPattern: 'herringbone' }).floorPattern, 'straight');
  assert.equal(strict({ floorType: 'plank', floorPattern: 'herringbone' }).floorPattern, 'herringbone');
});
test('strict mode rejects invalid enum values and enum types', () => {
  for (const patch of [{ floorType: 'carpet' }, { floorType: null }, { floorPattern: 'zigzag' }, { floorPattern: 1 }, { floorFinish: 'mirror' }, { floorFinish: false }]) assert.throws(() => strict(patch));
});
test('strict mode rejects strings, nulls and nonfinite numbers for dimensions', () => {
  for (const key of ['floorUnitWidth', 'floorUnitLength', 'floorGap']) {
    for (const value of ['600', null, false, undefined, NaN, Infinity, -Infinity]) assert.throws(() => strict({ [key]: value }));
  }
});
test('strict mode rejects malformed floor and grout colours', () => {
  for (const key of ['floorColor', 'floorGroutColor']) {
    for (const value of ['white', '#fff', '#12345g', '#12345678', 0xffffff, null, undefined]) assert.throws(() => strict({ [key]: value }));
  }
});
test('non-strict normalization repairs invalid imported decoration fields', () => {
  const s = config({ floorType: 'unknown', floorUnitWidth: '600', floorUnitLength: null, floorGap: NaN, floorColor: 'brown', floorPattern: 'bad', floorFinish: 'bad', floorGroutColor: 'bad' });
  assert.deepEqual([s.floorType, s.floorUnitWidth, s.floorUnitLength, s.floorGap, s.floorColor, s.floorPattern, s.floorFinish, s.floorGroutColor], ['plank', 180, 1200, 2, '#c8bda7', 'straight', 'matte', '#b8bcb9']);
});
test('structure normalization applies floor settings without removing other data', () => {
  const s = { vertices: rectangle(5000, 4200), height: 2800, wallThickness: 120, doors: [], windows: [], floorType: 'tile', floorUnitWidth: 60, marker: 'keep' };
  normalizeStructure(s);
  assert.equal(s.floorUnitWidth, 80);
  assert.equal(s.floorUnitLength, 600);
  assert.equal(s.marker, 'keep');
});
test('new sample room starts with a 600 mm matte grey tile floor', () => {
  const s = initialProject().structure;
  assert.deepEqual([s.floorType, s.floorUnitWidth, s.floorUnitLength, s.floorPattern, s.floorGap, s.floorGroutColor, s.floorFinish, s.floorColor], ['tile', 600, 600, 'straight', 2, '#b8bcb9', 'matte', '#d9dddb']);
});
test('project import rejects every invalid floor setting instead of silently replacing it', () => {
  for (const patch of [{ floorType: 'invalid' }, { floorPattern: 'invalid' }, { floorFinish: 'invalid' }, { floorUnitWidth: '600' }, { floorUnitLength: null }, { floorGap: false }, { floorColor: '#fff' }, { floorGroutColor: 'grey' }]) {
    const p = initialProject(); Object.assign(p.structure, patch);
    assert.throws(() => validateProject(p));
  }
});
test('project JSON roundtrip retains floor settings and clamps valid out-of-range sizes', () => {
  const p = initialProject();
  Object.assign(p.structure, { floorType: 'plank', floorUnitWidth: 5000, floorUnitLength: 5000, floorGap: 30, floorPattern: 'herringbone', floorFinish: 'satin', floorColor: '#ffffff', floorGroutColor: '#303030' });
  const imported = validateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual([imported.structure.floorUnitWidth, imported.structure.floorUnitLength, imported.structure.floorGap, imported.structure.floorPattern, imported.structure.floorFinish, imported.structure.floorColor, imported.structure.floorGroutColor], [2000, 3000, 12, 'herringbone', 'satin', '#ffffff', '#303030']);
  assert.equal(p.structure.floorUnitWidth, 5000, 'import does not mutate the caller project');
});
test('legacy project JSON without new fields remains importable', () => {
  const p = initialProject();
  for (const key of ['floorType', 'floorUnitWidth', 'floorUnitLength', 'floorGap', 'floorPattern', 'floorFinish', 'floorColor', 'floorGroutColor']) delete p.structure[key];
  p.structure.floorMaterial = 'granite_tile';
  const s = validateProject(p).structure;
  assert.deepEqual([s.floorType, s.floorUnitWidth, s.floorUnitLength, s.floorColor], ['tile', 600, 600, '#d5d8d6']);
});

console.log(`\n${passed} floor configuration tests passed.`);
