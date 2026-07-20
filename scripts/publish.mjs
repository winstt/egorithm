// Publishes every JPEG in /queue to Instagram (container → poll → publish).
// Env: IG_USER_ID, IG_ACCESS_TOKEN, RAW_BASE (e.g. https://raw.githubusercontent.com/winstt/egorithm/main)
// Successfully published files are deleted (sync.mjs then pulls the IG copy
// into /media); failures move to /queue/failed for inspection.
import { readdir, unlink, rename, mkdir } from 'node:fs/promises'
import { ig, requireEnv } from './lib.mjs'

const USER_ID = requireEnv('IG_USER_ID')
const TOKEN = requireEnv('IG_ACCESS_TOKEN')
const RAW_BASE = requireEnv('RAW_BASE')

const files = (await readdir('queue').catch(() => [])).filter(f => f.endsWith('.jpg'))
if (files.length === 0) {
  console.log('queue empty')
  process.exit(0)
}

let failed = 0
for (const file of files) {
  try {
    console.log(`publishing ${file}…`)
    const { id: creationId } = await ig(`${USER_ID}/media`, {
      image_url: `${RAW_BASE}/queue/${file}`,
      access_token: TOKEN,
    }, 'POST')

    let status = 'IN_PROGRESS'
    for (let i = 0; i < 30 && status === 'IN_PROGRESS'; i++) {
      await new Promise(r => setTimeout(r, 2000))
      status = (await ig(creationId, { fields: 'status_code', access_token: TOKEN })).status_code
    }
    if (status !== 'FINISHED') throw new Error(`container status: ${status}`)

    await ig(`${USER_ID}/media_publish`, { creation_id: creationId, access_token: TOKEN }, 'POST')
    await unlink(`queue/${file}`)
    console.log(`published ${file}`)
  } catch (err) {
    console.error(`FAILED ${file}: ${err.message}`)
    await mkdir('queue/failed', { recursive: true })
    await rename(`queue/${file}`, `queue/failed/${file}`)
    failed++
  }
}
process.exit(failed > 0 ? 1 : 0)
