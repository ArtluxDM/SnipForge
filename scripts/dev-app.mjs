#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...extraEnv,
    },
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const debugPort = process.argv[2]

// Keep the native addon ABI aligned with Electron before starting Vite dev.
run(process.execPath, ['scripts/prepare-electron-native.mjs'])
run('pnpm', ['exec', 'vite'], debugPort ? { REMOTE_DEBUG: debugPort } : {})
