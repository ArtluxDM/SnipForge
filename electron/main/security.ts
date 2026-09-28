import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface AppUrlPolicy {
  devOrigin: string | null
  indexHtmlPath: string
  indexHtmlUrl: string
}

interface WebContentsLike {
  getURL(): string
  isDestroyed?(): boolean
  mainFrame?: unknown
}

interface BrowserWindowLike {
  webContents: WebContentsLike
  isDestroyed(): boolean
}

interface IpcEventLike {
  sender: WebContentsLike
  senderFrame?: { url?: string } | unknown
}

export function createAppUrlPolicy(devServerUrl: string | undefined, indexHtmlPath: string): AppUrlPolicy {
  let devOrigin: string | null = null

  if (devServerUrl) {
    const parsed = new URL(devServerUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported dev server protocol: ${parsed.protocol}`)
    }
    devOrigin = parsed.origin
  }

  const resolvedIndexHtmlPath = path.resolve(indexHtmlPath)

  return {
    devOrigin,
    indexHtmlPath: resolvedIndexHtmlPath,
    indexHtmlUrl: pathToFileURL(resolvedIndexHtmlPath).href,
  }
}

export function isAllowedAppUrl(candidateUrl: string, policy: AppUrlPolicy): boolean {
  let parsed: URL

  try {
    parsed = new URL(candidateUrl)
  } catch {
    return false
  }

  if (policy.devOrigin && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    return parsed.origin === policy.devOrigin
  }

  if (parsed.protocol !== 'file:') {
    return false
  }

  try {
    return path.resolve(fileURLToPath(parsed)) === policy.indexHtmlPath
  } catch {
    return false
  }
}

export function parseExternalHttpsUrl(candidateUrl: unknown): string {
  if (typeof candidateUrl !== 'string') {
    throw new Error('External URL must be a string')
  }

  let parsed: URL
  try {
    parsed = new URL(candidateUrl)
  } catch {
    throw new Error('Invalid external URL')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed')
  }

  if (!parsed.hostname) {
    throw new Error('External URL must include a hostname')
  }

  if (parsed.username || parsed.password) {
    throw new Error('External URLs with credentials are not allowed')
  }

  return parsed.href
}

export function sanitizeRouteHash(routeHash: unknown): string {
  if (typeof routeHash !== 'string') {
    throw new Error('Window route must be a string')
  }

  const withoutMarker = routeHash.startsWith('#') ? routeHash.slice(1) : routeHash
  const trimmed = withoutMarker.trim()

  if (trimmed.length > 2048) {
    throw new Error('Window route is too long')
  }

  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error('Window route contains control characters')
  }

  return encodeURI(trimmed).replace(/#/g, '%23')
}

export function isAuthorizedIpcSender(
  event: IpcEventLike,
  appWindows: Iterable<BrowserWindowLike>,
  policy: AppUrlPolicy,
): boolean {
  const sender = event.sender
  if (!sender || sender.isDestroyed?.()) {
    return false
  }

  let matchedWindow: BrowserWindowLike | null = null
  Array.from(appWindows).some((appWindow) => {
    if (!appWindow || appWindow.isDestroyed()) {
      return false
    }

    if (appWindow.webContents === sender) {
      matchedWindow = appWindow
      return true
    }

    return false
  })

  if (!matchedWindow) {
    return false
  }

  if (event.senderFrame && sender.mainFrame && event.senderFrame !== sender.mainFrame) {
    return false
  }

  const frameUrl = typeof event.senderFrame === 'object' && event.senderFrame && 'url' in event.senderFrame
    ? String((event.senderFrame as { url?: unknown }).url ?? '')
    : ''
  const senderUrl = sender.getURL()

  if (!isAllowedAppUrl(senderUrl, policy)) {
    return false
  }

  if (frameUrl && !isAllowedAppUrl(frameUrl, policy)) {
    return false
  }

  return true
}

export function attachWindowNavigationPolicy(
  browserWindow: BrowserWindow,
  policy: AppUrlPolicy,
  openExternal: (url: string) => Promise<unknown>,
): void {
  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      void openExternal(parseExternalHttpsUrl(url))
    } catch (error) {
      console.error('SECURITY: Blocked unsafe popup URL:', url, error)
    }

    return { action: 'deny' }
  })

  browserWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedAppUrl(url, policy)) {
      console.error('SECURITY: Blocked renderer navigation:', url)
      event.preventDefault()
    }
  })

  ;(browserWindow.webContents as any).on('will-frame-navigate', (event: Electron.Event, url: string) => {
    if (!isAllowedAppUrl(url, policy)) {
      console.error('SECURITY: Blocked frame navigation:', url)
      event.preventDefault()
    }
  })
}

export function authorizeIpcInvoke(
  event: IpcMainInvokeEvent,
  appWindows: Iterable<BrowserWindow>,
  policy: AppUrlPolicy,
): void {
  if (!isAuthorizedIpcSender(event, appWindows, policy)) {
    console.error('SECURITY: Blocked unauthorized IPC sender')
    throw new Error('Unauthorized IPC sender')
  }
}
