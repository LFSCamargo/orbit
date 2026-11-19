import { ArrowUpRight, Download, Layers, Wifi } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { SteamClientSignIn } from '@/components/layout/SteamClientSignIn'
import { useSteamSignIn } from '@/hooks/useSteamSignIn'
import steamOrbit from '@/assets/illustrations/steam-orbit.png'
import { ROW } from './styles'

const LOCKED: Array<{ icon: LucideIcon; title: string; detail: string }> = [
  { icon: Download, title: 'Downloads', detail: 'Not available' },
  { icon: Layers, title: 'Queue', detail: 'Not available' },
  { icon: Wifi, title: 'Network', detail: 'Not connected' },
]

/** Shown until Steam is authorized; downloads need a saved Steam login. */
export function ConnectSteamCard() {
  const signIn = useSteamSignIn()
  return (
    <div className="grid gap-4">
      <div className="grid justify-items-center gap-2 text-center">
        <img
          src={steamOrbit}
          alt=""
          className="h-auto w-[220px] select-none drop-shadow-[0_12px_40px_rgb(40_120_255/0.35)]"
          draggable={false}
        />
        <h3 className="m-0 text-[1.05rem] font-[650]">Connect your Steam account</h3>
        <p className="m-0 max-w-[32ch] text-[13px] leading-[1.45] text-white/70">
          Authorize with Steam to download games from your library, manage a queue, and
          monitor network usage.
        </p>
        <Focusable
          focusId="steam-activity-connect"
          group="steam-activity"
          order={1}
          noScale
          disabled={signIn.open}
          onClick={signIn.start}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f7f8fb] px-4 py-2.5 text-[13px] font-[680] text-[#12141a] disabled:opacity-55"
        >
          Connect Steam
          <ArrowUpRight size={15} aria-hidden />
        </Focusable>
        {signIn.libraryError && (
          <p className="m-0 text-[13px] text-[#ffb4b4]" role="alert">
            {signIn.libraryError}
          </p>
        )}
      </div>
      <ul
        className="m-0 grid list-none gap-2 p-0"
        aria-label="Unavailable until Steam is connected"
      >
        {LOCKED.map(({ icon: Icon, title, detail }) => (
          <li key={title} className={`${ROW} opacity-80`}>
            <span className="grid size-9 place-items-center rounded-full bg-white/10">
              <Icon size={16} aria-hidden />
            </span>
            <span className="grid gap-0.5">
              <strong className="text-[13px] font-[650]">{title}</strong>
              <span className="text-[11px] text-white/55">{detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <SteamClientSignIn
        open={signIn.open}
        attempt={signIn.attempt}
        onSignedIn={signIn.finish}
        onClose={signIn.close}
      />
    </div>
  )
}
