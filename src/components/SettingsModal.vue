<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content">
      <!-- Tab Navigation with close button -->
      <div class="tab-navigation">
        <div class="tabs">
          <button
            class="tab-button"
            :class="{ active: activeTab === 'settings' }"
            @click="activeTab = 'settings'"
          >
            Settings
          </button>
          <button
            class="tab-button"
            :class="{ active: activeTab === 'management' }"
            @click="activeTab = 'management'"
          >
            Manage Commands
          </button>
        </div>
        <button class="close-button" @click="$emit('cancel')">×</button>
      </div>

      <div class="modal-body">

        <!-- Tab 1: Settings -->
        <div v-if="activeTab === 'settings'">
          <!-- Export Section -->
          <div class="settings-section">
          <h3>Export Commands</h3>
          <p class="section-description">Export your commands to a JSON file</p>

          <div class="form-group">
            <label>Filter by tags (optional - Press Tab to autocomplete):</label>
            <div class="export-input-wrapper">
              <div class="autocomplete-container">
                <input
                  ref="exportTagsInputRef"
                  v-model="exportTags"
                  type="text"
                  placeholder="e.g. git, docker (leave empty for all commands)"
                  class="tag-input"
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
              <button
                @click="toggleExportFilterDropdown"
                class="export-filter-button"
                title="Select tags from list"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
                </svg>
              </button>

              <!-- Filter dropdown -->
              <div v-if="showExportFilterDropdown" class="export-filter-dropdown" @click.stop>
                <div class="export-filter-header">
                  <span>Select Tags</span>
                  <button @click="closeExportFilterDropdown" class="close-btn">×</button>
                </div>

                <div class="export-filter-list">
                  <div
                    v-for="tag in availableExportTags"
                    :key="tag"
                    class="export-filter-item"
                    :class="{ selected: selectedExportTags.includes(tag) }"
                    @click="toggleExportTag(tag)"
                  >
                    <span class="tag-name">{{ tag }}</span>
                    <span v-if="selectedExportTags.includes(tag)" class="checkmark">✓</span>
                  </div>
                </div>

                <div class="export-filter-footer">
                  <button @click="clearAllExportTags" class="clear-all-btn">Clear All</button>
                  <button @click="applyExportTags" class="apply-btn">Apply</button>
                </div>
              </div>
            </div>
            <small class="help-text">Comma-separated tags. Leave empty to export all commands. Use dropdown to select from available tags.</small>
          </div>

          <div class="button-group">
            <button @click="handleExport" class="action-button export-button">
              <Upload :size="16" />
              Export Commands
              <span class="command-counter">({{ exportCommandCount }})</span>
            </button>
          </div>
        </div>

        <!-- Import Section -->
        <div class="settings-section">
          <h3>Import Commands</h3>
          <p class="section-description">Import commands from a JSON file</p>

          <div class="button-group">
            <button @click="handleImport" class="action-button import-button">
              <Download :size="16" />
              Import Commands
            </button>
          </div>
        </div>

          <!-- Statistics Section -->
          <div class="settings-section">
            <h3>Statistics</h3>
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">Total Commands:</span>
                <span class="stat-value">{{ totalCommands }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Unique Tags:</span>
                <span class="stat-value">{{ uniqueTags }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 2: Command Management -->
        <div v-if="activeTab === 'management'" class="management-tab">
          <!-- Controls Section -->
          <div class="management-controls">
            <div class="controls-row">
              <!-- Tag Filter -->
              <div class="filter-section">
                <button @click="toggleManagementFilterDropdown" class="management-filter-button" title="Filter by tags">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
                  </svg>
                </button>

                <!-- Filter dropdown -->
                <div v-if="showManagementFilterDropdown" class="filter-dropdown" @click.stop>
                  <TagSelector
                    :available-tags="availableTags"
                    :selected-tags="selectedManagementTags"
                    title="Filter by Tags"
                    @toggle="toggleManagementTag"
                    @clear-all="clearManagementTags"
                  />
                </div>
              </div>

              <!-- Bulk Selection -->
              <div class="bulk-selection">
                <button @click="selectAllCommands" class="control-button">Select All</button>
                <button @click="deselectAllCommands" class="control-button">Deselect All</button>
              </div>

              <div class="spacer"></div>

              <!-- Action Buttons -->
              <div class="action-buttons">
                <button
                  @click="handleBulkDelete"
                  :disabled="selectedCommandIds.length === 0"
                  class="action-button delete-button"
                >
                  Delete
                </button>
                <button
                  @click="handleBulkExport"
                  :disabled="selectedCommandIds.length === 0"
                  class="action-button export-button"
                >
                  Export
                </button>
              </div>
            </div>
          </div>

          <!-- Command List -->
          <div class="command-list-container">
            <CommandList
              :commands="filteredManagementCommands"
              :selected-ids="selectedCommandIds"
              @toggle="toggleCommandSelection"
              :empty-message="managementEmptyMessage"
            />
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { Download, Upload } from 'lucide-vue-next'
import { getAllTags } from '../utils/tags'
import { getInlineSuggestion } from '../utils/autocomplete'
import CommandList from './CommandList.vue'
import TagSelector from './TagSelector.vue'

// Props
interface Props {
  show: boolean
  commands: Array<{
    id: number
    title: string
    body: string
    tags: string
    created_at: string
    updated_at: string
  }>
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  cancel: []
  export: [tags: string[]]
  import: []
  'bulk-delete': [ids: number[]]
  'bulk-export': [ids: number[]]
}>()

// Tab state
type Tab = 'settings' | 'management'
const activeTab = ref<Tab>('settings')

// Form data
const exportTags = ref('')
const exportTagsInputRef = ref<HTMLInputElement>()

// Inline suggestion state for export tags
const inlineSuggestion = ref<string | null>(null)
const cursorPosition = ref(0)

// Export filter dropdown state
const showExportFilterDropdown = ref(false)
const selectedExportTags = ref<string[]>([])

// Command Management state
const selectedCommandIds = ref<number[]>([])
const selectedManagementTags = ref<string[]>([])
const showManagementFilterDropdown = ref(false)

// Get available tags for autocomplete and dropdown
const availableTags = computed(() => {
  return getAllTags(props.commands)
})

const availableExportTags = computed(() => {
  return getAllTags(props.commands).sort()
})

// Count of commands that would be exported based on current filter
const exportCommandCount = computed(() => {
  if (!exportTags.value.trim()) {
    return props.commands.length // All commands if no filter
  }

  // Parse tags from input (same logic as export)
  const filterTags = exportTags.value
    .split(',')
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0)

  if (filterTags.length === 0) {
    return props.commands.length
  }

  // Count commands that match ALL filter tags (AND logic)
  return props.commands.filter(command => {
    try {
      const commandTags = JSON.parse(command.tags) as string[]
      const normalizedCommandTags = commandTags.map(tag => tag.toLowerCase())

      return filterTags.every(filterTag =>
        normalizedCommandTags.some(commandTag =>
          commandTag.includes(filterTag)
        )
      )
    } catch {
      return false
    }
  }).length
})

// Computed statistics
const totalCommands = computed(() => props.commands.length)

const uniqueTags = computed(() => {
  const allTags = new Set<string>()
  props.commands.forEach(command => {
    try {
      const tags = JSON.parse(command.tags)
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          if (tag.trim()) {
            allTags.add(tag.trim().toLowerCase())
          }
        })
      }
    } catch {
      // Invalid JSON, skip
    }
  })
  return allTags.size
})

// Handle export
const handleExport = () => {
  const tags = exportTags.value
    .split(',')
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0)

  emit('export', tags)
}

// Update inline suggestion for export tags
const updateInlineSuggestion = () => {
  if (!exportTagsInputRef.value) {
    inlineSuggestion.value = null
    return
  }

  const input = exportTags.value
  const cursor = exportTagsInputRef.value.selectionStart || 0
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
    const input = exportTags.value
    const cursor = cursorPosition.value
    const suggestion = getInlineSuggestion(input, cursor, availableTags.value)

    if (suggestion.completionText) {
      const newValue = input.substring(0, cursor) + suggestion.completionText + input.substring(cursor)
      exportTags.value = newValue

      // Move cursor to end of completed tag
      nextTick(() => {
        if (exportTagsInputRef.value && suggestion.completionText) {
          const newCursorPos = cursor + suggestion.completionText.length
          exportTagsInputRef.value.setSelectionRange(newCursorPos, newCursorPos)
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
  if (!exportTagsInputRef.value || !inlineSuggestion.value) {
    return { left: '0px', top: '0px' }
  }

  const input = exportTagsInputRef.value

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
      left: `${paddingLeft + textWidth + 0.5}px`,
      top: `${paddingTop + 0.5}px`
    }
  }

  return { left: '0px', top: '0px' }
}

// Export filter dropdown functions
const toggleExportFilterDropdown = () => {
  showExportFilterDropdown.value = !showExportFilterDropdown.value
}

const closeExportFilterDropdown = () => {
  showExportFilterDropdown.value = false
}

const toggleExportTag = (tag: string) => {
  const index = selectedExportTags.value.indexOf(tag)
  if (index === -1) {
    selectedExportTags.value.push(tag)
  } else {
    selectedExportTags.value.splice(index, 1)
  }
}

const clearAllExportTags = () => {
  selectedExportTags.value = []
}

const applyExportTags = () => {
  // Add selected tags to the input box
  const currentTags = exportTags.value.trim()
  const newTags = selectedExportTags.value.join(', ')

  if (currentTags && newTags) {
    exportTags.value = currentTags + ', ' + newTags
  } else if (newTags) {
    exportTags.value = newTags
  }

  // Clear selections and close dropdown
  selectedExportTags.value = []
  showExportFilterDropdown.value = false
}

// Handle import
const handleImport = () => {
  emit('import')
}

// Command Management - Filtered commands based on selected tags (OR logic)
const filteredManagementCommands = computed(() => {
  if (selectedManagementTags.value.length === 0) {
    return props.commands
  }

  return props.commands.filter(command => {
    try {
      const commandTags = JSON.parse(command.tags) as string[]
      const normalizedCommandTags = commandTags.map(tag => tag.toLowerCase())

      // OR logic: command matches if it has ANY of the selected tags
      return selectedManagementTags.value.some(selectedTag =>
        normalizedCommandTags.some(commandTag =>
          commandTag.includes(selectedTag.toLowerCase())
        )
      )
    } catch {
      return false
    }
  })
})

const managementEmptyMessage = computed(() => {
  if (selectedManagementTags.value.length > 0) {
    return 'No commands match the selected tags'
  }
  return 'No commands available'
})

// Management filter dropdown
const toggleManagementFilterDropdown = () => {
  showManagementFilterDropdown.value = !showManagementFilterDropdown.value
}

const toggleManagementTag = (tag: string) => {
  const index = selectedManagementTags.value.indexOf(tag)
  if (index === -1) {
    selectedManagementTags.value.push(tag)
  } else {
    selectedManagementTags.value.splice(index, 1)
  }
}

const clearManagementTags = () => {
  selectedManagementTags.value = []
}

// Bulk selection
const selectAllCommands = () => {
  selectedCommandIds.value = filteredManagementCommands.value.map(cmd => cmd.id)
}

const deselectAllCommands = () => {
  selectedCommandIds.value = []
}

const toggleCommandSelection = (id: number) => {
  const index = selectedCommandIds.value.indexOf(id)
  if (index === -1) {
    selectedCommandIds.value.push(id)
  } else {
    selectedCommandIds.value.splice(index, 1)
  }
}

// Bulk actions
const handleBulkDelete = () => {
  if (selectedCommandIds.value.length === 0) return
  emit('bulk-delete', [...selectedCommandIds.value])
  selectedCommandIds.value = []
}

const handleBulkExport = () => {
  if (selectedCommandIds.value.length === 0) return
  emit('bulk-export', [...selectedCommandIds.value])
}
</script>

<style scoped>
/* Override modal-body for tabs */
.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  height: calc(90vh - 100px);
  overflow: hidden;
}

/* Component-specific styles */
.settings-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid #404040;
}

.settings-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.settings-section h3 {
  margin: 0 0 8px 0;
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
}

.section-description {
  margin: 0 0 16px 0;
  color: #cccccc;
  font-size: 14px;
}

.tag-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #404040;
  border-radius: 8px;
  background-color: #1a1a1a;
  color: #ffffff;
  font-size: 14px;
  box-sizing: border-box;
}

.tag-input:focus {
  outline: none;
  border-color: #ec5002ee;
}

.help-text {
  display: block;
  margin-top: 4px;
  color: #999;
  font-size: 12px;
}

.button-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action-button {
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.export-button {
  background-color: #ec5002ee;
  color: #ffffff;
}

.export-button:hover {
  background-color: #d4470a;
}

.import-button {
  background-color: #ec5002ee;
  color: #ffffff;
}

.import-button:hover {
  background-color: #d4470a;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background-color: #1a1a1a;
  border-radius: 8px;
  border: 1px solid #404040;
}

.stat-label {
  color: #cccccc;
  font-size: 14px;
}

.stat-value {
  color: #ffffff;
  font-weight: 600;
  font-size: 16px;
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

/* Export filter dropdown styles */
.export-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.export-filter-button {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 16px;
  background: #2a2a2a;
  color: #b3b3b3;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border: 1px solid #404040;
  flex-shrink: 0;
}

.export-filter-button:hover {
  background: #3a3a3a;
  color: #ffffff;
}

.export-filter-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  margin-top: 4px;
  width: 300px;
  max-height: 400px;
  overflow: hidden;
}

.export-filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #404040;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: #404040;
  color: #ffffff;
}

.export-filter-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px 0;
}

.export-filter-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.export-filter-item:hover {
  background: #3a3a3a;
}

.export-filter-item.selected {
  background: #ec5002ee;
  color: #ffffff;
}

.tag-name {
  flex: 1;
}

.checkmark {
  color: #ffffff;
  font-weight: bold;
  margin-left: 8px;
}

.export-filter-footer {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #404040;
  gap: 8px;
}

.clear-all-btn,
.apply-btn {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.clear-all-btn {
  background: #404040;
  color: #ffffff;
}

.clear-all-btn:hover {
  background: #505050;
}

.apply-btn {
  background: #ec5002ee;
  color: #ffffff;
}

.apply-btn:hover {
  background: #d64502;
}

/* Button icon and counter styles */
.action-button {
  display: flex;
  align-items: center;
  gap: 8px;
}

.command-counter {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: normal;
}

/* Tab Navigation */
.tab-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1a1a1a;
  padding: 0 12px;
  border-bottom: 1px solid #404040;
  gap: 8px;
}

.tabs {
  display: flex;
  gap: 0;
  flex: 1;
}

.tab-button {
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: #999;
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border-bottom: 2px solid transparent;
}

.tab-button:hover {
  color: #ffffff;
}

.tab-button.active {
  color: #ffffff;
  border-bottom-color: #ec5002ee;
}

.close-button {
  background: none;
  border: none;
  color: #999;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  margin-bottom: 4px;
}

.close-button:hover {
  background: #404040;
  color: #ffffff;
}

/* Command Management Tab */
.management-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  overflow: hidden;
}

.management-controls {
  padding-bottom: 16px;
  border-bottom: 1px solid #404040;
  flex-shrink: 0;
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 2px solid blue; /* DEBUG */
}

.filter-section {
  display: flex;
  align-items: center;
  border: 2px solid red; /* DEBUG */
}

.management-filter-button {
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  border: 2px solid green !important; /* DEBUG */
  border-radius: 16px;
  background: #2a2a2a;
  color: #b3b3b3;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}

.management-filter-button:hover {
  background: #3a3a3a;
  color: #ffffff;
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 1000;
  width: 200px;
}

.bulk-selection {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 2px solid yellow; /* DEBUG */
}

.control-button {
  padding: 8px 12px;
  background: #2a2a2a;
  border: 1px solid #404040;
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
  height: 32px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
}

.control-button:hover {
  background: #3a3a3a;
}

.spacer {
  flex: 1;
  border: 2px solid orange; /* DEBUG */
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  border: 2px solid purple; /* DEBUG */
}

.action-button {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  min-width: 80px;
  height: 32px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.delete-button {
  background-color: #2a2a2a;
  border: 1px solid #404040;
  color: #ffffff;
}

.delete-button:hover:not(:disabled) {
  background-color: #d32f2f;
  border-color: #d32f2f;
}

.delete-button:disabled {
  background-color: #2a2a2a;
  border: 1px solid #404040;
  color: #666;
  cursor: not-allowed;
  opacity: 0.5;
}

.export-button {
  background-color: #2a2a2a;
  border: 1px solid #404040;
  color: #ffffff;
}

.export-button:hover:not(:disabled) {
  background-color: #ec5002ee;
  border-color: #ec5002ee;
}

.export-button:disabled {
  background-color: #2a2a2a;
  border: 1px solid #404040;
  color: #666;
  cursor: not-allowed;
  opacity: 0.5;
}

.command-list-container {
  flex: 1;
  overflow: hidden;
  min-height: 400px;
  display: flex;
  flex-direction: column;
}
</style>