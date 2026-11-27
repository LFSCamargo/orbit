import { Download } from 'lucide-react'
import { ReleaseNotesDialog, releasedOn } from '@/components/feedback/ReleaseNotesDialog'
import type { OrbitWineUpdate } from '@/types/runtime'

/**
 * Release notes for a newer Orbit Wine build, shown when Orbit opens. Download
 * installs it; Keep stays on the installed build; Back, Escape or the backdrop
 * close it until the next launch.
 */
export function OrbitWineUpdateModal({
  update,
  onAccept,
  onKeep,
  onLater,
}: {
  update: OrbitWineUpdate | null
  onAccept: () => void
  onKeep: () => void
  onLater: () => void
}) {
  const released = releasedOn(update?.publishedAt ?? null)
  return (
    <ReleaseNotesDialog
      id="orbit-wine-update"
      open={update !== null}
      eyebrow="Orbit Wine update"
      title="A better runtime for your games"
      fromVersion={update?.installedVersion ?? ''}
      toVersion={update?.version ?? ''}
      details={[
        update && `${Math.round(update.sizeBytes / 1_000_000)} MB download`,
        released && `Released ${released}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      notes={update?.notes ?? ''}
      releaseUrl={update?.releaseUrl}
      footnote="Games switch to the new build once it installs. Saves and installed games stay as they are, and Settings → Compatibility can switch back any time."
      primaryLabel="Download update"
      primaryIcon={<Download size={16} />}
      secondaryLabel={`Keep ${update?.installedVersion ?? ''}`}
      onPrimary={onAccept}
      onSecondary={onKeep}
      onDismiss={onLater}
    />
  )
}
