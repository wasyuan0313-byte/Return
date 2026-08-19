import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = (await fs.readFile(new URL('./app.js', import.meta.url), 'utf8'))
  .replace(/\ninitialize\(\);\s*$/, '\n')
  + `\n;globalThis.__appTest = {
      spaceCode, permissionCodeFromSuffix, buildReportLocations, aggregateFeedback, exportRow,
      SPACE_HOTSPOTS, selectedSpots, reportItems, renderHotspots, renderSelection,
      setDb(value) { db = value; },
      setPicked(ids) { pickedSpotIds = new Set(ids); },
    };`;

const domElements = new Map();
const document = {
  getElementById(id) {
    if (!domElements.has(id)) domElements.set(id, { innerHTML: '', textContent: '', value: '' });
    return domElements.get(id);
  },
};
const context = vm.createContext({
  console,
  URL,
  Headers,
  document,
  setTimeout,
  clearTimeout,
  localStorage: { getItem: () => '', setItem: () => {}, removeItem: () => {} },
});
vm.runInContext(source, context, { filename: 'app.js' });
const app = context.__appTest;

assert.equal(app.permissionCodeFromSuffix('001'), 'UG015001');
assert.equal(app.permissionCodeFromSuffix('999'), 'UG015999');
assert.equal(app.permissionCodeFromSuffix('01'), '');
assert.equal(app.permissionCodeFromSuffix('000'), '');
assert.equal(app.permissionCodeFromSuffix('A01'), '');

assert.equal(app.spaceCode('主臥室'), 'I');
assert.equal(app.spaceCode('廚房'), 'K');
assert.equal(app.spaceCode('廁所'), 'B');
assert.equal(app.spaceCode('陽台'), 'Y');
assert.equal(app.spaceCode('客廳'), 'I');

assert.ok(app.SPACE_HOTSPOTS.length >= 140);
assert.equal(new Set(app.SPACE_HOTSPOTS.map((spot) => spot.id)).size, app.SPACE_HOTSPOTS.length);
const a02Toilet = app.SPACE_HOTSPOTS.find((spot) => spot.id === 'A02-B');
assert.deepEqual(
  { room: a02Toilet.room, label: a02Toilet.label, code: a02Toilet.code },
  { room: 'A02', label: '廁所', code: 'B' },
);
assert.equal(app.SPACE_HOTSPOTS.filter((spot) => spot.room === 'A04' && spot.code === 'B').length, 2);
assert.equal(app.SPACE_HOTSPOTS.filter((spot) => spot.room === 'A05' && spot.code === 'B').length, 2);
assert.ok(app.SPACE_HOTSPOTS.filter((spot) => spot.room === 'A31').every((spot) => spot.correctedLabel));
app.setPicked(['A02-I1', 'A02-I2', 'A02-I3', 'A02-B']);
assert.equal(app.selectedSpots().length, 4);
app.renderHotspots();
app.renderSelection();
assert.match(document.getElementById('hotspots').innerHTML, /aria-label="選擇 A02 廁所"[^>]*aria-pressed="true"/);
assert.match(document.getElementById('hotspots').innerHTML, /class="space-hotspot corrected [^"]*"[^>]*>\s*<span>A31<br>廁所<\/span>/);
assert.match(document.getElementById('selection').innerHTML, /A02 廁所/);
assert.equal(document.getElementById('selectedCount').textContent, '1 戶／4 區');
const directSelection = app.reportItems();
assert.equal(directSelection.length, 1);
assert.equal(directSelection[0].room, 'A02');
assert.deepEqual(
  [...directSelection[0].spaces.map((space) => space.code)],
  ['I', 'I', 'I', 'B'],
);

const wallMaterials = [
  { name: '063RS12(廁)', category: '磁磚', unit: '箱', planned: 4, sourceCell: 'BU259' },
  { name: 'TF850', category: '黏著劑', unit: '包', planned: 2.6, sourceCell: 'BX259' },
];
const sourceRows = [
  {
    floor: '3', room: 'A01', space: 'B', position: 'W', area: 18.32,
    materials: { '磁磚-壁磚': wallMaterials },
  },
  {
    floor: '3', room: 'A01', space: 'B', position: 'F', area: 3.82,
    materials: { '磁磚-地磚': [{ name: '03H43P(廁)', category: '磁磚', unit: '箱', planned: 1 }] },
  },
  {
    floor: '3', room: 'A02', space: 'I', position: 'I', area: 12.3,
    materials: { 隔音地板: [{ name: 'A膠', category: '隔音地墊', unit: 'kg', planned: 10 }] },
  },
];
app.setDb({ source: sourceRows, reports: [] });
const indoorLocations = app.buildReportLocations('隔音地板', '3', [{
  room: 'A02',
  spaces: [{ label: '主臥室', code: 'I' }, { label: '臥室一', code: 'I' }],
}]);
assert.equal(indoorLocations.length, 1);
assert.equal(indoorLocations[0].position, 'I');
assert.deepEqual([...indoorLocations[0].labels], ['主臥室', '臥室一']);

const location = {
  work: '磁磚-壁磚', floor: '3', room: 'A01', code: 'B', position: 'W', labels: ['廁所'],
};
const makeReport = (date, workers, modelQuantity, glueQuantity) => ({
  id: `${date}-${workers}-${modelQuantity}`,
  date,
  reporter: '測試工程師',
  reporterId: '01',
  floor: '3',
  work: '磁磚-壁磚',
  workers,
  items: [{ room: 'A01', spaces: [{ label: '廁所', code: 'B' }] }],
  locations: [location],
  materials: [
    {
      name: '063RS12(廁)', category: '磁磚', unit: '箱', qty: modelQuantity,
      allocations: [{ ...location, qty: modelQuantity }],
    },
    {
      name: 'TF850', category: '黏著劑', unit: '包', qty: glueQuantity,
      allocations: [{ ...location, qty: glueQuantity }],
    },
  ],
  note: '',
});
app.setDb({
  source: sourceRows,
  reports: [
    makeReport('2026-08-05', 1, 1, 1.2),
    makeReport('2026-08-05', 0.5, 1, 0.8),
    makeReport('2026-08-06', 2, 1, 1),
  ],
});
const groups = app.aggregateFeedback();
assert.equal(groups.length, 1);
assert.equal(groups[0].dates.size, 2);
assert.equal(groups[0].workers, 3.5);
assert.equal(groups[0].area, 18.32);
const row = app.exportRow(groups[0]);
assert.equal(row.length, 24);
assert.equal(row[0], '壁磚');
assert.equal(row[4], 'B');
assert.equal(row[5], 'W');
assert.equal(row[6], 2);
assert.equal(row[12], '063RS12(廁)');
assert.equal(row[13], 3);
assert.equal(row[14], 3);

console.log('OK: app aggregation, space mapping, position and export-column tests passed');
