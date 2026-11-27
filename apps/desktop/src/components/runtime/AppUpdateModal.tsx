import { RefreshCw } from 'lucide-react'
import { ReleaseNotesDialog, releasedOn } from '@/components/feedback/ReleaseNotesDialog'
import { DownloadProgress } from '@/components/ui/download-progress'
import type { DownloadTask } from '@/lib/downloadProgress'
import type { AppUpdate } from '@/types/runtime'

/**
 * A newer Orbit, shown when Orbit opens. Update downloads the signed release,
 * installs it and restarts Orbit; Later asks again next launch.
 */
export function AppUpdateModal({
  update,
  busy,
  task,
  error,
  onUpdate,
  onLater,
}: {
  update: AppUpdate | null
  busy: boolean
  task?: DownloadTask
  error?: string
  onUpdate: () => void
  onLater: () => void
}) {
  const released = releasedOn(update?.publishedAt ?? null)
  return (
    <ReleaseNotesDialog
      id="app-update"
      open={update !== null}
      eyebrow="Orbit update"
      title={`Orbit ${update?.version ?? ''} is here`}
      fromVersion={update?.currentVersion ?? ''}
      toVersion={update?.version ?? ''}
      details={released ? `Released ${released}` : ''}
      notes={update?.notes ?? ''}
      footnote="Orbit restarts to finish. Your library, games, saves and settings stay as they are."
      primaryLabel="Update and restart"
      primaryIcon={<RefreshCw size={16} />}
      secondaryLabel="Later"
      onPrimary={onUpdate}
      onSecondary={onLater}
      onDismiss={onLater}
      busy={busy}
      busyLabel="Updating…"
      progress={busy && task ? <DownloadProgress task={task} /> : undefined}
      error={error}
    />
  )
}
