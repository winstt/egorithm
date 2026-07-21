import type { Placement } from './types'

let open = false

interface LightboxOpts { onDelete?: (id: string) => void }

/**
 * FLIP expand from the wall thumbnail to a centered fit, then (once open) the
 * image is zoomable (wheel / pinch) and pannable; a Delete pill removes it.
 */
export function openLightbox(source: HTMLImageElement, p: Placement, opts: LightboxOpts = {}): void {
  if (open) return
  open = true

  const rect = source.getBoundingClientRect()
  const aspect = p.w / p.h
  const fitW = Math.min(innerWidth * 0.92, innerHeight * 0.92 * aspect)
  const baseX = (innerWidth - fitW) / 2
  const baseY = (innerHeight - fitW / aspect) / 2
  const baseScale = fitW / rect.width

  const lb = document.createElement('div'); lb.className = 'lb'
  const bg = document.createElement('div'); bg.className = 'lb-bg'
  const img = document.createElement('img'); img.className = 'lb-img'
  img.src = source.src; img.draggable = false
  img.style.width = `${rect.width}px`
  img.style.height = `${rect.height}px`
  const del = document.createElement('button'); del.className = 'lb-del'; del.textContent = 'Delete'
  lb.append(bg, img, del)
  document.body.appendChild(lb)
  source.classList.add('hidden-src')

  // upgrade to full-res once it loads
  if (p.item.src !== source.src) {
    const full = new Image()
    full.onload = () => { if (lb.isConnected) img.src = p.item.src }
    full.src = p.item.src
  }

  // live transform (top-left origin, per .lb-img transform-origin: 0 0)
  let tx = rect.left, ty = rect.top, s = 1
  const setTransform = (): void => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})` }
  setTransform()

  img.getBoundingClientRect() // commit start state
  requestAnimationFrame(() => {
    lb.classList.add('open')
    tx = baseX; ty = baseY; s = baseScale; setTransform()
  })

  let interactive = false
  img.addEventListener('transitionend', () => {
    interactive = true
    img.style.transition = 'none' // instant follow while zooming / panning
  }, { once: true })

  const MINS = baseScale, MAXS = baseScale * 6
  lb.addEventListener('wheel', e => {
    if (!interactive) return
    e.preventDefault()
    const ns = Math.min(MAXS, Math.max(MINS, s * Math.exp(-e.deltaY * 0.0015)))
    if (ns === s) return
    tx = e.clientX - (e.clientX - tx) * (ns / s)
    ty = e.clientY - (e.clientY - ty) * (ns / s)
    s = ns
    setTransform()
    img.classList.toggle('zoomed', s > baseScale + 1e-3)
  }, { passive: false })

  // drag to pan when zoomed; a clean tap on the fitted image closes
  let dragging = false, moved = false, px = 0, py = 0
  img.addEventListener('pointerdown', e => {
    dragging = true; moved = false; px = e.clientX; py = e.clientY
    img.setPointerCapture(e.pointerId)
  })
  img.addEventListener('pointermove', e => {
    if (!dragging) return
    const dx = e.clientX - px, dy = e.clientY - py
    if (Math.hypot(dx, dy) > 4) moved = true
    if (interactive && s > baseScale + 1e-3) { tx += dx; ty += dy; setTransform() }
    px = e.clientX; py = e.clientY
  })
  img.addEventListener('pointerup', () => {
    dragging = false
    if (!moved && s <= baseScale + 1e-3) close()
  })

  let closing = false
  const close = (): void => {
    if (closing) return
    closing = true
    img.style.transition = '' // restore the CSS transition for the close glide
    lb.classList.remove('open')
    const r = source.getBoundingClientRect()
    requestAnimationFrame(() => {
      img.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / rect.width})`
    })
    img.addEventListener('transitionend', cleanup, { once: true })
    setTimeout(cleanup, 600) // reduced-motion fallback
  }
  const cleanup = (): void => {
    if (!lb.isConnected) return
    lb.remove()
    source.classList.remove('hidden-src')
    document.removeEventListener('keydown', onKey)
    open = false
  }
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }

  bg.addEventListener('click', close)
  document.addEventListener('keydown', onKey)

  // two-tap delete
  del.addEventListener('click', e => {
    e.stopPropagation()
    if (del.classList.contains('confirm')) {
      opts.onDelete?.(p.item.id)
      close()
    } else {
      del.classList.add('confirm')
      del.textContent = 'Confirm'
      setTimeout(() => { del.classList.remove('confirm'); del.textContent = 'Delete' }, 3000)
    }
  })
}
