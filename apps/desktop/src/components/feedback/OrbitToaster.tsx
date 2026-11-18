import { Toaster } from 'sonner'

/** Mount once at the app root. Above drawers and dialogs, clear of the footer. */
export function OrbitToaster() {
  return (
    <Toaster
      position="bottom-right"
      offset={{ bottom: 64, right: 24 }}
      gap={10}
      visibleToasts={4}
      toastOptions={{ unstyled: true }}
      style={{ zIndex: 120 }}
    />
  )
}
