import Markdown, { type Components } from 'react-markdown'

const components: Components = {
  h1: ({ children }) => <h3 className="mt-6 text-xl font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-6 text-lg font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-5 font-semibold">{children}</h4>,
  p: ({ children }) => <p className="mt-3 text-orbit-muted">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-orbit-muted">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5 text-orbit-muted">{children}</ol>
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
  code: ({ children }) => (
    <code className="rounded bg-orbit-panel px-1.5 py-0.5 text-sm text-orbit-foreground">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-card bg-orbit-panel p-4 text-sm [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-orbit-foreground">{children}</strong>
  ),
  img: () => null,
}

/** Release notes are untrusted markdown; react-markdown never renders raw HTML. */
export function ReleaseNotes({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <p className="text-orbit-muted">No release notes for this version.</p>
  }
  return <Markdown components={components}>{markdown}</Markdown>
}
