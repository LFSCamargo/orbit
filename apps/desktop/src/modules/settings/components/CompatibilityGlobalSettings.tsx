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

const field = 'settings-row-control text-sm text-orbit-foreground disabled:opacity-50'

const recommended: CompatibilitySettings = {
  graphics: 'auto',
  synchronization: 'default',
  retinaMode: false,
  metalHud: false,
  avx: false,
  upscaling: false,
  upscaleRatio: 0,
  frameGeneration: false,
  frameGenerationVsync: false,
  frameRateLimit: null,
  dxmtNvidiaExtensions: false,
  resolution: 'auto',
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
    if (data) setDraft({ ...data, ...values })
    setNotice('')
  }

  if (!data) {
    return (
      <p className="text-sm text-orbit-muted">
        {error ? String(error) : 'Loading settings…'}
      </p>
    )
  }

  // Installed packages unlock the controls. The launch engine still has to be
  // the backend that reads each option, so editing one selects that engine
  // when the form is still on Automatic or Wine.
  const frameRateReady = hasDxmt || (hasDxvk && hasMoltenVk)
  const metalFxReady = hasDxmt || hasGptk

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
            className="orbit-glass-control flex items-center gap-2 rounded-card px-3 py-2 text-xs"
          >
            <RotateCcw size={13} />
            Restore recommended
          </Focusable>
        </div>

        <SettingsGroup
          title="Graphics & performance"
          description="Change these only if a game has rendering or performance problems."
        >
          <div className="settings-control-rows">
            <Field
              label="Graphics engine"
              help="Select one engine for DirectX games. Automatic uses Wine’s built-in renderer."
            >
              <select
                aria-label="Default graphics"
                className={field}
                value={data.graphics}
                onChange={(e) => {
                  const graphics = e.target.value as CompatibilitySettings['graphics']
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
                          ? { dxmtNvidiaExtensions: false, frameRateLimit: null }
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
              </select>
            </Field>
            <Field
              label="Synchronization"
              help="Choose how Wine coordinates game threads."
            >
              <select
                aria-label="Default synchronization"
                className={field}
                value={data.synchronization}
                onChange={(e) =>
                  patch({
                    synchronization: e.target
                      .value as CompatibilitySettings['synchronization'],
                  })
                }
              >
                <option value="default">Default · Recommended</option>
                <option value="esync">ESync</option>
                <option value="msync">MSync</option>
              </select>
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="Display & compatibility"
          description="Use the game’s own display settings first. These options are fallbacks."
        >
          <Field
            label="Display mode"
            help="Use a virtual desktop if a game has trouble with fullscreen."
          >
            <select
              aria-label="Default display mode"
              className={field}
              value={data.resolution}
              onChange={(e) =>
                patch({
                  resolution: e.target.value as CompatibilitySettings['resolution'],
                })
              }
            >
              <option value="auto">Automatic · Recommended</option>
              <option value="custom">Virtual desktop</option>
            </select>
          </Field>
          {data.resolution === 'custom' && (
            <div className="settings-control-rows">
              <Field label="Width">
                <input
                  aria-label="Default resolution width"
                  className={field}
                  type="number"
                  min={640}
                  max={7680}
                  value={data.resolutionWidth}
                  onChange={(e) => patch({ resolutionWidth: Number(e.target.value) })}
                />
              </Field>
              <Field label="Height">
                <input
                  aria-label="Default resolution height"
                  className={field}
                  type="number"
                  min={480}
                  max={4320}
                  value={data.resolutionHeight}
                  onChange={(e) => patch({ resolutionHeight: Number(e.target.value) })}
                />
              </Field>
            </div>
          )}
          <div className="settings-control-rows">
            <Toggle
              label="High Resolution Mode"
              description="Sharper rendering on Retina displays. Turn off if a game scales incorrectly."
              checked={data.retinaMode}
              onChange={(retinaMode) => patch({ retinaMode })}
            />
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

        <details className="rounded-card border border-white/10 bg-black/10 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Advanced graphics options
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-orbit-muted">
            Frame rate, MetalFX, and NVIDIA extensions unlock when DXVK, DXMT, or D3DMetal
            is installed. Turning one on selects the graphics engine that can apply it.
            Upscale ratio and frame generation need a separate frame-generation package,
            which DXMT does not include.
          </p>
          <div className="settings-control-rows mt-4">
            <Field
              label="Frame rate limit"
              help={
                frameRateReady
                  ? 'Caps the frame rate through DXVK or DXMT. Leave empty for unlimited.'
                  : 'Install DXVK or DXMT to cap the frame rate.'
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
                    data.graphics !== 'dxvk' &&
                    data.graphics !== 'dxmt'
                  patch({
                    frameRateLimit,
                    graphics: needsEngine ? (hasDxmt ? 'dxmt' : 'dxvk') : data.graphics,
                  })
                }}
              />
            </Field>
            <Field
              label="Upscale ratio"
              help="DXMT has no ratio control. Frame generation is a separate package and is not available yet."
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
          <div className="settings-control-rows">
            <Toggle
              label="MetalFX upscaling"
              description={
                metalFxReady
                  ? 'Use supported MetalFX upscaling.'
                  : 'Install DXMT or D3DMetal to use MetalFX.'
              }
              disabled={!metalFxReady}
              checked={data.upscaling}
              onChange={(upscaling) => {
                const supported = data.graphics === 'dxmt' || data.graphics === 'd3dmetal'
                patch({
                  upscaling,
                  graphics:
                    upscaling && !supported
                      ? hasDxmt
                        ? 'dxmt'
                        : 'd3dmetal'
                      : data.graphics,
                })
              }}
            />
            <Toggle
              label="DXMT NVIDIA extensions"
              description={
                hasDxmt
                  ? 'Enable supported HDR and DLSS integrations.'
                  : 'Install DXMT to enable HDR and DLSS integrations.'
              }
              disabled={!hasDxmt}
              checked={data.dxmtNvidiaExtensions}
              onChange={(dxmtNvidiaExtensions) =>
                patch({
                  dxmtNvidiaExtensions,
                  graphics:
                    dxmtNvidiaExtensions && data.graphics !== 'dxmt'
                      ? 'dxmt'
                      : data.graphics,
                })
              }
            />
            <Toggle
              label="Frame generation"
              description="Needs a GPTK 4 frame-generation package. DXMT does not include one."
              disabled
              checked={data.frameGeneration}
              onChange={(frameGeneration) => patch({ frameGeneration })}
            />
            <Toggle
              label="Frame generation VSync"
              description="Needs the same GPTK 4 frame-generation package."
              disabled
              checked={data.frameGenerationVsync}
              onChange={(frameGenerationVsync) => patch({ frameGenerationVsync })}
            />
          </div>
        </details>
      </fieldset>
      <div className="settings-save-bar">
        <div>
          <p role={saveError ? 'alert' : 'status'} className="text-sm font-medium">
            {saveError ||
              (saving
                ? 'Saving changes…'
                : dirty
                  ? 'You have unsaved changes'
                  : notice || 'All changes saved')}
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
            className="settings-secondary-button"
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
            className="settings-primary-button"
          >
            {saving ? 'Saving…' : 'Save changes'}
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
    <section className="settings-form-section">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-4 mt-1 text-xs leading-relaxed text-orbit-muted">{description}</p>
      <div className="settings-row-group">{children}</div>
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
    <label className="settings-preference-row">
      <span className="compatibility-component-icon" aria-hidden="true">
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
    <div className="settings-preference-row">
      <span className="compatibility-component-icon" aria-hidden="true">
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
