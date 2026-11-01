// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../src/App.vue'
import type { Command } from '../shared/types'

// Replace only the virtual scroller: happy-dom has no viewport to measure.
vi.mock('virtua/vue', () => ({
  VList: {
    props: ['data'],
    template: '<div><slot v-for="(item, index) in data" :key="item.id" :item="item" :index="index" /></div>',
  },
}))

const commands: Command[] = [
  {
    id: 1, title: 'List pods', body: 'kubectl get pods -n {{namespace}}',
    description: '', tags: '[]', language: 'plaintext', source: 'local',
    library_id: null, remote_path: null, created_at: '', updated_at: '',
  },
  {
    id: 2, title: 'Show date', body: 'date',
    description: '', tags: '[]', language: 'plaintext', source: 'local',
    library_id: null, remote_path: null, created_at: '', updated_at: '',
  },
]

const clipboardWrite = vi.fn().mockResolvedValue(undefined)
let wrapper: VueWrapper | undefined
let windowShown: (() => void) | undefined

beforeEach(async () => {
  clipboardWrite.mockClear()
  windowShown = undefined
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      platform: 'darwin',
      settings: { getAll: vi.fn().mockResolvedValue({}) },
      database: { getAllCommands: vi.fn().mockResolvedValue(commands) },
      library: {
        getAll: vi.fn().mockResolvedValue([]),
        onAutoSyncResult: vi.fn(() => vi.fn()),
        getDefaultWritableLocalLibrary: vi.fn().mockResolvedValue({ success: true, library: { name: 'Test' } }),
      },
      clipboard: { write: clipboardWrite },
      auth: { getStatus: vi.fn().mockResolvedValue({ authenticated: false }) },
      update: { getStatus: vi.fn().mockResolvedValue({}) },
      onWindowShown: vi.fn((callback: () => void) => {
        windowShown = callback
        return vi.fn()
      }),
      onCommandsChanged: vi.fn(() => vi.fn()),
    },
  })

  wrapper = mount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        HelpModal: true,
        DescriptionModal: true,
        DuplicateResolutionModal: true,
        UpdateBanner: true,
      },
    },
  })
  await flushPromises()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  delete (window as Window & { electronAPI?: unknown }).electronAPI
  vi.unstubAllGlobals()
})

async function search(query: string) {
  await wrapper!.get('.search-input').setValue(query)
  // useVue's refDebounced waits 200ms before updating filtered results.
  await new Promise(resolve => setTimeout(resolve, 230))
  await flushPromises()
}

describe('palette search and copy', () => {
  it('keeps the search and focuses it when the palette reopens', async () => {
    await search('Show date')
    const input = wrapper!.get('.search-input').element as HTMLInputElement
    input.blur()

    windowShown!()
    await new Promise(resolve => setTimeout(resolve, 120))
    await flushPromises()

    expect(input.value).toBe('Show date')
    expect(document.activeElement).toBe(input)
    expect(wrapper!.findAll('.command-title').map(node => node.text())).toEqual(['Show date'])
  })

  it('preserves a non-first command field, selection and unsaved content on reopen', async () => {
    await wrapper!.get('.add-button').trigger('click')
    const body = wrapper!.get('.modal-overlay #tags').element as HTMLInputElement
    body.value = 'unsaved command'
    body.dispatchEvent(new Event('input', { bubbles: true }))
    body.focus()
    body.setSelectionRange(2, 8)
    windowShown!()
    await flushPromises()
    expect(document.activeElement).toBe(body)
    expect(body.value).toBe('unsaved command')
    expect([body.selectionStart, body.selectionEnd]).toEqual([2, 8])
  })

  it('restores a Settings tab control and falls back within the modal if it disappears', async () => {
    await wrapper!.get('.settings-button').trigger('click')
    await flushPromises()
    const tabs = wrapper!.findAll('.modal-overlay .tab-button')
    await tabs[1].trigger('click')
    const control = tabs[1].element as HTMLButtonElement
    control.focus()
    ;(wrapper!.get('.search-input').element as HTMLInputElement).focus()
    windowShown!()
    await flushPromises()
    expect(document.activeElement).toBe(control)
    expect(wrapper!.find('.connectors-tab').exists()).toBe(true)
    control.remove()
    windowShown!()
    await flushPromises()
    expect(wrapper!.get('.modal-overlay').element.contains(document.activeElement)).toBe(true)
  })

  it('does not steal focus when a modal opens immediately after reopening', async () => {
    windowShown!()
    await wrapper!.get('.add-button').trigger('click')
    const body = wrapper!.get('.modal-overlay .cm-content').element as HTMLElement
    body.focus()
    windowShown!()
    await new Promise(resolve => setTimeout(resolve, 120))
    expect(document.activeElement).toBe(body)
  })

  it('copies the matching plain command, not the other result', async () => {
    await search('Show date')
    expect(wrapper!.findAll('.command-title').map(node => node.text())).toEqual(['Show date'])

    await wrapper!.get('.command-actions [title="Copy command"]').trigger('click')
    expect(clipboardWrite).toHaveBeenCalledExactlyOnceWith({ text: 'date', html: undefined })
  })

  it('requires a variable value before copying the substituted command', async () => {
    await search('List pods')
    await wrapper!.get('.command-actions [title="Copy command"]').trigger('click')

    expect(clipboardWrite).not.toHaveBeenCalled()
    expect(wrapper!.get('.modal-overlay label').text()).toBe('namespace:')
    const alert = vi.fn()
    vi.stubGlobal('alert', alert)
    await wrapper!.get('.modal-overlay .save-button').trigger('click')
    expect(alert).toHaveBeenCalledWith('Please provide values for: namespace')
    expect(clipboardWrite).not.toHaveBeenCalled()

    await wrapper!.get('.modal-overlay input').setValue('production')
    await wrapper!.get('.modal-overlay .save-button').trigger('click')
    await flushPromises()

    expect(clipboardWrite).toHaveBeenCalledExactlyOnceWith({
      text: 'kubectl get pods -n production', html: undefined,
    })
    expect(wrapper!.find('.modal-overlay').exists()).toBe(false)
  })

  it('copies the raw template with Shift+C without opening the variable modal', async () => {
    await search('List pods')
    await wrapper!.get('.search-input').trigger('keydown', { key: 'Enter' })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', shiftKey: true, bubbles: true }))
    await flushPromises()

    expect(wrapper!.find('.modal-overlay').exists()).toBe(false)
    expect(clipboardWrite).toHaveBeenCalledExactlyOnceWith({
      text: 'kubectl get pods -n {{namespace}}', html: undefined,
    })
  })
})
