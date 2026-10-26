"use client";

import { VIEWBOX } from "@/lib/stick-figure";

// The figure is drawn by lib/stick-figure.js, which returns SVG markup built only from numbers in
// our own pose files (never from user input), so it is safe to inject.
export default function StickFigure({ html, label, className }: { html: string; label?: string; className?: string }) {
  return (
    <svg
      viewBox={VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
