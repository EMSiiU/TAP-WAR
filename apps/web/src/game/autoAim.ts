import type { GameMode } from '../../../../packages/shared/gameplay.ts'

export type AutoAimCandidate = {
  id: string
  x: number
  y: number
  isDead: boolean
  team?: 'orange' | 'blue' | ''
}

export const AUTO_AIM_MAX_RANGE = 680

export function findAutoAimTarget(
  local: AutoAimCandidate,
  players: readonly AutoAimCandidate[],
  gameMode: GameMode,
  maxRange = AUTO_AIM_MAX_RANGE,
): AutoAimCandidate | null {
  let best: AutoAimCandidate | null = null
  let bestDistSq = maxRange * maxRange

  for (const other of players) {
    if (other.id === local.id || other.isDead) continue
    if (gameMode === 'tdm' && local.team && other.team === local.team) continue

    const dx = other.x - local.x
    const dy = other.y - local.y
    const distSq = dx * dx + dy * dy
    if (distSq <= bestDistSq) {
      bestDistSq = distSq
      best = other
    }
  }

  return best
}

export function findAutoAimAngle(
  local: AutoAimCandidate,
  players: readonly AutoAimCandidate[],
  gameMode: GameMode,
  fallbackAngle: number,
  weaponOffsetY = -10,
  maxRange = AUTO_AIM_MAX_RANGE,
): { angle: number; target: AutoAimCandidate | null } {
  const target = findAutoAimTarget(local, players, gameMode, maxRange)
  if (!target) {
    return { angle: fallbackAngle, target: null }
  }
  const raw = Math.atan2(target.y - (local.y + weaponOffsetY), target.x - local.x)
  return {
    angle: raw === Math.PI ? -Math.PI : raw,
    target,
  }
}
