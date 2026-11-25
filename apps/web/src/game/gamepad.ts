export type GamepadButtonLike = {
  pressed?: boolean
  value?: number
}

export type GamepadLike = {
  connected?: boolean
  axes: readonly number[]
  buttons: readonly (GamepadButtonLike | undefined)[]
}

export type GamepadSample = {
  moveX: number
  moveY: number
  aimActive: boolean
  aimAngle: number
  aimMagnitude: number
  shoot: boolean
  melee: boolean
  reload: boolean
  dash: boolean
  emoteDots: boolean
  emoteAlert: boolean
  pauseToggle: boolean
}

function isPressed(button: GamepadButtonLike | undefined, threshold = 0.25): boolean {
  if (!button) return false
  return Boolean(button.pressed) || (typeof button.value === 'number' && button.value > threshold)
}

function normalizeStick(rawX: number, rawY: number, deadzone: number): { x: number; y: number; mag: number } {
  const mag = Math.hypot(rawX, rawY)
  if (!Number.isFinite(mag) || mag <= deadzone || mag === 0) {
    return { x: 0, y: 0, mag: 0 }
  }
  const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone))
  return {
    x: (rawX / mag) * scaled,
    y: (rawY / mag) * scaled,
    mag: scaled,
  }
}

export function readGamepadInput(pad: GamepadLike, moveDeadzone = 0.18, aimDeadzone = 0.22): GamepadSample {
  const left = normalizeStick(pad.axes[0] ?? 0, pad.axes[1] ?? 0, moveDeadzone)
  let moveX = left.x
  let moveY = left.y

  if (moveX === 0 && moveY === 0) {
    const up = isPressed(pad.buttons[12]) ? 1 : 0
    const down = isPressed(pad.buttons[13]) ? 1 : 0
    const leftBtn = isPressed(pad.buttons[14]) ? 1 : 0
    const rightBtn = isPressed(pad.buttons[15]) ? 1 : 0
    const dx = rightBtn - leftBtn
    const dy = down - up
    const dLen = Math.hypot(dx, dy)
    if (dLen > 0) {
      moveX = dx / dLen
      moveY = dy / dLen
    }
  }

  const right = normalizeStick(pad.axes[2] ?? 0, pad.axes[3] ?? 0, aimDeadzone)
  let aimAngle = 0
  if (right.mag > 0) {
    const angle = Math.atan2(right.y, right.x)
    aimAngle = angle === Math.PI ? -Math.PI : angle
  }

  const shoot = isPressed(pad.buttons[7], 0.25) || isPressed(pad.buttons[5], 0.5)
  const dash = isPressed(pad.buttons[0], 0.5)
  const melee = isPressed(pad.buttons[1], 0.5) || isPressed(pad.buttons[11], 0.5)
  const reload = isPressed(pad.buttons[2], 0.5)

  const emoteDots = isPressed(pad.buttons[4], 0.5)
  const emoteAlert = isPressed(pad.buttons[6], 0.5) || isPressed(pad.buttons[3], 0.5)
  const pauseToggle = isPressed(pad.buttons[9], 0.5)

  return {
    moveX,
    moveY,
    aimActive: right.mag > 0,
    aimAngle,
    aimMagnitude: right.mag,
    shoot,
    melee,
    reload,
    dash,
    emoteDots,
    emoteAlert,
    pauseToggle,
  }
}

export function pickActiveGamepad(
  pads: readonly (GamepadLike | null | undefined)[] | null | undefined,
): GamepadLike | null {
  if (!pads) return null
  for (const pad of pads) {
    if (pad && pad.connected !== false) return pad
  }
  return null
}

export function createGamepadEdgeDetector() {
  let prevDots = false
  let prevAlert = false
  let prevPause = false
  let prevDash = false
  let prevMelee = false
  let prevReload = false

  return (sample: GamepadSample | null) => {
    if (!sample) {
      prevDots = false
      prevAlert = false
      prevPause = false
      prevDash = false
      prevMelee = false
      prevReload = false
      return {
        emoteDotsPressed: false,
        emoteAlertPressed: false,
        pausePressed: false,
        dashPressed: false,
        meleePressed: false,
        reloadPressed: false,
      }
    }

    const emoteDotsPressed = sample.emoteDots && !prevDots
    const emoteAlertPressed = sample.emoteAlert && !prevAlert
    const pausePressed = sample.pauseToggle && !prevPause
    const dashPressed = sample.dash && !prevDash
    const meleePressed = sample.melee && !prevMelee
    const reloadPressed = sample.reload && !prevReload

    prevDots = sample.emoteDots
    prevAlert = sample.emoteAlert
    prevPause = sample.pauseToggle
    prevDash = sample.dash
    prevMelee = sample.melee
    prevReload = sample.reload

    return {
      emoteDotsPressed,
      emoteAlertPressed,
      pausePressed,
      dashPressed,
      meleePressed,
      reloadPressed,
    }
  }
}
