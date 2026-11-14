import { create } from 'zustand'

interface SteamActivityState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useSteamActivityStore = create<SteamActivityState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}))
