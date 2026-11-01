// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import SettingsModal from '../src/components/SettingsModal.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  delete (window as Window & { electronAPI?: unknown }).electronAPI
})

describe('connector avatar', () => {
  it('limits remote CSP image sources to the GitHub avatar HTTPS host', () => {
    const html = readFileSync(path.resolve('index.html'), 'utf8')
    const sources = html.match(/img-src ([^;]+);/)![1].split(/\s+/)
    expect(sources.filter(source => !["'self'", 'data:', 'blob:', 'file:'].includes(source)))
      .toEqual(['https://avatars.githubusercontent.com'])
  })

  it('falls back on image error and retries after reopening settings', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        settings: { getAll: vi.fn().mockResolvedValue({}) },
        auth: { getStatus: vi.fn().mockResolvedValue({
          authenticated: true,
          user: { login: 'test-user', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
        }) },
        library: {
          getAll: vi.fn().mockResolvedValue([]),
          onAutoSyncResult: vi.fn(() => vi.fn()),
        },
        update: { getStatus: vi.fn().mockResolvedValue({ currentVersion: '1.0.0' }) },
      },
    })
    wrapper = mount(SettingsModal, { props: { show: false, commands: [] } })
    await wrapper.setProps({ show: true })
    await flushPromises()
    await wrapper.get('.tab-button:nth-child(2)').trigger('click')
    expect(wrapper.get('.connector-avatar').attributes('src')).toBe('https://avatars.githubusercontent.com/u/1?v=4')

    await wrapper.get('.connector-avatar').trigger('error')
    expect(wrapper.find('.connector-avatar').exists()).toBe(false)
    expect(wrapper.find('.connector-icon svg').exists()).toBe(true)
    expect(wrapper.get('.connector-status').text()).toBe('@test-user')

    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })
    await flushPromises()
    expect(wrapper.find('.connector-avatar').exists()).toBe(true)
  })
})
