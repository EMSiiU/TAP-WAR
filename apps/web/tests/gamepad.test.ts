import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createGamepadEdgeDetector,
  pickActiveGamepad,
  readGamepadInput,
} from '../src/game/gamepad.ts'
import { MAP_OPTIONS, normalizeRoomCode } from '../src/game/arenaMaps.ts'

test('readGamepadInput aplica deadzone y lee sticks analogicos', () => {
  const idle = readGamepadInput({ axes: [0.05, -0.09, 0.1, 0.1], buttons: [] })
  assert.equal(idle.moveX, 0)
  assert.equal(idle.moveY, 0)
  assert.equal(idle.aimActive, false)
  assert.equal(idle.shoot, false)

  const active = readGamepadInput({
    axes: [1, 0, 0, 1],
    buttons: new Array(16).fill(undefined).map((_, i) =>
      i === 7 ? { pressed: true, value: 0.9 } : { pressed: false, value: 0 },
    ),
  })
  assert.ok(active.moveX > 0.99)
  assert.equal(active.moveY, 0)
  assert.equal(active.aimActive, true)
  assert.ok(Math.abs(active.aimAngle - Math.PI / 2) < 0.001)
  assert.equal(active.shoot, true)
})

test('readGamepadInput soporta cruceta D-pad y deteccion de flancos', () => {
  const buttons = new Array(16).fill(undefined).map(() => ({ pressed: false, value: 0 }))
  buttons[12] = { pressed: true, value: 1 } // D-pad up
  buttons[15] = { pressed: true, value: 1 } // D-pad right
  buttons[4] = { pressed: true, value: 1 } // L1 emoteDots
  buttons[9] = { pressed: true, value: 1 } // Start pause

  const sample = readGamepadInput({ axes: [0, 0, 0, 0], buttons })
  assert.ok(Math.abs(sample.moveX - Math.SQRT1_2) < 0.001)
  assert.ok(Math.abs(sample.moveY + Math.SQRT1_2) < 0.001)

  const detectEdges = createGamepadEdgeDetector()
  const first = detectEdges(sample)
  assert.equal(first.emoteDotsPressed, true)
  assert.equal(first.pausePressed, true)

  const held = detectEdges(sample)
  assert.equal(held.emoteDotsPressed, false)
  assert.equal(held.pausePressed, false)

  assert.equal(pickActiveGamepad([null, undefined]), null)
  assert.ok(pickActiveGamepad([null, { axes: [], buttons: [] }]))
})

test('normalizeRoomCode y MAP_OPTIONS corresponden a 4, 10 y 20 jugadores', () => {
  assert.equal(normalizeRoomCode(' ab12cd '), 'AB12CD')
  assert.equal(normalizeRoomCode('??'), '')
  assert.deepEqual(
    MAP_OPTIONS.map((o) => [o.maxPlayers, o.mapSize]),
    [
      [4, 'small'],
      [10, 'medium'],
      [20, 'large'],
    ],
  )
})
