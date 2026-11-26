import type { MDXComponents } from 'mdx/types'
import type { ReactNode } from 'react'

/** A highlighted aside inside an article. */
function Callout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="orbit-glass my-8 rounded-[20px] border-l-2 border-orange-400/70 p-5 text-sm leading-7 [&_p]:mt-0">
      {title ? (
        <p className="!mt-0 font-semibold text-orbit-foreground">{title}</p>
      ) : null}
      <div className="mt-1 text-orbit-muted">{children}</div>
    </aside>
  )
}

const components: MDXComponents = {
  h2: ({ children }) => (
    <h2 className="mt-14 scroll-mt-28 text-2xl font-medium tracking-[-0.03em] text-orbit-foreground sm:text-3xl">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-10 text-xl font-medium text-orbit-foreground">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mt-5 text-base leading-8 text-white/75">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mt-5 list-disc space-y-3 pl-6 text-base leading-8 text-white/75 marker:text-orange-400">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-5 list-decimal space-y-3 pl-6 text-base leading-8 text-white/75 marker:text-orange-400">
      {children}
    </ol>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-orbit-accent underline decoration-orange-400/40 underline-offset-4 transition hover:text-orbit-focus"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-orbit-foreground">{children}</strong>
  ),
  code: ({ children }) => (
    <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.85em] text-orange-200">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="orbit-glass mt-6 overflow-x-auto rounded-[16px] !bg-black/40 p-4 text-sm [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-white/85">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-6 border-l-2 border-orange-400/60 pl-5 italic text-white/70">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-12 border-white/10" />,
  Callout,
}

export function useMDXComponents(): MDXComponents {
  return components
}
