import { create } from 'zustand'
import type { GameSession } from '@/types/game'

interface SessionState {
  activeSession: GameSession | null
  setActiveSession: (session: GameSession | null) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSession: null,
  setActiveSession: (session) => set({ activeSession: session }),
}))
