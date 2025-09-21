/**
 * Utility functions for tag management with normalization
 */

/**
 * Normalizes a tag by trimming whitespace and converting to lowercase
 *
 * @param tag - The tag to normalize
 * @returns Normalized tag
 *
 * @example
 * normalizeTag("  GitHub  ") // Returns: "github"
 * normalizeTag("Docker") // Returns: "docker"
 */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase()
}

/**
 * Normalizes an array of tags
 *
 * @param tags - Array of tags to normalize
 * @returns Array of normalized tags with duplicates removed
 *
 * @example
 * normalizeTags(["Git", " github ", "GIT"]) // Returns: ["git", "github"]
 */
export function normalizeTags(tags: string[]): string[] {
  const normalized = tags
    .map(normalizeTag)
    .filter(tag => tag.length > 0)

  // Remove duplicates
  return [...new Set(normalized)]
}

/**
 * Parses tags from JSON string with normalization
 *
 * @param tagsJson - JSON string containing tags array
 * @returns Array of normalized tags
 *
 * @example
 * parseTagsFromJson('["Git", "Docker"]') // Returns: ["git", "docker"]
 */
export function parseTagsFromJson(tagsJson: string): string[] {
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

/**
 * Converts normalized tags array back to JSON string
 *
 * @param tags - Array of normalized tags
 * @returns JSON string
 *
 * @example
 * tagsToJson(["git", "docker"]) // Returns: '["git","docker"]'
 */
export function tagsToJson(tags: string[]): string {
  const normalized = normalizeTags(tags)
  return JSON.stringify(normalized)
}

/**
 * Gets all unique tags from a list of commands
 *
 * @param commands - Array of commands with tags
 * @returns Array of all unique normalized tags
 */
export function getAllTags(commands: Array<{ tags: string }>): string[] {
  const allTags = new Set<string>()

  commands.forEach(command => {
    const tags = parseTagsFromJson(command.tags)
    tags.forEach(tag => allTags.add(tag))
  })

  return Array.from(allTags).sort()
}

/**
 * Filters commands by tags (case-insensitive)
 *
 * @param commands - Array of commands to filter
 * @param filterTags - Array of tags to filter by (if empty, returns all commands)
 * @returns Filtered commands that have at least one matching tag
 *
 * @example
 * filterCommandsByTags(commands, ["git"]) // Returns commands with "git" tag
 * filterCommandsByTags(commands, []) // Returns all commands
 */
export function filterCommandsByTags<T extends { tags: string }>(
  commands: T[],
  filterTags: string[]
): T[] {
  if (filterTags.length === 0) {
    return commands
  }

  const normalizedFilterTags = normalizeTags(filterTags)

  return commands.filter(command => {
    const commandTags = parseTagsFromJson(command.tags)
    return normalizedFilterTags.every(filterTag =>
      commandTags.includes(filterTag)
    )
  })
}

/**
 * Suggests tags based on partial input
 *
 * @param input - Partial tag input
 * @param existingTags - Array of existing tags to suggest from
 * @param maxSuggestions - Maximum number of suggestions to return
 * @returns Array of suggested tags
 *
 * @example
 * suggestTags("gi", ["git", "github", "docker"]) // Returns: ["git", "github"]
 */
export function suggestTags(
  input: string,
  existingTags: string[],
  maxSuggestions: number = 5
): string[] {
  const normalizedInput = normalizeTag(input)

  if (normalizedInput.length === 0) {
    return existingTags.slice(0, maxSuggestions)
  }

  const suggestions = existingTags.filter(tag =>
    tag.startsWith(normalizedInput)
  )

  return suggestions.slice(0, maxSuggestions)
}