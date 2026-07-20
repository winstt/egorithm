// Refreshes the long-lived IG token (60-day expiry). Prints the new token
// to stdout; refresh.yml stores it back into the repo secret.
// Env: IG_ACCESS_TOKEN
import { requireEnv } from './lib.mjs'

const TOKEN = requireEnv('IG_ACCESS_TOKEN')
const url = new URL('https://graph.instagram.com/refresh_access_token')
url.searchParams.set('grant_type', 'ig_refresh_token')
url.searchParams.set('access_token', TOKEN)

const res = await fetch(url)
const json = await res.json()
if (!json.access_token) {
  console.error(`refresh failed: ${JSON.stringify(json)}`)
  process.exit(1)
}
process.stdout.write(json.access_token)
