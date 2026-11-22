import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  isTauriRuntime,
  listMsStoreCatalog,
  msStoreAuthCancel,
  msStoreAuthStart,
  msStoreAuthStatus,
  msStoreSignOut,
} from '@/lib/tauri'

const MSSTORE_AUTH_KEY = ['msstore-auth-status'] as const
const MSSTORE_CATALOG_KEY = ['msstore-catalog'] as const

export function useMsStoreStatus(enabled = true) {
  const client = useQueryClient()

  useEffect(() => {
    if (!enabled || !isTauriRuntime()) return
    let active = true
    let unlistenAuth: (() => void) | undefined
    let unlistenLib: (() => void) | undefined
    void listen('msstore-auth-changed', () => {
      void client.invalidateQueries({ queryKey: MSSTORE_AUTH_KEY })
      void client.invalidateQueries({ queryKey: MSSTORE_CATALOG_KEY })
      void client.invalidateQueries({ queryKey: ['library'] })
    }).then((stop) => {
      if (active) unlistenAuth = stop
      else stop()
    })
    void listen('msstore-library-updated', () => {
      void client.invalidateQueries({ queryKey: MSSTORE_CATALOG_KEY })
      void client.invalidateQueries({ queryKey: ['library'] })
      void client.invalidateQueries({ queryKey: ['library-entry'] })
      void client.invalidateQueries({ queryKey: ['games'] })
    }).then((stop) => {
      if (active) unlistenLib = stop
      else stop()
    })
    return () => {
      active = false
      unlistenAuth?.()
      unlistenLib?.()
    }
  }, [client, enabled])

  return useQuery({
    queryKey: MSSTORE_AUTH_KEY,
    queryFn: msStoreAuthStatus,
    enabled,
  })
}

export function useMsStoreSignIn() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: msStoreAuthStart,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: MSSTORE_AUTH_KEY })
      void client.invalidateQueries({ queryKey: MSSTORE_CATALOG_KEY })
      void client.invalidateQueries({ queryKey: ['library'] })
    },
  })
}

export function useMsStoreCancelSignIn() {
  return useMutation({ mutationFn: msStoreAuthCancel })
}

export function useMsStoreSignOut() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: msStoreSignOut,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: MSSTORE_AUTH_KEY })
      void client.invalidateQueries({ queryKey: MSSTORE_CATALOG_KEY })
      void client.invalidateQueries({ queryKey: ['library'] })
    },
  })
}

export function useMsStoreCatalog(enabled = true) {
  return useQuery({
    queryKey: MSSTORE_CATALOG_KEY,
    queryFn: () => listMsStoreCatalog(false),
    enabled,
    staleTime: 10 * 60 * 1000,
  })
}
