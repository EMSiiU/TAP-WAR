import { createClient } from '@supabase/supabase-js'
export { buildOAuthOptions, validUsername, type Profile } from './profile'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase = url && key ? createClient(url, key, {
  auth: { flowType: 'pkce', detectSessionInUrl: true },
}) : null

export const githubEnabled = import.meta.env.VITE_GITHUB_AUTH_ENABLED === 'true'
export function profileError(error: { code?: string; message?: string }): string {
  if (error.code === '23505') return 'Ese username ya está ocupado. Prueba con otro.'
  if (error.code === '23514') return 'Revisa el username y las preferencias seleccionadas.'
  return 'No se pudo guardar el perfil. Comprueba tu conexión e inténtalo de nuevo.'
}
