import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime, mockInvoke } from '@/lib/devMockApi'

export interface DialogFilter {
  name: string
  extensions: string[]
}

export interface OpenDialogOptions {
  title?: string
  filters?: DialogFilter[]
  multiple?: boolean
  directory?: boolean
  defaultPath?: string
}

/**
 * Main-thread-safe open panel (replaces @tauri-apps/plugin-dialog `open` on macOS).
 */
export async function open(
  options: OpenDialogOptions = {},
): Promise<string | string[] | null> {
  if (!isTauriRuntime()) {
    return mockInvoke<string | null>('pick_open_path', { options })
  }

  const selected = await invoke<string | null>('pick_open_path', { options })
  if (selected == null) {
    return null
  }
  return options.multiple ? [selected] : selected
}
