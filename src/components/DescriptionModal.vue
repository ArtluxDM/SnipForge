<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ title }}</h2>
        <button class="close-button" @click="$emit('cancel')">×</button>
      </div>
      <div class="modal-body">
        <div v-html="renderedDescription" class="markdown-content" @click="handleLinkClick"></div>
      </div>
      <div class="modal-footer">
        <button @click="$emit('cancel')" class="close-button-footer">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Props
interface Props {
  show: boolean
  title: string
  description: string
}

const props = defineProps<Props>()

// Emits
defineEmits<{
  cancel: []
}>()

// Configure marked for better markdown support
marked.setOptions({
  breaks: true,
  gfm: true
})

// Render markdown description with sanitization to prevent XSS
const renderedDescription = computed(() => {
  const rawHtml = marked.parse(props.description || '', { async: false })
  // Sanitize HTML to prevent XSS attacks from malicious imported commands
  return DOMPurify.sanitize(rawHtml)
})

// Handle link clicks to open in system browser
const handleLinkClick = async (event: MouseEvent) => {
  const anchor = (event.target as HTMLElement).closest('a') as HTMLAnchorElement | null
  if (!anchor) return

  event.preventDefault()
  const url = anchor.href

  if (url) {
    const confirmed = confirm(`You are about to navigate to:\n\n${url}\n\nDo you want to continue?`)
    if (confirmed) {
      await (window as any).electronAPI.shell.openExternal(url)
    }
  }
}
</script>

<style scoped>
/* Component-specific styles */
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
