import { app, BrowserWindow, shell, ipcMain, clipboard, dialog, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import * as db from './database'

// Track app quitting state
let isAppQuiting = false
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

// Global hotkey configuration
const HOTKEY = process.platform === 'darwin' ? 'Command+Shift+Space' : 'Control+Shift+Space'


// Window management functions
async function showWindow() {
  if (!win) return

  if (win.isMinimized()) {
    win.restore()
  }

  // Only center window if it's the first time showing or if it's off-screen
  const currentBounds = win.getBounds()
  const { screen } = require('electron')
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  // Check if window is completely off-screen
  const isOffScreen = currentBounds.x < 0 ||
                     currentBounds.y < 0 ||
                     currentBounds.x > screenWidth ||
                     currentBounds.y > screenHeight

  if (isOffScreen) {
    // Only center if off-screen, preserve size
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
  win = new BrowserWindow({
    title: 'SnipForge',
    frame: false,
    width: 800,
    height: 600,
    resizable: true,
    center: true,
    show: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    skipTaskbar: false, // Show in taskbar for normal app behavior
    focusable: true,
    transparent: false,
    hasShadow: true,
    backgroundColor: '#181818', // Match app background
    titleBarStyle: 'hiddenInset', // macOS style with native traffic lights
    vibrancy: 'sidebar',
    webPreferences: {
      preload,
      nodeIntegration: false, // SECURITY: Disable Node.js in renderer
      contextIsolation: true,  // SECURITY: Enable context isolation to prevent XSS → RCE
      // sandbox: true,        // Disabled: breaks window.prompt() used by RichTextEditor
    },
  })

  // Register global hotkey
  try {
    const success = globalShortcut.register(HOTKEY, () => {
      console.log(`Global hotkey ${HOTKEY} pressed`)
      toggleWindow()
    })

    if (success) {
      console.log(`✅ Global hotkey ${HOTKEY} registered successfully`)
    } else {
      console.error(`❌ Failed to register global hotkey ${HOTKEY}`)
    }
  } catch (error) {
    console.error('Error registering global hotkey:', error)
  }

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Prevent window from closing completely, hide instead (like menu bar apps)
  // But allow closing when the app is actually quitting
  win.on('close', (event) => {
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

// IPC handlers for database operations
ipcMain.handle('db:getAllCommands', async () => {
  try {
    return db.getAllCommands()
  } catch (error) {
    console.error('Error fetching commands from database:', error)
    return [] // Return an empty array on error to avoid breaking the renderer.
  }
})
// update command
ipcMain.handle('db:updateCommand', async (_, id: number, updates: Partial<db.Command>) => {
  try {
    const success = db.updateCommand(id, updates)
    if (success) {
      console.log('Command updated successfully')
      return { success: true }
    }else {
      console.log('No command found with the given ID')
      return { success: false, error: 'No command found' }
    }
  } catch (error) {
    console.error('Error updating command:', error)
    return { success: false, error: error.message }
  }
})
// delete command
ipcMain.handle('db:deleteCommand', async (_, id: number) => {
  try {
    const success = db.deleteCommand(id)
    if (success) {
      console.log('Command deleted successfully')
      return { success: true }
    }else {
      console.log('No command found with the given ID')
      return { success: false, error: 'No command found' }
    }
  } catch (error) {
    console.error('Error deleting command:', error)
    return { success: false, error: error.message }
  }
})
// add command
ipcMain.handle('db:addCommand', async (_, command: any) => {
  try {
    const newId = db.addCommand(command)
    console.log('Command added successfully with ID:', newId)
    return { success: true, id: newId }
  } catch (error) {
    console.error('Error adding command:', error)
    return { success: false, error: error.message }
  }
})
// IPC handlers for writting to clipboard.
ipcMain.handle('clipboard:writeText', async (_,text:string) => {
  try{
    clipboard.writeText(text)
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
      clipboard.write({
        text: data.text,
        html: data.html
      })
      console.log('clipboard written with both text and HTML')
    } else {
      // Just write text
      clipboard.writeText(data.text)
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
    const text = clipboard.readText()
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

    return {
      success: !result.canceled,
      filePath: result.filePath || null
    }
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

    return {
      success: !result.canceled,
      filePath: result.filePaths[0] || null
    }
  } catch (error) {
    console.error('Error showing open dialog:', error)
    return { success: false, filePath: null }
  }
})

// IPC handlers for file read/write operations
ipcMain.handle('file:writeFile', async (_, filePath: string, content: string) => {
  try {
    await fs.writeFile(filePath, content, 'utf8')
    console.log('File written successfully:', filePath)
    return { success: true }
  } catch (error) {
    console.error('Error writing file:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('file:readFile', async (_, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf8')
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
ipcMain.handle('shell:openExternal', async (_, url: string) => {
  try {
    await shell.openExternal(url)
    console.log('Opened external URL:', url)
  } catch (error) {
    console.error('Error opening external URL:', error)
    throw error
  }
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



app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  win = null
  // Don't quit the app - it stays in the tray
  // User can quit from tray context menu
})

app.on('will-quit', () => {
  // Unregister all global shortcuts
  globalShortcut.unregisterAll()
  console.log('🧹 Global shortcuts unregistered')
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
