export type TouchInputState = {
  moveX: number; moveY: number; aimActive: boolean; aimAngle: number; aimMagnitude: number; shoot: boolean
}
export type StickOffset = { nx: number; ny: number; mag: number; tx: number; ty: number }
export type TouchControl = 'move' | 'aim' | 'fire'
export const neutralTouchInput = (): TouchInputState => ({ moveX: 0, moveY: 0, aimActive: false, aimAngle: 0, aimMagnitude: 0, shoot: false })

export function stickOffset(rect: { left: number; top: number; width: number; height: number }, knobSize: number, x: number, y: number): StickOffset {
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2 - knobSize / 2 - 4)
  const dx = x - rect.left - rect.width / 2; const dy = y - rect.top - rect.height / 2
  const distance = Math.hypot(dx, dy); const travel = Math.min(distance, radius)
  const nx = distance ? dx / distance : 0; const ny = distance ? dy / distance : 0
  return { nx: nx * travel / radius, ny: ny * travel / radius, mag: travel / radius, tx: nx * travel, ty: ny * travel }
}

export class TouchInputController {
  private pointers: Record<TouchControl, number | null> = { move: null, aim: null, fire: null }
  private input = neutralTouchInput()
  private aimFire = false
  private buttonFire = false
  private publish: (input: TouchInputState) => void
  constructor(publish: (input: TouchInputState) => void) { this.publish = publish }
  private emit() { this.publish({ ...this.input, shoot: this.aimFire || this.buttonFire }) }
  press(control: TouchControl, pointerId: number, offset?: StickOffset): boolean {
    if (this.pointers[control] !== null) return false
    this.pointers[control] = pointerId
    if (control === 'fire') { this.buttonFire = true; this.emit() }
    else if (offset) this.move(control, pointerId, offset)
    return true
  }
  move(control: 'move' | 'aim', pointerId: number, offset: StickOffset) {
    if (this.pointers[control] !== pointerId) return
    if (control === 'move') {
      this.input.moveX = offset.mag > .15 ? offset.nx : 0
      this.input.moveY = offset.mag > .15 ? offset.ny : 0
    } else {
      this.input.aimActive = offset.mag > .18
      this.input.aimMagnitude = this.input.aimActive ? offset.mag : 0
      if (this.input.aimActive) {
        const angle = Math.atan2(offset.ny, offset.nx)
        this.input.aimAngle = angle === Math.PI ? -Math.PI : angle
      }
      this.aimFire = this.input.aimActive && offset.mag > .45
    }
    this.emit()
  }
  release(control: TouchControl, pointerId: number): boolean {
    if (this.pointers[control] !== pointerId) return false
    this.pointers[control] = null
    if (control === 'move') { this.input.moveX = 0; this.input.moveY = 0 }
    else if (control === 'aim') { this.input.aimActive = false; this.input.aimMagnitude = 0; this.aimFire = false }
    else this.buttonFire = false
    this.emit()
    return true
  }
  reset() {
    this.pointers = { move: null, aim: null, fire: null }
    this.input = neutralTouchInput(); this.aimFire = false; this.buttonFire = false
    this.emit()
  }
}

export function bindTouchResetEvents(
  windowTarget: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  documentTarget: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { readonly hidden: boolean },
  reset: () => void,
) {
  const visibility = () => { if (documentTarget.hidden) reset() }
  const events = ['blur', 'resize', 'orientationchange', 'pagehide']
  for (const name of events) windowTarget.addEventListener(name, reset)
  documentTarget.addEventListener('visibilitychange', visibility)
  return () => {
    for (const name of events) windowTarget.removeEventListener(name, reset)
    documentTarget.removeEventListener('visibilitychange', visibility)
    reset()
  }
}
