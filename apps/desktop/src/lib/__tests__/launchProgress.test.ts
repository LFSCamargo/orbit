import { expect, it } from 'vitest'
import {
  launchCaption,
  launchStepIndex,
  launchStepLabel,
  launchStepStatus,
  playExitMessage,
} from '../launchProgress'

it('orders Steam Windows launch steps for the overlay', () => {
  expect(launchStepIndex('container')).toBe(2)
  expect(launchStepIndex('steam')).toBe(4)
  expect(launchStepIndex('cloud')).toBe(5)
  expect(launchStepIndex('login')).toBe(6)
  expect(launchStepIndex('prefix')).toBe(7)
  expect(launchStepLabel('steam')).toBe('Linking Steam into the container')
  expect(launchStepLabel('steam')).not.toMatch(/Seeding/)
  expect(launchStepLabel('graphics')).toBe('Applying graphics settings')
  expect(launchStepLabel('unknown')).toBe('Launching…')
})

it('marks the failed step so the overlay can show where startup stopped', () => {
  expect(launchStepStatus({ step: 'prefix', failed: false }, 'resolve')).toBe('done')
  expect(launchStepStatus({ step: 'prefix', failed: false }, 'prefix')).toBe('current')
  expect(launchStepStatus({ step: 'prefix', failed: false }, 'spawn')).toBe('pending')
  expect(launchStepStatus({ step: 'prefix', failed: true }, 'prefix')).toBe('failed')
  expect(launchStepStatus({ step: 'prefix', failed: true }, 'resolve')).toBe('done')
})

it('explains Steamworks exit 53 instead of a raw code', () => {
  expect(playExitMessage(53)).toMatch(/Steam was not ready/)
  expect(playExitMessage(53)).toMatch(/update window/)
  expect(playExitMessage(1)).toContain('1')
})

it('uses a single caption on the banner instead of a step checklist', () => {
  expect(
    launchCaption({
      message: 'Preparing the Windows environment',
      failed: false,
    }),
  ).toBe('Preparing the Windows environment…')
  expect(launchCaption({ message: 'Starting…', failed: false })).toBe('Starting…')
  expect(
    launchCaption({
      message: 'DXMT NVIDIA extensions require the DXMT graphics engine',
      failed: true,
    }),
  ).toBe('DXMT NVIDIA extensions require the DXMT graphics engine')
})
