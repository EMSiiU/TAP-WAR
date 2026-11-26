export type TouchAimMode = 'none' | 'auto' | 'manual'

export type TouchInputState = {
  moveX: number
  moveY: number
  aimActive: boolean
  aimMode: TouchAimMode
  aimCancelling: boolean
  aimAngle: number
  aimMagnitude: number
  shoot: boolean
  autoAimShotSeq: number
  manualShotSeq: number
}

export type StickOffset = {
  nx: number
  ny: number
  mag: number
  tx: number
  ty: number
  distPx?: number
}

export type TouchControl = 'move' | 'aim' | 'fire'

export const AIM_DRAG_ENTER_PX = 20
export const AIM_CANCEL_EXIT_PX = 14
export const MANUAL_DRAG_THRESHOLD = 0.42
export const MANUAL_CANCEL_THRESHOLD = 0.30

export const neutralTouchInput = (): TouchInputState => ({
  moveX: 0,
  moveY: 0,
  aimActive: false,
  aimMode: 'none',
  aimCancelling: false,
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
  const distPx = Math.hypot(dx, dy)
  const travel = Math.min(distPx, radius)
  const nx = distPx ? dx / distPx : 0
  const ny = distPx ? dy / distPx : 0
  return {
    nx: (nx * travel) / radius,
    ny: (ny * travel) / radius,
    mag: travel / radius,
    tx: nx * travel,
    ty: ny * travel,
    distPx,
  }
}

/**
 * Floating-origin displacement from the exact point where the thumb touched down.
 * Prevents off-center taps from falsely registering as a manual aim drag.
 */
export function aimDragOffset(
  originX: number,
  originY: number,
  x: number,
  y: number,
  maxTravelPx: number,
): StickOffset {
  const radius = Math.max(1, maxTravelPx)
  const dx = x - originX
  const dy = y - originY
  const distPx = Math.hypot(dx, dy)
  const travel = Math.min(distPx, radius)
  const nx = distPx ? dx / distPx : 0
  const ny = distPx ? dy / distPx : 0
  return {
    nx,
    ny,
    mag: travel / radius,
    tx: nx * travel,
    ty: ny * travel,
    distPx,
  }
}

function normalizeAimAngle(nx: number, ny: number): number {
  const angle = Math.atan2(ny, nx)
  return angle === Math.PI ? -Math.PI : angle
}

/**
 * Brawl Stars-style touch controller:
 * - Left stick ('move'): analog movement with deadzone.
 * - Right stick ('aim'):
 *   - Touch-down establishes a floating origin; taps or holds inside AIM_DRAG_ENTER_PX (20 px)
 *     use semi-auto aim (quickfire on tap release, or continuous auto-fire while held).
 *   - Sliding >= AIM_DRAG_ENTER_PX enters manual aim cleanly WITHOUT misfiring during drag.
 *   - Releasing outside the center cancel deadzone (AIM_CANCEL_EXIT_PX = 14 px) fires the aimed shot;
 *     dragging back inside the center cancel deadzone cancels the shot cleanly on release.
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
      // Touch-down always begins at floating origin (0 displacement) in quickfire auto-aim.
      this.aimDragged = false
      this.aimFire = false
      this.input.aimActive = true
      this.input.aimMode = 'auto'
      this.input.aimCancelling = false
      this.input.aimMagnitude = 0
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
    this.input.aimCancelling = false
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

    const pastEnter =
      offset.distPx !== undefined
        ? offset.distPx >= AIM_DRAG_ENTER_PX
        : offset.mag >= MANUAL_DRAG_THRESHOLD
    const inCancelZone =
      offset.distPx !== undefined
        ? offset.distPx < AIM_CANCEL_EXIT_PX
        : offset.mag < MANUAL_CANCEL_THRESHOLD

    if (!this.aimDragged) {
      if (pastEnter) {
        this.aimDragged = true
        this.aimFire = false
        this.input.aimActive = true
        this.input.aimMode = 'manual'
        this.input.aimCancelling = false
        this.input.aimMagnitude = offset.mag
        this.input.aimAngle = normalizeAimAngle(offset.nx, offset.ny)
      } else {
        this.input.aimActive = true
        this.input.aimMode = 'auto'
        this.input.aimCancelling = false
        this.input.aimMagnitude = 0
      }
      this.emit()
      return
    }

    // Already in manual drag: aim smoothly on release without firing prematurely while aiming.
    this.aimFire = false
    this.input.aimActive = true
    this.input.aimMode = 'manual'
    this.input.aimMagnitude = offset.mag
    if (inCancelZone) {
      this.input.aimCancelling = true
    } else {
      this.input.aimCancelling = false
      if (offset.nx !== 0 || offset.ny !== 0) {
        this.input.aimAngle = normalizeAimAngle(offset.nx, offset.ny)
      }
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
        } else if (!this.input.aimCancelling) {
          this.input.manualShotSeq += 1
        }
      }
      this.aimDragged = false
      this.input.aimActive = false
      this.input.aimMode = 'none'
      this.input.aimCancelling = false
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
