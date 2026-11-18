import { clsx } from 'clsx'
import { Check, LoaderCircle } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { buttonClass } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useLibraryPaths } from '@/hooks/useLibraryPaths'
import { CoverFan } from '../components/CoverFan'
import { OnboardingFooter } from '../components/OnboardingFooter'
import { StepHeader } from '../components/StepHeader'
import { BADGE, BADGE_QUIET, ONBOARDING_PANEL } from '../components/styles'
import { useOnboardingScan } from '../hooks/useOnboardingScan'
import { SCAN_PHASES, type ScanPhaseState } from '../lib/scanSummary'

/** Orange check when done, spinner while running, a ring while waiting. */
function PhaseIcon({ state }: { state: ScanPhaseState }) {
  if (state === 'running')
    return (
      <LoaderCircle
        size={20}
        aria-hidden="true"
        className="animate-spin text-white/80 motion-reduce:animate-none"
      />
    )
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'grid size-[20px] place-items-center rounded-full',
        state === 'done' &&
          'bg-[rgb(var(--orbit-fire-via))] text-[rgb(var(--orbit-fire-ink))] shadow-[0_0_10px_rgb(var(--orbit-fire-via)/0.5)]',
        state === 'failed' && 'border border-rose-300/60 text-rose-200',
        state === 'waiting' && 'border-[1.5px] border-white/30',
      )}
    >
      {state === 'done' && <Check size={13} strokeWidth={3.2} />}
      {state === 'failed' && <span className="text-[11px] leading-none">!</span>}
    </span>
  )
}

const PHASE_STATE_LABEL: Record<ScanPhaseState, string> = {
  waiting: 'waiting',
  running: 'in progress',
  done: 'complete',
  failed: 'skipped',
}

export function ScanStep({
  onFinish,
  onBack,
}: {
  onFinish: () => void
  onBack: () => void
}) {
  const scan = useOnboardingScan()
  const library = useLibraryPaths()
  const { status, found } = scan

  const header = {
    ready: [
      'Scan Games',
      "We'll scan your library paths to find your installed games and add them to Orbit.",
    ],
    scanning: [
      'Scan Games',
      "We'll scan your library paths to find your installed games and add them to Orbit.",
    ],
    complete: ['Scan complete', 'Your installed games have been added to Orbit.'],
    empty: [
      'No games found',
      'We could not find any games in the selected library paths.',
    ],
    error: ['Scan needs attention', 'Orbit could not finish scanning. Nothing was lost.'],
  }[status]

  const primary =
    status === 'ready'
      ? { label: 'Start Scan', onClick: () => void scan.run() }
      : status === 'scanning'
        ? { label: 'Scanning…', onClick: () => {}, disabled: true }
        : status === 'error'
          ? { label: 'Retry Scan', onClick: () => void scan.run() }
          : {
              label: status === 'empty' ? 'Finish Anyway' : 'Finish Setup',
              onClick: onFinish,
            }

  const showProgress =
    status === 'ready' || status === 'scanning' || status === 'complete'
  const percent = status === 'complete' ? 100 : scan.percent

  return (
    <>
      <StepHeader title={header[0]} subtitle={header[1]} />
      <div className="mx-auto mt-[clamp(12px,3.4cqh,28px)] w-full max-w-[900px]">
        {showProgress && (
          <section
            className={clsx(
              ONBOARDING_PANEL,
              'flex items-center gap-[clamp(16px,3cqw,32px)] px-[clamp(16px,3cqw,30px)] py-[clamp(14px,3.4cqh,26px)]',
            )}
          >
            <CoverFan games={found.games} placeholders={status !== 'complete'} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[20px] font-semibold text-white">
                {status === 'complete'
                  ? `${found.total} ${found.total === 1 ? 'game' : 'games'} found`
                  : status === 'scanning'
                    ? 'Scanning your games…'
                    : 'Ready to scan'}
              </h2>
              <p className="mt-0.5 text-[15px] text-white/60" role="status">
                {status === 'complete'
                  ? 'Detected in your library folders and apps'
                  : status === 'scanning'
                    ? `Found ${found.total} ${found.total === 1 ? 'game' : 'games'} so far`
                    : 'Library paths, Mac apps, then game details'}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <ProgressBar
                  value={percent}
                  label="Scan progress"
                  tone="fire"
                  className="h-2"
                />
                <span className="w-10 text-right text-[14px] font-semibold">
                  {percent}%
                </span>
              </div>
              {status === 'complete' ? (
                <ul aria-label="Games by source" className="mt-3 flex flex-wrap gap-2">
                  {found.bySource.map((group) => (
                    <li
                      key={group.source}
                      className={clsx(BADGE, BADGE_QUIET, 'text-[14px]')}
                    >
                      {group.label} · {group.count} {group.count === 1 ? 'game' : 'games'}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mt-3 space-y-[clamp(4px,1.2cqh,9px)]">
                  {SCAN_PHASES.map((phase) => {
                    const state = scan.phases[phase.id]
                    return (
                      <li key={phase.id} className="flex items-center gap-3 text-[16px]">
                        <PhaseIcon state={state} />
                        <span
                          className={state === 'waiting' ? 'text-white/55' : 'text-white'}
                        >
                          {phase.label}
                          {state === 'running' && '…'}
                        </span>
                        <span className="sr-only">: {PHASE_STATE_LABEL[state]}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {status === 'empty' && (
          <section
            className={clsx(
              ONBOARDING_PANEL,
              'mx-auto max-w-[560px] px-8 py-7 text-center',
            )}
          >
            <h2 className="text-[18px] font-semibold text-white">
              Your library is currently empty
            </h2>
            <p className="mt-2 text-[16px] text-white/55">
              Add another folder or finish onboarding and import games later.
            </p>
            <Focusable
              focusId="onboarding-scan-add-path"
              group="onboarding"
              order={0}
              noScale
              noRing
              disabled={!library.loaded || library.saving}
              onClick={async () => {
                if (await library.browse('Choose a folder with games')) void scan.run()
              }}
              className={buttonClass({
                variant: 'secondary',
                className: 'mt-5 bg-white/[0.07] font-medium',
              })}
            >
              Add another path
            </Focusable>
            {library.error && (
              <p role="alert" className="mt-3 text-[14px] text-rose-300">
                {library.error}
              </p>
            )}
          </section>
        )}

        {status === 'error' && (
          <section className={clsx(ONBOARDING_PANEL, 'px-7 py-6')}>
            <h2 className="text-[18px] font-semibold text-white">
              The scan did not finish
            </h2>
            <p className="mt-2 text-[16px] text-white/60" role="alert">
              {scan.error.replace(/^Error:\s*/, '')}
            </p>
            <Focusable
              focusId="onboarding-scan-finish-anyway"
              group="onboarding"
              order={0}
              noScale
              noRing
              onClick={onFinish}
              className="mt-3 text-[14px] text-white/60 underline-offset-4 hover:text-white hover:underline"
            >
              Finish without scanning
            </Focusable>
          </section>
        )}
      </div>
      <OnboardingFooter onBack={onBack} primary={primary} />
    </>
  )
}
