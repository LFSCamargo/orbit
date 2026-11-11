export function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-orbit-border px-2 py-0.5 text-[0.7rem] text-orbit-accent">
      {children}
    </span>
  )
}
