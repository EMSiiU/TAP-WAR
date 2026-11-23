import arenaData from '../../../../packages/shared/arena.json' with { type: 'json' }

export type MapSize = 'small' | 'medium' | 'large'
export type RoomCapacity = 4 | 10 | 20

export type ArenaObstacle = {
  x: number
  y: number
  width: number
  height: number
}

export type ArenaPoint = {
  x: number
  y: number
}

export type ArenaMapConfig = {
  id: MapSize
  label: string
  maxPlayers: RoomCapacity
  width: number
  height: number
  playerRadius: number
  pickupIntervalMs: number
  pickupSpawnPoints: ArenaPoint[]
  spawnPoints: ArenaPoint[]
  obstacles: ArenaObstacle[]
}

export type PublicRoomSummary = {
  code: string
  name: string
  mapSize: MapSize
  clients: number
  maxClients: number
  phase: 'waiting' | 'playing' | 'finished'
  hostName: string
}

export type RoomJoinRequest =
  | {
      mode: 'create'
      maxPlayers: RoomCapacity
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

export function getArenaMap(mapSize: MapSize): ArenaMapConfig {
  const maps = arenaData.maps as Record<MapSize, ArenaMapConfig>
  return maps[mapSize] ?? maps.small
}

export function normalizeRoomCode(raw: string): string {
  const normalized = raw.replace(/\s+/g, '').toUpperCase()
  return /^[A-Z0-9]{4,12}$/.test(normalized) ? normalized : ''
}
