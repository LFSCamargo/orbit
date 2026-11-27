/** A block of release notes, ready to render as plain text. */
export type NoteBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }

const HEADING = /^#{1,6}\s+/
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/

/** Inline Markdown reduced to its text: links keep their label, emphasis and
 * code marks go. The result is rendered as text, never as HTML. */
export function plainInline(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(^|[^\w])(\*\*|__|\*|_|`)(\S(?:.*?\S)?)\2(?=[^\w]|$)/g, '$1$3')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Headings, paragraphs and bullet lists from release-note Markdown. Anything
 * else reads as a paragraph. O(n) over lines. */
export function parseReleaseNotes(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = []
  let paragraph: string[] = []
  let list: string[] | null = null
  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: 'paragraph', text: plainInline(paragraph.join(' ')) })
    if (list?.length) blocks.push({ kind: 'list', items: list })
    paragraph = []
    list = null
  }
  for (const line of markdown.split('\n')) {
    if (!line.trim()) {
      flush()
    } else if (HEADING.test(line)) {
      flush()
      blocks.push({ kind: 'heading', text: plainInline(line.replace(HEADING, '')) })
    } else if (BULLET.test(line)) {
      // A paragraph never holds an open list, so this only ends the paragraph.
      if (paragraph.length) flush()
      list = list ?? []
      list.push(plainInline(line.replace(BULLET, '')))
    } else if (list?.length && /^\s{2,}/.test(line)) {
      list[list.length - 1] = plainInline(`${list[list.length - 1]} ${line}`)
    } else {
      if (list?.length) flush()
      paragraph.push(line)
    }
  }
  flush()
  return blocks.filter((block) => block.kind === 'list' || block.text)
}
