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
  assert.ok(SF.validate(anim({}, { thighL: -20, shinL: 30 })).some((e) => /knee.*BACKWARDS/.test(e)));
});
test('validator rejects an elbow bent backwards', () => {
  assert.ok(SF.validate(anim({}, { upperArmL: 0, forearmL: -60 })).some((e) => /elbow.*BACKWARDS/.test(e)));
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
  assert.ok(SF.validate(withPartner({ thighL: -20, shinL: 30 })).some((e) => /^partner: .*knee.*BACKWARDS/.test(e)));
});

// ── knees and elbows only fold the right way ─────────────────────────────────
test('a knee that bends backwards fails, a few degrees of hyperextension do not', () => {
  const knee = (thighL, shinL) => SF.validate(anim({}, { thighL, shinL, forearmL: 40 }));
  assert.ok(knee(20, 30).some((e) => /kneeL bends BACKWARDS/.test(e)), 'shin forward of the thigh by 10');
  assert.ok(knee(0, 45).some((e) => /kneeL bends BACKWARDS/.test(e)), 'reverse knee, foot out in front');
  assert.ok(knee(0, 6).some((e) => /kneeL bends BACKWARDS/.test(e)), '6 degrees is over the limit');
  assert.ok(!knee(0, 4).some((e) => /kneeL/.test(e)), '4 degrees of hyperextension is allowed');
  assert.ok(!knee(60, 0).some((e) => /kneeL/.test(e)), 'a normal bend');
});
test('an elbow that bends backwards fails, a few degrees of hyperextension do not', () => {
  const el = (upperArmL, forearmL) => SF.validate(anim({}, { upperArmL, forearmL, thighL: 30, shinL: 0 }));
  assert.ok(el(40, 20).some((e) => /elbowL bends BACKWARDS/.test(e)));
  assert.ok(!el(40, 37).some((e) => /elbowL/.test(e)));
  assert.ok(!el(0, 90).some((e) => /elbowL/.test(e)));
});
test('a pinned foot that steps from a straight leg keeps its knee the right way at EVERY point in between', () => {
  // The straight-punch bug: the back leg is straight at the first keyframe, the pin solver read
  // "straight" as "bends forward", and the knee folded backwards mid-step.
  const stepper = { version: 2, title: 't', anchor: { joint: 'ankleL', x: 40, y: 90 }, pins: ['ankleR'], frames: [
    { duration: 500, pose: { ...STAND, thighL: 28, shinL: -6, thighR: -20.5, shinR: -20.5 } },
    { duration: 500, pose: { thighL: 2, shinL: 2, thighR: 60, shinR: 20 } },
    { duration: 500, pose: { thighR: 28, shinR: -6, thighL: -20.5, shinL: -20.5 } }] };
  assert.deepStrictEqual(SF.validate(stepper), []);
  const fr = SF.resolveFrames(stepper);
  for (let i = 0; i < fr.length; i++) for (let s = 0; s <= 20; s++) {
    const q = SF.between(fr[i], SF.nextOf(fr, i), s / 20, 'side');
    for (const sd of ['L', 'R']) {
      const bend = q['thigh' + sd] - q['shin' + sd];
      assert.ok(bend > -5.01, `frame ${i} t=${s / 20}: knee${sd} thigh-shin = ${bend.toFixed(1)}`);
    }
  }
});
test('every shipped pose has knees and elbows folding the right way at every tween point', () => {
  for (const f of poseFiles) {
    const data = load(f);
    if (data.view === 'front') continue;
    const frames = SF.resolveFrames(data);
    const figs = (st) => (st.partner ? [st.pose, st.partner] : [st.pose]);
    frames.forEach((fr, i) => {
      for (let s = 0; s <= 10; s++) for (const p of figs(SF.blend(fr, SF.nextOf(frames, i), s / 10, 'side'))) {
        for (const sd of ['L', 'R']) {
          const wrap = (a) => ((a + 540) % 360 + 360) % 360 - 180;
          assert.ok(wrap(p['thigh' + sd] - p['shin' + sd]) > -5.01, `${rel(f)} frame ${i} t=${s / 10}: knee${sd} bends backwards`);
          assert.ok(wrap(p['forearm' + sd] - p['upperArm' + sd]) > -5.01, `${rel(f)} frame ${i} t=${s / 10}: elbow${sd} bends backwards`);
        }
      }
    });
  }
});

// ── static poses ─────────────────────────────────────────────────────────────
test('a static pose needs no movement, has exactly one frame, and idles without changing any limb angle', () => {
  const st = { version: 2, title: 't', static: true, anchor: { joint: 'ankleL', x: 50, y: 90 }, frames: [{ duration: 3000, pose: { ...STAND } }] };
  assert.deepStrictEqual(SF.validate(st), []);
  assert.ok(SF.validate({ ...st, static: false, frames: [...st.frames, ...st.frames] }).some((e) => /does not move/.test(e)));
  assert.ok(SF.validate({ ...st, frames: [...st.frames, ...st.frames] }).some((e) => /exactly 1 frame/.test(e)));
  assert.ok(SF.validate({ ...st, idle: 'wobble' }).some((e) => /idle must be/.test(e)));
  const tl = SF.timeline(st), seen = new Set(), lifts = new Set();
  for (let ms = 0; ms < 3000; ms += 100) { const l = SF.idleLift(st, ms); lifts.add(l.toFixed(2)); seen.add(JSON.stringify(SF.blend(tl.frames[0], SF.nextOf(tl.frames, 0), 0, 'side').pose)); assert.match(tl.at(ms).html, /<circle/); }
  assert.strictEqual(seen.size, 1, 'the pose angles never change');
  assert.ok(lifts.size > 3 && Math.max(...lifts) <= 1, 'it breathes a little, never more than a unit');
  assert.ok(SF.idleLift({ ...st, idle: 'bounce' }, 350) > 2 && SF.idleLift({ ...st, idle: 'none' }, 350) === 0);
});
test('the stance files are static and the techniques are not', () => {
  const statics = poseFiles.filter((f) => load(f).static).map(rel).sort();
  for (const must of ['taekwondo/white-belt/attention-stance', 'taekwondo/white-belt/ready-stance', 'taekwondo/white-belt/walking-stance',
    'taekwondo/white-belt/fighting-stance', 'taekwondo/yellow-belt/front-stance', 'taekwondo/yellow-belt/back-stance',
    'boxing/fundamentals/orthodox-stance', 'karate/white-belt/zenkutsu-dachi']) assert.ok(statics.includes(must + '.poses.json'), must);
  assert.ok(!statics.some((f) => /jab|kick|punch|block/.test(f)), statics.join());
});

// ── tweening: hold, then one eased move, loop seam included ─────────────────
test('a key pose is held briefly, the move is eased, and the loop seam is as smooth as any other', () => {
  assert.strictEqual(SF.progress(0, 800), 0);
  assert.strictEqual(SF.progress(100, 800), 0, 'still holding');
  assert.strictEqual(SF.progress(800, 800), 1);
  let prev = 0;
  for (let ms = 0; ms <= 800; ms += 10) { const p = SF.progress(ms, 800); assert.ok(p >= prev); prev = p; }
  assert.ok(SF.progress(460, 800) > 0.4 && SF.progress(460, 800) < 0.6, 'midway through the move is about half way');
  assert.ok(SF.progress(125, 800) < 0.01, 'eases in');
  // the last frame tweens to frame 0 through the same path
  const loop = anim({}, { thighL: 40, shinL: 0, forearmL: 40 });
  const tl = SF.timeline(loop);
  assert.notStrictEqual(tl.at(500 + 300).html, tl.at(500 + 100).html, 'moving back to frame 0 in the second half of the loop');
  assert.strictEqual(tl.at(0).html, tl.at(tl.total).html, 'the loop closes on frame 0');
});

// ── two figures: no body through the other, contacts touch, framing fits both ──
const lyingA = { torso: -90, head: -92, upperArmL: 90, forearmL: 90, upperArmR: 90, forearmR: 90, thighL: 90, shinL: 90, footL: 180, thighR: 90, shinR: 90, footR: 180 };
const duo = (aRoot, pRoot, contacts) => ({ version: 2, title: 't', static: true, frames: [{ duration: 3000, contacts,
  pose: { ...lyingA, root: aRoot }, partner: { air: true, pose: { ...lyingA, root: pRoot } } }] });
test('two torsos laid through each other are rejected, apart they are accepted', () => {
  assert.ok(SF.validate(duo({ x: 50, y: 87 }, { x: 50, y: 87 })).some((e) => /torsos overlap/.test(e)));
  assert.ok(SF.validate(duo({ x: 50, y: 87 }, { x: 60, y: 82 })).some((e) => /torsos overlap/.test(e)), 'one lying across the other');
  assert.deepStrictEqual(SF.validate(duo({ x: 50, y: 87 }, { x: 120, y: 87 })), []);
});
test('a declared contact must touch within its tolerance', () => {
  // partner is mirrored: its pre-mirror root x 40 puts the hip at screen x 60
  const two = (c) => SF.validate(duo({ x: 50, y: 87 }, { x: 40, y: 87 }, c));
  assert.ok(two([{ a: 'hip', b: 'hip' }]).some((e) => /should touch/.test(e)), 'hips are 10 apart, default reach is 9');
  assert.deepStrictEqual(two([{ a: 'hip', b: 'hip', tol: 11 }]), []);
  const apart = (c) => SF.validate({ ...duo({ x: 20, y: 87 }, { x: 5, y: 87 }, c) });
  assert.ok(apart([{ a: 'handL', b: 'headfoo' }]).some((e) => /unknown joint or bone/.test(e)));
  const far = apart([{ a: 'head', b: 'head', tol: 4 }]);
  assert.ok(far.some((e) => /should touch/.test(e)) || far.some((e) => /torsos overlap/.test(e)));
});
test('every partner technique declares at least one contact and they all hold', () => {
  for (const f of poseFiles) {
    const data = load(f);
    if (!data.frames.some((fr) => fr.partner)) continue;
    assert.deepStrictEqual(SF.validate(data), [], rel(f));
  }
});
test('the viewBox of a two-figure pose covers both bodies in every frame, a single figure keeps the standard box', () => {
  assert.strictEqual(SF.viewBoxFor(anim({}, { forearmL: 60 })), SF.VIEWBOX);
  for (const f of poseFiles) {
    const data = load(f);
    if (!data.frames.some((fr) => fr.partner)) continue;
    const [x, y, w, h] = SF.viewBoxFor(data).split(' ').map(Number);
    const frames = SF.resolveFrames(data);
    frames.forEach((fr) => {
      const mine = SF.solve(fr.pose, 'side'), theirs = SF.solve(fr.partner.pose, 'side');
      for (const n of SF.JOINTS) for (const [pt, mx] of [[mine[n], false], [theirs[n], true]]) {
        const px = mx ? 100 - pt.x : pt.x;
        assert.ok(px >= x && px <= x + w && pt.y >= y && pt.y <= y + h, `${rel(f)} ${n} at ${px.toFixed(0)},${pt.y.toFixed(0)} outside ${x},${y},${w},${h}`);
      }
    });
    assert.ok(w / h >= 1.2, `${rel(f)} is a landscape box`);
  }
});
