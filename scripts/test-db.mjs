#!/usr/bin/env node

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const npmCacheDir = process.env.npm_config_cache ?? mkdtempSync(join(tmpdir(), 'snipforge-npm-cache-'))

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir,
    },
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const vitestArgs = process.argv.slice(2).filter((arg) => arg !== '--')

// A fresh pnpm install may lack the Electron binary; parallel Vitest imports
// must not race electron/index.js's on-demand downloader.
run('pnpm', ['rebuild', 'electron'])
run(process.execPath, ['-e', "const fs = require('node:fs'); if (!fs.existsSync(require('electron'))) throw new Error('Electron binary missing after rebuild')"])
// pnpm rebuild selects the invoking Node runtime, not Electron's ABI.
run('pnpm', ['rebuild', 'better-sqlite3'])
run(process.execPath, ['-e', "const db = new (require('better-sqlite3'))(':memory:'); db.close(); console.log('Node native ABI:', process.versions.modules)"])
run('pnpm', ['exec', 'vitest', 'run', ...vitestArgs])
