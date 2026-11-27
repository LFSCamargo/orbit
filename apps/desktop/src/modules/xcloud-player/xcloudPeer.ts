// The WebRTC side of an xCloud stream, in Orbit's own page (no xbox.com).
//
// Channels and messages follow xbox.com's web player: `message` (JSON
// handshake and client configuration), `control` (authorization, gamepad
// slots, keyframe requests), `input` (binary reports, see inputPacket.ts) and
// `chat`. Signalling (SDP and ICE) goes through Rust, which holds the tokens.

import type { XcloudIceCandidate } from '@/types/xcloud'
import { frameFromGamepad, sameFrame } from './gamepadFrame'
import {
  clientMetadataPacket,
  inputPacket,
  NEUTRAL_FRAME,
  REPORT,
  type GamepadFrame,
  type VideoFrameTiming,
} from './inputPacket'
import { teredoEndpoint } from './teredo'
import { keyframeDue, STALL_MS } from './keyframePolicy'

const INPUT_INTERVAL_MS = 16
const ICE_GATHER_TIMEOUT_MS = 3000
/** Fixed value xbox.com's player sends with its authorization request. */
const CONTROL_ACCESS_KEY = '4BDB3609-C1F1-4195-9B37-FEFF45DA8B8E' // gitleaks:allow

export interface XcloudPeerEvents {
  /** The server ended the session (e.g. the game was quit in-stream). */
  onEnded: () => void
  /** Every input tick, for the player's own exit chord. */
  onFrame?: (frame: GamepadFrame) => void
}

export interface XcloudPeer {
  offer: () => Promise<string>
  setAnswer: (sdp: string) => Promise<void>
  localCandidates: () => Promise<XcloudIceCandidate[]>
  addRemoteCandidates: (candidates: XcloudIceCandidate[]) => Promise<void>
  /** While paused the game gets a released pad and no further input. */
  setPaused: (paused: boolean) => void
  close: () => void
}

function message(target: string, content: unknown) {
  return JSON.stringify({
    type: 'Message',
    content: JSON.stringify(content),
    id: crypto.randomUUID(),
    target,
    cv: '',
  })
}

/** H.264 first (High, then Baseline), as xbox.com does. */
function preferH264(transceiver: RTCRtpTransceiver) {
  const codecs = RTCRtpReceiver.getCapabilities?.('video')?.codecs
  if (!codecs || typeof transceiver.setCodecPreferences !== 'function') return
  const rank = (codec: RTCRtpCodec) => {
    const fmtp = codec.sdpFmtpLine ?? ''
    if (!codec.mimeType.includes('H264')) return 3
    if (fmtp.includes('profile-level-id=4d')) return 0
    if (fmtp.includes('profile-level-id=42e')) return 1
    return 2
  }
  try {
    transceiver.setCodecPreferences([...codecs].sort((a, b) => rank(a) - rank(b)))
  } catch {
    // Keep WebKit's own order.
  }
}

export function createXcloudPeer(
  video: HTMLVideoElement,
  events: XcloudPeerEvents,
): XcloudPeer {
  const pc = new RTCPeerConnection()
  const media = new MediaStream()
  const candidates: RTCIceCandidate[] = []
  const timers: number[] = []
  let closed = false
  let paused = false
  let sequence = 0
  let lastFrame: GamepadFrame = NEUTRAL_FRAME
  let timings: VideoFrameTiming[] = []
  let lastVideoFrameAt: number | null = null
  let lastKeyframeRequestAt = 0

  pc.addTransceiver('audio', { direction: 'sendrecv' })
  preferH264(pc.addTransceiver('video', { direction: 'recvonly' }))
  pc.ontrack = (event) => {
    media.addTrack(event.track)
    if (video.srcObject !== media) video.srcObject = media
    void video.play().catch(() => undefined)
  }
  pc.onicecandidate = (event) => {
    if (event.candidate) candidates.push(event.candidate)
  }

  const control = pc.createDataChannel('control', {
    protocol: 'controlV1',
    ordered: true,
  })
  const input = pc.createDataChannel('input', { protocol: '1.0', ordered: true })
  const messages = pc.createDataChannel('message', {
    protocol: 'messageV1',
    ordered: true,
  })
  pc.createDataChannel('chat', { protocol: 'chatV1', ordered: true })
  input.binaryType = 'arraybuffer'

  const send = (channel: RTCDataChannel, data: string | Uint8Array) => {
    if (channel.readyState !== 'open') return
    if (typeof data === 'string') channel.send(data)
    else channel.send(data as Uint8Array<ArrayBuffer>)
  }

  // Video frame timings ride along with input, as xbox.com reports them.
  const watchFrames = () => {
    if (closed || typeof video.requestVideoFrameCallback !== 'function') return
    video.requestVideoFrameCallback((now, meta) => {
      lastVideoFrameAt = now
      timings.push({
        serverDataKey: meta.rtpTimestamp ?? 0,
        receivedMs: meta.receiveTime ?? 0,
        displayMs: meta.expectedDisplayTime,
      })
      if (timings.length > 30) timings.splice(0, timings.length - 30)
      watchFrames()
    })
  }

  const inputTick = () => {
    const pad = navigator.getGamepads?.().find((entry) => entry?.connected) ?? null
    const raw = pad && !paused ? frameFromGamepad(pad, 0) : NEUTRAL_FRAME
    events.onFrame?.(raw)
    // Home (guide) belongs to Orbit's menu, never to the game.
    const frame = { ...raw, nexus: false }
    if (paused && sameFrame(frame, lastFrame)) {
      timings = []
      return
    }
    const changed = !sameFrame(frame, lastFrame)
    if (changed || timings.length > 0) {
      send(input, inputPacket(++sequence, timings, [frame], performance.now()))
      timings = []
      lastFrame = frame
    }
  }

  const startInput = () => {
    send(input, clientMetadataPacket(sequence, 1, performance.now()))
    timers.push(window.setInterval(inputTick, INPUT_INTERVAL_MS))
    watchFrames()
  }

  input.onmessage = (event) => {
    if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 13) return
    const view = new DataView(event.data)
    if (view.getUint8(0) !== REPORT.vibration) return
    const pad = navigator.getGamepads?.().find((entry) => entry?.connected)
    const actuator = (
      pad as (Gamepad & { vibrationActuator?: GamepadHapticActuator }) | undefined
    )?.vibrationActuator
    void actuator
      ?.playEffect?.('dual-rumble', {
        duration: view.getUint16(8, true),
        startDelay: view.getUint16(10, true),
        strongMagnitude: Math.min(1, view.getUint8(4) / 100),
        weakMagnitude: Math.min(1, view.getUint8(5) / 100),
      })
      .catch(() => undefined)
  }

  messages.onopen = () => {
    send(
      messages,
      JSON.stringify({
        type: 'Handshake',
        version: 'messageV1',
        id: crypto.randomUUID(),
        cv: '0',
      }),
    )
  }
  messages.onmessage = (event) => {
    let data: { type?: string; target?: string; id?: string }
    try {
      data = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (data.type === 'HandshakeAck') {
      send(
        control,
        JSON.stringify({
          message: 'authorizationRequest',
          accessKey: CONTROL_ACCESS_KEY,
        }),
      )
      send(
        control,
        JSON.stringify({ message: 'gamepadChanged', gamepadIndex: 0, wasAdded: true }),
      )
      // A keyframe only when the picture froze: periodic ones spike the
      // bitrate and hitch the stream.
      timers.push(
        window.setInterval(() => {
          const check = {
            now: performance.now(),
            paused,
            lastFrameAt: lastVideoFrameAt,
            lastRequestAt: lastKeyframeRequestAt,
          }
          if (keyframeDue(check)) requestKeyframe()
        }, STALL_MS / 2),
      )
      startInput()
      sendClientConfig()
      return
    }
    if (data.type !== 'Message' && data.type !== 'TransactionStart') return
    if (
      data.target === '/streaming/sessionLifetimeManagement/serverInitiatedDisconnect'
    ) {
      complete(data.id, '')
      events.onEnded()
      return
    }
    // System dialogs (e.g. "Quit game?") take the default answer.
    if (data.target === '/streaming/systemUi/messages/ShowMessageDialog')
      complete(data.id, { Result: 0 })
  }

  const requestKeyframe = () => {
    lastKeyframeRequestAt = performance.now()
    send(
      control,
      JSON.stringify({ message: 'videoKeyframeRequested', ifrRequested: true }),
    )
  }

  const complete = (id: string | undefined, content: unknown) => {
    if (!id) return
    send(
      messages,
      JSON.stringify({
        type: 'TransactionComplete',
        content: JSON.stringify(content),
        id,
        cv: '',
      }),
    )
  }

  const sendClientConfig = () => {
    const width = 1920
    const height = 1080
    send(
      messages,
      message('/streaming/systemUi/configuration', { version: [0, 2, 0], systemUis: [] }),
    )
    send(
      messages,
      message('/streaming/properties/clientappinstallidchanged', {
        clientAppInstallId: crypto.randomUUID(),
      }),
    )
    send(
      messages,
      message('/streaming/characteristics/orientationchanged', { orientation: 0 }),
    )
    send(
      messages,
      message('/streaming/characteristics/touchinputenabledchanged', {
        touchInputEnabled: false,
      }),
    )
    send(messages, message('/streaming/characteristics/clientdevicecapabilities', {}))
    send(
      messages,
      message('/streaming/characteristics/dimensionschanged', {
        horizontal: width,
        vertical: height,
        preferredWidth: width,
        preferredHeight: height,
        safeAreaLeft: 0,
        safeAreaTop: 0,
        safeAreaRight: width,
        safeAreaBottom: height,
        supportsCustomResolution: true,
      }),
    )
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed')
      events.onEnded()
  }

  return {
    async offer() {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      // Stereo game audio.
      offer.sdp = offer.sdp?.replace('useinbandfec=1', 'useinbandfec=1; stereo=1')
      await pc.setLocalDescription(offer)
      return offer.sdp ?? ''
    },
    async setAnswer(sdp) {
      await pc.setRemoteDescription({ type: 'answer', sdp })
    },
    async localCandidates() {
      if (pc.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, ICE_GATHER_TIMEOUT_MS)
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') {
              window.clearTimeout(timer)
              resolve()
            }
          })
        })
      }
      return candidates.map((candidate) => ({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      }))
    },
    async addRemoteCandidates(remote) {
      for (const candidate of remote) {
        if (candidate.candidate === 'a=end-of-candidates') continue
        const base = { sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex }
        const teredo = teredoEndpoint(candidate.candidate.split(' ')[4] ?? '')
        if (teredo) {
          for (const [foundation, port] of [
            [10, 9002],
            [11, teredo.port],
          ]) {
            await pc
              .addIceCandidate({
                ...base,
                candidate: `a=candidate:${foundation} 1 UDP 1 ${teredo.address} ${port} typ host `,
              })
              .catch(() => undefined)
          }
        }
        await pc
          .addIceCandidate({ ...base, candidate: candidate.candidate })
          .catch(() => undefined)
      }
    },
    setPaused(next) {
      // Coming back from the menu starts from a clean picture.
      if (paused && !next) requestKeyframe()
      paused = next
    },
    close() {
      if (closed) return
      closed = true
      for (const timer of timers) window.clearInterval(timer)
      pc.close()
      for (const track of media.getTracks()) track.stop()
      video.srcObject = null
    },
  }
}
