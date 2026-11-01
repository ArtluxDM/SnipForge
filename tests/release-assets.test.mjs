import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectAssets, guardRelease } from '../scripts/release-assets.mjs'

test('collects installers and optional metadata, rejecting missing installers and collisions', async t => {
  const root = await mkdtemp(join(tmpdir(), 'snipforge-release-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = join(root, 'input')
  for (const platform of ['macos', 'windows', 'linux']) await mkdir(join(input, `snipforge-${platform}`), { recursive: true })
  const put = (platform, name) => writeFile(join(input, `snipforge-${platform}`, name), 'synthetic')
  await assert.rejects(collectAssets(input, join(root, 'missing-mac')), /Missing required installer for snipforge-macos/)
  await put('macos', 'app.dmg')
  await assert.rejects(collectAssets(input, join(root, 'missing-win')), /Missing required installer for snipforge-windows/)
  await put('windows', 'app.exe')
  await assert.rejects(collectAssets(input, join(root, 'missing')), /Missing required installer for snipforge-linux/)
  await put('linux', 'app.AppImage')
  await put('macos', 'latest.yml')
  assert.deepEqual(await collectAssets(input, join(root, 'success')), ['app.AppImage', 'app.dmg', 'app.exe', 'latest.yml'])
  assert.equal((await readdir(join(root, 'success'))).length, 4)
  await put('linux', 'unexpected.txt')
  await assert.rejects(collectAssets(input, join(root, 'unexpected')), /Unexpected artifact/)
  await rm(join(input, 'snipforge-linux', 'unexpected.txt'))
  await put('windows', 'latest.yml')
  await assert.rejects(collectAssets(input, join(root, 'collision')), /Duplicate asset filename: latest.yml/)
})

test('guard permits new or incomplete matching drafts and rejects unsafe states and API failures', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'snipforge-guard-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, 'app.dmg'), 'synthetic')
  const env = { GITHUB_API_URL: 'https://example.invalid', GITHUB_REPOSITORY: 'a/b', GITHUB_REF_NAME: 'v1', GH_TOKEN: 'fake' }
  const call = releases => guardRelease(dir, env, async url => ({ ok: true, json: async () => url.includes('/assets?') ? releases[0].assets : releases }))
  const release = (draft, assets = []) => ({ id: 1, tag_name: 'v1', draft, assets: assets.map(name => ({ name })) })
  await call([])
  await call([release(true, ['app.dmg'])])
  await call([release(true)])
  await assert.rejects(call([release(false)]), /already published/)
  await assert.rejects(call([release(true, ['stale.zip'])]), /unexpected assets/)
  await assert.rejects(call([release(true), release(true)]), /Multiple releases/)
  await assert.rejects(guardRelease(dir, env, async () => ({ ok: false, status: 403 })), /HTTP 403/)
  let pages = 0
  await assert.rejects(guardRelease(dir, env, async () => ({ ok: true, json: async () => ++pages === 1 ? Array(100).fill({ tag_name: 'other' }) : [release(false)] })), /already published/)
  assert.equal(pages, 2)
})
