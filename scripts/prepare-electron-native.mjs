#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cacheRoot = path.join(process.cwd(), '.cache')
const homeDir = path.join(cacheRoot, 'home')
const npmCacheDir = path.join(cacheRoot, 'npm')
const electronGypDir = path.join(cacheRoot, 'electron-gyp')

for (const dir of [homeDir, npmCacheDir, electronGypDir]) mkdirSync(dir, { recursive: true })

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('pnpm', ['exec', 'electron-builder', 'install-app-deps'], {
  HOME: homeDir,
  npm_config_cache: npmCacheDir,
  npm_config_devdir: electronGypDir,
})
// Run the addon inside Electron's bundled Node; probing under the host Node
// would silently report the wrong ABI after an Electron rebuild.
run(require('electron'), ['-e', "const db = new (require('better-sqlite3'))(':memory:'); db.close(); console.log('Electron native ABI:', process.versions.modules)"], {
  ELECTRON_RUN_AS_NODE: '1',
})
