<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { UpdateStatus } from '../../shared/types'

type StatusWithBanner = UpdateStatus & { showBanner: boolean }

const status = ref<StatusWithBanner>({
  currentVersion: '',
  latestVersion: null,
  updateAvailable: false,
  releaseUrl: 'https://snipforge.dev',
  lastChecked: null,
  showBanner: false,
})

let cleanupListener: (() => void) | null = null

onMounted(async () => {
  try {
    const s = await window.electronAPI.update.getStatus()
    status.value = s
  } catch (e) {
    console.warn('[UpdateBanner] Failed to get status:', e)
  }

  // Listen for push updates from main process
  cleanupListener = window.electronAPI.update.onStatusChanged((data: StatusWithBanner) => {
    status.value = data
  })
})

onUnmounted(() => {
  if (cleanupListener) cleanupListener()
})

async function handleUpdate() {
  try {
    await window.electronAPI.shell.openExternal(status.value.releaseUrl)
    await window.electronAPI.update.dismiss()
    status.value = { ...status.value, showBanner: false }
  } catch (e) {
    console.warn('[UpdateBanner] Failed to open URL:', e)
  }
}

async function handleRemindLater() {
  try {
    await window.electronAPI.update.remindLater()
    status.value = { ...status.value, showBanner: false }
  } catch (e) {
    console.warn('[UpdateBanner] Failed to dismiss:', e)
  }
}
</script>

<template>
  <Transition name="update-banner">
    <div v-if="status.showBanner" class="update-banner">
      <span class="update-text">New version is out</span>
      <button class="update-btn" @click="handleUpdate">update</button>
      <button class="remind-btn" @click="handleRemindLater">remind me later</button>
    </div>
  </Transition>
</template>

<style scoped>
.update-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.update-text {
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  font-style: italic;
}

.update-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.update-btn:hover {
  background: var(--accent-glow);
}

.remind-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: color 0.15s;
}

.remind-btn:hover {
  color: var(--text-secondary);
}

/* Transition */
.update-banner-enter-active,
.update-banner-leave-active {
  transition: all 0.3s ease;
}

.update-banner-enter-from,
.update-banner-leave-to {
  opacity: 0;
  transform: translateY(100%);
}
</style>
