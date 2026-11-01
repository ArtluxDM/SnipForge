import { readdir, mkdir, copyFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const platforms = {
  'snipforge-macos': /\.dmg$/,
  'snipforge-windows': /\.exe$/,
  'snipforge-linux': /\.AppImage$/,
}
const allowed = /\.(?:dmg|exe|AppImage|deb|rpm|zip|yml)(?:\.blockmap)?$/

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(path))
    else if (entry.isFile()) files.push(path)
    else throw new Error(`Unexpected non-file entry: ${path}`)
  }
  return files.sort()
}

export async function collectAssets(input, output) {
  const all = []
  const names = new Set()
  for (const [platform, required] of Object.entries(platforms)) {
    let files
    try { files = await filesUnder(join(input, platform)) } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Missing artifact directory: ${platform}`)
      throw error
    }
    if (!files.some(file => required.test(basename(file)))) throw new Error(`Missing required installer for ${platform}`)
    for (const file of files) {
      const name = basename(file)
      if (!allowed.test(name)) throw new Error(`Unexpected artifact: ${file}`)
      if (names.has(name)) throw new Error(`Duplicate asset filename: ${name}`)
      names.add(name)
      all.push(file)
    }
  }
  await mkdir(output, { recursive: false })
  for (const file of all) await copyFile(file, join(output, basename(file)))
  return [...names].sort()
}

export function assertSafeRelease(release, expectedNames) {
  if (!release.draft) throw new Error('Release is already published; refusing to modify it')
  const expected = new Set(expectedNames)
  const unexpected = release.assets.map(asset => asset.name).filter(name => !expected.has(name))
  if (unexpected.length) throw new Error(`Draft contains unexpected assets: ${unexpected.join(', ')}`)
}

export async function guardRelease(dir, env = process.env, request = fetch) {
  const names = (await filesUnder(dir)).map(file => basename(file))
  const { GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_REF_NAME, GH_TOKEN } = env
  if (!GITHUB_API_URL || !GITHUB_REPOSITORY || !GITHUB_REF_NAME || !GH_TOKEN) throw new Error('Missing GitHub release guard environment')
  // Listing releases includes drafts; the get-by-tag endpoint only returns published releases.
  const matches = []
  for (let page = 1; ; page++) {
    const response = await request(`${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/releases?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    })
    if (!response.ok) throw new Error(`Release lookup failed: HTTP ${response.status}`)
    const releases = await response.json()
    if (!Array.isArray(releases)) throw new Error('Invalid release lookup response')
    matches.push(...releases.filter(release => release.tag_name === GITHUB_REF_NAME))
    if (releases.length < 100) break
  }
  if (matches.length > 1) throw new Error('Multiple releases exist for this tag')
  if (matches.length === 0) { console.log('No release exists for this tag'); return }
  if (!matches[0].draft) throw new Error('Release is already published; refusing to modify it')
  const assets = []
  for (let page = 1; ; page++) {
    const response = await request(`${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/releases/${matches[0].id}/assets?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    })
    if (!response.ok) throw new Error(`Asset lookup failed: HTTP ${response.status}`)
    const batch = await response.json()
    if (!Array.isArray(batch)) throw new Error('Invalid asset lookup response')
    assets.push(...batch)
    if (batch.length < 100) break
  }
  assertSafeRelease({ ...matches[0], assets }, names)
  console.log('Existing draft is safe to update')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'collect') console.log((await collectAssets(process.argv[3], process.argv[4])).join('\n'))
    else if (process.argv[2] === 'guard') await guardRelease(process.argv[3])
    else throw new Error('Usage: release-assets.mjs collect INPUT OUTPUT | guard OUTPUT')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
