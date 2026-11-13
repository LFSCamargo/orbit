import { create } from 'zustand'
import type { CompatibilitySettings } from '@/types/runtime'

// Session-only draft: navigation preserves edits, but launching reads saved Rust settings.
export const useGraphicsDraft = create<{
  draft: CompatibilitySettings | null
  saving: boolean
  setDraft: (draft: CompatibilitySettings | null) => void
  setSaving: (saving: boolean) => void
}>((set) => ({
  draft: null,
  saving: false,
  setDraft: (draft) => set({ draft }),
  setSaving: (saving) => set({ saving }),
}))
