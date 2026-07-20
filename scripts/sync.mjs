// Mirrors the IG feed into /media + data/feed.json (full reconciliation).
// Env: IG_BUSINESS_ID, IG_PAGE_TOKEN
// Optional: MAX_POSTS (default 300) — the account has thousands of posts;
// downloading all of them would bloat the repo, so we mirror the newest N.
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { ig, jpegSize, requireEnv } from './lib.mjs'

const IG_ID = requireEnv('IG_BUSINESS_ID')
const TOKEN = requireEnv('IG_PAGE_TOKEN')
const MAX_POSTS = Number(process.env.MAX_POSTS ?? 300)
const MEDIA_DIR = 'media'
const FEED_PATH = 'data/feed.json'

async function fetchRecentMedia() {
  const out = []
  let res = await ig(`${IG_ID}/media`, {
    fields: 'id,media_type,media_url,permalink,timestamp',
    limit: '100',
    access_token: TOKEN,
  })
  for (;;) {
    out.push(...res.data)
    if (out.length >= MAX_POSTS || !res.paging?.next) break
    const next = await fetch(res.paging.next)
    res = await next.json()
    if (res.error) throw new Error(JSON.stringify(res.error))
  }
  return out.filter(m => m.media_type === 'IMAGE').slice(0, MAX_POSTS)
}

const posts = await fetchRecentMedia()
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

// prune media for posts no longer in the mirrored window
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
