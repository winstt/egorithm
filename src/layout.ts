import type { FeedItem, Placement } from './types'
import { mulberry32, hash3 } from './rng'

const MIN_W = 180
const MAX_W = 420
const MARGIN = 26
const EDGE_PAD = 30
const SPREAD = 3.0
const ATTEMPTS = 60
const CACHE_MAX = 96

interface Rect { x: number; y: number; w: number; h: number }

function overlapArea(a: Rect, b: Rect, margin: number): number {
  const ox = Math.min(a.x + a.w + margin, b.x + b.w + margin) - Math.max(a.x - margin, b.x - margin)
  const oy = Math.min(a.y + a.h + margin, b.y + b.h + margin) - Math.max(a.y - margin, b.y - margin)
  return ox > 0 && oy > 0 ? ox * oy : 0
}

/**
 * Seeded scatter layout. The world is an infinite grid of square tiles;
 * every tile contains all feed items, placed by a PRNG seeded from
 * (seed, tileX, tileY), so each repetition is jittered differently.
 * Same seed + same feed = identical world.
 */
export class Layout {
  readonly tileSize: number
  private cache = new Map<string, Placement[]>()

  constructor(readonly items: FeedItem[], public seed: number) {
    const avgW = (MIN_W + MAX_W) / 2
    const area = items.reduce((sum, it) => sum + avgW * (avgW * it.h / it.w), 0)
    this.tileSize = Math.max(800, Math.ceil(Math.sqrt(area * SPREAD)))
  }

  reseed(seed: number): void {
    this.seed = seed
    this.cache.clear()
  }

  tile(tx: number, ty: number): Placement[] {
    const key = `${tx},${ty}`
    const hit = this.cache.get(key)
    if (hit) return hit

    const rand = mulberry32(hash3(this.seed, tx, ty))
    const order = [...this.items]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }

    const T = this.tileSize
    const placed: Rect[] = []
    const out: Placement[] = []
    for (const item of order) {
      const w = MIN_W + rand() * (MAX_W - MIN_W)
      const h = w * item.h / item.w
      let best: Rect | null = null
      let bestOverlap = Infinity
      for (let k = 0; k < ATTEMPTS; k++) {
        const cand: Rect = {
          x: EDGE_PAD + rand() * Math.max(1, T - w - EDGE_PAD * 2),
          y: EDGE_PAD + rand() * Math.max(1, T - h - EDGE_PAD * 2),
          w, h,
        }
        let ov = 0
        for (const r of placed) {
          ov += overlapArea(cand, r, MARGIN)
          if (ov >= bestOverlap) break
        }
        if (ov < bestOverlap) {
          bestOverlap = ov
          best = cand
          if (ov === 0) break
        }
      }
      placed.push(best!)
      out.push({ item, x: tx * T + best!.x, y: ty * T + best!.y, w: best!.w, h: best!.h })
    }

    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, out)
    return out
  }
}
