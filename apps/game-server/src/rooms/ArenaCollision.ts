import arena from '../../../../packages/shared/arena.json' with { type: 'json' }
import {
    isBulletHittingObstacle as isBulletHittingObstacleShared,
    moveInsideArena as moveInsideArenaShared,
    overlapsObstacleWithRadius as overlapsObstacleWithRadiusShared,
    segmentBlockedByObstacle as segmentBlockedByObstacleShared,
} from '../../../../packages/shared/movement.js'
import type { ArenaMapConfig } from './ArenaMaps.js'

type Position = { x: number; y: number }

export type CollisionMap = Pick<ArenaMapConfig, 'width' | 'height' | 'playerRadius' | 'obstacles'>

const DEFAULT_ARENA_MAP: CollisionMap = arena

export function moveInsideArena(
    position: Position,
    dx: number,
    dy: number,
    arenaMap: CollisionMap = DEFAULT_ARENA_MAP,
): Position {
    return moveInsideArenaShared(position, dx, dy, arenaMap)
}

export function isBulletHittingObstacle(
    x: number,
    y: number,
    halfSize = 4,
    arenaMap: CollisionMap = DEFAULT_ARENA_MAP,
): boolean {
    return isBulletHittingObstacleShared(x, y, halfSize, arenaMap)
}

export function intersectsPlayerHitbox(
    bulletX: number,
    bulletY: number,
    playerX: number,
    playerY: number,
    hitRadius: number,
): boolean {
    const dx = bulletX - playerX
    const dy = bulletY - playerY
    return dx * dx + dy * dy <= hitRadius * hitRadius
}

export function segmentIntersectsPlayerHitbox(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    playerX: number,
    playerY: number,
    hitRadius: number,
): boolean {
    const segDx = x2 - x1
    const segDy = y2 - y1
    const lenSq = segDx * segDx + segDy * segDy
    if (lenSq === 0) {
        return intersectsPlayerHitbox(x2, y2, playerX, playerY, hitRadius)
    }

    const t = Math.max(0, Math.min(1, ((playerX - x1) * segDx + (playerY - y1) * segDy) / lenSq))
    const closestX = x1 + t * segDx
    const closestY = y1 + t * segDy
    const dx = closestX - playerX
    const dy = closestY - playerY
    return dx * dx + dy * dy <= hitRadius * hitRadius
}

export function overlapsObstacleWithRadius(
    x: number,
    y: number,
    radius: number,
    arenaMap: CollisionMap = DEFAULT_ARENA_MAP,
): boolean {
    return overlapsObstacleWithRadiusShared(x, y, radius, arenaMap)
}

export function pickRandomFreeArenaPoint(
    arenaMap: CollisionMap,
    occupied: readonly Position[] = [],
    options: {
        clearance?: number
        minSpacing?: number
        fallbacks?: readonly Position[]
        rng?: () => number
    } = {},
): Position {
    const clearance = Math.max(arenaMap.playerRadius + 8, options.clearance ?? 30)
    const minSpacing = options.minSpacing ?? 72
    const rng = options.rng ?? Math.random
    const minX = 32 + clearance
    const maxX = arenaMap.width - 32 - clearance
    const minY = 32 + clearance
    const maxY = arenaMap.height - 32 - clearance

    if (maxX > minX && maxY > minY) {
        for (const spacing of [minSpacing, Math.min(32, minSpacing), 0]) {
            const attempts = spacing > 0 ? 60 : 40
            const spacingSq = spacing * spacing
            for (let i = 0; i < attempts; i++) {
                const x = Math.round(minX + rng() * (maxX - minX))
                const y = Math.round(minY + rng() * (maxY - minY))
                if (overlapsObstacleWithRadius(x, y, clearance, arenaMap)) continue
                if (
                    spacingSq > 0 &&
                    occupied.some((p) => {
                        const dx = p.x - x
                        const dy = p.y - y
                        return dx * dx + dy * dy < spacingSq
                    })
                ) {
                    continue
                }
                return { x, y }
            }
        }
    }

    const candidates = (options.fallbacks ?? []).filter(
        (p) => !overlapsObstacleWithRadius(p.x, p.y, arenaMap.playerRadius, arenaMap),
    )
    if (candidates.length > 0) {
        return candidates[Math.floor(rng() * candidates.length)]
    }
    return { x: Math.round(arenaMap.width / 2), y: Math.round(arenaMap.height / 2) }
}

export function segmentBlockedByObstacle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    arenaMap: CollisionMap = DEFAULT_ARENA_MAP,
): boolean {
    return segmentBlockedByObstacleShared(x1, y1, x2, y2, arenaMap, 2)
}
