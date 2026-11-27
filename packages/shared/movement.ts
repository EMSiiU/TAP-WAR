export const PLAYER_MOVE_SPEED = 220
export const PLAYER_DASH_SPEED = 880
export const PLAYER_DASH_DURATION_MS = 160
export const PLAYER_DASH_COOLDOWN_MS = 450
export const INPUT_TIMEOUT_MS = 300
export const BULLET_LIFETIME_MS = 2000

export type Position = { x: number; y: number }

export type CollisionObstacle = {
  x: number
  y: number
  width: number
  height: number
}

export type CollisionMap = {
  width: number
  height: number
  playerRadius: number
  obstacles: readonly CollisionObstacle[]
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

export function overlapsObstacle(x: number, y: number, arenaMap: CollisionMap): boolean {
  const radius = arenaMap.playerRadius
  const radiusSq = radius * radius
  for (const obstacle of arenaMap.obstacles) {
    const closestX = clamp(x, obstacle.x, obstacle.x + obstacle.width)
    const closestY = clamp(y, obstacle.y, obstacle.y + obstacle.height)
    const dx = x - closestX
    const dy = y - closestY
    if (dx * dx + dy * dy < radiusSq) return true
  }
  return false
}

export function overlapsObstacleWithRadius(
  x: number,
  y: number,
  radius: number,
  arenaMap: CollisionMap,
): boolean {
  if (x < radius || x > arenaMap.width - radius || y < radius || y > arenaMap.height - radius) {
    return true
  }
  const radiusSq = radius * radius
  for (const obstacle of arenaMap.obstacles) {
    const closestX = clamp(x, obstacle.x, obstacle.x + obstacle.width)
    const closestY = clamp(y, obstacle.y, obstacle.y + obstacle.height)
    const dx = x - closestX
    const dy = y - closestY
    if (dx * dx + dy * dy < radiusSq) return true
  }
  return false
}

export function moveInsideArena(
  position: Position,
  dx: number,
  dy: number,
  arenaMap: CollisionMap,
): Position {
  const radius = arenaMap.playerRadius
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (radius / 2)))
  const stepX = dx / steps
  const stepY = dy / steps
  let { x, y } = position

  for (let i = 0; i < steps; i++) {
    const nextX = clamp(x + stepX, radius, arenaMap.width - radius)
    if (!overlapsObstacle(nextX, y, arenaMap)) x = nextX

    const nextY = clamp(y + stepY, radius, arenaMap.height - radius)
    if (!overlapsObstacle(x, nextY, arenaMap)) y = nextY
  }

  return { x, y }
}

export function stepPlayerMovement(
  position: Position,
  moveX: number,
  moveY: number,
  dtSeconds: number,
  arenaMap: CollisionMap,
  speed = PLAYER_MOVE_SPEED,
): Position {
  if (dtSeconds <= 0) return position
  const length = Math.hypot(moveX, moveY)
  if (length === 0) return position
  const scale = length > 1 ? 1 / length : 1
  const distance = speed * dtSeconds
  return moveInsideArena(position, moveX * scale * distance, moveY * scale * distance, arenaMap)
}

export function isBulletHittingObstacle(
  x: number,
  y: number,
  halfSize = 4,
  arenaMap: CollisionMap,
): boolean {
  for (const obstacle of arenaMap.obstacles) {
    if (
      x + halfSize > obstacle.x &&
      x - halfSize < obstacle.x + obstacle.width &&
      y + halfSize > obstacle.y &&
      y - halfSize < obstacle.y + obstacle.height
    ) {
      return true
    }
  }
  return false
}

export function segmentIntersectsAABB(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return false

  let tMin = 0
  let tMax = 1

  if (dx === 0) {
    if (x1 <= minX || x1 >= maxX) return false
  } else {
    const invDx = 1 / dx
    const tx1 = (minX - x1) * invDx
    const tx2 = (maxX - x1) * invDx
    tMin = Math.max(tMin, Math.min(tx1, tx2))
    tMax = Math.min(tMax, Math.max(tx1, tx2))
    if (tMin > tMax) return false
  }

  if (dy === 0) {
    if (y1 <= minY || y1 >= maxY) return false
  } else {
    const invDy = 1 / dy
    const ty1 = (minY - y1) * invDy
    const ty2 = (maxY - y1) * invDy
    tMin = Math.max(tMin, Math.min(ty1, ty2))
    tMax = Math.min(tMax, Math.max(ty1, ty2))
    if (tMin > tMax) return false
  }

  return tMax > tMin && tMax > 0 && tMin < 1
}

export function segmentBlockedByObstacle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  arenaMap: CollisionMap,
  pad = 2,
): boolean {
  for (const obstacle of arenaMap.obstacles) {
    if (
      segmentIntersectsAABB(
        x1,
        y1,
        x2,
        y2,
        obstacle.x - pad,
        obstacle.y - pad,
        obstacle.x + obstacle.width + pad,
        obstacle.y + obstacle.height + pad,
      )
    ) {
      return true
    }
  }
  return false
}

export function isBulletTrajectoryRelevantToViewer(
  startX: number,
  startY: number,
  vx: number,
  vy: number,
  lifetimeSec: number,
  viewerX: number,
  viewerY: number,
  halfW: number,
  halfH: number,
): boolean {
  const minX = viewerX - halfW
  const maxX = viewerX + halfW
  const minY = viewerY - halfH
  const maxY = viewerY + halfH
  if (startX >= minX && startX <= maxX && startY >= minY && startY <= maxY) {
    return true
  }
  const endX = startX + vx * lifetimeSec
  const endY = startY + vy * lifetimeSec
  return segmentIntersectsAABB(startX, startY, endX, endY, minX, minY, maxX, maxY)
}
