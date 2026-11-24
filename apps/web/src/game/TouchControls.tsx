import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { bindTouchResetEvents, stickOffset, TouchInputController, type TouchControl, type TouchInputState } from './touchInput'
export type { TouchInputState } from './touchInput'

type TouchControlsProps = {
  onTouchInput: (input: TouchInputState) => void
  onEmote: (emote: 'dots' | 'alert') => void
  onMenu: () => void
}

export default function TouchControls({ onTouchInput, onEmote, onMenu }: TouchControlsProps) {
  const moveKnob = useRef<HTMLDivElement>(null)
  const aimKnob = useRef<HTMLDivElement>(null)
  const publish = useRef(onTouchInput)
  publish.current = onTouchInput
  const captures = useRef(new Map<number, HTMLElement>())
  const controller = useRef<TouchInputController | null>(null)
  if (!controller.current) controller.current = new TouchInputController(input => publish.current(input))

  const reset = useCallback(() => {
    controller.current!.reset()
    for (const knob of [moveKnob.current, aimKnob.current]) if (knob) knob.style.transform = 'translate(0px, 0px)'
    const held = [...captures.current]
    captures.current.clear()
    for (const [id, element] of held) {
      try { if (element.hasPointerCapture(id)) element.releasePointerCapture(id) } catch { /* Already cancelled. */ }
    }
  }, [])
  useEffect(() => bindTouchResetEvents(window, document, reset), [reset])

  function knobFor(control: 'move' | 'aim') { return control === 'move' ? moveKnob.current : aimKnob.current }
  function start(control: TouchControl, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault(); event.stopPropagation()
    const offset = control === 'fire' ? undefined : stickOffset(event.currentTarget.getBoundingClientRect(), knobFor(control)?.getBoundingClientRect().width || 32, event.clientX, event.clientY)
    if (!controller.current!.press(control, event.pointerId, offset)) return
    if (control !== 'fire' && offset) {
      const knob = knobFor(control)
      if (knob) knob.style.transform = `translate(${offset.tx}px, ${offset.ty}px)`
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
      captures.current.set(event.pointerId, event.currentTarget)
    } catch {
      controller.current!.release(control, event.pointerId)
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
    controller.current!.move(control, event.pointerId, offset)
    if (knob) knob.style.transform = `translate(${offset.tx}px, ${offset.ty}px)`
  }
  function end(control: TouchControl, event: ReactPointerEvent<HTMLElement>) {
    if (!controller.current!.release(control, event.pointerId)) return
    captures.current.delete(event.pointerId)
    if (control !== 'fire') {
      const knob = knobFor(control)
      if (knob) knob.style.transform = 'translate(0px, 0px)'
    }
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Already released. */ }
  }

  return <>
    <div className="touch-rail touch-rail-left" aria-label="Controles táctiles izquierda">
      <div className="touch-rail-actions">
        <button type="button" className="touch-pill-btn" aria-label="Enviar risa" title="Risa (1)" onClick={() => onEmote('dots')}><img className="touch-emote-icon" src="/assets/ui/emote-laugh.svg" alt="" draggable={false}/></button>
        <button type="button" className="touch-pill-btn" aria-label="Enviar corazón" title="Corazón (2)" onClick={() => onEmote('alert')}><img className="touch-emote-icon" src="/assets/ui/emote-heart.svg" alt="" draggable={false}/></button>
      </div>
      <div className="touch-stick touch-stick-move" role="application" aria-label="Joystick de movimiento"
        onPointerDown={e => start('move', e)} onPointerMove={e => move('move', e)}
        onPointerUp={e => end('move', e)} onPointerCancel={e => end('move', e)} onLostPointerCapture={e => end('move', e)}>
        <div ref={moveKnob} className="touch-stick-knob"/><span className="touch-stick-label">MOVER</span>
      </div>
    </div>
    <div className="touch-rail touch-rail-right" aria-label="Controles táctiles derecha">
      <div className="touch-rail-actions">
        <button type="button" className="touch-pill-btn" onClick={() => { reset(); onMenu() }}>Menú</button>
      </div>
      <div className="touch-right-cluster">
        <button type="button" className="touch-fire-btn" aria-label="Disparar"
          onPointerDown={e => start('fire', e)} onPointerUp={e => end('fire', e)}
          onPointerCancel={e => end('fire', e)} onLostPointerCapture={e => end('fire', e)}>DISPARO</button>
        <div className="touch-stick touch-stick-aim" role="application" aria-label="Joystick de apuntado y disparo"
          onPointerDown={e => start('aim', e)} onPointerMove={e => move('aim', e)}
          onPointerUp={e => end('aim', e)} onPointerCancel={e => end('aim', e)} onLostPointerCapture={e => end('aim', e)}>
          <div ref={aimKnob} className="touch-stick-knob is-aim"/><span className="touch-stick-label">APUNTAR</span>
        </div>
      </div>
    </div>
  </>
}
