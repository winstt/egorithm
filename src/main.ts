import { loadFeed } from './feed'
import { Layout } from './layout'
import { Field } from './field'
import { openLightbox } from './lightbox'
import { initMenu } from './menu'
import { initTheme, initAnim } from './theme'
import { getToken, askToken, processImage, uploadToQueue, deleteFromManifest } from './upload'
import { FEED_POLL_MS } from './config'

async function boot(): Promise<void> {
  initTheme()
  initAnim()
  const feed = await loadFeed()
  let knownIds = new Set(feed.items.map(i => i.id))

  const layout = new Layout(feed.items, 20260719)
  const field = new Field(
    document.getElementById('field')!,
    document.getElementById('world')!,
    layout,
    (el, p) => openLightbox(el, p, { onDelete: deleteFlow }),
  )

  async function deleteFlow(id: string): Promise<void> {
    field.removeItem(id) // optimistic — hide it from the wall immediately
    const token = getToken() ?? (await askToken())
    if (!token) return   // hidden this session only; add a token to persist
    try {
      await deleteFromManifest(id, token)
    } catch (err) {
      console.error(err)
    }
  }

  initMenu({
    shuffle: () => field.shuffle(),
    upload: () => document.getElementById('file-input')!.click(),
  })

  document.getElementById('file-input')!.addEventListener('change', async e => {
    const file = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!file) return

    let token = getToken() ?? (await askToken())
    if (!token) return

    const pendingId = `pending-${Date.now()}`
    try {
      const processed = await processImage(file)
      field.addPending(pendingId, URL.createObjectURL(processed.blob), processed.w, processed.h)
      await uploadToQueue(processed.blob, token)
      pollForNewPost(pendingId)
    } catch (err) {
      console.error(err)
      field.markPendingFailed(pendingId)
    }
  })

  function pollForNewPost(pendingId: string): void {
    const timer = setInterval(async () => {
      if (!field.hasPending()) {
        clearInterval(timer)
        return
      }
      try {
        const fresh = await loadFeed()
        const newItems = fresh.items.filter(i => !knownIds.has(i.id))
        if (newItems.length > 0) {
          knownIds = new Set(fresh.items.map(i => i.id))
          field.resolvePending(pendingId)
          field.setLayout(new Layout(fresh.items, 20260719))
          clearInterval(timer)
        }
      } catch { /* transient — keep polling */ }
    }, FEED_POLL_MS)
  }
}

boot().catch(err => {
  console.error(err)
  document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:0;display:grid;place-items:center;opacity:.5">feed unavailable</p>')
})
