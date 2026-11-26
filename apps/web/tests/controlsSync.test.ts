import test from 'node:test'
import assert from 'node:assert/strict'
import {
  loadAccountDeviceControls,
  saveAccountDeviceControls,
  type ControlsRemoteStore,
  type DeviceControlsRow,
} from '../src/game/controlsSync.ts'
import { getOrCreateDeviceIdentity, DEVICE_ID_STORAGE_KEY, isValidUuid } from '../src/game/deviceIdentity.ts'
import { detectDeviceProfile } from '../src/game/deviceInput.ts'
import { DEFAULT_PC_CONTROLS } from '../src/game/keybindings.ts'
import { DEFAULT_TOUCH_LAYOUTS } from '../src/game/touchLayout.ts'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  }
}

test('getOrCreateDeviceIdentity genera UUID persistente y detectDeviceProfile distingue desktop/movil/tablet', () => {
  const storage = memoryStorage()
  const pcEnv = {
    userAgentData: { mobile: false, platform: 'Windows' },
    maxTouchPoints: 10,
  }
  const first = getOrCreateDeviceIdentity(storage, pcEnv)
  assert.equal(isValidUuid(first.deviceKey), true)
  assert.equal(first.deviceType, 'desktop')
  assert.equal(first.deviceLabel, 'Windows · PC')
  assert.equal(storage.getItem(DEVICE_ID_STORAGE_KEY), first.deviceKey)

  const second = getOrCreateDeviceIdentity(storage, pcEnv)
  assert.equal(second.deviceKey, first.deviceKey)

  assert.equal(
    detectDeviceProfile({ userAgentData: { mobile: true, platform: 'Android' }, maxTouchPoints: 5 }).deviceType,
    'mobile',
  )
  assert.equal(
    detectDeviceProfile({ userAgentData: { mobile: false, platform: 'Android' }, maxTouchPoints: 5 }).deviceType,
    'tablet',
  )
  assert.equal(
    detectDeviceProfile({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }).deviceType,
    'tablet',
  )
})

test('loadAccountDeviceControls separa estrictamente PC de movil y prefiere coincidencia exacta', async () => {
  const accountId = '11111111-1111-4111-8111-111111111111'
  const pcIdentity = { deviceKey: 'aaaa1111-1111-4111-8111-111111111111', deviceType: 'desktop' as const, deviceLabel: 'Windows · PC' }
  const mobileIdentity = { deviceKey: 'bbbb2222-2222-4222-8222-222222222222', deviceType: 'mobile' as const, deviceLabel: 'Android · Móvil' }

  const rows: DeviceControlsRow[] = [
    {
      account_id: accountId,
      device_key: 'cccc3333-3333-4333-8333-333333333333',
      device_type: 'mobile',
      device_label: 'Otro Móvil',
      pc_controls: { dash: 'KeyF' },
      touch_layout: { landscape: { dash: { x: 0.68, y: 0.42, scale: 1.1 } } },
    },
    {
      account_id: accountId,
      device_key: pcIdentity.deviceKey,
      device_type: 'desktop',
      device_label: pcIdentity.deviceLabel,
      pc_controls: { dash: 'ShiftLeft', reload: '<bad>' },
      touch_layout: null,
    },
  ]

  const store: ControlsRemoteStore = {
    async fetchRows() {
      return { data: rows, error: null }
    },
    async upsertRow(row) {
      rows.unshift(row)
      return { error: null }
    },
  }

  // En PC: carga la config exacta del PC (ignorando el móvil aunque fuera más reciente) y sanea '<bad>'
  const pcLoaded = await loadAccountDeviceControls({
    store,
    accountId,
    identity: pcIdentity,
    storage: memoryStorage(),
  })
  assert.equal(pcLoaded.syncStatus, 'synced')
  assert.equal(pcLoaded.pcControls.dash, 'ShiftLeft')
  assert.equal(pcLoaded.pcControls.reload, DEFAULT_PC_CONTROLS.reload)

  // En un móvil nuevo con misma cuenta: hereda del otro dispositivo 'mobile', nunca del 'desktop'
  const mobileLoaded = await loadAccountDeviceControls({
    store,
    accountId,
    identity: mobileIdentity,
    storage: memoryStorage(),
  })
  assert.equal(mobileLoaded.syncStatus, 'synced')
  assert.deepEqual(mobileLoaded.touchLayouts.landscape.dash, { x: 0.68, y: 0.42, scale: 1.1 })
})

test('si la tabla user_device_controls falta en Supabase, degrada a cache local sin romper', async () => {
  const accountId = '11111111-1111-4111-8111-111111111111'
  const storage = memoryStorage()
  const identity = getOrCreateDeviceIdentity(storage, {
    userAgentData: { mobile: false, platform: 'Linux' },
  })

  const missingTableStore: ControlsRemoteStore = {
    async fetchRows() {
      return { data: null, error: { code: 'PGRST205', message: 'Could not find the table public.user_device_controls in schema cache' } }
    },
    async upsertRow() {
      return { error: { code: '42P01', message: 'relation "user_device_controls" does not exist' } }
    },
  }

  const saveStatus = await saveAccountDeviceControls({
    store: missingTableStore,
    accountId,
    identity,
    pcControls: { ...DEFAULT_PC_CONTROLS, dash: 'KeyQ', reload: 'Space', shoot: 'Mouse0', melee: 'Mouse2', emote1: 'Digit1', emote2: 'Digit2', moveUp: 'KeyW', moveDown: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD' },
    touchLayouts: DEFAULT_TOUCH_LAYOUTS,
    storage,
  })
  assert.equal(saveStatus, 'pending-migration')

  const loaded = await loadAccountDeviceControls({
    store: missingTableStore,
    accountId,
    identity,
    storage,
  })
  assert.equal(loaded.syncStatus, 'pending-migration')
  assert.equal(loaded.pcControls.dash, 'KeyQ')
})
