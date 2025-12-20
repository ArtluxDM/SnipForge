<template>
  <div class="rich-text-editor">
    <!-- Toolbar -->
    <div v-if="editor" class="toolbar">
      <button
        @click="editor.chain().focus().toggleBold().run()"
        :class="{ 'is-active': editor.isActive('bold') }"
        type="button"
        title="Bold (Cmd+B)"
      >
        <Bold :size="16" />
      </button>
      <button
        @click="editor.chain().focus().toggleItalic().run()"
        :class="{ 'is-active': editor.isActive('italic') }"
        type="button"
        title="Italic (Cmd+I)"
      >
        <Italic :size="16" />
      </button>
      <button
        @click="editor.chain().focus().toggleStrike().run()"
        :class="{ 'is-active': editor.isActive('strike') }"
        type="button"
        title="Strikethrough"
      >
        <Strikethrough :size="16" />
      </button>
      <div class="divider"></div>
      <button
        @click="editor.chain().focus().toggleBulletList().run()"
        :class="{ 'is-active': editor.isActive('bulletList') }"
        type="button"
        title="Bullet List"
      >
        <List :size="16" />
      </button>
      <button
        @click="editor.chain().focus().toggleOrderedList().run()"
        :class="{ 'is-active': editor.isActive('orderedList') }"
        type="button"
        title="Numbered List"
      >
        <ListOrdered :size="16" />
      </button>
      <button
        @click="editor.chain().focus().toggleTaskList().run()"
        :class="{ 'is-active': editor.isActive('taskList') }"
        type="button"
        title="Task List"
      >
        <ListTodo :size="16" />
      </button>
      <div class="divider"></div>
      <button
        @click="addLink"
        :class="{ 'is-active': editor.isActive('link') }"
        type="button"
        title="Add Link"
      >
        <LinkIcon :size="16" />
      </button>
      <button
        @click="addImage"
        type="button"
        title="Add Image"
      >
        <ImageIcon :size="16" />
      </button>
    </div>

    <!-- Editor -->
    <EditorContent :editor="editor" class="editor-content" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Strikethrough, List, ListOrdered, ListTodo, Link as LinkIcon, Image as ImageIcon } from 'lucide-vue-next'

interface Props {
  modelValue: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Start typing...'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editor = useEditor({
  extensions: [
    StarterKit,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'editor-link'
      }
    }),
    Image.configure({
      HTMLAttributes: {
        class: 'editor-image'
      }
    }),
    TaskList,
    TaskItem.configure({
      nested: true
    }),
    Placeholder.configure({
      placeholder: props.placeholder
    })
  ],
  content: props.modelValue,
  editorProps: {
    attributes: {
      class: 'prose prose-invert'
    }
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  }
})

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  if (editor.value && newValue !== editor.value.getHTML()) {
    editor.value.commands.setContent(newValue, { emitUpdate: false })
  }
})

// Add link
const addLink = () => {
  if (!editor.value) return

  const previousUrl = editor.value.getAttributes('link').href
  const url = prompt('Enter URL:', previousUrl || 'https://')

  if (url === null) return

  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

// Add image
const addImage = () => {
  if (!editor.value) return

  const url = prompt('Enter image URL:', 'https://')

  if (url) {
    editor.value.chain().focus().setImage({ src: url }).run()
  }
}

onUnmounted(() => {
  editor.value?.destroy()
})
</script>

<style scoped>
.rich-text-editor {
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

.toolbar button {
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

.toolbar button:hover {
  background-color: #3a3a3a;
  color: #ffffff;
  border-color: #ec5002ee;
}

.toolbar button.is-active {
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

.editor-content {
  padding: 12px;
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.editor-content :deep(.ProseMirror) {
  outline: none;
  color: #e3e3e3;
  font-size: 15px;
  line-height: 1.7;
  min-height: 180px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}

.editor-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  color: #666;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.editor-content :deep(.ProseMirror h1),
.editor-content :deep(.ProseMirror h2),
.editor-content :deep(.ProseMirror h3) {
  color: #ffffff;
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 12px;
  line-height: 1.3;
}

.editor-content :deep(.ProseMirror h1) {
  font-size: 2em;
  margin-top: 0;
}

.editor-content :deep(.ProseMirror h2) {
  font-size: 1.5em;
}

.editor-content :deep(.ProseMirror h3) {
  font-size: 1.25em;
}

.editor-content :deep(.ProseMirror p) {
  margin: 12px 0;
}

.editor-content :deep(.ProseMirror a) {
  color: #ec5002ee;
  text-decoration: underline;
  cursor: pointer;
}

.editor-content :deep(.ProseMirror a:hover) {
  color: #ff6b2e;
}

.editor-content :deep(.ProseMirror strong) {
  font-weight: 600;
}

.editor-content :deep(.ProseMirror em) {
  font-style: italic;
}

.editor-content :deep(.ProseMirror s) {
  text-decoration: line-through;
}

.editor-content :deep(.ProseMirror ul),
.editor-content :deep(.ProseMirror ol) {
  padding-left: 24px;
  margin: 8px 0;
}

.editor-content :deep(.ProseMirror li) {
  margin: 4px 0;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"]) {
  list-style: none;
  padding: 0;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] p) {
  margin: 0;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label) {
  flex: 0 0 auto;
  margin-right: 8px;
  margin-top: 6px;
  user-select: none;
  display: flex;
  align-items: center;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label > input[type="checkbox"]) {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  margin: 0;
  padding: 0;
  border: 2px solid #666;
  border-radius: 3px;
  cursor: pointer;
  position: relative;
  background-color: transparent;
  transition: all 0.2s;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label > input[type="checkbox"]:hover) {
  border-color: #b3b3b3;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label > input[type="checkbox"]:checked) {
  background-color: #ec5002ee;
  border-color: #ec5002ee;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label > input[type="checkbox"]:checked::after) {
  content: '';
  position: absolute;
  left: 3px;
  top: 0px;
  width: 4px;
  height: 8px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > div) {
  flex: 1 1 auto;
}


.editor-content :deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
}

.editor-content :deep(.ProseMirror code) {
  background-color: rgba(255, 255, 255, 0.1);
  padding: 3px 6px;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
  font-size: 0.9em;
  color: #ff9966;
}

.editor-content :deep(.ProseMirror pre) {
  background-color: #1e1e1e;
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  border: 1px solid #333;
}

.editor-content :deep(.ProseMirror pre code) {
  background: none;
  padding: 0;
  color: #d4d4d4;
}

.editor-content :deep(.ProseMirror blockquote) {
  border-left: 4px solid #555;
  padding-left: 16px;
  margin: 16px 0;
  color: #aaa;
  font-style: italic;
}
</style>
