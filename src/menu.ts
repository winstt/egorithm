import { PALETTE, setBackground, ANIMS, currentAnim, setAnim, type Anim } from './theme'

const ANIM_LABELS: Record<Anim, string> = {
  pop: 'Pop', fade: 'Fade', rise: 'Rise', zoom: 'Zoom', off: 'Off',
}

export function initMenu(actions: { shuffle: () => void; upload: () => void }): void {
  const menu = document.getElementById('menu')!
  const orb = document.getElementById('orb')!
  const swatches = menu.querySelector<HTMLElement>('.swatches')
  const anims = menu.querySelector<HTMLElement>('.anims')

  // colour swatches
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

  // animation style options
  const markActive = (): void => {
    const cur = currentAnim()
    anims?.querySelectorAll<HTMLElement>('.anim-opt').forEach(el =>
      el.classList.toggle('active', el.dataset.anim === cur))
  }
  if (anims) {
    for (const name of ANIMS) {
      const opt = document.createElement('button')
      opt.className = 'anim-opt'
      opt.dataset.anim = name
      opt.textContent = ANIM_LABELS[name]
      opt.addEventListener('click', () => { setAnim(name); markActive() })
      anims.appendChild(opt)
    }
    markActive()
  }

  const closeAll = (): void => {
    menu.classList.remove('open')
    swatches?.classList.remove('open')
    anims?.classList.remove('open')
  }

  orb.addEventListener('click', () => menu.classList.toggle('open'))
  document.addEventListener('pointerdown', e => {
    if (!menu.contains(e.target as Node)) closeAll()
  })

  menu.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action
      if (action === 'background') { swatches?.classList.toggle('open'); return }
      if (action === 'animation') { anims?.classList.toggle('open'); return }
      closeAll()
      if (action === 'shuffle') actions.shuffle()
      else if (action === 'upload') actions.upload()
    })
  })
}
