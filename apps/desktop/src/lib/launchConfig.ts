import type { LaunchConfiguration } from '@/types/game'

export function hasEditableLaunchPath(
  config: LaunchConfiguration,
): config is Extract<
  LaunchConfiguration,
  { type: 'wine' } | { type: 'open-file' } | { type: 'open-application' }
> {
  return (
    config.type === 'wine' ||
    config.type === 'open-file' ||
    config.type === 'open-application'
  )
}

export function getEditableLaunchPath(config: LaunchConfiguration): string | null {
  if (!hasEditableLaunchPath(config)) return null
  if (config.type === 'wine') return config.profile.executable
  return config.type === 'open-file' ? config.filePath : config.applicationPath
}

export function setEditableLaunchPath(
  config: LaunchConfiguration,
  path: string,
): LaunchConfiguration {
  if (config.type === 'wine')
    return { ...config, profile: { ...config.profile, executable: path } }
  if (config.type === 'open-file') {
    return { ...config, filePath: path, applicationPath: undefined }
  }
  if (config.type === 'open-application') {
    return { ...config, applicationPath: path }
  }
  return config
}

export function launchPathFieldLabel(config: LaunchConfiguration): string {
  if (config.type === 'open-application') return 'Application path'
  return 'Game file path'
}

export function launchPathHint(config: LaunchConfiguration): string {
  if (config.type === 'open-application') {
    return 'Path to the .app bundle if the game stopped launching.'
  }
  return 'Path to the ROM or executable. Fix this if the game opens the wrong file or fails to launch.'
}
