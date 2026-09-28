import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import AdmZip from 'adm-zip'
import * as db from '../electron/main/database'
import * as settings from '../electron/main/settings'
import {
    createLocalLibraryCommands,
    createLocalLibraryCommand,
    commitLibraryChanges,
    getAllLibrariesWithWorkingTreeStatus,
    getLibraryGitWorkflowSummary,
    getLibraryWorkingTreeStatus,
    deleteLocalLibraryCommands,
    deleteLocalLibraryCommand,
    exportAsLibrary,
    migrateLegacyDbOnlyCommandsToDefaultLibrary,
    migrateRemoteLibrariesToLocalWorkingCopies,
    openLocalFolder,
    openLibraryPullRequest,
    pushLibraryChanges,
    reindexInitializedLocalLibraries,
    relinkOriginLibraryToFolder,
    scanLocalFolder,
    setupDefaultWritableLocalLibrary,
    slugify,
    updateLibraryOrigin,
    updateLocalLibraryCommand,
} from '../electron/main/local-library'

let tmpDir: string
const TINY_PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2pKxQAAAAASUVORK5CYII='
const execFileAsync = promisify(execFile)

async function runGit(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args])
    return String(stdout)
}

async function initGitRepo(repoPath: string): Promise<void> {
    await runGit(repoPath, ['init'])
    await runGit(repoPath, ['config', 'user.name', 'SnipForge Tests'])
    await runGit(repoPath, ['config', 'user.email', 'tests@snipforge.local'])
}

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snipforge-test-lib-'))
    db.initializeDatabase(path.join(tmpDir, 'test.db'))
})

afterEach(async () => {
    db.closeDatabase()
    await fs.rm(tmpDir, { recursive: true, force: true })
})

// ── exportAsLibrary ─────────────────────────────────────────────

describe('exportAsLibrary', () => {
    it('creates a portable library ZIP with manifest and command files', async () => {
        const now = new Date().toISOString()

        const zipPath = await exportAsLibrary({
            name: 'Security Export',
            description: 'ZIP export smoke test',
            commands: [{
                title: 'Hello World',
                body: 'echo hello',
                description: 'basic command',
                tags: ['security', 'zip'],
                language: 'plaintext',
                created_at: now,
                updated_at: now,
            }],
        })

        const zip = new AdmZip(zipPath)
        const entries = zip.getEntries().map(entry => entry.entryName).sort()

        expect(entries).toContain('security-export/.snipforge.json')
        expect(entries).toContain('security-export/hello-world.json')

        const manifest = JSON.parse(zip.readAsText('security-export/.snipforge.json'))
        const command = JSON.parse(zip.readAsText('security-export/hello-world.json'))

        expect(manifest).toMatchObject({ snipforge: 'library', name: 'Security Export' })
        expect(command).toMatchObject({ title: 'Hello World', body: 'echo hello' })
    })
})

// ── slugify ─────────────────────────────────────────────────────

describe('slugify', () => {
    it('converts title to lowercase hyphenated slug', () => {
        expect(slugify('OpenSSL: Create Token')).toBe('openssl-create-token')
    })

    it('handles multiple spaces', () => {
        expect(slugify('My  Cool   Command')).toBe('my-cool-command')
    })

    it('converts underscores to hyphens', () => {
        expect(slugify('snake_case_title')).toBe('snake-case-title')
    })

    it('truncates to 200 characters', () => {
        const long = 'a'.repeat(300)
        expect(slugify(long)).toHaveLength(200)
    })

    it('strips non-alphanumeric characters', () => {
        expect(slugify('Curl: Basic Auth (GET)')).toBe('curl-basic-auth-get')
        expect(slugify('K8s — Get Pod Logs!')).toBe('k8s-get-pod-logs')
    })

    it('collapses consecutive hyphens', () => {
        expect(slugify('test---multiple---hyphens')).toBe('test-multiple-hyphens')
    })

    it('returns "untitled" for empty/whitespace input', () => {
        expect(slugify('')).toBe('untitled')
        expect(slugify('   ')).toBe('untitled')
    })

    it('handles strings with only special characters', () => {
        expect(slugify('!!!@@@')).toBe('untitled')
    })
})

// ── scanLocalFolder ─────────────────────────────────────────────

describe('scanLocalFolder', () => {
    it('reads manifest and command files', async () => {
        // Create manifest
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            snipforge: 'library',
            name: 'Test Lib',
            description: 'A test library',
            format_version: '1.0',
        }))

        // Create a command file
        await fs.writeFile(path.join(tmpDir, 'test-cmd.json'), JSON.stringify({
            snipforge: 'command',
            title: 'Test Command',
            body: 'echo test',
            description: 'A test command',
            tags: ['test'],
            language: 'bash',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        }))

        const result = await scanLocalFolder(tmpDir)

        expect(result.manifest.name).toBe('Test Lib')
        expect(result.manifestPath).toBe('.snipforge.json')
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].path).toBe('test-cmd.json')
        expect(result.commands[0].command.title).toBe('Test Command')
        expect(result.commands[0].command.tags).toEqual(['test'])
    })

    it('throws when manifest is missing', async () => {
        await expect(scanLocalFolder(tmpDir)).rejects.toThrow('missing .snipforge.json')
    })

    it('throws when manifest is invalid JSON', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), 'not json{{{')
        await expect(scanLocalFolder(tmpDir)).rejects.toThrow('not valid JSON')
    })

    it('throws when manifest has no name field', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            description: 'no name',
        }))
        await expect(scanLocalFolder(tmpDir)).rejects.toThrow('missing "name" field')
    })

    it('skips files without title or body', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            name: 'Test', description: '', format_version: '1.0',
        }))

        // Valid command
        await fs.writeFile(path.join(tmpDir, 'valid.json'), JSON.stringify({
            title: 'Valid', body: 'echo valid',
        }))

        // Missing body
        await fs.writeFile(path.join(tmpDir, 'no-body.json'), JSON.stringify({
            title: 'No Body',
        }))

        // Missing title
        await fs.writeFile(path.join(tmpDir, 'no-title.json'), JSON.stringify({
            body: 'echo no title',
        }))

        // Empty title
        await fs.writeFile(path.join(tmpDir, 'empty-title.json'), JSON.stringify({
            title: '   ', body: 'echo empty',
        }))

        const result = await scanLocalFolder(tmpDir)
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].command.title).toBe('Valid')
    })

    it('skips invalid JSON files gracefully', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            name: 'Test', description: '', format_version: '1.0',
        }))

        await fs.writeFile(path.join(tmpDir, 'valid.json'), JSON.stringify({
            title: 'Valid', body: 'echo valid',
        }))

        await fs.writeFile(path.join(tmpDir, 'broken.json'), 'not json at all')

        const result = await scanLocalFolder(tmpDir)
        expect(result.commands).toHaveLength(1)
    })

    it('applies defaults for missing optional fields', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            name: 'Test', description: '', format_version: '1.0',
        }))

        await fs.writeFile(path.join(tmpDir, 'minimal.json'), JSON.stringify({
            title: 'Minimal',
            body: 'echo minimal',
        }))

        const result = await scanLocalFolder(tmpDir)
        const cmd = result.commands[0].command

        expect(cmd.description).toBe('')
        expect(cmd.tags).toEqual([])
        expect(cmd.language).toBe('plaintext')
        expect(cmd.created_at).toBeTruthy()
        expect(cmd.updated_at).toBeTruthy()
    })

    it('does not scan subdirectories', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            name: 'Test', description: '', format_version: '1.0',
        }))

        const subDir = path.join(tmpDir, 'subdir')
        await fs.mkdir(subDir)
        await fs.writeFile(path.join(subDir, 'nested.json'), JSON.stringify({
            title: 'Nested', body: 'echo nested',
        }))

        const result = await scanLocalFolder(tmpDir)
        expect(result.commands).toHaveLength(0)
    })
})

describe('library working tree status', () => {
    it('reports a clean state for a clean git-backed library', async () => {
        const repoRoot = path.join(tmpDir, 'clean-repo')
        await fs.mkdir(repoRoot, { recursive: true })
        await fs.writeFile(path.join(repoRoot, '.snipforge.json'), JSON.stringify({
            name: 'Clean Library',
            description: '',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(repoRoot, 'clean.json'), JSON.stringify({
            title: 'Clean',
            body: 'echo clean',
        }))

        await initGitRepo(repoRoot)
        await runGit(repoRoot, ['add', '.'])
        await runGit(repoRoot, ['commit', '-m', 'initial'])

        const libraryId = db.addLibrary(repoRoot, 'Clean Library', '', '.snipforge.json', 'local', 'owner')
        const library = db.getAllLibraries().find(item => item.id === libraryId)!

        const status = await getLibraryWorkingTreeStatus(library)

        expect(status.state).toBe('clean')
        expect(status.has_changes).toBe(false)
        expect(status.modified).toBe(0)
        expect(status.added).toBe(0)
        expect(status.deleted).toBe(0)
        expect(status.error).toBeNull()
    })

    it('scopes dirty counts to the library folder inside a git repository', async () => {
        const repoRoot = path.join(tmpDir, 'repo')
        const libraryRoot = path.join(repoRoot, 'alpha')
        await fs.mkdir(libraryRoot, { recursive: true })
        await fs.writeFile(path.join(libraryRoot, '.snipforge.json'), JSON.stringify({
            name: 'Alpha',
            description: '',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(libraryRoot, 'tracked.json'), JSON.stringify({
            title: 'Tracked',
            body: 'echo tracked',
        }))
        await fs.writeFile(path.join(libraryRoot, 'delete-me.json'), JSON.stringify({
            title: 'Delete Me',
            body: 'echo delete',
        }))
        await fs.writeFile(path.join(repoRoot, 'outside.txt'), 'outside\n')

        await initGitRepo(repoRoot)
        await runGit(repoRoot, ['add', '.'])
        await runGit(repoRoot, ['commit', '-m', 'initial'])

        await fs.writeFile(path.join(libraryRoot, 'tracked.json'), JSON.stringify({
            title: 'Tracked',
            body: 'echo changed',
        }))
        await fs.writeFile(path.join(libraryRoot, 'new.json'), JSON.stringify({
            title: 'New',
            body: 'echo new',
        }))
        await fs.rm(path.join(libraryRoot, 'delete-me.json'))
        await fs.writeFile(path.join(repoRoot, 'outside.txt'), 'outside changed\n')

        const libraryId = db.addLibrary(libraryRoot, 'Alpha', '', '.snipforge.json', 'local', 'owner')
        const library = db.getAllLibraries().find(item => item.id === libraryId)!

        const status = await getLibraryWorkingTreeStatus(library)

        expect(status.state).toBe('dirty')
        expect(status.has_changes).toBe(true)
        expect(status.modified).toBe(1)
        expect(status.added).toBe(1)
        expect(status.deleted).toBe(1)
    })

    it('returns not_repo when the library folder is not inside a git work tree', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            name: 'Plain Folder',
            description: '',
            format_version: '1.0',
        }))

        const libraryId = db.addLibrary(tmpDir, 'Plain Folder', '', '.snipforge.json', 'local', 'owner')
        const library = db.getAllLibraries().find(item => item.id === libraryId)!

        const status = await getLibraryWorkingTreeStatus(library)

        expect(status.state).toBe('not_repo')
        expect(status.has_changes).toBe(false)
        expect(status.modified).toBe(0)
        expect(status.added).toBe(0)
        expect(status.deleted).toBe(0)
        expect(status.error).toBeNull()
    })

    it('returns git_unavailable when system git cannot be executed', async () => {
        const libraryId = db.addLibrary(tmpDir, 'Missing Git', '', '.snipforge.json', 'local', 'owner')
        const library = db.getAllLibraries().find(item => item.id === libraryId)!
        const gitMissing = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })

        const status = await getLibraryWorkingTreeStatus(library, async () => {
            throw gitMissing
        })

        expect(status.state).toBe('git_unavailable')
        expect(status.has_changes).toBe(false)
        expect(status.error).toContain('System git is unavailable')
    })

    it('enriches library listings with computed working tree status', async () => {
        const repoRoot = path.join(tmpDir, 'status-repo')
        await fs.mkdir(repoRoot, { recursive: true })
        await fs.writeFile(path.join(repoRoot, '.snipforge.json'), JSON.stringify({
            name: 'Computed Status',
            description: '',
            format_version: '1.0',
        }))
        await initGitRepo(repoRoot)
        await runGit(repoRoot, ['add', '.'])
        await runGit(repoRoot, ['commit', '-m', 'initial'])

        const libraryId = db.addLibrary(repoRoot, 'Computed Status', '', '.snipforge.json', 'local', 'owner')
        const libraries = await getAllLibrariesWithWorkingTreeStatus()
        const library = libraries.find(item => item.id === libraryId)

        expect(library?.working_tree.state).toBe('clean')
        expect(library?.working_tree.checked_at).toBeTruthy()
    })

    it('summarizes library-level git actions for a git-backed working copy', async () => {
        const repoRoot = path.join(tmpDir, 'workflow-repo')
        const remoteRoot = path.join(tmpDir, 'workflow-remote.git')
        await fs.mkdir(repoRoot, { recursive: true })
        await fs.writeFile(path.join(repoRoot, '.snipforge.json'), JSON.stringify({
            name: 'Workflow Library',
            description: '',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(repoRoot, 'hello.json'), JSON.stringify({
            title: 'Hello',
            body: 'echo hello',
        }))

        await initGitRepo(repoRoot)
        await runGit(repoRoot, ['add', '.'])
        await runGit(repoRoot, ['commit', '-m', 'initial'])
        await execFileAsync('git', ['init', '--bare', remoteRoot])
        await runGit(repoRoot, ['remote', 'add', 'origin', remoteRoot])
        await runGit(repoRoot, ['branch', '-M', 'main'])
        await runGit(repoRoot, ['push', '--set-upstream', 'origin', 'main'])
        await runGit(repoRoot, ['remote', 'set-url', 'origin', 'https://github.com/ArtluxDM/SnipForge.git'])
        await runGit(repoRoot, ['checkout', '-b', 'feature/library-workflow'])

        const libraryId = db.addLibrary(repoRoot, 'Workflow Library', '', '.snipforge.json', 'local', 'owner')
        db.updateLibraryToLocalWorkingCopy(libraryId, repoRoot, 'https://github.com/ArtluxDM/SnipForge', 'main')

        const summary = await getLibraryGitWorkflowSummary(
            libraryId,
            async (args, cwd) => ({ stdout: await runGit(cwd, args) }),
            async () => {
                throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
            }
        )

        expect(summary.supported).toBe(true)
        expect(summary.remote_name).toBe('origin')
        expect(summary.current_branch).toBe('feature/library-workflow')
        expect(summary.default_branch).toBe('main')
        expect(summary.actions.fetch.available).toBe(true)
        expect(summary.actions.update.available).toBe(false)
        expect(summary.actions.update.reason).toContain('upstream branch')
        expect(summary.actions.commit.available).toBe(false)
        expect(summary.actions.push.available).toBe(true)
        expect(summary.actions.pull_request.available).toBe(true)
        expect(summary.actions.pull_request.reason).toContain('compare page')
    })

    it('commits local changes and blocks update until the working tree is clean', async () => {
        const repoRoot = path.join(tmpDir, 'commit-repo')
        const remoteRoot = path.join(tmpDir, 'commit-remote.git')
        await fs.mkdir(repoRoot, { recursive: true })
        await fs.writeFile(path.join(repoRoot, '.snipforge.json'), JSON.stringify({
            name: 'Commit Library',
            description: '',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(repoRoot, 'hello.json'), JSON.stringify({
            title: 'Hello',
            body: 'echo hello',
        }))

        await initGitRepo(repoRoot)
        await runGit(repoRoot, ['add', '.'])
        await runGit(repoRoot, ['commit', '-m', 'initial'])
        await execFileAsync('git', ['init', '--bare', remoteRoot])
        await runGit(repoRoot, ['remote', 'add', 'origin', remoteRoot])
        await runGit(repoRoot, ['branch', '-M', 'main'])
        await runGit(repoRoot, ['push', '--set-upstream', 'origin', 'main'])

        const libraryId = db.addLibrary(repoRoot, 'Commit Library', '', '.snipforge.json', 'local', 'owner')

        await fs.writeFile(path.join(repoRoot, 'hello.json'), JSON.stringify({
            title: 'Hello',
            body: 'echo updated',
        }))

        const blockedUpdate = await updateLibraryOrigin(libraryId, async (args, cwd) => ({ stdout: await runGit(cwd, args) }))
        expect(blockedUpdate.success).toBe(false)
        expect(blockedUpdate.blocked).toBe(true)
        expect(blockedUpdate.error).toContain('Commit or discard local changes')

        const commitResult = await commitLibraryChanges(libraryId, 'Save local edits', async (args, cwd) => ({ stdout: await runGit(cwd, args) }))
        expect(commitResult.success).toBe(true)

        const library = db.getAllLibraries().find(item => item.id === libraryId)!
        const status = await getLibraryWorkingTreeStatus(library, async (args, cwd) => ({ stdout: await runGit(cwd, args) }))
        expect(status.state).toBe('clean')
    })

    it('pushes owner changes to origin and blocks push for consumer access', async () => {
        const repoRoot = path.join(tmpDir, 'push-repo')
        const remoteRoot = path.join(tmpDir, 'push-remote.git')
        await fs.mkdir(repoRoot, { recursive: true })
        await fs.writeFile(path.join(repoRoot, '.snipforge.json'), JSON.stringify({
            name: 'Push Library',
            description: '',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(repoRoot, 'hello.json'), JSON.stringify({
            title: 'Hello',
            body: 'echo hello',
        }))

        await initGitRepo(repoRoot)
        await runGit(repoRoot, ['add', '.'])
        await runGit(repoRoot, ['commit', '-m', 'initial'])
        await execFileAsync('git', ['init', '--bare', remoteRoot])
        await runGit(repoRoot, ['remote', 'add', 'origin', remoteRoot])
        await runGit(repoRoot, ['branch', '-M', 'main'])
        await runGit(repoRoot, ['push', '--set-upstream', 'origin', 'main'])
        await runGit(repoRoot, ['checkout', '-b', 'feature/push-flow'])

        const ownerLibraryId = db.addLibrary(repoRoot, 'Push Library', '', '.snipforge.json', 'local', 'owner')
        await fs.writeFile(path.join(repoRoot, 'hello.json'), JSON.stringify({
            title: 'Hello',
            body: 'echo push me',
        }))
        await commitLibraryChanges(ownerLibraryId, 'Prepare push', async (args, cwd) => ({ stdout: await runGit(cwd, args) }))

        const pushResult = await pushLibraryChanges(ownerLibraryId, async (args, cwd) => ({ stdout: await runGit(cwd, args) }))
        expect(pushResult.success).toBe(true)

        const remoteBranches = await execFileAsync('git', ['--git-dir', remoteRoot, 'branch', '--list'])
        expect(String(remoteBranches.stdout)).toContain('feature/push-flow')

        db.updateLibraryPermission(ownerLibraryId, 'consumer')
        const blockedPush = await pushLibraryChanges(ownerLibraryId, async (args, cwd) => ({ stdout: await runGit(cwd, args) }))
        expect(blockedPush.success).toBe(false)
        expect(blockedPush.blocked).toBe(true)
        expect(blockedPush.error).toContain('consumer access')
    })

    it('falls back to a compare URL when GitHub CLI is unavailable', async () => {
        const repoRoot = path.join(tmpDir, 'pr-repo')
        const remoteRoot = path.join(tmpDir, 'pr-remote.git')
        await fs.mkdir(repoRoot, { recursive: true })
        await fs.writeFile(path.join(repoRoot, '.snipforge.json'), JSON.stringify({
            name: 'PR Library',
            description: '',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(repoRoot, 'hello.json'), JSON.stringify({
            title: 'Hello',
            body: 'echo hello',
        }))

        await initGitRepo(repoRoot)
        await runGit(repoRoot, ['add', '.'])
        await runGit(repoRoot, ['commit', '-m', 'initial'])
        await execFileAsync('git', ['init', '--bare', remoteRoot])
        await runGit(repoRoot, ['remote', 'add', 'origin', remoteRoot])
        await runGit(repoRoot, ['branch', '-M', 'main'])
        await runGit(repoRoot, ['push', '--set-upstream', 'origin', 'main'])
        await runGit(repoRoot, ['checkout', '-b', 'feature/browser-pr'])
        await runGit(repoRoot, ['remote', 'set-url', 'origin', 'https://github.com/ArtluxDM/SnipForge.git'])

        const libraryId = db.addLibrary(repoRoot, 'PR Library', '', '.snipforge.json', 'local', 'consumer')

        const result = await openLibraryPullRequest(
            libraryId,
            async (args, cwd) => ({ stdout: await runGit(cwd, args) }),
            async () => {
                throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
            }
        )

        expect(result.success).toBe(true)
        expect(result.url).toBe('https://github.com/ArtluxDM/SnipForge/compare/main...feature%2Fbrowser-pr?expand=1')
        expect(result.message).toContain('GitHub CLI is unavailable')
    })
})

describe('local library CRUD', () => {
    it('migrates subscribed GitHub libraries into deterministic local git working copies', async () => {
        const remoteRepo = 'ArtluxDM/snips/subdir'
        const remoteRoot = path.join(tmpDir, 'remote.git')
        const seedRoot = path.join(tmpDir, 'seed')
        const libraryRoot = path.join(seedRoot, 'subdir')
        await fs.mkdir(libraryRoot, { recursive: true })
        await fs.writeFile(path.join(libraryRoot, '.snipforge.json'), JSON.stringify({
            name: 'Remote Library',
            description: 'Remote desc',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(libraryRoot, 'hello-world.json'), JSON.stringify({
            title: 'Hello World',
            body: 'echo hello',
            description: 'greeting',
            tags: ['hello'],
            language: 'bash',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
        }))

        await initGitRepo(seedRoot)
        await runGit(seedRoot, ['add', '.'])
        await runGit(seedRoot, ['commit', '-m', 'initial'])
        await runGit(tmpDir, ['init', '--bare', '--initial-branch=main', remoteRoot])
        await runGit(seedRoot, ['remote', 'add', 'origin', remoteRoot])
        await runGit(seedRoot, ['branch', '-M', 'main'])
        await runGit(seedRoot, ['push', '--set-upstream', 'origin', 'main'])

        db.addLibrary(remoteRepo, 'Remote Library', 'Remote desc', 'subdir/.snipforge.json', 'github', 'consumer')

        const result = await migrateRemoteLibrariesToLocalWorkingCopies(tmpDir, {
            runGit: async (args, cwd) => ({ stdout: await runGit(cwd, args) }),
            resolveCloneSource: () => remoteRoot,
        })
        expect(result.migrated).toBe(1)
        expect(result.errors).toEqual([])

        const libraries = db.getAllLibraries()
        expect(libraries).toHaveLength(1)
        const migrated = libraries[0]

        const expectedRoot = path.join(tmpDir, 'working-copies', 'github', 'ArtluxDM', 'snips', 'subdir')
        expect(migrated.type).toBe('local')
        expect(migrated.github_repo).toBe(expectedRoot)
        expect(migrated.local_path).toBe(expectedRoot)
        expect(migrated.origin?.provider).toBe('github')
        expect(migrated.origin?.url).toBe(remoteRepo)
        expect(typeof migrated.origin?.ref).toBe('string')
        expect(migrated.working_copy).toEqual({
            local_path: expectedRoot,
            manifest_path: '.snipforge.json',
            materialized: true,
        })

        const manifest = JSON.parse(await fs.readFile(path.join(expectedRoot, '.snipforge.json'), 'utf8'))
        expect(manifest.name).toBe('Remote Library')
        expect(manifest.description).toBe('Remote desc')

        const commandFile = JSON.parse(await fs.readFile(path.join(expectedRoot, 'hello-world.json'), 'utf8'))
        expect(commandFile.title).toBe('Hello World')
        expect(commandFile.body).toBe('echo hello')
        expect(commandFile.tags).toEqual(['hello'])

        const migratedCommands = db.getRemoteCommands(migrated.id)
        expect(migratedCommands).toHaveLength(1)
        expect(migratedCommands[0].remote_path).toBe('hello-world.json')

        const status = await getLibraryWorkingTreeStatus(migrated)
        expect(status.state).toBe('clean')

        const reindexResults = await reindexInitializedLocalLibraries()
        expect(reindexResults).toHaveLength(1)
        expect(reindexResults[0].result.errors).toEqual([])

        const rerun = await migrateRemoteLibrariesToLocalWorkingCopies(tmpDir)
        expect(rerun.migrated).toBe(0)
        expect(db.getAllLibraries()).toHaveLength(1)
    })

    it('keeps migrated origin-backed libraries uninitialized when the cloned working copy has no manifest', async () => {
        const remoteRepo = 'ArtluxDM/snips'
        const remoteRoot = path.join(tmpDir, 'remote-no-manifest.git')
        const seedRoot = path.join(tmpDir, 'seed-no-manifest')
        await fs.mkdir(seedRoot, { recursive: true })
        await fs.writeFile(path.join(seedRoot, 'hello-world.json'), JSON.stringify({
            title: 'Hello World',
            body: 'echo hello',
        }))

        await initGitRepo(seedRoot)
        await runGit(seedRoot, ['add', '.'])
        await runGit(seedRoot, ['commit', '-m', 'initial'])
        await runGit(tmpDir, ['init', '--bare', '--initial-branch=main', remoteRoot])
        await runGit(seedRoot, ['remote', 'add', 'origin', remoteRoot])
        await runGit(seedRoot, ['branch', '-M', 'main'])
        await runGit(seedRoot, ['push', '--set-upstream', 'origin', 'main'])

        db.addLibrary(remoteRepo, 'Remote Library', 'Remote desc', null, 'github', 'consumer')

        const result = await migrateRemoteLibrariesToLocalWorkingCopies(tmpDir, {
            runGit: async (args, cwd) => ({ stdout: await runGit(cwd, args) }),
            resolveCloneSource: () => remoteRoot,
        })

        expect(result.migrated).toBe(1)
        expect(result.errors).toEqual([])

        const migrated = db.getAllLibraries()[0]
        const expectedRoot = path.join(tmpDir, 'working-copies', 'github', 'ArtluxDM', 'snips')
        expect(migrated.type).toBe('local')
        expect(migrated.github_repo).toBe(expectedRoot)
        expect(migrated.manifest_path).toBeNull()
        expect(migrated.working_copy).toEqual({
            local_path: expectedRoot,
            manifest_path: null,
            materialized: false,
        })
        expect(db.getRemoteCommands(migrated.id)).toHaveLength(0)
    })

    it('relinks a legacy materialized origin-backed library to a real repo-backed folder', async () => {
        const legacyRoot = path.join(tmpDir, 'legacy-copy')
        await fs.mkdir(legacyRoot, { recursive: true })
        await fs.writeFile(path.join(legacyRoot, '.snipforge.json'), JSON.stringify({
            name: 'HomeLab Commands',
            description: 'Legacy materialized copy',
            format_version: '1.0',
        }))

        const libraryId = db.addLibrary(legacyRoot, 'HomeLab Commands', 'Legacy materialized copy', '.snipforge.json', 'local', 'consumer')
        db.updateLibraryOrigin(libraryId, 'ArtluxDM/home-lab/homelab_snipforge_library', 'main')

        const repoRoot = path.join(tmpDir, 'home-lab')
        const libraryRoot = path.join(repoRoot, 'homelab_snipforge_library')
        await fs.mkdir(libraryRoot, { recursive: true })
        await fs.writeFile(path.join(libraryRoot, '.snipforge.json'), JSON.stringify({
            name: 'HomeLab Commands',
            description: 'Real repo-backed library',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(libraryRoot, 'deploy.json'), JSON.stringify({
            title: 'Deploy',
            body: 'kubectl apply -k .',
            tags: ['k8s'],
        }))

        await initGitRepo(repoRoot)
        await runGit(repoRoot, ['add', '.'])
        await runGit(repoRoot, ['commit', '-m', 'initial'])
        await runGit(repoRoot, ['remote', 'add', 'origin', 'https://github.com/ArtluxDM/home-lab.git'])

        const result = await relinkOriginLibraryToFolder(libraryId, libraryRoot)

        expect(result.library.github_repo).toBe(libraryRoot)
        expect(result.library.local_path).toBe(libraryRoot)
        expect(result.library.origin).toEqual({
            provider: 'github',
            url: 'ArtluxDM/home-lab/homelab_snipforge_library',
            ref: 'main',
        })
        expect(result.syncResult.errors).toEqual([])

        const status = await getLibraryWorkingTreeStatus(result.library)
        expect(status.state).toBe('clean')
        expect(db.getRemoteCommands(libraryId).map(command => command.remote_path)).toEqual(['deploy.json'])
    })

    it('opens a nested library when the chosen folder only contains a manifest in a subdirectory', async () => {
        const nestedRoot = path.join(tmpDir, 'repo-root')
        const libraryRoot = path.join(nestedRoot, 'The Armory')
        await fs.mkdir(libraryRoot, { recursive: true })
        await fs.writeFile(path.join(libraryRoot, '.snipforge.json'), JSON.stringify({
            name: 'The Armory',
            description: 'Nested library',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(libraryRoot, 'ping.json'), JSON.stringify({
            title: 'Ping',
            body: 'ping 1.1.1.1',
            tags: ['network'],
        }))

        const result = await openLocalFolder(nestedRoot)

        expect('needsPick' in result).toBe(false)
        if ('needsPick' in result) {
            throw new Error('Expected nested library to open directly')
        }

        expect(result.library.github_repo).toBe(libraryRoot)
        expect(result.library.manifest_path).toBe('.snipforge.json')
        expect(result.syncResult.added).toBe(1)

        const libraries = db.getAllLibraries()
        expect(libraries).toHaveLength(1)
        expect(libraries[0].github_repo).toBe(libraryRoot)
    })

    it('returns a picker payload when a folder contains multiple nested libraries', async () => {
        const nestedRoot = path.join(tmpDir, 'repo-root')
        const alphaRoot = path.join(nestedRoot, 'alpha')
        const betaRoot = path.join(nestedRoot, 'beta')
        await fs.mkdir(alphaRoot, { recursive: true })
        await fs.mkdir(betaRoot, { recursive: true })

        await fs.writeFile(path.join(alphaRoot, '.snipforge.json'), JSON.stringify({
            name: 'Alpha',
            description: 'First',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(betaRoot, '.snipforge.json'), JSON.stringify({
            name: 'Beta',
            description: 'Second',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(alphaRoot, 'one.json'), JSON.stringify({
            title: 'One',
            body: 'echo one',
        }))
        await fs.writeFile(path.join(betaRoot, 'two.json'), JSON.stringify({
            title: 'Two',
            body: 'echo two',
        }))

        const result = await openLocalFolder(nestedRoot)

        expect('needsPick' in result).toBe(true)
        if (!('needsPick' in result)) {
            throw new Error('Expected multiple nested libraries to require picking')
        }

        expect(result.libraries).toHaveLength(2)
        expect(result.libraries.map(lib => lib.name)).toEqual(['Alpha', 'Beta'])
        expect(result.libraries.map(lib => lib.path)).toEqual([alphaRoot, betaRoot])
        expect(result.libraries.map(lib => lib.commandCount)).toEqual([1, 1])
        expect(db.getAllLibraries()).toHaveLength(0)
    })

    it('requires a default writable library before creating commands', async () => {
        const result = await createLocalLibraryCommand({
            title: 'No Library Yet',
            body: 'echo nope',
            description: '',
            tags: '[]',
            language: 'bash',
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('default writable library')
        expect(db.getAllCommands()).toHaveLength(0)
    })

    it('writes created commands to disk with a stable id, safely renames on title change, then deletes the file', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        const createResult = await createLocalLibraryCommand({
            title: '  Git Commit  ',
            body: '  git commit -m "msg"  ',
            description: '  Initial command  ',
            tags: '["Git", "commit", " git "]',
            language: '  BASH  ',
        })

        expect(createResult.success).toBe(true)
        expect(createResult.mode).toBe('library')

        const createdCommands = db.getRemoteCommands(setup.library.id)
        expect(createdCommands).toHaveLength(1)

        const commandId = createdCommands[0].id
        const commandPath = createdCommands[0].remote_path as string
        const createdFile = JSON.parse(await fs.readFile(path.join(tmpDir, commandPath), 'utf8'))
        expect(createdFile.snipforge).toBe('command')
        expect(createdFile.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(createdFile.title).toBe('Git Commit')
        expect(createdFile.body).toBe('git commit -m "msg"')
        expect(createdFile.description).toBe('Initial command')
        expect(createdFile.tags).toEqual(['git', 'commit'])
        expect(createdFile.language).toBe('bash')

        const updateResult = await updateLocalLibraryCommand(commandId, {
            title: 'Git Commit Updated',
            body: 'git commit --amend',
            description: 'Updated command',
            tags: '["git", "amend"]',
            language: 'bash',
        })

        expect(updateResult.success).toBe(true)
        expect(updateResult.mode).toBe('library')

        const updatedCommands = db.getRemoteCommands(setup.library.id)
        expect(updatedCommands).toHaveLength(1)
        const renamedPath = updatedCommands[0].remote_path as string
        expect(renamedPath).toBe('git-commit-updated.json')
        await expect(fs.access(path.join(tmpDir, commandPath))).rejects.toThrow()

        const updatedFile = JSON.parse(await fs.readFile(path.join(tmpDir, renamedPath), 'utf8'))
        expect(updatedFile.id).toBe(createdFile.id)
        expect(updatedFile.title).toBe('Git Commit Updated')
        expect(updatedFile.body).toBe('git commit --amend')

        const deleteResult = await deleteLocalLibraryCommand(commandId)
        expect(deleteResult.success).toBe(true)
        expect(deleteResult.mode).toBe('library')
        await expect(fs.access(path.join(tmpDir, renamedPath))).rejects.toThrow()
        expect(db.getRemoteCommands(setup.library.id)).toHaveLength(0)
    })

    it('extracts rich text images into library attachments and indexes them back as local file URLs', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        const richBody = `<p>Checklist</p><img src="${TINY_PNG_DATA_URI}" alt="tiny">`

        const createResult = await createLocalLibraryCommand({
            title: 'Rich Text With Image',
            body: richBody,
            description: 'portable rich text',
            tags: '["richtext"]',
            language: 'richtext',
        })

        expect(createResult.success).toBe(true)

        const [indexedCommand] = db.getRemoteCommands(setup.library.id)
        const commandPath = indexedCommand.remote_path as string
        const savedFile = JSON.parse(await fs.readFile(path.join(tmpDir, commandPath), 'utf8'))

        expect(savedFile.body).not.toContain('data:image')
        const savedSrcMatch = savedFile.body.match(/src="([^"]+)"/)
        expect(savedSrcMatch?.[1]).toMatch(/^attachments\/[0-9a-f-]{36}\/image-[0-9a-f]{16}\.png$/)

        const attachmentPath = path.join(tmpDir, savedSrcMatch![1])
        await expect(fs.access(attachmentPath)).resolves.toBeUndefined()
        expect(indexedCommand.body).toContain(pathToFileURL(attachmentPath).href)

        await updateLocalLibraryCommand(indexedCommand.id, {
            title: 'Rich Text With Image',
            body: indexedCommand.body.replace('Checklist', 'Updated Checklist'),
            description: 'portable rich text',
            tags: '["richtext"]',
            language: 'richtext',
        })

        const [updatedCommand] = db.getRemoteCommands(setup.library.id)
        const updatedFile = JSON.parse(await fs.readFile(path.join(tmpDir, updatedCommand.remote_path as string), 'utf8'))
        expect(updatedFile.body).toContain(savedSrcMatch![1])
        expect(updatedFile.body).not.toContain('file://')
        expect(updatedCommand.body).toContain(pathToFileURL(attachmentPath).href)
    })

    it('cleans orphaned rich text attachments on update and delete', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)

        await createLocalLibraryCommand({
            title: 'Rich Text Cleanup',
            body: `<p>Before</p><img src="${TINY_PNG_DATA_URI}" alt="tiny">`,
            description: 'cleanup',
            tags: '["richtext"]',
            language: 'richtext',
        })

        const [createdCommand] = db.getRemoteCommands(setup.library.id)
        const commandPath = path.join(tmpDir, createdCommand.remote_path as string)
        const createdFile = JSON.parse(await fs.readFile(commandPath, 'utf8'))
        const initialAttachment = path.join(tmpDir, createdFile.body.match(/src="([^"]+)"/)?.[1] as string)
        const attachmentDir = path.dirname(initialAttachment)

        await updateLocalLibraryCommand(createdCommand.id, {
            title: 'Rich Text Cleanup',
            body: '<p>After</p>',
            description: 'cleanup',
            tags: '["richtext"]',
            language: 'richtext',
        })

        await expect(fs.access(initialAttachment)).rejects.toThrow()
        await expect(fs.access(attachmentDir)).rejects.toThrow()

        await deleteLocalLibraryCommand(createdCommand.id)
        expect(db.getRemoteCommands(setup.library.id)).toHaveLength(0)
    })

    it('uses a suffixed filename when a title-change rename would collide', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)

        await createLocalLibraryCommand({
            title: 'Git Commit Updated',
            body: 'git commit --amend',
            description: 'existing',
            tags: '["git"]',
            language: 'bash',
        })

        await createLocalLibraryCommand({
            title: 'Git Commit',
            body: 'git commit -m "msg"',
            description: 'rename me',
            tags: '["git"]',
            language: 'bash',
        })

        const existingCommands = db.getRemoteCommands(setup.library.id)
        const commandToRename = existingCommands.find(command => command.title === 'Git Commit')
        expect(commandToRename).toBeTruthy()

        const updateResult = await updateLocalLibraryCommand(commandToRename!.id, {
            title: 'Git Commit Updated',
            body: 'git commit --fixup HEAD',
            description: 'renamed with collision',
            tags: '["git", "fixup"]',
            language: 'bash',
        })

        expect(updateResult.success).toBe(true)

        const commands = db.getRemoteCommands(setup.library.id)
        const renamed = commands.find(command => command.body === 'git commit --fixup HEAD')
        expect(renamed?.remote_path).toBe('git-commit-updated-2.json')

        const renamedFile = JSON.parse(await fs.readFile(path.join(tmpDir, renamed!.remote_path as string), 'utf8'))
        expect(renamedFile.title).toBe('Git Commit Updated')
        expect(renamedFile.body).toBe('git commit --fixup HEAD')
    })

    it('batches command creation into a single local-library sync', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)

        const result = await createLocalLibraryCommands([
            {
                title: 'Git Status',
                body: 'git status',
                description: 'Check repo state',
                tags: '["git"]',
                language: 'bash',
            },
            {
                title: 'Git Pull',
                body: 'git pull',
                description: 'Update local branch',
                tags: '["git"]',
                language: 'bash',
            }
        ])

        expect(result.success).toBe(true)
        expect(result.mode).toBe('library')
        expect(result.processed).toBe(2)
        expect(result.succeeded).toBe(2)
        expect(result.failed).toBe(0)

        const commands = db.getRemoteCommands(setup.library.id)
        expect(commands).toHaveLength(2)
        expect(commands.map(command => command.title).sort()).toEqual(['Git Pull', 'Git Status'])
    })

    it('duplicates read-only library command edits into the default writable library', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        const consumerRoot = path.join(tmpDir, 'consumer-library')
        await fs.mkdir(consumerRoot, { recursive: true })
        await fs.writeFile(path.join(consumerRoot, '.snipforge.json'), JSON.stringify({
            name: 'Consumer Library',
            description: '',
            format_version: '1.0',
        }) + '\n')
        await fs.writeFile(path.join(consumerRoot, 'read-only.json'), JSON.stringify({
            snipforge: 'command',
            id: '11111111-1111-1111-1111-111111111111',
            title: 'Read Only Command',
            body: 'echo upstream',
            description: 'from subscribed library',
            tags: ['remote'],
            language: 'bash',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
        }, null, 2) + '\n')

        const opened = await openLocalFolder(consumerRoot)
        if ('needsPick' in opened) {
            throw new Error('Expected consumer library to open directly')
        }
        db.updateLibraryPermission(opened.library.id, 'consumer')

        const [readOnlyCommand] = db.getRemoteCommands(opened.library.id)
        const result = await updateLocalLibraryCommand(readOnlyCommand.id, {
            title: 'Forked Edit',
            body: 'echo forked edit',
            description: 'edited copy',
            tags: '["forked"]',
            language: 'bash',
        })

        expect(result.success).toBe(true)
        expect(result.mode).toBe('library')

        const originalFile = JSON.parse(await fs.readFile(path.join(consumerRoot, 'read-only.json'), 'utf8'))
        expect(originalFile.title).toBe('Read Only Command')
        expect(originalFile.body).toBe('echo upstream')

        const defaultCommands = db.getRemoteCommands(setup.library.id)
        expect(defaultCommands).toHaveLength(1)
        expect(defaultCommands[0].title).toBe('Forked Edit')
        expect(defaultCommands[0].body).toBe('echo forked edit')
        expect(defaultCommands[0].remote_path).toBe('forked-edit.json')
    })

    it('blocks deleting read-only library cache rows', async () => {
        await setupDefaultWritableLocalLibrary(tmpDir)
        const consumerRoot = path.join(tmpDir, 'consumer-library')
        await fs.mkdir(consumerRoot, { recursive: true })
        await fs.writeFile(path.join(consumerRoot, '.snipforge.json'), JSON.stringify({
            name: 'Consumer Library',
            description: '',
            format_version: '1.0',
        }) + '\n')
        await fs.writeFile(path.join(consumerRoot, 'read-only.json'), JSON.stringify({
            snipforge: 'command',
            id: '22222222-2222-2222-2222-222222222222',
            title: 'Read Only Command',
            body: 'echo upstream',
            description: 'from subscribed library',
            tags: ['remote'],
            language: 'bash',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
        }, null, 2) + '\n')

        const opened = await openLocalFolder(consumerRoot)
        if ('needsPick' in opened) {
            throw new Error('Expected consumer library to open directly')
        }
        db.updateLibraryPermission(opened.library.id, 'consumer')

        const [readOnlyCommand] = db.getRemoteCommands(opened.library.id)
        const result = await deleteLocalLibraryCommand(readOnlyCommand.id)

        expect(result.success).toBe(false)
        expect(result.error).toContain('Read-only library commands cannot be deleted')
        expect(db.getRemoteCommands(opened.library.id)).toHaveLength(1)
    })

    it('falls back to database CRUD for legacy DB-only commands', async () => {
        const commandId = db.addCommand({
            title: 'Legacy Command',
            body: 'echo legacy',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const updateResult = await updateLocalLibraryCommand(commandId, {
            title: 'Legacy Command Updated',
            body: 'echo legacy updated',
            description: 'still local',
            tags: '["legacy"]',
            language: 'bash',
        })

        expect(updateResult.success).toBe(true)
        expect(updateResult.mode).toBe('database')
        expect(db.getAllCommands()[0].title).toBe('Legacy Command Updated')

        const deleteResult = await deleteLocalLibraryCommand(commandId)
        expect(deleteResult.success).toBe(true)
        expect(deleteResult.mode).toBe('database')
        expect(db.getAllCommands()).toHaveLength(0)
    })

    it('batches deletion for legacy DB-only commands', async () => {
        const firstId = db.addCommand({
            title: 'Legacy One',
            body: 'echo one',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })
        const secondId = db.addCommand({
            title: 'Legacy Two',
            body: 'echo two',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const result = await deleteLocalLibraryCommands([firstId, secondId])

        expect(result.success).toBe(true)
        expect(result.mode).toBe('database')
        expect(result.succeeded).toBe(2)
        expect(result.failed).toBe(0)
        expect(db.getAllCommands()).toHaveLength(0)
    })

    it('reindexes initialized local libraries on startup-style rebuild', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        await createLocalLibraryCommand({
            title: 'Reindex Me',
            body: 'echo from disk',
            description: 'cache me again',
            tags: '["cache"]',
            language: 'bash',
        })

        const existing = db.getRemoteCommands(setup.library.id)
        expect(existing).toHaveLength(1)
        expect(existing[0].remote_path).toBeTruthy()

        db.deleteRemoteCommand(setup.library.id, existing[0].remote_path as string)
        expect(db.getRemoteCommands(setup.library.id)).toHaveLength(0)

        const results = await reindexInitializedLocalLibraries()

        expect(results).toHaveLength(1)
        expect(results[0].result.added).toBe(1)
        expect(results[0].result.errors).toEqual([])

        const rebuilt = db.getRemoteCommands(setup.library.id)
        expect(rebuilt).toHaveLength(1)
        expect(rebuilt[0].title).toBe('Reindex Me')
        expect(rebuilt[0].body).toBe('echo from disk')
    })

    it('refreshes stale indexed data from disk during reindex', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        await createLocalLibraryCommand({
            title: 'Original Title',
            body: 'echo original',
            description: 'original desc',
            tags: '["original"]',
            language: 'bash',
        })

        const existing = db.getRemoteCommands(setup.library.id)
        const remotePath = existing[0].remote_path as string
        const filePath = path.join(tmpDir, remotePath)
        const fileJson = JSON.parse(await fs.readFile(filePath, 'utf8'))
        fileJson.title = 'Disk Wins'
        fileJson.body = 'echo updated from disk'
        fileJson.updated_at = '2099-01-01T00:00:00.000Z'
        await fs.writeFile(filePath, JSON.stringify(fileJson, null, 2) + '\n', 'utf8')

        const results = await reindexInitializedLocalLibraries()

        expect(results[0].result.updated).toBe(1)

        const rebuilt = db.getRemoteCommands(setup.library.id)
        expect(rebuilt[0].title).toBe('Disk Wins')
        expect(rebuilt[0].body).toBe('echo updated from disk')
    })

    it('migrates legacy DB-only commands when choosing the default local library', async () => {
        db.addCommand({
            title: 'Pre Setup Legacy Command',
            body: 'echo migrate after pick',
            description: 'created before default library exists',
            tags: '["legacy", "first-run"]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const setup = await setupDefaultWritableLocalLibrary(tmpDir)

        expect(setup.legacyMigration.completed).toBe(true)
        expect(setup.legacyMigration.migrated).toBe(1)
        expect(setup.legacyMigration.skipped).toBe(0)
        expect(setup.legacyMigration.errors).toEqual([])
        expect(settings.get<boolean>('library.legacyDbMigrationCompleted')).toBe(true)
        expect(db.getLegacyDbOnlyCommands()).toHaveLength(0)

        const remoteCommands = db.getRemoteCommands(setup.library.id)
        expect(remoteCommands).toHaveLength(1)
        expect(remoteCommands[0].body).toBe('echo migrate after pick')
        const filePath = path.join(tmpDir, remoteCommands[0].remote_path as string)
        const migratedFile = JSON.parse(await fs.readFile(filePath, 'utf8'))
        expect(migratedFile.snipforge).toBe('command')
        expect(migratedFile.title).toBe('Pre Setup Legacy Command')
    })

    it('migrates legacy DB-only commands into the default local library', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        db.addCommand({
            title: 'Legacy Migrated Command',
            body: 'echo migrate me',
            description: 'from sqlite only',
            tags: '["legacy", "migrate"]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const result = await migrateLegacyDbOnlyCommandsToDefaultLibrary()

        expect(result.completed).toBe(true)
        expect(result.library?.id).toBe(setup.library.id)
        expect(result.migrated).toBe(1)
        expect(result.skipped).toBe(0)
        expect(settings.get<boolean>('library.legacyDbMigrationCompleted')).toBe(true)
        expect(db.getAllCommands().some(command => command.source === 'local' && command.body === 'echo migrate me')).toBe(false)

        const remoteCommands = db.getRemoteCommands(setup.library.id)
        expect(remoteCommands).toHaveLength(1)
        const filePath = path.join(tmpDir, remoteCommands[0].remote_path as string)
        const migratedFile = JSON.parse(await fs.readFile(filePath, 'utf8'))
        expect(migratedFile.snipforge).toBe('command')
        expect(migratedFile.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(migratedFile.title).toBe('Legacy Migrated Command')
        expect(migratedFile.body).toBe('echo migrate me')
    })

    it('does not delete legacy DB-only commands when the default library is stale on disk', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        await fs.rm(path.join(tmpDir, '.snipforge.json'))
        db.addCommand({
            title: 'Still In DB',
            body: 'echo keep me',
            description: 'stale default library',
            tags: '["legacy"]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const result = await migrateLegacyDbOnlyCommandsToDefaultLibrary()

        expect(result.completed).toBe(false)
        expect(result.library?.id).toBe(setup.library.id)
        expect(result.migrated).toBe(0)
        expect(result.skipped).toBe(0)
        expect(settings.get<boolean>('library.legacyDbMigrationCompleted')).toBe(false)
        expect(db.getAllCommands().some(command => command.source === 'local' && command.body === 'echo keep me')).toBe(true)
        expect(db.getRemoteCommands(setup.library.id)).toHaveLength(0)
    })
})
