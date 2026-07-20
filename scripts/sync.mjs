// Mirrors the IG feed into /media + data/feed.json (full reconciliation).
// Env: IG_ACCESS_TOKEN
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { ig, jpegSize, requireEnv } from './lib.mjs'

const TOKEN = requireEnv('IG_ACCESS_TOKEN')
const MEDIA_DIR = 'media'
const FEED_PATH = 'data/feed.json'

async function fetchAllMedia() {
  const out = []
  let res = await ig('me/media', {
    fields: 'id,media_type,media_url,permalink,timestamp',
    limit: '100',
    access_token: TOKEN,
  })
  for (;;) {
    out.push(...res.data)
    if (!res.paging?.next) break
    const next = await fetch(res.paging.next)
    res = await next.json()
    if (res.error) throw new Error(JSON.stringify(res.error))
  }
  return out.filter(m => m.media_type === 'IMAGE')
}

const posts = await fetchAllMedia()
await mkdir(MEDIA_DIR, { recursive: true })

const items = []
for (const post of posts) {
  const file = `${MEDIA_DIR}/${post.id}.jpg`
  let buf
  if (existsSync(file)) {
    buf = await readFile(file)
  } else {
    const res = await fetch(post.media_url)
    if (!res.ok) throw new Error(`download failed for ${post.id}: ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
    await writeFile(file, buf)
    console.log(`downloaded ${file}`)
  }
  const { w, h } = jpegSize(buf)
  items.push({ id: post.id, src: `${file}`, w, h, permalink: post.permalink, ts: post.timestamp })
}

// prune media for posts deleted on IG
const keep = new Set(posts.map(p => `${p.id}.jpg`))
for (const f of await readdir(MEDIA_DIR)) {
  if (/^\d+\.jpg$/.test(f) && !keep.has(f)) {
    await unlink(`${MEDIA_DIR}/${f}`)
    console.log(`pruned ${MEDIA_DIR}/${f}`)
  }
}

items.sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''))
await writeFile(FEED_PATH, JSON.stringify({ generated: new Date().toISOString(), items }, null, 2) + '\n')
console.log(`feed.json: ${items.length} items`)
