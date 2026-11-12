'use strict';
// Security headers (octopus-vault/compliance/HIPAA.md, sweep 2026-11-12). Verified once against a real
// `next build` + `next start` (GET /, /api/build, the pose-editor redirect, a 404); this keeps the config.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('next.config sends the security headers on every path and hides x-powered-by', async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'next.config.mjs')).href);
  const cfg = mod.default;
  assert.strictEqual(cfg.poweredByHeader, false);
  const rules = await cfg.headers();
  const all = rules.find(r => r.source === '/:path*');
  assert.ok(all, 'a rule for every path');
  const h = Object.fromEntries(all.headers.map(x => [x.key.toLowerCase(), x.value]));
  assert.strictEqual(h['x-content-type-options'], 'nosniff');
  assert.strictEqual(h['x-frame-options'], 'DENY');
  assert.match(h['content-security-policy'], /frame-ancestors 'none'/);
  assert.ok(!/script-src|default-src/.test(h['content-security-policy']), 'must not restrict scripts: Next inlines its bootstrap');
  assert.ok(h['strict-transport-security']);
});
