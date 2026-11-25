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
export const DASH_RECHARGE_MS = 10_000
export const SHIELD_DURATION_MS = 10_000
export const GOLDEN_DURATION_MS = 15_000
export const MEDKIT_HEAL_AMOUNT = 50
export const MAX_RESERVE_MAGAZINES = 3
export const LAUNCHER_EXPLOSION_RADIUS = 128
export const LAUNCHER_INNER_RADIUS = 32
export const LAUNCHER_MIN_DAMAGE_RATIO = 0.25

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

export function calculateExplosionDamage(
  distance: number,
  radius: number,
  maxDamage: number,
  innerRadius = LAUNCHER_INNER_RADIUS,
  minRatio = LAUNCHER_MIN_DAMAGE_RATIO,
): number {
  if (!Number.isFinite(distance) || distance < 0 || distance > radius || radius <= 0) {
    return 0
  }
  if (distance <= innerRadius || radius <= innerRadius) {
    return Math.round(maxDamage)
  }
  const t = Math.max(0, Math.min(1, (distance - innerRadius) / (radius - innerRadius)))
  return Math.max(1, Math.round(maxDamage * (1 - (1 - minRatio) * t)))
}

export function scaledSpawnIntervalMs(baseIntervalMs: number, playerCount: number): number {
  const extraPlayers = Math.max(0, playerCount - 2)
  const speedMultiplier = Math.min(3.5, 1 + extraPlayers * 0.22)
  return Math.max(2500, Math.round(baseIntervalMs / speedMultiplier))
}

export function maxActiveItemsForPlayers(
  playerCount: number,
  mapSize: 'small' | 'medium' | 'large',
  kind: 'weapon' | 'powerup',
): number {
  const mapMax =
    mapSize === 'large'
      ? kind === 'powerup'
        ? 16
        : 12
      : mapSize === 'medium'
        ? kind === 'powerup'
          ? 10
          : 8
        : kind === 'powerup'
          ? 6
          : 5
  const baseMin = kind === 'powerup' ? 3 : 2
  const scaled = Math.ceil(Math.max(2, playerCount) * (kind === 'powerup' ? 1.0 : 0.85))
  return Math.min(mapMax, Math.max(baseMin, scaled))
}
