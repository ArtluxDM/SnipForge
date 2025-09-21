/**
 * Utility functions for tag autocomplete functionality
 */

import { normalizeTag, suggestTags } from './tags'
import { parseSearchQuery } from './searchParser'

export interface AutocompleteOptions {
  /** Separator used between tags (default: ',') */
  separator?: string
  /** Maximum number of suggestions to consider (default: 1) */
  maxSuggestions?: number
  /** Whether to add separator after completion (default: true) */
  addSeparatorAfterCompletion?: boolean
}

/**
 * Performs autocomplete on a multi-tag input string
 *
 * @param input - Current input value (e.g., "github,docker,sys")
 * @param availableTags - Array of existing tags to suggest from
 * @param options - Autocomplete configuration options
 * @returns Object with completed input and metadata
 *
 * @example
 * const result = autocompleteTagInput("github,docker,sys", ["system", "docker", "github"])
 * // Returns: { completed: "github,docker,system,", wasCompleted: true, suggestion: "system" }
 */
export function autocompleteTagInput(
  input: string,
  availableTags: string[],
  options: AutocompleteOptions = {}
): {
  completed: string
  wasCompleted: boolean
  suggestion: string | null
  originalLastTag: string
} {
  const {
    separator = ',',
    maxSuggestions = 1,
    addSeparatorAfterCompletion = true
  } = options

  // Handle empty input
  if (!input.trim()) {
    return {
      completed: input,
      wasCompleted: false,
      suggestion: null,
      originalLastTag: ''
    }
  }

  // Split tags and get the last (potentially incomplete) one
  const tags = input.split(separator).map(tag => tag.trim())
  const lastTag = tags[tags.length - 1]
  const completedTags = tags.slice(0, -1)

  // Find suggestions for the last tag
  const suggestions = suggestTags(lastTag, availableTags, maxSuggestions)

  if (suggestions.length === 0 || suggestions[0] === normalizeTag(lastTag)) {
    // No suggestions or already complete
    return {
      completed: input,
      wasCompleted: false,
      suggestion: null,
      originalLastTag: lastTag
    }
  }

  // Use the best suggestion
  const bestSuggestion = suggestions[0]

  // Reconstruct the input with the completed tag
  const newTags = [...completedTags, bestSuggestion]
  let completed = newTags.join(`${separator} `)

  // Add separator after completion for easy continuation
  if (addSeparatorAfterCompletion) {
    completed += `${separator} `
  }

  return {
    completed,
    wasCompleted: true,
    suggestion: bestSuggestion,
    originalLastTag: lastTag
  }
}

/**
 * Extracts the current tag being typed from a multi-tag input
 *
 * @param input - Current input value
 * @param cursorPosition - Current cursor position in the input
 * @param separator - Tag separator (default: ',')
 * @returns The tag currently being typed
 *
 * @example
 * getCurrentTag("github,docker,sys", 17, ",") // Returns: "sys"
 */
export function getCurrentTag(
  input: string,
  cursorPosition: number,
  separator: string = ','
): string {
  const beforeCursor = input.substring(0, cursorPosition)
  const lastSeparatorIndex = beforeCursor.lastIndexOf(separator)

  if (lastSeparatorIndex === -1) {
    return beforeCursor.trim()
  }

  return beforeCursor.substring(lastSeparatorIndex + 1).trim()
}

/**
 * Gets autocomplete suggestion for the tag at cursor position
 *
 * @param input - Current input value
 * @param cursorPosition - Current cursor position
 * @param availableTags - Array of existing tags
 * @param separator - Tag separator (default: ',')
 * @returns Suggestion for the current tag or null
 */
export function getTagSuggestionAtCursor(
  input: string,
  cursorPosition: number,
  availableTags: string[],
  separator: string = ','
): string | null {
  const currentTag = getCurrentTag(input, cursorPosition, separator)
  const suggestions = suggestTags(currentTag, availableTags, 1)

  return suggestions.length > 0 && suggestions[0] !== normalizeTag(currentTag)
    ? suggestions[0]
    : null
}

/**
 * Gets inline suggestion for autocomplete
 *
 * @param input - Current input value
 * @param cursorPosition - Current cursor position
 * @param availableTags - Array of existing tags
 * @param separator - Tag separator (default: ',')
 * @returns Object with suggestion text and positioning info
 */
export function getInlineSuggestion(
  input: string,
  cursorPosition: number,
  availableTags: string[],
  separator: string = ','
): {
  suggestion: string | null
  completionText: string | null
  beforeCursor: string
  afterCursor: string
  currentTag: string
  isAtEndOfTag: boolean
} {
  const beforeCursor = input.substring(0, cursorPosition)
  const afterCursor = input.substring(cursorPosition)

  // Find the current tag being typed
  const lastSeparatorIndex = beforeCursor.lastIndexOf(separator)
  const currentTag = lastSeparatorIndex === -1
    ? beforeCursor.trim()
    : beforeCursor.substring(lastSeparatorIndex + 1).trim()

  // Check if cursor is at the end of the current tag
  const nextSeparatorIndex = afterCursor.indexOf(separator)
  const textUntilNextSeparator = nextSeparatorIndex === -1 ? afterCursor : afterCursor.substring(0, nextSeparatorIndex)
  const isAtEndOfTag = textUntilNextSeparator.trim() === ''

  // Only show suggestions if we're at the end of a tag and it's not empty
  if (!isAtEndOfTag || !currentTag) {
    return {
      suggestion: null,
      completionText: null,
      beforeCursor,
      afterCursor,
      currentTag,
      isAtEndOfTag
    }
  }

  // Get the best suggestion
  const suggestions = suggestTags(currentTag, availableTags, 1)

  if (suggestions.length === 0 || suggestions[0] === normalizeTag(currentTag)) {
    return {
      suggestion: null,
      completionText: null,
      beforeCursor,
      afterCursor,
      currentTag,
      isAtEndOfTag
    }
  }

  const suggestion = suggestions[0]
  const completionText = suggestion.substring(currentTag.length)

  return {
    suggestion,
    completionText,
    beforeCursor,
    afterCursor,
    currentTag,
    isAtEndOfTag
  }
}

/**
 * Validates that autocomplete is appropriate for the current input state
 *
 * @param input - Current input value
 * @param lastKeyPressed - The last key that was pressed
 * @returns Whether autocomplete should be triggered
 */
export function shouldTriggerAutocomplete(
  input: string,
  lastKeyPressed: string
): boolean {
  // Don't autocomplete on certain keys
  const skipKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
  if (skipKeys.includes(lastKeyPressed)) {
    return false
  }

  // Don't autocomplete if input is empty or only whitespace
  if (!input.trim()) {
    return false
  }

  return true
}

/**
 * Handles autocomplete for search queries with tag: prefix support
 * Only autocompletes tags when inside a tag: prefix
 */
export function autocompleteSearchQuery(
  input: string,
  cursorPosition: number,
  availableTags: string[]
): {
  completed: string | null
  wasCompleted: boolean
  suggestion: string | null
} {
  // Check if we're inside a tag: prefix
  const beforeCursor = input.substring(0, cursorPosition)
  const tagPrefixMatch = beforeCursor.match(/tag:([^|]*)$/)

  if (!tagPrefixMatch) {
    return { completed: null, wasCompleted: false, suggestion: null }
  }

  const tagPrefixStart = beforeCursor.lastIndexOf('tag:') + 4

  // Find if we're in the middle of comma-separated tags (within this tag filter)
  const afterTag = beforeCursor.substring(tagPrefixStart)
  const lastCommaIndex = afterTag.lastIndexOf(',')
  const currentTag = lastCommaIndex === -1 ? afterTag : afterTag.substring(lastCommaIndex + 1)

  // Get suggestions for current tag
  const suggestions = suggestTags(currentTag.trim(), availableTags, 1)

  if (suggestions.length === 0 || suggestions[0] === normalizeTag(currentTag.trim())) {
    return { completed: null, wasCompleted: false, suggestion: null }
  }

  const suggestion = suggestions[0]

  // Build the completed input
  const beforeTagPrefix = input.substring(0, tagPrefixStart - 4) // -4 to exclude 'tag:'
  const afterCursor = input.substring(cursorPosition)

  // Replace the current tag with the suggestion
  let tagsInPrefix = afterTag
  if (lastCommaIndex === -1) {
    tagsInPrefix = suggestion
  } else {
    tagsInPrefix = afterTag.substring(0, lastCommaIndex + 1) + suggestion
  }

  const completed = beforeTagPrefix + 'tag:' + tagsInPrefix + afterCursor

  return {
    completed,
    wasCompleted: true,
    suggestion
  }
}