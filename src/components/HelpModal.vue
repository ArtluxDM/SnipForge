<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Help</h2>
        <button class="close-button" @click="$emit('cancel')">×</button>
      </div>
      <div class="modal-body">
        <div v-html="markdownContent" class="markdown-content" @click="handleLinkClick"></div>
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
import DOMPurify from 'dompurify'
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

// Parse markdown content and inject platform-specific values
const markdownContent = computed(() => {
  const isMac = navigator.userAgent.toLowerCase().includes('mac')

  // Replace platform-agnostic shortcuts with actual keys
  let processed = helpMarkdown
    .replace('**⌘⇧Space** (Mac) / **Ctrl⇧Space** (Windows/Linux)', isMac ? '**⌘⇧Space**' : '**Ctrl⇧Space**')
    .replace('**⌘F** (Mac) / **Ctrl+F** (Windows/Linux)', isMac ? '**⌘F**' : '**Ctrl+F**')

  return DOMPurify.sanitize(marked.parse(processed, { async: false }) as string)
})

// Open external links in system browser
const handleLinkClick = async (event: MouseEvent) => {
  const anchor = (event.target as HTMLElement).closest('a') as HTMLAnchorElement | null
  if (!anchor) return

  event.preventDefault()
  const url = anchor.href
  if (url) {
    await (window as any).electronAPI.shell.openExternal(url)
  }
}
</script>

<style scoped>
/* Component-specific styles */
.markdown-content {
  color: var(--text-secondary);
  line-height: 1.6;
}

.markdown-content h1 {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 24px 0;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}

.markdown-content h2 {
  color: var(--text-primary);
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
  color: var(--text-primary);
  font-weight: 600;
}

.markdown-content li > strong:first-child {
  background-color: var(--border);
  border: 1px solid var(--border-hover);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  min-width: 20px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  flex-shrink: 0;
}

.markdown-content code {
  background-color: var(--border);
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--text-primary);
}

.markdown-content h3 {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  margin: 16px 0 8px 0;
}

.markdown-content p {
  margin: 0 0 16px 0;
}

.markdown-content a {
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
}

.markdown-content a:hover {
  text-decoration: underline;
}

.close-button-footer {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
  background-color: var(--accent);
  color: var(--text-primary);
}

.close-button-footer:hover {
  background-color: var(--accent-hover);
}

.close-button-footer:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}
</style>