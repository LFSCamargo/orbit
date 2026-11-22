import { useEffect, useRef, useState } from 'react'
import { Loader2, Menu } from 'lucide-react'
import { requestFullscreen } from '@/hooks/useFullscreen'
import { useUiStore } from '@/stores/ui.store'
import { useXcloudPlayerStore } from '@/stores/xcloudPlayer.store'
import { runStream, type StreamStatus } from './runStream'
import { createXcloudPeer } from './xcloudPeer'
import { useStreamStandDown } from './hooks/useStreamStandDown'
import type { GamepadFrame } from './inputPacket'

const STATUS_TEXT: Record<Exclude<StreamStatus, 'playing'>, string> = {
  starting: 'Starting the game…',
  queued: 'Waiting in line for a cloud server…',
  connecting: 'Connecting…',
}
/** Holding View + Menu this long opens Orbit's menu (B belongs to the game). */
const MENU_HOLD_MS = 1500

/** Orbit's Home menu, over a paused stream. */
function openMenu() {
  useXcloudPlayerStore.getState().pause()
  useUiStore.getState().openHomeMenu()
}

/** Xbox Cloud Gaming in Orbit's own full-screen player. Mounted once in App. */
export function XcloudPlayer() {
  const stream = useXcloudPlayerStore((s) => s.stream)
  if (!stream) return null
  return (
    <PlayerSurface
      key={stream.productId}
      title={stream.title}
      productId={stream.productId}
    />
  )
}

function PlayerSurface({ productId, title }: { productId: string; title: string }) {
  const close = useXcloudPlayerStore((s) => s.close)
  const paused = useXcloudPlayerStore((s) => s.paused)
  const videoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<ReturnType<typeof createXcloudPeer> | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const exitHeldSince = useRef<number | null>(null)
  const guideHeld = useRef(false)
  const [status, setStatus] = useState<StreamStatus>('starting')
  const [error, setError] = useState('')
  const [chrome, setChrome] = useState(true)
  useStreamStandDown(paused)

  const leave = () => {
    stopRef.current?.()
    stopRef.current = null
    close()
  }
  const leaveRef = useRef(leave)
  leaveRef.current = leave

  // Full screen while streaming; give the window back as it was.
  useEffect(() => {
    const wasFullscreen = useUiStore.getState().fullscreen
    if (!wasFullscreen) requestFullscreen(true)
    return () => {
      if (!wasFullscreen) requestFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const controller = new AbortController()
    const onFrame = (frame: GamepadFrame) => {
      // The guide button opens Orbit's menu on press, even for pads the
      // native Home listener does not know.
      if (frame.nexus && !guideHeld.current) openMenu()
      guideHeld.current = frame.nexus
      if (frame.view && frame.menu) {
        exitHeldSince.current ??= performance.now()
        if (performance.now() - exitHeldSince.current >= MENU_HOLD_MS) {
          exitHeldSince.current = null
          openMenu()
        }
      } else {
        exitHeldSince.current = null
      }
    }
    const peer = createXcloudPeer(video, { onEnded: () => leaveRef.current(), onFrame })
    peerRef.current = peer
    runStream({
      productId,
      peer,
      onStatus: setStatus,
      onEnded: () => leaveRef.current(),
      signal: controller.signal,
    })
      .then((stop) => {
        if (controller.signal.aborted) stop()
        else stopRef.current = stop
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      controller.abort()
      stopRef.current?.()
      stopRef.current = null
      peer.close()
      peerRef.current = null
    }
  }, [productId])

  // Home (from any path) opens Orbit's menu: the stream pauses behind it.
  useEffect(
    () =>
      useUiStore.subscribe((state, previous) => {
        if (state.homeMenuOpen && !previous.homeMenuOpen) {
          useXcloudPlayerStore.getState().pause()
        }
      }),
    [],
  )

  // Paused: keep the connection, hide and mute the stream, stop input.
  useEffect(() => {
    peerRef.current?.setPaused(paused)
    if (videoRef.current) videoRef.current.muted = paused
  }, [paused])

  useEffect(() => {
    if (paused) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      openMenu()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [paused])

  // The leave button shows on mouse movement and fades once playing.
  useEffect(() => {
    if (status !== 'playing') return
    let timer = window.setTimeout(() => setChrome(false), 2500)
    const onMove = () => {
      setChrome(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setChrome(false), 2500)
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
    }
  }, [status])

  return (
    <div
      role="dialog"
      aria-modal={paused ? undefined : true}
      aria-label={title}
      hidden={paused}
      className="fixed inset-0 z-[300] bg-black text-white"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="size-full object-contain"
        aria-label={`${title} stream`}
      />
      {(status !== 'playing' || error) && (
        <div className="absolute inset-0 grid place-items-center bg-black/70">
          <div className="grid max-w-md justify-items-center gap-3 px-6 text-center">
            <h2 className="m-0 text-2xl font-semibold">{title}</h2>
            {error ? (
              <>
                <p role="alert" className="m-0 text-[15px] text-rose-300">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={leave}
                  className="rounded-full bg-white/15 px-5 py-2 text-sm font-semibold hover:bg-white/25"
                >
                  Close
                </button>
              </>
            ) : (
              <p
                role="status"
                className="m-0 flex items-center gap-2 text-[15px] text-white/80"
              >
                <Loader2
                  size={16}
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
                {STATUS_TEXT[status as Exclude<StreamStatus, 'playing'>]}
              </p>
            )}
            {!error && (
              <p className="m-0 text-xs text-white/50">
                Home, Esc or hold View + Menu for the menu
              </p>
            )}
          </div>
        </div>
      )}
      {status === 'playing' && !error && (
        <button
          type="button"
          onClick={openMenu}
          aria-label="Open menu"
          className={`absolute right-5 top-5 grid size-10 place-items-center rounded-full bg-black/60 transition-opacity hover:bg-black/80 ${
            chrome ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <Menu size={18} aria-hidden />
        </button>
      )}
    </div>
  )
}
