import { clsx } from 'clsx'
import { Check, LoaderCircle } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { ProgressBar } from '@/components/ui/progress-bar'
import { OnboardingFooter } from '../components/OnboardingFooter'
import { StepHeader } from '../components/StepHeader'
import {
  BADGE,
  BADGE_HOT,
  BADGE_QUIET,
  ONBOARDING_PANEL,
  PANEL_ROWS,
  STATUS_TONE,
} from '../components/styles'
import { useOnboardingSetup } from '../hooks/useOnboardingSetup'
import type { RowStatus, SetupBadge } from '../lib/setupPlan'

const HEADERS = {
  loading: [
    'Setup',
    'Choose the components to install. Recommended options are selected for the best experience.',
  ],
  ready: [
    'Setup',
    'Choose the components to install. Recommended options are selected for the best experience.',
  ],
  installing: [
    'Setting up Orbit',
    'Downloading and installing your compatibility components.',
  ],
  failed: [
    'Setup needs attention',
    'Some components could not be installed. Your progress is saved.',
  ],
  complete: ['Setup complete', 'Your compatibility components are installed and ready.'],
} as const

const BADGE_LABEL: Record<SetupBadge, string> = {
  required: 'Required',
  recommended: 'Recommended',
  latest: 'Latest',
  optional: 'Optional',
}

function statusText(status: RowStatus): { text: string; tone: keyof typeof STATUS_TONE } {
  switch (status.kind) {
    case 'installed':
      return { text: 'Installed', tone: 'done' }
    case 'installing':
      return {
        text: status.percent === null ? 'Installing…' : `Installing ${status.percent}%`,
        tone: 'active',
      }
    case 'failed':
      return { text: 'Failed', tone: 'failed' }
    default:
      return { text: 'Queued', tone: 'waiting' }
  }
}

/** First line of an install error, short enough for the card. */
function shortError(message: string) {
  const line = message
    .replace(/^Error:\s*/, '')
    .split('\n')[0]
    .replace(/[.\s]+$/, '')
  return line.length > 160 ? `${line.slice(0, 157)}…` : line
}

/** Orange rounded check, as in the design; also used for status rows. */
function CheckMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'grid size-[24px] shrink-0 place-items-center rounded-[7px] border transition',
        on
          ? 'border-transparent bg-[rgb(var(--orbit-fire-via))] text-[rgb(var(--orbit-fire-ink))] shadow-[0_0_10px_rgb(var(--orbit-fire-via)/0.45)]'
          : 'border-white/30 bg-white/[0.04]',
      )}
    >
      {on && <Check size={14} strokeWidth={3.2} />}
    </span>
  )
}

export function SetupStep({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const setup = useOnboardingSetup()
  const { phase, rows, statuses, selected, summary } = setup
  const [title, subtitle] = HEADERS[phase]
  const runRows = rows.filter((row) => statuses.get(row.id)?.kind !== 'idle')
  const failedRow = rows.find((row) => row.id === summary.failed[0])
  const failedStatus = failedRow && statuses.get(failedRow.id)
  const anySelected = rows.some(
    (row) => selected.has(row.id) && row.available && !row.installed,
  )

  const primary =
    phase === 'installing'
      ? { label: 'Installing…', onClick: () => {}, disabled: true }
      : phase === 'failed'
        ? { label: 'Retry Download', onClick: () => void setup.retry() }
        : phase === 'ready' && anySelected
          ? { label: 'Download & Continue', onClick: () => void setup.install() }
          : phase === 'loading'
            ? { label: 'Checking…', onClick: () => {}, disabled: true }
            : { label: 'Continue', onClick: onNext }

  return (
    <>
      <StepHeader title={title} subtitle={subtitle} />
      <div className="mx-auto mt-[clamp(12px,3.4cqh,28px)] w-full max-w-[860px]">
        {phase === 'loading' && (
          <p className="py-10 text-center text-[16px] text-white/60" role="status">
            Checking your components…
          </p>
        )}
        {phase === 'ready' && (
          <ul className={clsx(ONBOARDING_PANEL, PANEL_ROWS, 'px-2')}>
            {rows.map((row, index) => {
              const checked = row.installed || selected.has(row.id)
              const locked = row.installed || !row.available || row.badge === 'required'
              return (
                <li key={row.id}>
                  <Focusable
                    focusId={`onboarding-setup-${row.id}`}
                    group="onboarding"
                    order={index}
                    noScale
                    noRing
                    role="checkbox"
                    aria-checked={checked}
                    aria-disabled={locked || undefined}
                    aria-label={`Install ${row.name}`}
                    onClick={() => !locked && setup.toggle(row.id)}
                    className={clsx(
                      'flex w-full items-center gap-4 rounded-[12px] px-4 py-[clamp(9px,2cqh,14px)] text-left transition',
                      !locked && 'hover:bg-white/[0.04]',
                      !row.available && 'opacity-50',
                    )}
                  >
                    <CheckMark on={checked} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-white">
                        {row.name}
                      </span>
                      <span className="block truncate text-[14px] text-white/55">
                        {!row.available
                          ? 'Not available right now'
                          : row.installed
                            ? 'Installed'
                            : row.description}
                        {row.note && row.available && !row.installed && (
                          <span className="text-white/40"> · {row.note}</span>
                        )}
                      </span>
                    </span>
                    <span
                      className={clsx(
                        BADGE,
                        row.badge === 'recommended' ? BADGE_HOT : BADGE_QUIET,
                      )}
                    >
                      {BADGE_LABEL[row.badge]}
                    </span>
                  </Focusable>
                </li>
              )
            })}
          </ul>
        )}

        {phase === 'installing' && (
          <section className={clsx(ONBOARDING_PANEL, 'px-7 py-6')}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-[20px] font-semibold text-white">
                Downloading {summary.current} of {summary.total} components
              </h2>
              <span className="text-[20px] font-semibold">{summary.percent}%</span>
            </div>
            <ProgressBar
              value={summary.percent}
              label="Setup progress"
              tone="fire"
              className="mt-4 h-2"
            />
            <ul className="mt-5 space-y-2.5">
              {runRows.map((row) => {
                const status = statuses.get(row.id) as RowStatus
                const { text, tone } = statusText(status)
                return (
                  <li key={row.id} className="flex items-center gap-3 text-[16px]">
                    {status.kind === 'installing' ? (
                      <LoaderCircle
                        size={20}
                        aria-hidden="true"
                        className="animate-spin text-[rgb(var(--orbit-fire-via))] motion-reduce:animate-none"
                      />
                    ) : (
                      <CheckMark on={status.kind === 'installed'} />
                    )}
                    <span className="flex-1">{row.name}</span>
                    <span className={clsx('text-[14px]', STATUS_TONE[tone])}>{text}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {phase === 'failed' && failedRow && failedStatus?.kind === 'failed' && (
          <section
            className={clsx(ONBOARDING_PANEL, 'px-7 py-[clamp(14px,3.6cqh,26px)]')}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[22px] font-semibold text-white">{failedRow.name}</h2>
              <span
                className={clsx(BADGE, 'border-rose-300/40 bg-rose-400/10 text-rose-200')}
              >
                Failed
              </span>
            </div>
            <p className="mt-[clamp(8px,2cqh,16px)] text-[16px] text-white/65">
              {shortError(failedStatus.message)}. Check your connection or try again.
            </p>
            <p className="mt-[clamp(8px,2cqh,16px)] rounded-[12px] border border-[rgb(var(--orbit-fire-from)/0.55)] bg-[rgb(var(--orbit-fire-from)/0.08)] px-5 py-3 text-[16px]">
              {summary.completed} of {summary.total} components completed successfully
            </p>
            <Focusable
              focusId="onboarding-setup-continue-anyway"
              group="onboarding"
              order={0}
              noScale
              noRing
              onClick={onNext}
              className="mt-3 text-[15px] text-white/60 underline-offset-4 hover:text-white hover:underline"
            >
              {summary.failed.length > 1
                ? 'Continue without these components'
                : `Continue without ${failedRow.name}`}
            </Focusable>
          </section>
        )}

        {phase === 'complete' && (
          <ul className={clsx(ONBOARDING_PANEL, PANEL_ROWS, 'px-5')}>
            {rows.map((row) => {
              const done = statuses.get(row.id)?.kind === 'installed'
              return (
                <li key={row.id} className="flex items-center gap-4 py-3.5 text-[17px]">
                  <CheckMark on={done} />
                  <span className="flex-1 font-semibold">{row.name}</span>
                  <span
                    className={clsx(
                      'text-[14px]',
                      done ? STATUS_TONE.done : STATUS_TONE.waiting,
                    )}
                  >
                    {done ? 'Installed' : 'Not installed'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {setup.catalogWarning && phase !== 'installing' && (
          <p className="mt-3 text-center text-[14px] text-white/55" role="status">
            {setup.catalogWarning}
          </p>
        )}
      </div>
      <OnboardingFooter onBack={onBack} primary={primary} />
    </>
  )
}
