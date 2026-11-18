import { clsx } from 'clsx'
import { Check, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { EpicGamesIcon, XboxIcon } from '@/components/brand/AccountIcons'
import { Focusable } from '@/components/focus/Focusable'
import { SteamIcon } from '@/components/game/SourceIcon'
import { SteamClientSignIn } from '@/components/layout/SteamClientSignIn'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useSteamSignIn } from '@/hooks/useSteamSignIn'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { XBOX_CLOUD_ENABLED } from '@/lib/features'
import { openXboxCloud } from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import { OnboardingFooter } from '../components/OnboardingFooter'
import { StepHeader } from '../components/StepHeader'
import { BADGE, BADGE_QUIET, ONBOARDING_PANEL, PANEL_ROWS } from '../components/styles'

function AccountRow({
  focusId,
  order,
  icon,
  name,
  description,
  connected,
  comingSoon,
  onClick,
}: {
  focusId: string
  order: number
  icon: ReactNode
  name: string
  description: string
  connected?: boolean
  comingSoon?: boolean
  onClick?: () => void
}) {
  return (
    <li>
      <Focusable
        focusId={focusId}
        group="onboarding"
        order={order}
        noScale
        noRing
        disabled={comingSoon}
        onClick={onClick}
        aria-label={`${name}: ${connected ? 'connected' : comingSoon ? 'coming soon' : description}`}
        className={clsx(
          'flex w-full items-center gap-4 rounded-[12px] px-4 py-[clamp(10px,2.4cqh,16px)] text-left transition',
          comingSoon ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/[0.04]',
        )}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-[13px] border border-white/10 bg-[rgb(255_255_255/0.07)] text-white">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold text-white">{name}</span>
          <span className="block truncate text-[14px] text-white/55">{description}</span>
        </span>
        {connected ? (
          <span className="flex items-center gap-1.5 text-[15px] text-white/70">
            <Check size={16} aria-hidden="true" /> Connected
          </span>
        ) : comingSoon ? (
          <span className={clsx(BADGE, BADGE_QUIET)}>Coming soon</span>
        ) : (
          <ChevronRight size={22} aria-hidden="true" className="text-white/80" />
        )}
      </Focusable>
    </li>
  )
}

export function AccountStep({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const [skipped, setSkipped] = useState(false)
  const { status } = useSteamWindows()
  const signIn = useSteamSignIn()
  const xboxConnected =
    usePreferencesStore((s) => s.preferences.xboxCloudConnected) && XBOX_CLOUD_ENABLED
  const updatePreferences = usePreferencesStore((s) => s.update)
  const steamAccount = status.data?.signedIn ? status.data.accountName : null
  const anyConnected = Boolean(steamAccount) || xboxConnected
  useOverlayBack(skipped, () => setSkipped(false))

  const [xboxError, setXboxError] = useState('')
  const openXbox = async () => {
    setXboxError('')
    try {
      await openXboxCloud()
      await updatePreferences({ xboxCloudConnected: true })
    } catch {
      setXboxError('Could not open Xbox Cloud Gaming. You can try again from Settings.')
    }
  }

  if (skipped) {
    return (
      <>
        <StepHeader
          title="Continue without an account"
          subtitle="You can connect Steam and other accounts later in Settings."
        />
        <section
          className={`${ONBOARDING_PANEL} mx-auto mt-[clamp(14px,5cqh,48px)] w-full max-w-[640px] px-8 py-[clamp(20px,6cqh,48px)] text-center`}
        >
          <h2 className="text-[24px] font-semibold text-white">Local-first experience</h2>
          <p className="mt-3 text-[16px] text-white/60">
            Your games, paths, and preferences stay on this device.
          </p>
        </section>
        <OnboardingFooter
          onBack={() => setSkipped(false)}
          primary={{ label: 'Continue', onClick: onNext }}
        />
      </>
    )
  }

  return (
    <>
      <StepHeader
        title={anyConnected ? 'Account connected' : 'Account'}
        subtitle={
          steamAccount
            ? `Signed in to Steam as ${steamAccount}. Connect more or continue.`
            : 'Sign in to bring your library, achievements, and playtime into Orbit.'
        }
      />
      <div className="mx-auto mt-[clamp(12px,3.4cqh,28px)] flex w-full max-w-[760px] flex-col gap-3">
        <ul className={clsx(ONBOARDING_PANEL, PANEL_ROWS, 'px-2 py-1')}>
          <AccountRow
            focusId="onboarding-account-steam"
            order={0}
            icon={<SteamIcon size={26} />}
            name="Sign in with Steam"
            description={
              steamAccount
                ? `Signed in as ${steamAccount}`
                : 'Import your library, achievements, and playtime'
            }
            connected={Boolean(steamAccount)}
            onClick={steamAccount ? undefined : signIn.start}
          />
          <AccountRow
            focusId="onboarding-account-xbox"
            order={1}
            icon={<XboxIcon size={24} />}
            name="Xbox Cloud Gaming"
            description="Stream Game Pass games in an Orbit window"
            connected={xboxConnected}
            comingSoon={!XBOX_CLOUD_ENABLED}
            onClick={XBOX_CLOUD_ENABLED ? () => void openXbox() : undefined}
          />
          <AccountRow
            focusId="onboarding-account-epic"
            order={2}
            icon={<EpicGamesIcon size={28} />}
            name="Epic Games"
            description="Import your Epic library"
            comingSoon
          />
        </ul>
        {xboxError && (
          <p className="text-center text-[14px] text-rose-300" role="alert">
            {xboxError}
          </p>
        )}
        {signIn.libraryError && (
          <p className="text-center text-[14px] text-rose-300" role="alert">
            {signIn.libraryError}
          </p>
        )}
        {!anyConnected && (
          <Focusable
            focusId="onboarding-account-skip"
            group="onboarding"
            order={3}
            noScale
            noRing
            onClick={() => setSkipped(true)}
            className="mx-auto rounded-full px-4 py-1 text-[15px] text-white/60 hover:text-white"
          >
            Skip for now
          </Focusable>
        )}
      </div>
      <OnboardingFooter
        onBack={onBack}
        primary={{ label: 'Continue', onClick: onNext }}
      />
      <SteamClientSignIn
        open={signIn.open}
        attempt={signIn.attempt}
        onSignedIn={signIn.finish}
        onClose={signIn.close}
      />
    </>
  )
}
