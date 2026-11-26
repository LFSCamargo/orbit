/** Plain text with `code` spans styled, for one-line summaries. */
export function InlineCodeText({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/g).map((part, index) =>
    part.length > 1 && part.startsWith('`') && part.endsWith('`') ? (
      <code
        key={index}
        className="rounded bg-white/[0.07] px-1 font-mono text-[0.85em] text-orange-200"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  )
}
