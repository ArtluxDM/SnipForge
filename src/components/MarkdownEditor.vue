<template>
  <div class="markdown-editor">
    <!-- Toolbar -->
    <div class="toolbar">
      <button
        @click="insertBold"
        type="button"
        title="Bold"
        class="toolbar-btn"
      >
        <Bold :size="16" />
      </button>
      <button
        @click="insertItalic"
        type="button"
        title="Italic"
        class="toolbar-btn"
      >
        <Italic :size="16" />
      </button>
      <button
        @click="insertLink"
        type="button"
        title="Link"
        class="toolbar-btn"
      >
        <Link :size="16" />
      </button>
      <button
        @click="insertImage"
        type="button"
        title="Image"
        class="toolbar-btn"
      >
        <Image :size="16" />
      </button>
      <div class="divider"></div>
      <button
        @click="insertList"
        type="button"
        title="Bullet List"
        class="toolbar-btn"
      >
        <List :size="16" />
      </button>
      <button
        @click="insertNumberedList"
        type="button"
        title="Numbered List"
        class="toolbar-btn"
      >
        <ListOrdered :size="16" />
      </button>
    </div>

    <!-- Editor with syntax highlighting -->
    <div ref="editorRef" class="editor-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Bold, Italic, Link, Image, List, ListOrdered } from 'lucide-vue-next'

interface Props {
  modelValue: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Write markdown...'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLElement>()
let editorView: EditorView | null = null

// Helper to insert text at cursor
const insertAtCursor = (before: string, after: string = '', placeholder: string = '') => {
  if (!editorView) return

  const { from, to } = editorView.state.selection.main
  const selectedText = editorView.state.doc.sliceString(from, to)
  const insertText = before + (selectedText || placeholder) + after

  editorView.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor: from + before.length + (selectedText || placeholder).length }
  })

  editorView.focus()
}

const insertBold = () => insertAtCursor('**', '**', 'bold text')
const insertItalic = () => insertAtCursor('*', '*', 'italic text')
const insertLink = () => insertAtCursor('[', '](url)', 'link text')
const insertImage = () => insertAtCursor('![', '](url)', 'alt text')
const insertList = () => {
  if (!editorView) return
  const { from } = editorView.state.selection.main
  const line = editorView.state.doc.lineAt(from)
  const lineStart = line.from

  editorView.dispatch({
    changes: { from: lineStart, insert: '- ' },
    selection: { anchor: from + 2 }
  })
  editorView.focus()
}
const insertNumberedList = () => {
  if (!editorView) return
  const { from } = editorView.state.selection.main
  const line = editorView.state.doc.lineAt(from)
  const lineStart = line.from

  editorView.dispatch({
    changes: { from: lineStart, insert: '1. ' },
    selection: { anchor: from + 3 }
  })
  editorView.focus()
}

onMounted(() => {
  if (!editorRef.value) return

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      markdown(),
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
  })

  editorView = new EditorView({
    state,
    parent: editorRef.value
  })
})

// Watch for external changes
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

onUnmounted(() => {
  editorView?.destroy()
})
</script>

<style scoped>
.markdown-editor {
  border: 1px solid #404040;
  border-radius: 8px;
  overflow: hidden;
  background-color: #1a1a1a;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background-color: #2a2a2a;
  border-bottom: 1px solid #404040;
  flex-wrap: wrap;
}

.toolbar-btn {
  background: none;
  border: 1px solid #404040;
  border-radius: 4px;
  padding: 6px 10px;
  color: #b3b3b3;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-btn:hover {
  background-color: #3a3a3a;
  color: #ffffff;
  border-color: #ec5002ee;
}

.toolbar-btn.is-active {
  background-color: #ec5002ee;
  color: #ffffff;
  border-color: #ec5002ee;
}

.divider {
  width: 1px;
  height: 24px;
  background-color: #404040;
  margin: 0 4px;
}

.editor-container {
  min-height: 200px;
}

.editor-container :deep(.cm-editor) {
  height: 100%;
}

.editor-container :deep(.cm-scroller) {
  overflow: auto;
  min-height: 200px;
  max-height: 400px;
}
</style>
