import Fuse, { type IFuseOptions } from 'fuse.js'

export interface Command {
  id: number
  title: string
  body: string
  description: string
  tags: string
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

export function fuzzySearchCommands(
  commands: Command[],
  query: string
): Command[] {
  if (!query.trim()) {
    return commands
  }

  const fuse = new Fuse(commands, fuseOptions)
  const results = fuse.search(query)

  return results.map(result => result.item)
}
