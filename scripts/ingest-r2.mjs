// One-shot backfill: mirror the full Instagram archive into Cloudflare R2.
// Resumable — lists what's already in the bucket and skips it.
//
// Run:  npm run ingest:r2   (reads egorithm.env)
//
// Required env (egorithm.env):
//   IG_BUSINESS_ID, IG_PAGE_TOKEN            — Instagram Graph API (Facebook Login)
//   R2_ACCOUNT_ID                            — Cloudflare account id
//   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   — R2 API token (Object Read & Write)
// Optional:
//   R2_BUCKET (default egorithm-media)
//   MAX_POSTS (default: all)                 — cap for a smaller trial run
//   THUMBS=1                                 — also upload ~600px thumbnails (macOS sips)
//   CONCURRENCY (default 8)
import {
  S3Client, PutObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ig, jpegSize, requireEnv } from './lib.mjs'

const execFileP = promisify(execFile)

const IG_ID = requireEnv('IG_BUSINESS_ID')
const TOKEN = requireEnv('IG_PAGE_TOKEN')
const ACCOUNT = requireEnv('R2_ACCOUNT_ID')
const BUCKET = process.env.R2_BUCKET || 'egorithm-media'
const MAX_POSTS = process.env.MAX_POSTS ? Number(process.env.MAX_POSTS) : Infinity
const THUMBS = process.env.THUMBS === '1'
const CONCURRENCY = Number(process.env.CONCURRENCY || 8)
const MANIFEST_PATH = 'data/r2-manifest.json'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  },
})

async function listExistingKeys() {
  const keys = new Set()
  let ContinuationToken
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'ig/', ContinuationToken }))
    for (const o of r.Contents ?? []) keys.add(o.Key)
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (ContinuationToken)
  return keys
}

async function put(key, body) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: 'image/jpeg' }))
}

async function makeThumb(buf) {
  const inP = join(tmpdir(), `ego_${Math.random().toString(36).slice(2)}.jpg`)
  const outP = inP.replace(/\.jpg$/, '_t.jpg')
  await writeFile(inP, buf)
  await execFileP('sips', ['-Z', '600', inP, '--out', outP])
  const t = await readFile(outP)
  await Promise.allSettled([unlink(inP), unlink(outP)])
  return t
}

async function fetchAllMedia() {
  const out = []
  let res = await ig(`${IG_ID}/media`, {
    fields: 'id,media_type,media_url,permalink,timestamp', limit: '100', access_token: TOKEN,
  })
  for (;;) {
    out.push(...res.data)
    if (out.length >= MAX_POSTS || !res.paging?.next) break
    res = await (await fetch(res.paging.next)).json()
    if (res.error) throw new Error(JSON.stringify(res.error))
  }
  const images = out.filter(m => m.media_type === 'IMAGE')
  return Number.isFinite(MAX_POSTS) ? images.slice(0, MAX_POSTS) : images
}

async function mapLimit(items, limit, fn) {
  let i = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]) }
  }))
}

// ── main ──────────────────────────────────────────────────────────────────
console.log(`Bucket: ${BUCKET}  thumbnails: ${THUMBS ? 'yes' : 'no'}  concurrency: ${CONCURRENCY}`)
const [posts, existing, prior] = await Promise.all([
  fetchAllMedia(),
  listExistingKeys(),
  existsSync(MANIFEST_PATH) ? readFile(MANIFEST_PATH, 'utf8').then(JSON.parse).catch(() => null) : null,
])
const priorById = new Map((prior?.items ?? []).map(it => [it.id, it]))
console.log(`IG returned ${posts.length} image posts; ${existing.size} already in R2`)

let uploaded = 0, skipped = 0, failed = 0
const manifest = []

await mapLimit(posts, CONCURRENCY, async (post) => {
  const key = `ig/${post.id}.jpg`
  try {
    let dims = null
    if (existing.has(key)) {
      skipped++
      dims = priorById.get(post.id) ? { w: priorById.get(post.id).w, h: priorById.get(post.id).h } : null
    } else {
      const r = await fetch(post.media_url)
      if (!r.ok) throw new Error(`download ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      dims = jpegSize(buf)
      await put(key, buf)
      if (THUMBS) await put(`ig/${post.id}_thumb.jpg`, await makeThumb(buf))
      uploaded++
    }
    manifest.push({
      id: post.id, key, thumb_key: THUMBS ? `ig/${post.id}_thumb.jpg` : null,
      w: dims?.w ?? null, h: dims?.h ?? null, permalink: post.permalink, ts: post.timestamp,
    })
    if ((uploaded + skipped) % 100 === 0) console.log(`  ${uploaded} up · ${skipped} skip · ${failed} fail`)
  } catch (e) {
    failed++
    console.error(`FAILED ${post.id}: ${e.message}`)
  }
})

manifest.sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''))
await writeFile(MANIFEST_PATH,
  JSON.stringify({ generated: new Date().toISOString(), bucket: BUCKET, count: manifest.length, items: manifest }, null, 2) + '\n')
console.log(`\nDone. uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
console.log(`Manifest → ${MANIFEST_PATH} (${manifest.length} items)`)
