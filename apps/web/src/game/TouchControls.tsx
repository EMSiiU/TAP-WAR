import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  AIM_CANCEL_EXIT_PX,
  AIM_DRAG_ENTER_PX,
  aimDragOffset,
  bindGlobalTouchSafetyEvents,
  bindTouchResetEvents,
  stickOffset,
  TouchInputController,
  type TouchControl,
  type TouchInputState,
} from './touchInput'
import {
  DEFAULT_TOUCH_LAYOUTS,
  type TouchControlSlotId,
  type TouchLayoutByOrientation,
} from './touchLayout'
export type { TouchInputState } from './touchInput'

const AUTO_HOLD_DELAY_MS = 210

type TouchControlsProps = {
  layout?: TouchLayoutByOrientation
  onTouchInput: (input: TouchInputState) => void
  onEmote: (emote: 'dots' | 'alert' | 'custom') => void
  customEmoteUrl?: string | null
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
  scoreboardOpen?: boolean
  onToggleScoreboard?: () => void
}

function readIsPortrait(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(orientation: portrait)')?.matches) return true
  return window.innerHeight > window.innerWidth
}

export default function TouchControls({
  layout = DEFAULT_TOUCH_LAYOUTS,
  onTouchInput,
  onEmote,
  customEmoteUrl,
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
  scoreboardOpen,
  onToggleScoreboard,
}: TouchControlsProps) {
  const moveKnob = useRef<HTMLDivElement>(null)
  const aimKnob = useRef<HTMLDivElement>(null)
  const publish = useRef(onTouchInput)
  const captures = useRef(new Map<number, HTMLElement>())
  const activePointersRef = useRef(
    new Map<number, { control: 'move' | 'aim'; element: HTMLDivElement }>(),
  )
  const controller = useRef<TouchInputController | null>(null)
  const autoHoldTimer = useRef<number | null>(null)
  const aimOriginRef = useRef<{ x: number; y: number } | null>(null)
  const aimDraggedRef = useRef(false)
  const [aimHint, setAimHint] = useState<'idle' | 'auto' | 'manual' | 'cancel'>('idle')
  const [isPortrait, setIsPortrait] = useState<boolean>(() => readIsPortrait())

  useEffect(() => {
    publish.current = onTouchInput
  }, [onTouchInput])

  useEffect(() => {
    const syncOrientation = () => setIsPortrait(readIsPortrait())
    window.addEventListener('resize', syncOrientation)
    window.addEventListener('orientationchange', syncOrientation)
    return () => {
      window.removeEventListener('resize', syncOrientation)
      window.removeEventListener('orientationchange', syncOrientation)
    }
  }, [])

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

  const clearAimUi = useCallback(() => {
    clearAutoHold()
    aimOriginRef.current = null
    aimDraggedRef.current = false
    setAimHint('idle')
  }, [clearAutoHold])

  const reset = useCallback(() => {
    clearAimUi()
    activePointersRef.current.clear()
    getController().reset()
    for (const knob of [moveKnob.current, aimKnob.current]) {
      if (knob) knob.style.transform = 'translate(0px, 0px)'
    }
    const held = [...captures.current]
    captures.current.clear()
    for (const [id, element] of held) {
      try {
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id)
      } catch {
        /* Already cancelled. */
      }
    }
  }, [clearAimUi, getController])
  useEffect(() => bindTouchResetEvents(window, document, reset), [reset])

  function knobFor(control: 'move' | 'aim') {
    return control === 'move' ? moveKnob.current : aimKnob.current
  }

  const applyStickMove = useCallback(
    (
      control: 'move' | 'aim',
      element: HTMLDivElement,
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => {
      const knob = knobFor(control)
      const rect = element.getBoundingClientRect()
      const knobW = knob?.getBoundingClientRect().width || 32

      if (control === 'aim') {
        const origin = aimOriginRef.current ?? { x: clientX, y: clientY }
        const maxTravel = Math.max(24, Math.min(rect.width, rect.height) / 2 - knobW / 2 - 4)
        const offset = aimDragOffset(origin.x, origin.y, clientX, clientY, maxTravel)
        const dist = offset.distPx ?? 0
        if (!aimDraggedRef.current && dist >= AIM_DRAG_ENTER_PX) {
          aimDraggedRef.current = true
          clearAutoHold()
          setAimHint('manual')
        } else if (aimDraggedRef.current) {
          setAimHint(dist < AIM_CANCEL_EXIT_PX ? 'cancel' : 'manual')
        }
        getController().move('aim', pointerId, offset)
        if (knob) knob.style.transform = `translate(${offset.tx}px, ${offset.ty}px)`
        return
      }

      const offset = stickOffset(rect, knobW, clientX, clientY)
      getController().move('move', pointerId, offset)
      if (knob) knob.style.transform = `translate(${offset.tx}px, ${offset.ty}px)`
    },
    [clearAutoHold, getController],
  )

  useEffect(() => {
    const releaseOrphan = (pointerId: number, cancelled: boolean) => {
      activePointersRef.current.delete(pointerId)
      captures.current.delete(pointerId)
      const released = getController().releaseByPointerId(pointerId, cancelled)
      if (released === 'aim') clearAimUi()
      if (released === 'move' || released === 'aim') {
        const knob = knobFor(released)
        if (knob) knob.style.transform = 'translate(0px, 0px)'
      }
    }

    const handleGlobalMove = (event: PointerEvent) => {
      const entry = activePointersRef.current.get(event.pointerId)
      if (!entry) return
      if (event.pointerType !== 'touch' && event.buttons === 0) {
        releaseOrphan(event.pointerId, true)
        return
      }
      applyStickMove(entry.control, entry.element, event.pointerId, event.clientX, event.clientY)
    }

    window.addEventListener('pointermove', handleGlobalMove, true)
    const detachSafety = bindGlobalTouchSafetyEvents(window, {
      onPointerEnd: releaseOrphan,
      onNoTouchesLeft: () => {
        if (getController().hasActivePointers()) reset()
      },
    })

    return () => {
      window.removeEventListener('pointermove', handleGlobalMove, true)
      detachSafety()
    }
  }, [applyStickMove, clearAimUi, getController, reset])

  function start(control: TouchControl, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()

    if (control === 'move' || control === 'aim') {
      const prevId = getController().getPointerId(control)
      if (prevId !== null && prevId !== event.pointerId) {
        let prevCaptured: boolean
        try {
          prevCaptured = Boolean(captures.current.get(prevId)?.hasPointerCapture?.(prevId))
        } catch {
          prevCaptured = false
        }
        if (event.isPrimary || !prevCaptured) {
          activePointersRef.current.delete(prevId)
          captures.current.delete(prevId)
          getController().release(control, prevId, true)
          if (control === 'aim') clearAimUi()
          const prevKnob = knobFor(control)
          if (prevKnob) prevKnob.style.transform = 'translate(0px, 0px)'
        }
      }
    }

    if (control === 'aim') {
      if (!getController().press('aim', event.pointerId)) return
      aimOriginRef.current = { x: event.clientX, y: event.clientY }
      aimDraggedRef.current = false
      clearAutoHold()
      if (aimKnob.current) aimKnob.current.style.transform = 'translate(0px, 0px)'
      setAimHint('auto')
      const pid = event.pointerId
      autoHoldTimer.current = window.setTimeout(() => {
        autoHoldTimer.current = null
        getController().enableAutoHoldFire(pid)
      }, AUTO_HOLD_DELAY_MS)
    } else {
      const offset =
        control === 'fire'
          ? undefined
          : stickOffset(
              event.currentTarget.getBoundingClientRect(),
              knobFor(control)?.getBoundingClientRect().width || 32,
              event.clientX,
              event.clientY,
            )
      if (!getController().press(control, event.pointerId, offset)) return
      if (control !== 'fire' && offset) {
        const knob = knobFor(control)
        if (knob) knob.style.transform = `translate(${offset.tx}px, ${offset.ty}px)`
      }
    }

    if (control === 'move' || control === 'aim') {
      activePointersRef.current.set(event.pointerId, {
        control,
        element: event.currentTarget as HTMLDivElement,
      })
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
      captures.current.set(event.pointerId, event.currentTarget)
    } catch {
      /* Global window listeners continue tracking even if WebKit refuses pointer capture near screen edges. */
    }
  }

  function move(control: 'move' | 'aim', event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointersRef.current.has(event.pointerId)) return
    if (captures.current.get(event.pointerId) !== event.currentTarget) return
    applyStickMove(control, event.currentTarget, event.pointerId, event.clientX, event.clientY)
  }

  function end(control: TouchControl, event: ReactPointerEvent<HTMLElement>, cancelled = false) {
    activePointersRef.current.delete(event.pointerId)
    captures.current.delete(event.pointerId)
    if (control === 'aim') {
      clearAimUi()
    }
    if (!getController().release(control, event.pointerId, cancelled)) return
    if (control !== 'fire') {
      const knob = knobFor(control)
      if (knob) knob.style.transform = 'translate(0px, 0px)'
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      /* Already released. */
    }
  }

  function triggerInstant(event: ReactPointerEvent<HTMLButtonElement>, action: () => void) {
    event.preventDefault()
    event.stopPropagation()
    action()
  }

  const activeSlots = isPortrait ? layout.portrait : layout.landscape
  function slotStyle(id: TouchControlSlotId): CSSProperties {
    const slot = activeSlots[id]
    return {
      left: `${slot.x * 100}%`,
      top: `${slot.y * 100}%`,
      transform: `translate(-50%, -50%) scale(${slot.scale})`,
    }
  }

  const aimPadLabel =
    aimHint === 'auto'
      ? 'AUTO'
      : aimHint === 'manual'
        ? 'MANUAL'
        : aimHint === 'cancel'
          ? 'CANCELAR'
          : 'DISPARO'

  return (
    <div className="touch-overlay-layer" aria-label="Controles táctiles">
      <div className="touch-draggable-slot touch-rail-actions" style={slotStyle('emotes')}>
        <button
          type="button"
          className="touch-pill-btn"
          aria-label="Enviar risa"
          title="Risa (1)"
          onClick={() => onEmote('dots')}
        >
          <img className="touch-emote-icon" src="/assets/ui/emote-laugh.svg" alt="" draggable={false} />
        </button>
        <button
          type="button"
          className="touch-pill-btn"
          aria-label="Enviar corazón"
          title="Corazón (2)"
          onClick={() => onEmote('alert')}
        >
          <img className="touch-emote-icon" src="/assets/ui/emote-heart.svg" alt="" draggable={false} />
        </button>
        {customEmoteUrl && (
          <button
            type="button"
            className="touch-pill-btn"
            aria-label="Enviar emote personalizado"
            title="Emote personalizado (3)"
            onClick={() => onEmote('custom')}
          >
            <img className="touch-emote-icon is-custom-emote" src={customEmoteUrl} alt="" draggable={false} />
          </button>
        )}
      </div>

      <div className="touch-draggable-slot touch-rail-actions" style={slotStyle('menu')}>
        {onToggleScoreboard && (
          <button
            type="button"
            className={`touch-pill-btn touch-scoreboard-btn${scoreboardOpen ? ' is-active' : ''}`}
            aria-label="Ver estadísticas de la partida"
            aria-pressed={Boolean(scoreboardOpen)}
            onClick={onToggleScoreboard}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <rect x="2" y="9" width="3.5" height="7" rx="1" fill="currentColor" />
              <rect x="7.25" y="4" width="3.5" height="12" rx="1" fill="currentColor" />
              <rect x="12.5" y="7" width="3.5" height="9" rx="1" fill="currentColor" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="touch-pill-btn"
          onClick={() => {
            reset()
            onMenu()
          }}
        >
          Menú
        </button>
      </div>

      <div className="touch-draggable-slot" style={slotStyle('move')}>
        <div
          className="touch-stick touch-stick-move"
          role="application"
          aria-label="Joystick de movimiento"
          onPointerDown={(e) => start('move', e)}
          onPointerMove={(e) => move('move', e)}
          onPointerUp={(e) => end('move', e)}
          onPointerCancel={(e) => end('move', e, true)}
          onLostPointerCapture={(e) => end('move', e, true)}
        >
          <div ref={moveKnob} className="touch-stick-knob" />
          <span className="touch-stick-label">MOVER</span>
        </div>
      </div>

      <div className="touch-draggable-slot" style={slotStyle('dash')}>
        <button
          type="button"
          className={`touch-action-btn is-dash${dashes <= 0 ? ' is-depleted' : ''}`}
          aria-label={`Dash (${dashes} de ${maxDashes} disponibles)`}
          disabled={dashes <= 0}
          onPointerDown={(e) => {
            if (dashes > 0) triggerInstant(e, onDash)
          }}
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
      </div>

      <div className="touch-draggable-slot" style={slotStyle('melee')}>
        <button
          type="button"
          className="touch-action-btn is-melee is-round-action"
          aria-label="Ataque melé"
          onPointerDown={(e) => triggerInstant(e, onMelee)}
        >
          MELÉ
        </button>
      </div>

      <div className="touch-draggable-slot" style={slotStyle('reload')}>
        <button
          type="button"
          className={`touch-action-btn is-reload is-round-action${needsReload ? ' is-highlight' : ''}`}
          aria-label="Recargar arma"
          disabled={!canReload || isReloading}
          onPointerDown={(e) => {
            if (canReload && !isReloading) triggerInstant(e, onReload)
          }}
        >
          {isReloading ? 'REC…' : 'REC'}
        </button>
      </div>

      <div className="touch-draggable-slot" style={slotStyle('aim')}>
        <div
          className={`touch-stick touch-stick-aim is-brawl${aimHint !== 'idle' ? ` is-${aimHint}` : ''}`}
          role="application"
          aria-label="Botón de disparo tipo Brawl Stars: pulsa para autoapuntado o arrastra para apuntado manual"
          onPointerDown={(e) => start('aim', e)}
          onPointerMove={(e) => move('aim', e)}
          onPointerUp={(e) => end('aim', e)}
          onPointerCancel={(e) => end('aim', e, true)}
          onLostPointerCapture={(e) => end('aim', e, true)}
        >
          <span className="touch-deadzone-ring" aria-hidden="true" />
          <div ref={aimKnob} className="touch-stick-knob is-aim" />
          <span className="touch-stick-label">{aimPadLabel}</span>
        </div>
      </div>
    </div>
  )
}
