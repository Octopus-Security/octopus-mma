/**
 * Build-time GIF generator.
 * Walks content/ for .poses.json files, renders each animation to a GIF,
 * and writes them to public/gifs/<discipline>/<belt>/<slug>.gif
 *
 * Uses @resvg/resvg-js (WASM, no native deps) + gifencoder (pure JS).
 * Runs as `node scripts/generate-gifs.mjs` before `next build`.
 */

import fs         from "fs";
import path       from "path";
import { Resvg }  from "@resvg/resvg-js";
import GIFEncoder from "gif-encoder-2";
import { createRequire } from "module";

const SF = createRequire(import.meta.url)("../lib/stick-figure.js");

const ROOT        = path.resolve(".");
const CONTENT_DIR = path.join(ROOT, "content");
const OUTPUT_DIR  = path.join(ROOT, "public", "gifs");

const CARD_W = 540;
const CARD_H = 675;
const FPS_MS = 80;

function r2(n) { return Math.round(n * 100) / 100; }

// ── Card SVG generator ────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function cardSVG(frontmatter, sceneHtml, frameLabel) {
  const pad  = 60;
  const disc = frontmatter.discipline.charAt(0).toUpperCase() +
               frontmatter.discipline.slice(1).replace(/-/g," ");
  const belt = (frontmatter.beltLevel ?? "").replace(/-/g," ")
               .replace(/\b\w/g, c => c.toUpperCase());
  const badge = `${disc.toUpperCase()} · ${belt.toUpperCase()}`;

  const native = [frontmatter.nativeScript, frontmatter.nativeName, frontmatter.pronunciation]
    .filter(Boolean).join(" · ");

  // Layout
  let y = pad + 24;
  const badgeY  = y; y += 54;
  const titleY  = y; y += 72;
  const nativeY = native ? y : 0; if (native) y += 46;
  const sepY    = y; y += 30;
  const figTop  = y;
  const figBot  = CARD_H - 140;
  const figAreaH = figBot - figTop;

  // Figure scale (engine viewBox is 100 x 116 units)
  const figScale = Math.min(figAreaH / 116, (CARD_W - pad*2) / 100);
  const figW     = 100 * figScale;
  const figH     = 116 * figScale;
  const tx       = (CARD_W - figW) / 2;
  const ty       = figTop + (figAreaH - figH) / 2;

  const labelY  = figBot + 42;
  const footerY = CARD_H - 22;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#0a0e16"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${CARD_W}" height="${CARD_H * 0.35}" fill="rgba(30,30,60,0.2)"/>

  <text x="${pad}" y="${badgeY}" font-family="DejaVu Sans,sans-serif" font-size="22" fill="#6b7280" font-weight="600" letter-spacing="1">${esc(badge)}</text>
  <text x="${pad}" y="${titleY}" font-family="DejaVu Sans,sans-serif" font-size="62" fill="#ffffff" font-weight="bold">${esc(frontmatter.title)}</text>
  ${native ? `<text x="${pad}" y="${nativeY}" font-family="DejaVu Sans,sans-serif" font-size="28" fill="#6b7280">${esc(native)}</text>` : ""}

  <line x1="${pad}" y1="${sepY}" x2="${CARD_W - pad}" y2="${sepY}" stroke="#1f2937" stroke-width="1"/>

  <svg x="${r2(tx)}" y="${r2(ty)}" width="${r2(figW)}" height="${r2(figH)}" viewBox="${SF.VIEWBOX}">${sceneHtml}</svg>

  <text x="${CARD_W/2}" y="${labelY}" font-family="DejaVu Sans,sans-serif" font-size="34" fill="#d1d5db" font-weight="600" text-anchor="middle" letter-spacing="2">${esc(frameLabel.toUpperCase())}</text>

  <text x="${CARD_W/2}" y="${footerY}" font-family="DejaVu Sans,sans-serif" font-size="18" fill="#374151" text-anchor="middle">MMA REFERENCE · mma.octopustechnology.net</text>
</svg>`;
}

// ── GIF generation ────────────────────────────────────────────────────────────

async function generateGif(poses, frontmatter, outputPath) {
  const tl            = SF.timeline(poses);
  const frameCount    = Math.ceil(tl.total / FPS_MS);

  const encoder = new GIFEncoder(CARD_W, CARD_H);
  encoder.setDelay(FPS_MS);
  encoder.setRepeat(0);
  encoder.setQuality(10);
  encoder.start();

  for (let i = 0; i < frameCount; i++) {
    const { html, label } = tl.at(i * FPS_MS);
    const svg    = cardSVG(frontmatter, html, label);
    const resvg  = new Resvg(svg, { fitTo: { mode: "width", value: CARD_W } });
    const { pixels } = resvg.render();
    encoder.addFrame(Buffer.from(pixels));
  }

  encoder.finish();
  fs.writeFileSync(outputPath, encoder.out.getData());
}

// ── Main: walk content/, generate all GIFs ────────────────────────────────────

async function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("No content/ directory found, skipping GIF generation.");
    return;
  }

  let generated = 0, skipped = 0;

  for (const discipline of fs.readdirSync(CONTENT_DIR)) {
    const discDir = path.join(CONTENT_DIR, discipline);
    if (!fs.statSync(discDir).isDirectory()) continue;

    for (const belt of fs.readdirSync(discDir)) {
      const beltDir = path.join(discDir, belt);
      if (!fs.statSync(beltDir).isDirectory()) continue;

      for (const file of fs.readdirSync(beltDir)) {
        if (!file.endsWith(".poses.json")) continue;

        const slug     = file.replace(".poses.json", "");
        const posesPath = path.join(beltDir, file);
        const mdPath    = path.join(beltDir, `${slug}.md`);
        const outDir    = path.join(OUTPUT_DIR, discipline, belt);
        const outPath   = path.join(outDir, `${slug}.gif`);

        // Read poses
        let poses;
        try { poses = JSON.parse(fs.readFileSync(posesPath, "utf-8")); }
        catch { console.warn(`  ⚠ Bad JSON: ${posesPath}`); continue; }
        const problems = SF.validate(poses);
        if (problems.length) { console.warn(`  ⚠ ${posesPath} is not a valid v2 pose file:\n    ${problems.join("\n    ")}`); skipped++; continue; }

        // Read frontmatter (minimal gray-matter-like parse)
        let frontmatter = { title: slug, discipline, beltLevel: belt, slug };
        if (fs.existsSync(mdPath)) {
          const raw = fs.readFileSync(mdPath, "utf-8");
          const match = raw.match(/^---\n([\s\S]*?)\n---/);
          if (match) {
            for (const line of match[1].split("\n")) {
              const [k, ...vs] = line.split(":");
              if (k && vs.length) {
                const v = vs.join(":").trim().replace(/^["']|["']$/g, "");
                frontmatter[k.trim()] = v;
              }
            }
          }
          frontmatter.discipline = discipline;
          frontmatter.beltLevel  = belt;
        }

        fs.mkdirSync(outDir, { recursive: true });

        process.stdout.write(`  → ${discipline}/${belt}/${slug}.gif … `);
        try {
          await generateGif(poses, frontmatter, outPath);
          console.log("done");
          generated++;
        } catch (err) {
          console.log(`FAILED: ${err.message}`);
          skipped++;
        }
      }
    }
  }

  console.log(`\nGIF generation complete: ${generated} generated, ${skipped} failed.`);
}

main().catch(err => { console.error(err); process.exit(1); });
