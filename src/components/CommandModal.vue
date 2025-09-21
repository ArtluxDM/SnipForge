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
                    <label for="body">Command:</label>
                    <textarea 
                        id="body" 
                        v-model="formData.body"
                        placeholder="Enter command body"
                        rows="3"
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

  // Props
  interface Props {
    show: boolean
    mode: 'add' | 'edit'
    command?: {
      id: number
      title: string
      body: string
      tags: string
    } | null
    commands?: Array<{ tags: string }>
  }

  const props = withDefaults(defineProps<Props>(), {
    command: null,
    commands: () => []
  })

  // Emits
  const emit = defineEmits<{
    save: [command: { title: string; body: string; tags: string }]
    cancel: []
  }>()

  // Form data
  const formData = ref({
    title: '',
    body: ''
  })

  const tagsInput = ref('')
  const titleInput = ref<HTMLInputElement>()
  const tagsInputRef = ref<HTMLInputElement>()

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
        body: newCommand.body
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
      formData.value = { title: '', body: '' }
      tagsInput.value = ''
    }
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
        formData.value = { title: '', body: '' }
        tagsInput.value = ''
      }
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
      tags: JSON.stringify(tags)
    })
  }
  </script>
  <style scoped>
  /* Component-specific styles */
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
  </style>   
               
            