// Equipment vocabulary drift guard.
//
// octopus-health owns the estate's one equipment list (content/equipment/catalogue.json,
// stable ids). mma's only equipment vocabulary is what its stick figures can hold
// (holdHTML in lib/stick-figure.js: dumbbell, barbell, kettlebell, ball). mma does not
// call health at runtime - the figures render in the browser from static data - so it
// carries lib/equipment-ids.json, a snapshot of the ids, and this test fails if a hold
// is not a canonical id (a rename in one place only) or the snapshot has gone stale
// against a sibling health checkout.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'equipment-ids.json'), 'utf8'));

function holds() {
  const src = fs.readFileSync(path.join(root, 'lib', 'stick-figure.js'), 'utf8');
  const body = src.slice(src.indexOf('function holdHTML'));
  const end = body.indexOf('\n  }\n');
  return [...body.slice(0, end).matchAll(/case '([a-z-]+)'/g)].map(m => m[1]);
}

test('every stick-figure hold is a canonical equipment id', () => {
  const h = holds();
  assert.ok(h.length >= 3, 'found the holds: ' + h.join(','));
  const ids = new Set(snap.ids);
  for (const x of h) assert.ok(ids.has(x), `hold "${x}" is not an id in the health catalogue snapshot`);
});

test('snapshot ids are unique, kebab-case', () => {
  assert.strictEqual(new Set(snap.ids).size, snap.ids.length);
  for (const id of snap.ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('the snapshot matches a sibling octopus-health checkout when one has the catalogue', (t) => {
  const p = path.join(root, '..', 'octopus-health', 'content', 'equipment', 'catalogue.json');
  if (!fs.existsSync(p)) return t.skip('no sibling octopus-health catalogue on this machine');
  const live = JSON.parse(fs.readFileSync(p, 'utf8')).items.map(i => i.id);
  assert.deepStrictEqual([...snap.ids].sort(), [...live].sort(), 'update lib/equipment-ids.json from health');
});
