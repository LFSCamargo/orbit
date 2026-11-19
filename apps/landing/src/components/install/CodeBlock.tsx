export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="orbit-glass mt-3 overflow-x-auto rounded-[16px] !bg-black/40 p-4 text-sm">
      <code>{children}</code>
    </pre>
  )
}
