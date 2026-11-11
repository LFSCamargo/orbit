#!/usr/bin/env node
/** Refresh game artwork and run the repeatable display/preview optimization pipeline. */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'apps/desktop/src-tauri/assets/bundled-themes')

const API_KEY = process.env.STEAMGRIDDB_API_KEY?.trim()

const THEMES = [
  {
    id: 'devil-may-cry-5',
    name: 'Devil May Cry 5',
    query: 'Devil May Cry 5',
  },
  {
    id: 'god-of-war',
    name: 'God of War',
    query: 'God of War',
  },
  {
    id: 'cyberpunk-2077',
    name: 'Cyberpunk 2077',
    query: 'Cyberpunk 2077',
  },
  {
    id: 'zelda-ocarina-of-time',
    name: 'Zelda: Ocarina of Time Remake',
    query: 'The Legend of Zelda: Ocarina of Time',
  },
  {
    id: 'gta-v',
    name: 'Grand Theft Auto V',
    query: 'Grand Theft Auto V',
  },
  {
    id: 'gta-vi',
    name: 'Grand Theft Auto VI',
    query: 'Grand Theft Auto VI',
  },
  {
    id: 'zelda-breath-of-the-wild',
    name: 'Zelda: Breath of the Wild',
    query: 'The Legend of Zelda: Breath of the Wild',
  },
  {
    id: 'super-mario',
    name: 'Super Mario',
    query: 'Super Mario Odyssey',
  },
]

async function sgdbRequest(path) {
  const response = await fetch(`https://www.steamgriddb.com/api/v2${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`SteamGridDB ${path}: ${response.status}`)
  return response.json()
}

async function sgdbGameId(query) {
  const data = await sgdbRequest(`/search/autocomplete/${encodeURIComponent(query)}`)
  return data?.data?.[0]?.id
}

async function sgdbImageUrl(gameId, slot) {
  const kind = slot === 'logo' ? 'logos' : 'heroes'
  const data = await sgdbRequest(
    `/${kind}/game/${gameId}?types=static&nsfw=false&humor=false`,
  )
  const images = data?.data?.filter((image) =>
    (() => {
      try {
        const url = new URL(image.url)
        return (
          url.protocol === 'https:' &&
          ['cdn.steamgriddb.com', 'cdn2.steamgriddb.com'].includes(url.hostname) &&
          !url.username &&
          !url.password &&
          !url.port
        )
      } catch {
        return false
      }
    })(),
  )
  images?.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  return images?.[0]?.url
}

async function downloadImage(url) {
  const response = await fetch(url, { headers: { Accept: 'image/*' } })
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const mime = response.headers.get('content-type') ?? 'image/png'
  const ext = mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : 'jpg'
  return { buffer, ext }
}

async function bundleTheme(theme) {
  const dir = join(OUT_DIR, theme.id)
  await mkdir(dir, { recursive: true })

  const slots = ['logo', 'hero']
  const bundled = {}

  for (const slot of slots) {
    let downloaded = false
    if (API_KEY) {
      try {
        const gameId = await sgdbGameId(theme.query)
        if (gameId) {
          const url = await sgdbImageUrl(gameId, slot)
          if (url) {
            const { buffer, ext } = await downloadImage(url)
            const fileName = `${slot}.${ext}`
            await writeFile(join(dir, fileName), buffer)
            bundled[slot] = fileName
            downloaded = true
          }
        }
      } catch (error) {
        console.warn(`[themes] ${theme.id}/${slot} download failed: ${error.message}`)
      }
    }

    if (!downloaded) {
      const existing = ['webp', 'png', 'jpg'].find((ext) =>
        existsSync(join(dir, `${slot}.${ext}`)),
      )
      if (!existing)
        throw new Error(
          `Missing ${theme.id}/${slot}. Configure STEAMGRIDDB_API_KEY to download artwork.`,
        )
      bundled[slot] = `${slot}.${existing}`
    }
  }

  return bundled
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  console.log(
    API_KEY
      ? '[themes] Downloading SteamGridDB artwork for built-in themes…'
      : '[themes] Preserving existing artwork; STEAMGRIDDB_API_KEY is not set.',
  )

  for (const theme of THEMES) {
    const bundled = await bundleTheme(theme)
    console.log(`[themes] ${theme.id}: ${bundled.logo}, ${bundled.hero}`)
  }

  execFileSync(process.execPath, [join(ROOT, 'scripts/optimize-theme-artwork.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
