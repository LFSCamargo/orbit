import { OptionSelect } from '@/components/ui/option-select'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { clsx } from 'clsx'
import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  RotateCcw,
  Sparkles,
  Monitor,
  SlidersHorizontal,
  Cpu,
  RefreshCw,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCompatibilitySettings,
  getComponentStatus,
  updateCompatibilitySettings,
} from '@/lib/tauri'
import { Focusable } from '@/components/focus/Focusable'
import type { CompatibilitySettings } from '@/types/runtime'

import { Switch } from '@/components/ui/switch'
import { useGraphicsDraft } from '@/stores/graphics-draft.store'
import { buttonClass } from '@/components/ui/button'
import { BusyLabel } from '@/components/feedback/BusyLabel'
import { Spinner } from '@/components/feedback/Spinner'
import { CompatibilitySettingsSkeleton } from './CompatibilitySkeleton'

const field = clsx(
  'settings-row-control w-full min-w-0 rounded-lg !border-0 !bg-transparent !p-2 text-right text-sm text-orbit-foreground/80 !shadow-none',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-orbit-focus disabled:opacity-50',
)

const ROW_GROUP = clsx(
  'settings-row-group overflow-hidden rounded-[18px] border border-orbit-foreground/10',
  'bg-orbit-foreground/[0.035] shadow-[inset_0_1px_0_rgb(var(--orbit-foreground)/0.035)]',
)

const PREFERENCE_ROW = clsx(
  'settings-preference-row grid min-h-[78px] grid-cols-[34px_minmax(0,1fr)_minmax(130px,34%)] items-center gap-3.5 p-4',
  'even:bg-orbit-foreground/[0.035] hover:bg-orbit-foreground/[0.055]',
  '[&>[role=switch]]:justify-self-end',
  'max-[700px]:grid-cols-[36px_minmax(0,1fr)]',
  'max-[700px]:[&>button]:col-start-2 max-[700px]:[&>button]:w-full max-[700px]:[&>button]:text-left',
  'max-[700px]:[&>.settings-row-control]:col-start-2 max-[700px]:[&>.settings-row-control]:w-full max-[700px]:[&>.settings-row-control]:text-left',
  'max-[700px]:has-[[role=switch]]:grid-cols-[34px_minmax(0,1fr)_auto]',
)

const COMPONENT_ICON =
  'compatibility-component-icon grid size-[34px] place-items-center rounded-xl border border-orbit-border bg-orbit-foreground/[0.04] text-orbit-foreground/70'

const PRIMARY_BUTTON = clsx(
  buttonClass({ size: 'sm', className: 'settings-primary-button' }),
  'disabled:cursor-not-allowed disabled:opacity-40',
)

const SECONDARY_BUTTON = clsx(
  'settings-secondary-button whitespace-nowrap rounded-full border border-orbit-border bg-orbit-foreground/[0.06] px-3.5 py-2.5 text-xs font-semibold',
  'disabled:cursor-not-allowed disabled:opacity-40',
)

const SAVE_BAR = clsx(
  'settings-save-bar sticky bottom-[-1px] z-20 flex items-center justify-between gap-4 rounded-2xl border border-orbit-border bg-orbit-surface p-4 shadow-[0_8px_32px_#0003]',
  'max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:[&>div:last-child]:justify-end',
)

const recommended: CompatibilitySettings = {
  graphics: 'auto',
  synchronization: 'msync',
  retinaMode: false,
  metalHud: false,
  avx: true,
  upscaling: true,
  upscaleRatio: 0,
  frameGeneration: false,
  frameGenerationVsync: false,
  frameRateLimit: null,
  dxmtNvidiaExtensions: false,
  resolution: 'custom',
  resolutionWidth: 1920,
  resolutionHeight: 1080,
}

export function CompatibilityGlobalSettings() {
  const queryClient = useQueryClient()
  const { data: saved, error } = useQuery({
    queryKey: ['compatibility-settings'],
    queryFn: getCompatibilitySettings,
  })
  const { data: installed } = useQuery({
    queryKey: ['component-status'],
    queryFn: getComponentStatus,
  })
  const { draft, saving, setDraft, setSaving } = useGraphicsDraft()
  const data = draft ?? saved
  const dirty = Boolean(draft && JSON.stringify(draft) !== JSON.stringify(saved))
  const hasDxvk = useMemo(() => installed?.some((c) => c.id === 'dxvk'), [installed])
  const hasDxmt = useMemo(() => installed?.some((c) => c.id === 'dxmt'), [installed])
  const hasGptk = useMemo(() => installed?.some((c) => c.id === 'gptk'), [installed])
  const hasMoltenVk = useMemo(
    () => installed?.some((c) => c.id === 'moltenvk'),
    [installed],
  )
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState('')

  const update = async (next: CompatibilitySettings) => {
    setSaving(true)
    setSaveError('')
    try {
      const saved = await updateCompatibilitySettings(next)
      queryClient.setQueryData(['compatibility-settings'], saved)
      setDraft(null)
      setNotice('Changes saved.')
    } catch (error) {
      setSaveError(String(error))
    } finally {
      setSaving(false)
    }
  }

  const patch = (values: Partial<CompatibilitySettings>) => {
    if (data) {
      setDraft({
        ...data,
        ...values,
        resolution: 'custom',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        retinaMode: false,
      })
    }
    setNotice('')
  }

  if (!data) {
    return error ? (
      <p className="text-sm text-orbit-muted">{String(error)}</p>
    ) : (
      <CompatibilitySettingsSkeleton />
    )
  }

  // Installed packages unlock the controls. The launch engine still has to be
  // the backend that reads each option, so editing one selects that engine
  // when the form is still on Automatic or Wine.
  const frameRateReady = hasGptk || hasDxmt || (hasDxvk && hasMoltenVk)
  const d3dmetalActive =
    data.graphics === 'd3dmetal' || (data.graphics === 'auto' && hasGptk)
  const dxmtActive =
    data.graphics === 'dxmt' || (data.graphics === 'auto' && !hasGptk && hasDxmt)

  return (
    <form
      className="graphics-form space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (dirty && !saving) void update(data)
      }}
    >
      <fieldset disabled={saving} className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-xl items-start gap-3">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-orbit-accent" />
            <div>
              <h3 className="text-sm font-semibold">Recommended by default</h3>
              <p className="mt-1 text-xs leading-relaxed text-orbit-muted">
                Saved choices apply to every Windows game on its next launch. You can
                still customize an individual game from Edit properties.
              </p>
            </div>
          </div>
          <Focusable
            focusId="compatibility-restore-defaults"
            group="runtimes-defaults"
            order={0}
            noScale
            disabled={saving}
            onClick={() => {
              setDraft(recommended)
              setNotice('')
            }}
            className="orbit-glass-control flex items-center gap-2 rounded-full px-3 py-2 text-xs"
          >
            <RotateCcw size={13} />
            Restore recommended
          </Focusable>
        </div>

        <SettingsGroup
          title="Graphics & performance"
          description="Change these only if a game has rendering or performance problems."
        >
          <div className="settings-control-rows contents">
            <Field
              label="Graphics engine"
              help="Select one engine for DirectX games. Automatic uses Wine’s built-in renderer."
            >
              <OptionSelect
                aria-label="Default graphics"
                className={field}
                value={data.graphics}
                onValueChange={(selectedValue) => {
                  const graphics = selectedValue as CompatibilitySettings['graphics']
                  const clearsTranslation =
                    graphics === 'auto' || graphics === 'wine'
                      ? {
                          upscaling: false,
                          dxmtNvidiaExtensions: false,
                          frameRateLimit: null,
                        }
                      : graphics === 'dxvk'
                        ? { upscaling: false, dxmtNvidiaExtensions: false }
                        : graphics === 'd3dmetal'
                          ? { dxmtNvidiaExtensions: false }
                          : {}
                  patch({ graphics, ...clearsTranslation })
                }}
              >
                <option value="auto">Automatic · Recommended</option>
                <option value="wine">Wine</option>
                <option value="dxvk" disabled={!hasDxvk || !hasMoltenVk}>
                  DXVK
                  {!hasDxvk
                    ? ' · Install component first'
                    : !hasMoltenVk
                      ? ' · Requires MoltenVK'
                      : ''}
                </option>
                <option value="dxmt" disabled={!hasDxmt}>
                  DXMT{!hasDxmt ? ' · Install component first' : ''}
                </option>
                <option value="d3dmetal" disabled={!hasGptk}>
                  D3DMetal{!hasGptk ? ' · Import Apple package first' : ''}
                </option>
              </OptionSelect>
            </Field>
            <Field
              label="Synchronization"
              help="Choose how Wine coordinates game threads."
            >
              <OptionSelect
                aria-label="Default synchronization"
                className={field}
                value={data.synchronization}
                onValueChange={(selectedValue) =>
                  patch({
                    synchronization:
                      selectedValue as CompatibilitySettings['synchronization'],
                  })
                }
              >
                <option value="default">Default</option>
                <option value="esync">ESync</option>
                <option value="msync">MSync · Recommended</option>
              </OptionSelect>
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="Display & compatibility"
          description="Output is fixed at 1080p; the game controls its internal rendering."
        >
          <Field
            label="Display mode"
            help="Fixed at 1920×1080 for every game. The virtual desktop and disabled Retina mode prevent automatic high-resolution presentation; select 1920×1080 in the game as well."
          >
            <OptionSelect
              aria-label="Default display mode"
              className={field}
              value="custom"
              onValueChange={() => undefined}
              disabled
            >
              <option value="custom">1080p · 1920 × 1080</option>
            </OptionSelect>
          </Field>
          <div className="settings-control-rows contents">
            <Toggle
              label="AVX instructions"
              description="Enable for games that require AVX instructions through Rosetta."
              checked={data.avx}
              onChange={(avx) => patch({ avx })}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="In-game overlay"
          description="A debugging aid, not a performance setting."
        >
          <Toggle
            label="Metal performance HUD"
            description="Show frame rate and graphics information over the game when the active backend supports Apple’s HUD."
            checked={data.metalHud}
            onChange={(metalHud) => patch({ metalHud })}
          />
        </SettingsGroup>

        <CollapsiblePanel
          title="Advanced graphics options"
          icon={SlidersHorizontal}
          focusId="graphics-advanced"
        >
          <p className="text-xs leading-relaxed text-orbit-muted">
            Frame rate, MetalFX, and NVIDIA extensions unlock when D3DMetal, DXMT, or DXVK
            is installed. D3DMetal DLSS selects D3DMetal and enables supported in-game
            DLSS Super Resolution and Frame Generation through MetalFX; DXMT-only options
            require DXMT as the active graphics engine. Apple D3DMetal exposes no separate
            frame-generation, VSync, or upscale-ratio override.
          </p>
          <div className="settings-control-rows contents">
            <Field
              label="Frame rate limit"
              help={
                frameRateReady
                  ? 'Caps the frame rate through D3DMetal, DXMT, or DXVK. Leave empty for unlimited.'
                  : 'Install Apple GPTK, DXMT, or DXVK to cap the frame rate.'
              }
            >
              <input
                aria-label="Default frame rate limit"
                className={field}
                type="number"
                min={1}
                max={1000}
                disabled={!frameRateReady}
                placeholder={frameRateReady ? 'Unlimited' : 'Component required'}
                value={data.frameRateLimit ?? ''}
                onChange={(e) => {
                  const frameRateLimit = e.target.value ? Number(e.target.value) : null
                  const needsEngine =
                    frameRateLimit != null &&
                    data.graphics !== 'd3dmetal' &&
                    data.graphics !== 'dxvk' &&
                    data.graphics !== 'dxmt'
                  patch({
                    frameRateLimit,
                    graphics: needsEngine
                      ? hasGptk
                        ? 'd3dmetal'
                        : hasDxmt
                          ? 'dxmt'
                          : 'dxvk'
                      : data.graphics,
                  })
                }}
              />
            </Field>
            <Field
              label="Upscale ratio"
              help="Neither DXMT nor Apple D3DMetal exposes an external upscale ratio override; choose quality presets inside the game."
            >
              <input
                aria-label="Default upscale ratio"
                className={field}
                type="number"
                min={0}
                max={4}
                step={0.5}
                disabled
                placeholder="Component required"
                value={data.upscaleRatio}
                onChange={(e) => patch({ upscaleRatio: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="settings-control-rows contents">
            <Toggle
              label="D3DMetal DLSS support"
              description="Translate supported in-game DLSS Super Resolution and Frame Generation to MetalFX (with Metal 4 on macOS 27+) via Apple GPTK. Select DLSS or Frame Generation inside the game after relaunching."
              disabled={!hasGptk}
              checked={Boolean(d3dmetalActive && data.upscaling)}
              onChange={(upscaling) =>
                patch({
                  upscaling,
                  graphics: 'd3dmetal',
                  dxmtNvidiaExtensions: false,
                })
              }
            />
            <Toggle
              label="DXMT spatial upscaling"
              description="Upscale the presentation surface with DXMT within Orbit's fixed 1080p desktop. Select DXMT as the graphics engine to change this option."
              disabled={!hasDxmt || !dxmtActive}
              checked={Boolean(dxmtActive && data.upscaling)}
              onChange={(upscaling) => {
                if (dxmtActive) patch({ upscaling, graphics: 'dxmt' })
              }}
            />
            <Toggle
              label="DXMT NVIDIA extensions"
              description={
                hasDxmt
                  ? 'Enable supported HDR and NVIDIA integrations for DXMT. Select DXMT as the graphics engine to change this option.'
                  : 'Install DXMT to enable HDR and NVIDIA integrations.'
              }
              disabled={!hasDxmt || !dxmtActive}
              checked={data.dxmtNvidiaExtensions}
              onChange={(dxmtNvidiaExtensions) => {
                if (dxmtActive) patch({ dxmtNvidiaExtensions, graphics: 'dxmt' })
              }}
            />
            <Toggle
              label="Frame generation"
              description="Enabled automatically with D3DMetal DLSS support for games that include DLSS Frame Generation; Apple D3DMetal has no separate toggle."
              disabled
              checked={data.frameGeneration}
              onChange={(frameGeneration) => patch({ frameGeneration })}
            />
            <Toggle
              label="Frame generation VSync"
              description="Not exposed by Apple D3DMetal; configure VSync inside the game."
              disabled
              checked={data.frameGenerationVsync}
              onChange={(frameGenerationVsync) => patch({ frameGenerationVsync })}
            />
          </div>
        </CollapsiblePanel>
      </fieldset>
      <div className={SAVE_BAR}>
        <div>
          <p role={saveError ? 'alert' : 'status'} className="text-sm font-medium">
            {saveError ||
              (saving ? (
                <Spinner size={15} />
              ) : dirty ? (
                'You have unsaved changes'
              ) : (
                notice || 'All changes saved'
              ))}
          </p>
          <p className="mt-1 text-xs text-orbit-muted">
            Applies on the next game launch.
          </p>
        </div>
        <div className="flex gap-2">
          <Focusable
            focusId="graphics-discard"
            group="runtimes-defaults"
            order={20}
            noScale
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(null)
              setSaveError('')
              setNotice('')
            }}
            className={SECONDARY_BUTTON}
          >
            Discard changes
          </Focusable>
          <Focusable
            type="submit"
            focusId="graphics-save"
            group="runtimes-defaults"
            order={21}
            noScale
            disabled={!dirty || saving}
            className={PRIMARY_BUTTON}
          >
            <BusyLabel busy={saving}>Save changes</BusyLabel>
          </Focusable>
        </div>
      </div>
    </form>
  )
}

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="settings-form-section pt-2">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mb-4 mt-1 text-xs leading-relaxed text-orbit-muted">{description}</p>
      <div className={ROW_GROUP}>{children}</div>
    </section>
  )
}

function Field({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: ReactNode
}) {
  const Icon =
    label === 'Graphics engine' ? Cpu : label === 'Synchronization' ? RefreshCw : Monitor
  return (
    <label className={PREFERENCE_ROW}>
      <span className={COMPONENT_ICON} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {help && (
          <span className="mt-1 block text-xs leading-relaxed text-orbit-muted">
            {help}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}

function Toggle({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className={PREFERENCE_ROW}>
      <span className={COMPONENT_ICON} aria-hidden="true">
        <SlidersHorizontal size={18} />
      </span>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span id={`${id}-label`} className="block text-sm font-medium">
          {label}
        </span>
        <span
          id={`${id}-help`}
          className="mt-1 block text-xs leading-relaxed text-orbit-muted"
        >
          {description}
        </span>
      </label>
      <Switch
        id={id}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  )
}
