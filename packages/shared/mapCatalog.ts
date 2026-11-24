import arenaData from './arena.json' with { type: 'json' }

export type MapSize = 'small' | 'medium' | 'large'
export type MapEnvironment = 'desert' | 'industrial'
export type RoomCapacity = 4 | 10 | 20
export type ArenaPoint = { x: number; y: number }
export type ArenaObstacle = ArenaPoint & { width: number; height: number; material?: 'rock' | 'wall' | 'crate' }
export type FloorZone = ArenaPoint & { width: number; height: number }
export type ArenaMapConfig = {
  id: MapSize
  environment: MapEnvironment
  label: string
  maxPlayers: RoomCapacity
  width: number
  height: number
  playerRadius: number
  pickupIntervalMs: number
  pickupSpawnPoints: ArenaPoint[]
  spawnPoints: ArenaPoint[]
  obstacles: ArenaObstacle[]
  routes: FloorZone[]
}

export const ENVIRONMENT_OPTIONS = [
  { id: 'desert', label: 'Cantera del desierto', description: 'Rocas, rutas abiertas y coberturas alrededor de la cantera central.' },
  { id: 'industrial', label: 'Planta industrial', description: 'Almacenes, maquinaria y corredores que conectan el patio central.' },
] as const

export function normalizeEnvironment(value: unknown): MapEnvironment {
  return value === 'industrial' ? 'industrial' : 'desert'
}

// Tile-aligned, authored floor plans. All solid art is derived from these
// rectangles; floor markings never introduce additional visual obstacles.
const INDUSTRIAL_PLANS: Record<MapSize, number[][]> = {
  small: [[8,6,4,2],[20,6,4,2],[8,16,4,2],[20,16,4,2],[14,10,4,4],[5,10,2,4],[25,10,2,4]],
  medium: [[8,8,8,2],[34,8,8,2],[8,26,8,2],[34,26,8,2],[8,16,2,4],[40,16,2,4],[22,16,6,4],[22,7,6,2],[22,27,6,2]],
  large: [[10,8,10,2],[50,8,10,2],[10,40,10,2],[50,40,10,2],
    [10,16,2,7],[58,16,2,7],[10,27,2,7],[58,27,2,7],
    [22,14,2,6],[46,14,2,6],[22,30,2,6],[46,30,2,6],
    [30,8,10,2],[30,40,10,2],[32,22,6,6],[17,24,3,2],[50,24,3,2]],
}

const tileRect = ([x,y,width,height]: number[]): FloorZone => ({ x:x*32, y:y*32, width:width*32, height:height*32 })

export function getArenaMap(size: MapSize, rawEnvironment: unknown = 'desert'): ArenaMapConfig {
  const environment = normalizeEnvironment(rawEnvironment)
  const base = arenaData.maps[size] ?? arenaData.maps.small
  const borders = base.obstacles.slice(0,4)
  const interior = environment === 'industrial'
    ? INDUSTRIAL_PLANS[base.id as MapSize].map((rect, index) => ({ ...tileRect(rect), material: index % 3 === 1 && rect[2]%2 === 0 && rect[3]%2 === 0 ? 'crate' as const : 'wall' as const }))
    : base.obstacles.slice(4).map(rect => ({ ...rect, material: 'rock' as const }))
  const centerX = base.width / 2
  const centerY = base.height / 2
  const routes = [tileRect([1, Math.floor(centerY/32)-2, base.width/32-2, 4]),
    tileRect([Math.floor(centerX/32)-2, 1, 4, base.height/32-2])]
  return {
    ...base, id: base.id as MapSize, maxPlayers: base.maxPlayers as RoomCapacity, environment,
    label: ENVIRONMENT_OPTIONS.find(option => option.id === environment)!.label,
    obstacles: [...borders.map(rect => ({ ...rect, material: 'wall' as const })), ...interior],
    routes,
  }
}

export const MAP_TILE_SIZE = 32
export type MapLayers = { ground: number[][]; solids: number[][] }

export function buildMapLayers(map: ArenaMapConfig): MapLayers {
  const cols = map.width / MAP_TILE_SIZE
  const rows = map.height / MAP_TILE_SIZE
  const industrial = map.environment === 'industrial'
  const ground = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => {
    const inRoute = map.routes.some(r => x*32 >= r.x && x*32 < r.x+r.width && y*32 >= r.y && y*32 < r.y+r.height)
    // Only plain surface tiles: no rocks, equipment, doors or cactus silhouettes.
    return industrial ? (inRoute ? 29 : 70) : inRoute ? 173 : (x*7+y*11)%13 ? 64 : 65
  }))
  const solids = Array.from({ length: rows }, () => Array<number>(cols).fill(-1))
  for (const obstacle of map.obstacles) {
    const left = obstacle.x / 32; const top = obstacle.y / 32
    const width = obstacle.width / 32; const height = obstacle.height / 32
    for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
      let tile: number
      if (width === 1 || height === 1) {
        tile = industrial ? 119 : 109
      } else if (obstacle.material === 'crate' && width >= 2 && height >= 2) {
        tile = (y%2 ? 229 : 211) + x%2
      } else {
        const palette = obstacle.material === 'rock' ? [90,108,126] : [100,118,136]
        const row = y === 0 ? 0 : y === height-1 ? 2 : 1
        tile = palette[row] + (x === 0 ? 0 : x === width-1 ? 2 : 1)
      }
      solids[top+y][left+x] = tile
    }
  }
  return { ground, solids }
}
