import { OptionSelect } from '@/components/ui/option-select'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { Terminal } from 'lucide-react'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { detectRuntimes } from '@/lib/tauri'
import type { WineProfile } from '@/types/runtime'
import { CompatibilityOverridesEditor } from './CompatibilityOverridesEditor'
import { Spinner } from '@/components/feedback/Spinner'

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
    <section className="flex flex-col gap-4" aria-label="Windows compatibility">
      <h2 className="font-display text-xl font-semibold">Windows compatibility</h2>
      <p className="text-sm text-orbit-muted">
        Orbit prepares a private Windows environment on first launch. Your game files stay
        where they are.
      </p>
      <label className="block text-sm text-orbit-muted">
        <span className="inline-flex items-center gap-2">
          Compatibility runtime
          {isPending && <Spinner size={13} />}
        </span>
        <OptionSelect
          aria-label="Compatibility runtime"
          className={field}
          value={value.runtimePath}
          onValueChange={(selectedValue) =>
            onChange({ ...value, runtimePath: selectedValue })
          }
        >
          <option value="">Choose a runtime</option>
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
        </OptionSelect>
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
      <CollapsiblePanel
        title="Advanced launch options"
        icon={Terminal}
        focusId="wine-advanced-launch"
      >
        <label className="block text-sm text-orbit-muted">
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
        <p className="text-xs text-orbit-muted">
          Each line is passed literally, including spaces. Graphics translation uses this
          runtime’s existing defaults; Orbit does not install DirectX components yet.
        </p>
        <label className="block text-sm text-orbit-muted">
          Wine diagnostics
          <OptionSelect
            aria-label="Wine diagnostics"
            className={field}
            value={value.environment.WINEDEBUG ?? '-all'}
            onValueChange={(selectedValue) =>
              onChange({
                ...value,
                environment: { ...value.environment, WINEDEBUG: selectedValue },
              })
            }
          >
            <option value="-all">Quiet</option>
            <option value="err+all,warn+all">Errors and warnings</option>
          </OptionSelect>
        </label>
      </CollapsiblePanel>
    </section>
  )
}
