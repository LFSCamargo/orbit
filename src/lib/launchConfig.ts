import type { LaunchConfiguration } from '@/types/game'

export function hasEditableLaunchPath(
  config: LaunchConfiguration,
): config is Extract<
  LaunchConfiguration,
  { type: 'open-file' } | { type: 'open-application' } | { type: 'gamehub' }
> {
  return (
    config.type === 'open-file' ||
    config.type === 'open-application' ||
    config.type === 'gamehub'
  )
}

export function getEditableLaunchPath(config: LaunchConfiguration): string | null {
  if (!hasEditableLaunchPath(config)) return null
  if (config.type === 'gamehub') return config.shortcutAppPath
  return config.type === 'open-file' ? config.filePath : config.applicationPath
}

export function setEditableLaunchPath(
  config: LaunchConfiguration,
  path: string,
): LaunchConfiguration {
  if (config.type === 'open-file') {
    return { ...config, filePath: path, applicationPath: undefined }
  }
  if (config.type === 'open-application') {
    return { ...config, applicationPath: path }
  }
  if (config.type === 'gamehub') {
    return { ...config, shortcutAppPath: path }
  }
  return config
}

export function launchPathFieldLabel(config: LaunchConfiguration): string {
  if (config.type === 'gamehub') return 'Shortcut .app path'
  if (config.type === 'open-application') return 'Application path'
  return 'Game file path'
}

export function launchPathHint(config: LaunchConfiguration): string {
  if (config.type === 'gamehub') {
    return 'Path to the game shortcut in ~/Applications. In GameHub, use “Create shortcut” for the title first. Orbit opens GameHub, then this .app.'
  }
  if (config.type === 'open-application') {
    return 'Path to the .app bundle if the game stopped launching.'
  }
  return 'Path to the ROM or executable. Fix this if the game opens the wrong file or fails to launch.'
}

export const GAMEHUB_SETUP_STEPS = [
  'Install and open GameHub.',
  'Add your Windows game inside GameHub.',
  'In GameHub, create a shortcut — it appears as a .app with bundle id com.gamehub.shortcut.*.',
  'Import shortcuts here in Orbit. Only verified GameHub shortcuts are added.',
]
