import { OptionSelect } from '@/components/ui/option-select'
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
  const frameRateReady = hasGptk || hasDxmt || (hasDxvk && hasMoltenVk)
  const dxmtActive =
    value.graphics === 'dxmt' || (value.graphics === 'auto' && !hasGptk && hasDxmt)
  const canEditDxmt = value.graphics === undefined || dxmtActive
  const patch = (next: CompatibilityOverrides) => onChange({ ...value, ...next })
  return (
    <div className="space-y-4 rounded-card bg-white/[0.03] p-4">
      <div>
        <h3 className="font-medium">Game-specific compatibility</h3>
        <p className="mt-1 text-xs text-orbit-muted">
          “Use global default” inherits Settings → Compatibility without copying its
          values. Display is fixed at 1920 × 1080 with high-resolution mode disabled for
          every game.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-orbit-muted">
          Graphics
          <OptionSelect
            aria-label="Game graphics override"
            className={field}
            value={value.graphics ?? ''}
            onValueChange={(selectedValue) =>
              patch({
                graphics: (selectedValue ||
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
          </OptionSelect>
        </label>
        <label className="text-sm text-orbit-muted">
          Synchronization
          <OptionSelect
            aria-label="Game synchronization override"
            className={field}
            value={value.synchronization ?? ''}
            onValueChange={(selectedValue) =>
              patch({
                synchronization: (selectedValue ||
                  undefined) as CompatibilityOverrides['synchronization'],
              })
            }
          >
            <option value="">Use global default</option>
            <option value="default">Default</option>
            <option value="esync">ESync</option>
            <option value="msync">MSync</option>
          </OptionSelect>
        </label>
        <label className="text-sm text-orbit-muted">
          Frame rate limit
          <input
            aria-label="Game frame rate limit override"
            className={field}
            type="number"
            min={1}
            max={1000}
            placeholder={frameRateReady ? 'Unlimited' : 'Install GPTK, DXMT, or DXVK'}
            disabled={!frameRateReady}
            value={value.frameRateLimit ?? ''}
            onChange={(e) => {
              const frameRateLimit = e.target.value ? Number(e.target.value) : undefined
              const needsEngine =
                frameRateLimit != null &&
                value.graphics !== 'd3dmetal' &&
                value.graphics !== 'dxvk' &&
                value.graphics !== 'dxmt'
              patch({
                frameRateLimit,
                graphics: needsEngine
                  ? hasGptk
                    ? 'd3dmetal'
                    : hasDxmt
                      ? 'dxmt'
                      : 'dxvk'
                  : value.graphics,
              })
            }}
          />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
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
          label="D3DMetal DLSS support"
          disabled={!hasGptk}
          value={
            value.graphics === undefined || value.graphics === 'd3dmetal'
              ? value.upscaling
              : false
          }
          onChange={(upscaling) =>
            patch({
              upscaling,
              graphics: 'd3dmetal',
              dxmtNvidiaExtensions: false,
            })
          }
        />
        <BooleanOverride
          label="DXMT spatial upscaling"
          disabled={!hasDxmt || !canEditDxmt}
          value={
            value.graphics === undefined || value.graphics === 'dxmt'
              ? value.upscaling
              : false
          }
          onChange={(upscaling) => {
            if (canEditDxmt) patch({ upscaling, graphics: 'dxmt' })
          }}
        />
        <BooleanOverride
          label="DXMT NVIDIA extensions"
          disabled={!hasDxmt || !canEditDxmt}
          value={value.dxmtNvidiaExtensions}
          onChange={(dxmtNvidiaExtensions) => {
            if (canEditDxmt) patch({ dxmtNvidiaExtensions, graphics: 'dxmt' })
          }}
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
      <OptionSelect
        aria-label={`${label} override`}
        className={field}
        disabled={disabled}
        value={value === undefined ? '' : value ? 'on' : 'off'}
        onValueChange={(selectedValue) =>
          onChange(selectedValue === '' ? undefined : selectedValue === 'on')
        }
      >
        <option value="">Use global default</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </OptionSelect>
    </label>
  )
}
