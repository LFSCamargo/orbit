import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

interface DrawerContextValue {
  openDrawer: (content: ReactNode) => void
  closeDrawer: () => void
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

/** Root-level drawer host. Portal rendering keeps drawers above transformed pages. */
export function DrawerProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null)
  const openDrawer = useCallback((next: ReactNode) => setContent(next), [])
  const closeDrawer = useCallback(() => setContent(null), [])
  const value = useMemo(() => ({ openDrawer, closeDrawer }), [openDrawer, closeDrawer])

  return (
    <DrawerContext.Provider value={value}>
      {children}
      {content ? createPortal(content, document.body) : null}
    </DrawerContext.Provider>
  )
}

export function useDrawer(): DrawerContextValue {
  const context = useContext(DrawerContext)
  if (!context) throw new Error('useDrawer must be used inside DrawerProvider')
  return context
}
