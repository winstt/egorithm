# EGORITHM — Plan

**One-line:** A plain, infinite visual moodboard on GitHub Pages, two-way linked to an Instagram account — the site mirrors the IG feed, and pictures added through the site get published to IG (single image, no caption).

> **Superseded by `PLAN4.md`** — the consolidated build-from plan. This file is
> kept as the v1 / live-site baseline and historical record.

**This file = v1 (the live site's baseline).** History: `PLAN.md` (v1, live) →
`PLAN2.md` (v2 vision) → `PLAN3.md` (philosophy overrides) → **`PLAN4.md`
(consolidated — build from this)**. Visual styling is **deferred** (owner,
2026-07-20 — see §3.3).

---

## 1. Hard constraints (verified & set up July 2026)

These are the Instagram platform facts the architecture is built around. **M0 is
complete** — the values below are the real, working configuration.

1. **A personal IG account cannot be used.** The target account `y0ungtrailblaze`
   (IG Business account, ~2251 posts) is a Professional account. Reading and
   publishing both go through the **Facebook Graph API** (`graph.facebook.com/v21.0`).
2. **We use the "Instagram API with Facebook Login" flavor.** The "Instagram
   Login" flavor was attempted first but blocked in Development mode by the
   Instagram-Tester role requirement (Meta had "create test users" temporarily
   disabled). Facebook Login requires the IG account to be connected to a
   **Facebook Page** — so a dedicated empty page **"Egorithm"** (id `1179725761896560`)
   was created and `y0ungtrailblaze` linked to it.
3. **Key IDs / tokens:**
   - Meta App ID: `1488034773079990` (app name **EGORITHM-IG**, type Business)
   - IG Business Account ID: **`17841470673507793`** → secret `IG_BUSINESS_ID`
   - **Long-lived Page access token** → secret `IG_PAGE_TOKEN`. Derived from a
     60-day long-lived *user* token, so the *page* token **does not expire**
     (valid until password change / permission revoke). This removes the whole
     60-day token-refresh problem the plan originally carried.
4. **Publishing is a two-step call:** `POST /{ig-business-id}/media` (creates a
   container from a **publicly reachable JPEG URL**) → poll `status_code` until
   `FINISHED` → `POST /{ig-business-id}/media_publish`. Caption omitted = the
   "no description" post we want. **Verified working** with a picsum test image.
5. Own-account use needs **no App Review** (owner is app admin). Review only
   matters if other people's accounts ever connect — a "future" concern.
6. API publishing is rate-limited (~25–50 posts/day) — irrelevant here.

Granted permissions: `instagram_basic`, `instagram_content_publish`,
`pages_show_list`, `pages_read_engagement`, `business_management`.

> If the Page token ever breaks: re-run the Graph API Explorer → exchange for a
> long-lived user token → `GET /{page-id}?fields=access_token` to mint a fresh
> non-expiring Page token, and update the `IG_PAGE_TOKEN` secret.

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
│      deploy.yml   build site → GitHub Pages                          │
└──────────────────────────────────────────────────────────────────────┘
```

**Read path (IG → site):** `sync.yml` calls `GET /{ig-business-id}/media?fields=id,media_type,media_url,permalink,timestamp` (paginated), keeps only `media_type == IMAGE`, mirrors the **newest `MAX_POSTS` (default 300)** into `/media/`, writes `feed.json`, commits. Pages redeploys. Notes:
- **The account has ~2251 posts** — mirroring all of them would bloat the repo to hundreds of MB, so sync caps at the newest `MAX_POSTS`. Raise the cap later if wanted.
- **The API does not return image dimensions** — derive `w`/`h` from the downloaded file (a tiny built-in JPEG SOF-marker reader in `lib.mjs`, no deps) and store in `feed.json`; the layout engine needs them before images load.
- *Images are committed rather than hotlinked because IG `media_url`s expire after a few days.*
- Sync reconciles within the window: files outside the newest `MAX_POSTS` are pruned from `/media/`.

**Write path (site → IG):** adding a picture = getting a file into `/queue/`.
`publish.yml` fires on push: takes each queued JPEG, its raw URL (`raw.githubusercontent.com/...`) is already public, so the workflow creates the media container from that URL, **polls the container's `status_code` until `FINISHED`** (ingestion is async; `ERROR` → move to `/queue/failed/`), calls `media_publish`, then moves the file into `/media/`, updates `feed.json`, commits.
- *Fallback if raw.githubusercontent URLs are ever rejected: GitHub Pages URL or jsDelivr (`cdn.jsdelivr.net/gh/...`) for the same committed file.*
- All committing workflows share a `concurrency` group and push with rebase-retry, so `sync` and `publish` can't race each other on `feed.json`.

**How the site itself uploads to `/queue/`:** the frontend calls the GitHub Contents API (`PUT /repos/{owner}/egorithm/contents/queue/{name}.jpg`) using a **fine-grained PAT** (contents: read/write, this repo only) that the owner pastes once into the menu; it's kept in `localStorage`. Visitors without the token simply see a read-only board. This is the entire "auth system" — good enough for a single-owner project, revisit if it ever goes multi-user.

**Secrets (GitHub Actions secrets):** `IG_BUSINESS_ID` (`17841470673507793`) and `IG_PAGE_TOKEN` (non-expiring long-lived Page token). No token-refresh workflow needed — this is the payoff of the Facebook-Login route.

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

### 3.3 The control (bottom-right menu)

> **Visuals DEFERRED (owner, 2026-07-20).** The liquid-glass treatment below is
> the *v1 build only*. Per `PHILOSOPHY.md` the look moves **away from glass**
> (leaning near-invisible / text-only, `PLAN3 §1.1`), but all visual styling is
> deferred to a later pass — treat the aesthetic as **open, not locked**. The
> *functionality* (the menu, Add / Scramble) stands regardless of the skin.

- One floating circle, bottom-right — the only UI chrome. Apple liquid-glass look: `backdrop-filter: blur() saturate()`, translucent fill, 1px inner light border, soft shadow, plus an SVG displacement filter for the refractive edge where supported (`@supports` fallback to plain frosted glass).
- Tap → morphs open (spring-ish CSS transition) into a vertical pill menu:
  - **Add** — file picker / drag-drop → client-side: re-encode to JPEG, downscale to ≤1440px, aspect clamped to IG's accepted range (crop prompt if outside 4:5–1.91:1) → upload to `/queue/` via Contents API → optimistic placeholder appears on the board with a subtle "publishing…" pulse until the next `feed.json` shows it live.
  - **Shuffle** — new random seed → recompute layout → visible items animate (~600ms ease) to new positions, viewport recenters on the cluster.
  - (menu is built as a list so future actions slot in)

### 3.4 Responsive

- Pure viewport-driven: display widths scale with `min(vw, vh)`, touch and pointer input first-class, safe-area insets respected for the glass button. Works identically from phone to ultrawide.

---

## 4. Milestones

> **Build status (2026-07-20): the site is LIVE at winstt.github.io/egorithm.**
> **M0–M3 done. M4 built but not yet run end-to-end from the browser** (needs the
> owner's fine-grained PAT pasted into the menu once). **M5 partial** —
> failed-queue handling, dark mode, and reduced-motion are all present in code;
> **README still missing**. The M3 glass bits are superseded per §3.3. The M0
> "remaining tail" note below is **done** (repo, secrets, and Pages are all up).

**M0 — Instagram plumbing ✅ DONE (2026-07-20)**
IG account is Professional; Meta app **EGORITHM-IG** created; `y0ungtrailblaze`
linked to the **Egorithm** Facebook Page; long-lived non-expiring Page token
obtained; `/media` read (2251 posts) and a test publish both verified via `curl`.
Route ended up as **Facebook Login** (not Instagram Login) — see §1. IDs/tokens
live there. Remaining M0 tail: create the GitHub repo, set the two secrets,
enable Pages.

**M1 — Static board**
Repo + Pages + `deploy.yml`. `sync.yml` producing `feed.json` + `/media/`. Site renders the feed as the seeded scatter (no infinity yet), lazy-loaded, responsive. → *Deployed URL showing the real IG feed.*

**M2 — Infinite field**
Tiling + virtualization + pan/zoom with inertia. Perf pass (Lighthouse, throttled mobile).

**M3 — Interactions**
FLIP expand/collapse, liquid-glass button + menu, Shuffle.

**M4 — Publish pipeline**
`publish.yml`, client-side JPEG processing + Contents-API upload, optimistic placeholder. (No token-refresh workflow — Page token is non-expiring.) → *Full loop: drop a picture on the site, see it appear on Instagram.*

**M5 — Hardening**
Failure states (bad token, IG rejection → queue file moved to `/queue/failed/` + red pulse on placeholder), dark mode, reduced-motion support, README.

---

## 5. Risks / open items

| Risk | Mitigation |
|---|---|
| Page token invalidated (password change / revoke) | rare; recovery steps documented in §1. Non-expiring by default, so no scheduled refresh |
| **GitHub disables cron workflows after 60 days without repo activity** — would silently stop the hourly sync | any publish or manual run re-arms it; if returning after a long break, check Actions tab is enabled. (No keepalive workflow now that refresh is gone — revisit if the board is left untouched for months) |
| IG rejects aspect ratio (must be 4:5 → 1.91:1) | client-side crop into range before upload (`upload.ts`) |
| `media_url` expiry | never hotlink; images always committed to `/media/` |
| Meta API version deprecations (~2yr lifecycle) | pin version (v21.0), note upgrade in this file |
| Repo size growth from committed images | mirror only newest `MAX_POSTS` (300); downscale uploads to ≤1440px JPEG |
| PAT in localStorage | fine-grained, single-repo, contents-only; rotate if leaked; owner-only threat model |
| **App Secret was pasted in chat during setup** | already reset once; if reusing, reset again in App Settings → Basic. Page token does not embed the secret, so the live pipeline is unaffected |

## 6. Future (explicitly out of scope now)

- More sources/sinks beyond Instagram (the sync/publish workflows are the extension points — anything that can read/write `feed.json` and `/queue/` plugs in).
- Multi-account / other users (would force Meta App Review + a real auth story).
- Curated arrangements (saving a hand-tuned layout instead of seeded scatter).
- Custom domain.
