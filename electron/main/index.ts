import { app, BrowserWindow, shell, ipcMain, clipboard, dialog, globalShortcut, Tray, Menu, nativeImage, ClipboardItem } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import * as db from './database'
import * as github from './github'
import * as localLibrary from './local-library'
import * as settings from './settings'
import * as updater from './update'

// Enable remote debugging when REMOTE_DEBUG env var is set (e.g. REMOTE_DEBUG=9222)
if (process.env.REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.REMOTE_DEBUG)
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

// Track app quitting state
let isAppQuiting = false

// SECURITY: Track file paths approved via native dialogs
// Only paths chosen by the user through save/open dialogs are allowed for read/write
const approvedFilePaths = new Set<string>()
const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let tray: Tray | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// Global hotkey — loaded from settings, re-registered on change
let currentHotkey: string = ''

function registerHotkey(accelerator: string): boolean {
  // Unregister current hotkey if set
  if (currentHotkey) {
    try { globalShortcut.unregister(currentHotkey) } catch { /* ignore */ }
  }

  try {
    const success = globalShortcut.register(accelerator, () => {
      console.log(`Global hotkey ${accelerator} pressed`)
      toggleWindow()
    })

    if (success) {
      currentHotkey = accelerator
      console.log(`Global hotkey ${accelerator} registered`)
      return true
    } else {
      console.error(`Failed to register hotkey ${accelerator}`)
      // Re-register the old one if the new one failed
      if (currentHotkey && currentHotkey !== accelerator) {
        globalShortcut.register(currentHotkey, () => toggleWindow())
      }
      return false
    }
  } catch (error) {
    console.error('Error registering hotkey:', error)
    if (currentHotkey && currentHotkey !== accelerator) {
      try { globalShortcut.register(currentHotkey, () => toggleWindow()) } catch { /* ignore */ }
    }
    return false
  }
}

// ── Background auto-sync timer ───────────────────────────────────
// Uses chained setTimeout so interval changes take effect on next tick.
let autoSyncTimeout: ReturnType<typeof setTimeout> | null = null

function stopAutoSync(): void {
  if (autoSyncTimeout) {
    clearTimeout(autoSyncTimeout)
    autoSyncTimeout = null
    console.log('Auto-sync stopped')
  }
}

const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

function startAutoSync(): void {
  stopAutoSync()

  const masterEnabled = settings.get<boolean>('library.autoSync')
  if (!masterEnabled) return

  // Check if any library has auto_sync enabled
  const libraries = db.getAllLibraries()
  const hasAny = libraries.some(l => l.auto_sync)
  if (!hasAny) return

  function scheduleNext() {
    autoSyncTimeout = setTimeout(async () => {
      if (!settings.get<boolean>('library.autoSync')) {
        autoSyncTimeout = null
        return
      }

      console.log('Auto-sync: starting...')
      try {
        const allLibraries = db.getAllLibraries()
        const toSync = allLibraries.filter(l => l.auto_sync)
        const results: Array<{ libraryId: number; name: string; result: { added: number; updated: number; removed: number; errors: string[] } }> = []

        for (const library of toSync) {
          try {
            const result = library.type === 'local'
              ? await localLibrary.syncLocalLibrary(library.id)
              : await github.syncLibrary(library.id)
            results.push({ libraryId: library.id, name: library.name, result })
          } catch (e) {
            results.push({
              libraryId: library.id,
              name: library.name,
              result: { added: 0, updated: 0, removed: 0, errors: [(e as Error).message] }
            })
          }
        }

        const timestamp = new Date().toISOString()
        console.log(`Auto-sync: completed ${toSync.length} libraries at ${timestamp}`)

        if (win && !win.isDestroyed()) {
          win.webContents.send('library:autoSyncResult', { timestamp, results })
        }
      } catch (error) {
        console.error('Auto-sync error:', error)
      }

      if (settings.get<boolean>('library.autoSync')) {
        scheduleNext()
      } else {
        autoSyncTimeout = null
      }
    }, AUTO_SYNC_INTERVAL_MS)
  }

  console.log('Auto-sync started: every 6 hours')
  scheduleNext()
}


// Window management functions
async function showWindow() {
  if (!win) return

  if (win.isMinimized()) {
    win.restore()
  }

  // Only center window if it's the first time showing or if it's off-screen
  const currentBounds = win.getBounds()
  const { screen } = require('electron')

  // Check all displays, not just primary (handles disconnected monitors)
  const displays = screen.getAllDisplays()
  const isOnAnyDisplay = displays.some((display: Electron.Display) => {
    const { x, y, width, height } = display.workArea
    return currentBounds.x < x + width &&
           currentBounds.x + currentBounds.width > x &&
           currentBounds.y < y + height &&
           currentBounds.y + currentBounds.height > y
  })

  if (!isOnAnyDisplay) {
    // Center on primary display, preserve size
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
    const windowWidth = currentBounds.width || 800
    const windowHeight = currentBounds.height || 600
    const x = Math.round((screenWidth - windowWidth) / 2)
    const y = Math.round((screenHeight - windowHeight) / 2)
    win.setBounds({ x, y, width: windowWidth, height: windowHeight })
  }

  // Show and focus window
  win.show()
  win.focus()

  // Force window to refresh drag regions (fixes the drag issue)
  setTimeout(() => {
    if (win && !win.isDestroyed()) {
      win.webContents.invalidate()
    }
  }, 50)

  console.log('Window shown and focused')

  // Send message to renderer to reset search and focus input
  win.webContents.send('window-shown')
}


async function toggleWindow() {
  if (!win || win.isDestroyed()) {
    // Recreate window if it was destroyed
    await createWindow()
    return
  }

  // Simple focus/minimize toggle
  if (win.isVisible() && win.isFocused()) {
    // If window is visible and focused, minimize it
    win.minimize()
  } else {
    // Otherwise show and focus it
    await showWindow()
  }
}


async function createWindow() {
  // Initialize database when creating window
  db.initializeDatabase()
  db.seedTestData()
  await localLibrary.migrateRemoteLibrariesToLocalWorkingCopies()
  await localLibrary.migrateLegacyDbOnlyCommandsToDefaultLibrary()
  await localLibrary.reindexInitializedLocalLibraries()

  // Restore window state from settings
  const savedState = settings.get<settings.WindowState | null>('general.windowState')
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    title: 'SnipForge',
    frame: false,
    width: savedState?.width ?? 800,
    height: savedState?.height ?? 600,
    resizable: true,
    show: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    skipTaskbar: false,
    focusable: true,
    transparent: false,
    hasShadow: true,
    backgroundColor: '#181818',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
  }

  // Restore position if we have a saved state, otherwise center
  if (savedState) {
    const { screen } = require('electron')
    const displays = screen.getAllDisplays()
    // Only restore position if it's still on a connected display
    const isOnAnyDisplay = displays.some((display: Electron.Display) => {
      const { x, y, width, height } = display.workArea
      return savedState.x < x + width &&
             savedState.x + savedState.width > x &&
             savedState.y < y + height &&
             savedState.y + savedState.height > y
    })
    if (isOnAnyDisplay) {
      windowOptions.x = savedState.x
      windowOptions.y = savedState.y
    } else {
      windowOptions.center = true
    }
  } else {
    windowOptions.center = true
  }

  win = new BrowserWindow(windowOptions)

  // Restore maximized state after window creation
  if (savedState?.isMaximized) {
    win.maximize()
  }

  // Register global hotkey from settings
  const hotkey = settings.get<string>('general.hotkey')
  registerHotkey(hotkey)

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.once('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Save window state before hiding/closing
  win.on('close', (event) => {
    if (win && !win.isDestroyed()) {
      const bounds = win.getBounds()
      const windowState: settings.WindowState = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: win.isMaximized(),
      }
      settings.set('general.windowState', windowState)
    }

    // Prevent window from closing completely, hide instead (like menu bar apps)
    // But allow closing when the app is actually quitting
    if (!isAppQuiting) {
      event.preventDefault()
      win.hide()
    }
  })


  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

function createTray() {
  // Use the app icon for the tray
  // In production, use resourcesPath; in dev, use APP_ROOT
  let iconPath: string
  if (app.isPackaged) {
    iconPath = path.join(process.resourcesPath, 'app-icon.png')
  } else {
    iconPath = path.join(process.env.APP_ROOT || '', 'app-icon.png')
  }

  // Create tray icon
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    console.error('Failed to load tray icon from:', iconPath)
    return
  }
  const resizedIcon = icon.resize({ width: 16, height: 16 })
  tray = new Tray(resizedIcon)

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show SnipForge',
      click: async () => {
        if (!win || win.isDestroyed()) {
          await createWindow()
        } else {
          showWindow()
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        isAppQuiting = true
        app.quit()
      }
    }
  ])

  // Set tooltip and context menu
  tray.setToolTip('SnipForge')
  tray.setContextMenu(contextMenu)

  // Show window on tray icon click (Windows/Linux)
  tray.on('click', async () => {
    if (!win || win.isDestroyed()) {
      await createWindow()
    } else if (win.isVisible()) {
      win.hide()
    } else {
      showWindow()
    }
  })

  console.log('✅ System tray icon created')
}

// SECURITY: Validate command objects before database operations
function isValidCommandUpdate(obj: unknown): obj is Partial<db.Command> {
  if (typeof obj !== 'object' || obj === null) return false
  const allowed = ['title', 'body', 'description', 'tags', 'language']
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return false
    if (typeof (obj as Record<string, unknown>)[key] !== 'string') return false
  }
  return true
}

function isValidCommandBatch(value: unknown): value is Array<{ title: string; body: string; description: string; tags: string; language: string }> {
  return Array.isArray(value) && value.every(command =>
    isValidCommandUpdate(command) &&
    typeof command.title === 'string' &&
    typeof command.body === 'string' &&
    command.title.trim().length > 0 &&
    command.body.trim().length > 0
  )
}

function isLocallyManagedCommand(command: db.Command, libraries: db.Library[]): boolean {
  if (command.source === 'local' && command.library_id === null && command.remote_path === null) {
    return true
  }

  if (command.source !== 'remote' || !command.library_id) {
    return false
  }

  const library = libraries.find(item => item.id === command.library_id)
  return !!library && library.type === 'local' && library.permission !== 'consumer'
}

// IPC handlers for database operations
ipcMain.handle('db:getAllCommands', async () => {
  try {
    return db.getAllCommands()
  } catch (error) {
    console.error('Error fetching commands from database:', error)
    return [] // Return an empty array on error to avoid breaking the renderer.
  }
})
// IPC handlers for writting to clipboard.
ipcMain.handle('clipboard:writeText', async (_,text:string) => {
  try{
    await clipboard.writeText(text)
    console.log('clipboard text written successfully')
  } catch (error) {
    console.error('Error writing to clipboard:', error)
    throw error
    }
})

// IPC handler for writing both text and HTML to clipboard
ipcMain.handle('clipboard:write', async (_, data: { text: string, html?: string }) => {
  try {
    if (data.html) {
      // Write both formats
      await clipboard.write([
        new ClipboardItem({
          'text/plain': data.text,
          'text/html': data.html
        })
      ])
      console.log('clipboard written with both text and HTML')
    } else {
      // Just write text
      await clipboard.writeText(data.text)
      console.log('clipboard text written successfully')
    }
  } catch (error) {
    console.error('Error writing to clipboard:', error)
    throw error
  }
})

// IPC handlers for reading from clipboard.
ipcMain.handle('clipboard:readText', async () => {
  try{
    const text = await clipboard.readText()
    console.log('clipboard text read successfully')
    return text
  } catch (error) {
    console.error('Error reading text:', error)
    throw error
  }
})

// IPC handlers for file operations (export/import)
ipcMain.handle('file:saveDialog', async (_, defaultFilename: string) => {
  if (!win) return { success: false, filePath: null }

  try {
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Commands',
      defaultPath: defaultFilename,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    const filePath = result.filePath || null
    if (filePath) approvedFilePaths.add(filePath)
    return { success: !result.canceled, filePath }
  } catch (error) {
    console.error('Error showing save dialog:', error)
    return { success: false, filePath: null }
  }
})

ipcMain.handle('file:openDialog', async () => {
  if (!win) return { success: false, filePath: null }

  try {
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Commands',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    const filePath = result.filePaths[0] || null
    if (filePath) approvedFilePaths.add(filePath)
    return { success: !result.canceled, filePath }
  } catch (error) {
    console.error('Error showing open dialog:', error)
    return { success: false, filePath: null }
  }
})

// IPC handlers for file read/write operations
// SECURITY: Only allow paths that were approved via native dialog
ipcMain.handle('file:writeFile', async (_, filePath: string, content: string) => {
  if (!approvedFilePaths.has(filePath)) {
    console.error('SECURITY: Blocked write to unapproved path:', filePath)
    return { success: false, error: 'File path not approved via dialog' }
  }
  try {
    await fs.writeFile(filePath, content, 'utf8')
    approvedFilePaths.delete(filePath) // Single-use approval
    console.log('File written successfully:', filePath)
    return { success: true }
  } catch (error) {
    console.error('Error writing file:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('file:readFile', async (_, filePath: string) => {
  if (!approvedFilePaths.has(filePath)) {
    console.error('SECURITY: Blocked read from unapproved path:', filePath)
    return { success: false, error: 'File path not approved via dialog' }
  }
  try {
    const content = await fs.readFile(filePath, 'utf8')
    approvedFilePaths.delete(filePath) // Single-use approval
    console.log('File read successfully:', filePath)
    return { success: true, content }
  } catch (error) {
    console.error('Error reading file:', error)
    return { success: false, error: error.message }
  }
})
ipcMain.handle('dialog:showInputDialog', async (_,title: string, label: string,defaultValue: string = '') =>
  {
  if (!win) return {success: false, value: null}
  try {
    // Create a modal window for input
    const result = await dialog.showMessageBox(win, {
      type: 'question',
      title: title,
      message: label,
      detail: `Current value: ${defaultValue}`,
      buttons: ['OK', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (result.response === 0) {
      // User clicked OK
      return { success: true, value: defaultValue}
    } else {
      // User clicked Cancel
      return { success: false, value: null }
    }
  }catch (error) {
    console.error('Error showing input dialog:', error)
    return { success: false, value: null }
  }
})

// IPC handler for opening external URLs in system browser
// SECURITY: Only allow https: URLs to prevent arbitrary protocol execution
ipcMain.handle('shell:openExternal', async (_, url: string) => {
  if (typeof url !== 'string' || !url.startsWith('https:')) {
    console.error('SECURITY: Blocked non-https URL:', url)
    throw new Error('Only HTTPS URLs are allowed')
  }
  try {
    await shell.openExternal(url)
    console.log('Opened external URL:', url)
  } catch (error) {
    console.error('Error opening external URL:', error)
    throw error
  }
})

// ── GitHub Auth IPC handlers ──────────────────────────────────────
ipcMain.handle('auth:login', async () => {
  try {
    const flow = await github.startDeviceFlow()
    return {
      success: true,
      user_code: flow.user_code,
      verification_uri: flow.verification_uri,
      device_code: flow.device_code,
      interval: flow.interval,
      expires_in: flow.expires_in,
    }
  } catch (error) {
    console.error('Auth login error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('auth:pollLogin', async (_, deviceCode: string) => {
  try {
    const result = await github.pollDeviceFlow(deviceCode)
    return result
  } catch (error) {
    console.error('Auth poll error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('auth:logout', async () => {
  github.logout()
  return { success: true }
})

ipcMain.handle('auth:getStatus', async () => {
  try {
    return await github.getAuthStatus()
  } catch (error) {
    console.error('Auth status error:', error)
    return { authenticated: false, user: null }
  }
})

// ── Library IPC handlers ─────────────────────────────────────────

async function handleAddWorkingCopyFromOrigin(repoUrl: string, subpath?: string) {
  return github.addWorkingCopyFromOrigin(repoUrl, subpath)
}

ipcMain.handle('library:addWorkingCopyFromOrigin', async (_, repoUrl: string, subpath?: string) => {
  if (typeof repoUrl !== 'string' || !repoUrl.trim()) {
    return { success: false, error: 'Invalid repository URL' }
  }
  try {
    const result = await handleAddWorkingCopyFromOrigin(repoUrl, subpath || undefined)
    if ('needsPick' in result) {
      return { success: false, needsPick: true, libraries: result.libraries }
    }
    return { success: true, library: result.library, syncResult: result.syncResult }
  } catch (error) {
    console.error('Library addWorkingCopyFromOrigin error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:subscribe', async (_, repoUrl: string, subpath?: string) => {
  if (typeof repoUrl !== 'string' || !repoUrl.trim()) {
    return { success: false, error: 'Invalid repository URL' }
  }
  try {
    const result = await handleAddWorkingCopyFromOrigin(repoUrl, subpath || undefined)
    if ('needsPick' in result) {
      return { success: false, needsPick: true, libraries: result.libraries }
    }
    return { success: true, library: result.library, syncResult: result.syncResult }
  } catch (error) {
    console.error('Library subscribe error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:unsubscribe', async (_, libraryId: number) => {
  if (typeof libraryId !== 'number') {
    return { success: false, error: 'Invalid library ID' }
  }
  try {
    github.unsubscribeFromLibrary(libraryId)
    localLibrary.refreshFileWatchers()
    return { success: true }
  } catch (error) {
    console.error('Library unsubscribe error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:setAutoSync', async (_, libraryId: number, enabled: boolean) => {
  if (typeof libraryId !== 'number' || typeof enabled !== 'boolean') {
    return { success: false, error: 'Invalid parameters' }
  }
  try {
    db.setLibraryAutoSync(libraryId, enabled)
    startAutoSync() // Restart timer to pick up changes
    return { success: true }
  } catch (error) {
    console.error('Library setAutoSync error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:sync', async (_, libraryId: number) => {
  if (typeof libraryId !== 'number') {
    return { success: false, error: 'Invalid library ID' }
  }
  try {
    // Dispatch by library type
    const libraries = db.getAllLibraries()
    const library = libraries.find(l => l.id === libraryId)
    if (!library) return { success: false, error: 'Library not found' }

    const result = library.type === 'local'
      ? await localLibrary.syncLocalLibrary(libraryId, true)
      : await github.syncLibrary(libraryId, true)
    return { success: true, ...result }
  } catch (error) {
    console.error('Library sync error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:syncAll', async () => {
  try {
    const allLibraries = db.getAllLibraries()
    const results: Array<{ library: typeof allLibraries[0]; result: { added: number; updated: number; removed: number; errors: string[] } }> = []

    for (const library of allLibraries) {
      try {
        const result = library.type === 'local'
          ? await localLibrary.syncLocalLibrary(library.id)
          : await github.syncLibrary(library.id)
        const updated = db.getLibraryByRepo(library.github_repo)
        results.push({ library: updated || library, result })
      } catch (e) {
        results.push({
          library,
          result: { added: 0, updated: 0, removed: 0, errors: [(e as Error).message] }
        })
      }
    }

    return { success: true, results }
  } catch (error) {
    console.error('Library syncAll error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:getAll', async () => {
  try {
    return await localLibrary.getAllLibrariesWithWorkingTreeStatus()
  } catch (error) {
    console.error('Library getAll error:', error)
    return []
  }
})

ipcMain.handle('library:getWorkflowSummary', async (_, libraryId: number) => {
  if (typeof libraryId !== 'number') {
    return { success: false, error: 'Invalid library ID' }
  }

  try {
    const summary = await localLibrary.getLibraryGitWorkflowSummary(libraryId)
    return { success: true, summary }
  } catch (error) {
    console.error('Library workflow summary error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:fetchOrigin', async (_, libraryId: number) => {
  if (typeof libraryId !== 'number') {
    return { success: false, error: 'Invalid library ID' }
  }

  try {
    return await localLibrary.fetchLibraryOrigin(libraryId)
  } catch (error) {
    console.error('Library fetch origin error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:updateFromOrigin', async (_, libraryId: number) => {
  if (typeof libraryId !== 'number') {
    return { success: false, error: 'Invalid library ID' }
  }

  try {
    const result = await localLibrary.updateLibraryOrigin(libraryId)
    if (result.success && result.syncResult) {
      win?.webContents.send('commands:changed')
    }
    return result
  } catch (error) {
    console.error('Library update origin error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:relinkWorkingCopy', async (_, libraryId: number) => {
  if (typeof libraryId !== 'number') {
    return { success: false, error: 'Invalid library ID' }
  }

  if (!win) return { success: false, error: 'No window' }

  try {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose Git-Backed Library Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, cancelled: true, error: 'cancelled' }
    }

    const relinked = await localLibrary.relinkOriginLibraryToFolder(libraryId, result.filePaths[0])
    localLibrary.refreshFileWatchers()
    win.webContents.send('commands:changed')
    return { success: true, library: relinked.library, syncResult: relinked.syncResult }
  } catch (error) {
    console.error('Library relink working copy error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:commitChanges', async (_, libraryId: number, message: string) => {
  if (typeof libraryId !== 'number' || typeof message !== 'string') {
    return { success: false, error: 'Invalid parameters' }
  }

  try {
    return await localLibrary.commitLibraryChanges(libraryId, message)
  } catch (error) {
    console.error('Library commit error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:pushChanges', async (_, libraryId: number) => {
  if (typeof libraryId !== 'number') {
    return { success: false, error: 'Invalid library ID' }
  }

  try {
    return await localLibrary.pushLibraryChanges(libraryId)
  } catch (error) {
    console.error('Library push error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:openPullRequest', async (_, libraryId: number) => {
  if (typeof libraryId !== 'number') {
    return { success: false, error: 'Invalid library ID' }
  }

  try {
    return await localLibrary.openLibraryPullRequest(libraryId)
  } catch (error) {
    console.error('Library pull request error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:init', async (_, libraryId: number, name: string, description: string, subpath?: string) => {
  if (typeof libraryId !== 'number' || typeof name !== 'string' || !name.trim()) {
    return { success: false, error: 'Invalid parameters' }
  }
  try {
    // Dispatch by library type
    const libraries = db.getAllLibraries()
    const lib = libraries.find(l => l.id === libraryId)
    if (!lib) return { success: false, error: 'Library not found' }

    const { library, syncResult } = lib.type === 'local'
      ? await localLibrary.initLocalLibrary(libraryId, name.trim(), (description || '').trim())
      : await github.initLibrary(libraryId, name.trim(), (description || '').trim(), subpath)
    localLibrary.refreshFileWatchers()
    return { success: true, library, syncResult }
  } catch (error) {
    console.error('Library init error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:getRepoFolders', async (_, repoUrl: string) => {
  if (typeof repoUrl !== 'string' || !repoUrl.trim()) {
    return { success: false, error: 'Invalid repository URL', folders: [] }
  }
  try {
    const folders = await github.getRepoFolders(repoUrl)
    return { success: true, folders }
  } catch (error) {
    console.error('Library getRepoFolders error:', error)
    return { success: false, error: (error as Error).message, folders: [] }
  }
})

ipcMain.handle('library:openLocal', async (_, requestedFolderPath?: string) => {
  if (!win) return { success: false, error: 'No window' }
  try {
    let folderPath = requestedFolderPath

    if (!folderPath) {
      const result = await dialog.showOpenDialog(win, {
        title: 'Open Library Folder',
        properties: ['openDirectory'],
      })
      if (result.canceled || !result.filePaths[0]) {
        return { success: false, error: 'cancelled' }
      }
      folderPath = result.filePaths[0]
    }

    const result = await localLibrary.openLocalFolder(folderPath)
    if ('needsPick' in result) {
      return { success: false, needsPick: true, libraries: result.libraries }
    }

    const { library, syncResult } = result
    localLibrary.refreshFileWatchers()
    return { success: true, library, syncResult }
  } catch (error) {
    console.error('Library openLocal error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:getDefaultWritableLocalLibrary', async () => {
  try {
    const library = localLibrary.getDefaultWritableLocalLibrary()
    return { success: true, library }
  } catch (error) {
    console.error('Library default lookup error:', error)
    return { success: false, library: null, error: (error as Error).message }
  }
})

ipcMain.handle('library:setupDefaultWritableLocalLibrary', async () => {
  if (!win) return { success: false, error: 'No window' }
  try {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose Default Library Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, cancelled: true, error: 'cancelled' }
    }

    const folderPath = result.filePaths[0]
    const setup = await localLibrary.setupDefaultWritableLocalLibrary(folderPath)
    localLibrary.refreshFileWatchers()
    return { success: true, library: setup.library, syncResult: setup.syncResult, legacyMigration: setup.legacyMigration }
  } catch (error) {
    console.error('Library setupDefaultWritableLocalLibrary error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:createCommand', async (_, command: { title: string; body: string; description: string; tags: string; language: string }) => {
  if (
    !isValidCommandUpdate(command) ||
    typeof command.title !== 'string' ||
    typeof command.body !== 'string' ||
    !command.title.trim() ||
    !command.body.trim()
  ) {
    return { success: false, error: 'Invalid command data' }
  }
  try {
    return await localLibrary.createLocalLibraryCommand(command)
  } catch (error) {
    console.error('Library createCommand error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:createCommands', async (_, commands: Array<{ title: string; body: string; description: string; tags: string; language: string }>) => {
  if (!isValidCommandBatch(commands)) {
    return { success: false, processed: 0, succeeded: 0, failed: 0, errors: ['Invalid command data'] }
  }
  try {
    return await localLibrary.createLocalLibraryCommands(commands)
  } catch (error) {
    console.error('Library createCommands error:', error)
    return { success: false, processed: commands.length, succeeded: 0, failed: commands.length, errors: [(error as Error).message] }
  }
})

ipcMain.handle('library:updateCommand', async (_, id: number, updates: { title: string; body: string; description: string; tags: string; language: string }) => {
  if (
    typeof id !== 'number' ||
    !isValidCommandUpdate(updates) ||
    !updates.title.trim() ||
    !updates.body.trim()
  ) {
    return { success: false, error: 'Invalid parameters' }
  }
  try {
    return await localLibrary.updateLocalLibraryCommand(id, updates)
  } catch (error) {
    console.error('Library updateCommand error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:deleteCommand', async (_, id: number) => {
  if (typeof id !== 'number') {
    return { success: false, error: 'Invalid ID' }
  }
  try {
    return await localLibrary.deleteLocalLibraryCommand(id)
  } catch (error) {
    console.error('Library deleteCommand error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('library:deleteCommands', async (_, ids: number[]) => {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'number')) {
    return { success: false, processed: 0, succeeded: 0, failed: 0, errors: ['Invalid command IDs'] }
  }
  try {
    return await localLibrary.deleteLocalLibraryCommands(ids)
  } catch (error) {
    console.error('Library deleteCommands error:', error)
    return { success: false, processed: ids.length, succeeded: 0, failed: ids.length, errors: [(error as Error).message] }
  }
})

ipcMain.handle('library:exportZip', async (_, commandIds: number[], name: string, description: string) => {
  if (!win) return { success: false, error: 'No window' }
  try {
    // Fetch commands from DB
    const allCommands = db.getAllCommands()
    const libraries = db.getAllLibraries()
    const selected = commandIds.length > 0
      ? allCommands.filter(cmd => commandIds.includes(cmd.id))
      : allCommands.filter(cmd => isLocallyManagedCommand(cmd, libraries))

    if (selected.length === 0) {
      return { success: false, error: 'No commands to export' }
    }

    // Prepare command data
    const commands = selected.map(cmd => ({
      title: cmd.title,
      body: cmd.body,
      description: cmd.description || '',
      tags: (() => { try { return JSON.parse(cmd.tags) } catch { return [] } })(),
      language: cmd.language || 'plaintext',
      created_at: cmd.created_at,
      updated_at: cmd.updated_at,
    }))

    // Generate zip
    const zipPath = await localLibrary.exportAsLibrary({ name, description, commands })

    // Show save dialog
    const slugName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'snipforge-library'
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Library',
      defaultPath: `${slugName}.zip`,
      filters: [
        { name: 'ZIP Archive', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      // Clean up temp zip
      await fs.rm(path.dirname(zipPath), { recursive: true, force: true })
      return { success: false, error: 'cancelled' }
    }

    // Copy zip to chosen location
    await fs.copyFile(zipPath, result.filePath)

    // Clean up temp directory
    await fs.rm(path.dirname(zipPath), { recursive: true, force: true })

    return { success: true, path: result.filePath, commandCount: selected.length }
  } catch (error) {
    console.error('Library export error:', error)
    return { success: false, error: (error as Error).message }
  }
})

// ── Settings IPC handlers ─────────────────────────────────────────
ipcMain.handle('settings:get', async (_, key: string) => {
  if (typeof key !== 'string') return null
  return settings.get(key)
})

ipcMain.handle('settings:set', async (_, key: string, value: unknown) => {
  if (typeof key !== 'string') {
    return { success: false, error: 'Invalid key' }
  }
  try {
    // Side effects for specific settings
    if (key === 'general.hotkey' && typeof value === 'string') {
      const previous = settings.get<string>('general.hotkey')
      const success = registerHotkey(value)
      if (!success) {
        return { success: false, error: `Could not register hotkey "${value}". Kept "${previous}".` }
      }
    }

    settings.set(key, value)

    // Restart auto-sync timer when master toggle changes
    if (key === 'library.autoSync') {
      startAutoSync()
    }

    // Restart/stop update checker when toggle changes
    if (key === 'update.autoCheck') {
      if (value) {
        updater.startUpdateChecker()
      } else {
        updater.stopUpdateChecker()
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error setting:', key, error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('settings:getAll', async () => {
  return settings.getAll()
})

// ── Update IPC handlers ───────────────────────────────────────────
ipcMain.handle('update:getStatus', async () => {
  return updater.getStatus()
})

ipcMain.handle('update:check', async () => {
  const status = await updater.checkForUpdate()
  return { ...status, showBanner: updater.shouldShowBanner() }
})

ipcMain.handle('update:dismiss', async () => {
  updater.dismissVersion()
  return { success: true }
})

ipcMain.handle('update:remindLater', async () => {
  updater.remindLater()
  return { success: true }
})

// IPC handlers for window controls
ipcMain.handle('window:minimize', () => {
  if (win) {
    win.minimize()
  }
})

ipcMain.handle('window:maximize', () => {
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  }
})

ipcMain.handle('window:close', () => {
  if (win) {
    win.close()
  }
})

ipcMain.handle('window:isMaximized', () => {
  return win ? win.isMaximized() : false
})

ipcMain.handle('window:getPlatform', () => {
  return process.platform
})
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

app.whenReady().then(async () => {
  try {
    await createWindow()
    createTray()
    startAutoSync() // Start if library.autoSync is enabled
    localLibrary.startFileWatchers()
    localLibrary.onFileWatcherSync((_libraryId, result) => {
      if ((result.added || result.updated || result.removed) && win && !win.isDestroyed()) {
        win.webContents.send('commands:changed')
      }
    })
    updater.setWindow(win)
    updater.startUpdateChecker()
  } catch (error) {
    console.error('App startup failed:', error)
    dialog.showErrorBox(
      'SnipForge Failed To Start',
      (error as Error).message || 'Unknown startup error'
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  win = null
  // Don't quit the app - it stays in the tray
  // User can quit from tray context menu
})

app.on('will-quit', () => {
  localLibrary.stopFileWatchers()
  stopAutoSync()
  updater.stopUpdateChecker()
  globalShortcut.unregisterAll()
  db.closeDatabase()
  if (tray) {
    tray.destroy()
    tray = null
  }
  console.log('Cleanup complete: auto-sync, update-checker, shortcuts, database, tray')
})

app.on('before-quit', () => {
  // Set flag to allow window closing during quit
  isAppQuiting = true
})

app.on('second-instance', () => {
  if (win) {
    // Show the window if user tried to open another instance
    if (!win.isVisible()) {
      showWindow()
    }
    // Focus the window when user opens another instance
  }
})

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked and no windows are open
  if (!win || win.isDestroyed()) {
    createWindow()
  } else if (!win.isVisible()) {
    showWindow()
  }
  // Standard window behavior for desktop app
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: false,  // SECURITY: Disable Node.js in renderer
      contextIsolation: true,  // SECURITY: Enable context isolation to prevent XSS → RCE
      // sandbox: true,        // Disabled: breaks window.prompt() used by RichTextEditor
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})
