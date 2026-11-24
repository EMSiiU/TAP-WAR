import type { MapEnvironment, MapSize, RoomCapacity } from '../../../../packages/shared/mapCatalog.ts'
export { getArenaMap, buildMapLayers, normalizeEnvironment, ENVIRONMENT_OPTIONS } from '../../../../packages/shared/mapCatalog.ts'
export type { ArenaMapConfig, ArenaObstacle, ArenaPoint, MapEnvironment, MapSize, RoomCapacity } from '../../../../packages/shared/mapCatalog.ts'

export type PublicRoomSummary = {
  code: string
  name: string
  mapSize: MapSize
  environment: MapEnvironment
  clients: number
  maxClients: number
  phase: 'waiting' | 'playing' | 'finished'
  hostName: string
}

export type RoomJoinRequest =
  | {
      mode: 'create'
      maxPlayers: RoomCapacity
      environment?: MapEnvironment
      isPrivate: boolean
      roomName: string
    }
  | {
      mode: 'join'
      code: string
    }

export const MAP_OPTIONS: {
  maxPlayers: RoomCapacity
  mapSize: MapSize
  label: string
  dimensionsLabel: string
}[] = [
  { maxPlayers: 4, mapSize: 'small', label: 'Pequeño', dimensionsLabel: '4 jugadores · 1024×768' },
  { maxPlayers: 10, mapSize: 'medium', label: 'Mediano', dimensionsLabel: '10 jugadores · 1600×1152' },
  { maxPlayers: 20, mapSize: 'large', label: 'Grande', dimensionsLabel: '20 jugadores · 2240×1600' },
]

export const MAP_LABEL_BY_SIZE: Record<MapSize, string> = {
  small: 'Pequeño',
  medium: 'Mediano',
  large: 'Grande',
}

export function normalizeRoomCode(raw: string): string {
  const normalized = raw.replace(/\s+/g, '').toUpperCase()
  return /^[A-Z0-9]{4,12}$/.test(normalized) ? normalized : ''
}
