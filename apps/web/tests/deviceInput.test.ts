import test from 'node:test'
import assert from 'node:assert/strict'
import { detectDefaultTouchMode, detectDeviceCategory } from '../src/game/deviceInput.ts'

function mediaQueryMap(matches: Record<string, boolean>) {
  return (query: string) => ({ matches: Boolean(matches[query]) })
}

test('laptops y PCs de escritorio con pantalla tactil inician con teclado y raton por defecto', () => {
  // Windows Chrome touch laptop
  assert.equal(
    detectDefaultTouchMode({
      userAgentData: { mobile: false, platform: 'Windows' },
      maxTouchPoints: 10,
      matchMedia: mediaQueryMap({ '(pointer: fine)': true, '(hover: hover)': true }),
    }),
    false,
  )

  // Windows Chrome desktop with touch monitor (even if primary pointer reported coarse)
  assert.equal(
    detectDefaultTouchMode({
      userAgentData: { mobile: false, platform: 'Windows' },
      maxTouchPoints: 5,
      matchMedia: mediaQueryMap({ '(pointer: coarse)': true, '(hover: none)': true }),
    }),
    false,
  )

  // macOS, Linux, ChromeOS Chrome touch laptops
  for (const platform of ['macOS', 'Linux', 'Chrome OS']) {
    assert.equal(
      detectDeviceCategory({
        userAgentData: { mobile: false, platform },
        maxTouchPoints: 10,
      }),
      'desktop',
    )
  }

  // Windows Firefox touch laptop (no userAgentData)
  assert.equal(
    detectDefaultTouchMode({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
      platform: 'Win32',
      maxTouchPoints: 10,
      matchMedia: mediaQueryMap({ '(pointer: fine)': true }),
    }),
    false,
  )

  // Real macOS Safari desktop
  assert.equal(
    detectDefaultTouchMode({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    }),
    false,
  )
})

test('telefonos y tablets inician con controles tactiles activos por defecto', () => {
  // Android Chrome phone
  assert.equal(
    detectDefaultTouchMode({
      userAgentData: { mobile: true, platform: 'Android' },
      maxTouchPoints: 5,
    }),
    true,
  )

  // Android Chrome tablet (mobile: false, platform: 'Android')
  assert.equal(
    detectDefaultTouchMode({
      userAgentData: { mobile: false, platform: 'Android' },
      maxTouchPoints: 5,
    }),
    true,
  )

  // iPhone Safari (no userAgentData)
  assert.equal(
    detectDefaultTouchMode({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    }),
    true,
  )

  // iPadOS 13+ Safari (reports desktop Macintosh UA + MacIntel platform + multi-touch)
  assert.equal(
    detectDefaultTouchMode({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }),
    true,
  )

  // Android Firefox tablet (no Mobile token, Android UA)
  assert.equal(
    detectDefaultTouchMode({
      userAgent: 'Mozilla/5.0 (Android 14; Tablet; rv:130.0) Gecko/130.0 Firefox/130.0',
      maxTouchPoints: 5,
    }),
    true,
  )
})

test('fallback por media queries primarias distingue tactil puro de pantalla tactil con raton', () => {
  // Unknown UA with primary coarse pointer and no hover
  assert.equal(
    detectDefaultTouchMode({
      maxTouchPoints: 5,
      matchMedia: mediaQueryMap({ '(pointer: coarse)': true, '(hover: none)': true }),
    }),
    true,
  )

  // Unknown UA with fine primary pointer and maxTouchPoints (PC / convertible laptop)
  assert.equal(
    detectDefaultTouchMode({
      maxTouchPoints: 10,
      matchMedia: mediaQueryMap({ '(pointer: fine)': true, '(hover: hover)': true }),
    }),
    false,
  )
})
