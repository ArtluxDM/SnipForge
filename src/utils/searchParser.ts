export interface SearchFilter {
  type: 'tag' | 'title' | 'body' | 'all'
  value: string
}

export interface ParsedSearch {
  filters: SearchFilter[]
  hasFilters: boolean
}

/**
 * Parses search query and extracts prefix-based filters
 * Supports: tag:git, title:ssh, body:docker
 * Falls back to 'all' (title + body) for text without prefixes
 */
export function parseSearchQuery(query: string): ParsedSearch {
  if (!query.trim()) {
    return { filters: [], hasFilters: false }
  }

  const filters: SearchFilter[] = []

  // Split by pipe separator first
  const segments = query.split('|').map(s => s.trim())

  segments.forEach(segment => {
    if (!segment) return // Skip empty segments

    // Check if segment has a filter prefix
    const prefixMatch = segment.match(/^(tag|title|body):(.*)$/)

    if (prefixMatch) {
      const [, type, value] = prefixMatch
      const trimmedValue = value.trim()

      // Only add filters with non-empty values
      if (trimmedValue) {
        filters.push({
          type: type as 'tag' | 'title' | 'body',
          value: trimmedValue
        })
      }
    } else {
      // No prefix, treat as 'all' search
      filters.push({
        type: 'all',
        value: segment
      })
    }
  })

  return {
    filters,
    hasFilters: filters.length > 0
  }
}

/**
 * Filters commands based on parsed search filters
 * Uses AND logic - all filters must match
 */
export function filterCommandsBySearch<T extends {
  title: string
  body: string
  tags: string
}>(commands: T[], parsedSearch: ParsedSearch): T[] {
  if (!parsedSearch.hasFilters) {
    return commands
  }

  return commands.filter(command => {
    return parsedSearch.filters.every(filter => {
      const value = filter.value.toLowerCase()

      switch (filter.type) {
        case 'tag':
          // Parse tags from JSON string and check for tag matches with AND logic
          try {
            const commandTags = JSON.parse(command.tags) as string[]
            const searchTags = value.split(',').map(tag => tag.trim().toLowerCase())

            // Use AND logic - command must have ALL searched tags
            return searchTags.every(searchTag =>
              commandTags.some(commandTag =>
                commandTag.toLowerCase().includes(searchTag)
              )
            )
          } catch {
            return false
          }

        case 'title':
          return command.title.toLowerCase().includes(value)

        case 'body':
          return command.body.toLowerCase().includes(value)

        case 'all':
          return command.title.toLowerCase().includes(value) ||
                 command.body.toLowerCase().includes(value)

        default:
          return false
      }
    })
  })
}