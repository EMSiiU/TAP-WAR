import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampTouchSlot,
  DEFAULT_TOUCH_LAYOUTS,
  loadLocalTouchLayouts,
  sanitizeTouchLayouts,
  saveLocalTouchLayouts,
  TOUCH_SLOT_MAX_SCALE,
  TOUCH_SLOT_MAX_X,
  TOUCH_SLOT_MIN_SCALE,
  TOUCH_SLOT_MIN_X,
} from '../src/game/touchLayout.ts'

test('sanitizeTouchLayouts acota coordenadas fuera de rango y rechaza datos invalidos', () => {
  const clamped = clampTouchSlot({ x: 5, y: -3, scale: 99 }, { x: 0.5, y: 0.5, scale: 1 })
  assert.equal(clamped.x, TOUCH_SLOT_MAX_X)
  assert.ok(clamped.y > 0 && clamped.y < 0.2)
  assert.equal(clamped.scale, TOUCH_SLOT_MAX_SCALE)

  const sanitized = sanitizeTouchLayouts({
    landscape: {
      dash: { x: 0.65, y: 0.45, scale: 1.2 },
      aim: { x: Number.NaN, y: 0.1, scale: 0.1 },
      unknownKey: { x: 0.2, y: 0.2, scale: 1 },
    },
  })
  assert.deepEqual(sanitized.landscape.dash, { x: 0.65, y: 0.45, scale: 1.2 })
  assert.equal(sanitized.landscape.aim.x, DEFAULT_TOUCH_LAYOUTS.landscape.aim.x)
  assert.equal(sanitized.landscape.aim.scale, TOUCH_SLOT_MIN_SCALE)
  assert.equal((sanitized.landscape as Record<string, unknown>).unknownKey, undefined)
  assert.deepEqual(sanitized.portrait, DEFAULT_TOUCH_LAYOUTS.portrait)
})

test('dash por defecto esta en la derecha y persistencia local aisla cuentas', () => {
  assert.ok(DEFAULT_TOUCH_LAYOUTS.landscape.dash.x > 0.5)
  assert.ok(DEFAULT_TOUCH_LAYOUTS.landscape.move.x < 0.5)

  const store = new Map<string, string>()
  const fakeStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
  }

  const accA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const accB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const customA = sanitizeTouchLayouts({
    landscape: { move: { x: TOUCH_SLOT_MIN_X, y: 0.55, scale: 1.15 } },
  })
  saveLocalTouchLayouts(customA, accA, fakeStorage)

  assert.deepEqual(loadLocalTouchLayouts(accA, fakeStorage).landscape.move, {
    x: TOUCH_SLOT_MIN_X,
    y: 0.55,
    scale: 1.15,
  })

  // Un usuario distinto con su propia configuracion conserva la suya sin mezclarla
  const customB = sanitizeTouchLayouts({
    landscape: { move: { x: 0.22, y: 0.62, scale: 0.9 } },
  })
  saveLocalTouchLayouts(customB, accB, fakeStorage)
  assert.deepEqual(loadLocalTouchLayouts(accB, fakeStorage).landscape.move, {
    x: 0.22,
    y: 0.62,
    scale: 0.9,
  })
  assert.deepEqual(loadLocalTouchLayouts(accA, fakeStorage).landscape.move, {
    x: TOUCH_SLOT_MIN_X,
    y: 0.55,
    scale: 1.15,
  })
})

test('layout horizontal por defecto queda en los márgenes laterales y migra v1 sin tocar ajustes propios', () => {
  for (const [id, slot] of Object.entries(DEFAULT_TOUCH_LAYOUTS.landscape)) {
    assert.ok(
      slot.x <= 0.18 || slot.x >= 0.82,
      `El control ${id} (${slot.x}) invade la zona central de la arena`,
    )
  }

  const migrated = sanitizeTouchLayouts({
    landscape: {
      move: { x: 0.11, y: 0.72, scale: 1 },
      emotes: { x: 0.10, y: 0.16, scale: 1 },
      menu: { x: 0.90, y: 0.14, scale: 1 },
      aim: { x: 0.89, y: 0.72, scale: 1 },
      dash: { x: 0.74, y: 0.80, scale: 1 },
      melee: { x: 0.76, y: 0.50, scale: 1 },
      reload: { x: 0.90, y: 0.41, scale: 1 },
    },
  })
  assert.deepEqual(migrated.landscape, DEFAULT_TOUCH_LAYOUTS.landscape)

  const customized = sanitizeTouchLayouts({
    landscape: {
      move: { x: 0.11, y: 0.72, scale: 1 },
      emotes: { x: 0.10, y: 0.16, scale: 1 },
      menu: { x: 0.90, y: 0.14, scale: 1 },
      aim: { x: 0.89, y: 0.72, scale: 1 },
      dash: { x: 0.72, y: 0.80, scale: 1 },
      melee: { x: 0.76, y: 0.50, scale: 1 },
      reload: { x: 0.90, y: 0.41, scale: 1 },
    },
  })
  assert.deepEqual(customized.landscape.dash, { x: 0.72, y: 0.80, scale: 1 })
})
