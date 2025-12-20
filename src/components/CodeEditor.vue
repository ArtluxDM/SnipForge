<template>
  <div ref="editorRef" class="code-editor"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { markdown } from '@codemirror/lang-markdown'

interface Props {
  modelValue: string
  language: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Enter code...'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLElement>()
let editorView: EditorView | null = null

// Get language extension based on language prop
const getLanguageExtension = (lang: string) => {
  const langMap: Record<string, any> = {
    javascript: javascript(),
    typescript: javascript({ typescript: true }),
    python: python(),
    html: html(),
    css: css(),
    json: json(),
    yaml: yaml(),
    bash: null, // Basic support
    sql: null,  // Basic support
    go: null,   // Basic support
    rust: null, // Basic support
    java: null, // Basic support
    markdown: markdown()
  }
  return langMap[lang] || null
}

onMounted(() => {
  if (!editorRef.value) return

  const languageExtension = getLanguageExtension(props.language)
  const extensions = [
    basicSetup,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString())
      }
    }),
    EditorView.theme({
      '&': {
        fontSize: '14px',
        backgroundColor: '#1a1a1a',
        color: '#ffffff'
      },
      '.cm-content': {
        caretColor: '#ec5002ee',
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, monospace'
      },
      '.cm-cursor': {
        borderLeftColor: '#ec5002ee'
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: '#3a3a3a !important'
      },
      '&.cm-focused .cm-selectionBackground, &.cm-focused ::selection': {
        backgroundColor: '#3a3a3a !important'
      },
      '.cm-gutters': {
        backgroundColor: '#1a1a1a',
        color: '#666',
        border: 'none'
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#2a2a2a'
      },
      '.cm-activeLine': {
        backgroundColor: '#2a2a2a'
      }
    })
  ]

  if (languageExtension) {
    extensions.push(languageExtension)
  }

  const state = EditorState.create({
    doc: props.modelValue,
    extensions
  })

  editorView = new EditorView({
    state,
    parent: editorRef.value
  })
})

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  if (editorView && newValue !== editorView.state.doc.toString()) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newValue
      }
    })
  }
})

// Watch for language changes
watch(() => props.language, () => {
  if (editorView && editorRef.value) {
    const currentValue = editorView.state.doc.toString()
    editorView.destroy()

    const languageExtension = getLanguageExtension(props.language)
    const extensions = [
      basicSetup,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit('update:modelValue', update.state.doc.toString())
        }
      }),
      EditorView.theme({
        '&': {
          fontSize: '14px',
          backgroundColor: '#1a1a1a',
          color: '#ffffff'
        },
        '.cm-content': {
          caretColor: '#ec5002ee',
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, monospace'
        },
        '.cm-cursor': {
          borderLeftColor: '#ec5002ee'
        },
        '.cm-selectionBackground, ::selection': {
          backgroundColor: '#3a3a3a !important'
        },
        '&.cm-focused .cm-selectionBackground, &.cm-focused ::selection': {
          backgroundColor: '#3a3a3a !important'
        },
        '.cm-gutters': {
          backgroundColor: '#1a1a1a',
          color: '#666',
          border: 'none'
        },
        '.cm-activeLineGutter': {
          backgroundColor: '#2a2a2a'
        },
        '.cm-activeLine': {
          backgroundColor: '#2a2a2a'
        }
      })
    ]

    if (languageExtension) {
      extensions.push(languageExtension)
    }

    const state = EditorState.create({
      doc: currentValue,
      extensions
    })

    editorView = new EditorView({
      state,
      parent: editorRef.value
    })
  }
})

onUnmounted(() => {
  editorView?.destroy()
})
</script>

<style scoped>
.code-editor {
  border: 1px solid #404040;
  border-radius: 8px;
  overflow: hidden;
  min-height: 200px;
}

.code-editor :deep(.cm-editor) {
  height: 100%;
}

.code-editor :deep(.cm-scroller) {
  overflow: auto;
  min-height: 200px;
}
</style>
