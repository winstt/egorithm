# EGORITHM — Plan

**One-line:** A plain, infinite visual moodboard on GitHub Pages, two-way linked to an Instagram account — the site mirrors the IG feed, and pictures added through the site get published to IG (single image, no caption).

This file is the source of truth. Update it when decisions change.

---

## 1. Hard constraints (verified July 2026)

These are Instagram platform facts the whole architecture is built around:

1. **A personal IG account cannot be used.** The account must be converted to a **Professional account (Creator or Business)**. Reading media and publishing both go through the Instagram Graph API.
2. Two API flavors exist. We use **"Instagram API with Instagram Login"** — it does *not* require a linked Facebook Page (the older "with Facebook Login" flavor does).
3. **Publishing is a two-step call:** `POST /{ig-user-id}/media` (creates a container from a **publicly reachable image URL**, JPEG) → `POST /{ig-user-id}/media_publish`. Caption is optional — omitting it gives exactly the "no description" post we want.
4. **Tokens:** Instagram User long-lived token, valid **60 days**, refreshable via `GET /refresh_access_token` any time after it's 24h old. Must be refreshed on a schedule or the pipeline dies silently.
5. Own-account use (owner is a tester/admin on the Meta app) needs **no App Review**. Review (2–4 weeks) only matters if other people's accounts ever connect — that's a "future" concern.
6. API publishing is rate-limited (rolling window, ~25–50 posts/day) — irrelevant for a personal moodboard but documented.

Required permissions/scopes: `instagram_business_basic`, `instagram_business_content_publish`.

---

## 2. Architecture — "GitHub is the backend"

No servers. Three GitHub features cover everything. The repo must be **public** — free GitHub Pages and publicly reachable raw URLs (which IG ingests from) both depend on it; the images are on a public IG feed anyway. Site is served at `<user>.github.io/egorithm/`, so Vite `base` must be set accordingly (until a custom domain).

```
┌─────────────────────────── repo: egorithm ───────────────────────────┐
│                                                                      │
│  /site            static frontend (Vite + vanilla TS)                │
│  /data/feed.json  mirror of the IG feed (id, url, w, h, timestamp)   │
│  /media/          committed copies of images (also serve as the      │
│                   public URLs Instagram ingests from)                │
│  /queue/          images dropped here → get published to IG          │
│  /.github/workflows                                                  │
│      sync.yml     cron (hourly) + manual: IG → feed.json             │
│      publish.yml  on push to /queue: queue → IG → feed.json          │
│      refresh.yml  cron (1st + 15th monthly): refresh 60-day token    │
│      deploy.yml   build site → GitHub Pages                          │
└──────────────────────────────────────────────────────────────────────┘
```

**Read path (IG → site):** `sync.yml` calls `GET /me/media?fields=id,media_type,media_url,permalink,timestamp` (paginated — follow `paging.next` until exhausted), keeps only `media_type == IMAGE` for now, downloads images into `/media/`, writes `feed.json`, commits. Pages redeploys. Notes:
- **The API does not return image dimensions** — `width`/`height` are not queryable fields on `/me/media`. Derive them from the downloaded file (e.g. `identify`/`sips`) and store in `feed.json`; the layout engine needs them before images load.
- *Images are committed rather than hotlinked because IG `media_url`s expire after a few days.*
- Sync is a **full reconciliation**: `feed.json` mirrors exactly what the API returns, so posts deleted on IG disappear from the board (their files pruned from `/media/`).

**Write path (site → IG):** adding a picture = getting a file into `/queue/`.
`publish.yml` fires on push: takes each queued JPEG, its raw URL (`raw.githubusercontent.com/...`) is already public, so the workflow creates the media container from that URL, **polls the container's `status_code` until `FINISHED`** (ingestion is async; `ERROR` → move to `/queue/failed/`), calls `media_publish`, then moves the file into `/media/`, updates `feed.json`, commits.
- *M0 must verify IG accepts a raw.githubusercontent URL (content-type quirks); fallback: the GitHub Pages URL or jsDelivr (`cdn.jsdelivr.net/gh/...`) for the same committed file.*
- All committing workflows share a `concurrency` group and push with rebase-retry, so `sync` and `publish` can't race each other on `feed.json`.

**How the site itself uploads to `/queue/`:** the frontend calls the GitHub Contents API (`PUT /repos/{owner}/egorithm/contents/queue/{name}.jpg`) using a **fine-grained PAT** (contents: read/write, this repo only) that the owner pastes once into the menu; it's kept in `localStorage`. Visitors without the token simply see a read-only board. This is the entire "auth system" — good enough for a single-owner project, revisit if it ever goes multi-user.

**Secrets (GitHub Actions secrets):** `IG_USER_ID`, `IG_ACCESS_TOKEN` (long-lived). `refresh.yml` refreshes the token and writes it back with `gh secret set` (needs a repo-admin PAT stored as `ADMIN_PAT`).

---

## 3. Frontend

**Stack:** Vite + vanilla TypeScript + plain CSS. No framework — the whole app is one canvas-like view, a lightbox, and a menu. Everything renders as absolutely-positioned `<img>` elements inside a transformed world `<div>` (real DOM, not `<canvas>`, so images stay crisp, lazy-load natively, and animations are CSS).

**Aesthetic:** very plain. White (or near-black in dark mode) background, no chrome, no text except minimal labels in the menu. The images *are* the interface.

### 3.1 The infinite field

- A "world" plane the user pans freely (pointer drag, touch drag, wheel/trackpad; inertia on release). Pinch/ctrl-wheel zoom between ~0.5× and ~2×.
- **Layout algorithm — seeded scatter:** given the N feed items and a seed, each image gets a world position and a display width. Placement is Poisson-disc-like: candidate points from a seeded PRNG, rejected if they'd overlap an already-placed rect (small margin), images keep native aspect ratio at randomized widths (~180–420 px). Deterministic: same seed + same feed = same board.
- **Infinity:** the world is tiled — the packed cluster (its bounding box + padding) repeats on a grid in every direction, each tile re-jittered from `seed ⊕ tileCoord` so repetition isn't obvious. Pan forever, always find images.
- **Virtualization:** only items intersecting the viewport + one viewport of margin exist in the DOM. On pan/zoom (rAF-throttled), spatial-hash lookup mounts/unmounts items. Target: <300 live nodes regardless of feed size.

### 3.2 Click to expand

- Click/tap an image → **FLIP animation**: the image smoothly scales/translates from its field position to centered, fit-to-viewport (~90vmin), rest of the field dims and blurs slightly. *Implementation note: the expanding image must be re-parented (or cloned) into a fixed overlay layer outside the zoomed/panned world `<div>`, with the world transform folded into the FLIP start state — animating inside a scaled parent gives wrong coordinates.*
- Click anywhere / Esc / pinch-in → same animation back. No metadata shown — just the picture. (Long-press → link to the IG post, hidden convenience.)

### 3.3 The liquid-glass control

- One floating circle, bottom-right — the only UI chrome. Apple liquid-glass look: `backdrop-filter: blur() saturate()`, translucent fill, 1px inner light border, soft shadow, plus an SVG displacement filter for the refractive edge where supported (`@supports` fallback to plain frosted glass).
- Tap → morphs open (spring-ish CSS transition) into a vertical pill menu:
  - **Add** — file picker / drag-drop → client-side: re-encode to JPEG, downscale to ≤1440px, aspect clamped to IG's accepted range (crop prompt if outside 4:5–1.91:1) → upload to `/queue/` via Contents API → optimistic placeholder appears on the board with a subtle "publishing…" pulse until the next `feed.json` shows it live.
  - **Shuffle** — new random seed → recompute layout → visible items animate (~600ms ease) to new positions, viewport recenters on the cluster.
  - (menu is built as a list so future actions slot in)

### 3.4 Responsive

- Pure viewport-driven: display widths scale with `min(vw, vh)`, touch and pointer input first-class, safe-area insets respected for the glass button. Works identically from phone to ultrawide.

---

## 4. Milestones

**M0 — Instagram plumbing (blocking, do first)**
Convert IG account to Creator. Create Meta app (Instagram API with Instagram Login), add owner as tester, complete the login flow once by hand to obtain the long-lived token. Verify with `curl`: fetch `/me/media` (paginated), then publish one test image **from a raw.githubusercontent.com URL specifically** — this validates the whole no-server design; if IG rejects the raw URL, switch the plan to the Pages/jsDelivr fallback. *Nothing else matters until this round-trips.*

**M1 — Static board**
Repo + Pages + `deploy.yml`. `sync.yml` producing `feed.json` + `/media/`. Site renders the feed as the seeded scatter (no infinity yet), lazy-loaded, responsive. → *Deployed URL showing the real IG feed.*

**M2 — Infinite field**
Tiling + virtualization + pan/zoom with inertia. Perf pass (Lighthouse, throttled mobile).

**M3 — Interactions**
FLIP expand/collapse, liquid-glass button + menu, Shuffle.

**M4 — Publish pipeline**
`publish.yml`, client-side JPEG processing + Contents-API upload, optimistic placeholder, `refresh.yml` token refresh. → *Full loop: drop a picture on the site, see it appear on Instagram.*

**M5 — Hardening**
Failure states (bad token, IG rejection → queue file moved to `/queue/failed/` + red pulse on placeholder), dark mode, reduced-motion support, README.

---

## 5. Risks / open items

| Risk | Mitigation |
|---|---|
| Token expires silently (60d) | `refresh.yml` twice a month + workflow failure notifications to email |
| **GitHub disables cron workflows after 60 days without repo activity** — would kill sync *and* token refresh | keepalive step in `refresh.yml`: bump a `.keepalive` file so every run is a commit; verify workflows still enabled when returning to the project after a break |
| `ADMIN_PAT` (used to rotate the IG token secret) itself expires (fine-grained PATs ≤ 1 year) | set a calendar reminder at creation; `refresh.yml` fails loudly if the PAT is dead |
| IG rejects aspect ratio (must be 4:5 → 1.91:1) | client-side crop prompt before upload |
| `media_url` expiry | never hotlink; images always committed to `/media/` |
| Meta API version deprecations (~2yr lifecycle) | pin version (v21.0), note upgrade in this file |
| Repo size growth from committed images | downscale to ≤1440px JPEG (~200–400 KB each); thousands of posts before it matters |
| PAT in localStorage | fine-grained, single-repo, contents-only; rotate if leaked; owner-only threat model |

## 6. Future (explicitly out of scope now)

- More sources/sinks beyond Instagram (the sync/publish workflows are the extension points — anything that can read/write `feed.json` and `/queue/` plugs in).
- Multi-account / other users (would force Meta App Review + a real auth story).
- Curated arrangements (saving a hand-tuned layout instead of seeded scatter).
- Custom domain.
