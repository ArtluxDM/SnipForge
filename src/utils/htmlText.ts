const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'figcaption',
  'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
  'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
])

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);?/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase()

    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(codePoint) ? safeFromCodePoint(codePoint, match) : match
    }

    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(codePoint) ? safeFromCodePoint(codePoint, match) : match
    }

    return NAMED_ENTITIES[normalized] ?? match
  })
}

function safeFromCodePoint(codePoint: number, fallback: string): string {
  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return fallback
  }
}

function appendSeparator(output: string[]): void {
  if (output.length === 0 || output[output.length - 1] === ' ') {
    return
  }
  output.push(' ')
}

export function htmlToPreviewText(html: string): string {
  let source = String(html)
  source = source.replace(/<!--[\s\S]*?-->/g, ' ')
  source = source.replace(/<\s*(script|style|template|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')

  const output: string[] = []
  let index = 0

  while (index < source.length) {
    const nextTag = source.indexOf('<', index)

    if (nextTag === -1) {
      output.push(source.slice(index))
      break
    }

    if (nextTag > index) {
      output.push(source.slice(index, nextTag))
    }

    const tagEnd = source.indexOf('>', nextTag + 1)
    if (tagEnd === -1) {
      output.push(source.slice(nextTag))
      break
    }

    const rawTag = source.slice(nextTag + 1, tagEnd).trim()
    const tagName = rawTag.replace(/^\//, '').match(/^([a-z0-9:-]+)/i)?.[1]?.toLowerCase()
    if (tagName && BLOCK_TAGS.has(tagName)) {
      appendSeparator(output)
    }

    index = tagEnd + 1
  }

  return decodeHtmlEntities(output.join(''))
    .replace(/[\t\n\f\r ]+/g, ' ')
    .trim()
}
