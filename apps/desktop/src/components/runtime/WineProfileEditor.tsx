import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { detectRuntimes } from '@/lib/tauri'
import type { WineProfile } from '@/types/runtime'
import { CompatibilityOverridesEditor } from './CompatibilityOverridesEditor'

const field =
  'mt-2 w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground'
export function WineProfileEditor({
  value,
  onChange,
}: {
  value: WineProfile
  onChange: (profile: WineProfile) => void
}) {
  const {
    data: runtimes = [],
    isPending,
    error,
  } = useQuery({ queryKey: ['runtimes'], queryFn: detectRuntimes, staleTime: 30000 })
  useEffect(() => {
    if (!value.runtimePath && runtimes[0])
      onChange({ ...value, runtimePath: runtimes[0].path })
  }, [runtimes, value, onChange])
  return (
    <section className="space-y-4" aria-label="Windows compatibility">
      <h2 className="font-display text-xl font-semibold">Windows compatibility</h2>
      <p className="text-sm text-orbit-muted">
        Orbit prepares a private Windows environment on first launch. Your game files stay
        where they are.
      </p>
      <label className="block text-sm text-orbit-muted">
        Compatibility runtime
        <select
          className={field}
          value={value.runtimePath}
          onChange={(e) => onChange({ ...value, runtimePath: e.target.value })}
        >
          <option value="">
            {isPending ? 'Detecting runtimes…' : 'Choose a runtime'}
          </option>
          {value.runtimePath && !runtimes.some((r) => r.path === value.runtimePath) && (
            <option value={value.runtimePath}>
              Saved runtime (currently unavailable)
            </option>
          )}
          {runtimes.map((r) => (
            <option key={r.path} value={r.path}>
              {r.version} — {r.path}
            </option>
          ))}
        </select>
      </label>
      {!isPending && !runtimes.length && (
        <p role="status" className="text-sm text-orbit-muted">
          Windows compatibility is not set up yet. Open Settings → Compatibility to
          install it automatically, or use Advanced runtime options for an existing
          installation.
        </p>
      )}
      {error && <p role="alert">{String(error)}</p>}
      <CompatibilityOverridesEditor
        value={value.compatibility ?? {}}
        onChange={(compatibility) => onChange({ ...value, compatibility })}
      />
      <details>
        <summary className="cursor-pointer text-sm">Advanced launch options</summary>
        <label className="mt-3 block text-sm text-orbit-muted">
          Launch arguments (one per line)
          <textarea
            className={field}
            rows={3}
            value={value.arguments.join('\n')}
            onChange={(e) =>
              onChange({
                ...value,
                arguments: e.target.value ? e.target.value.split('\n') : [],
              })
            }
          />
        </label>
        <p className="mt-2 text-xs text-orbit-muted">
          Each line is passed literally, including spaces. Graphics translation uses this
          runtime’s existing defaults; Orbit does not install DirectX components yet.
        </p>
        <label className="mt-3 block text-sm text-orbit-muted">
          Wine diagnostics
          <select
            className={field}
            value={value.environment.WINEDEBUG ?? '-all'}
            onChange={(e) =>
              onChange({
                ...value,
                environment: { ...value.environment, WINEDEBUG: e.target.value },
              })
            }
          >
            <option value="-all">Quiet</option>
            <option value="err+all,warn+all">Errors and warnings</option>
          </select>
        </label>
      </details>
    </section>
  )
}
