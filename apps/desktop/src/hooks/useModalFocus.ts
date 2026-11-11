import { useEffect } from 'react'
import { focusManager } from '@/controllers/FocusManager'

export function useModalFocus(open: boolean, group: string, initialFocusId: string) {
  useEffect(() => {
    if (!open) return

    focusManager.setGroupPreference(group, { trap: true })

    const focusModal = () => {
      const focused = focusManager.getFocusedNode()
      if (focused?.group === group) return true

      if (focusManager.hasNode(initialFocusId)) {
        focusManager.pushFocus(initialFocusId)
      } else {
        focusManager.moveToGroup(group, true)
      }

      return focusManager.getFocusedNode()?.group === group
    }

    if (!focusModal()) {
      const timer = window.setInterval(() => {
        if (focusModal()) {
          window.clearInterval(timer)
        }
      }, 32)

      const timeout = window.setTimeout(() => {
        window.clearInterval(timer)
      }, 600)

      return () => {
        window.clearInterval(timer)
        window.clearTimeout(timeout)
        focusManager.setGroupPreference(null, { trap: false })
        focusManager.popFocus()
      }
    }

    return () => {
      focusManager.setGroupPreference(null, { trap: false })
      focusManager.popFocus()
    }
  }, [open, group, initialFocusId])
}
