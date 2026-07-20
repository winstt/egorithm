# EGORITHM — Plan 2 (vision & roadmap)

> **Superseded by `PLAN4.md`** (the consolidated build-from plan). Kept for the
> vision/rationale behind v2; build against PLAN4.

Successor to `PLAN.md` (v1 = "mirror my IG feed on an infinite board", now LIVE
at winstt.github.io/egorithm). This document is the source of truth for **v2**:
multi-source, node-connected, composable moodboard. Brand voice lives in
`PHILOSOPHY.md`.

> **Precedence:** `PLAN3.md` supersedes this document wherever they conflict —
> specifically the **business model** (§9 → pay-per-use, not subscription),
> **AI-create input** (§6a → now *both* selection + board-deepen), **milestones**
> (§8 → PLAN3 §4), and the **glass aesthetic** (deferred; PLAN3 §1.1). Read PLAN2
> for the vision, PLAN3 for the current authority.

---

## 0. What changes from v1

v1 answered: *"show my Instagram as an infinite wall."* It works.

v2 answers a bigger question: *"let me wire together every place I collect
images — IG, Pinterest, Are.na, my own uploads — into boards I can connect and
render as one surface."* The infinite grid stays; underneath it grows from a
single feed into a **graph of sources and boards**.

The shift in one line: **from a feed to an instrument.**

**Positioning — speed is the product.** The go-to tools for this (Miro,
Pinterest, even Are.na) are *slow*: heavy canvases, laggy loads, friction to
connect anything. EGORITHM's core promise is **fast, instantly connected** —
open it, wire two sources, see the wall, generate from a selection, all without
waiting. Speed is not a nice-to-have; it is the differentiator and a hard design
constraint (see §10).

**It is a device for vertical thinking, not just an image wall.** More than
looking at pictures: select a few, push them through an AI visual engine
(Higgsfield / Google "Nano Banana"), and *create* — the moodboard becomes a
thinking-and-making surface, not a gallery.

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

## 2. The node editor (signature feature)

Sources and boards are **nodes**; edges combine them, and whatever is wired to
the **Viewport** node renders on the big wall above. This is the heart of v2 and
the literal expression of the brand ("connection over collection"). It doubles
as the way you **browse your uploaded directories** — each directory/source is a
node you can see, move, and patch.

```
   ┌─────────────── the wall (infinite grid, fills the screen) ───────────────┐
   │   selecting images here → they become samples for an AI prompt (§6)       │
   └──────────────────────────────────────────────────────────────────────────┘
   ┌──── node editor (docked at the BOTTOM, pull up to expand) ───── [+ add ▸] ┐
   │                                                                            │
   │   [IG: architecture]─┐                                                     │
   │   [Pinterest: cats]──┼─(union)─▶[PLAN]══▶(( Viewport ))                    │
   │   [Are.na: art pin]──┘           ▲ double-click = active                   │
   └────────────────────────────────────────────────────────────────────────── ┘
```

**Layout.** The node editor is **docked at the bottom** of the screen; the wall
fills everything above. Pull the editor up to work in it, collapse it to just
look at the wall.

**Nodes = directories/sources.** Every source you add (an IG account, a
Pinterest board, an Are.na channel, an upload folder off your computer) shows up
as a node. The editor *is* your directory browser.

**The PLAN node.** A special combinator node. **Double-click it to make it
active** — its output becomes what the wall shows. You keep several PLANs and
flip between them by activating one. (A "PLAN" = a saved composition of wired
sources; this is the v2 name for what §1 calls a Board.)

**Interaction.**
- **Desktop:** right-click + drag to move a node; drag from a node's output port
  to another node's input to connect.
- **Mobile:** tap a node's port, then tap another node (or the Viewport) to wire
  them — no precise dragging needed.
- **Viewport port:** a fixed sink node. Whatever is connected to it renders on
  the wall. Rewiring the Viewport instantly changes the view.

**+ Add directories.** A **`+`** button in the **top-right of the node editor**
opens the connectors menu (§3): natively pick a source to pull from (IG /
Pinterest / Are.na / Upload / local files), and it drops in as a new node. Same
menu lets you **remove** a directory.

**Edge operations (v2 set):** `union` (merge), `filter` (by tag / source /
ratio), `sample` (take N, seeded), `weight` (bias how often a source shows up in
the scatter). More later (dedupe, time-window). PLAN outputs are themselves
connectable, so a PLAN can feed another PLAN.

Modular/patching in spirit (Blender nodes, Max/MSP, Are.na's connection model)
but kept plain, quiet, and — above all — **fast**.

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

> The **"glass" references** in this section are v1-era. The control's *visual
> style is deferred* (PLAN3 §1.1 / PLAN.md §3.3) — the **functionality** below
> (scramble, background switch) stands; the skin is open, decided later.

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
5. **Background / theme switcher** — a small menu (in the glass control) to set
   the wall background. Fixed palette:

   | Swatch | Hex |
   |---|---|
   | Dark grey | `#404040` |
   | Ultramarine blue | `#1737e9` |
   | White | `#ffffff` |
   | Black | `#000000` |
   | Light grey | `#e9e9e9` |

   *(Author's note had `#ffffff`/`#000000` labelled swapped — corrected here:
   `#ffffff` = white, `#000000` = black.)* Selection persists (localStorage);
   image drop-shadows/menu glass adapt to light vs dark backgrounds.

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

## 6. AI — create & search (paid tier)

Two capabilities. **Create** is the headline (turns EGORITHM into a making tool,
the "device for vertical thinking"); **Search** is the utility.

### 6a. AI create (headline paid feature)

> **Updated by PLAN3 §2.1:** the input model is now **both** — selected images as
> references **and** a board-level "deepen" that feeds the whole composition.

The flow: **select a few images on the big wall → they're sampled as visual
references → write a prompt → generate a new image right onto the wall.** The
moodboard's own contents become the material for creating more.

- **Engine — Google "Nano Banana" (Gemini 2.5 Flash Image) as primary.** It
  natively **blends up to 20 reference images** into one composition with
  character/style consistency, ~**$0.039/image**, seconds to generate — a near-
  perfect match for "sample these, make that." Nano Banana 2 (Gemini 3.x Flash
  Image) is the newer/cheaper/faster variant to target.
- **Higgsfield as the second engine**, especially for **image→video / motion**
  (it exposes an API on the Creator plan, Bearer-token, 100+ models incl. FLUX).
  Use it when the output wanted is animated, not still.
- **Selection UX:** multi-select on the wall (tap/click to add to a tray), a
  prompt bar appears, choose engine + aspect, generate. Result lands as a new
  Block in an "AI / generated" source so it's part of the graph like anything
  else.
- **Cost control:** generation is metered → the natural **paid** action.
  *(Superseded by PLAN3 §1.2: **everything except AI generation is free, always** —
  no subscription, no "higher limits"; only generation is metered, settled once
  at end of day.)*

Sources: [Gemini 2.5 Flash Image (Nano Banana) API](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-image),
[Nano Banana image generation](https://ai.google.dev/gemini-api/docs/image-generation),
[Higgsfield Cloud API](https://cloud.higgsfield.ai/).

### 6b. AI search (later)

Apple-Photos-style: **find exactly the image you mean** across the whole wall.

- On ingest, compute an **image embedding** (CLIP-class) per Block; store in a
  vector index.
- Search box: text → nearest blocks; or "more like this" from any image. Optional
  auto-tags (color/object/mood) feed the `filter` edge op.
- Cheap at this scale. **Deferred** until connectors + graph + create are solid.

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

> **Superseded by PLAN3 §4**, which adds accounts/auth + private-by-default at
> v2.2, board lineage at v2.3, pay-per-use billing at v2.4, and sharing/multiverse
> at v2.6 — and splits v2.0 into a functional pass (ships now) and a deferred
> visual pass. Use PLAN3 §4 as the live milestone list.

- **v2.0 — Motion, Scramble & backgrounds** *(frontend only, ships on current stack)*
  Rename Scramble + arrows icon, expand-animation polish, zoom-on-move parallax,
  background/theme switcher (§4 palette), reduced-motion. No backend change.
- **v2.1 — Upload + Are.na connector** *(still GitHub-feasible at small scale)*
  Real upload from computer/web; Are.na channel as a Source; connectors submenu.
- **v2.2 — Data layer migration** *(the big one)*
  Stand up Cloudflare R2 + D1 + Workers; move ingest off Actions; frontend reads
  the API; import the full ~2k IG archive with a per-source cap.
- **v2.3 — Node editor & PLANs**
  Bottom-docked node editor, source/directory nodes, PLAN node (double-click =
  active), Viewport port, `+ add directories`, edge ops `union/filter/sample/weight`.
- **v2.4 — AI create** *(headline paid feature)*
  Multi-select on the wall → prompt bar → **Nano Banana** generation (Higgsfield
  for motion) → result back onto the wall. Metering + paywall.
- **v2.5 — Pinterest connector**
  OAuth, Trial→Standard access, board pins as a Source.
- **v2.6 — AI search**
  Embeddings on ingest, semantic + similarity search, auto-tags.

*Ordering note:* AI create (v2.4) needs only wall-selection + a source + the
Gemini API — no vector DB — so it ships before AI search. It's the biggest draw,
so it's front-loaded once the node editor exists.

## 9. Business model (ideas — no ads, ever)

> **Superseded by PLAN3 §1.2.** The decided model is **pay-per-use**: a free
> credit pool, then a few cents per generation only, with an **invisible meter
> that settles once at end of day** — *not* a monthly subscription. Composing /
> collecting / connecting / wiring is **free, always**. The options below are
> kept only as background reasoning.

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
3. **AI create as premium (headline).** Generation is metered per image, so it's
   the natural paywall — and it's the biggest draw (§6a). AI search follows.
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

## 10. Speed is a hard constraint

The whole pitch is "faster than Miro / Pinterest / Are.na." That only holds if
speed is engineered, not hoped for. Non-negotiables:

- **Instant first paint.** The wall shows cached thumbnails immediately; full-res
  loads lazily. Never block on a connector fetch.
- **Serve small, serve close.** Thumbnails (~a few hundred px) for the wall,
  full-res only on expand. Object store with zero-egress + CDN (R2) so images
  come from the edge.
- **Virtualized everything.** The wall never mounts more than ~300 nodes (already
  true in v1); the node editor virtualizes too once directories are large.
- **Optimistic + local-first UI.** Wiring nodes, activating a PLAN, scrambling,
  selecting for a prompt — all instant on the client; the network catches up.
- **Connectors sync in the background** on a cron, never on the user's critical
  path. Opening a PLAN reads local/cached state, not the source API.
- **Budget:** interaction < 100 ms, wall first paint < 1 s on a warm cache. Treat
  regressions here as bugs, not polish.

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
