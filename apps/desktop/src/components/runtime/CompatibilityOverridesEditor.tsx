import { useQuery } from '@tanstack/react-query'
import { getComponentStatus } from '@/lib/tauri'
import type { CompatibilityOverrides } from '@/types/runtime'

const field =
  'mt-2 w-full rounded-card border border-orbit-border bg-orbit-surface px-3 py-2.5 text-sm text-orbit-foreground'

export function CompatibilityOverridesEditor({
  value,
  onChange,
}: {
  value: CompatibilityOverrides
  onChange: (value: CompatibilityOverrides) => void
}) {
  const { data: installed } = useQuery({
    queryKey: ['component-status'],
    queryFn: getComponentStatus,
  })
  const hasDxvk = installed?.some((component) => component.id === 'dxvk') ?? false
  const hasDxmt = installed?.some((component) => component.id === 'dxmt') ?? false
  const hasGptk = installed?.some((component) => component.id === 'gptk') ?? false
  const hasMoltenVk = installed?.some((component) => component.id === 'moltenvk') ?? false
  const frameRateReady = hasDxmt || (hasDxvk && hasMoltenVk)
  const patch = (next: CompatibilityOverrides) => onChange({ ...value, ...next })
  return (
    <div className="space-y-4 rounded-card bg-white/[0.03] p-4">
      <div>
        <h3 className="font-medium">Game-specific compatibility</h3>
        <p className="mt-1 text-xs text-orbit-muted">
          “Use global default” inherits Settings → Compatibility without copying its
          values.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-orbit-muted">
          Graphics
          <select
            aria-label="Game graphics override"
            className={field}
            value={value.graphics ?? ''}
            onChange={(e) =>
              patch({
                graphics: (e.target.value ||
                  undefined) as CompatibilityOverrides['graphics'],
              })
            }
          >
            <option value="">Use global default</option>
            <option value="auto">Automatic (Wine default)</option>
            <option value="wine">Wine</option>
            <option value="dxvk" disabled={!hasDxvk || !hasMoltenVk}>
              DXVK{!hasDxvk || !hasMoltenVk ? ' (component required)' : ''}
            </option>
            <option value="dxmt" disabled={!hasDxmt}>
              DXMT{!hasDxmt ? ' (component required)' : ''}
            </option>
            <option value="d3dmetal" disabled={!hasGptk}>
              D3DMetal{!hasGptk ? ' (Apple package required)' : ''}
            </option>
          </select>
        </label>
        <label className="text-sm text-orbit-muted">
          Synchronization
          <select
            aria-label="Game synchronization override"
            className={field}
            value={value.synchronization ?? ''}
            onChange={(e) =>
              patch({
                synchronization: (e.target.value ||
                  undefined) as CompatibilityOverrides['synchronization'],
              })
            }
          >
            <option value="">Use global default</option>
            <option value="default">Default</option>
            <option value="esync">ESync</option>
            <option value="msync">MSync</option>
          </select>
        </label>
        <label className="text-sm text-orbit-muted">
          Display
          <select
            aria-label="Game display override"
            className={field}
            value={value.resolution ?? ''}
            onChange={(e) =>
              patch({
                resolution: (e.target.value ||
                  undefined) as CompatibilityOverrides['resolution'],
              })
            }
          >
            <option value="">Use global default</option>
            <option value="auto">Automatic</option>
            <option value="custom">Virtual desktop</option>
          </select>
        </label>
        <label className="text-sm text-orbit-muted">
          Frame rate limit
          <input
            aria-label="Game frame rate limit override"
            className={field}
            type="number"
            min={1}
            max={1000}
            placeholder={frameRateReady ? 'Unlimited' : 'Install DXVK or DXMT'}
            disabled={!frameRateReady}
            value={value.frameRateLimit ?? ''}
            onChange={(e) => {
              const frameRateLimit = e.target.value ? Number(e.target.value) : undefined
              const needsEngine =
                frameRateLimit != null &&
                value.graphics !== 'dxvk' &&
                value.graphics !== 'dxmt'
              patch({
                frameRateLimit,
                graphics: needsEngine ? (hasDxmt ? 'dxmt' : 'dxvk') : value.graphics,
              })
            }}
          />
        </label>
      </div>
      {value.resolution === 'custom' && (
        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm text-orbit-muted">
            Width
            <input
              aria-label="Game resolution width"
              className={field}
              type="number"
              min={640}
              value={value.resolutionWidth ?? 1920}
              onChange={(e) => patch({ resolutionWidth: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm text-orbit-muted">
            Height
            <input
              aria-label="Game resolution height"
              className={field}
              type="number"
              min={480}
              value={value.resolutionHeight ?? 1080}
              onChange={(e) => patch({ resolutionHeight: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <BooleanOverride
          label="High Resolution Mode"
          value={value.retinaMode}
          onChange={(retinaMode) => patch({ retinaMode })}
        />
        <BooleanOverride
          label="Metal performance HUD"
          value={value.metalHud}
          onChange={(metalHud) => patch({ metalHud })}
        />
        <BooleanOverride
          label="AVX instructions"
          value={value.avx}
          onChange={(avx) => patch({ avx })}
        />
        <BooleanOverride
          label="MetalFX upscaling"
          disabled={!hasDxmt && !hasGptk}
          value={value.upscaling}
          onChange={(upscaling) => {
            const supported = value.graphics === 'dxmt' || value.graphics === 'd3dmetal'
            patch({
              upscaling,
              graphics:
                upscaling && !supported
                  ? hasDxmt
                    ? 'dxmt'
                    : 'd3dmetal'
                  : value.graphics,
            })
          }}
        />
        <BooleanOverride
          label="DXMT NVIDIA extensions"
          disabled={!hasDxmt}
          value={value.dxmtNvidiaExtensions}
          onChange={(dxmtNvidiaExtensions) =>
            patch({
              dxmtNvidiaExtensions,
              graphics:
                dxmtNvidiaExtensions && value.graphics !== 'dxmt'
                  ? 'dxmt'
                  : value.graphics,
            })
          }
        />
        <BooleanOverride
          label="Frame generation"
          disabled
          value={value.frameGeneration}
          onChange={(frameGeneration) => patch({ frameGeneration })}
        />
        <BooleanOverride
          label="Frame generation VSync"
          disabled
          value={value.frameGenerationVsync}
          onChange={(frameGenerationVsync) => patch({ frameGenerationVsync })}
        />
      </div>
    </div>
  )
}

function BooleanOverride({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value?: boolean
  disabled?: boolean
  onChange: (value?: boolean) => void
}) {
  return (
    <label className="text-sm text-orbit-muted">
      {label}
      <select
        aria-label={`${label} override`}
        className={field}
        disabled={disabled}
        value={value === undefined ? '' : value ? 'on' : 'off'}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : event.target.value === 'on')
        }
      >
        <option value="">Use global default</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </label>
  )
}
