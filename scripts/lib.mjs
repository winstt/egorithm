// Instagram publishing via the Facebook Graph API (the IG account is a
// Professional account connected to the "Egorithm" Facebook Page). We use a
// long-lived Page access token, which does not expire.
export const API = 'https://graph.facebook.com/v21.0'

export async function ig(path, params = {}, method = 'GET') {
  const url = new URL(`${API}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { method })
  const json = await res.json()
  if (json.error) throw new Error(`IG API error on ${path}: ${JSON.stringify(json.error)}`)
  return json
}

/** Minimal JPEG dimension reader (SOF marker scan) — avoids any deps. */
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG')
  let p = 2
  while (p < buf.length - 8) {
    if (buf[p] !== 0xff) { p++; continue }
    const marker = buf[p + 1]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7) }
    }
    p += 2 + buf.readUInt16BE(p + 2)
  }
  throw new Error('no SOF marker found')
}

export function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing env: ${name}`)
    process.exit(1)
  }
  return v
}
