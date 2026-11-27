import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { repairSteamGame } from '@/lib/tauri'
import { notify } from '@/lib/toast'

/** Details management row: Steam verifies the files, then setup steps run again. */
export function RepairAction({
  appId,
  title,
  disabled,
  order,
}: {
  appId: string
  title: string
  disabled?: boolean
  order: number
}) {
  const [starting, setStarting] = useState(false)
  const repair = async () => {
    setStarting(true)
    try {
      const where = await repairSteamGame(appId)
      notify.success(
        where === 'steam'
          ? { title: 'Steam is checking the files', message: title }
          : {
              title: 'Repair started',
              message: `Steam is checking ${title}. Progress shows in Downloads.`,
            },
      )
    } catch (error) {
      notify.error({
        title: 'Could not repair the game',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setStarting(false)
    }
  }
  return (
    <Focusable
      focusId="details-repair"
      group="details-management"
      order={order}
      noScale
      disabled={disabled || starting}
      onClick={() => void repair()}
      className="disabled:cursor-wait disabled:opacity-40"
    >
      <Wrench size={16} />
      <span>
        Repair installation
        <small>
          {disabled
            ? 'End your session first'
            : 'Verify every file with Steam and rerun its setup steps'}
        </small>
      </span>
    </Focusable>
  )
}
