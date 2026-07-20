# EGORITHM — Plan 2 (vision & roadmap)

Successor to `PLAN.md` (v1 = "mirror my IG feed on an infinite board", now LIVE
at winstt.github.io/egorithm). This document is the source of truth for **v2**:
multi-source, node-connected, composable moodboard. Brand voice lives in
`PHILOSOPHY.md`.

---

## 0. What changes from v1

v1 answered: *"show my Instagram as an infinite wall."* It works.

v2 answers a bigger question: *"let me wire together every place I collect
images — IG, Pinterest, Are.na, my own uploads — into boards I can connect and
render as one surface."* The infinite grid stays; underneath it grows from a
single feed into a **graph of sources and boards**.

The shift in one line: **from a feed to an instrument.**

---

## 1. Core concepts / data model

Four objects. Everything else composes from these.

- **Source** — an external origin of images + a connector that fetches it:
  an IG account, a Pinterest board, an Are.na channel, or an Upload bucket.
  Holds connector type, credentials (personal), and fetch config.
- **Block** — one image + metadata: `{ id, source_id, image_url (cached),
  origin_url, w, h, added_at, tags[], embedding? }`. The atomic unit on the wall.
- **Board** — a named node in EGORITHM. Either **backed by one Source** (all its
  blocks) or **composite** — its blocks are computed from other nodes via edges.
- **View** — a render of a board: the infinite grid with a seed, layout, and
  animation state. What you actually look at.

## 2. The node graph (signature feature)

Boards and sources are **nodes on a patch canvas**; edges combine them. This is
the heart of v2 and the literal expression of the brand ("connection over
collection").

```
  [IG: architecture] ─┐
                       ├─▶ (union) ─▶ [Board: "concrete + fur"] ─▶ View
  [Pinterest: cats] ──┤
                       │
  [Are.na: one art pin]┘
```

- **Node types:** Source nodes (inputs) and Board nodes (combinators/outputs).
- **Edge operations (v2 set):** `union` (merge), `filter` (by tag/source/ratio),
  `sample` (take N, seeded), `weight` (bias how often a source appears in the
  scatter). More later (dedupe, time-window).
- **Boards menu:** a panel listing every board you've made; open one to render it,
  or drop into "graph mode" to wire nodes. Renders of nodes are themselves
  connectable — a composite board can feed another.
- This is a modular/patching UI in spirit (Blender nodes, Max/MSP, Are.na's own
  connection model) but kept plain and quiet.

## 3. Connectors (grounded in real API constraints, verified 2026-07)

Build order is dictated by how open each API is:

| Source | API reality | Effort | Notes |
|---|---|---|---|
| **Upload** | our own storage | trivial | drag-drop from computer/web; also the "post to IG" path from v1 |
| **Are.na** | `GET /v2/channels/:id/contents`, **public = no auth**, tokens don't expire | **easy** | build *first*. Philosophically the closest cousin. Paginated blocks, stable CDN image URLs |
| **Instagram** | already solved in v1 (FB Graph, Page token, non-expiring) | done | personal-use only; App Review needed for others' accounts (out of scope) |
| **Pinterest** | v5 API, OAuth2, `GET /v5/boards/{id}/pins` with `boards:read`; **Trial access reviewed daily**, Standard needs a demo video | medium | reading a board works on Trial; publish/scale gated. Personal use fine |

Each connector implements the same interface: `fetch(config) → Block[]` +
`refresh cadence`. New sources plug in without touching the grid.

Sources: [Are.na channels API](https://dev.are.na/documentation/channels),
[Pinterest v5 API](https://developers.pinterest.com/docs/api/v5/),
[Pinterest OAuth](https://developers.pinterest.com/docs/api/v5/oauth-token/).

## 4. Grid & animation upgrades (near-term, mostly frontend)

Concrete asks from the author, in priority order:

1. **Scramble** — rename v1 "Shuffle" → **Scramble**, with a two-arrows (⇄/🔀)
   icon in the glass menu. New seed → items animate to new positions (already
   have the FLIP glide; polish the easing + stagger).
2. **Expand animation polish** — small→large open already uses FLIP; add
   **opacity crossfade** on the backdrop and a subtle **scale-settle** at the end.
3. **Zoom-on-move** — as you pan the grid, apply a gentle parallax/scale breathing
   (items slightly scale/opacity-shift by distance from viewport center) so
   movement feels alive, not flat. Respect `prefers-reduced-motion`.
4. **Ratio-aware scatter** stays; add optional density/whitespace control.

## 5. Scaling: the full 2k+ database

The author wants the *whole* archive available (~2251 IG posts + Pinterest +
Are.na), not just the newest 300 — with a sane cap per source.

**This breaks the v1 "GitHub is the backend" model.** Math: 2000 images ×
~300 KB ≈ **600 MB in git** — too heavy to commit, clone, and redeploy. Multiple
sources and per-user tokens make it worse.

**Architecture evolution (recommended):** keep the static frontend (it already
abstracts data behind `loadFeed()`), swap the data layer:

- **Object storage for images** → **Cloudflare R2** (zero egress fees — decisive
  for serving thousands of images) or Supabase Storage.
- **Metadata DB** for Blocks/Boards/edges → **Cloudflare D1** (SQLite) or Supabase
  (Postgres). Small rows, fast queries, powers filtering/sampling.
- **Connectors as scheduled jobs** → **Cloudflare Workers cron** (replaces GitHub
  Actions): fetch each Source, cache new images to R2, upsert Blocks.
- Frontend fetches `GET /api/board/:id?viewport=…` — virtualized, paginated by
  region, so 2000+ blocks never all load at once (grid virtualization already
  built in v1).

**Recommendation:** Cloudflare stack (Pages + R2 + D1 + Workers) — generous free
tier, no egress cost, one platform. Supabase is the fallback if a real Postgres
+ nicer DX matters more than egress. Per-source cap configurable (e.g. 1–2k),
default high enough to hold the IG archive.

*Migration is staged (see §8) — v1 keeps running until v2's data layer is ready.*

## 6. AI analysis (future / explicitly later)

Apple-Photos-style: scan the whole wall, **find exactly the image you mean** by
description or by visual similarity.

- On ingest, compute an **image embedding** (CLIP-class) per Block; store in the
  DB (vector column / vector index).
- Search box: text → embedding → nearest blocks; or "more like this" from any
  image. Optional auto-tags (objects, color, mood) for the `filter` edge op.
- Runs server-side on ingest, cheap at this scale. **Deferred** until connectors
  + graph are solid.

## 7. Getting images in & sharing

- **In:** drag-drop / file-picker from computer; paste an image URL from the web;
  connector sync from IG/Pinterest/Are.na; (later) browser extension "send to
  EGORITHM".
- **Out / sharing:** a board can be **published read-only at a URL** (this is the
  v1 model — a plain page of images). Private by default; publishing is a choice.
  Export options later: contact-sheet image, zine/PDF, print.
- IG *publishing* (v1's write path) stays as an Upload-bucket → IG action, but is
  personal-use and secondary to the moodboard purpose.

## 8. Milestones

- **v2.0 — Motion & Scramble** *(frontend only, ships on current stack)*
  Rename Scramble + arrows icon, expand-animation polish, zoom-on-move parallax,
  reduced-motion. No backend change.
- **v2.1 — Upload + Are.na connector** *(still GitHub-feasible at small scale)*
  Real upload from computer/web; Are.na channel as a Source; connectors submenu
  in the glass menu.
- **v2.2 — Data layer migration** *(the big one)*
  Stand up Cloudflare R2 + D1 + Workers; move ingest off Actions; frontend reads
  the API; import the full ~2k IG archive with a per-source cap.
- **v2.3 — Boards & node graph**
  Multiple boards, boards menu, node/patch mode with `union/filter/sample/weight`.
- **v2.4 — Pinterest connector**
  OAuth, Trial→Standard access, board pins as a Source.
- **v2.5 — AI search**
  Embeddings on ingest, semantic + similarity search, auto-tags.

## 9. Business model (ideas — no ads, ever)

Monetization must fit the philosophy (§ `PHILOSOPHY.md`): no ads, no attention
economy. Values-aligned options, best first:

1. **Subscription, Are.na-style (recommended).** Free personal tier (1–2
   connectors, capped blocks, 1 board). Paid (~$5–8/mo) unlocks all connectors,
   full archive, unlimited boards, node graph, private/public toggle. This is the
   model Are.na itself proves works without ads and matches the audience.
2. **Published boards as personal sites.** Pay to publish a board at a custom
   domain — a super-minimal, image-only personal site / portfolio. Natural fit:
   the moodboard *is* already a webpage. Designers/architects (the author's own
   world) would pay for this.
3. **AI search as premium.** Semantic "find the one I mean" gated to paid — it's
   a real cost and a real wow.
4. **Print / export on demand.** Turn a board into a physical zine, poster, or
   contact sheet (print-on-demand). One-off revenue, deeply on-brand for a
   visual-archive tool.
5. **Studio / team plans.** Shared boards + node graphs for design/architecture
   studios. Higher tier, clear value.
6. **Open-core + paid hosting.** Open-source the app, charge for the hosted,
   synced, connector-powered version. Builds trust, aligns with the anti-lock-in
   ethos, lets others self-host the personal case.

Deliberately **not** doing: ad spots, sponsored images, selling data, engagement
mechanics. The absence of these is part of what people would pay for.

---

## Open questions to resolve before v2.2

- Cloudflare vs Supabase — decide once we know expected image volume & whether
  Postgres features are wanted (recommendation: Cloudflare for egress cost).
- Multi-user from the start, or personal-first then add accounts? (Affects auth,
  connector token storage.) Leaning personal-first; design the DB so accounts can
  be added without a rewrite.
- Are cached images legally fine to store/serve for non-owned sources (Pinterest
  pins, Are.na blocks)? For personal use yes; for a public product, prefer
  hotlinking source CDNs where stable, cache only where necessary.
