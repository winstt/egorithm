import { GITHUB_REPO, TOKEN_KEY } from './config'

// Instagram accepts single images between 4:5 and 1.91:1
const MIN_ASPECT = 0.8
const MAX_ASPECT = 1.91
const MAX_DIM = 1440
const JPEG_QUALITY = 0.85

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/** Small glass dialog asking for the fine-grained PAT (stored in localStorage). */
export function askToken(): Promise<string | null> {
  return new Promise(resolve => {
    const wrap = document.createElement('div')
    wrap.className = 'tok'
    wrap.innerHTML = `
      <form>
        <div>GitHub token (contents: write on ${GITHUB_REPO})</div>
        <input type="password" placeholder="github_pat_…" autocomplete="off" />
        <button type="submit">Save</button>
      </form>`
    const input = wrap.querySelector('input')!
    wrap.querySelector('form')!.addEventListener('submit', e => {
      e.preventDefault()
      const v = input.value.trim()
      wrap.remove()
      if (v) localStorage.setItem(TOKEN_KEY, v)
      resolve(v || null)
    })
    wrap.addEventListener('click', e => {
      if (e.target === wrap) {
        wrap.remove()
        resolve(null)
      }
    })
    document.body.appendChild(wrap)
    input.focus()
  })
}

export interface ProcessedImage {
  blob: Blob
  w: number
  h: number
}

/** Re-encode to JPEG, center-crop into IG's aspect range, cap the long edge. */
export async function processImage(file: File): Promise<ProcessedImage> {
  const bmp = await createImageBitmap(file)
  let { width: w, height: h } = bmp
  let sx = 0
  let sy = 0
  const aspect = w / h
  if (aspect < MIN_ASPECT) {
    const newH = w / MIN_ASPECT
    sy = (h - newH) / 2
    h = newH
  } else if (aspect > MAX_ASPECT) {
    const newW = h * MAX_ASPECT
    sx = (w - newW) / 2
    w = newW
  }
  const scale = Math.min(1, MAX_DIM / Math.max(w, h))
  const outW = Math.round(w * scale)
  const outH = Math.round(h * scale)

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  canvas.getContext('2d')!.drawImage(bmp, sx, sy, w, h, 0, 0, outW, outH)
  bmp.close()

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('JPEG encode failed')
  return { blob, w: outW, h: outH }
}

/** Commit the image into /queue/ via the GitHub Contents API. */
export async function uploadToQueue(blob: Blob, token: string): Promise<string> {
  const name = `${Date.now()}.jpg`
  const b64 = await blobToBase64(blob)
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/queue/${name}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ message: `egorithm: queue ${name}`, content: b64 }),
  })
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`)
  return name
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve((fr.result as string).split(',')[1])
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}
