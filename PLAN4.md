# EGORITHM — Plan 4 (consolidated, build-from)

**This is the single source of truth to build from.** It consolidates the prior
three plans into one coherent, buildable spec. `PLAN.md` (v1, live), `PLAN2.md`
(vision), `PLAN3.md` (philosophy overrides) are now **historical** — their
rationale still stands, but PLAN4 is what we build against. Brand voice =
`PHILOSOPHY.md`.

---

## 0. Where it stands today

- **v1 is LIVE** at winstt.github.io/egorithm — a plain infinite wall mirroring
  the Instagram `y0ungtrailblaze` feed (299 of ~2251 posts), two-way (site can
  publish to IG). Built on "GitHub as the backend" (Pages + Actions + `feed.json`
  + committed images). M0–M3 done, M4 built (publish pipeline) but not yet run
  end-to-end from the browser, M5 partial.
- **Instagram is solved** (personal): Facebook-Login route, IG Business ID
  `17841470673507793`, non-expiring long-lived Page token, publish verified.
- v2 grows this from one public feed into a **private, multi-source, node-wired,
  composable moodboard with an AI making-tool underneath it.**

---

## 1. Locked decisions

| # | Decision | Status |
|---|---|---|
| 1 | **AI-create input = both** — selected images as references *and* a board-level "deepen" over the whole composition | locked |
| 2 | **Business model = pay-per-use** — free credit pool, then a few cents per generation only; **invisible meter, settles once at end of day**; everything else (compose/collect/connect/wire) free forever | locked |
| 3 | **Private by default** — a user's sandbox is private; sharing is opt-in + selective. Requires auth | locked |
| 4 | **Storage/stack = Cloudflare-native** (Pages + R2 + D1 + Workers) + **Cloudflare Access** for private-by-default now; schema is multi-user-ready (`user_id` everywhere) so real accounts are additive later | recommended-locked (flip to Supabase+R2 if going multi-user immediately) |
| 5 | **AI engines** — Google **Nano Banana** (Gemini 2.5/3.x Flash Image) primary for stills (up to 20 refs, ~$0.039/img); **Higgsfield** for image→video / motion | locked |
| 6 | **Visual styling = DEFERRED** — moving away from liquid glass, leaning near-invisible / text-only, but finalized in a later dedicated pass. Blocks nothing | deferred (owner) |

---

## 2. The spine — lateral × vertical

The board is the **vessel for the lateral leap** (your improbable, taste-driven
connections across unrelated worlds). The AI is the **vertical descent** beneath
it (deepen, render, world-build, produce variations along a chosen direction). A
feed only ever moves sideways — wide and shallow; **egorithm adds the vertical
axis.** Every feature serves one of these two: compose laterally, or descend
vertically.

---

## 3. Data model

Five objects. Designed multi-user-ready and private-by-default from day one.

- **User** — `{ id, ... }`. In the personal phase there is one; every other row
  carries `user_id` so accounts are additive, not a rewrite.
- **Source** — an origin of images + its connector: `{ id, user_id, type
  (ig|pinterest|arena|upload|generated), config, credentials, refresh_cadence }`.
- **Block** — one image: `{ id, user_id, source_id, image_url (R2), thumb_url,
  origin_url, w, h, added_at, visibility (private|shared), origin (fetched|
  generated), raw?, tags[], embedding? }`.
- **Board / PLAN** — a composition node: `{ id, user_id, name, parent_id
  (lineage), graph (nodes+edges), seed, visibility }`. "PLAN" is the UI name for
  a Board node.
- **View** — the render state of a PLAN: seed, layout, background, camera.

Sharing = per-block/per-board `visibility` flags. Lineage = `parent_id` (a board
forks/carries forward into the next).

---

## 4. Architecture (v2 target)

Keep the static frontend (it already abstracts data behind `loadFeed()`); swap
the data layer under it.

```
  ┌──────────── Cloudflare Pages (static Vite/TS frontend) ────────────┐
  │  wall (virtualized) · node editor · lightbox · AI tray             │
  └───────────────┬───────────────────────────────────────────────────┘
                  │  GET /api/plan/:id?viewport=…   (paginated by region)
                  ▼
  ┌──────────── Cloudflare Workers (API + connector crons) ───────────┐
  │  • connectors: fetch IG / Pinterest / Are.na → cache to R2 →       │
  │    upsert Blocks in D1  (background cron, never on user path)      │
  │  • /api: read PLANs/Blocks, wire edges, run AI-create, billing     │
  └──────┬───────────────────────────────┬────────────────────────────┘
         ▼                                ▼
   ┌── R2 ──────────────┐        ┌── D1 (SQLite) ─────────────┐
   │ images + thumbs    │        │ Users, Sources, Blocks,    │
   │ (zero egress)      │        │ Boards/PLANs, edges        │
   └────────────────────┘        └────────────────────────────┘

  Auth: Cloudflare Access gates the whole app to allow-listed emails
        (private-by-default, zero auth code). Real self-serve accounts =
        an additive layer later, same R2 + D1.
```

- **Read path:** frontend asks the Worker for a PLAN's blocks in the current
  viewport region → served from D1 (metadata) + R2 (thumbs). Virtualized, so
  2000+ blocks never all load.
- **Ingest:** Workers cron pulls each Source on its cadence, caches new images to
  R2 (IG/Pinterest URLs expire; Are.na is stable but we still cache thumbs),
  upserts Blocks. Never blocks the UI.
- **Write (AI + upload):** upload → R2 + Block row. AI-create → Worker calls Nano
  Banana / Higgsfield, stores result as a `generated` Block.
- **Migration:** v1's GitHub pipeline keeps the current wall alive until v2.2
  cuts over; the IG archive is imported into D1/R2 during v2.2.

---

## 5. Connectors (corrected access reality, verified 2026-07)

Same interface for all: `fetch(config) → Block[]` + a refresh cadence.

| Source | Personal use (now) | Multi-user (later) | Effort |
|---|---|---|---|
| **Upload** | drag-drop / paste / file → R2 | same | trivial |
| **Are.na** | `GET /v2/channels/:id/contents` — **public, no auth**, tokens don't expire | same | **build first** |
| **Instagram** | **done** — FB Graph, non-expiring Page token | needs App Review for others' accounts | done |
| **Pinterest** | **Trial access** — free, self-serve, approved in ~1–2 days, 1,000 req/day, **reads your own boards**. Enough for personal | **Standard access** (demo video, 1–4 wk review) to read others' boards | low (personal) |

> **Pinterest correction:** it is *not* hard-gated. For your own boards, Trial
> access is quick and self-serve — no need to email them. The demo-video review
> (Standard) only matters when the product reads *other people's* boards. Same
> shape as Instagram.

Sources: [Pinterest access tiers](https://developers.pinterest.com/docs/key-concepts/access-tiers/),
[Pinterest v5 API](https://developers.pinterest.com/docs/api/v5/),
[Are.na channels API](https://dev.are.na/documentation/channels).

---

## 6. Node editor / PLANs

The signature surface (details in PLAN2 §2, unchanged):

- **Docked at the bottom**; the wall fills everything above. Pull up to work,
  collapse to just look.
- **Nodes = sources/directories.** Every source you add is a node; the editor is
  your directory browser.
- **PLAN node** — a combinator; **double-click = active** (its output fills the
  wall). Keep several, flip between them.
- **Viewport port** — the sink; whatever's wired to it renders. Rewire = instant
  new view.
- **`+ add directories`** (top-right) opens the connectors menu (pick / remove a
  source).
- **Edge ops:** `union`, `filter` (tag/source/ratio), `sample` (N, seeded),
  `weight`. PLAN outputs are connectable → a PLAN can feed another.
- **Lineage:** `start from this` on a PLAN/selection → a child PLAN pre-wired
  from it (the board as a building-stone).
- Desktop: right-click-drag + port-drag. Mobile: tap-port then tap-target.

---

## 7. AI create (both inputs) + raw outputs

- **Selection-as-references:** multi-select blocks on the wall (tap → tray) → they
  become the reference set (Nano Banana ≤20) → prompt → generate.
- **Board-level "deepen":** one action on a PLAN feeds the whole composition
  (representative images + optional intent line) → variations / world-building
  along the board's direction. The literal vertical descent.
- **Raw by default (digital-raw):** no auto-enhance / upscale / retouch; keep
  texture and seams. If a control exists, it's a *rougher* option, not "enhance."
- **Outputs** land as `generated` Blocks in an AI source — part of the graph like
  anything else, **no badge** (the image is the interface).
- **Metering:** generation is the only paid action (see §10).

---

## 8. Grid & motion — v2.0 functional pass (ships now)

All frontend, on the current stack, **no visual redesign, no font/glass
decision needed**:

- **Scramble** — rename v1 "shuffle" → **scramble** (+ two-arrows mark). New seed
  → items glide to new positions.
- **Zoom-on-move** — gentle parallax/scale breathing by distance from viewport
  centre so movement feels alive. Honors `prefers-reduced-motion`.
- **Background switch** — palette `#404040` · `#1737e9` (ultramarine) · `#ffffff`
  · `#000000` · `#e9e9e9`; persists in localStorage.
- **Lowercase UI copy** everywhere (`add`, `scramble`, `background`).
- **Expand polish** — opacity crossfade + scale-settle on the FLIP.

*(The de-glass → near-invisible/text-only redesign, typeface, and legibility are
the DEFERRED visual pass — separate, later.)*

---

## 9. Private / sharing / multiverse

- **Private by default.** Boards are yours. The v1 public wall becomes "a
  published board," not the default.
- **Selective, opt-in sharing.** Publish only chosen pieces (block or curated
  subset) as a stable link — tend a page, don't broadcast.
- **Multiverse (conservative default):** others' shared boards sit *alongside*
  yours only if you pull them in (paste a link / read-only source node). No feed,
  no discovery, nothing pushed. *(Depth is an open item — §13.)*
- **Never auto-inject generic content** — connectors pull *your* sources only.
  Curation is the filter; the board stays a mirror.

---

## 10. Business model — pay-per-use

- **Free forever:** composing, collecting, connecting, wiring, scramble,
  backgrounds, viewing, sharing. Zero metering.
- **Paid = AI generation only.** Free credit pool to start, then a few cents per
  generation (basis: Nano Banana ~$0.039/img + margin).
- **Invisible meter:** generations accrue through the day and **settle once at
  end of day** — never a per-action counter. *"you pay, so you're the customer,
  not the product."* No ads, no data sale, no engagement metrics — ever.
- **Implementation note:** Stripe usage-based billing. Record a usage event per
  generation; a **daily cron** aggregates and creates one charge; free-pool
  balance decrements first. Daily settlement is a small custom job (Stripe won't
  do "once per day" natively). UI shows no live counter — at most a quiet daily
  total in settings.

---

## 11. Speed is a hard constraint

The pitch is "faster than Miro / Pinterest / Are.na." Non-negotiables:
instant first paint (cached thumbs immediately, full-res on expand); serve small
+ from the edge (R2 zero-egress + CDN); virtualize the wall (<300 live nodes) and
the node editor; optimistic/local-first interactions; connectors sync in the
background, never on the user's path. **Budget: interaction < 100 ms, wall first
paint < 1 s warm.** Regressions here are bugs, not polish.

---

## 12. Milestones (build order)

- **v2.0 — Motion & Scramble** *(functional; ships now, frontend-only)* — §8.
- **v2.1 — Upload + Are.na connector** — real upload; Are.na channel as a Source;
  connectors submenu. Still fits the current stack at small scale.
- **v2.2 — Data layer + auth + private-by-default** *(the cutover)* — stand up
  Cloudflare R2 + D1 + Workers + Access; multi-user-ready schema; import the IG
  archive; frontend reads the API.
- **v2.3 — Node editor & PLANs + lineage** — bottom editor, PLAN node, Viewport
  port, `+add`, edge ops, `start from this`.
- **v2.4 — AI create + pay-per-use billing** *(headline)* — both inputs, raw
  outputs, Nano Banana / Higgsfield; free pool + invisible daily settlement.
- **v2.5 — Pinterest connector** — Trial access (personal), boards as Sources.
- **v2.6 — Selective sharing + multiverse pull-in** (link-based).
- **v2.7 — AI search** — embeddings on ingest, semantic + similarity, auto-tags.
- **Deferred (parallel, owner-timed): visual pass** — de-glass → near-invisible /
  text-only, typeface, legibility.

---

## 13. Open items

- **Multiverse depth** — default: link-based pull-in only, no discovery. Confirm
  before v2.6.
- **Free-pool size & per-generation price** — set at launch (basis ~$0.039/img).
- **Visual pass** — typeface + legibility (`mix-blend-mode: difference`) when we
  do visuals.
- **README** — still missing (v1 M5 deliverable); write when convenient.
- **Storage flip** — Cloudflare-native is chosen; switch to Supabase+R2 only if
  multi-user self-serve is wanted immediately.

---

## 14. Future: Graphic Factory bridge (optional, personal)

Graphic Factory (`~/graphic-factory`) is a local overnight, free Nano-Banana
generator (references → STYLE DNA → mass prompts → images, triaged into
`approved/`). It is effectively "egorithm's vertical descent, but bulk and free."
Cheapest bridge for personal use: an egorithm board exports to GF `references/`;
GF `approved/` becomes an egorithm Upload source. No new API. Recorded here so
it's not lost; not scheduled.
