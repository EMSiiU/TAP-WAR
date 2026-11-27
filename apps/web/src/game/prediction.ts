import { PLAYER_MOVE_SPEED, stepPlayerMovement, type CollisionMap, type Position } from '../../../../packages/shared/movement.ts'

export type PendingMoveStep = {
  seq: number
  moveX: number
  moveY: number
  dtSec: number
}

const MAX_PENDING_STEPS = 60
const MAX_PENDING_DT_SEC = 0.6
const MAX_VISUAL_ERROR_PX = 96
const HARD_SNAP_DIST_PX = 140
const ERROR_DECAY_RATE = 16

/**
 * Predicts local player movement immediately and reconciles smoothly
 * against authoritative server snapshots using acknowledged input sequences.
 */
export class LocalPlayerPredictor {
  private readonly arenaMap: CollisionMap
  private initialized = false
  private predX = 0
  private predY = 0
  private errorX = 0
  private errorY = 0
  private pendingSteps: PendingMoveStep[] = []
  private bufferedDtSec = 0

  constructor(arenaMap: CollisionMap) {
    this.arenaMap = arenaMap
  }

  isInitialized(): boolean {
    return this.initialized
  }

  getPendingCount(): number {
    return this.pendingSteps.length
  }

  getVisualPosition(): Position {
    return {
      x: this.predX + this.errorX,
      y: this.predY + this.errorY,
    }
  }

  reset(x: number, y: number): void {
    this.predX = x
    this.predY = y
    this.errorX = 0
    this.errorY = 0
    this.pendingSteps.length = 0
    this.bufferedDtSec = 0
    this.initialized = true
  }

  snapSmooth(x: number, y: number): Position {
    if (!this.initialized) {
      this.reset(x, y)
      return { x, y }
    }
    const oldVisX = this.predX + this.errorX
    const oldVisY = this.predY + this.errorY
    this.predX = x
    this.predY = y
    this.pendingSteps.length = 0
    this.bufferedDtSec = 0
    this.assignVisualError(oldVisX - x, oldVisY - y, 160)
    return this.getVisualPosition()
  }

  stepFrame(
    moveX: number,
    moveY: number,
    dtSec: number,
    seq: number,
    allowMove: boolean,
  ): Position {
    const dt = Math.max(0, Math.min(dtSec, 0.1))
    if (!this.initialized) {
      return { x: this.predX, y: this.predY }
    }

    if (allowMove && (moveX !== 0 || moveY !== 0) && dt > 0) {
      const next = stepPlayerMovement(
        { x: this.predX, y: this.predY },
        moveX,
        moveY,
        dt,
        this.arenaMap,
        PLAYER_MOVE_SPEED,
      )
      this.predX = next.x
      this.predY = next.y
      this.pendingSteps.push({ seq, moveX, moveY, dtSec: dt })
      this.bufferedDtSec += dt
      while (
        this.pendingSteps.length > MAX_PENDING_STEPS ||
        this.bufferedDtSec > MAX_PENDING_DT_SEC
      ) {
        const dropped = this.pendingSteps.shift()
        if (!dropped) break
        this.bufferedDtSec = Math.max(0, this.bufferedDtSec - dropped.dtSec)
      }
    }

    if (this.errorX !== 0 || this.errorY !== 0) {
      const keep = Math.exp(-ERROR_DECAY_RATE * dt)
      this.errorX *= keep
      this.errorY *= keep
      if (Math.hypot(this.errorX, this.errorY) < 0.15) {
        this.errorX = 0
        this.errorY = 0
      }
    }

    return this.getVisualPosition()
  }

  reconcile(
    serverX: number,
    serverY: number,
    lastAckSeq: number,
    forceSnap = false,
  ): Position {
    if (!this.initialized || forceSnap) {
      this.reset(serverX, serverY)
      return { x: serverX, y: serverY }
    }

    const oldVisX = this.predX + this.errorX
    const oldVisY = this.predY + this.errorY

    let writeIdx = 0
    let remainingDt = 0
    let simX = serverX
    let simY = serverY

    for (let i = 0; i < this.pendingSteps.length; i++) {
      const step = this.pendingSteps[i]
      if (step.seq <= lastAckSeq) continue
      this.pendingSteps[writeIdx++] = step
      remainingDt += step.dtSec
      const next = stepPlayerMovement(
        { x: simX, y: simY },
        step.moveX,
        step.moveY,
        step.dtSec,
        this.arenaMap,
        PLAYER_MOVE_SPEED,
      )
      simX = next.x
      simY = next.y
    }
    this.pendingSteps.length = writeIdx
    this.bufferedDtSec = remainingDt

    this.predX = simX
    this.predY = simY

    this.assignVisualError(oldVisX - simX, oldVisY - simY, HARD_SNAP_DIST_PX)
    return this.getVisualPosition()
  }

  private assignVisualError(errX: number, errY: number, hardSnapDist: number): void {
    const dist = Math.hypot(errX, errY)
    if (dist > hardSnapDist || dist <= 1.25) {
      this.errorX = 0
      this.errorY = 0
      return
    }
    if (dist > MAX_VISUAL_ERROR_PX) {
      const scale = MAX_VISUAL_ERROR_PX / dist
      this.errorX = errX * scale
      this.errorY = errY * scale
      return
    }
    this.errorX = errX
    this.errorY = errY
  }
}
