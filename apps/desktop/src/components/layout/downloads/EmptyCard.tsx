import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'

/** The downloads sidebar's empty sections, in the app's shared empty state. */
export function EmptyCard({
  icon,
  title,
  copy,
}: {
  icon: LucideIcon
  title: string
  copy: string
}) {
  return <EmptyState size="sm" icon={icon} title={title} description={copy} />
}
