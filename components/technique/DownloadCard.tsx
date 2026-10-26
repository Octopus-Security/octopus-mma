"use client";

import { useState, useCallback } from "react";
import type { TechniqueFrontmatter } from "@/lib/types";
import type { PoseData } from "@/lib/poses";
import SF from "@/lib/stick-figure";

// ── Format definitions ────────────────────────────────────────────────────────

type Format = "portrait" | "story" | "square" | "landscape";
const FORMATS: Record<Format, { w: number; h: number; label: string }> = {
  portrait:  { w: 1080, h: 1350, label: "Portrait 4:5" },
  story:     { w: 1080, h: 1920, label: "Story 9:16" },
  square:    { w: 1080, h: 1080, label: "Square 1:1" },
  landscape: { w: 1350, h: 1080, label: "Landscape" },
};


type Ctx = CanvasRenderingContext2D;

// ── Figure raster ─────────────────────────────────────────────────────────────
// The engine (lib/stick-figure.js) returns the scene as SVG markup; the card draws it as an image.

// A two-figure pose has its own, wider box (SF.viewBoxFor), so the picture is sized from the image itself.
function loadFigure(html: string, viewBox: string): Promise<HTMLImageElement> {
  const [, , bw, bh] = viewBox.split(" ").map(Number);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${bw * 8}" height="${bh * 8}">${html}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("figure render failed")); };
    img.src = url;
  });
}

// ── Text wrapping ─────────────────────────────────────────────────────────────

function wrapText(ctx: Ctx, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 3): number {
  const words = text.split(" ");
  let line = "";
  let drawn = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + drawn * lh);
      line = word; drawn++;
      if (drawn >= maxLines) break;
    } else { line = test; }
  }
  if (line && drawn < maxLines) { ctx.fillText(line, x, y + drawn * lh); drawn++; }
  return y + drawn * lh;
}

// ── Card drawing ──────────────────────────────────────────────────────────────

function drawCard(
  ctx: Ctx, w: number, h: number, format: Format,
  fm: TechniqueFrontmatter, fig: HTMLImageElement, frameLabel: string,
) {
  const VB_W = 100, VB_H = (100 * fig.height) / fig.width;   // the figure's own aspect (standard box or fitted two-figure box)
  const isLandscape = format === "landscape";
  const pad = Math.round(w * 0.056);

  // Background
  ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.4);
  grad.addColorStop(0, "rgba(30,30,60,0.25)"); grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  if (isLandscape) {
    // Two-column: text left, figure right
    const colW = Math.round(w * 0.42);
    const figColX = colW + pad;
    const figColW = w - figColX - pad;

    let y = pad * 1.2;
    const disc = fm.discipline.charAt(0).toUpperCase() + fm.discipline.slice(1).replace(/-/g, " ");
    const belt = fm.beltLevel.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    ctx.font = `600 ${Math.round(w * 0.018)}px system-ui,sans-serif`; ctx.fillStyle = "#6b7280"; ctx.textAlign = "left";
    ctx.fillText(`${disc.toUpperCase()} · ${belt.toUpperCase()}`, pad, y); y += Math.round(w * 0.055);

    ctx.font = `bold ${Math.round(w * 0.048)}px system-ui,sans-serif`; ctx.fillStyle = "#ffffff";
    ctx.fillText(fm.title, pad, y); y += Math.round(w * 0.06);

    if (fm.nativeScript || fm.nativeName || fm.pronunciation) {
      const parts = [fm.nativeScript, fm.nativeName, fm.pronunciation].filter(Boolean).join(" · ");
      ctx.font = `${Math.round(w * 0.022)}px system-ui,sans-serif`; ctx.fillStyle = "#6b7280";
      ctx.fillText(parts, pad, y); y += Math.round(w * 0.04);
    }
    y += Math.round(w * 0.02);
    ctx.font = `${Math.round(w * 0.020)}px system-ui,sans-serif`; ctx.fillStyle = "#9ca3af";
    y = wrapText(ctx, fm.summary, pad, y, colW - pad, Math.round(w * 0.028), 5);

    // Figure right column
    const figS = Math.min((h - pad * 2) / VB_H, figColW / VB_W);
    const figOX = figColX + (figColW - VB_W * figS) / 2;
    const figOY = pad + (h - pad * 2 - VB_H * figS) / 2;
    ctx.drawImage(fig, figOX, figOY, VB_W * figS, VB_H * figS);

    // Frame label below figure
    ctx.font = `600 ${Math.round(w * 0.022)}px system-ui,sans-serif`; ctx.fillStyle = "#d1d5db"; ctx.textAlign = "center";
    ctx.fillText(frameLabel.toUpperCase(), figColX + figColW / 2, figOY + VB_H * figS + Math.round(w * 0.03));
  } else {
    // Single column: header → figure → label → footer
    let y = pad;
    const disc = fm.discipline.charAt(0).toUpperCase() + fm.discipline.slice(1).replace(/-/g, " ");
    const belt = fm.beltLevel.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    ctx.font = `600 ${Math.round(w * 0.020)}px system-ui,sans-serif`; ctx.fillStyle = "#6b7280"; ctx.textAlign = "left";
    ctx.fillText(`${disc.toUpperCase()} · ${belt.toUpperCase()}`, pad, y); y += Math.round(w * 0.048);

    ctx.font = `bold ${Math.round(w * 0.056)}px system-ui,sans-serif`; ctx.fillStyle = "#ffffff";
    ctx.fillText(fm.title, pad, y); y += Math.round(w * 0.07);

    if (fm.nativeScript || fm.nativeName || fm.pronunciation) {
      const parts = [fm.nativeScript, fm.nativeName, fm.pronunciation].filter(Boolean).join(" · ");
      ctx.font = `${Math.round(w * 0.026)}px system-ui,sans-serif`; ctx.fillStyle = "#6b7280";
      ctx.fillText(parts, pad, y); y += Math.round(w * 0.044);
    }

    ctx.font = `${Math.round(w * 0.022)}px system-ui,sans-serif`; ctx.fillStyle = "#9ca3af";
    y = wrapText(ctx, fm.summary, pad, y, w - pad * 2, Math.round(w * 0.031), 3) + Math.round(w * 0.018);

    // Subtle divider
    ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    y += Math.round(w * 0.025);

    // Figure
    const footerH = Math.round(h * 0.10);
    const figAreaH = h - y - footerH;
    const figS = Math.min(figAreaH / VB_H, (w - pad * 2) / VB_W);
    const figOX = (w - VB_W * figS) / 2;
    const figOY = y + (figAreaH - VB_H * figS) / 2;
    ctx.drawImage(fig, figOX, figOY, VB_W * figS, VB_H * figS);

    // Frame label
    const labelY = h - footerH + Math.round(h * 0.026);
    ctx.font = `600 ${Math.round(w * 0.030)}px system-ui,sans-serif`; ctx.fillStyle = "#d1d5db"; ctx.textAlign = "center";
    ctx.fillText(frameLabel.toUpperCase(), w / 2, labelY);
  }

  // Footer branding
  ctx.font = `${Math.round(w * 0.016)}px system-ui,sans-serif`; ctx.fillStyle = "#374151"; ctx.textAlign = "center";
  ctx.fillText("MMA REFERENCE · mma.octopustechnology.net", w / 2, h - Math.round(h * 0.022));
  ctx.textAlign = "left";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DownloadCard({
  frontmatter,
  poses,
}: {
  frontmatter: TechniqueFrontmatter;
  poses: PoseData | null;
}) {
  const [format, setFormat] = useState<Format>("portrait");
  const [state, setState] = useState<"idle" | "generating" | "encoding">("idle");
  const [progress, setProgress] = useState(0);

  const pregenUrl = `/gifs/${frontmatter.discipline}/${frontmatter.beltLevel}/${frontmatter.slug}.gif`;

  const handleDownload = useCallback(async () => {
    if (!poses) return;
    setState("generating");
    setProgress(0);

    const GIF = (await import("gif.js")).default;
    const { w, h } = FORMATS[format];
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    const tl = SF.timeline(poses);
    const totalDuration = tl.total;
    const FPS_MS = 60;
    const totalFrames = Math.ceil(totalDuration / FPS_MS);

    const gif = new GIF({
      workers: 2, quality: 8,
      workerScript: "/gif.worker.js",
      width: w, height: h, repeat: 0,
    });

    gif.on("progress", (p: number) => setProgress(p));
    gif.on("finished", (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${frontmatter.slug}-${format}.gif`;
      a.click();
      URL.revokeObjectURL(url);
      setState("idle");
    });

    for (let i = 0; i < totalFrames; i++) {
      const elapsed = i * FPS_MS;
      const { html, label } = tl.at(elapsed);
      drawCard(ctx, w, h, format, frontmatter, await loadFigure(html, tl.viewBox), label);
      gif.addFrame(canvas, { delay: FPS_MS, copy: true });
      setProgress(i / totalFrames * 0.5);
      await new Promise(r => setTimeout(r, 0)); // yield to keep UI responsive
    }

    setState("encoding");
    gif.render();
  }, [format, poses, frontmatter]);

  if (!poses) return null;

  const busy = state !== "idle";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={pregenUrl}
        download
        className="px-4 py-1.5 bg-brand-card border border-brand-border text-brand-muted rounded text-sm hover:text-white hover:border-white transition-colors"
      >
        Quick Download
      </a>
      <span className="text-brand-border">|</span>
      <select
        value={format}
        onChange={e => setFormat(e.target.value as Format)}
        disabled={busy}
        className="px-3 py-1.5 bg-brand-card border border-brand-border text-brand-muted rounded text-sm"
      >
        {(Object.entries(FORMATS) as [Format, { label: string }][]).map(([key, { label }]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <button
        onClick={handleDownload}
        disabled={busy}
        className="px-4 py-1.5 bg-brand-card border border-brand-border text-brand-muted rounded text-sm hover:text-white hover:border-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === "generating" && `Rendering ${Math.round(progress * 100)}%…`}
        {state === "encoding"   && `Encoding ${Math.round(progress * 100)}%…`}
        {state === "idle"       && "Custom Card"}
      </button>
    </div>
  );
}
