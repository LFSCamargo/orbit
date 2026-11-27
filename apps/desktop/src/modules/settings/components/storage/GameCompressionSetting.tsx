import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { COMPRESSION_QUERY } from '@/hooks/useCompressionEvents'
import { formatBytes } from '@/lib/format'
import { getGameCompression, setGameCompression } from '@/lib/tauri'
import { notify } from '@/lib/toast'
import type { CompressionStatus } from '@/types/compression'
import { ROW_DESC, ROW_TITLE, SETTINGS_ROW } from '../settingsRowStyles'
import { STORAGE_CARD } from './styles'

const COPY = {
  on: {
    title: 'Compress your games?',
    description:
      'Orbit stores every installed game with Apple’s built-in file compression. Games run exactly as before and take less space on your Mac or SSD. Large libraries can take a while; games you are playing or downloading are compressed afterwards.',
    confirm: 'Compress games',
    busy: 'Starting…',
  },
  off: {
    title: 'Decompress your games?',
    description:
      'Every game goes back to its full size on disk. Make sure the drive has enough free space before you continue.',
    confirm: 'Decompress games',
    busy: 'Starting…',
  },
}

/** The status line under the switch. */
export function compressionSummary(status: CompressionStatus | undefined): string {
  if (!status) return 'Checking…'
  if (status.running)
    return status.compressing ? 'Compressing your games…' : 'Decompressing your games…'
  if (!status.enabled) return 'Off. Games are stored at full size.'
  return status.savedBytes > 0
    ? `On. Saved ${formatBytes(status.savedBytes)} in the last pass.`
    : 'On. New downloads and updates are compressed automatically.'
}

/** Settings → Storage switch that compresses or decompresses every game. */
export function GameCompressionSetting() {
  const client = useQueryClient()
  const status = useQuery({ queryKey: COMPRESSION_QUERY, queryFn: getGameCompression })
  const [asking, setAsking] = useState<'on' | 'off' | null>(null)
  const change = useMutation({
    mutationFn: (on: boolean) => setGameCompression(on),
    onSuccess: (next) => {
      client.setQueryData(COMPRESSION_QUERY, next)
      setAsking(null)
    },
    onError: (error) => {
      notify.error({
        title: 'Could not change game compression',
        message: error instanceof Error ? error.message : String(error),
      })
      setAsking(null)
    },
  })
  const enabled = status.data?.enabled ?? false
  const copy = asking ? COPY[asking] : COPY.on

  return (
    <section className={STORAGE_CARD} aria-labelledby="storage-compression-title">
      <div className={SETTINGS_ROW}>
        <div>
          <h3 id="storage-compression-title" className={ROW_TITLE}>
            Compress games
          </h3>
          <p id="storage-compression-help" className={ROW_DESC}>
            Use Apple’s transparent file compression to make installed games lighter on
            your Mac or SSD. New downloads and updates are compressed automatically.
          </p>
          <p className="m-0 mt-2 text-[12px] text-orbit-muted" role="status">
            {compressionSummary(status.data)}
          </p>
        </div>
        <Focusable
          focusId="storage-compression"
          group="settings-storage"
          order={1}
          noScale
          noRing
          role="switch"
          aria-checked={enabled}
          aria-labelledby="storage-compression-title"
          aria-describedby="storage-compression-help"
          disabled={!status.data || change.isPending}
          onClick={() => setAsking(enabled ? 'off' : 'on')}
          className={clsx(
            'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-sm transition-colors disabled:opacity-40',
            enabled ? 'bg-orbit-accent' : 'bg-white/20',
          )}
        >
          <span
            aria-hidden="true"
            className={clsx(
              'block size-4 rounded-full bg-white shadow-lg transition-transform',
              enabled ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </Focusable>
      </div>
      <ConfirmDialog
        open={asking !== null}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirm}
        busyLabel={copy.busy}
        busy={change.isPending}
        onCancel={() => setAsking(null)}
        onConfirm={() => change.mutate(asking === 'on')}
      />
    </section>
  )
}
