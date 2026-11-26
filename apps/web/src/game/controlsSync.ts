import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeviceIdentity } from './deviceIdentity.ts'
import type { DeviceType } from './deviceInput.ts'
import {
  loadPcControls,
  sanitizePcControls,
  savePcControls,
  type PcControlConfig,
} from './keybindings.ts'
import {
  loadLocalTouchLayouts,
  sanitizeTouchLayouts,
  saveLocalTouchLayouts,
  type TouchLayoutByOrientation,
} from './touchLayout.ts'

export type ControlsSyncStatus = 'local' | 'synced' | 'pending-migration' | 'error'

export type DeviceControlsRow = {
  account_id: string
  device_key: string
  device_type: DeviceType
  device_label: string
  pc_controls: unknown
  touch_layout: unknown
  updated_at?: string
}

export type SupabaseControlsError = {
  code?: string
  message?: string
}

export type ControlsRemoteStore = {
  fetchRows: (accountId: string) => Promise<{ data: DeviceControlsRow[] | null; error: SupabaseControlsError | null }>
  upsertRow: (row: DeviceControlsRow) => Promise<{ error: SupabaseControlsError | null }>
}

export function createSupabaseControlsStore(client: SupabaseClient | null): ControlsRemoteStore | null {
  if (!client) return null
  return {
    async fetchRows(accountId: string) {
      const { data, error } = await client
        .from('user_device_controls')
        .select('account_id, device_key, device_type, device_label, pc_controls, touch_layout, updated_at')
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false })
        .limit(20)
      return {
        data: Array.isArray(data) ? (data as DeviceControlsRow[]) : null,
        error: error ? { code: error.code, message: error.message } : null,
      }
    },
    async upsertRow(row: DeviceControlsRow) {
      const { error } = await client
        .from('user_device_controls')
        .upsert(row, { onConflict: 'account_id,device_key' })
      return {
        error: error ? { code: error.code, message: error.message } : null,
      }
    },
  }
}

function isMissingTableError(error: SupabaseControlsError | null | undefined): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /user_device_controls/i.test(error.message ?? '') && /exist|not found|schema cache/i.test(error.message ?? '')
  )
}

export function controlsSyncMessage(status: ControlsSyncStatus, deviceLabel: string): string {
  if (status === 'synced') {
    return `Sincronizado en tu cuenta para ${deviceLabel} (Supabase + caché local).`
  }
  if (status === 'pending-migration') {
    return `Guardado localmente para ${deviceLabel}. Aplica la migración SQL de user_device_controls en Supabase para sincronizar entre sesiones.`
  }
  if (status === 'error') {
    return `Guardado localmente para ${deviceLabel}; no se pudo sincronizar con Supabase ahora.`
  }
  return `Guardado en este navegador (${deviceLabel}).`
}

/**
 * Loads controls for the current account + device identity:
 * 1. Starts from sanitized localStorage cache.
 * 2. Queries Supabase rows for this account, preferring exact `device_key`, or falling back
 *    strictly to the newest row of the SAME `device_type` so PC and mobile never overwrite each other.
 */
export async function loadAccountDeviceControls({
  client,
  store,
  accountId,
  identity,
  storage,
}: {
  client?: SupabaseClient | null
  store?: ControlsRemoteStore | null
  accountId: string
  identity: DeviceIdentity
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}): Promise<{
  pcControls: PcControlConfig
  touchLayouts: TouchLayoutByOrientation
  syncStatus: ControlsSyncStatus
}> {
  let pcControls = loadPcControls(storage, accountId)
  let touchLayouts = loadLocalTouchLayouts(accountId, storage)

  const remote = store !== undefined ? store : createSupabaseControlsStore(client ?? null)
  if (!remote) {
    return { pcControls, touchLayouts, syncStatus: 'local' }
  }

  try {
    const { data, error } = await remote.fetchRows(accountId)
    if (error) {
      return {
        pcControls,
        touchLayouts,
        syncStatus: isMissingTableError(error) ? 'pending-migration' : 'error',
      }
    }

    const rows = data ?? []
    const exactMatch = rows.find((row) => row.device_key === identity.deviceKey)
    const sameTypeMatch =
      exactMatch ?? rows.find((row) => row.device_type === identity.deviceType)

    if (sameTypeMatch) {
      if (sameTypeMatch.pc_controls && typeof sameTypeMatch.pc_controls === 'object') {
        pcControls = sanitizePcControls(sameTypeMatch.pc_controls)
        savePcControls(pcControls, storage, accountId)
      }
      if (sameTypeMatch.touch_layout && typeof sameTypeMatch.touch_layout === 'object') {
        touchLayouts = sanitizeTouchLayouts(sameTypeMatch.touch_layout)
        saveLocalTouchLayouts(touchLayouts, accountId, storage)
      }
    }

    return { pcControls, touchLayouts, syncStatus: 'synced' }
  } catch {
    return { pcControls, touchLayouts, syncStatus: 'error' }
  }
}

/**
 * Persists sanitized controls immediately to per-account localStorage and upserts to Supabase
 * keyed by `(account_id, device_key)` so desktop, mobile, and tablet settings stay independent.
 */
export async function saveAccountDeviceControls({
  client,
  store,
  accountId,
  identity,
  pcControls,
  touchLayouts,
  storage,
}: {
  client?: SupabaseClient | null
  store?: ControlsRemoteStore | null
  accountId: string
  identity: DeviceIdentity
  pcControls: PcControlConfig
  touchLayouts: TouchLayoutByOrientation
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}): Promise<ControlsSyncStatus> {
  const safePc = sanitizePcControls(pcControls)
  const safeTouch = sanitizeTouchLayouts(touchLayouts)
  savePcControls(safePc, storage, accountId)
  saveLocalTouchLayouts(safeTouch, accountId, storage)

  const remote = store !== undefined ? store : createSupabaseControlsStore(client ?? null)
  if (!remote) {
    return 'local'
  }

  try {
    const { error } = await remote.upsertRow({
      account_id: accountId,
      device_key: identity.deviceKey,
      device_type: identity.deviceType,
      device_label: identity.deviceLabel.slice(0, 64),
      pc_controls: safePc,
      touch_layout: safeTouch,
    })
    if (error) {
      return isMissingTableError(error) ? 'pending-migration' : 'error'
    }
    return 'synced'
  } catch {
    return 'error'
  }
}
