export type TouchAimMode = 'none' | 'auto' | 'manual'

export type TouchInputState = {
  moveX: number
  moveY: number
  aimActive: boolean
  aimMode: TouchAimMode
  aimAngle: number
  aimMagnitude: number
  shoot: boolean
  autoAimShotSeq: number
  manualShotSeq: number
}

export type StickOffset = { nx: number; ny: number; mag: number; tx: number; ty: number }
export type TouchControl = 'move' | 'aim' | 'fire'

export const MANUAL_DRAG_THRESHOLD = 0.28
export const MANUAL_CONTINUOUS_FIRE_THRESHOLD = 0.58

export const neutralTouchInput = (): TouchInputState => ({
  moveX: 0,
  moveY: 0,
  aimActive: false,
  aimMode: 'none',
  aimAngle: 0,
  aimMagnitude: 0,
  shoot: false,
  autoAimShotSeq: 0,
  manualShotSeq: 0,
})

export function stickOffset(
  rect: { left: number; top: number; width: number; height: number },
  knobSize: number,
  x: number,
  y: number,
): StickOffset {
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2 - knobSize / 2 - 4)
  const dx = x - rect.left - rect.width / 2
  const dy = y - rect.top - rect.height / 2
  const distance = Math.hypot(dx, dy)
  const travel = Math.min(distance, radius)
  const nx = distance ? dx / distance : 0
  const ny = distance ? dy / distance : 0
  return {
    nx: (nx * travel) / radius,
    ny: (ny * travel) / radius,
    mag: travel / radius,
    tx: nx * travel,
    ty: ny * travel,
  }
}

/**
 * Brawl Stars-style touch controller:
 * - Left stick ('move'): analog movement with deadzone.
 * - Right stick ('aim'):
 *   - Pressing near center (without dragging past MANUAL_DRAG_THRESHOLD) uses semi-auto aim:
 *     fires immediately toward the nearest enemy on tap/release, or continuously while held.
 *   - Dragging past MANUAL_DRAG_THRESHOLD switches to manual aim in the drag direction:
 *     shows live aim direction, fires on release, and fires continuously when pushed to the outer rim.
 * - Legacy/optional 'fire' button stays supported for multi-touch compatibility.
 */
export class TouchInputController {
  private pointers: Record<TouchControl, number | null> = { move: null, aim: null, fire: null }
  private input = neutralTouchInput()
  private aimFire = false
  private buttonFire = false
  private aimDragged = false
  private publish: (input: TouchInputState) => void

  constructor(publish: (input: TouchInputState) => void) {
    this.publish = publish
  }

  private emit() {
    this.publish({ ...this.input, shoot: this.aimFire || this.buttonFire })
  }

  press(control: TouchControl, pointerId: number, offset?: StickOffset): boolean {
    if (this.pointers[control] !== null) return false
    this.pointers[control] = pointerId

    if (control === 'fire') {
      this.buttonFire = true
      this.emit()
      return true
    }

    if (control === 'aim') {
      this.aimDragged = Boolean(offset && offset.mag >= MANUAL_DRAG_THRESHOLD)
      if (offset && this.aimDragged) {
        const angle = Math.atan2(offset.ny, offset.nx)
        this.input.aimActive = true
        this.input.aimMode = 'manual'
        this.input.aimAngle = angle === Math.PI ? -Math.PI : angle
        this.input.aimMagnitude = offset.mag
        this.aimFire = offset.mag >= MANUAL_CONTINUOUS_FIRE_THRESHOLD
      } else {
        // Pressed attack pad without drag: prepare semi-auto aim (fires on tap release or after short hold).
        this.input.aimActive = true
        this.input.aimMode = 'auto'
        this.input.aimMagnitude = 0
        this.aimFire = false
      }
      this.emit()
      return true
    }

    if (offset) this.move('move', pointerId, offset)
    return true
  }

  enableAutoHoldFire(pointerId: number) {
    if (this.pointers.aim !== pointerId || this.aimDragged) return
    this.input.aimActive = true
    this.input.aimMode = 'auto'
    this.aimFire = true
    this.emit()
  }

  move(control: 'move' | 'aim', pointerId: number, offset: StickOffset) {
    if (this.pointers[control] !== pointerId) return
    if (control === 'move') {
      this.input.moveX = offset.mag > 0.15 ? offset.nx : 0
      this.input.moveY = offset.mag > 0.15 ? offset.ny : 0
      this.emit()
      return
    }

    if (offset.mag >= MANUAL_DRAG_THRESHOLD) {
      this.aimDragged = true
      this.input.aimActive = true
      this.input.aimMode = 'manual'
      this.input.aimMagnitude = offset.mag
      const angle = Math.atan2(offset.ny, offset.nx)
      this.input.aimAngle = angle === Math.PI ? -Math.PI : angle
      this.aimFire = offset.mag >= MANUAL_CONTINUOUS_FIRE_THRESHOLD
    } else if (!this.aimDragged) {
      this.input.aimActive = true
      this.input.aimMode = 'auto'
      this.input.aimMagnitude = 0
    } else {
      // Returned to dead-center cancel zone after dragging: pause fire & cancel shot on release.
      this.input.aimActive = true
      this.input.aimMode = 'manual'
      this.input.aimMagnitude = offset.mag
      this.aimFire = false
    }
    this.emit()
  }

  release(control: TouchControl, pointerId: number, cancelled = false): boolean {
    if (this.pointers[control] !== pointerId) return false
    this.pointers[control] = null
    if (control === 'move') {
      this.input.moveX = 0
      this.input.moveY = 0
    } else if (control === 'aim') {
      if (!cancelled) {
        if (!this.aimDragged) {
          this.input.autoAimShotSeq += 1
        } else if (this.input.aimMagnitude >= MANUAL_DRAG_THRESHOLD) {
          this.input.manualShotSeq += 1
        }
      }
      this.aimDragged = false
      this.input.aimActive = false
      this.input.aimMode = 'none'
      this.input.aimMagnitude = 0
      this.aimFire = false
    } else {
      this.buttonFire = false
    }
    this.emit()
    return true
  }

  reset() {
    const autoSeq = this.input.autoAimShotSeq
    const manualSeq = this.input.manualShotSeq
    this.pointers = { move: null, aim: null, fire: null }
    this.input = {
      ...neutralTouchInput(),
      autoAimShotSeq: autoSeq,
      manualShotSeq: manualSeq,
    }
    this.aimFire = false
    this.buttonFire = false
    this.aimDragged = false
    this.emit()
  }
}

export function bindTouchResetEvents(
  windowTarget: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  documentTarget: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
    readonly hidden: boolean
  },
  reset: () => void,
) {
  const visibility = () => {
    if (documentTarget.hidden) reset()
  }
  const events = ['blur', 'resize', 'orientationchange', 'pagehide']
  for (const name of events) windowTarget.addEventListener(name, reset)
  documentTarget.addEventListener('visibilitychange', visibility)
  return () => {
    for (const name of events) windowTarget.removeEventListener(name, reset)
    documentTarget.removeEventListener('visibilitychange', visibility)
    reset()
  }
}
