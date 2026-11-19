import { create } from 'zustand'

// Which catalog version each Compatibility row is showing. Rows are grouped, so
// the browse position is keyed by group and kept out of the components: tabs
// mount and unmount, and a picked version must not silently jump back to the
// newest installed one when the user returns.
export const useComponentBrowseStore = create<{
  views: Record<string, string>
  setView: (groupId: string, key: string) => void
  viewFor: (groupId: string) => string
}>((set, get) => ({
  views: {},
  setView: (groupId, key) =>
    set((state) => ({ views: { ...state.views, [groupId]: key } })),
  viewFor: (groupId) => get().views[groupId] ?? '',
}))
