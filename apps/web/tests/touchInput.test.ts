import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bindTouchResetEvents,
  neutralTouchInput,
  stickOffset,
  TouchInputController,
  type TouchInputState,
} from '../src/game/touchInput.ts'

const offset = (x: number, y: number) => stickOffset({ left: 0, top: 0, width: 80, height: 80 }, 32, x, y)
function setup() {
  let input = neutralTouchInput()
  const messages: TouchInputState[] = []
  const controller = new TouchInputController((next) => {
    input = next
    messages.push(next)
  })
  return { controller, messages, current: () => input }
}

test('estilo Brawl Stars: toque rapido en centro dispara con autoapuntado; mantener dispara continuo', () => {
  const { controller, current } = setup()
  // Tap near center (no drag)
  controller.press('aim', 1, offset(40, 40))
  assert.equal(current().aimActive, true)
  assert.equal(current().aimMode, 'auto')
  assert.equal(current().shoot, false)
  assert.equal(current().autoAimShotSeq, 0)

  // Quick release triggers immediate semi-auto shot
  controller.release('aim', 1)
  assert.equal(current().autoAimShotSeq, 1)
  assert.equal(current().aimActive, false)
  assert.equal(current().aimMode, 'none')

  // Hold in center enables continuous auto-aim fire
  controller.press('aim', 2, offset(40, 40))
  controller.enableAutoHoldFire(2)
  assert.equal(current().aimMode, 'auto')
  assert.equal(current().shoot, true)
  controller.release('aim', 2, true) // cancelled: no extra shot
  assert.equal(current().autoAimShotSeq, 1)
  assert.equal(current().shoot, false)
})

test('estilo Brawl Stars: arrastrar cambia a apuntado manual, dispara al soltar o en el borde, y cancelar al volver al centro', () => {
  const { controller, current } = setup()
  controller.press('aim', 1, offset(40, 40))
  // Drag moderately right (manual aim, not yet continuous fire)
  controller.move('aim', 1, offset(50, 40))
  assert.equal(current().aimMode, 'manual')
  assert.equal(current().aimAngle, 0)
  assert.equal(current().shoot, false)

  // Push to outer rim: continuous manual fire
  controller.move('aim', 1, offset(80, 40))
  assert.equal(current().aimMode, 'manual')
  assert.equal(current().shoot, true)

  // Release while dragged: triggers manual precision shot
  controller.release('aim', 1)
  assert.equal(current().manualShotSeq, 1)
  assert.equal(current().shoot, false)

  // Drag out then return to dead-center before release: cancels without firing
  controller.press('aim', 2, offset(40, 40))
  controller.move('aim', 2, offset(80, 40))
  controller.move('aim', 2, offset(40, 40))
  assert.equal(current().shoot, false)
  controller.release('aim', 2)
  assert.equal(current().manualShotSeq, 1, 'Soltar en el centro tras arrastrar cancela el disparo')
})

test('movimiento y disparo simultáneos se detienen al abrir menú o desmontar controles', () => {
  const { controller, current } = setup()
  controller.press('move', 1, offset(80, 40))
  controller.press('aim', 2, offset(80, 40))
  controller.press('fire', 3)
  assert.equal(current().moveX, 1)
  assert.equal(current().shoot, true)
  controller.reset()
  assert.equal(current().moveX, 0)
  assert.equal(current().moveY, 0)
  assert.equal(current().shoot, false)
  assert.equal(current().aimActive, false)
  // Pointer events from the destroyed controls cannot revive their input.
  controller.move('move', 1, offset(80, 40))
  controller.move('aim', 2, offset(80, 40))
  assert.equal(current().moveX, 0)
  assert.equal(current().shoot, false)
})

test('cancelar o perder captura detiene el control correspondiente sin cancelar otros dedos', () => {
  const { controller, current } = setup()
  controller.press('move', 1, offset(80, 40))
  controller.press('aim', 2, offset(80, 40))
  controller.release('aim', 2, true)
  assert.equal(current().shoot, false)
  assert.equal(current().aimActive, false)
  assert.equal(current().moveX, 1)
  controller.release('move', 1)
  assert.equal(current().moveX, 0)
  assert.equal(current().moveY, 0)
})

test('otro dedo no reemplaza al dueño del botón de disparo', () => {
  const { controller, current } = setup()
  assert.equal(controller.press('fire', 1), true)
  assert.equal(controller.press('fire', 2), false)
  assert.equal(controller.release('fire', 2), false)
  assert.equal(current().shoot, true)
  controller.release('fire', 1)
  assert.equal(current().shoot, false)
})

test('soltar apuntado no cancela el botón de disparo que sigue pulsado', () => {
  const { controller, current } = setup()
  controller.press('aim', 1, offset(80, 40))
  controller.press('fire', 2)
  controller.release('aim', 1, true)
  assert.equal(current().shoot, true)
  controller.release('fire', 2)
  assert.equal(current().shoot, false)
})

test('un pointerup antiguo no cancela un gesto nuevo después de reanudar', () => {
  const { controller, current } = setup()
  controller.press('move', 1, offset(80, 40))
  controller.reset()
  controller.press('move', 2, offset(0, 40))
  controller.release('move', 1)
  assert.equal(current().moveX, -1)
})

test('apuntado hacia la izquierda emite un ángulo aceptado por el servidor', () => {
  const { controller, current } = setup()
  controller.press('aim', 1, offset(0, 40))
  assert.equal(current().aimAngle, -Math.PI)
})

test('palancas pequeñas mantienen el pomo completo dentro de la base, en todas las direcciones', () => {
  for (const size of [56, 64, 80, 92, 112])
    for (const [x, y] of [
      [-1000, 0],
      [1000, 0],
      [0, -1000],
      [0, 1000],
      [1000, 1000],
    ]) {
      const knob = Math.max(28, Math.min(44, size * 0.4))
      const value = stickOffset({ left: 0, top: 0, width: size, height: size }, knob, x, y)
      assert.ok(Math.hypot(value.tx, value.ty) + knob / 2 <= size / 2 - 3.999)
      assert.ok(Math.hypot(value.nx, value.ny) <= 1.000001)
      assert.ok(value.mag <= 1)
    }
})

for (const name of ['blur', 'resize', 'orientationchange', 'pagehide', 'visibilitychange']) {
  test(`${name} limpia movimiento y disparo sin disparar accidentalmente`, () => {
    const { controller, current } = setup()
    const windowTarget = new EventTarget()
    const documentTarget = Object.assign(new EventTarget(), { hidden: false })
    const detach = bindTouchResetEvents(windowTarget, documentTarget, () => controller.reset())
    controller.press('move', 1, offset(80, 40))
    controller.press('aim', 2, offset(80, 40))
    controller.press('fire', 3)
    if (name === 'visibilitychange') {
      documentTarget.hidden = true
      documentTarget.dispatchEvent(new Event(name))
    } else windowTarget.dispatchEvent(new Event(name))
    assert.equal(current().moveX, 0)
    assert.equal(current().shoot, false)
    assert.equal(current().autoAimShotSeq, 0)
    assert.equal(current().manualShotSeq, 0)
    detach()
  })
}

test('desmontar limpia la entrada y retira listeners; recuperar visibilidad no restaura gestos', () => {
  const { controller, current, messages } = setup()
  const windowTarget = new EventTarget()
  const documentTarget = Object.assign(new EventTarget(), { hidden: false })
  const detach = bindTouchResetEvents(windowTarget, documentTarget, () => controller.reset())
  controller.press('fire', 1)
  documentTarget.dispatchEvent(new Event('visibilitychange'))
  assert.equal(current().shoot, true)
  detach()
  assert.equal(current().shoot, false)
  const count = messages.length
  windowTarget.dispatchEvent(new Event('blur'))
  documentTarget.hidden = true
  documentTarget.dispatchEvent(new Event('visibilitychange'))
  assert.equal(messages.length, count)
})
