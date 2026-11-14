import { Skeleton } from '@/components/ui/skeleton'

/** Fixed work independent of catalog size; placeholders never register focus targets. */
export function LibrarySkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}…</span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="aspect-square" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
