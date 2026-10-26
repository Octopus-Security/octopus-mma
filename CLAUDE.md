# octopus-mma — Claude Handoff

## What this is
A martial arts reference site at `mma.octopustechnology.net`. Next.js 14 (App Router, TypeScript, Tailwind), deployed via Docker on the existing `web_proxy` network, proxied through Nginx Proxy Manager.

## Current state
The foundation is complete and deployed:
- Dark martial arts theme, 10 discipline routes
- File-based content from `content/<discipline>/<belt>/` — markdown with frontmatter for technique pages
- SVG stick figure animation system, format v2 (rigid skeleton: segment angles, fixed bone lengths) — engine `lib/stick-figure.js`, format and rules in `docs/POSES.md`, viewer `components/technique/DiagramViewer.tsx` (+ `StickFigure.tsx`, `usePoseAnimation.ts`)
- Every technique page has a `.poses.json`; `node scripts/poses.mjs` validates, `--sheet out.png` renders a contact sheet to look at, `test/poses.test.js` enforces it

## What to work on next

### Priority 1 — Content
Write MDX files for all remaining techniques per the project plan. Start with:
1. TKD white belt remainder (straight-punch, high-block, middle-block, attention-stance, ready-stance, fighting-stance)
2. TKD yellow → black belt (full curriculum in the plan)
3. BJJ white belt
4. Karate white belt

Each technique needs:
- A `.md` file in `content/<discipline>/<belt>/<slug>.md` with frontmatter matching `TechniqueFrontmatter` in `lib/types.ts`
- A `.poses.json` alongside it for animation (see `jab.poses.json` or `front-kick.poses.json`); a test fails without one

### Priority 2 — Pose animations
Add `.poses.json` files for each technique. The format is defined in `docs/POSES.md` (v2, angles not coordinates).

Key conventions (details in `docs/POSES.md`):
- Angles per body segment, not coordinates; side view faces RIGHT, `L` is the near (bright) lead side, `R` the rear
- A frame's `partner` block draws a second, mirrored (facing left) blue figure for grappling
- `highlight` names (`kneeL`, `hand`, `spine`...) colour the working limb red at the point of contact
- 5-frame pattern works well for strikes: Stance, Chamber, Extension (highlight), Retract, Return
- Look at `node scripts/poses.mjs --sheet out.png <slug>` before calling a pose done

### Priority 3 — Pose editor UI
The old drag-the-joints editor was removed with the v1 format (it could produce detached limbs). A new
editor would have to edit segment angles; until then, author JSON and check it with the contact sheet.

### Priority 4 — Search
`app/search/page.tsx` exists as a route but has no content yet. Needs a client-side search across all technique frontmatter using Fuse.js.

## File map (key files)

```
app/
  page.tsx                          ← home, discipline grid
  [discipline]/page.tsx             ← discipline landing, all belt levels
  [discipline]/[beltLevel]/page.tsx ← belt level, techniques grouped by type
  [discipline]/[beltLevel]/[slug]/page.tsx ← technique detail + DiagramViewer

components/technique/
  StickFigure.tsx       ← SVG renderer; nearSide prop controls depth/facing
  usePoseAnimation.ts   ← RAF loop, lerp, easing, play/pause/step/speed
  DiagramViewer.tsx     ← player UI (frame dots, prev/next, speed buttons)

lib/
  types.ts    ← TechniqueFrontmatter, Discipline, BELT_LEVELS, BELT_COLORS
  poses.ts    ← JointSet, PoseFrame, PoseData, NEUTRAL_STANCE
  content.ts  ← getTechnique(), getTechniquesByDisciplineAndBelt(), getPoses()

content/
  taekwondo/white-belt/
    front-kick.md          ← reference technique file
    front-kick.poses.json  ← reference pose animation file
    low-block.md
    walking-stance.md
```

## Deploy
Push to GitHub → Portainer pulls and rebuilds the `octopus_mma` container automatically (or manually redeploy the stack).
