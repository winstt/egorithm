# EGORITHM — Plan 3 (philosophy → implementation)

PLAN3 layers on top of **PLAN2.md**. It is *not* a replacement: PLAN2's data
model, connectors, node editor, and speed budget all still hold — **except where
PLAN3 overrides them.** This document captures everything `PHILOSOPHY.md` (v3)
forces into the build, split into **changes** (override PLAN2 / the current live
build) and **additions** (new requirements), each with concrete specifics.

**Reading order / precedence:** `PLAN.md` (v1, live) → `PLAN2.md` (v2 roadmap) →
`PLAN3.md` (philosophy overrides + additions). Where they conflict, **PLAN3
wins.** `PHILOSOPHY.md` is the brand source of truth.

---

## 0. Locked decisions (2026-07-20)

1. **UI aesthetic = near-invisible / text-only.** No panels, no glass, no cards
   anywhere. Controls are floating lowercase text; the image is the only surface.
   Replaces liquid glass across the whole app.
2. **AI-create input = both.** Selected images act as references *and* a
   board-level "deepen" uses the whole composition as context.

---

## 1. CHANGES — override PLAN2 / the current live build

### 1.1 Rip out liquid glass → near-invisible / text-only UI  *(biggest change; touches the LIVE site)*

**Current build (to remove):** `styles.css` `.glass` (backdrop-filter blur +
saturate, translucent fill, inner light border, soft shadow), `.tok` dialog
(same treatment), lightbox `.lb-bg` (blur backdrop), the round `#orb`, the
`.menu-items` pill.

**Target:**
- **No panels at all.** The control is a single small lowercase mark (a `+`)
  floating bottom-right. Opening it fades in a short vertical stack of lowercase
  words — `add · scramble · background` — with *no* fill, border, blur, or
  shadow. Same for the AI prompt/token inputs: a bare lowercase line (a baseline
  underline at most), never a card.
- **Legibility over arbitrary images** (the hard problem of text-only): default
  to `mix-blend-mode: difference` (or `exclusion`) so labels invert against
  whatever sits behind them — stays true to "no chrome." Faint `text-shadow`
  only as a fallback when blend contrast fails. No solid backing plates.
- **Hit areas:** generous invisible padding around each word so text-only stays
  thumb-tappable on mobile.
- **Lightbox:** drop the blur. On expand, keep the FLIP; fade the rest of the
  wall down in opacity against the current background colour — no backdrop blur.
- **Motion:** fade + a tiny positional settle. Calm, not glassy morph. Honor
  `prefers-reduced-motion`.

Overrides `PLAN.md §3.3` and every "glass" reference in PLAN2.

> The typeface now *is* the visual identity (the UI is literally text). That's a
> load-bearing design choice — see Open Questions.

### 1.2 Business model → pay-per-use, invisible daily settlement  *(overrides PLAN2 §9)*

- **Everything lateral is free, forever:** composing, collecting, connecting
  sources, wiring nodes, scramble, backgrounds, viewing, sharing. **Zero
  metering on any of it.**
- **The only paid action is AI generation** (the vertical descent). A few cents
  per generation (cost basis: Nano Banana ~$0.039/image + margin).
- **Free credit pool to start**, then pay-as-you-go.
- **Invisible meter:** generations accrue through the day and **settle once at
  end of day** — a single daily tally, never a per-action counter. Nothing ever
  ticks against your next move (transit-fare model).
- *"you pay, so you're the customer, not the product."* No ads, no data sale, no
  engagement metrics — ever.
- **Implementation:** usage-based billing (recommend **Stripe** metered billing).
  Record one usage event per generation; a daily cron aggregates the day's events
  and creates a single charge; free-pool balance is decremented first. The UI
  shows no live counter — at most a quiet daily total in settings. Requires
  accounts (§2.3).

### 1.3 Lowercase everywhere

All UI copy is lowercase (`add`, `scramble`, `background`, `connect`, `deepen`).
Bake into components from v2.0 on. Trivial but pervasive.

---

## 2. ADDITIONS — new requirements from the philosophy

### 2.1 Lateral × vertical is the product spine  *(reframes AI-create, PLAN2 §6a)*

The board is the **vessel for the lateral leap**; AI is the **vertical tool**
underneath it. Locked input model = **both**:

- **Selection-as-references:** multi-select images on the wall (tap to add to a
  tray) → they become the reference set (Nano Banana takes up to 20) → bare
  prompt line → generate.
- **Board-level "deepen":** one `deepen` action on a PLAN feeds the *whole
  composition* — representative images from the wired sources + an optional board
  "intent" line — as context, and generates variations / world-building along the
  board's direction. This is the literal "take my lateral composition, go
  vertical."
- **Output:** a small set of variations returns; keep or dismiss. Kept ones land
  as blocks (§2.2).
- Engines unchanged from PLAN2: **Nano Banana** primary (stills), **Higgsfield**
  for image→video / motion.

### 2.2 Raw-by-default outputs (digital-raw)

- Generations are **not** auto-enhanced, upscaled, or retouched. Keep texture,
  seams, grain. "Precision flattens everything into the same smooth nothing."
- **Concrete:** no upscaler in the pipeline by default; light compression only;
  never "beautify." If a control is exposed, make it a *rougher* option, not an
  *enhance* one.
- Blocks carry `origin: generated` + `raw: true`, but the wall shows **no badge**
  — the image is the interface. They behave like any other block.

### 2.3 Private by default + selective sharing + multiverse  *(architectural; overrides the public model)*

- **Private by default.** A user's boards/sandbox are private. The current v1
  live public wall becomes *"a published board,"* not the default state.
- **Selective, opt-in sharing.** You publish only chosen pieces (individual
  blocks or a curated subset), never a whole-board broadcast. A shared thing = a
  stable link. "tend a personal page," not "post."
- **Multiverse (conservative default — see Open Questions).** Others' shared
  boards can sit *alongside* yours **only if you pull them in** (paste a link /
  add as a read-only source node). No feed, no discovery, nothing pushed.
  "connection possible; consumption never demanded."
- **Implication:** private-by-default **requires accounts/auth**, which resolves
  PLAN2's "personal-first vs multi-user" question toward *accounts needed* and
  **moves auth into the v2.2 data-layer migration.** Sharing = per-block
  visibility flags on a per-user model.

### 2.4 Board as a building-stone (lineage)

- A board seeds the next. Support **fork / carry-forward:** spawn a new PLAN
  pre-seeded from an existing board (or from a selection), so projects build on
  each other.
- **Data:** boards get a `parent_id` / lineage ref; kept generations and curated
  selections carry into the child.
- **UX:** `start from this` on a board or selection → new PLAN with those blocks
  already wired.

### 2.5 Lifestyle-brand identity  *(design lens, not a single feature)*

- "a studio you belong to," designer sensibility, unusual by default, every
  detail has a point of view. Drives: the near-invisible UI (chosen), a
  distinctive-but-plain lowercase typeface, onboarding that feels like entering a
  studio (not a SaaS signup), restraint **with** edge. A lens on every UI
  decision, not a build ticket.

### 2.6 The "mirror" mechanism (curation quality)

- Because only what speaks to you gets in, the board self-inspires. Product
  consequence: **never auto-inject generic content.** Connectors pull *your*
  sources only; no suggestions, no discovery on the wall. Reinforces §2.3.

---

## 3. What carries over UNCHANGED from PLAN2

Data model (Source / Block / Board→PLAN / View), node editor UX (bottom-docked,
PLAN node double-click-to-activate, Viewport port, `+ add directories`),
connector set + build order (Upload, **Are.na** first, **IG** done, **Pinterest**
gated), background palette (§4), scramble, zoom-on-move parallax, DOM
virtualization, the Cloudflare **R2 + D1 + Workers** data layer, and **speed as a
hard constraint** (PLAN2 §10). Global find-and-replace in intent: wherever PLAN2
says *"glass"* read *near-invisible UI*; wherever it says *"subscription"* read
*pay-per-use*.

---

## 4. Revised milestones (PLAN3 folded into PLAN2's)

- **v2.0 — Motion, Scramble, backgrounds + DE-GLASS.** Strip liquid glass now;
  ship the near-invisible / text-only UI + lowercase copy; scramble (rename of
  shuffle) with arrows mark; zoom-on-move; reduced-motion. *Frontend-only, ships
  on the current stack, touches the live site.* (Gated on the typeface +
  legibility decisions — Open Questions.)
- **v2.1 — Upload + Are.na connector.** (unchanged)
- **v2.2 — Data layer + accounts + private-by-default.** Cloudflare R2/D1/Workers,
  **auth**, per-user private sandbox, full ~2k IG archive import.
- **v2.3 — Node editor & PLANs + board lineage** (fork / carry-forward).
- **v2.4 — AI create (both inputs) + pay-per-use billing.** Selection refs +
  board-level deepen, raw-by-default outputs, Nano Banana / Higgsfield; free
  pool + invisible daily settlement (Stripe usage-based). **Headline paid tier.**
- **v2.5 — Pinterest connector.**
- **v2.6 — Selective sharing + multiverse pull-in** (link-based).
- **v2.7 — AI search** (embeddings).

---

## 5. Open questions (with my proposed defaults)

- **Typeface for the text-only UI** — now load-bearing (text *is* the identity).
  Needs a pick: a distinctive-but-plain lowercase type. *Want to choose one, or
  should I propose 2–3 candidates?*
- **Legibility of text over images** — proposed default `mix-blend-mode:
  difference` for auto-contrast, faint shadow only as fallback. OK?
- **Multiverse depth** — default: link-based pull-in only, no discovery. Confirm,
  or do you want a browsable (but never-pushed) public layer later?
- **Free-pool size & per-generation price** — set at launch; cost basis
  ~$0.039/image.
- **Payment provider** — propose **Stripe** usage-based billing for the daily
  settlement model. OK?
