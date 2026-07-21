import type { Feed, FeedItem } from './types'
import { MANIFEST_URL, R2_BASE } from './config'

interface ManifestItem {
  id: string
  key: string
  thumb_key?: string | null
  w: number | null
  h: number | null
  permalink?: string
  ts?: string
}
interface Manifest { generated: string; items: ManifestItem[] }

/** Load the R2 manifest and map each block to its full-res + thumbnail URLs. */
export async function loadFeed(): Promise<Feed> {
  const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`manifest load failed: ${res.status}`)
  const m: Manifest = await res.json()
  const items: FeedItem[] = m.items
    .filter(it => it.w && it.h)
    .map(it => ({
      id: it.id,
      src: `${R2_BASE}/${it.key}`,
      thumb: `${R2_BASE}/${it.thumb_key ?? it.key}`,
      w: it.w as number,
      h: it.h as number,
      permalink: it.permalink,
      ts: it.ts,
    }))
  return { generated: m.generated, items }
}
