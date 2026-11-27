import { createClient } from '@supabase/supabase-js'

export type AuthConfiguration = { url: string; key: string }
export type VerifiedAccount = {
  accountId: string
  name: string
  expiresAt: number
  customEmoteDataUrl?: string
}

export const MAX_CUSTOM_EMOTE_BYTES = 128 * 1024
const CUSTOM_EMOTE_PATH_PATTERN = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/

export function isValidCustomEmotePath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string' || !CUSTOM_EMOTE_PATH_PATTERN.test(path)) return false
  return path.split('/')[0] === userId.toLowerCase()
}

export function validateWebpMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || bytes.length > MAX_CUSTOM_EMOTE_BYTES) return false
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
}

export function authConfiguration(): AuthConfiguration {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en apps/game-server/.env')
  return { url, key }
}

export async function verifyArenaAccount(
  token: unknown,
  config: AuthConfiguration = authConfiguration(),
  fetcher: typeof fetch = fetch,
): Promise<VerifiedAccount> {
  if (typeof token !== 'string' || !token || token.length > 16384) {
    throw new Error('Inicia sesión antes de entrar a la arena.')
  }

  // Cliente aislado por solicitud: no compartir sesiones entre jugadores.
  const supabase = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetcher(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      }),
    },
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user || user.is_anonymous) throw new Error('La sesión no es válida. Vuelve a iniciar sesión.')

  // getUser ya verifico el token contra Auth. Aqui solo extraemos su vencimiento.
  let claims: { sub?: unknown; exp?: unknown }
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) }
  catch { throw new Error('La sesión no es válida. Vuelve a iniciar sesión.') }
  if (claims.sub !== user.id || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp)
      || claims.exp * 1000 <= Date.now()) {
    throw new Error('La sesión venció. Vuelve a iniciar sesión.')
  }

  // Esta consulta lleva el JWT del jugador: RLS se aplica al perfil propio.
  let profile: { id: string; username: unknown; custom_emote_path?: unknown } | null = null
  let profileFailure: { code?: string; message?: string } | null = null
  const withEmote = await supabase
    .from('profiles')
    .select('id, username, custom_emote_path')
    .eq('id', user.id)
    .single()
  if (
    withEmote.error &&
    (withEmote.error.code === '42703' || withEmote.error.code === 'PGRST204')
  ) {
    const legacy = await supabase.from('profiles').select('id, username').eq('id', user.id).single()
    profile = legacy.data as { id: string; username: unknown } | null
    profileFailure = legacy.error
  } else {
    profile = withEmote.data as { id: string; username: unknown; custom_emote_path?: unknown } | null
    profileFailure = withEmote.error
  }
  if (profileFailure || !profile || profile.id !== user.id) {
    throw new Error('No se pudo verificar tu perfil. Inténtalo de nuevo.')
  }
  if (typeof profile.username !== 'string' || profile.username.length < 3
      || profile.username.length > 20 || /[^A-Za-z0-9_]/.test(profile.username)) {
    throw new Error('Elige un username válido en tu perfil antes de jugar.')
  }
  if (claims.exp * 1000 <= Date.now()) throw new Error('La sesión venció. Vuelve a iniciar sesión.')

  let customEmoteDataUrl: string | undefined
  if (isValidCustomEmotePath(profile.custom_emote_path, user.id)) {
    try {
      const storageUrl = `${config.url.replace(/\/+$/, '')}/storage/v1/object/authenticated/emotes/${profile.custom_emote_path}`
      const emoteRes = await fetcher(storageUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: config.key,
        },
        signal: AbortSignal.timeout(5000),
      })
      if (emoteRes.ok) {
        const bytes = new Uint8Array(await emoteRes.arrayBuffer())
        if (validateWebpMagicBytes(bytes)) {
          customEmoteDataUrl = `data:image/webp;base64,${Buffer.from(bytes).toString('base64')}`
        }
      }
    } catch {
      // Fail-safe: un error cargando el emote opcional nunca bloquea el acceso a la arena.
    }
  }

  return {
    accountId: user.id,
    name: profile.username,
    expiresAt: claims.exp * 1000,
    ...(customEmoteDataUrl ? { customEmoteDataUrl } : {}),
  }
}
