import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useDownloadStore } from '@/lib/downloadProgress'
import { getCompatibilityCatalog, getComponentStatus, orbitWineStatus } from '@/lib/tauri'
import { useOrbitWineSetup } from '@/modules/settings/hooks/useOrbitWineSetup'
import { useComponentInstall } from '@/modules/settings/hooks/useComponentInstall'
import {
  buildSetupRows,
  rowStatus,
  setupSummary,
  type SetupRow,
  type SetupRowId,
} from '../lib/setupPlan'

/** What Setup reads; onboarding prefetches these before it shows. */
export const SETUP_QUERIES = {
  catalog: {
    queryKey: ['compatibility-catalog'],
    queryFn: () => getCompatibilityCatalog(),
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  },
  installed: { queryKey: ['component-status'], queryFn: getComponentStatus },
  orbitWine: { queryKey: ['orbit-wine'], queryFn: orbitWineStatus },
} as const

export type SetupPhase = 'loading' | 'ready' | 'installing' | 'failed' | 'complete'

/** The Setup step: which components to install, one run that installs them
 * in order (a failure does not stop the rest), and retrying only failures.
 * Installs go through the shared download store, so Settings and the
 * downloads sidebar show the same progress.
 */
export function useOnboardingSetup() {
  const catalog = useQuery(SETUP_QUERIES.catalog)
  const installed = useQuery(SETUP_QUERIES.installed)
  const orbitWine = useQuery(SETUP_QUERIES.orbitWine)
  const wine = useOrbitWineSetup()
  const components = useComponentInstall()
  const tasks = useDownloadStore((s) => s.tasks)
  const failures = useDownloadStore((s) => s.failures)

  const loading = catalog.isPending || installed.isPending || orbitWine.isPending
  const rows = useMemo(
    () =>
      buildSetupRows(
        catalog.data,
        installed.data ?? [],
        Boolean(orbitWine.data?.containerReady),
      ),
    [catalog.data, installed.data, orbitWine.data],
  )
  const [chosen, setChosen] = useState<Set<SetupRowId> | null>(null)
  const selectable = rows.filter((row) => row.available && !row.installed)
  const selected =
    chosen ??
    new Set(selectable.filter((row) => row.selectedByDefault).map((row) => row.id))
  const [run, setRun] = useState<SetupRowId[] | null>(null)
  const [queued, setQueued] = useState<Set<SetupRowId>>(new Set())
  const [running, setRunning] = useState(false)

  const statuses = new Map(
    rows.map((row) => [row.id, rowStatus(row, { tasks, failures, queued })]),
  )
  const summary = setupSummary(
    (run ?? []).map((id) => ({ id, status: statuses.get(id) ?? { kind: 'idle' } })),
  )

  const installRow = async (row: SetupRow) => {
    for (const part of row.parts) {
      if (part.orbitWine) await wine.install()
      else if (part.spec) await components.installCatalogComponent(part.spec)
      if (useDownloadStore.getState().failures[part.key]) return
    }
  }

  const start = async (ids: SetupRowId[]) => {
    if (running || !ids.length) return
    setRun((current) =>
      current && ids.every((id) => current.includes(id)) ? current : ids,
    )
    setQueued(new Set(ids))
    setRunning(true)
    for (const id of ids) {
      setQueued((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      const row = rows.find((candidate) => candidate.id === id)
      if (row) await installRow(row)
    }
    setRunning(false)
  }

  const phase: SetupPhase = loading
    ? 'loading'
    : running
      ? 'installing'
      : run && summary.failed.length
        ? 'failed'
        : run
          ? 'complete'
          : 'ready'

  return {
    phase,
    rows,
    statuses,
    selected,
    summary,
    catalogWarning: catalog.isError
      ? 'Orbit could not reach the component catalog. You can install these later in Settings → Compatibility.'
      : '',
    toggle: (id: SetupRowId) => {
      if (rows.find((row) => row.id === id)?.badge === 'required') return
      const next = new Set(selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setChosen(next)
    },
    install: () =>
      start(
        rows
          .filter((r) => selected.has(r.id) && r.available && !r.installed)
          .map((r) => r.id),
      ),
    retry: () => start(summary.failed),
  }
}
