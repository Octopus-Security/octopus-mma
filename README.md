# octopus-mma

A martial arts technique reference — belt-level curricula with an animated
stick-figure diagram for every technique. Live at
[mma.octopustechnology.net](https://mma.octopustechnology.net).

Next.js 14 (App Router, TypeScript, Tailwind), built to a Docker image and
served behind Nginx Proxy Manager on the estate's `web_proxy` network.

## What it does

Techniques are organised by **discipline → belt level → technique**. Ten
disciplines are modelled in `lib/types.ts` (Taekwondo, BJJ, Karate, Tai Chi,
Muay Thai, Boxing, Wrestling, Judo, Kung Fu, Krav Maga); four of them currently
have written content:

| Discipline | Techniques | Animated |
|---|---|---|
| Taekwondo | 15 | 15 |
| Boxing | 7 | 7 |
| BJJ | 5 | 5 |
| Karate | 5 | 5 |

The remaining six have routes and metadata but no technique files yet, so they
render as empty rather than 404 — the content layer is the gap, not the code.

## The interesting part: pose animation

Rather than shipping video or GIFs of a real person, each technique can carry a
`.poses.json` file next to its markdown describing keyframes for an SVG stick
figure. `lib/poses.ts` interpolates between frames and
`components/technique/StickFigure.tsx` renders them.

This was a deliberate trade. Diagrams stay legible at any size, weigh almost
nothing, need no filming, and can be corrected by editing a number — and they
sidestep the licensing problem that comes with instructional footage.

Two conventions worth knowing before authoring one:

- **`viewBox="0 0 100 110"`** is the coordinate space.
- **`nearSide`** decides which way the figure faces, and which limbs read as
  near or far: `"L"` (the default) faces right, drawing left joints bright and
  right joints dark; `"R"` faces left and is used for an opponent figure. Depth
  is carried entirely by that contrast, so getting it backwards makes the
  figure look inside-out.

A `highlight` array colours joints red for the moment of contact. Strikes tend
to work in five frames: stance → chamber → extension (highlighted) → retract →
return. `content/taekwondo/white-belt/front-kick.poses.json` is the reference
implementation.

### Pose editor

`/tools/pose-editor` is a drag-to-edit authoring tool for these files — it beats
hand-writing coordinates. It sits behind a cookie check in `middleware.ts`; the
reference site itself is fully public and unauthenticated.

## Adding a technique

1. Create `content/<discipline>/<belt>/<slug>.md` with frontmatter matching
   `TechniqueFrontmatter` in `lib/types.ts`.
2. Optionally add `<slug>.poses.json` beside it for the animation.

Belt levels per discipline are defined in `lib/types.ts` — a belt not listed
there has no route, so add it there first.

## Development

```sh
npm install
npm run dev      # http://localhost:3000
npm test         # node --test: content integrity + build stamp
```

`npm run build` generates GIF fallbacks before `next build`.

The content tests parse every markdown file and validate its frontmatter, so a
malformed technique fails the suite rather than the page.

## Deploy

Pushing to `main` deploys — Portainer polls the repo and rebuilds. There is no
manual step, so a broken build ships as a broken build.

`/api/build` returns a content-derived stamp answering *"did my push actually
land"*, which is an estate-wide convention: a deploy that never happened and one
that happened without helping look identical from the outside otherwise.

```sh
curl -s https://mma.octopustechnology.net/api/build
```

`/api/health` is the liveness probe.

## Layout

```
app/                    routes — [discipline]/[beltLevel], search, tools, api
components/technique/   StickFigure, DiagramViewer, usePoseAnimation
content/                markdown + .poses.json, the whole content layer
lib/types.ts            disciplines, belt orders, frontmatter shape
lib/poses.ts            pose format and interpolation
test/                   content integrity, build stamp
```
