import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createGamepadEdgeDetector,
  pickActiveGamepad,
  readGamepadInput,
} from '../src/game/gamepad.ts'
import { GAME_MODE_OPTIONS, MAP_OPTIONS, normalizeGameMode, normalizeRoomCode } from '../src/game/arenaMaps.ts'

test('readGamepadInput aplica deadzone y lee sticks analogicos y botones de combate', () => {
  const idle = readGamepadInput({ axes: [0.05, -0.09, 0.1, 0.1], buttons: [] })
  assert.equal(idle.moveX, 0)
  assert.equal(idle.moveY, 0)
  assert.equal(idle.aimActive, false)
  assert.equal(idle.shoot, false)
  assert.equal(idle.dash, false)
  assert.equal(idle.melee, false)
  assert.equal(idle.reload, false)

  const active = readGamepadInput({
    axes: [1, 0, 0, 1],
    buttons: new Array(16).fill(undefined).map((_, i) => {
      if (i === 7) return { pressed: true, value: 0.9 } // RT shoot
      if (i === 0) return { pressed: true, value: 1 } // A dash
      if (i === 1) return { pressed: true, value: 1 } // B melee
      if (i === 2) return { pressed: true, value: 1 } // X reload
      return { pressed: false, value: 0 }
    }),
  })
  assert.ok(active.moveX > 0.99)
  assert.equal(active.moveY, 0)
  assert.equal(active.aimActive, true)
  assert.ok(Math.abs(active.aimAngle - Math.PI / 2) < 0.001)
  assert.equal(active.shoot, true)
  assert.equal(active.dash, true)
  assert.equal(active.melee, true)
  assert.equal(active.reload, true)
})

test('readGamepadInput soporta cruceta D-pad y deteccion de flancos', () => {
  const buttons = new Array(16).fill(undefined).map(() => ({ pressed: false, value: 0 }))
  buttons[12] = { pressed: true, value: 1 } // D-pad up
  buttons[15] = { pressed: true, value: 1 } // D-pad right
  buttons[0] = { pressed: true, value: 1 } // A dash
  buttons[1] = { pressed: true, value: 1 } // B melee
  buttons[2] = { pressed: true, value: 1 } // X reload
  buttons[4] = { pressed: true, value: 1 } // L1 emoteDots
  buttons[9] = { pressed: true, value: 1 } // Start pause

  const sample = readGamepadInput({ axes: [0, 0, 0, 0], buttons })
  assert.ok(Math.abs(sample.moveX - Math.SQRT1_2) < 0.001)
  assert.ok(Math.abs(sample.moveY + Math.SQRT1_2) < 0.001)

  const detectEdges = createGamepadEdgeDetector()
  const first = detectEdges(sample)
  assert.equal(first.emoteDotsPressed, true)
  assert.equal(first.pausePressed, true)
  assert.equal(first.dashPressed, true)
  assert.equal(first.meleePressed, true)
  assert.equal(first.reloadPressed, true)

  const held = detectEdges(sample)
  assert.equal(held.emoteDotsPressed, false)
  assert.equal(held.pausePressed, false)
  assert.equal(held.dashPressed, false)
  assert.equal(held.meleePressed, false)
  assert.equal(held.reloadPressed, false)

  assert.equal(pickActiveGamepad([null, undefined]), null)
  assert.ok(pickActiveGamepad([null, { axes: [], buttons: [] }]))
})

test('normalizeRoomCode, MAP_OPTIONS y modos de juego funcionan correctamente', () => {
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
  assert.deepEqual(
    GAME_MODE_OPTIONS.map((m) => m.id),
    ['ffa', 'tdm', 'gungame'],
  )
  assert.equal(normalizeGameMode('tdm'), 'tdm')
  assert.equal(normalizeGameMode('gungame'), 'gungame')
  assert.equal(normalizeGameMode('otro'), 'ffa')
})
