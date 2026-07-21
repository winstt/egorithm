import { PALETTE, setBackground } from './theme'

export function initMenu(actions: { add: () => void; shuffle: () => void }): void {
  const menu = document.getElementById('menu')!
  const orb = document.getElementById('orb')!
  const swatches = menu.querySelector<HTMLElement>('.swatches')

  // build the colour swatches from the palette
  if (swatches) {
    for (const color of PALETTE) {
      const sw = document.createElement('button')
      sw.className = 'sw'
      sw.style.background = color
      sw.setAttribute('aria-label', color)
      sw.addEventListener('click', () => setBackground(color))
      swatches.appendChild(sw)
    }
  }

  const closeAll = (): void => {
    menu.classList.remove('open')
    swatches?.classList.remove('open')
  }

  orb.addEventListener('click', () => menu.classList.toggle('open'))
  document.addEventListener('pointerdown', e => {
    if (!menu.contains(e.target as Node)) closeAll()
  })

  menu.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action
      if (action === 'background') {
        swatches?.classList.toggle('open')
        return
      }
      closeAll()
      if (action === 'add') actions.add()
      else if (action === 'shuffle') actions.shuffle()
    })
  })
}
