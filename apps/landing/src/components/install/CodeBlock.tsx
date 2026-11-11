export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-card border border-orbit-border bg-orbit-panel p-4 text-sm">
      <code>{children}</code>
    </pre>
  )
}
