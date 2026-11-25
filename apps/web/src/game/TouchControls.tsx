import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  MANUAL_DRAG_THRESHOLD,
  bindTouchResetEvents,
  stickOffset,
  TouchInputController,
  type TouchControl,
  type TouchInputState,
} from './touchInput'
export type { TouchInputState } from './touchInput'

const AUTO_HOLD_DELAY_MS = 130

type TouchControlsProps = {
  onTouchInput: (input: TouchInputState) => void
  onEmote: (emote: 'dots' | 'alert') => void
  onMenu: () => void
  onMelee: () => void
  onReload: () => void
  onDash: () => void
  dashes: number
  maxDashes: number
  dashRechargeProgress: number
  canReload: boolean
  isReloading: boolean
  needsReload: boolean
}

export default function TouchControls({
  onTouchInput,
  onEmote,
  onMenu,
  onMelee,
  onReload,
  onDash,
  dashes,
  maxDashes,
  dashRechargeProgress,
  canReload,
  isReloading,
  needsReload,
}: TouchControlsProps) {
  const moveKnob = useRef<HTMLDivElement>(null)
  const aimKnob = useRef<HTMLDivElement>(null)
  const publish = useRef(onTouchInput)
  const captures = useRef(new Map<number, HTMLElement>())
  const controller = useRef<TouchInputController | null>(null)
  const autoHoldTimer = useRef<number | null>(null)
  const [aimHint, setAimHint] = useState<'idle' | 'auto' | 'manual' | 'cancel'>('idle')

  useEffect(() => {
    publish.current = onTouchInput
  }, [onTouchInput])

  const clearAutoHold = useCallback(() => {
    if (autoHoldTimer.current !== null) {
      window.clearTimeout(autoHoldTimer.current)
      autoHoldTimer.current = null
    }
  }, [])

  const getController = useCallback(() => {
    if (!controller.current) {
      controller.current = new TouchInputController((input) => publish.current(input))
    }
    return controller.current
  }, [])

  const reset = useCallback(() => {
    clearAutoHold()
    setAimHint('idle')
    getController().reset()
    for (const knob of [moveKnob.current, aimKnob.current]) if (knob) knob.style.transform = 'translate(0px, 0px)'
    const held = [...captures.current]
    captures.current.clear()
    for (const [id, element] of held) {
      try { if (element.hasPointerCapture(id)) element.releasePointerCapture(id) } catch { /* Already cancelled. */ }
    }
  }, [clearAutoHold, getController])
  useEffect(() => bindTouchResetEvents(window, document, reset), [reset])

  function knobFor(control: 'move' | 'aim') { return control === 'move' ? moveKnob.current : aimKnob.current }

  function start(control: TouchControl, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault(); event.stopPropagation()
    const offset = control === 'fire' ? undefined : stickOffset(event.currentTarget.getBoundingClientRect(), knobFor(control)?.getBoundingClientRect().width || 32, event.clientX, event.clientY)
    if (!getController().press(control, event.pointerId, offset)) return
    if (control !== 'fire' && offset) {
      const knob = knobFor(control)
      if (knob) knob.style.transform = `translate(${offset.tx}px, ${offset.ty}px)`
    }
    if (control === 'aim') {
      clearAutoHold()
      if (offset && offset.mag >= MANUAL_DRAG_THRESHOLD) {
        setAimHint('manual')
      } else {
        setAimHint('auto')
        const pid = event.pointerId
        autoHoldTimer.current = window.setTimeout(() => {
          autoHoldTimer.current = null
          getController().enableAutoHoldFire(pid)
        }, AUTO_HOLD_DELAY_MS)
      }
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
      captures.current.set(event.pointerId, event.currentTarget)
    } catch {
      if (control === 'aim') {
        clearAutoHold()
        setAimHint('idle')
      }
      getController().release(control, event.pointerId, true)
      if (control !== 'fire') {
        const knob = knobFor(control)
        if (knob) knob.style.transform = 'translate(0px, 0px)'
      }
    }
  }

  function move(control: 'move' | 'aim', event: ReactPointerEvent<HTMLDivElement>) {
    if (captures.current.get(event.pointerId) !== event.currentTarget) return
    const knob = knobFor(control)
    const offset = stickOffset(event.currentTarget.getBoundingClientRect(), knob?.getBoundingClientRect().width || 32, event.clientX, event.clientY)
    if (control === 'aim' && offset.mag >= MANUAL_DRAG_THRESHOLD) {
      clearAutoHold()
      setAimHint('manual')
    } else if (control === 'aim' && aimHint === 'manual' && offset.mag < MANUAL_DRAG_THRESHOLD) {
      setAimHint('cancel')
    }
    getController().move(control, event.pointerId, offset)
    if (knob) knob.style.transform = `translate(${offset.tx}px, ${offset.ty}px)`
  }

  function end(control: TouchControl, event: ReactPointerEvent<HTMLElement>, cancelled = false) {
    if (control === 'aim') {
      clearAutoHold()
      setAimHint('idle')
    }
    if (!getController().release(control, event.pointerId, cancelled)) return
    captures.current.delete(event.pointerId)
    if (control !== 'fire') {
      const knob = knobFor(control)
      if (knob) knob.style.transform = 'translate(0px, 0px)'
    }
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Already released. */ }
  }

  function triggerInstant(event: ReactPointerEvent<HTMLButtonElement>, action: () => void) {
    event.preventDefault()
    event.stopPropagation()
    action()
  }

  const aimPadLabel =
    aimHint === 'auto'
      ? 'AUTO'
      : aimHint === 'manual'
        ? 'MANUAL'
        : aimHint === 'cancel'
          ? 'CANCELAR'
          : 'DISPARO'

  return <>
    <div className="touch-rail touch-rail-left" aria-label="Controles táctiles izquierda">
      <div className="touch-rail-actions">
        <button type="button" className="touch-pill-btn" aria-label="Enviar risa" title="Risa (1)" onClick={() => onEmote('dots')}><img className="touch-emote-icon" src="/assets/ui/emote-laugh.svg" alt="" draggable={false}/></button>
        <button type="button" className="touch-pill-btn" aria-label="Enviar corazón" title="Corazón (2)" onClick={() => onEmote('alert')}><img className="touch-emote-icon" src="/assets/ui/emote-heart.svg" alt="" draggable={false}/></button>
      </div>
      <div className="touch-left-cluster">
        <button
          type="button"
          className={`touch-action-btn is-dash${dashes <= 0 ? ' is-depleted' : ''}`}
          aria-label={`Dash (${dashes} de ${maxDashes} disponibles)`}
          disabled={dashes <= 0}
          onPointerDown={e => { if (dashes > 0) triggerInstant(e, onDash) }}
        >
          <span className="touch-dash-top">
            <img className="touch-btn-icon" src="/assets/ui/powerup-dash.svg" alt="" draggable={false} />
            <span>DASH {dashes}/{maxDashes}</span>
          </span>
          {dashes < maxDashes && (
            <span className="touch-dash-recharge-track" aria-hidden="true">
              <span
                className="touch-dash-recharge-fill"
                style={{ width: `${Math.round(dashRechargeProgress * 100)}%` }}
              />
            </span>
          )}
        </button>
        <div className="touch-stick touch-stick-move" role="application" aria-label="Joystick de movimiento"
          onPointerDown={e => start('move', e)} onPointerMove={e => move('move', e)}
          onPointerUp={e => end('move', e)} onPointerCancel={e => end('move', e, true)} onLostPointerCapture={e => end('move', e, true)}>
          <div ref={moveKnob} className="touch-stick-knob"/><span className="touch-stick-label">MOVER</span>
        </div>
      </div>
    </div>
    <div className="touch-rail touch-rail-right" aria-label="Controles táctiles derecha">
      <div className="touch-rail-actions">
        <button type="button" className="touch-pill-btn" onClick={() => { reset(); onMenu() }}>Menú</button>
      </div>
      <div className="touch-right-cluster">
        <div className="touch-secondary-row">
          <button
            type="button"
            className="touch-action-btn is-melee"
            aria-label="Ataque melé"
            onPointerDown={e => triggerInstant(e, onMelee)}
          >
            MELÉ
          </button>
          <button
            type="button"
            className={`touch-action-btn is-reload${needsReload ? ' is-highlight' : ''}`}
            aria-label="Recargar arma"
            disabled={!canReload || isReloading}
            onPointerDown={e => { if (canReload && !isReloading) triggerInstant(e, onReload) }}
          >
            {isReloading ? 'REC…' : 'REC'}
          </button>
        </div>
        <div
          className={`touch-stick touch-stick-aim is-brawl${aimHint !== 'idle' ? ` is-${aimHint}` : ''}`}
          role="application"
          aria-label="Botón de disparo tipo Brawl Stars: pulsa para autoapuntado o arrastra para apuntado manual"
          onPointerDown={e => start('aim', e)}
          onPointerMove={e => move('aim', e)}
          onPointerUp={e => end('aim', e)}
          onPointerCancel={e => end('aim', e, true)}
          onLostPointerCapture={e => end('aim', e, true)}
        >
          <div ref={aimKnob} className="touch-stick-knob is-aim"/>
          <span className="touch-stick-label">{aimPadLabel}</span>
        </div>
      </div>
    </div>
  </>
}
