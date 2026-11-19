import { act, cleanup, render, screen } from '@testing-library/react'
import { motion } from 'framer-motion'
import { afterEach, expect, it } from 'vitest'
import { DrawerProvider, useDrawer } from '../DrawerProvider'

afterEach(cleanup)

let drawer: ReturnType<typeof useDrawer>
function Capture() {
  drawer = useDrawer()
  return null
}

it('keeps a closing drawer mounted until its exit animation has run', async () => {
  render(
    <DrawerProvider>
      <Capture />
    </DrawerProvider>,
  )
  act(() =>
    drawer.openDrawer(
      <motion.div
        data-testid="drawer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
      />,
    ),
  )
  expect(screen.getByTestId('drawer')).toBeInTheDocument()
  act(() => drawer.closeDrawer())
  // Still there while it fades out, then gone.
  expect(screen.getByTestId('drawer')).toBeInTheDocument()
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)))
  expect(screen.queryByTestId('drawer')).not.toBeInTheDocument()
})

it('removes drawers without exit animations at once', () => {
  render(
    <DrawerProvider>
      <Capture />
    </DrawerProvider>,
  )
  act(() => drawer.openDrawer(<div data-testid="plain" />))
  act(() => drawer.closeDrawer())
  expect(screen.queryByTestId('plain')).not.toBeInTheDocument()
})
