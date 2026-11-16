import arena from '../../../../packages/shared/arena.json' with { type: 'json' }

type Position = { x: number; y: number }

const radius = arena.playerRadius

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max))
}

function overlapsObstacle(x: number, y: number): boolean {
    return arena.obstacles.some((obstacle) => {
        const closestX = clamp(x, obstacle.x, obstacle.x + obstacle.width)
        const closestY = clamp(y, obstacle.y, obstacle.y + obstacle.height)
        const dx = x - closestX
        const dy = y - closestY

        return dx * dx + dy * dy < radius * radius
    })
}

export function moveInsideArena(
    position: Position,
    dx: number,
    dy: number,
): Position {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (radius / 2)))
    const stepX = dx / steps
    const stepY = dy / steps
    let { x, y } = position

    for (let i = 0; i < steps; i++) {
        const nextX = clamp(x + stepX, radius, arena.width - radius)
        if (!overlapsObstacle(nextX, y)) x = nextX

        const nextY = clamp(y + stepY, radius, arena.height - radius)
        if (!overlapsObstacle(x, nextY)) y = nextY
    }

    return { x, y }
}

export function isBulletHittingObstacle(
    x: number,
    y: number,
    halfSize = 4,
): boolean {
    return arena.obstacles.some(
        (obstacle) =>
            x + halfSize > obstacle.x &&
            x - halfSize < obstacle.x + obstacle.width &&
            y + halfSize > obstacle.y &&
            y - halfSize < obstacle.y + obstacle.height,
    )
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

export function segmentBlockedByObstacle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): boolean {
    const dist = Math.hypot(x2 - x1, y2 - y1)
    const steps = Math.max(1, Math.ceil(dist / 4))
    for (let i = 1; i < steps; i++) {
        const t = i / steps
        const px = x1 + (x2 - x1) * t
        const py = y1 + (y2 - y1) * t
        if (isBulletHittingObstacle(px, py, 2)) {
            return true
        }
    }
    return false
}