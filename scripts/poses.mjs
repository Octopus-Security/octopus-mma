#!/usr/bin/env node
// Check and preview the v2 stick-figure animations in content/**/*.poses.json.
//
//   node scripts/poses.mjs                      validate every pose (exit 1 on any problem)
//   node scripts/poses.mjs jab hook             validate just these (slug, or discipline/slug)
//   node scripts/poses.mjs --sheet out.png jab  contact sheet: every keyframe plus the midpoint
//                                               to the next one, as a PNG (or .svg). LOOK at it:
//                                               the validator proves the figure is connected and
//                                               inside its joint limits, not that it looks like
//                                               a hook.
//   node scripts/poses.mjs --big --sheet ...    larger cells, for judging two-figure poses
//   node scripts/poses.mjs --frames --sheet ...  every keyframe only, very large, two per row (no
//                                               midpoints): the way to judge a two-figure pose
//   node scripts/poses.mjs --dir other/dir ...  read *.json from another directory
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const SF = require('../lib/stick-figure.js');

const args = process.argv.slice(2);
function take(flag) { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : null; }
const sheet = take('--sheet');
const dirArg = take('--dir');
const big = args.includes('--big') ? (args.splice(args.indexOf('--big'), 1), true) : false;
const framesOnly = args.includes('--frames') ? (args.splice(args.indexOf('--frames'), 1), true) : false;
const root = dirArg || join(here, '..', 'content');

function walk(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
}
let files = walk(root).sort();
if (args.length) files = files.filter((f) => args.some((a) => relative(root, f).includes(a)));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
let bad = 0;
const rows = [];
for (const f of files) {
  const key = relative(root, f).replace(/\.poses\.json$|\.json$/, '');
  let data;
  try { data = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.log(`x ${key}: ${e.message}`); bad++; continue; }
  const errs = SF.validate(data);
  if (errs.length) { bad++; console.log(`x ${key}\n    ${errs.join('\n    ')}`); } else if (!sheet) console.log(`ok ${key}`);
  if (sheet && data.version === 2 && data.frames?.length) {
    const frames = SF.resolveFrames(data);
    const cells = [];
    frames.forEach((fr, i) => {
      cells.push({ svg: SF.svgFor(data, i), cap: `${i} ${fr.label || ''}`, mid: false, vb: SF.viewBoxFor(data) });
      if (!framesOnly) cells.push({ svg: SF.svgFor(data, i, 0.5), cap: `${i}.5`, mid: true, vb: SF.viewBoxFor(data) });
    });
    rows.push({ title: `${key} - ${data.title || ''}${errs.length ? '  [' + errs.length + ' PROBLEMS]' : ''}`, cells, bad: !!errs.length });
  }
}

if (sheet) {
  const W = framesOnly ? 640 : big ? 240 : 130, PER_ROW = framesOnly ? 2 : big ? 6 : 10, PAD = 6;
  const CAPN = framesOnly ? 90 : 22;
  let H = big ? 278 : 150;
  let y = 0, body = '';
  for (const r of rows) {
    if (framesOnly) { const [, , vw, vh] = r.cells[0].vb.split(' ').map(Number); H = Math.round(W * vh / vw); }
    const nLines = Math.ceil(r.cells.length / PER_ROW);
    body += `<text x="${PAD}" y="${y + 14}" font-size="13" font-family="sans-serif" fill="${r.bad ? '#ff7060' : '#dddddd'}">${esc(r.title)}</text>`;
    y += 20;
    r.cells.forEach((c, i) => {
      const cx = PAD + (i % PER_ROW) * (W + 4), cy = y + Math.floor(i / PER_ROW) * (H + 18);
      const inner = c.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
      body += `<g opacity="${c.mid ? 0.6 : 1}"><rect x="${cx}" y="${cy}" width="${W}" height="${H}" fill="#1e1e28" rx="4"/>` +
        `<svg x="${cx}" y="${cy}" width="${W}" height="${H}" viewBox="${c.vb}">${inner}</svg>` +
        `<text x="${cx + 2}" y="${cy + H + 11}" font-size="${framesOnly ? 14 : 9}" font-family="sans-serif" fill="#999999">${esc(c.cap.slice(0, CAPN))}</text></g>`;
    });
    y += nLines * (H + 18) + 10;
  }
  const w = PAD * 2 + PER_ROW * (W + 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${y}" viewBox="0 0 ${w} ${y}"><rect width="${w}" height="${y}" fill="#16161e"/>${body}</svg>`;
  if (sheet.endsWith('.svg')) writeFileSync(sheet, svg);
  else {
    const { Resvg } = require('@resvg/resvg-js');
    writeFileSync(sheet, new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng());
  }
  console.log(`wrote ${sheet} (${rows.length} poses)`);
}
if (bad) { console.log(`\n${bad} pose(s) with problems`); process.exit(1); }
if (!sheet) console.log(`\nall ${files.length} valid`);
