/**
 * Utility functions for importing and exporting commands
 */

import { filterCommandsByTags, normalizeTags, tagsToJson } from './tags'

// Security limits to prevent DoS attacks
const MAX_COMMANDS = 50000 // Maximum number of commands in a single import
const MAX_TITLE_LENGTH = 500 // Maximum title length in characters
const MAX_BODY_LENGTH = 1000000 // Maximum body length (1MB of text)
const MAX_DESCRIPTION_LENGTH = 10000 // Maximum description length

export interface ExportCommand {
  title: string
  body: string
  description: string
  tags: string[]
  language: string
  created_at: string
  updated_at: string
}

export interface ExportData {
  version: string
  exported_at: string
  total_commands: number
  commands: ExportCommand[]
  filter_tags?: string[]
}

export interface ImportCommand {
  title: string
  body: string
  description: string
  tags: string
  language: string
}

/**
 * Exports commands to a structured JSON format
 *
 * @param commands - Array of commands to export
 * @param filterTags - Optional array of tags to filter by
 * @returns ExportData object ready for JSON serialization
 */
export function exportCommands(
  commands: Array<{
    id: number
    title: string
    body: string
    description: string
    tags: string
    language: string
    created_at: string
    updated_at: string
  }>,
  filterTags: string[] = []
): ExportData {
  // Filter commands by tags if specified
  const filteredCommands = filterCommandsByTags(commands, filterTags)

  // Convert to export format
  const exportCommands: ExportCommand[] = filteredCommands.map(command => ({
    title: command.title,
    body: command.body,
    description: command.description || '',
    tags: parseTagsFromCommand(command.tags),
    language: command.language || 'plaintext',
    created_at: command.created_at,
    updated_at: command.updated_at
  }))

  const exportData: ExportData = {
    version: '2.0',
    exported_at: new Date().toISOString(),
    total_commands: exportCommands.length,
    commands: exportCommands
  }

  // Include filter tags if any were used
  if (filterTags.length > 0) {
    exportData.filter_tags = normalizeTags(filterTags)
  }

  return exportData
}

/**
 * Imports commands from export data format
 *
 * @param exportData - The imported export data
 * @returns Array of commands ready for database insertion
 */
export function importCommands(exportData: ExportData): ImportCommand[] {
  if (!exportData.commands || !Array.isArray(exportData.commands)) {
    throw new Error('Invalid export data: missing or invalid commands array')
  }

  return exportData.commands.map(command => {
    if (!command.title || !command.body) {
      throw new Error(`Invalid command: missing title or body`)
    }

    return {
      title: command.title.trim(),
      body: command.body.trim(),
      description: (command.description || '').trim(),
      tags: tagsToJson(command.tags || []),
      language: command.language || 'plaintext'
    }
  })
}

/**
 * Validates export data structure
 *
 * @param data - Data to validate
 * @returns True if valid, throws error if invalid
 */
export function validateExportData(data: any): data is ExportData {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid export data: not an object')
  }

  if (!data.version) {
    throw new Error('Invalid export data: missing version')
  }

  if (!data.commands || !Array.isArray(data.commands)) {
    throw new Error('Invalid export data: missing or invalid commands array')
  }

  // Security: Limit number of commands to prevent DoS
  if (data.commands.length > MAX_COMMANDS) {
    throw new Error(`Too many commands: ${data.commands.length} (maximum: ${MAX_COMMANDS})`)
  }

  // Validate each command
  data.commands.forEach((command: any, index: number) => {
    if (!command || typeof command !== 'object') {
      throw new Error(`Invalid command at index ${index}: not an object`)
    }

    if (!command.title || typeof command.title !== 'string') {
      throw new Error(`Invalid command at index ${index}: missing or invalid title`)
    }

    if (!command.body || typeof command.body !== 'string') {
      throw new Error(`Invalid command at index ${index}: missing or invalid body`)
    }

    if (command.tags && !Array.isArray(command.tags)) {
      throw new Error(`Invalid command at index ${index}: tags must be an array`)
    }

    // Security: Validate field lengths to prevent DoS
    if (command.title.length > MAX_TITLE_LENGTH) {
      throw new Error(`Command at index ${index}: title too long (${command.title.length} > ${MAX_TITLE_LENGTH})`)
    }

    if (command.body.length > MAX_BODY_LENGTH) {
      throw new Error(`Command at index ${index}: body too long (${command.body.length} > ${MAX_BODY_LENGTH})`)
    }

    if (command.description && typeof command.description === 'string' && command.description.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(`Command at index ${index}: description too long (${command.description.length} > ${MAX_DESCRIPTION_LENGTH})`)
    }

    // Validate language field if present
    if (command.language && typeof command.language !== 'string') {
      throw new Error(`Command at index ${index}: language must be a string`)
    }
  })

  return true
}

/**
 * Creates a downloadable blob from export data
 *
 * @param exportData - The export data to convert
 * @returns Blob object for download
 */
export function createExportBlob(exportData: ExportData): Blob {
  const jsonString = JSON.stringify(exportData, null, 2)
  return new Blob([jsonString], { type: 'application/json' })
}

/**
 * Generates a filename for export
 *
 * @param filterTags - Tags used for filtering (optional)
 * @returns Formatted filename
 */
export function generateExportFilename(filterTags: string[] = []): string {
  const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const tagsString = filterTags.length > 0 ? `_${filterTags.join('-')}` : ''
  return `snipforge-commands${tagsString}_${timestamp}.json`
}

/**
 * Helper function to parse tags from command JSON string
 */
function parseTagsFromCommand(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson)
    if (Array.isArray(parsed)) {
      return normalizeTags(parsed)
    }
    return []
  } catch {
    return []
  }
}