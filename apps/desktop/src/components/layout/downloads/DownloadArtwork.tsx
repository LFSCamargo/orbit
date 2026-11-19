import { useState } from 'react'
import { Download } from 'lucide-react'
import { steamCoverCandidates } from '@/lib/steamArtwork'

/** Portrait cover for a transfer; falls back through Steam's art, then an icon. */
export function DownloadArtwork({
  appId,
  preferred,
}: {
  appId: string | null
  preferred?: string | null
}) {
  const candidates = appId ? steamCoverCandidates(appId, preferred) : []
  const [failed, setFailed] = useState(0)
  const src = candidates[failed]
  return (
    <div className="grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/10">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed((value) => value + 1)}
        />
      ) : (
        <Download size={16} className="text-white/60" aria-hidden />
      )}
    </div>
  )
}
