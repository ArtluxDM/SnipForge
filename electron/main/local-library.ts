import { app } from 'electron'
import { promises as fs, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import * as db from './database'
import * as settings from './settings'
import type {
    BatchCommandMutationResult,
    CommandMutationResult,
    DiscoveredLibrary,
    Library,
    LegacyDbMigrationResult,
    LibraryGitWorkflowSummary,
    LibraryManifest,
    LibraryWorkflowResult,
    LibraryWorkingTreeStatus,
    RemoteCommand,
    SyncResult,
} from '../../shared/types'
import {
    buildLibraryCommandFileData,
    normalizeCommandId,
    parseLibraryCommandFile,
    serializeLibraryCommandFile,
    slugify,
    toIndexedLibraryCommandData,
} from '../../shared/library-command'
export { slugify } from '../../shared/library-command'

// ── Local Folder Scanning ────────────────────────────────────────

interface ScanResult {
    manifest: LibraryManifest
    manifestPath: string
    commands: Array<{ path: string; command: RemoteCommand; content: string; hasUpdatedAt: boolean }>
}

interface CommandFormData {
    title: string
    body: string
    description: string
    tags: string
    language: string
}

interface RemoteLibraryMigrationOptions {
    runGit?: GitCommandRunner
    resolveCloneSource?: (owner: string, repo: string) => string
}

const LIBRARY_ATTACHMENTS_DIR = 'attachments'
const IMAGE_DATA_URI_RE = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i
const IMAGE_TAG_RE = /<img\b[^>]*>/gi
const IMAGE_SRC_ATTR_RE = /\bsrc=(['"])(.*?)\1/i
const execFileAsync = promisify(execFile)
type GitCommandRunner = (args: string[], cwd: string) => Promise<{ stdout: string }>
type CommandRunner = (command: string, args: string[], cwd?: string) => Promise<{ stdout: string }>

interface GitWorkflowContext {
    library: Library
    workingTree: LibraryWorkingTreeStatus
    remoteName: string | null
    remoteUrl: string | null
    currentBranch: string | null
    defaultBranch: string | null
    upstreamBranch: string | null
    hasUpstream: boolean
    githubRepo: {
        owner: string
        repo: string
        httpsUrl: string
    } | null
    gitUnavailable: boolean
    gitError: string | null
}

function commandAttachmentsFolderPath(libraryRoot: string, commandId: string): string {
    return path.join(libraryRoot, LIBRARY_ATTACHMENTS_DIR, commandId)
}

function createWorkingTreeStatus(
    overrides: Partial<LibraryWorkingTreeStatus> & Pick<LibraryWorkingTreeStatus, 'state'>
): LibraryWorkingTreeStatus {
    return {
        state: overrides.state,
        has_changes: overrides.has_changes ?? false,
        modified: overrides.modified ?? 0,
        added: overrides.added ?? 0,
        deleted: overrides.deleted ?? 0,
        checked_at: overrides.checked_at ?? new Date().toISOString(),
        error: overrides.error ?? null,
    }
}

async function runSystemGit(args: string[], cwd: string): Promise<{ stdout: string }> {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args])
    return { stdout: String(stdout) }
}

async function runCommand(command: string, args: string[], cwd?: string): Promise<{ stdout: string }> {
    const { stdout } = await execFileAsync(command, args, cwd ? { cwd } : undefined)
    return { stdout: String(stdout) }
}

function parseWorkingTreeCounts(stdout: string): Pick<LibraryWorkingTreeStatus, 'has_changes' | 'modified' | 'added' | 'deleted'> {
    let modified = 0
    let added = 0
    let deleted = 0

    for (const line of stdout.split('\n')) {
        if (!line.trim()) {
            continue
        }

        const code = line.slice(0, 2)
        const [indexStatus, workTreeStatus] = code

        if (code === '??' || indexStatus === 'A') {
            added += 1
            continue
        }

        if (indexStatus === 'D' || workTreeStatus === 'D') {
            deleted += 1
            continue
        }

        modified += 1
    }

    return {
        has_changes: modified > 0 || added > 0 || deleted > 0,
        modified,
        added,
        deleted,
    }
}

function isGitMissingError(error: unknown): boolean {
    const execError = error as NodeJS.ErrnoException | undefined
    if (!execError) {
        return false
    }

    return execError.code === 'ENOENT' || /not found/i.test(execError.message || '')
}

function isNotRepoError(error: unknown): boolean {
    const execError = error as NodeJS.ErrnoException | undefined
    const stderr = typeof (execError as { stderr?: unknown })?.stderr === 'string'
        ? String((execError as { stderr?: unknown }).stderr)
        : ''
    const message = `${execError?.message || ''}\n${stderr}`.toLowerCase()

    return message.includes('not a git repository')
}

function trimStdout(stdout: string): string {
    return stdout.trim()
}

async function tryRunGit(
    runGit: GitCommandRunner,
    cwd: string,
    args: string[]
): Promise<{ ok: true; stdout: string } | { ok: false; error: unknown }> {
    try {
        const result = await runGit(args, cwd)
        return { ok: true, stdout: String(result.stdout) }
    } catch (error) {
        return { ok: false, error }
    }
}

function normalizeGitHubRemoteUrl(remoteUrl: string): GitWorkflowContext['githubRepo'] {
    const trimmed = remoteUrl.trim()
    if (!trimmed) {
        return null
    }

    const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i)
    if (sshMatch) {
        const [, owner, repo] = sshMatch
        return {
            owner,
            repo,
            httpsUrl: `https://github.com/${owner}/${repo}`,
        }
    }

    const sshProtocolMatch = trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i)
    if (sshProtocolMatch) {
        const [, owner, repo] = sshProtocolMatch
        return {
            owner,
            repo,
            httpsUrl: `https://github.com/${owner}/${repo}`,
        }
    }

    const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i)
    if (httpsMatch) {
        const [, owner, repo] = httpsMatch
        return {
            owner,
            repo,
            httpsUrl: `https://github.com/${owner}/${repo}`,
        }
    }

    return null
}

function isLikelyCommitish(ref: string | null | undefined): boolean {
    return !!ref && /^[0-9a-f]{7,40}$/i.test(ref)
}

async function resolveGitWorkflowContext(
    library: Library,
    runGit: GitCommandRunner = runSystemGit
): Promise<GitWorkflowContext> {
    const workingTree = await getLibraryWorkingTreeStatus(library, runGit)

    if (!library.local_path) {
        return {
            library,
            workingTree,
            remoteName: null,
            remoteUrl: null,
            currentBranch: null,
            defaultBranch: null,
            upstreamBranch: null,
            hasUpstream: false,
            githubRepo: null,
            gitUnavailable: false,
            gitError: 'This library has no local working copy.',
        }
    }

    if (workingTree.state === 'git_unavailable') {
        return {
            library,
            workingTree,
            remoteName: null,
            remoteUrl: null,
            currentBranch: null,
            defaultBranch: null,
            upstreamBranch: null,
            hasUpstream: false,
            githubRepo: null,
            gitUnavailable: true,
            gitError: workingTree.error,
        }
    }

    if (workingTree.state === 'not_repo' || workingTree.state === 'no_working_copy' || workingTree.state === 'error') {
        return {
            library,
            workingTree,
            remoteName: null,
            remoteUrl: null,
            currentBranch: null,
            defaultBranch: null,
            upstreamBranch: null,
            hasUpstream: false,
            githubRepo: null,
            gitUnavailable: false,
            gitError: workingTree.error,
        }
    }

    const remoteNameResult = await tryRunGit(runGit, library.local_path, ['remote'])
    const remoteName = remoteNameResult.ok
        ? trimStdout(remoteNameResult.stdout).split('\n').map(value => value.trim()).find(Boolean) || null
        : null
    const remoteUrlResult = remoteName
        ? await tryRunGit(runGit, library.local_path, ['remote', 'get-url', remoteName])
        : { ok: false as const, error: new Error('No remote configured') }
    const remoteUrl = remoteUrlResult.ok ? trimStdout(remoteUrlResult.stdout) || null : null

    const branchResult = await tryRunGit(runGit, library.local_path, ['branch', '--show-current'])
    const currentBranch = branchResult.ok ? trimStdout(branchResult.stdout) || null : null

    const upstreamResult = await tryRunGit(runGit, library.local_path, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
    const upstreamBranch = upstreamResult.ok ? trimStdout(upstreamResult.stdout) || null : null
    const hasUpstream = !!upstreamBranch

    const defaultBranchResult = remoteName
        ? await tryRunGit(runGit, library.local_path, ['symbolic-ref', '--quiet', '--short', `refs/remotes/${remoteName}/HEAD`])
        : { ok: false as const, error: new Error('No remote configured') }
    const remoteShowResult = !defaultBranchResult.ok && remoteName
        ? await tryRunGit(runGit, library.local_path, ['remote', 'show', remoteName])
        : { ok: false as const, error: new Error('Remote HEAD already resolved') }
    const remoteHeadBranch = remoteShowResult.ok
        ? trimStdout(remoteShowResult.stdout)
            .split('\n')
            .map(line => line.trim())
            .find(line => line.startsWith('HEAD branch: '))
            ?.replace('HEAD branch: ', '')
            .trim() || null
        : null
    const localDefaultBranchResult = await tryRunGit(runGit, library.local_path, ['branch', '--list', 'main', 'master'])
    const localDefaultBranch = localDefaultBranchResult.ok
        ? trimStdout(localDefaultBranchResult.stdout)
            .split('\n')
            .map(line => line.replace(/^[* ]+/, '').trim())
            .find(Boolean) || null
        : null
    const defaultBranch = defaultBranchResult.ok
        ? trimStdout(defaultBranchResult.stdout).replace(`${remoteName}/`, '') || null
        : (remoteHeadBranch && remoteHeadBranch !== '(unknown)' ? remoteHeadBranch : null)
            || localDefaultBranch
            || (!isLikelyCommitish(library.origin?.ref) ? library.origin?.ref || null : null)

    return {
        library,
        workingTree,
        remoteName,
        remoteUrl,
        currentBranch,
        defaultBranch,
        upstreamBranch,
        hasUpstream,
        githubRepo: remoteUrl ? normalizeGitHubRemoteUrl(remoteUrl) : null,
        gitUnavailable: false,
        gitError: null,
    }
}

export async function getLibraryWorkingTreeStatus(
    library: Library,
    runGit: GitCommandRunner = runSystemGit
): Promise<LibraryWorkingTreeStatus> {
    if (!library.local_path) {
        return createWorkingTreeStatus({ state: 'no_working_copy' })
    }

    try {
        await runGit(['rev-parse', '--is-inside-work-tree'], library.local_path)
    } catch (error) {
        if (isGitMissingError(error)) {
            return createWorkingTreeStatus({
                state: 'git_unavailable',
                error: 'System git is unavailable on this machine.',
            })
        }

        if (isNotRepoError(error)) {
            return createWorkingTreeStatus({ state: 'not_repo' })
        }

        return createWorkingTreeStatus({
            state: 'error',
            error: (error as Error).message,
        })
    }

    try {
        const { stdout } = await runGit([
            'status',
            '--porcelain=1',
            '--untracked-files=all',
            '--',
            '.',
        ], library.local_path)
        const counts = parseWorkingTreeCounts(stdout)
        return createWorkingTreeStatus({
            state: counts.has_changes ? 'dirty' : 'clean',
            ...counts,
        })
    } catch (error) {
        if (isGitMissingError(error)) {
            return createWorkingTreeStatus({
                state: 'git_unavailable',
                error: 'System git is unavailable on this machine.',
            })
        }

        return createWorkingTreeStatus({
            state: 'error',
            error: (error as Error).message,
        })
    }
}

export async function getAllLibrariesWithWorkingTreeStatus(): Promise<Library[]> {
    const libraries = db.getAllLibraries()
    return Promise.all(
        libraries.map(async (library) => {
            const context = await resolveGitWorkflowContext(library)
            const inferredOrigin = !library.origin && context.githubRepo
                ? {
                    provider: 'github' as const,
                    url: context.githubRepo.httpsUrl,
                    ref: context.defaultBranch,
                }
                : library.origin

            return {
                ...library,
                origin: inferredOrigin,
                working_tree: context.workingTree,
            }
        })
    )
}

function createWorkflowAction(available: boolean, reason: string | null = null) {
    return { available, reason }
}

function getEffectiveWorkflowPermission(context: GitWorkflowContext): Library['permission'] {
    if (!context.library.origin && context.githubRepo) {
        return 'consumer'
    }

    return context.library.permission
}

export async function getLibraryGitWorkflowSummary(
    libraryId: number,
    runGit: GitCommandRunner = runSystemGit,
    exec: CommandRunner = runCommand
): Promise<LibraryGitWorkflowSummary> {
    const library = db.getAllLibraries().find(item => item.id === libraryId)
    if (!library) {
        throw new Error(`Library not found: ${libraryId}`)
    }

    const context = await resolveGitWorkflowContext(library, runGit)
    const { workingTree } = context

    if (context.gitUnavailable) {
        const reason = workingTree.error || 'Install git to use library workflows.'
        return {
            supported: false,
            headline: 'System git unavailable',
            detail: reason,
            tone: 'warning',
            remote_name: null,
            current_branch: null,
            default_branch: null,
            has_upstream: false,
            actions: {
                fetch: createWorkflowAction(false, reason),
                update: createWorkflowAction(false, reason),
                commit: createWorkflowAction(false, reason),
                push: createWorkflowAction(false, reason),
                pull_request: createWorkflowAction(false, reason),
            },
        }
    }

    if (workingTree.state === 'not_repo') {
        const reason = 'This library has origin metadata, but the stored folder is not a real git working copy. Relink it to the repo-backed folder.'
        return {
            supported: false,
            headline: 'Git working copy required',
            detail: reason,
            tone: 'warning',
            remote_name: null,
            current_branch: null,
            default_branch: null,
            has_upstream: false,
            actions: {
                fetch: createWorkflowAction(false, reason),
                update: createWorkflowAction(false, reason),
                commit: createWorkflowAction(false, reason),
                push: createWorkflowAction(false, reason),
                pull_request: createWorkflowAction(false, reason),
            },
        }
    }

    if (!context.remoteName || !context.remoteUrl) {
        const reason = library.origin
            ? 'No git remote is configured for this working copy.'
            : 'No GitHub origin metadata or git remote is configured for this library.'
        return {
            supported: false,
            headline: 'Remote origin missing',
            detail: reason,
            tone: 'warning',
            remote_name: context.remoteName,
            current_branch: context.currentBranch,
            default_branch: context.defaultBranch,
            has_upstream: context.hasUpstream,
            actions: {
                fetch: createWorkflowAction(false, reason),
                update: createWorkflowAction(false, reason),
                commit: createWorkflowAction(false, reason),
                push: createWorkflowAction(false, reason),
                pull_request: createWorkflowAction(false, reason),
            },
        }
    }

    const effectivePermission = getEffectiveWorkflowPermission(context)
    const branchMissingReason = 'This working copy is on a detached HEAD, so branch-based workflows are blocked.'
    const updateBlockedReason = workingTree.has_changes
        ? 'Commit or discard local changes before pulling remote updates.'
        : !context.hasUpstream
            ? 'This branch does not track an upstream branch yet.'
            : null
    const pushBlockedReason = !context.currentBranch
        ? branchMissingReason
        : effectivePermission === 'consumer'
            ? 'Push stays disabled for consumer access. Use the pull request flow instead.'
            : null

    let pullRequestAction = createWorkflowAction(false, 'Pull request workflows require a GitHub remote origin.')
    if (context.githubRepo) {
        const prReason = !context.currentBranch
            ? branchMissingReason
            : !context.defaultBranch
                ? 'SnipForge could not determine the base branch for this origin.'
                : context.currentBranch === context.defaultBranch
                    ? 'Create or switch to a feature branch before opening a pull request.'
                    : null

        if (!prReason) {
            try {
                await exec('gh', ['--version'])
                pullRequestAction = createWorkflowAction(true)
            } catch {
                pullRequestAction = createWorkflowAction(
                    true,
                    'GitHub CLI is unavailable, so SnipForge will open the compare page in your browser instead.'
                )
            }
        } else {
            pullRequestAction = createWorkflowAction(false, prReason)
        }
    }

    const detail = workingTree.has_changes
        ? 'Local changes are ready to commit from this library workflow.'
        : 'Working copy is clean and ready for fetch, update, push, or PR actions.'

    return {
        supported: true,
        headline: 'Git workflow ready',
        detail,
        tone: workingTree.has_changes ? 'warning' : 'success',
        remote_name: context.remoteName,
        current_branch: context.currentBranch,
        default_branch: context.defaultBranch,
        has_upstream: context.hasUpstream,
        actions: {
            fetch: createWorkflowAction(true),
            update: createWorkflowAction(!updateBlockedReason, updateBlockedReason),
            commit: createWorkflowAction(workingTree.has_changes, workingTree.has_changes ? null : 'No local changes to commit.'),
            push: createWorkflowAction(!pushBlockedReason, pushBlockedReason),
            pull_request: pullRequestAction,
        },
    }
}

function buildCompareUrl(context: GitWorkflowContext): string | null {
    if (!context.githubRepo || !context.currentBranch || !context.defaultBranch) {
        return null
    }

    return `${context.githubRepo.httpsUrl}/compare/${encodeURIComponent(context.defaultBranch)}...${encodeURIComponent(context.currentBranch)}?expand=1`
}

async function getRequiredGitWorkflowContext(
    libraryId: number,
    runGit: GitCommandRunner = runSystemGit
): Promise<GitWorkflowContext> {
    const library = db.getAllLibraries().find(item => item.id === libraryId)
    if (!library) {
        throw new Error(`Library not found: ${libraryId}`)
    }

    return resolveGitWorkflowContext(library, runGit)
}

export async function fetchLibraryOrigin(
    libraryId: number,
    runGit: GitCommandRunner = runSystemGit
): Promise<LibraryWorkflowResult> {
    const context = await getRequiredGitWorkflowContext(libraryId, runGit)

    if (context.gitUnavailable) {
        return { success: false, blocked: true, error: context.workingTree.error || 'System git is unavailable on this machine.' }
    }

    if (!context.library.local_path || !context.remoteName) {
        return { success: false, blocked: true, error: 'This library is not connected to a git remote yet.' }
    }

    try {
        await runGit(['fetch', '--prune', context.remoteName], context.library.local_path)
        return { success: true, message: `Fetched latest refs from ${context.remoteName}.` }
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}

export async function updateLibraryOrigin(
    libraryId: number,
    runGit: GitCommandRunner = runSystemGit
): Promise<LibraryWorkflowResult> {
    const context = await getRequiredGitWorkflowContext(libraryId, runGit)

    if (context.gitUnavailable) {
        return { success: false, blocked: true, error: context.workingTree.error || 'System git is unavailable on this machine.' }
    }

    if (!context.library.local_path || !context.remoteName) {
        return { success: false, blocked: true, error: 'This library is not connected to a git remote yet.' }
    }

    if (context.workingTree.has_changes) {
        return { success: false, blocked: true, error: 'Commit or discard local changes before updating from origin.' }
    }

    if (!context.hasUpstream) {
        return { success: false, blocked: true, error: 'This branch does not track an upstream branch yet.' }
    }

    try {
        await runGit(['pull', '--ff-only'], context.library.local_path)
        const syncResult = await syncLocalLibrary(libraryId, true)
        return {
            success: true,
            message: 'Working copy updated from origin.',
            syncResult,
        }
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}

export async function commitLibraryChanges(
    libraryId: number,
    message: string,
    runGit: GitCommandRunner = runSystemGit
): Promise<LibraryWorkflowResult> {
    const context = await getRequiredGitWorkflowContext(libraryId, runGit)

    if (context.gitUnavailable) {
        return { success: false, blocked: true, error: context.workingTree.error || 'System git is unavailable on this machine.' }
    }

    if (!context.library.local_path) {
        return { success: false, blocked: true, error: 'This library has no local working copy.' }
    }

    if (!context.workingTree.has_changes) {
        return { success: false, blocked: true, error: 'No local changes to commit.' }
    }

    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
        return { success: false, blocked: true, error: 'Commit message is required.' }
    }

    try {
        await runGit(['add', '-A', '--', '.'], context.library.local_path)
        await runGit(['commit', '-m', trimmedMessage], context.library.local_path)
        return { success: true, message: 'Committed local library changes.' }
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}

export async function pushLibraryChanges(
    libraryId: number,
    runGit: GitCommandRunner = runSystemGit
): Promise<LibraryWorkflowResult> {
    const context = await getRequiredGitWorkflowContext(libraryId, runGit)
    const effectivePermission = getEffectiveWorkflowPermission(context)

    if (context.gitUnavailable) {
        return { success: false, blocked: true, error: context.workingTree.error || 'System git is unavailable on this machine.' }
    }

    if (!context.library.local_path || !context.remoteName) {
        return { success: false, blocked: true, error: 'This library is not connected to a git remote yet.' }
    }

    if (effectivePermission === 'consumer') {
        return { success: false, blocked: true, error: 'Push stays disabled for consumer access. Use the pull request flow instead.' }
    }

    if (!context.currentBranch) {
        return { success: false, blocked: true, error: 'Detached HEAD cannot be pushed from this workflow.' }
    }

    try {
        await runGit(['push', '--set-upstream', context.remoteName, context.currentBranch], context.library.local_path)
        return { success: true, message: `Pushed ${context.currentBranch} to ${context.remoteName}.` }
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}

export async function openLibraryPullRequest(
    libraryId: number,
    runGit: GitCommandRunner = runSystemGit,
    exec: CommandRunner = runCommand
): Promise<LibraryWorkflowResult> {
    const context = await getRequiredGitWorkflowContext(libraryId, runGit)

    if (context.gitUnavailable) {
        return { success: false, blocked: true, error: context.workingTree.error || 'System git is unavailable on this machine.' }
    }

    if (!context.library.local_path || !context.currentBranch) {
        return { success: false, blocked: true, error: 'Create or switch to a branch before opening a pull request.' }
    }

    if (!context.githubRepo) {
        return { success: false, blocked: true, error: 'Pull request workflows are only available for GitHub remotes right now.' }
    }

    if (!context.defaultBranch) {
        return { success: false, blocked: true, error: 'SnipForge could not determine the base branch for this origin.' }
    }

    if (context.currentBranch === context.defaultBranch) {
        return { success: false, blocked: true, error: 'Switch to a feature branch before opening a pull request.' }
    }

    const url = buildCompareUrl(context)
    if (!url) {
        return { success: false, blocked: true, error: 'SnipForge could not build a pull request URL for this library.' }
    }

    try {
        await exec('gh', [
            'pr',
            'create',
            '--web',
            '--repo',
            `${context.githubRepo.owner}/${context.githubRepo.repo}`,
            '--base',
            context.defaultBranch,
            '--head',
            context.currentBranch,
        ], context.library.local_path)

        return {
            success: true,
            message: 'Opened pull request flow in GitHub CLI.',
            url,
        }
    } catch {
        return {
            success: true,
            message: 'GitHub CLI is unavailable. Opening the compare page in your browser instead.',
            detail: 'Push the branch first if GitHub does not recognize it yet.',
            url,
        }
    }
}

function toPosixPath(value: string): string {
    return value.split(path.sep).join(path.posix.sep)
}

function normalizeRelativeAttachmentPath(src: string): string | null {
    if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) {
        return null
    }

    const stripped = src.trim().replace(/^\.?\//, '')
    if (!stripped) {
        return null
    }

    const normalized = path.posix.normalize(stripped)
    if (
        normalized === LIBRARY_ATTACHMENTS_DIR ||
        normalized.startsWith(`${LIBRARY_ATTACHMENTS_DIR}/`)
    ) {
        return normalized
    }

    return null
}

function relativeAttachmentPathFromFileUrl(src: string, libraryRoot: string): string | null {
    if (!src.startsWith('file://')) {
        return null
    }

    try {
        const filePath = fileURLToPath(src)
        const relative = path.relative(libraryRoot, filePath)
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            return null
        }

        return normalizeRelativeAttachmentPath(toPosixPath(relative))
    } catch {
        return null
    }
}

function parseImageDataUri(src: string): { mimeType: string; buffer: Buffer } | null {
    const match = src.match(IMAGE_DATA_URI_RE)
    if (!match) {
        return null
    }

    const [, mimeType, payload] = match
    return {
        mimeType: mimeType.toLowerCase(),
        buffer: Buffer.from(payload, 'base64'),
    }
}

function getAttachmentExtension(mimeType: string): string {
    switch (mimeType) {
        case 'image/jpeg':
            return 'jpg'
        case 'image/gif':
            return 'gif'
        case 'image/webp':
            return 'webp'
        case 'image/svg+xml':
            return 'svg'
        default:
            return 'png'
    }
}

async function rewriteImageSources(
    body: string,
    transform: (src: string) => Promise<string> | string
): Promise<string> {
    let rewritten = ''
    let lastIndex = 0

    for (const match of body.matchAll(IMAGE_TAG_RE)) {
        const tag = match[0]
        const index = match.index ?? 0
        const srcMatch = tag.match(IMAGE_SRC_ATTR_RE)

        rewritten += body.slice(lastIndex, index)

        if (!srcMatch) {
            rewritten += tag
            lastIndex = index + tag.length
            continue
        }

        const [, quote, src] = srcMatch
        const nextSrc = await transform(src)
        rewritten += tag.replace(`${quote}${src}${quote}`, `${quote}${nextSrc}${quote}`)
        lastIndex = index + tag.length
    }

    rewritten += body.slice(lastIndex)
    return rewritten
}

async function cleanupCommandAttachments(
    libraryRoot: string,
    commandId: string,
    referencedPaths: Set<string>
): Promise<void> {
    const attachmentsDir = commandAttachmentsFolderPath(libraryRoot, commandId)

    try {
        const entries = await fs.readdir(attachmentsDir, { withFileTypes: true })
        for (const entry of entries) {
            if (!entry.isFile()) {
                continue
            }

            const relativePath = path.posix.join(LIBRARY_ATTACHMENTS_DIR, commandId, entry.name)
            if (!referencedPaths.has(relativePath)) {
                await fs.rm(path.join(attachmentsDir, entry.name), { force: true })
            }
        }

        const remaining = await fs.readdir(attachmentsDir)
        if (remaining.length === 0) {
            await fs.rm(attachmentsDir, { recursive: true, force: true })
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error
        }
    }
}

async function normalizeRichTextBodyForLibraryWrite(
    body: string,
    libraryRoot: string,
    commandId: string
): Promise<string> {
    const referencedPaths = new Set<string>()
    const attachmentsDir = commandAttachmentsFolderPath(libraryRoot, commandId)

    const rewritten = await rewriteImageSources(body, async (src) => {
        const relativeExisting = normalizeRelativeAttachmentPath(src) || relativeAttachmentPathFromFileUrl(src, libraryRoot)
        if (relativeExisting) {
            referencedPaths.add(relativeExisting)
            return relativeExisting
        }

        const imageData = parseImageDataUri(src)
        if (!imageData) {
            return src
        }

        await fs.mkdir(attachmentsDir, { recursive: true })
        const hash = crypto.createHash('sha256').update(imageData.buffer).digest('hex').slice(0, 16)
        const fileName = `image-${hash}.${getAttachmentExtension(imageData.mimeType)}`
        const relativePath = path.posix.join(LIBRARY_ATTACHMENTS_DIR, commandId, fileName)
        await fs.writeFile(path.join(libraryRoot, relativePath), imageData.buffer)
        referencedPaths.add(relativePath)
        return relativePath
    })

    await cleanupCommandAttachments(libraryRoot, commandId, referencedPaths)
    return rewritten
}

function resolveRichTextAttachmentUrls(body: string, libraryRoot: string): string {
    return body.replace(IMAGE_TAG_RE, (tag) => {
        const srcMatch = tag.match(IMAGE_SRC_ATTR_RE)
        if (!srcMatch) {
            return tag
        }

        const [, quote, src] = srcMatch
        const relativePath = normalizeRelativeAttachmentPath(src)
        if (!relativePath) {
            return tag
        }

        const fileUrl = pathToFileURL(path.join(libraryRoot, relativePath)).href
        return tag.replace(`${quote}${src}${quote}`, `${quote}${fileUrl}${quote}`)
    })
}

function deriveLibraryName(folderPath: string): string {
    const folderName = path.basename(folderPath)
        .replace(/[-_]/g, ' ')
        .trim()

    const humanized = folderName.replace(/\b\w/g, c => c.toUpperCase())
    return humanized || 'Local Library'
}

function isInitializedLocalLibrary(library: Library | undefined): library is Library {
    return !!library && library.type === 'local' && !!library.manifest_path
}

function isWritableLocalLibrary(library: Library | undefined): library is Library {
    return isInitializedLocalLibrary(library) && library.permission !== 'consumer'
}

export function getDefaultWritableLocalLibrary(): Library | null {
    const preferredId = settings.get<number | null>('library.defaultWritableLocalLibraryId')
    if (typeof preferredId === 'number') {
        const preferred = db.getAllLibraries().find(l => l.id === preferredId)
        if (isWritableLocalLibrary(preferred)) {
            return preferred
        }
    }

    const fallback = db.getAllLibraries().find(isWritableLocalLibrary)
    if (fallback) {
        settings.set('library.defaultWritableLocalLibraryId', fallback.id)
        return fallback
    }

    return null
}

export function setDefaultWritableLocalLibrary(libraryId: number): void {
    settings.set('library.defaultWritableLocalLibraryId', libraryId)
}

function createCommandId(): string {
    return crypto.randomUUID().toLowerCase()
}

async function writeCommandFile(
    folderPath: string,
    fileName: string,
    command: CommandFormData,
    createdAt: string,
    id: string,
    updatedAt?: string
): Promise<void> {
    const normalizedBody = command.language === 'richtext'
        ? await normalizeRichTextBodyForLibraryWrite(command.body, folderPath, id)
        : command.body
    if (command.language !== 'richtext') {
        await cleanupCommandAttachments(folderPath, id, new Set())
    }
    const fileData = buildLibraryCommandFileData({
        title: command.title,
        body: normalizedBody,
        description: command.description,
        tags: command.tags,
        language: command.language,
        created_at: createdAt,
        updated_at: updatedAt,
    }, id)
    await fs.writeFile(
        path.join(folderPath, fileName),
        serializeLibraryCommandFile(fileData),
        'utf8'
    )
}

async function findUniqueCommandFileName(
    folderPath: string,
    title: string,
    options: { excludeFileName?: string } = {}
): Promise<string> {
    const baseName = slugify(title)
    let counter = 0

    while (true) {
        const fileName = counter === 0 ? `${baseName}.json` : `${baseName}-${counter + 1}.json`
        if (fileName === options.excludeFileName) {
            return fileName
        }

        try {
            await fs.access(path.join(folderPath, fileName))
            counter += 1
        } catch {
            return fileName
        }
    }
}

async function resolveUpdatedCommandFileName(
    folderPath: string,
    currentFileName: string,
    nextTitle: string
): Promise<string> {
    return findUniqueCommandFileName(folderPath, nextTitle, { excludeFileName: currentFileName })
}

async function readLibraryCommandFileMetadata(filePath: string): Promise<{ id: string | null; created_at?: string; updated_at?: string } | null> {
    try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
            id?: string
            created_at?: string
            updated_at?: string
        }

        return {
            id: normalizeCommandId(parsed.id),
            created_at: parsed.created_at,
            updated_at: parsed.updated_at,
        }
    } catch {
        return null
    }
}

function getWorkingCopyRootPath(baseDir: string, libraryRepo: string): string {
    return path.join(baseDir, 'working-copies', 'github', ...libraryRepo.split('/').filter(Boolean))
}

function parseOriginLibraryIdentifier(input: string): { owner: string; repo: string; subpath?: string } {
    const parts = input.split('/').filter(Boolean)
    if (parts.length < 2) {
        throw new Error(`Invalid origin-backed library identifier: ${input}`)
    }

    const owner = parts[0]
    const repo = parts[1]
    const subpath = parts.length > 2 ? parts.slice(2).join('/') : undefined
    return { owner, repo, subpath }
}

async function ensureGitWorkingCopy(
    repoRoot: string,
    cloneSource: string,
    runGit: GitCommandRunner = runSystemGit
): Promise<void> {
    try {
        await fs.access(repoRoot)
        await runGit(['rev-parse', '--is-inside-work-tree'], repoRoot)
        return
    } catch (error) {
        try {
            await fs.access(repoRoot)
        } catch {
            await fs.mkdir(path.dirname(repoRoot), { recursive: true })
            await runGit(['clone', cloneSource, repoRoot], path.dirname(repoRoot))
            return
        }

        if (isGitMissingError(error)) {
            throw new Error('System git is unavailable on this machine.')
        }

        if (isNotRepoError(error)) {
            throw new Error(`Working copy target exists but is not a git repository: ${repoRoot}`)
        }

        throw error
    }
}

function getManifestDirectory(manifestPath: string | null): string {
    if (!manifestPath || !manifestPath.includes('/')) {
        return ''
    }

    return manifestPath.slice(0, manifestPath.lastIndexOf('/'))
}

function toWorkingCopyCommandPath(remotePath: string, manifestPath: string | null): string {
    const manifestDir = getManifestDirectory(manifestPath)
    if (!manifestDir) {
        return remotePath
    }

    const prefix = `${manifestDir}/`
    return remotePath.startsWith(prefix) ? remotePath.slice(prefix.length) : remotePath
}

function resolveLibraryBackedCommand(commandId: number): { command: db.Command & { remote_path: string }; library: Library } | null {
    const command = db.getAllCommands().find(c => c.id === commandId)
    if (!command || command.source !== 'remote' || !command.library_id || !command.remote_path) {
        return null
    }

    const library = db.getAllLibraries().find(l => l.id === command.library_id)
    if (!isInitializedLocalLibrary(library)) {
        return null
    }

    return { command: { ...command, remote_path: command.remote_path }, library }
}

function resolveWritableFileBackedCommand(commandId: number): { command: db.Command & { remote_path: string }; library: Library } | null {
    const target = resolveLibraryBackedCommand(commandId)
    if (!target || !isWritableLocalLibrary(target.library)) {
        return null
    }

    return target
}

async function readFolderManifest(folderPath: string): Promise<ScanResult | null> {
    try {
        return await scanLocalFolder(folderPath)
    } catch (e) {
        const msg = (e as Error).message
        if (!msg.includes('missing .snipforge.json')) throw e
        return null
    }
}

async function findManifests(rootPath: string, maxDepth: number, depth = 0): Promise<string[]> {
    const manifests: string[] = []
    const entries = await fs.readdir(rootPath, { withFileTypes: true })

    for (const entry of entries) {
        const entryPath = path.join(rootPath, entry.name)

        if (entry.isFile() && entry.name === '.snipforge.json') {
            manifests.push(entryPath)
            continue
        }

        if (!entry.isDirectory()) {
            continue
        }

        if (depth >= maxDepth) {
            continue
        }

        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue
        }

        manifests.push(...await findManifests(entryPath, maxDepth, depth + 1))
    }

    return manifests
}

async function buildDiscoveredLocalLibrary(manifestFilePath: string): Promise<DiscoveredLibrary> {
    const libraryRoot = path.dirname(manifestFilePath)
    const scanResult = await scanLocalFolder(libraryRoot)

    return {
        name: scanResult.manifest.name || path.basename(libraryRoot),
        description: scanResult.manifest.description || '',
        path: libraryRoot,
        manifestPath: manifestFilePath,
        commandCount: scanResult.commands.length,
    }
}

async function createManifestIfMissing(folderPath: string): Promise<ScanResult> {
    const existing = await readFolderManifest(folderPath)
    if (existing) return existing

    const manifest: LibraryManifest = {
        snipforge: 'library',
        name: deriveLibraryName(folderPath),
        description: '',
        format_version: '1.0',
    }

    await fs.writeFile(
        path.join(folderPath, '.snipforge.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf8'
    )

    return await scanLocalFolder(folderPath)
}

function toIndexedLocalLibraryCommandData(command: CommandFormData | RemoteCommand, libraryRoot: string) {
    if (command.language !== 'richtext') {
        return toIndexedLibraryCommandData(command)
    }

    return toIndexedLibraryCommandData({
        ...command,
        body: resolveRichTextAttachmentUrls(command.body, libraryRoot),
    })
}

function buildLocalSyncPayload(
    commands: ScanResult['commands'],
    existingBodies: Set<string>,
    libraryRoot: string
) {
    return commands
        .filter(({ command }) => !existingBodies.has(command.body.trim()))
        .map(({ path: filePath, command }) => ({
            remotePath: filePath,
            command: toIndexedLocalLibraryCommandData(command, libraryRoot),
        }))
}

function addLibraryFromScan(
    folderPath: string,
    scanResult: ScanResult | null,
    options: { allowExisting: boolean }
): { library: Library; syncResult: SyncResult } {
    const existing = db.getLibraryByRepo(folderPath)
    if (existing && !options.allowExisting) {
        throw new Error(`Already added: ${path.basename(folderPath)}`)
    }

    if (!scanResult) {
        const folderName = deriveLibraryName(folderPath)
        const libraryId = existing
            ? existing.id
            : db.addLibrary(folderPath, folderName, '', undefined, 'local', 'owner')
        if (existing && !existing.manifest_path) {
            db.updateLibraryManifest(libraryId, folderName, '', '.snipforge.json')
        }
        const library = db.getLibraryByRepo(folderPath)!
        return { library, syncResult: { added: 0, updated: 0, removed: 0, errors: [] } }
    }

    const { manifest, manifestPath, commands } = scanResult
    const libraryId = existing
        ? existing.id
        : db.addLibrary(folderPath, manifest.name, manifest.description || '', manifestPath, 'local', 'owner')

    if (
        existing &&
        (
            !existing.manifest_path ||
            existing.name !== manifest.name ||
            existing.description !== (manifest.description || '') ||
            existing.manifest_path !== manifestPath
        )
    ) {
        db.updateLibraryManifest(libraryId, manifest.name, manifest.description || '', manifestPath)
    }

    const localBodies = db.getLocalCommandBodies()
    const toAdd = buildLocalSyncPayload(commands, localBodies, folderPath)
    const syncResult = db.syncRemoteCommands(
        libraryId,
        computeContentHash(commands),
        toAdd,
        [],
        []
    )
    const library = db.getLibraryByRepo(folderPath)!
    return { library, syncResult }
}

async function indexLocalLibrary(folderPath: string, options: { ensureManifest: boolean; allowExisting: boolean }): Promise<{ library: Library; syncResult: SyncResult }> {
    const stat = await fs.stat(folderPath)
    if (!stat.isDirectory()) throw new Error('Not a directory')

    const scanResult = options.ensureManifest
        ? await createManifestIfMissing(folderPath)
        : await readFolderManifest(folderPath)

    return addLibraryFromScan(folderPath, scanResult, { allowExisting: options.allowExisting })
}

export async function createLocalLibraryCommand(command: CommandFormData): Promise<CommandMutationResult> {
    const library = getDefaultWritableLocalLibrary()
    if (!library) {
        return {
            success: false,
            error: 'Choose a default writable library before creating commands.',
        }
    }

    const fileName = await findUniqueCommandFileName(library.github_repo, command.title)
    const createdAt = new Date().toISOString()
    await writeCommandFile(library.github_repo, fileName, command, createdAt, createCommandId())

    const syncResult = await syncLocalLibrary(library.id, true)
    const updatedLibrary = db.getAllLibraries().find(l => l.id === library.id) || library
    return { success: true, mode: 'library', library: updatedLibrary, syncResult }
}

export async function createLocalLibraryCommands(commands: CommandFormData[]): Promise<BatchCommandMutationResult> {
    if (commands.length === 0) {
        return { success: true, mode: 'library', processed: 0, succeeded: 0, failed: 0, errors: [] }
    }

    const library = getDefaultWritableLocalLibrary()
    if (!library) {
        return {
            success: false,
            processed: commands.length,
            succeeded: 0,
            failed: commands.length,
            errors: ['Choose a default writable library before creating commands.'],
        }
    }

    const errors: string[] = []
    let succeeded = 0

    for (const command of commands) {
        try {
            const fileName = await findUniqueCommandFileName(library.github_repo, command.title)
            const createdAt = new Date().toISOString()
            await writeCommandFile(library.github_repo, fileName, command, createdAt, createCommandId())
            succeeded += 1
        } catch (error) {
            errors.push(`Failed to create "${command.title}": ${(error as Error).message}`)
        }
    }

    const updatedLibrary = db.getAllLibraries().find(l => l.id === library.id) || library
    if (succeeded === 0) {
        return {
            success: false,
            mode: 'library',
            processed: commands.length,
            succeeded: 0,
            failed: commands.length,
            errors,
            libraries: [updatedLibrary],
        }
    }

    const syncResult = await syncLocalLibrary(library.id, true)
    errors.push(...syncResult.errors)

    return {
        success: errors.length === 0,
        mode: 'library',
        processed: commands.length,
        succeeded,
        failed: commands.length - succeeded,
        errors,
        libraries: [db.getAllLibraries().find(l => l.id === library.id) || updatedLibrary],
    }
}

export async function updateLocalLibraryCommand(commandId: number, updates: CommandFormData): Promise<CommandMutationResult> {
    const target = resolveWritableFileBackedCommand(commandId)
    if (!target) {
        const readOnlyTarget = resolveLibraryBackedCommand(commandId)
        if (readOnlyTarget) {
            const library = getDefaultWritableLocalLibrary()
            if (!library) {
                return {
                    success: false,
                    error: 'Choose a default writable library before editing read-only library commands.',
                }
            }

            const fileName = await findUniqueCommandFileName(library.github_repo, updates.title)
            const createdAt = new Date().toISOString()
            await writeCommandFile(library.github_repo, fileName, updates, createdAt, createCommandId())
            const syncResult = await syncLocalLibrary(library.id, true)
            const updatedLibrary = db.getAllLibraries().find(l => l.id === library.id) || library
            return { success: true, mode: 'library', library: updatedLibrary, syncResult }
        }

        const success = db.updateCommand(commandId, {
            title: updates.title,
            body: updates.body,
            description: updates.description,
            tags: updates.tags,
            language: updates.language,
        })
        return { success, mode: 'database' }
    }

    const currentFileName = target.command.remote_path
    const nextFileName = await resolveUpdatedCommandFileName(target.library.github_repo, currentFileName, updates.title)
    const filePath = path.join(target.library.github_repo, currentFileName)
    const existing = await readLibraryCommandFileMetadata(filePath)

    if (!existing) {
        throw new Error('Command file not found')
    }

    if (nextFileName !== currentFileName) {
        await fs.rename(filePath, path.join(target.library.github_repo, nextFileName))
    }

    await writeCommandFile(
        target.library.github_repo,
        nextFileName,
        updates,
        existing.created_at || target.command.created_at,
        existing.id || createCommandId()
    )

    const updatedFile = await fs.readFile(path.join(target.library.github_repo, nextFileName), 'utf8')
        .then(content => JSON.parse(content) as RemoteCommand)
    const indexed = toIndexedLocalLibraryCommandData(updatedFile, target.library.github_repo)
    const updated = db.updateRemoteCommandById(commandId, {
        remote_path: nextFileName,
        title: indexed.title,
        body: indexed.body,
        description: indexed.description,
        tags: indexed.tags,
        language: indexed.language,
        created_at: existing.created_at || target.command.created_at,
        updated_at: indexed.updated_at,
    })

    if (!updated) {
        throw new Error('Failed to update indexed command after file write')
    }

    const syncResult = await syncLocalLibrary(target.library.id, true)
    const updatedLibrary = db.getAllLibraries().find(l => l.id === target.library.id) || target.library
    return { success: true, mode: 'library', library: updatedLibrary, syncResult }
}

export async function deleteLocalLibraryCommand(commandId: number): Promise<CommandMutationResult> {
    const target = resolveWritableFileBackedCommand(commandId)
    if (!target) {
        const readOnlyTarget = resolveLibraryBackedCommand(commandId)
        if (readOnlyTarget) {
            return {
                success: false,
                error: 'Read-only library commands cannot be deleted from the cache. Remove the library or delete the command from a writable working copy instead.',
            }
        }

        const success = db.deleteCommand(commandId)
        return { success, mode: 'database' }
    }

    const filePath = path.join(target.library.github_repo, target.command.remote_path)
    const existing = await readLibraryCommandFileMetadata(filePath)
    await fs.rm(filePath, { force: true })
    if (existing?.id) {
        await cleanupCommandAttachments(target.library.github_repo, existing.id, new Set())
    }
    const syncResult = await syncLocalLibrary(target.library.id, true)
    const updatedLibrary = db.getAllLibraries().find(l => l.id === target.library.id) || target.library
    return { success: true, mode: 'library', library: updatedLibrary, syncResult }
}

export async function deleteLocalLibraryCommands(commandIds: number[]): Promise<BatchCommandMutationResult> {
    if (commandIds.length === 0) {
        return { success: true, mode: 'database', processed: 0, succeeded: 0, failed: 0, errors: [] }
    }

    const errors: string[] = []
    const libraryIds = new Set<number>()
    const fileDeletesByLibrary = new Map<number, string[]>()
    const databaseIds: number[] = []

    for (const commandId of commandIds) {
        const writableTarget = resolveWritableFileBackedCommand(commandId)
        if (writableTarget) {
            libraryIds.add(writableTarget.library.id)
            const deletions = fileDeletesByLibrary.get(writableTarget.library.id) || []
            deletions.push(path.join(writableTarget.library.github_repo, writableTarget.command.remote_path as string))
            fileDeletesByLibrary.set(writableTarget.library.id, deletions)
            continue
        }

        const readOnlyTarget = resolveLibraryBackedCommand(commandId)
        if (readOnlyTarget) {
            errors.push(`Cannot delete read-only library command "${readOnlyTarget.command.title}"`)
            continue
        }

        databaseIds.push(commandId)
    }

    let succeeded = 0

    if (databaseIds.length > 0) {
        const deleted = db.deleteCommandsByIds(databaseIds)
        succeeded += deleted
        if (deleted !== databaseIds.length) {
            errors.push(`Failed to delete ${databaseIds.length - deleted} database-backed command(s)`)
        }
    }

    for (const [libraryId, filePaths] of fileDeletesByLibrary.entries()) {
        for (const filePath of filePaths) {
            try {
                const existing = await readLibraryCommandFileMetadata(filePath)
                await fs.rm(filePath, { force: true })
                if (existing?.id) {
                    await cleanupCommandAttachments(path.dirname(filePath), existing.id, new Set())
                }
                succeeded += 1
            } catch (error) {
                errors.push(`Failed to delete "${path.basename(filePath)}": ${(error as Error).message}`)
            }
        }

        try {
            const syncResult = await syncLocalLibrary(libraryId, true)
            errors.push(...syncResult.errors)
        } catch (error) {
            errors.push(`Failed to sync local library ${libraryId}: ${(error as Error).message}`)
        }
    }

    const libraries = [...libraryIds]
        .map(libraryId => db.getAllLibraries().find(library => library.id === libraryId))
        .filter((library): library is Library => !!library)

    const mode = databaseIds.length > 0 && fileDeletesByLibrary.size > 0
        ? 'mixed'
        : fileDeletesByLibrary.size > 0
            ? 'library'
            : 'database'

    return {
        success: succeeded > 0 && errors.length === 0,
        mode,
        processed: commandIds.length,
        succeeded,
        failed: commandIds.length - succeeded,
        errors,
        libraries,
    }
}

export async function scanLocalFolder(folderPath: string): Promise<ScanResult> {
    // Find .snipforge.json in the folder (non-recursive — must be at root)
    const manifestPath = path.join(folderPath, '.snipforge.json')

    let manifestContent: string
    try {
        manifestContent = await fs.readFile(manifestPath, 'utf8')
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error('Not a SnipForge library — missing .snipforge.json manifest')
        }
        throw new Error(`Cannot read .snipforge.json: ${fileError(error)}`)
    }

    let manifest: LibraryManifest
    try {
        manifest = JSON.parse(manifestContent)
    } catch {
        throw new Error('Invalid .snipforge.json — not valid JSON')
    }

    if (!manifest.name || typeof manifest.name !== 'string') {
        throw new Error('Invalid .snipforge.json — missing "name" field')
    }

    // Scan for JSON files in the same directory (non-recursive, matching GitHub behavior)
    let entries: import('node:fs').Dirent[]
    try {
        entries = await fs.readdir(folderPath, { withFileTypes: true })
    } catch (error) {
        throw new Error(`Cannot list library ${folderPath}: ${fileError(error)}`)
    }
    const jsonFiles = entries.filter(e => e.name.endsWith('.json') && e.name !== '.snipforge.json')

    const commands: ScanResult['commands'] = []
    const errors: string[] = []

    for (const file of jsonFiles) {
        if (!file.isFile() && !file.isSymbolicLink()) {
            errors.push(`${file.name}: not a readable command file`)
            continue
        }
        const filePath = path.join(folderPath, file.name)
        let content: string
        try {
            content = await fs.readFile(filePath, 'utf8')
        } catch (error) {
            errors.push(`${file.name}: cannot read (${fileError(error)})`)
            continue
        }
        let parsed: unknown
        try {
            parsed = JSON.parse(content)
        } catch {
            errors.push(`${file.name}: invalid JSON`)
            continue
        }
        const command = parseLibraryCommandFile(parsed)
        if (!command) {
            errors.push(`${file.name}: invalid command (requires non-empty title and body)`)
            continue
        }
        const raw = parsed as Record<string, unknown>
        commands.push({ path: file.name, command, content, hasUpdatedAt: typeof raw.updated_at === 'string' && !!raw.updated_at.trim() })
    }
    if (errors.length) throw new Error(`Incomplete library scan in ${folderPath}: ${errors.join('; ')}. Repair these files and sync again.`)
    return { manifest, manifestPath: '.snipforge.json', commands }
}

function fileError(error: unknown): string {
    const e = error as NodeJS.ErrnoException
    return e.code || 'I/O error'
}

// ── Sync ─────────────────────────────────────────────────────────

function computeContentHash(commands: ScanResult['commands']): string {
    const hash = crypto.createHash('sha256')
    for (const { path: filePath, content } of [...commands].sort((a, b) => a.path.localeCompare(b.path))) {
        hash.update(filePath).update('\0').update(content).update('\0')
    }
    return hash.digest('hex').slice(0, 12)
}

export async function syncLocalLibrary(libraryId: number, force = false): Promise<SyncResult> {
    const libraries = db.getAllLibraries()
    const library = libraries.find(l => l.id === libraryId)
    if (!library) throw new Error(`Library not found: ${libraryId}`)
    if (library.type !== 'local') throw new Error('Not a local library')

    // Skip uninitialized libraries
    if (!library.manifest_path) {
        return { added: 0, updated: 0, removed: 0, errors: [] }
    }

    const folderPath = library.github_repo

    // Scan the folder; missing and inaccessible folders both leave the index intact.
    let scanResult: ScanResult
    try {
        scanResult = await scanLocalFolder(folderPath)
    } catch (e) {
        return { added: 0, updated: 0, removed: 0, errors: [(e as Error).message] }
    }

    const { commands: remoteCommands } = scanResult
    const sha = computeContentHash(remoteCommands)

    // Get current DB commands for this library
    const localRemote = db.getRemoteCommands(libraryId)
    const localByPath = new Map(localRemote.map(c => [c.remote_path, c]))
    const remotePaths = new Set(remoteCommands.map(c => c.path))

    const toAdd: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; created_at: string; updated_at: string } }> = []
    const toUpdate: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; updated_at: string } }> = []
    const toRemove: string[] = []

    // Body dedup
    const localBodies = db.getLocalCommandBodies()

    for (const { path: filePath, command, hasUpdatedAt } of remoteCommands) {
        const local = localByPath.get(filePath)
        const indexed = toIndexedLocalLibraryCommandData(command, folderPath)
        if (!local) {
            if (localBodies.has(command.body.trim())) continue
            toAdd.push({ remotePath: filePath, command: indexed })
        } else {
            // Generated parser timestamps are not evidence of an edit.
            const updatedAt = hasUpdatedAt ? indexed.updated_at : local.updated_at
            if (indexed.title !== local.title || indexed.body !== local.body ||
                indexed.description !== local.description || indexed.tags !== local.tags ||
                indexed.language !== local.language || updatedAt !== local.updated_at) {
                toUpdate.push({ remotePath: filePath, command: {
                    title: indexed.title, body: indexed.body, description: indexed.description,
                    tags: indexed.tags, language: indexed.language, updated_at: updatedAt,
                } })
            }
        }
    }

    // Commands in DB but no longer on disk → remove
    for (const local of localRemote) {
        if (local.remote_path && !remotePaths.has(local.remote_path)) {
            toRemove.push(local.remote_path)
        }
    }

    return db.syncRemoteCommands(libraryId, sha, toAdd, toUpdate, toRemove)
}

export async function reindexInitializedLocalLibraries(): Promise<Array<{ libraryId: number; result: SyncResult; error?: string }>> {
    const libraries = db.getAllLibraries()
        .filter(library => library.type === 'local' && !!library.manifest_path)

    const results: Array<{ libraryId: number; result: SyncResult; error?: string }> = []

    for (const library of libraries) {
        try {
            const result = await syncLocalLibrary(library.id, true)
            results.push({ libraryId: library.id, result })
        } catch (error) {
            results.push({
                libraryId: library.id,
                result: { added: 0, updated: 0, removed: 0, errors: [(error as Error).message] },
                error: (error as Error).message,
            })
        }
    }

    return results
}

export async function migrateRemoteLibrariesToLocalWorkingCopies(
    baseDir = app.getPath('userData'),
    options: RemoteLibraryMigrationOptions = {}
): Promise<{
    migrated: number
    skipped: number
    errors: string[]
}> {
    const runGit = options.runGit ?? runSystemGit
    const resolveCloneSource = options.resolveCloneSource ?? ((owner: string, repo: string) => `https://github.com/${owner}/${repo}.git`)
    const libraries = db.getAllLibraries()
    const remoteLibraries = libraries.filter(library => library.type === 'github')
    const errors: string[] = []
    let migrated = 0
    let skipped = 0

    for (const library of remoteLibraries) {
        try {
            const { owner, repo, subpath } = parseOriginLibraryIdentifier(library.github_repo)
            const repoRoot = getWorkingCopyRootPath(baseDir, `${owner}/${repo}`)
            await ensureGitWorkingCopy(repoRoot, resolveCloneSource(owner, repo), runGit)

            const targetRoot = subpath ? path.join(repoRoot, subpath) : repoRoot
            const scanResult = await readFolderManifest(targetRoot)
            if (!scanResult && library.manifest_path) {
                throw new Error(`Missing .snipforge.json in ${targetRoot}`)
            }

            db.updateLibraryToLocalWorkingCopy(
                library.id,
                targetRoot,
                library.github_repo,
                library.last_synced_sha,
                scanResult?.manifestPath ?? null
            )

            if (scanResult) {
                db.updateLibraryManifest(
                    library.id,
                    scanResult.manifest.name,
                    scanResult.manifest.description || '',
                    scanResult.manifestPath
                )
            }

            const syncResult = scanResult
                ? await syncLocalLibrary(library.id, true)
                : { added: 0, updated: 0, removed: 0, errors: [] }
            skipped += syncResult.errors.length
            migrated += 1
        } catch (error) {
            errors.push(`Failed to migrate "${library.name}": ${(error as Error).message}`)
        }
    }

    return { migrated, skipped, errors }
}

export async function migrateLegacyDbOnlyCommandsToDefaultLibrary(): Promise<LegacyDbMigrationResult> {
    const legacyCommands = db.getLegacyDbOnlyCommands()
    if (legacyCommands.length === 0) {
        settings.set('library.legacyDbMigrationCompleted', true)
        return { migrated: 0, skipped: 0, library: getDefaultWritableLocalLibrary(), completed: true, errors: [] }
    }

    const library = getDefaultWritableLocalLibrary()
    if (!library) {
        settings.set('library.legacyDbMigrationCompleted', false)
        return { migrated: 0, skipped: 0, library: null, completed: false, errors: ['Choose a default writable library before migrating legacy commands.'] }
    }

    let scanResult: ScanResult
    try {
        scanResult = await scanLocalFolder(library.github_repo)
    } catch {
        settings.set('library.legacyDbMigrationCompleted', false)
        return { migrated: 0, skipped: 0, library, completed: false, errors: ['Default writable library could not be scanned.'] }
    }

    const existingBodies = new Set(scanResult.commands.map(({ command }) => command.body.trim()))

    let migrated = 0
    let skipped = 0

    for (const legacy of legacyCommands) {
        if (existingBodies.has(legacy.body.trim())) {
            skipped += 1
            continue
        }

        const fileName = await findUniqueCommandFileName(library.github_repo, legacy.title)
        await writeCommandFile(
            library.github_repo,
            fileName,
            {
                title: legacy.title,
                body: legacy.body,
                description: legacy.description,
                tags: legacy.tags,
                language: legacy.language,
            },
            legacy.created_at,
            createCommandId(),
            legacy.updated_at
        )
        existingBodies.add(legacy.body.trim())
        migrated += 1
    }

    const deleted = db.deleteCommandsByIds(legacyCommands.map(command => command.id))
    if (deleted !== legacyCommands.length) {
        settings.set('library.legacyDbMigrationCompleted', false)
        throw new Error(`Legacy migration deleted ${deleted} of ${legacyCommands.length} DB-only commands`)
    }

    await syncLocalLibrary(library.id, true)
    settings.set('library.legacyDbMigrationCompleted', true)
    return { migrated, skipped, library, completed: true, errors: [] }
}
// ── Open Local Folder ────────────────────────────────────────────

export async function openLocalFolder(folderPath: string): Promise<{ library: Library; syncResult: SyncResult } | { needsPick: true; libraries: DiscoveredLibrary[] }> {
    // Check folder exists
    try {
        const stat = await fs.stat(folderPath)
        if (!stat.isDirectory()) throw new Error('Not a directory')
    } catch (e) {
        if ((e as Error).message === 'Not a directory') throw e
        throw new Error(`Folder not found: ${folderPath}`)
    }

    const rootScan = await readFolderManifest(folderPath)
    if (rootScan) {
        return addLibraryFromScan(folderPath, rootScan, { allowExisting: false })
    }

    const manifestPaths = (await findManifests(folderPath, 5)).sort()
    if (manifestPaths.length === 0) {
        return addLibraryFromScan(folderPath, null, { allowExisting: false })
    }

    if (manifestPaths.length === 1) {
        const libraryRoot = path.dirname(manifestPaths[0])
        const scanResult = await scanLocalFolder(libraryRoot)
        return addLibraryFromScan(libraryRoot, scanResult, { allowExisting: false })
    }

    const libraries = await Promise.all(manifestPaths.map(buildDiscoveredLocalLibrary))
    libraries.sort((a, b) => a.path.localeCompare(b.path))
    return { needsPick: true, libraries }
}

export async function relinkOriginLibraryToFolder(libraryId: number, folderPath: string): Promise<{ library: Library; syncResult: SyncResult }> {
    const library = db.getAllLibraries().find(item => item.id === libraryId)
    if (!library) {
        throw new Error(`Library not found: ${libraryId}`)
    }

    if (!library.origin) {
        throw new Error('Only origin-backed libraries can be relinked')
    }

    const existing = db.getLibraryByRepo(folderPath)
    if (existing && existing.id !== libraryId) {
        throw new Error(`Already added: ${path.basename(folderPath)}`)
    }

    const scanResult = await scanLocalFolder(folderPath)
    const relinkedLibrary: Library = {
        ...library,
        github_repo: folderPath,
        type: 'local',
        local_path: folderPath,
        manifest_path: scanResult.manifestPath,
        working_copy: {
            local_path: folderPath,
            manifest_path: scanResult.manifestPath,
            materialized: true,
        },
    }
    const context = await resolveGitWorkflowContext(relinkedLibrary)

    if (context.gitUnavailable) {
        throw new Error(context.gitError || 'System git is unavailable on this machine.')
    }

    if (context.workingTree.state === 'not_repo' || context.workingTree.state === 'no_working_copy') {
        throw new Error('Choose a SnipForge library folder that lives inside a real git working tree.')
    }

    if (!context.githubRepo) {
        throw new Error('The selected folder is inside a git repo, but no GitHub origin remote was detected.')
    }

    const expectedOrigin = parseOriginLibraryIdentifier(library.origin.url)
    const actualOrigin = `${context.githubRepo.owner}/${context.githubRepo.repo}`.toLowerCase()
    const expectedRepo = `${expectedOrigin.owner}/${expectedOrigin.repo}`.toLowerCase()
    if (actualOrigin !== expectedRepo) {
        throw new Error(`Selected folder points at ${context.githubRepo.owner}/${context.githubRepo.repo}, expected ${expectedOrigin.owner}/${expectedOrigin.repo}.`)
    }

    db.updateLibraryToLocalWorkingCopy(
        libraryId,
        folderPath,
        library.origin.url,
        library.origin.ref,
        scanResult.manifestPath
    )
    db.updateLibraryManifest(
        libraryId,
        scanResult.manifest.name,
        scanResult.manifest.description || '',
        scanResult.manifestPath
    )

    const syncResult = await syncLocalLibrary(libraryId, true)
    const updated = db.getAllLibraries().find(item => item.id === libraryId)
    if (!updated) {
        throw new Error(`Library not found after relink: ${libraryId}`)
    }

    return { library: updated, syncResult }
}

export async function setupDefaultWritableLocalLibrary(folderPath: string): Promise<{ library: Library; syncResult: SyncResult; legacyMigration: LegacyDbMigrationResult }> {
    const result = await indexLocalLibrary(folderPath, { ensureManifest: true, allowExisting: true })
    setDefaultWritableLocalLibrary(result.library.id)

    let legacyMigration: LegacyDbMigrationResult
    try {
        legacyMigration = await migrateLegacyDbOnlyCommandsToDefaultLibrary()
    } catch (error) {
        legacyMigration = {
            migrated: 0,
            skipped: 0,
            library: result.library,
            completed: false,
            errors: [(error as Error).message],
        }
    }

    const library = db.getAllLibraries().find(item => item.id === result.library.id) || result.library
    return { ...result, library, legacyMigration }
}

// ── Init Local Library ───────────────────────────────────────────

export async function initLocalLibrary(libraryId: number, name: string, description: string): Promise<{ library: Library; syncResult: SyncResult }> {
    const libraries = db.getAllLibraries()
    const library = libraries.find(l => l.id === libraryId)
    if (!library) throw new Error(`Library not found: ${libraryId}`)
    if (library.type !== 'local') throw new Error('Not a local library')
    if (library.manifest_path) throw new Error('This library is already initialized')

    const folderPath = library.github_repo
    const manifestPath = path.join(folderPath, '.snipforge.json')

    // Check manifest doesn't already exist
    try {
        await fs.access(manifestPath)
        throw new Error('.snipforge.json already exists in this folder')
    } catch (e) {
        if ((e as Error).message.includes('already exists')) throw e
        // File doesn't exist — good
    }

    const manifest: LibraryManifest = {
        snipforge: 'library',
        name,
        description: description || '',
        format_version: '1.0',
    }

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

    db.updateLibraryManifest(libraryId, name, description, '.snipforge.json')

    const syncResult = await syncLocalLibrary(libraryId, true)
    const updated = db.getLibraryByRepo(library.github_repo)!
    return { library: updated, syncResult }
}

// ── Export as Library (Zip) ─────────────────────────────────────

export interface ExportLibraryInput {
    name: string
    description: string
    commands: Array<{
        title: string
        body: string
        description: string
        tags: string[]
        language: string
        created_at: string
        updated_at: string
    }>
}

/**
 * Creates a zip file containing a SnipForge library (manifest + command JSONs).
 * Returns the path to the temporary zip file. Caller is responsible for cleanup.
 */
export async function exportAsLibrary(input: ExportLibraryInput): Promise<string> {
    const { name, description, commands } = input
    const folderName = slugify(name) || 'snipforge-library'

    // Create temp directory
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snipforge-export-'))
    const libraryDir = path.join(tmpDir, folderName)
    await fs.mkdir(libraryDir, { recursive: true })

    // Write manifest
    const manifest: LibraryManifest = {
        snipforge: 'library',
        name,
        description: description || '',
        format_version: '1.0',
    }
    await fs.writeFile(
        path.join(libraryDir, '.snipforge.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf8'
    )

    // Write command files — deduplicate slugified filenames
    const usedNames = new Set<string>()
    for (const cmd of commands) {
        let baseName = slugify(cmd.title)
        let fileName = baseName
        let counter = 1
        while (usedNames.has(fileName)) {
            fileName = `${baseName}-${++counter}`
        }
        usedNames.add(fileName)

        const commandData = buildLibraryCommandFileData({
            title: cmd.title,
            body: cmd.body,
            description: cmd.description,
            tags: cmd.tags,
            language: cmd.language,
            created_at: cmd.created_at,
            updated_at: cmd.updated_at,
        }, createCommandId())
        await fs.writeFile(
            path.join(libraryDir, `${fileName}.json`),
            serializeLibraryCommandFile(commandData),
            'utf8'
        )
    }

    // Zip the folder
    const zipPath = path.join(tmpDir, `${folderName}.zip`)
    const zip = new AdmZip()
    zip.addLocalFolder(libraryDir, folderName)
    zip.writeZip(zipPath)

    // Clean up the unzipped folder (keep only the zip)
    await fs.rm(libraryDir, { recursive: true, force: true })

    return zipPath
}

// ── File Watcher ────────────────────────────────────────────────

const watchers = new Map<number, FSWatcher>()
const pendingChanges = new Map<number, Set<string>>()
const debounceTimers = new Map<number, ReturnType<typeof setTimeout>>()

const DEBOUNCE_MS = 2000

let onChangeCallback: ((libraryId: number, result: SyncResult) => void) | null = null

/** Register a callback that fires after a file-watcher sync completes */
export function onFileWatcherSync(cb: (libraryId: number, result: SyncResult) => void): void {
    onChangeCallback = cb
}

/** Debounce allows atomic saves to settle; a full successful scan is required before deletion. */
async function processBatch(libraryId: number): Promise<void> {
    if (!pendingChanges.get(libraryId)?.size) return
    pendingChanges.delete(libraryId)
    const result = await syncLocalLibrary(libraryId, true)
    onChangeCallback?.(libraryId, result)
}

/** Start watching a single local library folder */
function watchLibrary(library: Library): void {
    if (watchers.has(library.id)) return
    if (library.type !== 'local' || !library.manifest_path) return

    const folderPath = library.github_repo

    try {
        const watcher = watch(folderPath, (_eventType, filename) => {
            // Some platforms omit the filename; scan rather than miss a possible deletion.
            if (filename && !filename.endsWith('.json')) return

            // Accumulate changed filenames
            if (!pendingChanges.has(library.id)) {
                pendingChanges.set(library.id, new Set())
            }
            pendingChanges.get(library.id)!.add(filename || '.snipforge.json')

            // Reset debounce timer
            const existing = debounceTimers.get(library.id)
            if (existing) clearTimeout(existing)
            debounceTimers.set(library.id, setTimeout(() => {
                debounceTimers.delete(library.id)
                processBatch(library.id).catch(e => {
                    console.error(`File watcher error for library ${library.name}:`, e)
                    onChangeCallback?.(library.id, { added: 0, updated: 0, removed: 0, errors: [(e as Error).message] })
                })
            }, DEBOUNCE_MS))
        })

        watcher.on('error', (error) => {
            onChangeCallback?.(library.id, { added: 0, updated: 0, removed: 0, errors: [`Cannot watch ${folderPath}: ${fileError(error)}`] })
        })
        watchers.set(library.id, watcher)
        console.log(`File watcher: watching ${library.name} at ${folderPath}`)
    } catch (e) {
        console.error(`File watcher: failed to watch ${library.name}:`, e)
        onChangeCallback?.(library.id, { added: 0, updated: 0, removed: 0, errors: [`Cannot watch ${folderPath}: ${fileError(e)}`] })
    }
}

/** Start file watchers for all initialized local libraries */
export function startFileWatchers(): void {
    stopFileWatchers()
    const libraries = db.getAllLibraries()
    for (const library of libraries) {
        watchLibrary(library)
    }
}

/** Stop all file watchers and clear pending state */
export function stopFileWatchers(): void {
    for (const [id, watcher] of watchers) {
        watcher.close()
    }
    watchers.clear()
    for (const timer of debounceTimers.values()) {
        clearTimeout(timer)
    }
    debounceTimers.clear()
    pendingChanges.clear()
}

/** Refresh watchers — call after adding/removing a local library */
export function refreshFileWatchers(): void {
    const libraries = db.getAllLibraries()
    const localLibraryIds = new Set(
        libraries.filter(l => l.type === 'local' && l.manifest_path).map(l => l.id)
    )

    // Stop watchers for removed libraries
    for (const id of watchers.keys()) {
        if (!localLibraryIds.has(id)) {
            watchers.get(id)?.close()
            watchers.delete(id)
        }
    }

    // Start watchers for new libraries
    for (const library of libraries) {
        if (!watchers.has(library.id)) {
            watchLibrary(library)
        }
    }
}
