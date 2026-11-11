import { describe, expect, it } from 'vitest'
import {
  getEditableLaunchPath,
  hasEditableLaunchPath,
  launchPathFieldLabel,
  setEditableLaunchPath,
} from '@/lib/launchConfig'
import type { LaunchConfiguration } from '@/types/game'

const openFile: LaunchConfiguration = {
  type: 'open-file',
  filePath: '/Games/title.nsp',
}

const openApp: LaunchConfiguration = {
  type: 'open-application',
  applicationPath: '/Applications/Game.app',
}

const gamehub: LaunchConfiguration = {
  type: 'gamehub',
  gamehubAppPath: '/Applications/GameHub.app',
  shortcutAppPath: '/Users/me/Applications/Title.app',
}

const steam: LaunchConfiguration = { type: 'steam', appId: '123' }
const openUrl: LaunchConfiguration = { type: 'open-url', url: 'https://example.com' }

describe('hasEditableLaunchPath', () => {
  it('is true for open-file, open-application, and gamehub', () => {
    expect(hasEditableLaunchPath(openFile)).toBe(true)
    expect(hasEditableLaunchPath(openApp)).toBe(true)
    expect(hasEditableLaunchPath(gamehub)).toBe(true)
  })

  it('is false for non-path configs', () => {
    expect(hasEditableLaunchPath(steam)).toBe(false)
    expect(hasEditableLaunchPath(openUrl)).toBe(false)
  })
})

describe('getEditableLaunchPath', () => {
  it('reads the editable path for each supported type', () => {
    expect(getEditableLaunchPath(openFile)).toBe('/Games/title.nsp')
    expect(getEditableLaunchPath(openApp)).toBe('/Applications/Game.app')
    expect(getEditableLaunchPath(gamehub)).toBe('/Users/me/Applications/Title.app')
  })

  it('returns null for non-editable configs', () => {
    expect(getEditableLaunchPath(steam)).toBeNull()
  })
})

describe('setEditableLaunchPath', () => {
  it('updates open-file and clears applicationPath', () => {
    const updated = setEditableLaunchPath(
      { ...openFile, applicationPath: '/Apps/Astris.app' },
      '/Games/new.nsp',
    )
    expect(updated).toEqual({
      type: 'open-file',
      filePath: '/Games/new.nsp',
      applicationPath: undefined,
    })
  })

  it('updates open-application path', () => {
    expect(setEditableLaunchPath(openApp, '/Applications/Other.app')).toEqual({
      type: 'open-application',
      applicationPath: '/Applications/Other.app',
    })
  })

  it('updates gamehub shortcut path', () => {
    expect(setEditableLaunchPath(gamehub, '/Users/me/Applications/New.app')).toEqual({
      ...gamehub,
      shortcutAppPath: '/Users/me/Applications/New.app',
    })
  })

  it('leaves non-editable configs unchanged', () => {
    expect(setEditableLaunchPath(steam, '/ignored')).toBe(steam)
  })
})

describe('launchPathFieldLabel', () => {
  it('returns the field label for each config type', () => {
    expect(launchPathFieldLabel(gamehub)).toBe('Shortcut .app path')
    expect(launchPathFieldLabel(openApp)).toBe('Application path')
    expect(launchPathFieldLabel(openFile)).toBe('Game file path')
    expect(launchPathFieldLabel(steam)).toBe('Game file path')
  })
})
