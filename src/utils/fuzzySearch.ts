import Fuse, { type IFuseOptions } from 'fuse.js'

export interface Command {
  id: number
  title: string
  body: string
  description: string
  tags: string
  tagsArray: string[] // Pre-parsed tags for performance
  tagsNormalized: string[] // Pre-normalized (lowercase) for filtering
  language: string
  created_at: string
  updated_at: string
}

const fuseOptions: IFuseOptions<Command> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'tags', weight: 1.5 },
    { name: 'description', weight: 1 },
    { name: 'body', weight: 0.5 }
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true
}

// Cache for Fuse.js instance to avoid recreation on every search
let cachedFuse: Fuse<Command> | null = null
let cachedCommands: Command[] | null = null

export function fuzzySearchCommands(
  commands: Command[],
  query: string
): Command[] {
  if (!query.trim()) {
    return commands
  }

  // Recreate Fuse instance only if commands array reference changed
  if (cachedCommands !== commands) {
    cachedFuse = new Fuse(commands, fuseOptions)
    cachedCommands = commands
  }

  const results = cachedFuse!.search(query)

  return results.map(result => result.item)
}
