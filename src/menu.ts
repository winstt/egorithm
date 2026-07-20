export function initMenu(actions: { add: () => void; shuffle: () => void }): void {
  const menu = document.getElementById('menu')!
  const orb = document.getElementById('orb')!

  orb.addEventListener('click', () => menu.classList.toggle('open'))
  document.addEventListener('pointerdown', e => {
    if (!menu.contains(e.target as Node)) menu.classList.remove('open')
  })

  menu.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      menu.classList.remove('open')
      if (btn.dataset.action === 'add') actions.add()
      else if (btn.dataset.action === 'shuffle') actions.shuffle()
    })
  })
}
