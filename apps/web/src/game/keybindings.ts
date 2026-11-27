export type PcControlAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'shoot'
  | 'melee'
  | 'reload'
  | 'dash'
  | 'emote1'
  | 'emote2'
  | 'emote3'

export type PcControlConfig = Record<PcControlAction, string>

export const DEFAULT_PC_CONTROLS: PcControlConfig = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  shoot: 'Mouse0',
  melee: 'Mouse2',
  reload: 'KeyR',
  dash: 'Space',
  emote1: 'Digit1',
  emote2: 'Digit2',
  emote3: 'Digit3',
}

export const PC_CONTROL_LABELS: { action: PcControlAction; label: string; shortLabel: string }[] = [
  { action: 'moveUp', label: 'Mover arriba', shortLabel: 'Arriba' },
  { action: 'moveDown', label: 'Mover abajo', shortLabel: 'Abajo' },
  { action: 'moveLeft', label: 'Mover izquierda', shortLabel: 'Izquierda' },
  { action: 'moveRight', label: 'Mover derecha', shortLabel: 'Derecha' },
  { action: 'shoot', label: 'Disparar / Atacar', shortLabel: 'Disparar' },
  { action: 'melee', label: 'Melé rápido', shortLabel: 'Melé' },
  { action: 'reload', label: 'Recargar arma', shortLabel: 'Recargar' },
  { action: 'dash', label: 'Dash', shortLabel: 'Dash' },
  { action: 'emote1', label: 'Emote Risa', shortLabel: 'Risa' },
  { action: 'emote2', label: 'Emote Corazón', shortLabel: 'Corazón' },
  { action: 'emote3', label: 'Emote Personalizado', shortLabel: 'Emote 3' },
]

const STORAGE_KEY = 'tapwar.pcControls.v1'
const ACCOUNT_ID_PATTERN = /^[0-9a-f-]{36}$/i

// Strict allow-list for keyboard Event.code values and Mouse0/Mouse1/Mouse2.
const ALLOWED_BINDING_PATTERN =
  /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Tab|Enter|Backquote|Minus|Equal|Bracket(Left|Right)|Semicolon|Quote|Comma|Period|Slash|Mouse[0-2])$/

export function pcControlsStorageKey(accountId?: string | null): string {
  if (typeof accountId === 'string' && ACCOUNT_ID_PATTERN.test(accountId)) {
    return `${STORAGE_KEY}.${accountId.toLowerCase()}`
  }
  return STORAGE_KEY
}

export function isValidPcBinding(code: unknown): code is string {
  return typeof code === 'string' && ALLOWED_BINDING_PATTERN.test(code)
}

export function sanitizePcControls(raw: unknown): PcControlConfig {
  const result: PcControlConfig = { ...DEFAULT_PC_CONTROLS }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return result
  }

  const used = new Set<string>()
  const entries = raw as Record<string, unknown>

  for (const { action } of PC_CONTROL_LABELS) {
    const candidate = entries[action]
    if (isValidPcBinding(candidate) && !used.has(candidate)) {
      result[action] = candidate
      used.add(candidate)
    } else {
      used.add(result[action])
    }
  }

  return result
}

export function rebindPcControl(
  current: PcControlConfig,
  action: PcControlAction,
  newCode: string,
): PcControlConfig {
  if (!isValidPcBinding(newCode)) return current
  const next: PcControlConfig = { ...current }
  const previousCode = current[action]
  if (previousCode === newCode) return current

  // Swap if another action already uses newCode so no binding is lost.
  for (const key of Object.keys(next) as PcControlAction[]) {
    if (key !== action && next[key] === newCode) {
      next[key] = previousCode
      break
    }
  }

  next[action] = newCode
  return next
}

export function loadPcControls(
  storage?: Pick<Storage, 'getItem'>,
  accountId?: string | null,
): PcControlConfig {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!target) return { ...DEFAULT_PC_CONTROLS }
    const scopedKey = pcControlsStorageKey(accountId)
    const raw = target.getItem(scopedKey) ?? (scopedKey !== STORAGE_KEY ? target.getItem(STORAGE_KEY) : null)
    if (!raw) return { ...DEFAULT_PC_CONTROLS }
    return sanitizePcControls(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_PC_CONTROLS }
  }
}

export function savePcControls(
  controls: PcControlConfig,
  storage?: Pick<Storage, 'setItem'>,
  accountId?: string | null,
): void {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!target) return
    const serialized = JSON.stringify(sanitizePcControls(controls))
    const scopedKey = pcControlsStorageKey(accountId)
    target.setItem(scopedKey, serialized)
    if (scopedKey !== STORAGE_KEY) {
      target.setItem(STORAGE_KEY, serialized)
    }
  } catch {
    // Ignore storage quota or private-mode restrictions.
  }
}

export function formatBindingLabel(code: string): string {
  if (code === 'Mouse0') return 'Clic izq.'
  if (code === 'Mouse1') return 'Clic medio'
  if (code === 'Mouse2') return 'Clic der.'
  if (code === 'Space') return 'Espacio'
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift'
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl'
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt'
  if (code === 'ArrowUp') return '↑'
  if (code === 'ArrowDown') return '↓'
  if (code === 'ArrowLeft') return '←'
  if (code === 'ArrowRight') return '→'
  if (code.startsWith('Key') && code.length === 4) return code.slice(3)
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  return code
}

export function formatMoveGroupLabel(controls: PcControlConfig): string {
  return `${formatBindingLabel(controls.moveUp)}${formatBindingLabel(controls.moveLeft)}${formatBindingLabel(controls.moveDown)}${formatBindingLabel(controls.moveRight)}`
}
