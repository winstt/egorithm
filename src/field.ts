import type { Placement } from './types'
import { Layout } from './layout'

const MIN_SCALE = 0.18  // bigger zoom-out (was 0.5)
const MAX_SCALE = 2
const VIEW_MARGIN = 0.5 // extra viewport fractions rendered on each side
const MAX_NODES = 500   // hard cap on live <img> nodes — protects zoom-out perf
const CLICK_SLOP = 6

interface PendingItem {
  id: string
  src: string
  x: number
  y: number
  w: number
  h: number
  el?: HTMLImageElement
}

/**
 * Infinite pannable/zoomable field. Renders only placements intersecting
 * the viewport (+margin) as absolutely-positioned <img> nodes inside #world,
 * which carries the pan/zoom transform.
 */
export class Field {
  private view = { x: 0, y: 0, scale: 1 }
  private mounted = new Map<string, HTMLImageElement>()
  private pending: PendingItem[] = []
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchDist = 0
  private velocity = { x: 0, y: 0 }
  private lastMove = 0
  private downPos = { x: 0, y: 0 }
  private moved = false
  private rafPending = false
  private inertiaRaf = 0
  private prefetched = new Set<string>()
  private seen = new Set<string>()

  constructor(
    private container: HTMLElement,
    private world: HTMLElement,
    private layout: Layout,
    private onItemClick: (el: HTMLImageElement, p: Placement) => void,
  ) {
    this.centerOnOrigin()
    this.bindInput()
    this.scheduleUpdate()
    window.addEventListener('resize', () => this.scheduleUpdate())
  }

  private centerOnOrigin(): void {
    const T = this.layout.tileSize
    this.view.x = T / 2 - innerWidth / 2
    this.view.y = T / 2 - innerHeight / 2
  }

  setLayout(layout: Layout): void {
    this.layout = layout
    this.clear()
    this.scheduleUpdate()
  }

  /** Reseed in place and glide mounted items to their new spots. */
  shuffle(): void {
    this.layout.reseed((Math.random() * 0x7fffffff) | 0)
    this.world.classList.add('animate')
    const byTile = new Map<string, Placement[]>()
    for (const [key, el] of this.mounted) {
      const [tx, ty] = key.split(':')[0].split(',').map(Number)
      const tileKey = `${tx},${ty}`
      if (!byTile.has(tileKey)) byTile.set(tileKey, this.layout.tile(tx, ty))
      const p = byTile.get(tileKey)!.find(pl => pl.item.id === key.split(':')[1])
      if (p) this.applyPlacement(el, p)
    }
    setTimeout(() => {
      this.world.classList.remove('animate')
      this.scheduleUpdate()
    }, 650)
  }

  /** Optimistic placeholder at the viewport center; not part of the tiled layout. */
  addPending(id: string, src: string, w: number, h: number): void {
    const dispW = 300
    const dispH = dispW * h / w
    const cx = this.view.x + innerWidth / 2 / this.view.scale
    const cy = this.view.y + innerHeight / 2 / this.view.scale
    this.pending.push({ id, src, x: cx - dispW / 2, y: cy - dispH / 2, w: dispW, h: dispH })
    this.scheduleUpdate()
  }

  markPendingFailed(id: string): void {
    const p = this.pending.find(pi => pi.id === id)
    p?.el?.classList.replace('pending', 'failed')
  }

  resolvePending(id: string): void {
    const i = this.pending.findIndex(pi => pi.id === id)
    if (i >= 0) {
      this.pending[i].el?.remove()
      this.pending.splice(i, 1)
    }
  }

  hasPending(): boolean {
    return this.pending.length > 0
  }

  private clear(): void {
    for (const el of this.mounted.values()) el.remove()
    this.mounted.clear()
  }

  private scheduleUpdate(): void {
    if (this.rafPending) return
    this.rafPending = true
    requestAnimationFrame(() => {
      this.rafPending = false
      this.update()
    })
  }

  private update(): void {
    const { x, y, scale } = this.view
    this.world.style.transform = `translate3d(${-x * scale}px, ${-y * scale}px, 0) scale(${scale})`

    const T = this.layout.tileSize
    const mx = (innerWidth * VIEW_MARGIN) / scale
    const my = (innerHeight * VIEW_MARGIN) / scale
    const left = x - mx
    const top = y - my
    const right = x + innerWidth / scale + mx
    const bottom = y + innerHeight / scale + my

    let needed = new Map<string, Placement>()
    for (let tx = Math.floor(left / T); tx <= Math.floor(right / T); tx++) {
      for (let ty = Math.floor(top / T); ty <= Math.floor(bottom / T); ty++) {
        for (const p of this.layout.tile(tx, ty)) {
          if (p.x + p.w > left && p.x < right && p.y + p.h > top && p.y < bottom) {
            needed.set(`${tx},${ty}:${p.item.id}`, p)
          }
        }
      }
    }

    // Zoomed far out the viewport can cover thousands of images — keep only the
    // nearest MAX_NODES to the viewport centre so the DOM stays bounded.
    if (needed.size > MAX_NODES) {
      const cx = x + innerWidth / scale / 2
      const cy = y + innerHeight / scale / 2
      needed = new Map(
        [...needed].sort(([, a], [, b]) => {
          const da = (a.x + a.w / 2 - cx) ** 2 + (a.y + a.h / 2 - cy) ** 2
          const db = (b.x + b.w / 2 - cx) ** 2 + (b.y + b.h / 2 - cy) ** 2
          return da - db
        }).slice(0, MAX_NODES),
      )
    }

    for (const [key, el] of this.mounted) {
      if (!needed.has(key)) {
        el.remove()
        this.mounted.delete(key)
      }
    }
    for (const [key, p] of needed) {
      if (!this.mounted.has(key)) this.mounted.set(key, this.mount(key, p))
    }

    for (const pi of this.pending) {
      if (!pi.el) {
        pi.el = document.createElement('img')
        pi.el.src = pi.src
        pi.el.className = 'ph pending loaded'
        pi.el.style.width = `${pi.w}px`
        pi.el.style.height = `${pi.h}px`
        pi.el.style.transform = `translate3d(${pi.x}px, ${pi.y}px, 0)`
        pi.el.draggable = false
        this.world.appendChild(pi.el)
      }
    }

    this.prefetchRing(left, top, right, bottom, mx, my, T)
  }

  /** Warm thumbnails one ring beyond the mounted margin so panning never pops. */
  private prefetchRing(left: number, top: number, right: number, bottom: number, mx: number, my: number, T: number): void {
    if (this.view.scale < 0.4) return // zoomed out: too many to prefetch, skip
    const oL = left - mx, oT = top - my, oR = right + mx, oB = bottom + my
    for (let tx = Math.floor(oL / T); tx <= Math.floor(oR / T); tx++) {
      for (let ty = Math.floor(oT / T); ty <= Math.floor(oB / T); ty++) {
        for (const p of this.layout.tile(tx, ty)) {
          const key = `${tx},${ty}:${p.item.id}`
          if (this.mounted.has(key) || this.prefetched.has(key)) continue
          if (p.x + p.w > oL && p.x < oR && p.y + p.h > oT && p.y < oB) {
            const im = new Image()
            im.decoding = 'async'
            im.src = p.item.thumb
            this.prefetched.add(key)
          }
        }
      }
    }
    if (this.prefetched.size > 1200) this.prefetched.clear()
  }

  private mount(key: string, p: Placement): HTMLImageElement {
    const el = document.createElement('img')
    el.src = p.item.thumb
    el.loading = 'lazy'
    el.decoding = 'async'
    el.className = 'ph'
    el.draggable = false
    el.dataset.key = key
    this.applyPlacement(el, p)
    if (this.seen.has(key)) {
      el.classList.add('instant', 'loaded') // already discovered — skip the pop
    } else {
      this.seen.add(key)
      if (this.seen.size > 4000) this.seen.clear()
      const reveal = (): void => el.classList.add('loaded')
      // rAF so the initial (scale 0.9) state paints once → the popout transitions
      if (el.complete) requestAnimationFrame(reveal)
      else el.addEventListener('load', reveal, { once: true })
    }
    ;(el as HTMLImageElement & { _p?: Placement })._p = p
    this.world.appendChild(el)
    return el
  }

  private applyPlacement(el: HTMLImageElement, p: Placement): void {
    el.style.width = `${p.w}px`
    el.style.height = `${p.h}px`
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
    ;(el as HTMLImageElement & { _p?: Placement })._p = p
  }

  private bindInput(): void {
    const c = this.container
    c.addEventListener('pointerdown', e => {
      cancelAnimationFrame(this.inertiaRaf)
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      c.setPointerCapture(e.pointerId)
      if (this.pointers.size === 1) {
        this.downPos = { x: e.clientX, y: e.clientY }
        this.moved = false
        this.velocity = { x: 0, y: 0 }
        c.classList.add('dragging')
      } else if (this.pointers.size === 2) {
        this.pinchDist = this.pointerDist()
      }
    })

    c.addEventListener('pointermove', e => {
      const prev = this.pointers.get(e.pointerId)
      if (!prev) return
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (this.pointers.size === 2) {
        const d = this.pointerDist()
        if (this.pinchDist > 0) {
          const pts = [...this.pointers.values()]
          const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
          this.zoomAt(mid.x, mid.y, d / this.pinchDist)
        }
        this.pinchDist = d
        this.moved = true
        return
      }

      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > CLICK_SLOP) this.moved = true
      this.view.x -= dx / this.view.scale
      this.view.y -= dy / this.view.scale
      const now = performance.now()
      const dt = Math.max(1, now - this.lastMove)
      this.velocity = { x: (dx / dt) * 16, y: (dy / dt) * 16 }
      this.lastMove = now
      this.scheduleUpdate()
    })

    const end = (e: PointerEvent): void => {
      const wasSingle = this.pointers.size === 1
      this.pointers.delete(e.pointerId)
      if (this.pointers.size === 0) c.classList.remove('dragging')
      if (this.pointers.size === 1) this.pinchDist = 0

      if (wasSingle && !this.moved && e.type === 'pointerup') {
        const target = e.target as HTMLElement
        if (target instanceof HTMLImageElement && target.classList.contains('ph') && !target.classList.contains('pending')) {
          const p = (target as HTMLImageElement & { _p?: Placement })._p
          if (p) this.onItemClick(target, p)
        }
      } else if (wasSingle && this.moved && this.pointers.size === 0) {
        this.startInertia()
      }
    }
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)

    c.addEventListener('wheel', e => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
      } else {
        this.view.x += e.deltaX / this.view.scale
        this.view.y += e.deltaY / this.view.scale
      }
      this.scheduleUpdate()
    }, { passive: false })

    document.addEventListener('gesturestart', e => e.preventDefault())
  }

  private pointerDist(): number {
    const pts = [...this.pointers.values()]
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  }

  private zoomAt(px: number, py: number, factor: number): void {
    const s = this.view.scale
    const s2 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor))
    if (s2 === s) return
    this.view.x = this.view.x + px / s - px / s2
    this.view.y = this.view.y + py / s - py / s2
    this.view.scale = s2
    this.scheduleUpdate()
  }

  private startInertia(): void {
    const step = (): void => {
      this.velocity.x *= 0.94
      this.velocity.y *= 0.94
      if (Math.hypot(this.velocity.x, this.velocity.y) < 0.1) return
      this.view.x -= this.velocity.x / this.view.scale
      this.view.y -= this.velocity.y / this.view.scale
      this.scheduleUpdate()
      this.inertiaRaf = requestAnimationFrame(step)
    }
    this.inertiaRaf = requestAnimationFrame(step)
  }
}
