import { randomInt } from 'node:crypto'
export { getArenaMap, normalizeEnvironment } from '../../../../packages/shared/mapCatalog.js'
export type { ArenaMapConfig, ArenaObstacle, ArenaPoint, MapEnvironment, MapSize, RoomCapacity } from '../../../../packages/shared/mapCatalog.js'
export { normalizeGameMode } from '../../../../packages/shared/gameplay.js'
export type { GameMode, PowerUpKind, TeamId } from '../../../../packages/shared/gameplay.js'
import type { MapSize, RoomCapacity } from '../../../../packages/shared/mapCatalog.js'

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6
export const MAX_ACTIVE_ROOMS = 50

const activeCodes = new Set<string>()

export function mapSizeForCapacity(maxPlayers: unknown): {
  maxPlayers: RoomCapacity
  mapSize: MapSize
} {
  if (maxPlayers === 10 || maxPlayers === '10') {
    return { maxPlayers: 10, mapSize: 'medium' }
  }
  if (maxPlayers === 20 || maxPlayers === '20') {
    return { maxPlayers: 20, mapSize: 'large' }
  }
  return { maxPlayers: 4, mapSize: 'small' }
}

export function allocateRoomCode(): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = ''
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
    }
    if (!activeCodes.has(code)) {
      activeCodes.add(code)
      return code
    }
  }
  throw new Error('No se pudo asignar un código único para la sala.')
}

export function releaseRoomCode(code: string): void {
  if (code) activeCodes.delete(code)
}

export function activeRoomCount(): number {
  return activeCodes.size
}

export function sanitizeRoomName(raw: unknown, fallbackCode: string): string {
  if (typeof raw !== 'string') return `Sala ${fallbackCode}`
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32)
  return cleaned || `Sala ${fallbackCode}`
}

export function normalizeRoomCode(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const normalized = raw.replace(/\s+/g, '').toUpperCase()
  return /^[A-Z0-9]{4,12}$/.test(normalized) ? normalized : ''
}
