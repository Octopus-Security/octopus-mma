// Pose data is the v2 rigid-skeleton format: segment angles with fixed bone lengths, so a limb
// cannot detach or stretch. The engine is lib/stick-figure.js; the format and authoring rules are
// in docs/POSES.md. This file only re-exports the types the components use.
export type { PoseDataV2 as PoseData, PoseFrameV2 as PoseFrame, PoseAngles, Anchor, PartnerFrame } from "./stick-figure";
