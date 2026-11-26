export type UserAgentDataLike = {
  mobile?: boolean
  platform?: string
}

export type DeviceEnvironment = {
  userAgentData?: UserAgentDataLike | null
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
  matchMedia?: (query: string) => { matches: boolean }
}

export type DeviceCategory = 'mobile-or-tablet' | 'desktop'

interface NavigatorWithUserAgentData extends Navigator {
  readonly userAgentData?: UserAgentDataLike
}

const DESKTOP_CLIENT_HINT_PLATFORMS = new Set([
  'windows',
  'macos',
  'linux',
  'chrome os',
  'chromium os',
  'cros',
])

const MOBILE_UA_PATTERN = /android|iphone|ipod|ipad|mobile|tablet|kindle|silk|playbook|bb10|webos/i
const DESKTOP_UA_PATTERN = /windows nt|macintosh|x11;\s*linux|cros/i

/** Reads navigator/window signals safely in the browser for input-mode detection. */
export function readBrowserDeviceEnvironment(): DeviceEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {}
  }

  const nav = navigator as NavigatorWithUserAgentData
  return {
    userAgentData: nav.userAgentData ?? null,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    matchMedia: typeof window.matchMedia === 'function' ? (q) => window.matchMedia(q) : undefined,
  }
}

/**
 * Classifies the host device so phones and tablets default to touch controls,
 * while PCs and laptops (including touch laptops / touch monitors) default to
 * keyboard and mouse without disabling the manual touch toggle.
 */
export function detectDeviceCategory(env?: DeviceEnvironment): DeviceCategory {
  if (!env && typeof window === 'undefined') {
    return 'desktop'
  }

  const resolved = env ?? readBrowserDeviceEnvironment()
  const uad = resolved.userAgentData

  // 1. Chromium User-Agent Client Hints (Chrome, Edge, Opera, Android WebView).
  if (uad) {
    if (uad.mobile === true) {
      return 'mobile-or-tablet'
    }
    const uadPlatform = (uad.platform ?? '').trim().toLowerCase()
    if (uadPlatform === 'android' || uadPlatform === 'ios') {
      return 'mobile-or-tablet'
    }
    if (DESKTOP_CLIENT_HINT_PLATFORMS.has(uadPlatform)) {
      return 'desktop'
    }
  }

  const ua = resolved.userAgent ?? ''
  const platform = resolved.platform ?? ''
  const maxTouchPoints = resolved.maxTouchPoints ?? 0

  // 2. iPadOS 13+ sends a macOS Safari User-Agent while still reporting multi-touch.
  if (maxTouchPoints > 1 && (/macintosh|mac os x/i.test(ua) || platform === 'MacIntel')) {
    return 'mobile-or-tablet'
  }

  // 3. User-Agent string fallback (Safari, Firefox, non-Chromium browsers).
  if (MOBILE_UA_PATTERN.test(ua)) {
    return 'mobile-or-tablet'
  }
  if (DESKTOP_UA_PATTERN.test(ua)) {
    return 'desktop'
  }

  // 4. Primary CSS pointer/hover interaction query fallback (never raw maxTouchPoints > 0).
  const coarsePrimary = Boolean(resolved.matchMedia?.('(pointer: coarse)')?.matches)
  const noHoverPrimary = Boolean(resolved.matchMedia?.('(hover: none)')?.matches)
  const finePrimary = Boolean(resolved.matchMedia?.('(pointer: fine)')?.matches)

  return coarsePrimary && noHoverPrimary && !finePrimary ? 'mobile-or-tablet' : 'desktop'
}

/** Returns true when touch controls should start enabled by default. */
export function detectDefaultTouchMode(env?: DeviceEnvironment): boolean {
  return detectDeviceCategory(env) === 'mobile-or-tablet'
}
