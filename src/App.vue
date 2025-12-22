<script setup lang="ts">
console.log('App.vue script is running')
// Import the ref function from Vue for creating reactive data
import { ref, computed, onMounted, onUnmounted } from 'vue'
import CommandModal from './components/CommandModal.vue'
import VariableInputModal from './components/VariableInputModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import HelpModal from './components/HelpModal.vue'
import DescriptionModal from './components/DescriptionModal.vue'
import { Copy, Edit, Trash2, HelpCircle, Settings, Anvil, CirclePlus } from 'lucide-vue-next'
import { VList } from 'virtua/vue'
import { extractVariables, substituteVariables, hasVariables, type VariableValues } from './utils/variables'
import { exportCommands, importCommands, validateExportData, generateExportFilename } from './utils/importExport'
import { parseSearchQuery, filterCommandsBySearch, type SearchFilter } from './utils/searchParser'
import { autocompleteSearchQuery } from './utils/autocomplete'
import { getAllTags } from './utils/tags'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'

type Command = {
  id: number
  title: string
  body: string
  description: string
  tags: string
  language: string
  created_at: string
  updated_at: string
}

// Platform detection - use the synchronous platform property
const isWindows = ref(false)
const isMaximized = ref(false)

// Safely detect platform
try {
  if (window.electronAPI && window.electronAPI.platform) {
    isWindows.value = window.electronAPI.platform === 'win32'
    console.log('Platform detected:', window.electronAPI.platform, 'isWindows:', isWindows.value)
  } else {
    console.warn('electronAPI not available')
  }
} catch (error) {
  console.error('Error detecting platform:', error)
}

// Window control functions
const minimizeWindow = async () => {
  if ((window.electronAPI as any)?.window) {
    await (window.electronAPI as any).window.minimize()
  }
}

const maximizeWindow = async () => {
  if ((window.electronAPI as any)?.window) {
    await (window.electronAPI as any).window.maximize()
    // Update maximized state after toggling
    isMaximized.value = await (window.electronAPI as any).window.isMaximized()
  }
}

const closeWindow = async () => {
  if ((window.electronAPI as any)?.window) {
    await (window.electronAPI as any).window.close()
  }
}

// Check maximized state on mount (only for Windows)
const checkMaximizedState = async () => {
  if (isWindows.value && (window.electronAPI as any)?.window) {
    isMaximized.value = await (window.electronAPI as any).window.isMaximized()
  }
}

// Create a reactive variable to store the search text
  // ref() makes the variable reactive - when it changes, the UI updates
const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement>()

// Search filter dropdown state
const showFilterDropdown = ref(false)

// Create a reactive array to store our sample commands for testing. I will connect this later with the DB.
const commands = ref<Command[]>([])
 // Modal state
const showModal = ref(false)
const modalMode = ref<'add' | 'edit'>('add')
const selectedCommandForEdit = ref<Command | null>(null)

// Variable input modal state
const showVariableModal = ref(false)
const currentVariables = ref<string[]>([])
const pendingCommand = ref<string>('')

// Settings modal state
const showSettingsModal = ref(false)

// Help modal state
const showHelpModal = ref(false)

// Description modal state
const showDescriptionModal = ref(false)
const descriptionModalTitle = ref('')
const descriptionModalContent = ref('')

// Notification state
const notificationMessage = ref('')
const showNotification = ref(false)
let notificationTimeout: number | null = null

// Show notification function
const showNotificationToast = (message: string, duration = 2000) => {
  // Clear any existing timeout
  if (notificationTimeout) {
    clearTimeout(notificationTimeout)
  }

  notificationMessage.value = message
  showNotification.value = true

  notificationTimeout = window.setTimeout(() => {
    showNotification.value = false
  }, duration)
}
//Load commands from database
const loadCommands = async () => {
  try {
    // call the API to get all commands
    const dbCommands = await window.electronAPI.database.getAllCommands()
    commands.value = dbCommands
    console.log('Commands loaded from database:', dbCommands.length)
  }catch(error){
    console.error('Error loading commands from database:', error)
  }
} // Load commands when the component is mounted

// Store click handler so we can remove it on unmount
const outsideClickHandler = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const filterContainer = target.closest('.search-container')
  if (!filterContainer && showFilterDropdown.value) {
    showFilterDropdown.value = false
  }
}

onMounted(() => {
  loadCommands()
  checkMaximizedState()
  //keyboard event listener
  document.addEventListener('keydown', handleKeyboard)

  // Add click listener to close filter dropdown when clicking outside
  document.addEventListener('click', outsideClickHandler)

  // Listen for window-shown event from main process
  if (window.electronAPI) {
    window.electronAPI.onWindowShown(() => {
      // Clear search and focus input when window is shown via global hotkey
      searchQuery.value = ''
      selectedCommandId.value = null
      showFilterDropdown.value = false

      // Focus the search input
      setTimeout(() => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      }, 100)
    })
  }
})

// Cleanup event listeners on unmount
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard)
  document.removeEventListener('click', outsideClickHandler)
})
//filters commands based on search input with prefix support
const filteredCommands = computed(() => {
  if (!searchQuery.value) {
    return commands.value;
  }

  const parsedSearch = parseSearchQuery(searchQuery.value)
  return filterCommandsBySearch(commands.value, parsedSearch)
})

// Add filter syntax to search input
const addFilter = (type: SearchFilter['type']) => {
  const currentSearch = searchQuery.value.trim()

  // Check if this filter type already exists in the current search
  const parsedSearch = parseSearchQuery(currentSearch)
  const existingFilterTypes = parsedSearch.filters.map(f => f.type)

  if (existingFilterTypes.includes(type)) {
    // Filter type already exists, do nothing
    showFilterDropdown.value = false
    return
  }

  // Add pipe separator if there's already content
  const prefix = currentSearch ? ' | ' : ''
  const filterText = `${prefix}${type}:`

  // Append to search query
  searchQuery.value = currentSearch + filterText

  // Close dropdown
  showFilterDropdown.value = false

  // Focus the search input and position cursor after the colon
  setTimeout(() => {
    if (searchInputRef.value) {
      searchInputRef.value.focus()
      const cursorPos = searchQuery.value.length
      searchInputRef.value.setSelectionRange(cursorPos, cursorPos)
    }
  }, 0)
}


// Toggle filter dropdown
const toggleFilterDropdown = () => {
  showFilterDropdown.value = !showFilterDropdown.value
}

// Close dropdown when clicking outside
const closeFilterDropdown = () => {
  showFilterDropdown.value = false
}

// Check if a filter type is already active in the search
const isFilterTypeActive = (type: SearchFilter['type']) => {
  const currentSearch = searchQuery.value.trim()
  if (!currentSearch) return false

  // Split by pipe and check each segment
  const segments = currentSearch.split('|').map(s => s.trim())
  return segments.some(segment => segment.startsWith(`${type}:`))
}

// Check if any filter is active
const hasActiveFilters = computed(() => {
  const currentSearch = searchQuery.value.trim()
  if (!currentSearch) return false

  // Split by pipe and check if any segment has a filter prefix
  const segments = currentSearch.split('|').map(s => s.trim())
  return segments.some(segment => /^(tag|title|body):/.test(segment))
})


// Handle search input autocomplete for tag: prefix
const handleSearchKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Tab') {
    const input = event.target as HTMLInputElement
    const cursorPosition = input.selectionStart || 0
    const availableTags = getAllTags(commands.value)

    const result = autocompleteSearchQuery(searchQuery.value, cursorPosition, availableTags)

    // Only prevent default if autocomplete succeeded
    if (result.wasCompleted && result.completed) {
      event.preventDefault()
      searchQuery.value = result.completed
      // Set cursor position after the completed tag
      setTimeout(() => {
        const newCursorPos = result.completed!.indexOf(result.suggestion!) + result.suggestion!.length
        input.setSelectionRange(newCursorPos, newCursorPos)
      }, 0)
    }
    // Otherwise, let Tab work normally (browser focus management)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    // Select first command if available
    if (filteredCommands.value.length > 0) {
      selectedCommandId.value = filteredCommands.value[0].id
      // Blur the search input
      const input = event.target as HTMLInputElement
      input.blur()
    }
  }
}

 console.log('✅ Vue setup completed', {
    searchQuery: searchQuery.value,
    commandsLength: commands.value.length
  })
// Function to copy command body to clipboard
const copyCommand = async (command: Command) => {
  // Check if the command contains variables
  if (hasVariables(command.body)) {
    // Extract variables and show input modal
    const variables = extractVariables(command.body)
    currentVariables.value = variables
    pendingCommand.value = command.body
    pendingCommandLanguage.value = command.language
    showVariableModal.value = true
  } else {
    // No variables, copy directly
    await copyToClipboard(command.body, command.language)
  }
}

// Function to copy raw command with variables intact (for Shift+C)
const copyCommandTemplate = async (text: string, language: string) => {
  await copyToClipboard(text, language)
}

// Helper to strip HTML tags for plain text preview
const stripHtml = (html: string): string => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

// Get preview text for command body (strip HTML for richtext)
const getCommandPreview = (body: string, language: string): string => {
  if (language === 'richtext' || language === 'markdown') {
    return stripHtml(body)
  }
  return body
}

// Actual clipboard copy function with HTML generation
const copyToClipboard = async (text: string, language: string = 'plaintext') => {
  try {
    // Generate HTML based on language
    let html: string | undefined
    let plainText = text

    if (language === 'richtext') {
      // Rich text is already HTML from TipTap (TipTap sanitizes by default)
      // Sanitize for extra safety when copying to clipboard
      html = DOMPurify.sanitize(text)
      // Extract plain text from HTML for plain text clipboard
      plainText = stripHtml(html)
    } else if (language === 'markdown') {
      // Convert markdown to HTML and sanitize to prevent XSS in receiving apps
      const rawHtml = marked.parse(text, { async: false })
      html = DOMPurify.sanitize(rawHtml)
    } else if (language !== 'plaintext') {
      // Generate syntax highlighted HTML
      try {
        const highlighted = hljs.highlight(text, { language }).value
        html = `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
      } catch (error) {
        // Fallback to plain text if language not supported
        console.warn('Language not supported, copying as plain text:', language)
        html = undefined
      }
    }

    // Write to clipboard with both formats
    await window.electronAPI.clipboard.write({ text: plainText, html })
    console.log('Command copied to clipboard with format:', language)
    showNotificationToast('Copied to clipboard!')
  } catch (error) {
    console.error('Error copying command to clipboard:', error)
    showNotificationToast('Failed to copy')
  }
}

// Variable for storing language of pending command
const pendingCommandLanguage = ref('plaintext')

// Handle variable input submission
const handleVariableSubmit = async (values: VariableValues) => {
  try {
    const processedCommand = substituteVariables(pendingCommand.value, values)
    await copyToClipboard(processedCommand, pendingCommandLanguage.value)
    showVariableModal.value = false

    // Clear state
    currentVariables.value = []
    pendingCommand.value = ''
    pendingCommandLanguage.value = 'plaintext'
  } catch (error) {
    console.error('Error processing variables:', error)
  }
}

// Handle variable input cancellation
const handleVariableCancel = () => {
  showVariableModal.value = false

  // Clear state
  currentVariables.value = []
  pendingCommand.value = ''
  pendingCommandLanguage.value = 'plaintext'
}

// Export functionality
const handleExport = async (filterTags: string[]) => {
  try {
    console.log('Exporting commands with tags:', filterTags)

    // Export commands with filtering
    const exportData = exportCommands(commands.value, filterTags)
    const filename = generateExportFilename(filterTags)

    // Show save dialog
    const result = await window.electronAPI.file.saveDialog(filename)
    if (result.success && result.filePath) {
      // Write file
      const writeResult = await window.electronAPI.file.writeFile(result.filePath, JSON.stringify(exportData, null, 2))
      if (writeResult.success) {
        console.log('Export successful:', result.filePath)
        alert(`Successfully exported ${exportData.total_commands} commands!`)
      } else {
        console.error('Export failed:', writeResult.error)
        alert('Failed to save export file')
      }
    }
  } catch (error) {
    console.error('Export error:', error)
    alert('Export failed: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// Import functionality
const handleImport = async () => {
  try {
    console.log('Starting import process')

    // Show open dialog
    const result = await window.electronAPI.file.openDialog()
    if (result.success && result.filePath) {
      // Read file
      const readResult = await window.electronAPI.file.readFile(result.filePath)
      if (readResult.success && readResult.content) {
        // Parse and validate JSON
        const importData = JSON.parse(readResult.content)
        validateExportData(importData)

        // Convert to database format
        const commandsToImport = importCommands(importData)

        // Add commands to database
        let successCount = 0
        let errorCount = 0

        for (const command of commandsToImport) {
          try {
            const addResult = await window.electronAPI.database.addCommand(command)
            if (addResult.success) {
              successCount++
            } else {
              errorCount++
              console.error('Failed to add command:', command.title)
            }
          } catch (error) {
            errorCount++
            console.error('Error adding command:', error)
          }
        }

        // Reload commands and show results
        await loadCommands()

        if (successCount > 0) {
          alert(`Successfully imported ${successCount} commands!${errorCount > 0 ? ` (${errorCount} failed)` : ''}`)
        } else {
          alert('Import failed: No commands were imported')
        }

        // Close settings modal
        showSettingsModal.value = false
      } else {
        alert('Failed to read import file')
      }
    }
  } catch (error) {
    console.error('Import error:', error)
    alert('Import failed: ' + (error instanceof Error ? error.message : String(error)))
  }
}
// Function to delete a command by id
const deleteCommand = async (id: number) => {
  const selectedCommand = commands.value.find(cmd => cmd.id === id)
  if (!selectedCommand) return
  // Confirm deletion
  const confirmDelete = confirm(`Are you sure you want to delete the command: "${selectedCommand.title}"?\n\nThis action 
  cannot be undone.`)
  if (!confirmDelete){
    console.log('Command deletion cancelled')
    return
  }
  // Call the API to delete the command
  try {
    const result = await window.electronAPI.database.deleteCommand(id)
    if (result.success) {
      console.log('Command deleted successfully')
      showNotificationToast('Command deleted')
      // refresh the command list and clear selection
      await loadCommands()
      selectedCommandId.value = null
    } else {
      console.error('Failed to delete command:', result.error)
      showNotificationToast('Failed to delete command')
    }
  } catch (error) {
    console.error('Error deleting command:', error)
    showNotificationToast('Failed to delete command')
  }
}
  // Command editing functions
  const editCommand = async (id: number) => {
    const selectedCommand = commands.value.find(cmd => cmd.id === id)
    if (!selectedCommand) return

    selectedCommandForEdit.value = selectedCommand
    modalMode.value = 'edit'
    showModal.value = true
  }
  // Handle modal save
  const handleModalSave = async (formData: { title: string; body: string; description: string; tags: string; language: string }) =>
   {
    try {
      if (modalMode.value === 'edit' && selectedCommandForEdit.value) {
        // Update existing command
        const result = await window.electronAPI.database.updateCommand(selectedCommandForEdit.value.id,
  formData)
        if (result.success) {
          console.log('Command updated successfully')
          showNotificationToast('Command updated')
          await loadCommands()
        } else {
          console.error('Failed to update command:', result.error)
          showNotificationToast('Failed to update command')
        }
      } else {
        // Add new command
        const result = await window.electronAPI.database.addCommand(formData)
        if (result.success) {
          console.log('Command added successfully')
          showNotificationToast('Command added')
          await loadCommands()
        } else {
          console.error('Failed to add command:', result.error)
          showNotificationToast('Failed to add command')
        }
      }
      showModal.value = false
    } catch (error) {
      console.error('Error saving command:', error)
      showNotificationToast('Failed to save command')
    }
  }
  // Handle modal cancel
  const handleModalCancel = () => {
    showModal.value = false
    selectedCommandForEdit.value = null
  }
  
// keyboard Navigation and actions
const handleKeyboard = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement

  // Handle ESC first - it should always work to cancel/close things
  if (event.key === 'Escape') {
    event.preventDefault()
    // ESC priority: modals -> filter dropdown -> command selection -> blur input -> clear search
    if (showVariableModal.value) {
      handleVariableCancel()
    } else if (showModal.value) {
      handleModalCancel()
    } else if (showSettingsModal.value) {
      showSettingsModal.value = false
    } else if (showHelpModal.value) {
      showHelpModal.value = false
    } else if (showDescriptionModal.value) {
      showDescriptionModal.value = false
    } else if (showFilterDropdown.value) {
      showFilterDropdown.value = false
    } else if (selectedCommandId.value !== null) {
      selectedCommandId.value = null
    } else if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      ;(target as HTMLInputElement).blur()
    } else if (searchQuery.value) {
      searchQuery.value = ''
    }
    return
  }

  // Handle Cmd/Ctrl+F to focus search bar
  if (event.key === 'f' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    selectedCommandId.value = null // Deselect command
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
    return
  }

  // Don't process hotkeys when modal is open or filter dropdown is open
  if (showModal.value || showVariableModal.value || showSettingsModal.value || showHelpModal.value || showDescriptionModal.value || showFilterDropdown.value) return

  // Don't process hotkeys when user is typing in an input field
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

  if (filteredCommands.value.length === 0) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    //find current selected index
    const currentIndex = filteredCommands.value.findIndex(cmd => cmd.id === selectedCommandId.value)
    const nextIndex = Math.min(currentIndex + 1, filteredCommands.value.length - 1)
    selectedCommandId.value = filteredCommands.value[nextIndex].id
    }else if (event.key === 'ArrowUp') {
    event.preventDefault()
    const currentIndex = filteredCommands.value.findIndex(cmd => cmd.id === selectedCommandId.value)
    const prevIndex = Math.max(currentIndex - 1, 0)
    selectedCommandId.value = filteredCommands.value[prevIndex].id
    }else if (event.key === 'c' && !event.shiftKey){
    event.preventDefault()
    const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
    if (selectedCommand) {
      copyCommand(selectedCommand)
    }
    }else if (event.key === 'C' && event.shiftKey){
    event.preventDefault()
    const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
    if (selectedCommand) {
      copyCommandTemplate(selectedCommand.body, selectedCommand.language)
    }
    }else if (event.key === 'e'){
    event.preventDefault()
    const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
    if (selectedCommand) {
      editCommand(selectedCommand.id)
    }
    }else if (event.key === 'n'){
    event.preventDefault()
    // Open modal in add mode
    selectedCommandForEdit.value = null
    modalMode.value = 'add'
    showModal.value = true
    }else if (event.key === 'Backspace'){
      event.preventDefault()
      const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
      if (selectedCommand) {
        deleteCommand(selectedCommand.id)
      }
    }
}

// To track which command is selected
const selectedCommandId = ref<number | null>(null);

// Configure marked for better markdown support (used in modal)
marked.setOptions({
  breaks: true,
  gfm: true
})

// Get plain text from markdown description for tooltip (strip markdown syntax)
const getDescriptionTooltip = (description: string): string => {
  if (!description) return ''
  // Strip markdown syntax for plain text display
  let plainText = description
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold**
    .replace(/\*(.+?)\*/g, '$1')      // *italic*
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')  // [text](url)
    .replace(/`(.+?)`/g, '$1')        // `code`
    .replace(/^#+\s+/gm, '')          // # heading

  // Take first 100 characters or first 2 lines, whichever is shorter
  const lines = plainText.split('\n').slice(0, 2)
  const preview = lines.join(' ')
  return preview.length > 100 ? preview.substring(0, 100) + '...' : preview
}

// Open description modal
const openDescriptionModal = (title: string, description: string) => {
  descriptionModalTitle.value = title
  descriptionModalContent.value = description
  showDescriptionModal.value = true
}


</script>

<template>
  <div class="app-container">
    <!-- Custom title bar with integrated search and controls -->
    <div class="custom-titlebar">
      <!-- Left section: Traffic lights + App branding -->
      <div class="left-section">
        <div class="traffic-light-space"></div>
        <div class="app-branding">
          <h1 class="app-title">SnipForge</h1>
          <Anvil class="app-icon" :size="20" />
        </div>
      </div>

      <!-- Middle section: Search bar -->
      <div class="middle-section search-container">
        <div class="search-wrapper">
          <input type="text"
            ref="searchInputRef"
            placeholder="search commands..."
            v-model="searchQuery"
            @keydown="handleSearchKeyDown"
            @focus="selectedCommandId = null"
            class="search-input"
          />
          <button
            @click="toggleFilterDropdown"
            class="filter-button"
            title="Add filters"
            :class="{ active: hasActiveFilters }"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
            </svg>
          </button>

          <!-- Filter dropdown -->
          <div v-if="showFilterDropdown" class="filter-dropdown" @click.stop>
            <div class="filter-dropdown-header">
              <span>Add Filter</span>
              <button @click="closeFilterDropdown" class="close-btn">×</button>
            </div>

            <div class="filter-suggestions">
              <div class="filter-section">
                <div class="filter-section-title">Filter Types</div>
                <div class="filter-options">
                  <button
                    @click="addFilter('tag')"
                    class="filter-option"
                    :class="{ 'filter-active': isFilterTypeActive('tag') }"
                    :disabled="isFilterTypeActive('tag')"
                  >
                    tag: search by tags
                  </button>
                  <button
                    @click="addFilter('title')"
                    class="filter-option"
                    :class="{ 'filter-active': isFilterTypeActive('title') }"
                    :disabled="isFilterTypeActive('title')"
                  >
                    title: search in titles
                  </button>
                  <button
                    @click="addFilter('body')"
                    class="filter-option"
                    :class="{ 'filter-active': isFilterTypeActive('body') }"
                    :disabled="isFilterTypeActive('body')"
                  >
                    body: search in commands
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Right section: Control buttons -->
      <div class="right-section">
        <button class="add-button" @click="modalMode = 'add'; selectedCommandForEdit = null; showModal = true" title="Add new command (n)">
          <CirclePlus :size="18" />
        </button>
        <button class="help-button" @click="showHelpModal = true" title="Help">
          <HelpCircle :size="16" />
        </button>
        <button class="settings-button" @click="showSettingsModal = true" title="Settings">
          <Settings :size="18" />
        </button>

        <!-- Windows window controls -->
        <div v-if="isWindows" class="window-controls">
          <button class="window-control-btn minimize-btn" @click="minimizeWindow" title="Minimize">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="0" y="5" width="12" height="2" fill="currentColor"/>
            </svg>
          </button>
          <button class="window-control-btn maximize-btn" @click="maximizeWindow" :title="isMaximized ? 'Restore' : 'Maximize'">
            <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="1" width="10" height="10" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
            <svg v-else width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="0" width="10" height="10" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <rect x="0" y="2" width="10" height="10" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
          </button>
          <button class="window-control-btn close-btn-window" @click="closeWindow" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M 1,1 L 11,11 M 11,1 L 1,11" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Main content area -->
    <div class="main-content">
      <!-- Virtual scrolling container for search results -->
      <VList
        class="results"
        :data="filteredCommands"
      >
        <template #default="{ item: command, index }">
          <div
            class="command-item"
            :class="{'selected': selectedCommandId === command.id}"
            :tabindex="selectedCommandId === command.id || (selectedCommandId === null && index === 0) ? 0 : -1"
            @click="selectedCommandId = command.id"
            @focus="selectedCommandId = command.id"
          >
            <div class="command-content">
              <div class="command-title-row">
                <span class="command-title">{{ command.title }}</span>
                <button
                  v-if="command.description"
                  class="info-icon"
                  @click.stop="openDescriptionModal(command.title, command.description)"
                  tabindex="-1"
                  :title="getDescriptionTooltip(command.description)"
                >
                  <HelpCircle :size="14" />
                </button>
              </div>
              <div class="command-body">{{ getCommandPreview(command.body, command.language) }}</div>
            </div>
            <div class="command-actions">
              <button @click.stop="copyCommand(command)" tabindex="-1" title="Copy command">
                <Copy :size="16" />
              </button>
              <button @click.stop="editCommand(command.id)" tabindex="-1" title="Edit command">
                <Edit :size="16" />
              </button>
              <button @click.stop="deleteCommand(command.id)" tabindex="-1" title="Delete command">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </template>
      </VList>
    </div>

    <!-- Command Modal -->
    <CommandModal
      :show="showModal"
      :mode="modalMode"
      :command="selectedCommandForEdit"
      :commands="commands"
      @save="handleModalSave"
      @cancel="handleModalCancel"
    />

    <!-- Variable Input Modal -->
    <VariableInputModal
      :show="showVariableModal"
      :variables="currentVariables"
      @submit="handleVariableSubmit"
      @cancel="handleVariableCancel"
    />

    <!-- Settings Modal -->
    <SettingsModal
      :show="showSettingsModal"
      :commands="commands"
      @export="handleExport"
      @import="handleImport"
      @cancel="showSettingsModal = false"
    />

    <!-- Help Modal -->
    <HelpModal
      :show="showHelpModal"
      @cancel="showHelpModal = false"
    />

    <!-- Description Modal -->
    <DescriptionModal
      :show="showDescriptionModal"
      :title="descriptionModalTitle"
      :description="descriptionModalContent"
      @cancel="showDescriptionModal = false"
    />

    <!-- Notification Toast -->
    <Transition name="toast">
      <div v-if="showNotification" class="notification-toast">
        {{ notificationMessage }}
      </div>
    </Transition>
  </div>
</template>

<style>
/* Make parent elements pass-through containers */
html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* Hide default system scrollbars */
* {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

*::-webkit-scrollbar {
  display: none; /* Webkit browsers */
}

/* App container */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #181818;
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

/* Titlebar */
.custom-titlebar {
  height: 64px;
  display: flex;
  align-items: stretch;
  padding: 0;
  border-bottom: 1px solid #282828;
  -webkit-app-region: drag;
}

/* Left section */
.left-section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
  width: auto;
  padding: 0 12px;
  gap: 3px;
  flex-shrink: 0;
}

/* Traffic lights area */
.traffic-light-space {
  width: 70px;
  height: 20px;
  flex-shrink: 0;
}

/* App title and icon */
.app-branding {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  width: auto;
  flex-shrink: 0;
}

.app-title {
  margin-left: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #ffffff;
  align-self: left;
}

.app-icon {
  color: #ec5002ee;
  flex-shrink: 0;
}

/* Search section */
.middle-section {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.search-container {
  position: relative;
  padding: 0 0.5%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}


.search-input {
  width: 320px;
  height: 36px;
  margin: 2px 0 0 0;
  padding: 0 12px;
  background: #2a2a2a;
  border: 1px solid #3e3e3e;
  border-radius: 18px;
  color: #ffffff;
  font-size: 0.875rem;
  outline: none;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.filter-button {
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
  border: 1px solid #3e3e3e;
  -webkit-app-region: no-drag;
}

.filter-button:hover {
  background: #3a3a3a;
  color: #ffffff;
}

.filter-button.active {
  background: #ec5002ee;
  color: #ffffff;
  border-color: #ec5002ee;
}

.filter-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  margin-top: 4px;
  max-width: 400px;
}

.filter-dropdown-header {
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

.filter-suggestions {
  padding: 8px;
}

.filter-section {
  margin-bottom: 16px;
}

.filter-section:last-child {
  margin-bottom: 8px;
}

.filter-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #999;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-option {
  background: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 16px;
  padding: 6px 12px;
  color: #ffffff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-option:hover:not(:disabled) {
  background: #ec5002ee;
  border-color: #ec5002ee;
}

.filter-option:disabled,
.filter-option.filter-active {
  background: #ec5002ee;
  border-color: #ec5002ee;
  color: #ffffff;
  cursor: not-allowed;
}



.search-input:focus {
  border-color: #ec5002ee;
  background: #333333;
}

.search-input::placeholder {
  color: #b3b3b3;
}

/* Controls section */
.right-section {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 100%;
  width: auto;
  padding: 0 0.5%;
  flex-shrink: 0;
}

/* Main content */
.main-content {
  flex: 1;
  padding: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Control buttons */
.add-button,
.help-button,
.settings-button {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: #ec5002ee;
  transition: all 0.2s;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  -webkit-app-region: no-drag;
}

.add-button:hover,
.help-button:hover,
.settings-button:hover {
  background-color: #2a2a2a;
  color: #ffffff;
}

/* Window controls (Windows only) */
.window-controls {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: 8px;
  -webkit-app-region: no-drag;
}

.window-control-btn {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: #ec5002ee;
  transition: all 0.2s;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  -webkit-app-region: no-drag;
}

.window-control-btn:hover {
  background-color: #2a2a2a;
  color: #ffffff;
}

/* Command list - Virtual scrolling container */
.results {
  flex: 1;
  overflow: hidden; /* VList handles scrolling internally */
  padding: 0;
  height: 100%; /* VList needs explicit height */
}

.command-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 1px;
  background: #1a1a1a;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.command-item:hover {
  background-color: #2a2a2a;
}

.command-item.selected {
  border-color: #ec5002ee;
}

/* Remove browser focus outline on commands - we use .selected class instead */
.command-item:focus {
  outline: none;
}

.command-content {
  flex: 1;
  min-width: 0;
}

.command-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  min-width: 0;
}

.command-title {
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-icon {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #b3b3b3;
  transition: all 0.2s;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.info-icon:hover {
  color: #ec5002ee;
  background-color: #2a2a2a;
}

.command-body {
  color: #b3b3b3;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.command-body :deep(*) {
  display: inline;
  margin: 0;
  padding: 0;
}

.command-body :deep(code) {
  background-color: #2a2a2a;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
}

.command-body :deep(strong) {
  font-weight: 600;
}

.command-body :deep(em) {
  font-style: italic;
}

.command-body :deep(a) {
  color: inherit;
  text-decoration: none;
  cursor: default;
  pointer-events: none;
}

.command-item.selected .command-body {
  color: #ffffff;
}

/* Command actions */
.command-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.command-item:hover .command-actions,
.command-item.selected .command-actions {
  opacity: 1;
}

.command-actions button {
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: #b3b3b3;
  transition: all 0.2s;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.command-actions button:hover {
  background-color: #3e3e3e;
  color: #ffffff;
}

/* Shared modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: #2d2d2d;
  border-radius: 12px;
  width: 90vw;
  max-width: 600px;
  max-height: 90vh;
  border: 1px solid #404040;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #404040;
}

.modal-header h2 {
  margin: 0;
  color: #ffffff;
  font-size: 18px;
  font-weight: 600;
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
}

.close-button:hover {
  background-color: #404040;
  color: #ffffff;
}

.modal-body {
  padding: 24px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #404040;
}

/* Form elements */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #ffffff;
  font-weight: 500;
  font-size: 14px;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 12px;
  margin: 0;
  border: 1px solid #404040;
  border-radius: 8px;
  background-color: #1a1a1a;
  color: #ffffff;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
  display: block;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #ec5002ee;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

/* Modal buttons */
.cancel-button,
.save-button {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
}

.cancel-button {
  background-color: #404040;
  color: #ffffff;
}

.cancel-button:hover {
  background-color: #505050;
}

.save-button {
  background-color: #ec5002ee;
  color: #ffffff;
}

.save-button:hover {
  background-color: #d64502;
}

/* Notification Toast */
.notification-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #2d2d2d;
  color: #ffffff;
  padding: 12px 24px;
  border-radius: 8px;
  border: 1px solid #404040;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  pointer-events: none;
}

/* Toast transition animations */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
</style>
