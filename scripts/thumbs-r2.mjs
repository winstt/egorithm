// Generate wall thumbnails (~640px) for every image already in R2, and record
// the thumb key back into data/r2-manifest.json. (Dominant-colour placeholders
// are a later pass — sips can't reliably render a 1px sample; we'll use sharp
// or a Worker-on-upload for that.)
// Resumable. macOS only (uses `sips`). Needs the R2 endpoint reachable, so run
// with dangerouslyDisableSandbox / on an unfiltered network.
//
// Run:  node --env-file=egorithm.env scripts/thumbs-r2.mjs
// Env:  R2_* (as ingest) + optional THUMB_MAX (default 640), CONCURRENCY (8)
import {
  S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requireEnv } from './lib.mjs'

const execFileP = promisify(execFile)
const ACCOUNT = requireEnv('R2_ACCOUNT_ID')
const BUCKET = process.env.R2_BUCKET || 'egorithm-media'
const THUMB_MAX = Number(process.env.THUMB_MAX || 640)
const CONCURRENCY = Number(process.env.CONCURRENCY || 8)
const MANIFEST = 'data/r2-manifest.json'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  },
})

async function getBytes(key) {
  const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  return Buffer.from(await r.Body.transformToByteArray())
}
async function put(key, body) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: 'image/jpeg' }))
}
async function listKeys() {
  const s = new Set(); let t
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'ig/', ContinuationToken: t }))
    for (const o of r.Contents ?? []) s.add(o.Key)
    t = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (t)
  return s
}

const tmp = ext => join(tmpdir(), `ego_${Math.random().toString(36).slice(2)}.${ext}`)

async function makeThumb(buf) {
  const inP = tmp('jpg'), outP = tmp('jpg')
  await writeFile(inP, buf)
  await execFileP('sips', ['-Z', String(THUMB_MAX), inP, '--out', outP])
  const t = await readFile(outP)
  await Promise.allSettled([unlink(inP), unlink(outP)])
  return t
}

async function mapLimit(items, limit, fn) {
  let i = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]) }
  }))
}

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
const existing = await listKeys()
console.log(`manifest ${manifest.items.length} items; ${existing.size} R2 objects; thumb max ${THUMB_MAX}px`)

let done = 0, skipped = 0, failed = 0
await mapLimit(manifest.items, CONCURRENCY, async (item) => {
  const thumbKey = `ig/${item.id}_thumb.jpg`
  if (existing.has(thumbKey) && item.thumb_key) { skipped++; return }
  try {
    const buf = await getBytes(item.key)
    const thumb = await makeThumb(buf)
    await put(thumbKey, thumb)
    item.thumb_key = thumbKey
    done++
    if ((done + skipped) % 100 === 0) console.log(`  ${done} thumbs · ${skipped} skip · ${failed} fail`)
  } catch (e) { failed++; console.error(`FAILED ${item.id}: ${e.message}`) }
})

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`\nDone. thumbs=${done} skipped=${skipped} failed=${failed}`)
