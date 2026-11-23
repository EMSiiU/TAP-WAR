import { useRef } from 'react'

export type TouchInputState = {
  moveX: number
  moveY: number
  aimActive: boolean
  aimAngle: number
  aimMagnitude: number
  shoot: boolean
}

type TouchControlsProps = {
  onTouchInput: (input: TouchInputState) => void
  onEmote: (emote: 'dots' | 'alert') => void
  onMenu: () => void
}

const STICK_MAX_RADIUS = 46

export default function TouchControls({ onTouchInput, onEmote, onMenu }: TouchControlsProps) {
  const moveKnobRef = useRef<HTMLDivElement>(null)
  const aimKnobRef = useRef<HTMLDivElement>(null)

  const stateRef = useRef<{
    movePointerId: number | null
    aimPointerId: number | null
    firePointerId: number | null
    moveX: number
    moveY: number
    aimActive: boolean
    aimAngle: number
    aimMagnitude: number
    aimFire: boolean
    buttonFire: boolean
  }>({
    movePointerId: null,
    aimPointerId: null,
    firePointerId: null,
    moveX: 0,
    moveY: 0,
    aimActive: false,
    aimAngle: 0,
    aimMagnitude: 0,
    aimFire: false,
    buttonFire: false,
  })

  function emit() {
    const s = stateRef.current
    onTouchInput({
      moveX: s.moveX,
      moveY: s.moveY,
      aimActive: s.aimActive,
      aimAngle: s.aimAngle,
      aimMagnitude: s.aimMagnitude,
      shoot: s.aimFire || s.buttonFire,
    })
  }

  function computeOffset(el: HTMLDivElement, clientX: number, clientY: number) {
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    const dist = Math.hypot(dx, dy)
    const clamped = Math.min(dist, STICK_MAX_RADIUS)
    const nx = dist > 0 ? (dx / dist) * (clamped / STICK_MAX_RADIUS) : 0
    const ny = dist > 0 ? (dy / dist) * (clamped / STICK_MAX_RADIUS) : 0
    return {
      nx,
      ny,
      mag: clamped / STICK_MAX_RADIUS,
      tx: dist > 0 ? (dx / dist) * clamped : 0,
      ty: dist > 0 ? (dy / dist) * clamped : 0,
    }
  }

  function resetMoveStick() {
    stateRef.current.movePointerId = null
    stateRef.current.moveX = 0
    stateRef.current.moveY = 0
    if (moveKnobRef.current) {
      moveKnobRef.current.style.transform = 'translate(0px, 0px)'
    }
    emit()
  }

  function resetAimStick() {
    stateRef.current.aimPointerId = null
    stateRef.current.aimActive = false
    stateRef.current.aimMagnitude = 0
    stateRef.current.aimFire = false
    if (aimKnobRef.current) {
      aimKnobRef.current.style.transform = 'translate(0px, 0px)'
    }
    emit()
  }

  return (
    <div className="touch-controls-layer" aria-label="Controles táctiles">
      <div className="touch-top-actions">
        <button
          type="button"
          className="touch-pill-btn"
          onPointerDown={(e) => {
            e.stopPropagation()
            onEmote('dots')
          }}
        >
          ···
        </button>
        <button
          type="button"
          className="touch-pill-btn"
          onPointerDown={(e) => {
            e.stopPropagation()
            onEmote('alert')
          }}
        >
          !
        </button>
        <button
          type="button"
          className="touch-pill-btn"
          onPointerDown={(e) => {
            e.stopPropagation()
            onMenu()
          }}
        >
          Menú
        </button>
      </div>

      <div
        className="touch-stick touch-stick-move"
        role="application"
        aria-label="Joystick de movimiento"
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (stateRef.current.movePointerId !== null) return
          stateRef.current.movePointerId = e.pointerId
          e.currentTarget.setPointerCapture(e.pointerId)
          const off = computeOffset(e.currentTarget, e.clientX, e.clientY)
          if (off.mag > 0.15) {
            stateRef.current.moveX = off.nx
            stateRef.current.moveY = off.ny
          }
          if (moveKnobRef.current) {
            moveKnobRef.current.style.transform = `translate(${off.tx}px, ${off.ty}px)`
          }
          emit()
        }}
        onPointerMove={(e) => {
          if (stateRef.current.movePointerId !== e.pointerId) return
          const off = computeOffset(e.currentTarget, e.clientX, e.clientY)
          if (off.mag > 0.15) {
            stateRef.current.moveX = off.nx
            stateRef.current.moveY = off.ny
          } else {
            stateRef.current.moveX = 0
            stateRef.current.moveY = 0
          }
          if (moveKnobRef.current) {
            moveKnobRef.current.style.transform = `translate(${off.tx}px, ${off.ty}px)`
          }
          emit()
        }}
        onPointerUp={(e) => {
          if (stateRef.current.movePointerId === e.pointerId) resetMoveStick()
        }}
        onPointerCancel={(e) => {
          if (stateRef.current.movePointerId === e.pointerId) resetMoveStick()
        }}
      >
        <div ref={moveKnobRef} className="touch-stick-knob" />
        <span className="touch-stick-label">MOVER</span>
      </div>

      <div className="touch-right-cluster">
        <button
          type="button"
          className="touch-fire-btn"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            stateRef.current.firePointerId = e.pointerId
            e.currentTarget.setPointerCapture(e.pointerId)
            stateRef.current.buttonFire = true
            emit()
          }}
          onPointerUp={(e) => {
            if (stateRef.current.firePointerId === e.pointerId) {
              stateRef.current.firePointerId = null
              stateRef.current.buttonFire = false
              emit()
            }
          }}
          onPointerCancel={(e) => {
            if (stateRef.current.firePointerId === e.pointerId) {
              stateRef.current.firePointerId = null
              stateRef.current.buttonFire = false
              emit()
            }
          }}
        >
          DISPARO
        </button>

        <div
          className="touch-stick touch-stick-aim"
          role="application"
          aria-label="Joystick de apuntado y disparo"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (stateRef.current.aimPointerId !== null) return
            stateRef.current.aimPointerId = e.pointerId
            e.currentTarget.setPointerCapture(e.pointerId)
            const off = computeOffset(e.currentTarget, e.clientX, e.clientY)
            if (off.mag > 0.18) {
              const rawAngle = Math.atan2(off.ny, off.nx)
              stateRef.current.aimActive = true
              stateRef.current.aimAngle = rawAngle === Math.PI ? -Math.PI : rawAngle
              stateRef.current.aimMagnitude = off.mag
              stateRef.current.aimFire = off.mag > 0.45
            }
            if (aimKnobRef.current) {
              aimKnobRef.current.style.transform = `translate(${off.tx}px, ${off.ty}px)`
            }
            emit()
          }}
          onPointerMove={(e) => {
            if (stateRef.current.aimPointerId !== e.pointerId) return
            const off = computeOffset(e.currentTarget, e.clientX, e.clientY)
            if (off.mag > 0.18) {
              const rawAngle = Math.atan2(off.ny, off.nx)
              stateRef.current.aimActive = true
              stateRef.current.aimAngle = rawAngle === Math.PI ? -Math.PI : rawAngle
              stateRef.current.aimMagnitude = off.mag
              stateRef.current.aimFire = off.mag > 0.45
            } else {
              stateRef.current.aimActive = false
              stateRef.current.aimMagnitude = 0
              stateRef.current.aimFire = false
            }
            if (aimKnobRef.current) {
              aimKnobRef.current.style.transform = `translate(${off.tx}px, ${off.ty}px)`
            }
            emit()
          }}
          onPointerUp={(e) => {
            if (stateRef.current.aimPointerId === e.pointerId) resetAimStick()
          }}
          onPointerCancel={(e) => {
            if (stateRef.current.aimPointerId === e.pointerId) resetAimStick()
          }}
        >
          <div ref={aimKnobRef} className="touch-stick-knob is-aim" />
          <span className="touch-stick-label">APUNTAR</span>
        </div>
      </div>
    </div>
  )
}
