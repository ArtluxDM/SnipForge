<template>
    <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
        <div class="modal-content">
            <div class ="modal-header">
                <h2>{{ mode === 'add' ? 'Add New Command' : 'Edit Command' }}</h2>
                <button class="close-button" @click="$emit('cancel')">x</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="title">Title:</label>
                    <input
                        id="title"
                        v-model="formData.title"
                        type="text"
                        placeholder="Enter command title"
                        ref="titleInput"
                    />
                </div>

                <div class="form-group">
                    <div class="field-header">
                        <label for="body">Command:</label>
                        <select v-model="formData.language" class="language-selector">
                            <option value="plaintext">Plain Text</option>
                            <option value="richtext">Rich Text</option>
                            <option value="markdown">Markdown</option>
                            <option value="yaml">YAML</option>
                            <option value="javascript">JavaScript</option>
                            <option value="typescript">TypeScript</option>
                            <option value="python">Python</option>
                            <option value="html">HTML</option>
                            <option value="css">CSS</option>
                            <option value="bash">Bash</option>
                            <option value="json">JSON</option>
                            <option value="sql">SQL</option>
                            <option value="go">Go</option>
                            <option value="rust">Rust</option>
                            <option value="java">Java</option>
                        </select>
                    </div>
                    <!-- Code editor for programming languages -->
                    <CodeEditor
                        v-if="isCodeLanguage(formData.language)"
                        v-model="formData.body"
                        :language="formData.language"
                        placeholder="Enter code..."
                    />
                    <!-- Markdown editor with toolbar -->
                    <MarkdownEditor
                        v-else-if="formData.language === 'markdown'"
                        v-model="formData.body"
                        placeholder="Write markdown..."
                    />
                    <!-- Rich text WYSIWYG editor -->
                    <RichTextEditor
                        v-else-if="formData.language === 'richtext'"
                        v-model="formData.body"
                        placeholder="Start typing..."
                    />
                    <!-- Plain text fallback -->
                    <textarea
                        v-else
                        id="body"
                        v-model="formData.body"
                        placeholder="Enter command body"
                        rows="10"
                        class="plain-textarea"
                    ></textarea>
                </div>

                <div class="form-group">
                    <label for="tags">Tags (comma separated - Press Tab to autocomplete):</label>
                    <div class="autocomplete-container">
                        <input
                            id="tags"
                            ref="tagsInputRef"
                            v-model="tagsInput"
                            type="text"
                            placeholder="e.g. git, docker, linux"
                            @input="handleTagInput"
                            @keydown="handleTagKeydown"
                            @click="updateInlineSuggestion"
                            @keyup="updateInlineSuggestion"
                        />
                        <div
                            v-if="inlineSuggestion"
                            class="inline-suggestion"
                            :style="getSuggestionPosition()"
                        >
                            {{ inlineSuggestion }}
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <div class="field-header">
                        <label for="description">Description (supports Markdown - optional):</label>
                    </div>
                    <!-- Editable mode: textarea -->
                    <textarea
                        v-if="descriptionEditMode"
                        id="description"
                        v-model="formData.description"
                        placeholder="Add a description for this snippet (optional)"
                        rows="3"
                        @blur="descriptionEditMode = false"
                        ref="descriptionTextarea"
                    ></textarea>
                    <!-- Display mode: rendered markdown -->
                    <div
                        v-else
                        class="markdown-preview description-display"
                        v-html="renderedDescription"
                        @click="enterDescriptionEditMode"
                    ></div>
                </div>
            </div>
            <div class="modal-footer">
                <button @click="$emit('cancel')" class="cancel-button">Cancel</button>
                <button @click="handleSave" class="save-button">
                    {{ mode === 'add' ? 'Add Command' : 'Save Changes' }}
                </button>
            </div>
        </div>
    </div>
</template>
<script setup lang="ts">
  import { ref, watch, nextTick, computed } from 'vue'
  import { getAllTags } from '../utils/tags'
  import { getInlineSuggestion } from '../utils/autocomplete'
  import { marked } from 'marked'
  import CodeEditor from './CodeEditor.vue'
  import RichTextEditor from './RichTextEditor.vue'
  import MarkdownEditor from './MarkdownEditor.vue'

  // Props
  interface Props {
    show: boolean
    mode: 'add' | 'edit'
    command?: {
      id: number
      title: string
      body: string
      description: string
      tags: string
      language: string
    } | null
    commands?: Array<{ tags: string }>
  }

  const props = withDefaults(defineProps<Props>(), {
    command: null,
    commands: () => []
  })

  // Emits
  const emit = defineEmits<{
    save: [command: { title: string; body: string; description: string; tags: string; language: string }]
    cancel: []
  }>()

  // Form data
  const formData = ref({
    title: '',
    body: '',
    description: '',
    language: 'plaintext'
  })

  const tagsInput = ref('')
  const titleInput = ref<HTMLInputElement>()
  const tagsInputRef = ref<HTMLInputElement>()
  const descriptionTextarea = ref<HTMLTextAreaElement>()

  // Inline edit mode for description
  const descriptionEditMode = ref(false)

  // Helper to determine editor type
  const isCodeLanguage = (language: string): boolean => {
    const codeLangs = ['yaml', 'javascript', 'typescript', 'python', 'html', 'css', 'bash', 'json', 'sql', 'go', 'rust', 'java']
    return codeLangs.includes(language)
  }

  const enterDescriptionEditMode = () => {
    descriptionEditMode.value = true
    nextTick(() => {
      descriptionTextarea.value?.focus()
    })
  }

  // Configure marked for better markdown support
  marked.setOptions({
    breaks: true,
    gfm: true
  })

  // Rendered content for description
  const renderedDescription = computed(() => {
    return marked(formData.value.description || '')
  })

  // Get available tags for autocomplete
  const availableTags = computed(() => {
    return getAllTags(props.commands || [])
  })

  // Inline suggestion state
  const inlineSuggestion = ref<string | null>(null)
  const cursorPosition = ref(0)

  // Watch for prop changes to populate form
  watch(() => props.command, (newCommand) => {
    if (newCommand) {
      formData.value = {
        title: newCommand.title,
        body: newCommand.body,
        description: newCommand.description || '',
        language: newCommand.language || 'plaintext'
      }
      // Parse tags from JSON string
      try {
        const tags = JSON.parse(newCommand.tags)
        tagsInput.value = Array.isArray(tags) ? tags.join(', ') : ''
      } catch {
        tagsInput.value = ''
      }
    } else {
      // Reset form for add mode
      formData.value = { title: '', body: '', description: '', language: 'plaintext' }
      tagsInput.value = ''
    }
    // Reset edit mode when command changes
    descriptionEditMode.value = false
  }, { immediate: true })

  // Focus title input when modal opens and clear form when closing
  watch(() => props.show, (isShown) => {
    if (isShown) {
      nextTick(() => {
        titleInput.value?.focus()
      })
    } else {
      // Modal is closing - clear form data for add mode to prevent persistence
      if (props.mode === 'add') {
        formData.value = { title: '', body: '', description: '', language: 'plaintext' }
        tagsInput.value = ''
      }
      // Reset edit mode when closing
      descriptionEditMode.value = false
    }
  })

  // Update inline suggestion on input
  const updateInlineSuggestion = () => {
    if (!tagsInputRef.value) {
      inlineSuggestion.value = null
      return
    }

    const input = tagsInput.value
    const cursor = tagsInputRef.value.selectionStart || 0
    cursorPosition.value = cursor

    const suggestion = getInlineSuggestion(input, cursor, availableTags.value)
    inlineSuggestion.value = suggestion.completionText
  }

  // Handle tag input changes
  const handleTagInput = () => {
    updateInlineSuggestion()
  }

  // Handle tag autocomplete on Tab key
  const handleTagKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Tab' && inlineSuggestion.value) {
      event.preventDefault()

      // Accept the inline suggestion
      const input = tagsInput.value
      const cursor = cursorPosition.value
      const suggestion = getInlineSuggestion(input, cursor, availableTags.value)

      if (suggestion.completionText) {
        const newValue = input.substring(0, cursor) + suggestion.completionText + input.substring(cursor)
        tagsInput.value = newValue

        // Move cursor to end of completed tag
        nextTick(() => {
          if (tagsInputRef.value && suggestion.completionText) {
            const newCursorPos = cursor + suggestion.completionText.length
            tagsInputRef.value.setSelectionRange(newCursorPos, newCursorPos)
            updateInlineSuggestion()
          }
        })
      }
    } else if (event.key === 'Escape') {
      // Clear suggestion on Escape
      inlineSuggestion.value = null
    }
  }

  // Calculate position for inline suggestion using cursor coordinates
  const getSuggestionPosition = (): { left: string; top: string } => {
    if (!tagsInputRef.value || !inlineSuggestion.value) {
      return { left: '0px', top: '0px' }
    }

    const input = tagsInputRef.value

    // Use cursor position if available
    if (typeof input.selectionStart === 'number') {
      // Create a temporary span to measure text width up to cursor
      const measurer = document.createElement('span')
      const computedStyle = window.getComputedStyle(input)

      measurer.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: pre;
        font: ${computedStyle.font};
        font-size: ${computedStyle.fontSize};
        font-family: ${computedStyle.fontFamily};
        font-weight: ${computedStyle.fontWeight};
        letter-spacing: ${computedStyle.letterSpacing};
      `

      // Measure text width up to cursor position
      const textBeforeCursor = input.value.substring(0, input.selectionStart)
      measurer.textContent = textBeforeCursor

      document.body.appendChild(measurer)
      const textWidth = measurer.getBoundingClientRect().width
      document.body.removeChild(measurer)

      // Get input's padding
      const paddingLeft = parseInt(computedStyle.paddingLeft) || 12
      const paddingTop = parseInt(computedStyle.paddingTop) || 12

      return {
        left: `${paddingLeft + textWidth}px`,
        top: `${paddingTop + 1}px`
      }
    }

    return { left: '0px', top: '0px' }
  }

  // Handle save
  const handleSave = () => {
    if (!formData.value.title.trim() || !formData.value.body.trim()) {
      alert('Title and Command are required!')
      return
    }

    // Convert tags input to JSON array
    const tags = tagsInput.value
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)

    emit('save', {
      title: formData.value.title.trim(),
      body: formData.value.body.trim(),
      description: formData.value.description.trim(),
      tags: JSON.stringify(tags),
      language: formData.value.language
    })
  }
  </script>
  <style scoped>
  /* Component-specific styles */
  .field-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .field-header label {
    margin-bottom: 0;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .language-selector {
    background-color: #1a1a1a;
    border: 1px solid #404040;
    border-radius: 4px;
    padding: 4px 8px;
    color: #b3b3b3;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
    min-width: auto;
    width: auto;
  }

  .language-selector:hover {
    background-color: #2a2a2a;
    border-color: #ec5002ee;
    color: #ffffff;
  }

  .language-selector:focus {
    outline: none;
    border-color: #ec5002ee;
    color: #ffffff;
  }

  .markdown-preview {
    background-color: #1a1a1a;
    border: 1px solid #404040;
    border-radius: 8px;
    padding: 12px;
    min-height: 80px;
    color: #ffffff;
    font-size: 14px;
    line-height: 1.6;
  }

  .description-display {
    cursor: text;
    transition: border-color 0.2s;
  }

  .description-display:hover {
    border-color: #ec5002ee;
  }

  .description-display:empty::before {
    content: attr(data-placeholder);
    color: #666;
  }

  .markdown-preview :deep(h1),
  .markdown-preview :deep(h2),
  .markdown-preview :deep(h3) {
    margin-top: 16px;
    margin-bottom: 8px;
    color: #ffffff;
  }

  .markdown-preview :deep(h1) {
    font-size: 1.5em;
  }

  .markdown-preview :deep(h2) {
    font-size: 1.3em;
  }

  .markdown-preview :deep(h3) {
    font-size: 1.1em;
  }

  .markdown-preview :deep(p) {
    margin: 8px 0;
  }

  .markdown-preview :deep(a) {
    color: #ec5002ee;
    text-decoration: underline;
  }

  .markdown-preview :deep(a:hover) {
    color: #ff6b2e;
  }

  .markdown-preview :deep(code) {
    background-color: #2a2a2a;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .markdown-preview :deep(pre) {
    background-color: #2a2a2a;
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
  }

  .markdown-preview :deep(pre code) {
    background: none;
    padding: 0;
  }

  .markdown-preview :deep(ul),
  .markdown-preview :deep(ol) {
    margin: 8px 0;
    padding-left: 24px;
  }

  .markdown-preview :deep(li) {
    margin: 4px 0;
  }

  .markdown-preview :deep(blockquote) {
    border-left: 3px solid #ec5002ee;
    padding-left: 12px;
    margin: 8px 0;
    color: #b3b3b3;
  }

  .markdown-preview :deep(img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    margin: 8px 0;
  }

  .autocomplete-container {
    position: relative;
    width: 100%;
  }

  .inline-suggestion {
    position: absolute;
    pointer-events: none;
    color: #666666;
    font-size: 14px;
    font-family: inherit;
    white-space: nowrap;
    z-index: 1;
  }

  .plain-textarea {
    background-color: #1a1a1a;
    border: 1px solid #404040;
    border-radius: 8px;
    padding: 12px;
    color: #ffffff;
    font-size: 14px;
    font-family: Monaco, Menlo, "Ubuntu Mono", Consolas, monospace;
    line-height: 1.6;
    resize: vertical;
    min-height: 200px;
    width: 100%;
  }

  .plain-textarea:focus {
    outline: none;
    border-color: #ec5002ee;
  }
  </style>   
               
            