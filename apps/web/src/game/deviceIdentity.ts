import { detectDeviceProfile, type DeviceEnvironment, type DeviceType } from './deviceInput.ts'

export type DeviceIdentity = {
  deviceKey: string
  deviceType: DeviceType
  deviceLabel: string
}

export const DEVICE_ID_STORAGE_KEY = 'tapwar.deviceId.v1'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function generateUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().toLowerCase()
  }
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Builds a stable per-browser UUID (`deviceKey`) paired with detected device category/label
 * so one account can keep separate control layouts on desktop, phone, and tablet.
 */
export function getOrCreateDeviceIdentity(
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
  env?: DeviceEnvironment,
): DeviceIdentity {
  const { deviceType, deviceLabel } = detectDeviceProfile(env)
  let deviceKey: string

  try {
    const target =
      storage ??
      (typeof window !== 'undefined' ? window.localStorage : undefined)
    const existing = target?.getItem(DEVICE_ID_STORAGE_KEY)
    if (isValidUuid(existing)) {
      deviceKey = existing.toLowerCase()
    } else {
      deviceKey = generateUuid()
      target?.setItem(DEVICE_ID_STORAGE_KEY, deviceKey)
    }
  } catch {
    deviceKey = generateUuid()
  }

  return { deviceKey, deviceType, deviceLabel }
}
