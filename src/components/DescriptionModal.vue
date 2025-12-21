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
  const target = event.target as HTMLElement
  if (target.tagName === 'A') {
    event.preventDefault()
    let url = (target as HTMLAnchorElement).href

    // If the URL is relative (starts with localhost), extract the actual URL
    if (url.includes('localhost:5173/')) {
      url = url.split('localhost:5173/')[1]
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }
    }

    if (url) {
      const confirmed = confirm(`You are about to navigate to:\n\n${url}\n\nDo you want to continue?`)
      if (confirmed) {
        await (window as any).electronAPI.shell.openExternal(url)
      }
    }
  }
}
</script>

<style scoped>
/* Component-specific styles */
.markdown-content {
  color: #cccccc;
  line-height: 1.6;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  color: #ffffff;
  margin-top: 16px;
  margin-bottom: 8px;
}

.markdown-content h1 {
  font-size: 1.5em;
}

.markdown-content h2 {
  font-size: 1.3em;
}

.markdown-content h3 {
  font-size: 1.1em;
}

.markdown-content p {
  margin: 8px 0;
}

.markdown-content a {
  color: #ec5002ee;
  text-decoration: underline;
  cursor: pointer;
}

.markdown-content a:hover {
  color: #ff6b2e;
}

.markdown-content code {
  background-color: #2a2a2a;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.markdown-content pre {
  background-color: #2a2a2a;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
}

.markdown-content pre code {
  background: none;
  padding: 0;
}

.markdown-content ul,
.markdown-content ol {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-content li {
  margin: 4px 0;
}

.markdown-content blockquote {
  border-left: 3px solid #ec5002ee;
  padding-left: 12px;
  margin: 8px 0;
  color: #b3b3b3;
}

.markdown-content img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
}

.markdown-content strong {
  font-weight: 600;
}

.markdown-content em {
  font-style: italic;
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
