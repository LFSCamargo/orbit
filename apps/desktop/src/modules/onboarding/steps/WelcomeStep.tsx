import { Gamepad, Gamepad2, Layers, Zap, type LucideIcon } from 'lucide-react'
import appIcon from '@/assets/brand/app-icon.png'
import { OnboardingFooter } from '../components/OnboardingFooter'
import { StepHeader } from '../components/StepHeader'
import { ONBOARDING_PANEL } from '../components/styles'

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Gamepad2,
    title: 'One library',
    body: 'Steam, Windows and Mac games together, with artwork and playtime.',
  },
  {
    icon: Layers,
    title: 'Play windows games on a Mac',
    body: 'Wine, Game Porting Toolkit and DXMT, installed and kept up to date.',
  },
  {
    icon: Zap,
    title: 'Tuned for Apple silicon',
    body: 'Recommended performance settings, applied for you.',
  },
  {
    icon: Gamepad,
    title: 'Made for controllers',
    body: 'Browse, install and play from the couch.',
  },
]

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-5">
        <img
          src={appIcon}
          alt="Orbit"
          draggable={false}
          className="float-soft relative mx-auto size-[clamp(64px,13cqh,104px)] drop-shadow-[0_12px_30px_rgb(0_0_0/0.5)]"
        />
        <StepHeader
          hero
          title="Welcome to Orbit"
          subtitle="Your unified gaming hub. Play, manage, and enhance your games across devices."
        />
        <p className="mt-2 text-center text-[13px] text-white/50">
          Setup takes a couple of minutes. You can change anything later in Settings.
        </p>
        <ul
          aria-label="What Orbit does"
          className="mx-auto mt-4 grid w-full max-w-[920px] grid-cols-4 gap-3 max-[900px]:grid-cols-2"
        >
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className={`${ONBOARDING_PANEL} p-4 text-left`}>
              <Icon
                size={20}
                aria-hidden="true"
                className="text-[rgb(var(--orbit-fire-via))]"
              />
              <h2 className="mt-1 text-[14px] font-semibold tracking-tight text-white">
                {title}
              </h2>
              <p className="mt-1 text-[12.5px] leading-snug text-white/60">{body}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute bottom-0 right-10 pb-[clamp(8px,4cqh,40px)]">
        <OnboardingFooter centered primary={{ label: 'Get Started', onClick: onNext }} />
      </div>
    </div>
  )
}
