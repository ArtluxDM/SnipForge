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
        getDefaultWritableLocalLibrary: vi.fn().mockResolvedValue({ success: true, library: { name: 'Test' } }),
      },
      clipboard: { write: clipboardWrite },
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
        CommandModal: true,
        SettingsModal: true,
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
