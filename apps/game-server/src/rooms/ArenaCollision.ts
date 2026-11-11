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