<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Help</h2>
        <button class="close-button" @click="$emit('cancel')">×</button>
      </div>
      <div class="modal-body">
        <div v-html="markdownContent" class="markdown-content"></div>
      </div>
      <div class="modal-footer">
        <button @click="$emit('cancel')" class="close-button-footer">Got it!</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import helpMarkdown from '../assets/help.md?raw'

// Props
interface Props {
  show: boolean
}

defineProps<Props>()

// Emits
defineEmits<{
  cancel: []
}>()

// Parse markdown content and inject platform-specific global hotkey
const markdownContent = computed(() => {
  const isMac = navigator.userAgent.toLowerCase().includes('mac')
  const globalHotkey = isMac ? '⌘⇧Space' : 'Ctrl⇧Space'

  // Replace the platform-agnostic text with actual hotkey
  const processedMarkdown = helpMarkdown.replace(
    '**⌘⇧Space** (Mac) / **Ctrl⇧Space** (Windows/Linux)',
    `**${globalHotkey}**`
  )

  return marked(processedMarkdown)
})
</script>

<style scoped>
/* Component-specific styles */
.markdown-content {
  color: #cccccc;
  line-height: 1.6;
}

.markdown-content h1 {
  color: #ffffff;
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 24px 0;
  border-bottom: 1px solid #404040;
  padding-bottom: 12px;
}

.markdown-content h2 {
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  margin: 24px 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.markdown-content h2:first-of-type {
  margin-top: 0;
}

.markdown-content ul {
  margin: 0 0 24px 0;
  padding-left: 0;
  list-style: none;
}

.markdown-content li {
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.markdown-content strong {
  background-color: #404040;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  min-width: 20px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  flex-shrink: 0;
}

.markdown-content code {
  background-color: #404040;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 12px;
  color: #ffffff;
}

.markdown-content p {
  margin: 0 0 16px 0;
}

.close-button-footer {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
  background-color: #ec5002ee;
  color: #ffffff;
}

.close-button-footer:hover {
  background-color: #d4470a;
}
</style>