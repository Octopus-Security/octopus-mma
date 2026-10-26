"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import SF from "@/lib/stick-figure";
import type { PoseData } from "@/lib/poses";

export interface PoseAnimState {
  html:        string;
  frameIndex:  number;
  frameLabel:  string;
  hasPartner:  boolean;
  isPlaying:   boolean;
  play:        () => void;
  pause:       () => void;
  goToFrame:   (i: number) => void;
  speed:       number;
  setSpeed:    (s: number) => void;
  totalFrames: number;
}

export function usePoseAnimation(data: PoseData): PoseAnimState {
  const tl = useMemo(() => SF.timeline(data), [data]);
  const starts = useMemo(() => {
    let acc = 0;
    return tl.frames.map((f) => { const s = acc; acc += f.duration; return s; });
  }, [tl]);
  const hasPartner = useMemo(() => data.frames.some((f) => f.partner), [data]);

  const [view, setView] = useState(() => tl.at(0));
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  const elapsed = useRef(0);
  const last = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const playing = useRef(true);
  const speedRef = useRef(1);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const stop = () => { if (raf.current !== null) cancelAnimationFrame(raf.current); raf.current = null; };

  const tick = useCallback((ts: number) => {
    if (!playing.current) return;
    if (last.current !== null) elapsed.current += Math.min(ts - last.current, 100) * speedRef.current;
    last.current = ts;
    setView(tl.at(elapsed.current));
    raf.current = requestAnimationFrame(tick);
  }, [tl]);

  const play = useCallback(() => {
    playing.current = true; setIsPlaying(true); last.current = null;
    stop(); raf.current = requestAnimationFrame(tick);
  }, [tick]);
  const pause = useCallback(() => { playing.current = false; setIsPlaying(false); stop(); }, []);

  useEffect(() => { play(); return stop; }, [play]);

  const goToFrame = useCallback((i: number) => {
    const n = tl.frames.length;
    const idx = ((i % n) + n) % n;
    elapsed.current = starts[idx];
    setView(tl.at(starts[idx]));
  }, [tl, starts]);

  return {
    html: view.html, frameIndex: view.index, frameLabel: view.label || `Frame ${view.index + 1}`,
    hasPartner, isPlaying, play, pause, goToFrame, speed, setSpeed, totalFrames: tl.frames.length,
  };
}
