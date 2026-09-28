import { afterEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()
const invoke = vi.fn()

vi.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld,
    },
    ipcRenderer: {
        on,
        removeListener,
        invoke,
    },
}))

afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
})

describe('preload event subscriptions', () => {
    it('returns a cleanup function for window-shown subscriptions', async () => {
        await import('../electron/preload/index')

        const exposedApi = exposeInMainWorld.mock.calls[0]?.[1]
        expect(exposedApi).toBeTruthy()

        const callback = vi.fn()
        const cleanup = exposedApi.onWindowShown(callback)

        expect(on).toHaveBeenCalledWith('window-shown', expect.any(Function))
        expect(typeof cleanup).toBe('function')

        cleanup()

        const listener = on.mock.calls[0]?.[1]
        expect(removeListener).toHaveBeenCalledWith('window-shown', listener)
    })

    it('exposes the active library workflow API alongside the legacy subscribe alias', async () => {
        await import('../electron/preload/index')

        const exposedApi = exposeInMainWorld.mock.calls[0]?.[1]
        expect(exposedApi).toBeTruthy()

        await exposedApi.library.addWorkingCopyFromOrigin('https://github.com/org/repo', 'sub/path')
        await exposedApi.library.subscribe('https://github.com/org/repo', 'sub/path')
        await exposedApi.library.getWorkflowSummary(42)
        await exposedApi.library.fetchOrigin(42)
        await exposedApi.library.updateFromOrigin(42)
        await exposedApi.library.relinkWorkingCopy(42)
        await exposedApi.library.commitChanges(42, 'Save local edits')
        await exposedApi.library.pushChanges(42)
        await exposedApi.library.openPullRequest(42)
        await exposedApi.library.exportZip([1, 2], 'My Library', 'Exported commands')

        expect(invoke).toHaveBeenCalledWith('library:addWorkingCopyFromOrigin', 'https://github.com/org/repo', 'sub/path')
        expect(invoke).toHaveBeenCalledWith('library:subscribe', 'https://github.com/org/repo', 'sub/path')
        expect(invoke).toHaveBeenCalledWith('library:getWorkflowSummary', 42)
        expect(invoke).toHaveBeenCalledWith('library:fetchOrigin', 42)
        expect(invoke).toHaveBeenCalledWith('library:updateFromOrigin', 42)
        expect(invoke).toHaveBeenCalledWith('library:relinkWorkingCopy', 42)
        expect(invoke).toHaveBeenCalledWith('library:commitChanges', 42, 'Save local edits')
        expect(invoke).toHaveBeenCalledWith('library:pushChanges', 42)
        expect(invoke).toHaveBeenCalledWith('library:openPullRequest', 42)
        expect(invoke).toHaveBeenCalledWith('library:exportZip', [1, 2], 'My Library', 'Exported commands')
    })

    it('routes settings, updates, external links and library picker through named methods only', async () => {
        await import('../electron/preload/index')
        const api = exposeInMainWorld.mock.calls[0]?.[1]
        expect(exposeInMainWorld).toHaveBeenCalledWith('electronAPI', api)
        expect(api.ipcRenderer).toBeUndefined()
        expect(api.invoke).toBeUndefined()

        await api.settings.getAll()
        await api.settings.set('theme', 'dark')
        await api.update.getStatus()
        await api.update.check()
        await api.update.dismiss()
        await api.update.remindLater()
        await api.shell.openExternal('https://snipforge.dev')
        await api.library.openLocal('path/to/library')
        await api.library.subscribe('org/repo', 'subpath')
        await api.library.setupDefaultWritableLocalLibrary()
        await api.window.minimize()
        expect(invoke.mock.calls).toEqual([
            ['settings:getAll'], ['settings:set', 'theme', 'dark'],
            ['update:getStatus'], ['update:check'], ['update:dismiss'], ['update:remindLater'],
            ['shell:openExternal', 'https://snipforge.dev'],
            ['library:openLocal', 'path/to/library'], ['library:subscribe', 'org/repo', 'subpath'],
            ['library:setupDefaultWritableLocalLibrary'], ['window:minimize'],
        ])
    })

    it('unsubscribes only its own update and library listeners', async () => {
        await import('../electron/preload/index')
        const api = exposeInMainWorld.mock.calls[0]?.[1]
        const update = vi.fn()
        const sync = vi.fn()
        const stopUpdate = api.update.onStatusChanged(update)
        const stopSync = api.library.onAutoSyncResult(sync)
        const updateListener = on.mock.calls[0][1]
        const syncListener = on.mock.calls[1][1]
        const payload = { showBanner: true }
        updateListener({}, payload)
        syncListener({}, { results: [] })
        expect(update).toHaveBeenCalledWith(payload)
        expect(sync).toHaveBeenCalledWith({ results: [] })
        stopUpdate()
        stopSync()
        expect(removeListener.mock.calls).toEqual([
            ['update:statusChanged', updateListener],
            ['library:autoSyncResult', syncListener],
        ])
    })

    it('does not expose removed command-level remote publish APIs', async () => {
        await import('../electron/preload/index')

        const exposedApi = exposeInMainWorld.mock.calls[0]?.[1]
        expect(exposedApi).toBeTruthy()

        expect(exposedApi.library.bulkPublish).toBeUndefined()
        expect(exposedApi.library.onBulkPublishProgress).toBeUndefined()
        expect(exposedApi.library.browse).toBeUndefined()
    })
})
