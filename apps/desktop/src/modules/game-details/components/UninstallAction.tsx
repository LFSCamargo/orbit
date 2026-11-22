import { useState } from 'react'
import { PackageX } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { UninstallDialog } from '@/components/game/UninstallDialog'
import { formatBytes } from '@/lib/format'

/** Details management row that uninstalls a game Orbit downloaded. */
export function UninstallAction({
  appId,
  title,
  sizeBytes,
  provider,
  disabled,
  order,
}: {
  appId: string
  title: string
  sizeBytes: number | null
  provider?: 'steam' | 'ms-store'
  disabled?: boolean
  order: number
}) {
  const [open, setOpen] = useState(false)
  const size = sizeBytes ? ` (${formatBytes(sizeBytes)})` : ''
  return (
    <>
      <Focusable
        focusId="details-uninstall"
        group="details-management"
        order={order}
        noScale
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="disabled:cursor-wait disabled:opacity-40"
      >
        <PackageX size={16} />
        <span>
          Uninstall
          <small>
            {disabled ? 'End your session first' : `Free up space on this Mac${size}`}
          </small>
        </span>
      </Focusable>
      <UninstallDialog
        game={open ? { appId, title, sizeBytes, provider } : null}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
