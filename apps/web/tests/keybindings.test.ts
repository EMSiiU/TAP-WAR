import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PC_CONTROLS,
  formatBindingLabel,
  formatMoveGroupLabel,
  isValidPcBinding,
  loadPcControls,
  rebindPcControl,
  sanitizePcControls,
  savePcControls,
} from '../src/game/keybindings.ts'
import { findAutoAimAngle } from '../src/game/autoAim.ts'

test('validacion y saneamiento de controles de PC rechaza teclas no permitidas', () => {
  assert.equal(isValidPcBinding('KeyW'), true)
  assert.equal(isValidPcBinding('Mouse0'), true)
  assert.equal(isValidPcBinding('Mouse2'), true)
  assert.equal(isValidPcBinding('Space'), true)
  assert.equal(isValidPcBinding('ShiftLeft'), true)
  assert.equal(isValidPcBinding('Escape'), false)
  assert.equal(isValidPcBinding('<script>'), false)
  assert.equal(isValidPcBinding('Mouse5'), false)

  const sanitized = sanitizePcControls({
    dash: 'ShiftLeft',
    melee: 'KeyE',
    shoot: '<invalid>',
  })
  assert.equal(sanitized.dash, 'ShiftLeft')
  assert.equal(sanitized.melee, 'KeyE')
  assert.equal(sanitized.shoot, DEFAULT_PC_CONTROLS.shoot)
})

test('rebindPcControl intercambia teclas en conflicto y conserva persistencia', () => {
  const swapped = rebindPcControl(DEFAULT_PC_CONTROLS, 'dash', 'KeyR')
  assert.equal(swapped.dash, 'KeyR')
  assert.equal(swapped.reload, 'Space')

  const store = new Map<string, string>()
  const fakeStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
  }
  savePcControls(swapped, fakeStorage)
  assert.deepEqual(loadPcControls(fakeStorage), swapped)

  assert.equal(formatBindingLabel('Mouse0'), 'Clic izq.')
  assert.equal(formatBindingLabel('Mouse2'), 'Clic der.')
  assert.equal(formatBindingLabel('Space'), 'Espacio')
  assert.equal(formatBindingLabel('KeyR'), 'R')
  assert.equal(formatMoveGroupLabel(DEFAULT_PC_CONTROLS), 'WASD')
  assert.equal(DEFAULT_PC_CONTROLS.emote3, 'Digit3')
  assert.equal(sanitizePcControls({ emote3: 'KeyE' }).emote3, 'KeyE')
})

test('findAutoAimAngle apunta al enemigo vivo mas cercano e ignora aliados en tdm', () => {
  const local = { id: 'me', x: 200, y: 200, isDead: false, team: 'orange' as const }
  const players = [
    local,
    { id: 'ally', x: 230, y: 200, isDead: false, team: 'orange' as const },
    { id: 'dead', x: 240, y: 200, isDead: true, team: 'blue' as const },
    { id: 'enemyNear', x: 200, y: 310, isDead: false, team: 'blue' as const },
    { id: 'enemyFar', x: 500, y: 200, isDead: false, team: 'blue' as const },
  ]

  const tdmResult = findAutoAimAngle(local, players, 'tdm', 0, 0)
  assert.equal(tdmResult.target?.id, 'enemyNear')
  assert.ok(Math.abs(tdmResult.angle - Math.PI / 2) < 0.001)

  const ffaResult = findAutoAimAngle(local, players, 'ffa', 0, 0)
  assert.equal(ffaResult.target?.id, 'ally')
  assert.equal(ffaResult.angle, 0)

  // Falls back when no living enemies exist
  const none = findAutoAimAngle(local, [local], 'ffa', 1.25, 0)
  assert.equal(none.target, null)
  assert.equal(none.angle, 1.25)

  // Apunta al centro del hitbox vertical cuando se especifica targetOffsetY
  const targetOffsetAim = findAutoAimAngle(
    { id: 'me', x: 100, y: 200, isDead: false },
    [{ id: 'enemy', x: 200, y: 200, isDead: false }],
    'ffa',
    0,
    -10,
    500,
    -20,
  )
  assert.ok(targetOffsetAim.angle < 0, 'Debe compensar verticalmente hacia el torso del objetivo')
})
