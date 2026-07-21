const KEY = 'egorithm.bg'

export const PALETTE = ['#404040', '#1737e9', '#ffffff', '#000000', '#e9e9e9']

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Set the wall background and adapt fg + glass vars to its luminance. */
export function applyBackground(color: string): void {
  const root = document.documentElement.style
  const dark = luminance(color) < 0.5
  root.setProperty('--bg', color)
  root.setProperty('--fg', dark ? '#ededed' : '#1a1a1a')
  root.setProperty('--glass-fill', dark ? 'rgba(30, 30, 30, 0.45)' : 'rgba(255, 255, 255, 0.45)')
  root.setProperty('--glass-edge', dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.6)')
  root.setProperty('--glass-shadow', dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.12)')
}

/** Apply the saved background on boot (falls back to prefers-color-scheme). */
export function initTheme(): void {
  const saved = localStorage.getItem(KEY)
  if (saved) applyBackground(saved)
}

export function setBackground(color: string): void {
  localStorage.setItem(KEY, color)
  applyBackground(color)
}
