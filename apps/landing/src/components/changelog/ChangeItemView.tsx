import Markdown, { type Components } from 'react-markdown'
import { CodeIcon } from '@/components/ui/icons'
import type { ChangeItem } from '@/lib/changelog'
import { GITHUB_REPO } from '@/lib/site'

/** GitHub code search for an identifier in Orbit's repository. */
function codeSearchUrl(token: string): string {
  const query = encodeURIComponent(`repo:${GITHUB_REPO} "${token}"`)
  return `https://github.com/search?q=${query}&type=code`
}

const inline: Components = {
  p: ({ children }) => <p className="text-sm leading-7 text-white/70">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-orbit-foreground">{children}</strong>
  ),
  code: ({ children }) => (
    <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.82em] text-orange-200">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      rel="noopener noreferrer"
      className="text-orbit-accent hover:underline"
    >
      {children}
    </a>
  ),
  img: () => null,
}

const title: Components = {
  ...inline,
  p: ({ children }) => <>{children}</>,
}

/** One change: its lead-in, the explanation, and links to the code it names.
 * Changelog text is untrusted markdown; react-markdown never renders raw HTML. */
export function ChangeItemView({ item }: { item: ChangeItem }) {
  return (
    <li className="orbit-glass rounded-[18px] p-5">
      {item.title && (
        <h4 className="text-base font-medium text-orbit-foreground">
          <Markdown components={title}>{item.title}</Markdown>
        </h4>
      )}
      <div className={item.title ? 'mt-2' : undefined}>
        <Markdown components={inline}>{item.body}</Markdown>
      </div>
      {item.code.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Find in code">
          {item.code.slice(0, 6).map((token) => (
            <li key={token}>
              <a
                href={codeSearchUrl(token)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 font-mono text-[11px] text-white/65 transition hover:border-orange-400/50 hover:text-orange-200"
              >
                <CodeIcon className="h-3.5 w-3.5" />
                {token}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
