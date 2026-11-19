import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SteamLoginPoll } from '@/types/steam'

/**
 * One Steam sign-in attempt: opens Steam's own window through
 * `SteamClientSignIn` and refreshes every view that depends on the account.
 */
export function useSteamSignIn() {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const starting = useRef(false)

  const start = useCallback(() => {
    if (starting.current || open) return
    starting.current = true
    setLibraryError(null)
    setAttempt((value) => value + 1)
    setOpen(true)
  }, [open])

  const finish = useCallback(
    (result: SteamLoginPoll) => {
      starting.current = false
      if (result.status) {
        client.setQueryData(['steam-windows-status'], result.status)
      }
      for (const key of ['steam-windows-library', 'library', 'library-entry', 'games']) {
        void client.invalidateQueries({ queryKey: [key] })
      }
      setLibraryError(result.libraryError)
      setOpen(false)
    },
    [client],
  )

  const close = useCallback(() => {
    starting.current = false
    setOpen(false)
  }, [])

  return { open, attempt, libraryError, start, finish, close }
}
