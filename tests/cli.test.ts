import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  commandHasVariables,
  copyCommandText,
  loadLibrary,
  runCli,
  searchCommands,
} from '../bin/snipforge-lib.mjs'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snipforge-cli-'))

  await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
    snipforge: 'library',
    name: 'CLI Test Library',
    description: 'Fixture library',
    format_version: '1.0',
  }))

  await fs.writeFile(path.join(tmpDir, 'docker-ps.json'), JSON.stringify({
    snipforge: 'command',
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Docker: List Containers',
    body: 'docker ps',
    description: 'Show running containers',
    tags: ['docker', 'containers'],
    language: 'bash',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }))

  await fs.writeFile(path.join(tmpDir, 'kubectl-rollout.json'), JSON.stringify({
    snipforge: 'command',
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Kubernetes: Rollout Restart',
    body: 'kubectl rollout restart deploy/api',
    description: 'Restart the API deployment',
    tags: ['kubernetes', 'deploy'],
    language: 'bash',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }))

  await fs.writeFile(path.join(tmpDir, 'templated.json'), JSON.stringify({
    snipforge: 'command',
    id: '33333333-3333-4333-8333-333333333333',
    title: 'OpenSSL: Random Token',
    body: 'openssl rand -base64 {{bytes}}',
    description: 'Generate a token',
    tags: ['openssl'],
    language: 'bash',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }))

  await fs.writeFile(path.join(tmpDir, 'broken.json'), '{ not json')
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('snipforge CLI library loading', () => {
  it('loads manifest and valid command files from a library folder', async () => {
    const library = await loadLibrary(tmpDir)

    expect(library.manifest.name).toBe('CLI Test Library')
    expect(library.commands).toHaveLength(3)
    expect(library.commands.map(command => command.title)).toEqual([
      'Docker: List Containers',
      'Kubernetes: Rollout Restart',
      'OpenSSL: Random Token',
    ])
  })

  it('ranks search matches using command metadata', async () => {
    const library = await loadLibrary(tmpDir)
    const matches = searchCommands(library.commands, 'rollout')

    expect(matches[0]?.item.title).toBe('Kubernetes: Rollout Restart')
  })
})

describe('snipforge CLI copy behavior', () => {
  it('detects template variables in command bodies', () => {
    expect(commandHasVariables({ body: 'echo {{name}}' })).toBe(true)
    expect(commandHasVariables({ body: 'echo hello' })).toBe(false)
  })

  it('refuses clipboard copy for templated commands', async () => {
    await expect(copyCommandText({
      title: 'Templated',
      body: 'echo {{name}}',
    }, {
      writeClipboard: vi.fn(),
    })).rejects.toThrow('contains template variables')
  })

  it('copies the best search match through the injected clipboard writer', async () => {
    const stdout = { write: vi.fn() }
    const stderr = { write: vi.fn() }
    const writeClipboard = vi.fn()

    const exitCode = await runCli(
      ['copy', 'docker', '--library', tmpDir],
      { stdout, stderr, cwd: '/tmp/unused' },
      { writeClipboard },
    )

    expect(exitCode).toBe(0)
    expect(writeClipboard).toHaveBeenCalledWith('docker ps')
    expect(stdout.write).toHaveBeenCalledWith('Copied "Docker: List Containers" from CLI Test Library.\n')
    expect(stderr.write).not.toHaveBeenCalled()
  })

  it('fails cleanly when a copy target requires variable substitution', async () => {
    const stdout = { write: vi.fn() }
    const stderr = { write: vi.fn() }

    const exitCode = await runCli(
      ['copy', '--id', '33333333-3333-4333-8333-333333333333', '--library', tmpDir],
      { stdout, stderr, cwd: '/tmp/unused' },
      { writeClipboard: vi.fn() },
    )

    expect(exitCode).toBe(1)
    expect(stderr.write).toHaveBeenCalledWith(expect.stringContaining('contains template variables'))
  })
})

describe('snipforge init', () => {
  async function init(args: string[], cwd = tmpDir) {
    const stdout = { write: vi.fn() }
    const stderr = { write: vi.fn() }
    const code = await runCli(['init', ...args], { stdout, stderr, cwd })
    return { code, stdout, stderr }
  }

  it('initializes cwd and preserves unrelated files', async () => {
    const root = path.join(tmpDir, 'my_library-name')
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, 'notes.txt'), 'keep me')
    const result = await init([], root)
    expect(result.code).toBe(0)
    expect(result.stdout.write).toHaveBeenCalledWith(root + '\n')
    expect(JSON.parse(await fs.readFile(path.join(root, '.snipforge.json'), 'utf8'))).toEqual({
      snipforge: 'library', name: 'My Library Name', description: '', format_version: '1.0',
    })
    expect(await fs.readFile(path.join(root, 'notes.txt'), 'utf8')).toBe('keep me')
  })

  it.each(['--library', '-l'])('creates missing relative directories with spaces using %s', async flag => {
    const result = await init([flag, 'nested/Commands With Spaces'])
    const root = path.join(tmpDir, 'nested', 'Commands With Spaces')
    expect(result.code).toBe(0)
    expect(result.stdout.write).toHaveBeenCalledWith(root + '\n')
    expect(JSON.parse(await fs.readFile(path.join(root, '.snipforge.json'), 'utf8')).name).toBe('Commands With Spaces')
  })

  it.each([
    '{ "name": "Legacy", "extra": true }\n',
    '{\n "snipforge": "library", "name": "Current", "format_version": "1.0"\n}',
  ])('preserves existing valid manifest bytes across repeated init', async raw => {
    const manifest = path.join(tmpDir, '.snipforge.json')
    await fs.writeFile(manifest, raw)
    expect((await init(['--library', tmpDir])).code).toBe(0)
    expect((await init([])).code).toBe(0)
    expect(await fs.readFile(manifest, 'utf8')).toBe(raw)
  })

  it.each([
    '{ broken', 'null', '[]', '42', '{}', '{"name":"  "}', '{"name":42}',
    '{"name":"ok","snipforge":"command"}', '{"name":"ok","snipforge":null}',
    '{"name":"ok","format_version":"2.0"}', '{"name":"ok","format_version":null}',
  ])('rejects invalid manifest without changing bytes: %s', async raw => {
    const manifest = path.join(tmpDir, '.snipforge.json')
    await fs.writeFile(manifest, raw)
    const result = await init([])
    expect(result.code).toBe(1)
    expect(result.stderr.write).toHaveBeenCalled()
    expect(await fs.readFile(manifest, 'utf8')).toBe(raw)
  })

  it.each([
    ['--unknown'], ['positional'], ['--library'], ['-l', ''], ['-l', '   '],
    ['--library', '--help'], ['-l', 'one', '--library', 'two'], ['-l', 'one', '-l', 'one'],
    ['--help', 'extra'],
  ])('rejects invalid args %j without creating files', async args => {
    const root = path.join(tmpDir, 'missing')
    const result = await init(args, root)
    expect(result.code).toBe(1)
    expect(result.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Usage: snipforge init'))
    await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('prints help without touching the filesystem', async () => {
    const root = path.join(tmpDir, 'missing')
    const result = await init(['--help'], root)
    expect(result.code).toBe(0)
    expect(result.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Usage: snipforge init'))
    await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports non-directory targets and unreadable manifests', async () => {
    const file = path.join(tmpDir, 'file')
    await fs.writeFile(file, 'unchanged')
    expect((await init(['-l', file])).stderr.write).toHaveBeenCalledWith(expect.stringContaining('Cannot create library directory'))
    const root = path.join(tmpDir, 'directory-manifest')
    await fs.mkdir(path.join(root, '.snipforge.json'), { recursive: true })
    expect((await init(['-l', root])).stderr.write).toHaveBeenCalledWith(expect.stringContaining('Cannot read library manifest'))
    expect(await fs.readFile(file, 'utf8')).toBe('unchanged')
  })

  it('does not overwrite a manifest created concurrently', async () => {
    const root = path.join(tmpDir, 'race')
    const manifest = path.join(root, '.snipforge.json')
    const competingBytes = '{ "name": "Concurrent" }\n'
    const original = fs.writeFile.bind(fs)
    const spy = vi.spyOn(fs, 'writeFile').mockImplementationOnce(async (...args) => {
      await original(manifest, competingBytes)
      return original(...args)
    })
    try {
      expect((await init(['-l', root])).code).toBe(0)
      expect(await fs.readFile(manifest, 'utf8')).toBe(competingBytes)
    } finally {
      spy.mockRestore()
    }
  })
})
