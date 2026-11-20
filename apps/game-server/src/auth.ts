import { createClient } from '@supabase/supabase-js'

export type AuthConfiguration = { url: string; key: string }
export type VerifiedAccount = { accountId: string; name: string; expiresAt: number }

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
  const { data: profile, error: profileFailure } = await supabase.from('profiles')
    .select('id, username').eq('id', user.id).single()
  if (profileFailure || !profile || profile.id !== user.id) {
    throw new Error('No se pudo verificar tu perfil. Inténtalo de nuevo.')
  }
  if (typeof profile.username !== 'string' || profile.username.length < 3
      || profile.username.length > 20 || /[^A-Za-z0-9_]/.test(profile.username)) {
    throw new Error('Elige un username válido en tu perfil antes de jugar.')
  }
  if (claims.exp * 1000 <= Date.now()) throw new Error('La sesión venció. Vuelve a iniciar sesión.')
  return { accountId: user.id, name: profile.username, expiresAt: claims.exp * 1000 }
}
