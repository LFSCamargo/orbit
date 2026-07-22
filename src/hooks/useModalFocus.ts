import { useEffect } from 'react'
import { focusManager } from '@/controllers/FocusManager'

export function useModalFocus(open: boolean, group: string, initialFocusId: string) {
  useEffect(() => {
    if (!open) return

    focusManager.setGroupPreference(group)
    focusManager.pushFocus(initialFocusId)

    return () => {
      focusManager.setGroupPreference(null)
      focusManager.popFocus()
    }
  }, [open, group, initialFocusId])
}
