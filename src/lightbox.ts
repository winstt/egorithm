import type { Placement } from './types'

let open = false

/**
 * FLIP expand: clone the field <img> into a fixed overlay at its exact
 * screen rect (getBoundingClientRect already includes the world transform),
 * then transition a translate+scale to the centered fit-to-viewport rect.
 */
export function openLightbox(source: HTMLImageElement, p: Placement): void {
  if (open) return
  open = true

  const rect = source.getBoundingClientRect()
  const aspect = p.w / p.h
  const maxW = innerWidth * 0.92
  const maxH = innerHeight * 0.92
  const targetW = Math.min(maxW, maxH * aspect)
  const targetH = targetW / aspect
  const targetX = (innerWidth - targetW) / 2
  const targetY = (innerHeight - targetH) / 2

  const lb = document.createElement('div')
  lb.className = 'lb'
  const bg = document.createElement('div')
  bg.className = 'lb-bg'
  const img = document.createElement('img')
  img.className = 'lb-img'
  img.src = source.src
  img.draggable = false
  img.style.width = `${rect.width}px`
  img.style.height = `${rect.height}px`
  img.style.transform = `translate(${rect.left}px, ${rect.top}px) scale(1)`
  lb.append(bg, img)
  document.body.appendChild(lb)
  source.classList.add('hidden-src')

  // force layout so the entry state is committed before transitioning
  img.getBoundingClientRect()
  requestAnimationFrame(() => {
    lb.classList.add('open')
    img.style.transform = `translate(${targetX}px, ${targetY}px) scale(${targetW / rect.width})`
  })

  let closing = false
  const close = (): void => {
    if (closing) return
    closing = true
    lb.classList.remove('open')
    const r = source.getBoundingClientRect() // field may have been panned meanwhile
    img.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / rect.width})`
    img.addEventListener('transitionend', cleanup, { once: true })
    setTimeout(cleanup, 600) // fallback (reduced motion disables transitions)
  }
  const cleanup = (): void => {
    if (!lb.isConnected) return
    lb.remove()
    source.classList.remove('hidden-src')
    document.removeEventListener('keydown', onKey)
    open = false
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }

  lb.addEventListener('click', close)
  document.addEventListener('keydown', onKey)
  if (p.item.permalink) {
    let pressTimer = 0
    img.addEventListener('pointerdown', () => {
      pressTimer = window.setTimeout(() => window.open(p.item.permalink, '_blank'), 600)
    })
    img.addEventListener('pointerup', () => clearTimeout(pressTimer))
    img.addEventListener('pointercancel', () => clearTimeout(pressTimer))
  }
}
