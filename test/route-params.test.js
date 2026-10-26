'use strict';

/**
 * Next 15+/16 passes `params` / `searchParams` to pages, layouts and
 * generateMetadata as a Promise. Reading `params.x` synchronously yields
 * undefined, which every page here turns into notFound(): a 404 on every
 * dynamic route while "/" stays 200, and a green build and green suite.
 *
 * Static source check (cheap, no build). A full boot test needs `next build`,
 * so the real-server check is done by hand per PR.
 *
 * Run: node --test test/route-params.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(path.join(__dirname, '..', 'app')).filter((f) =>
  /(^|[\\/])(page|layout|route|template|default|not-found|opengraph-image)\.[tj]sx?$/.test(f));

test('there are dynamic route files to check', () => {
  assert.ok(files.some((f) => f.includes('[')));
});

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), f);

  test(`${rel}: params/searchParams are typed Promise and awaited`, () => {
    // Prop types: `params: {` or `searchParams: {` without Promise<
    assert.doesNotMatch(src, /\b(params|searchParams)\s*:\s*\{/,
      'params/searchParams must be typed Promise<{...}>');
    // Sync member reads: params.x / searchParams.x (useSearchParams() locals excluded below)
    if (!/useSearchParams/.test(src)) {
      assert.doesNotMatch(src, /\b(params|searchParams)\.\w+/,
        'read params after `await params`, not synchronously');
    }
    if (/\b(params|searchParams)\s*:\s*Promise/.test(src)) {
      assert.match(src, /await\s+(params|searchParams)\b/, 'Promise params must be awaited');
    }
  });
}
