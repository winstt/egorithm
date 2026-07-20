import type { Feed } from './types'
import { FEED_URL } from './config'

export async function loadFeed(): Promise<Feed> {
  const res = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`feed load failed: ${res.status}`)
  return res.json()
}
