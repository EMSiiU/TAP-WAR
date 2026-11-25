export type GameMode = 'ffa' | 'tdm' | 'gungame'
export type PowerUpKind = 'ammo' | 'medkit' | 'shield' | 'dash' | 'golden'
export type TeamId = 'orange' | 'blue'

export const GAME_MODE_OPTIONS = [
  {
    id: 'ffa',
    label: 'Todos contra todos',
    shortLabel: 'FFA',
    description: 'Cada jugador por su cuenta. Gana el primero en llegar a 20 bajas.',
  },
  {
    id: 'tdm',
    label: 'Duelo por equipos',
    shortLabel: 'Equipos',
    description: 'Equipo Naranja vs Equipo Azul, sin fuego amigo. Gana el equipo líder.',
  },
  {
    id: 'gungame',
    label: 'Juego de armas',
    shortLabel: 'Armas',
    description: 'Avanza por las 10 armas con cada baja y gana con el cuchillo final.',
  },
] as const

export const POWERUP_META: Record<
  PowerUpKind,
  { label: string; color: number; hex: string }
> = {
  ammo: { label: 'Cargador', color: 0xf59e0b, hex: '#f59e0b' },
  medkit: { label: 'Botiquín (+50)', color: 0x22c55e, hex: '#22c55e' },
  shield: { label: 'Escudo (10s)', color: 0x38bdf8, hex: '#38bdf8' },
  dash: { label: 'Recarga de Dash', color: 0x06b6d4, hex: '#06b6d4' },
  golden: { label: 'Power-Up Dorado', color: 0xfacc15, hex: '#facc15' },
}

export const GUN_GAME_LADDER = [
  'rifle',
  'smg',
  'shotgun',
  'plasma',
  'revolver',
  'pistol',
  'launcher',
  'sniper',
  'axe',
  'knife',
] as const

export const MAX_DASHES = 5
export const SHIELD_DURATION_MS = 10_000
export const SHIELD_NORMAL_AMOUNT = 50
export const GOLDEN_DURATION_MS = 15_000
export const GOLDEN_SHIELD_AMOUNT = 100
export const MEDKIT_HEAL_AMOUNT = 50
export const MAX_RESERVE_MAGAZINES = 3

export function normalizeGameMode(value: unknown): GameMode {
  if (value === 'tdm' || value === 'gungame') return value
  return 'ffa'
}

export function gameModeLabel(mode: GameMode): string {
  return GAME_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? 'Todos contra todos'
}

export function teamKillTargetForCapacity(maxPlayers: number): number {
  if (maxPlayers >= 20) return 60
  if (maxPlayers >= 10) return 40
  return 25
}
