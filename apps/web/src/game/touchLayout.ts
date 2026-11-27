export type TouchControlSlotId = 'move' | 'aim' | 'dash' | 'melee' | 'reload' | 'emotes' | 'menu'

export type TouchControlSlot = {
  x: number
  y: number
  scale: number
}

export type TouchControlLayout = Record<TouchControlSlotId, TouchControlSlot>

export type TouchLayoutByOrientation = {
  landscape: TouchControlLayout
  portrait: TouchControlLayout
}

export const TOUCH_CONTROL_SLOT_META: { id: TouchControlSlotId; label: string }[] = [
  { id: 'move', label: 'Joystick Mover' },
  { id: 'aim', label: 'Disparo / Apuntar' },
  { id: 'dash', label: 'Dash' },
  { id: 'melee', label: 'Melé' },
  { id: 'reload', label: 'Recargar' },
  { id: 'emotes', label: 'Emotes' },
  { id: 'menu', label: 'Menú' },
]

export const TOUCH_SLOT_MIN_X = 0.06
export const TOUCH_SLOT_MAX_X = 0.94
export const TOUCH_SLOT_MIN_Y = 0.08
export const TOUCH_SLOT_MAX_Y = 0.92
export const TOUCH_SLOT_MIN_SCALE = 0.75
export const TOUCH_SLOT_MAX_SCALE = 1.35

export const DEFAULT_TOUCH_LAYOUTS: TouchLayoutByOrientation = {
  landscape: {
    move: { x: 0.11, y: 0.74, scale: 1 },
    emotes: { x: 0.11, y: 0.14, scale: 1 },
    menu: { x: 0.90, y: 0.14, scale: 1 },
    melee: { x: 0.83, y: 0.35, scale: 1 },
    reload: { x: 0.93, y: 0.35, scale: 1 },
    dash: { x: 0.88, y: 0.53, scale: 1 },
    aim: { x: 0.89, y: 0.78, scale: 1 },
  },
  portrait: {
    move: { x: 0.20, y: 0.85, scale: 1 },
    emotes: { x: 0.16, y: 0.65, scale: 1 },
    menu: { x: 0.84, y: 0.65, scale: 1 },
    aim: { x: 0.80, y: 0.85, scale: 1 },
    dash: { x: 0.50, y: 0.89, scale: 1 },
    melee: { x: 0.50, y: 0.75, scale: 1 },
    reload: { x: 0.84, y: 0.74, scale: 1 },
  },
}

const LEGACY_DEFAULT_LANDSCAPE_V1: TouchControlLayout = {
  move: { x: 0.11, y: 0.72, scale: 1 },
  emotes: { x: 0.10, y: 0.16, scale: 1 },
  menu: { x: 0.90, y: 0.14, scale: 1 },
  aim: { x: 0.89, y: 0.72, scale: 1 },
  dash: { x: 0.74, y: 0.80, scale: 1 },
  melee: { x: 0.76, y: 0.50, scale: 1 },
  reload: { x: 0.90, y: 0.41, scale: 1 },
}

const STORAGE_KEY = 'tapwar.touchLayout.v1'
const ACCOUNT_ID_PATTERN = /^[0-9a-f-]{36}$/i

function cloneOrientationLayout(side: TouchControlLayout): TouchControlLayout {
  return {
    move: { ...side.move },
    aim: { ...side.aim },
    dash: { ...side.dash },
    melee: { ...side.melee },
    reload: { ...side.reload },
    emotes: { ...side.emotes },
    menu: { ...side.menu },
  }
}

function isExactLayoutMatch(a: TouchControlLayout, b: TouchControlLayout): boolean {
  return TOUCH_CONTROL_SLOT_META.every(
    ({ id }) => a[id].x === b[id].x && a[id].y === b[id].y && a[id].scale === b[id].scale,
  )
}

export function cloneTouchLayouts(source: TouchLayoutByOrientation = DEFAULT_TOUCH_LAYOUTS): TouchLayoutByOrientation {
  return {
    landscape: cloneOrientationLayout(source.landscape),
    portrait: cloneOrientationLayout(source.portrait),
  }
}

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value * 1000) / 1000))
}

export function clampTouchSlot(
  raw: unknown,
  fallback: TouchControlSlot = { x: 0.5, y: 0.5, scale: 1 },
): TouchControlSlot {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...fallback }
  }
  const obj = raw as Record<string, unknown>
  return {
    x: clampFinite(obj.x, TOUCH_SLOT_MIN_X, TOUCH_SLOT_MAX_X, fallback.x),
    y: clampFinite(obj.y, TOUCH_SLOT_MIN_Y, TOUCH_SLOT_MAX_Y, fallback.y),
    scale: clampFinite(obj.scale, TOUCH_SLOT_MIN_SCALE, TOUCH_SLOT_MAX_SCALE, fallback.scale),
  }
}

function sanitizeOrientationLayout(raw: unknown, fallback: TouchControlLayout): TouchControlLayout {
  const result: TouchControlLayout = {
    move: { ...fallback.move },
    aim: { ...fallback.aim },
    dash: { ...fallback.dash },
    melee: { ...fallback.melee },
    reload: { ...fallback.reload },
    emotes: { ...fallback.emotes },
    menu: { ...fallback.menu },
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return result
  }
  const entries = raw as Record<string, unknown>
  for (const { id } of TOUCH_CONTROL_SLOT_META) {
    result[id] = clampTouchSlot(entries[id], fallback[id])
  }
  return result
}

export function sanitizeTouchLayouts(raw: unknown): TouchLayoutByOrientation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return cloneTouchLayouts(DEFAULT_TOUCH_LAYOUTS)
  }
  const obj = raw as Record<string, unknown>
  const landscape = sanitizeOrientationLayout(obj.landscape, DEFAULT_TOUCH_LAYOUTS.landscape)
  return {
    landscape: isExactLayoutMatch(landscape, LEGACY_DEFAULT_LANDSCAPE_V1)
      ? cloneOrientationLayout(DEFAULT_TOUCH_LAYOUTS.landscape)
      : landscape,
    portrait: sanitizeOrientationLayout(obj.portrait, DEFAULT_TOUCH_LAYOUTS.portrait),
  }
}

export function touchLayoutStorageKey(accountId?: string | null): string {
  if (typeof accountId === 'string' && ACCOUNT_ID_PATTERN.test(accountId)) {
    return `${STORAGE_KEY}.${accountId.toLowerCase()}`
  }
  return STORAGE_KEY
}

export function loadLocalTouchLayouts(
  accountId?: string | null,
  storage?: Pick<Storage, 'getItem'>,
): TouchLayoutByOrientation {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!target) return cloneTouchLayouts()
    const scopedKey = touchLayoutStorageKey(accountId)
    const raw = target.getItem(scopedKey) ?? (scopedKey !== STORAGE_KEY ? target.getItem(STORAGE_KEY) : null)
    if (!raw) return cloneTouchLayouts()
    return sanitizeTouchLayouts(JSON.parse(raw))
  } catch {
    return cloneTouchLayouts()
  }
}

export function saveLocalTouchLayouts(
  layouts: TouchLayoutByOrientation,
  accountId?: string | null,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!target) return
    const serialized = JSON.stringify(sanitizeTouchLayouts(layouts))
    const scopedKey = touchLayoutStorageKey(accountId)
    target.setItem(scopedKey, serialized)
    if (scopedKey !== STORAGE_KEY) {
      target.setItem(STORAGE_KEY, serialized)
    }
  } catch {
    // Ignore storage quota or private-mode restrictions.
  }
}
