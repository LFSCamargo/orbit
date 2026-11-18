import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import {
  listLibraryEntries,
  refreshSteamWindowsLibrary,
  scanNativeApps,
  scanSteamInstallations,
  scanSteamLibrary,
} from '@/lib/tauri'
import {
  scanPercent,
  summarizeFound,
  type ScanPhaseId,
  type ScanPhaseState,
} from '../lib/scanSummary'

export type ScanStatus = 'ready' | 'scanning' | 'complete' | 'empty' | 'error'

const WAITING: Record<ScanPhaseId, ScanPhaseState> = {
  paths: 'waiting',
  detect: 'waiting',
  details: 'waiting',
}

/** Settles every scan of a phase; the phase fails only when all of them did. */
async function runPhase(work: Promise<unknown>[]) {
  const results = await Promise.allSettled(work)
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  )
  return {
    ok: failures.length < results.length,
    error: failures[0] ? String(failures[0].reason) : '',
  }
}

/** The Scan step: library folders (Steam, Windows Steam), Mac apps, then
 * Steam account details, followed by a count of installed games by source.
 */
export function useOnboardingScan() {
  const queryClient = useQueryClient()
  const { status: steam } = useSteamWindows()
  const [status, setStatus] = useState<ScanStatus>('ready')
  const [phases, setPhases] = useState(WAITING)
  const [error, setError] = useState('')
  const [found, setFound] = useState<ReturnType<typeof summarizeFound>>({
    games: [],
    total: 0,
    bySource: [],
  })

  const mark = (id: ScanPhaseId, state: ScanPhaseState) =>
    setPhases((current) => ({ ...current, [id]: state }))

  /** Installed games in the library now; throws when it cannot be read. */
  const countFound = async () => {
    const summary = summarizeFound(
      (await listLibraryEntries({ view: 'installed', limit: 500 })).entries,
    )
    setFound(summary)
    return summary
  }

  const run = async () => {
    setStatus('scanning')
    setError('')
    setPhases(WAITING)

    mark('paths', 'running')
    const paths = await runPhase([scanSteamInstallations(), scanSteamLibrary()])
    mark('paths', paths.ok ? 'done' : 'failed')
    // "Found N games so far": a failed count waits for the final one.
    await countFound().catch(() => undefined)

    mark('detect', 'running')
    const detect = await runPhase([scanNativeApps()])
    mark('detect', detect.ok ? 'done' : 'failed')

    if (!paths.ok && !detect.ok) {
      setError(paths.error || detect.error)
      setStatus('error')
      return
    }

    mark('details', 'running')
    const details = steam.data?.signedIn
      ? await runPhase([refreshSteamWindowsLibrary()])
      : { ok: true }
    mark('details', details.ok ? 'done' : 'failed')

    await Promise.all(
      ['games', 'library', 'library-entry', 'steam-windows-library'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    )
    let summary: ReturnType<typeof summarizeFound>
    try {
      summary = await countFound()
    } catch (caught) {
      setError(String(caught))
      setStatus('error')
      return
    }
    setStatus(summary.total ? 'complete' : 'empty')
  }

  return { status, phases, percent: scanPercent(phases), error, found, run }
}
