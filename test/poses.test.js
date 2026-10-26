'use strict';

/**
 * Stick-figure animations: the rigid-skeleton engine (lib/stick-figure.js) and every
 * content/**\/*.poses.json file. Pure; needs nothing installed.
 *
 * The rule this enforces: every body part stays connected and every bone keeps its length,
 * at the keyframes AND in between, for the main figure and the partner. The old format stored
 * an x/y per joint and limbs detached; that cannot be written in v2.
 *
 * Run: node --test test/poses.test.js
 * Preview: node scripts/poses.mjs --sheet /tmp/sheet.png
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');

const SF = require('../lib/stick-figure.js');
const content = path.join(__dirname, '..', 'content');

function walk(d) {
  return fs.readdirSync(d).flatMap((n) => {
    const p = path.join(d, n);
    return fs.statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const all = walk(content);
const poseFiles = all.filter((f) => f.endsWith('.poses.json'));
const techniques = all.filter((f) => f.endsWith('.md'));
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const rel = (f) => path.relative(content, f);

const BONES = [
  ['hip', 'neck', 'torso'], ['neck', 'head', 'head'],
  ['shoulderL', 'elbowL', 'upperArm'], ['elbowL', 'handL', 'forearm'],
  ['shoulderR', 'elbowR', 'upperArm'], ['elbowR', 'handR', 'forearm'],
  ['hipL', 'kneeL', 'thigh'], ['kneeL', 'ankleL', 'shin'], ['ankleL', 'toeL', 'foot'],
  ['hipR', 'kneeR', 'thigh'], ['kneeR', 'ankleR', 'shin'], ['ankleR', 'toeR', 'foot'],
];
function assertConnected(jt, where) {
  for (const [a, b, len] of BONES) {
    const d = Math.hypot(jt[a].x - jt[b].x, jt[a].y - jt[b].y);
    assert.ok(Math.abs(d - SF.LEN[len]) < 1e-6, `${where}: ${a}->${b} is ${d.toFixed(3)}, should be ${SF.LEN[len]}`);
  }
}

test('there are pose files, and none is in the old v1 format', () => {
  assert.ok(poseFiles.length >= 32, `found ${poseFiles.length}`);
  const v1 = poseFiles.filter((f) => load(f).version !== 2 || load(f).frames.some((fr) => fr.joints));
  assert.deepStrictEqual(v1.map(rel), []);
});

test('every pose file passes connection, joint-limit, floor and must-move rules', () => {
  const bad = [];
  for (const f of poseFiles) {
    const errs = SF.validate(load(f));
    if (errs.length) bad.push(`${rel(f)}:\n    ${errs.join('\n    ')}`);
  }
  assert.deepStrictEqual(bad, [], bad.join('\n'));
});

test('every bone keeps its length throughout every animation, pins and anchors included, partner too', () => {
  for (const f of poseFiles) {
    const data = load(f);
    const frames = SF.resolveFrames(data);
    const view = data.view || 'side';
    frames.forEach((fr, i) => {
      const nx = SF.nextOf(frames, i);
      for (let s = 0; s <= 10; s++) {
        const st = SF.blend(fr, nx, s / 10, view);
        assertConnected(SF.solve(st.pose, view), `${rel(f)} frame ${i} t=${s / 10}`);
        if (st.partner) assertConnected(SF.solve(st.partner, view), `${rel(f)} partner frame ${i} t=${s / 10}`);
      }
    });
  }
});

test('every technique page has a pose file and every pose file has a technique page', () => {
  const pages = techniques.map((f) => f.replace(/\.md$/, ''));
  const poses = poseFiles.map((f) => f.replace(/\.poses\.json$/, ''));
  assert.deepStrictEqual(pages.filter((p) => !poses.includes(p)).map(rel), [], 'technique pages without an animation');
  assert.deepStrictEqual(poses.filter((p) => !pages.includes(p)).map(rel), [], 'pose files without a technique page');
});

test('every technique page that expects an animation has a valid pose', () => {
  // A page expects one unless its frontmatter says `animation: false`.
  const missing = [];
  for (const md of techniques) {
    const fm = matter(fs.readFileSync(md, 'utf8')).data;
    if (fm.animation === false) continue;
    const pf = md.replace(/\.md$/, '.poses.json');
    if (!fs.existsSync(pf)) { missing.push(`${rel(md)}: no pose file`); continue; }
    const errs = SF.validate(load(pf));
    if (errs.length) missing.push(`${rel(md)}: ${errs[0]}`);
  }
  assert.deepStrictEqual(missing, []);
});

test('every frame is labelled, so the viewer never shows "Frame N" for a shipped technique', () => {
  const bad = [];
  for (const f of poseFiles) load(f).frames.forEach((fr, i) => { if (!fr.label) bad.push(`${rel(f)} frame ${i}`); });
  assert.deepStrictEqual(bad, []);
});

test('the timeline the viewer and GIF exporter use covers the whole loop and renders every frame', () => {
  for (const f of poseFiles) {
    const data = load(f);
    const tl = SF.timeline(data);
    assert.strictEqual(tl.total, data.frames.reduce((s, fr) => s + fr.duration, 0), rel(f));
    data.frames.reduce((acc, fr, i) => {
      assert.strictEqual(tl.at(acc + 1).index, i, `${rel(f)} t=${acc + 1}`);
      return acc + fr.duration;
    }, 0);
    assert.match(tl.at(0).html, /<circle/, rel(f));
  }
});

// Negative controls: the rules must reject the defects they are there for, or a green run says nothing.
const STAND = { torso: 180, head: 180, upperArmL: 0, forearmL: 0, upperArmR: 0, forearmR: 0,
  thighL: 0, shinL: 0, footL: 90, thighR: 0, shinR: 0, footR: 90 };
const anim = (a, b, extra) => ({ version: 2, title: 't', anchor: { joint: 'ankleL', x: 50, y: 90 },
  frames: [{ duration: 500, pose: { ...STAND, ...a } }, { duration: 500, pose: b }], ...extra });

test('validator rejects a knee bent backwards', () => {
  assert.ok(SF.validate(anim({}, { thighL: -20, shinL: 30 })).some((e) => /knee.*backwards/.test(e)));
});
test('validator rejects an elbow bent backwards', () => {
  assert.ok(SF.validate(anim({}, { upperArmL: 0, forearmL: -60 })).some((e) => /elbow.*backwards/.test(e)));
});
test('validator rejects a figure that does not move', () => {
  assert.ok(SF.validate(anim({}, { forearmL: 3 })).some((e) => /does not move/.test(e)));
});
test('validator rejects a floating figure unless told it is airborne', () => {
  const up = (air) => ({ version: 2, title: 't', frames: [
    { duration: 500, pose: { ...STAND, root: { x: 50, y: 50 } } },
    { duration: 500, air, pose: { root: { x: 50, y: 40 } } }] });
  assert.ok(SF.validate(up(false)).some((e) => /floating/.test(e)));
  assert.deepStrictEqual(SF.validate(up(true)), []);
});
test('validator rejects a limb through the floor', () => {
  const naive = { version: 2, title: 't', frames: [
    { duration: 500, pose: { ...STAND, root: { x: 50, y: 50 } } },
    { duration: 500, pose: { root: { x: 40.1, y: 71 }, thighL: 85, shinL: -30, thighR: 85, shinR: -30, torso: 140 } }] };
  assert.ok(SF.validate(naive).some((e) => /through the floor/.test(e)));
});
test('the partner is held to the same rules as the main figure', () => {
  const ok = anim({}, { forearmL: 60, upperArmL: 20 });
  const withPartner = (pp) => ({ ...ok, frames: ok.frames.map((fr) => ({ ...fr,
    partner: { pose: fr === ok.frames[0] ? { ...STAND, root: { x: 30, y: 50 } } : pp, anchor: fr === ok.frames[0] ? { joint: 'ankleL', x: 30, y: 90 } : undefined } })) });
  assert.deepStrictEqual(SF.validate(withPartner({})), []);
  assert.ok(SF.validate(withPartner({ thighL: -20, shinL: 30 })).some((e) => /^partner: .*knee.*backwards/.test(e)));
});
