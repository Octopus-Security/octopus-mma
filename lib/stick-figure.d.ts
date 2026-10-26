// Types for lib/stick-figure.js (the v2 rigid-skeleton engine). Format reference: docs/POSES.md.
export interface PoseAngles {
  torso: number; head: number;
  upperArmL: number; forearmL: number; upperArmR: number; forearmR: number;
  thighL: number; shinL: number; footL: number; thighR: number; shinR: number; footR: number;
  arch?: number;
  root?: { x: number; y: number };
}
export interface Anchor { joint: string; x: number; y: number }
export interface PartnerFrame {
  pose: Partial<PoseAngles>;
  anchor?: Anchor;
  pins?: string[];
  highlight?: string[];
  air?: boolean;
}
export interface PoseFrameV2 {
  duration: number;
  label?: string;
  ease?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  air?: boolean;
  anchor?: Anchor;
  pins?: string[];
  highlight?: string[];
  pose: Partial<PoseAngles>;
  partner?: PartnerFrame;
}
export interface PoseDataV2 {
  version: 2;
  title: string;
  view?: "side" | "front";
  anchor?: Anchor;
  pins?: string[];
  highlight?: string[];
  loop?: boolean;
  grounded?: boolean;
  partnerFront?: boolean;
  hold?: string;
  props?: Array<Record<string, number | string>>;
  frames: PoseFrameV2[];
}
export interface Timeline {
  total: number;
  frames: Array<{ duration: number; label?: string }>;
  at(ms: number): { html: string; label: string; index: number };
}
export function validate(data: unknown): string[];
export function timeline(data: PoseDataV2): Timeline;
export function svgFor(data: PoseDataV2, frameIndex?: number, t?: number): string;
export const VIEWBOX: string;
export const ANGLES: string[];
export const LEN: Record<string, number>;
export const FLOOR_Y: number;
declare const SF: {
  validate: typeof validate; timeline: typeof timeline; svgFor: typeof svgFor;
  VIEWBOX: string; ANGLES: string[]; LEN: Record<string, number>; FLOOR_Y: number;
  [k: string]: unknown;
};
export default SF;
