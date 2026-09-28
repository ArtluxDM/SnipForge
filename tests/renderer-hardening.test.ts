import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createAppUrlPolicy,
  isAllowedAppUrl,
  isAuthorizedIpcSender,
  parseExternalHttpsUrl,
  sanitizeRouteHash,
} from '../electron/main/security'
import { htmlToPreviewText } from '../src/utils/htmlText'

function createMockWindow(url: string) {
  const mainFrame = { url }
  const webContents = {
    mainFrame,
    getURL: () => url,
    isDestroyed: () => false,
  }

  return {
    window: {
      webContents,
      isDestroyed: () => false,
    },
    webContents,
    mainFrame,
  }
}

describe('renderer hardening URL policy', () => {
  const indexHtml = path.resolve('/tmp/snipforge/dist/index.html')
  const packagedUrl = pathToFileURL(indexHtml).href

  it('allows legitimate dev and packaged app URLs', () => {
    const devPolicy = createAppUrlPolicy('http://127.0.0.1:3344/', indexHtml)
    const packagedPolicy = createAppUrlPolicy(undefined, indexHtml)

    expect(isAllowedAppUrl('http://127.0.0.1:3344/#/settings', devPolicy)).toBe(true)
    expect(isAllowedAppUrl(`${packagedUrl}#/settings`, packagedPolicy)).toBe(true)
  })

  it('blocks top-level navigation to non-app content', () => {
    const policy = createAppUrlPolicy('http://127.0.0.1:3344/', indexHtml)

    expect(isAllowedAppUrl('https://evil.example/phish', policy)).toBe(false)
    expect(isAllowedAppUrl('http://localhost:3344/#/lookalike', policy)).toBe(false)
    expect(isAllowedAppUrl('file:///tmp/other.html', policy)).toBe(false)
    expect(isAllowedAppUrl('javascript:alert(1)', policy)).toBe(false)
    expect(isAllowedAppUrl('not a url', policy)).toBe(false)
  })

  it('validates external browser URLs with a parsed HTTPS-only policy', () => {
    expect(parseExternalHttpsUrl('https://example.com/docs?q=snipforge')).toBe('https://example.com/docs?q=snipforge')

    expect(() => parseExternalHttpsUrl('http://example.com')).toThrow('Only HTTPS URLs')
    expect(() => parseExternalHttpsUrl('javascript:alert(1)')).toThrow('Only HTTPS URLs')
    expect(() => parseExternalHttpsUrl('file:///etc/passwd')).toThrow('Only HTTPS URLs')
    expect(() => parseExternalHttpsUrl('https://user:pass@example.com')).toThrow('credentials')
    expect(() => parseExternalHttpsUrl('/relative')).toThrow('Invalid external URL')
  })

  it('sanitizes child-window hash route data without turning it into a URL', () => {
    expect(sanitizeRouteHash('#/help?topic=links')).toBe('/help?topic=links')
    expect(sanitizeRouteHash('/search?q=a b')).toBe('/search?q=a%20b')
    expect(sanitizeRouteHash('/safe#nested')).toBe('/safe%23nested')
    expect(() => sanitizeRouteHash('/bad\nroute')).toThrow('control characters')
    expect(() => sanitizeRouteHash('x'.repeat(2049))).toThrow('too long')
  })
})

describe('renderer hardening IPC authorization', () => {
  const indexHtml = path.resolve('/tmp/snipforge/dist/index.html')
  const policy = createAppUrlPolicy('http://127.0.0.1:3344/', indexHtml)

  it('allows an app window main frame on an approved app URL', () => {
    const app = createMockWindow('http://127.0.0.1:3344/#/settings')

    expect(isAuthorizedIpcSender(
      { sender: app.webContents, senderFrame: app.mainFrame },
      [app.window],
      policy,
    )).toBe(true)
  })

  it('rejects senders that are not registered app windows before side effects', () => {
    const app = createMockWindow('http://127.0.0.1:3344/')
    const hostile = createMockWindow('http://127.0.0.1:3344/')

    expect(isAuthorizedIpcSender(
      { sender: hostile.webContents, senderFrame: hostile.mainFrame },
      [app.window],
      policy,
    )).toBe(false)
  })

  it('rejects child frames and unexpected origins even when preload types exist', () => {
    const app = createMockWindow('http://127.0.0.1:3344/')
    const childFrame = { url: 'http://127.0.0.1:3344/#/embedded' }
    const navigated = createMockWindow('https://evil.example/')

    expect(isAuthorizedIpcSender(
      { sender: app.webContents, senderFrame: childFrame },
      [app.window],
      policy,
    )).toBe(false)

    expect(isAuthorizedIpcSender(
      { sender: navigated.webContents, senderFrame: navigated.mainFrame },
      [navigated.window],
      policy,
    )).toBe(false)
  })
})

describe('safe preview text extraction', () => {
  it('treats hostile HTML as text data without preserving executable/resource attributes', () => {
    const hostile = '<p>Hello <img src="https://evil.example/pixel" onerror="alert(1)"> {{name}}</p><script>alert(1)</script><svg><a href="javascript:alert(2)">bad</a></svg>'

    const preview = htmlToPreviewText(hostile)

    expect(preview).toBe('Hello {{name}} bad')
    expect(preview).not.toContain('evil.example')
    expect(preview).not.toContain('onerror')
    expect(preview).not.toContain('alert')
    expect(preview).not.toContain('javascript:')
  })

  it('preserves legitimate rich text preview content and decodes entities', () => {
    expect(htmlToPreviewText('<h1>Title</h1><p>Use &lt;cmd&gt; &amp; keep {{var}}</p>')).toBe('Title Use <cmd> & keep {{var}}')
    expect(htmlToPreviewText('plain {{variable}} text')).toBe('plain {{variable}} text')
  })
})
