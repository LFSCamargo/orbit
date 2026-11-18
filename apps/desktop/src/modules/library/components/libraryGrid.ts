/** The library's card grid, shared by the real cards and their skeletons so
 * loading placeholders sit exactly where the cards will. */
export const LIBRARY_ENTRY_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))] gap-6 max-[1100px]:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-[1100px]:gap-[18px]'

/** The card's shell: glass panel with 22 px corners. */
export const LIBRARY_CARD_SHELL = 'orbit-panel rounded-[22px]'
