import { isOrbitManagedDownload, selectInstallation } from './libraryEntries'
import type { LibraryEntry, LibraryInstallation } from '@/types/library'

export type DetailsActionKind =
  'play' | 'cancel' | 'stop' | 'install' | 'sign-in' | 'setup' | 'locate'

export type DetailsPrimaryAction = {
  kind: DetailsActionKind
  label: string
  gameId?: string
  installation?: LibraryInstallation
}

/** Resolve the single primary details action from title state. O(installations). */
export function detailsPrimaryAction(input: {
  entry: LibraryEntry
  running: boolean
  launching: boolean
  cancelling: boolean
  signedIn: boolean
}): DetailsPrimaryAction {
  const installation = selectInstallation(input.entry)
  // Cloud games stream in the browser: always playable, never installed.
  if (input.entry.game.provider === 'xcloud') {
    return {
      kind: 'play',
      label: input.launching ? 'Opening…' : 'Play',
      gameId: input.entry.game.id,
      installation,
    }
  }
  if (input.cancelling) return { kind: 'cancel', label: 'Cancelling…', installation }
  if (input.running)
    return {
      kind: 'stop',
      label: 'Stop game',
      gameId: installation?.gameId,
      installation,
    }
  if (input.launching && installation?.launchType === 'wine') {
    return { kind: 'cancel', label: 'Cancel launch', installation }
  }
  if (input.launching && installation?.available) {
    return {
      kind: 'play',
      label: 'Launching…',
      gameId: installation.gameId,
      installation,
    }
  }
  if (installation?.available) {
    if (needsSteamAccount(input.entry, installation) && !input.signedIn) {
      return { kind: 'sign-in', label: 'Sign in to Steam' }
    }
    return {
      kind: 'play',
      label: input.entry.game.totalPlaytimeSeconds > 0 ? 'Continue playing' : 'Play now',
      gameId: installation.gameId,
      installation,
    }
  }
  if (installation && !installation.available) {
    return {
      kind: 'locate',
      label: 'Locate installation',
      gameId: installation.gameId,
      installation,
    }
  }
  if (input.entry.owned && input.entry.steamAppId) {
    if (!input.signedIn) return { kind: 'sign-in', label: 'Sign in to Steam' }
    return { kind: 'install', label: 'Install' }
  }
  if (input.entry.game.launchConfig.type === 'wine') {
    return { kind: 'setup', label: 'Set up compatibility' }
  }
  return { kind: 'locate', label: 'Locate installation', gameId: input.entry.game.id }
}

function needsSteamAccount(entry: LibraryEntry, installation: LibraryInstallation) {
  return Boolean(
    entry.steamAppId &&
    installation.platform === 'windows' &&
    installation.launchType === 'wine',
  )
}

export { isOrbitManagedDownload }
