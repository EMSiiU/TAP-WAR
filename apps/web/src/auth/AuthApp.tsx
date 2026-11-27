import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from '../App'
import { buildOAuthOptions, githubEnabled, supabase, validUsername, type Profile } from './supabase'
import ProfileEditor from './ProfileEditor'
import './auth.css'

function AccountCard({ children }: { children: React.ReactNode }) {
  return <main className="lobby-page auth-page">
    <section className="lobby-card auth-card" aria-label="Cuenta TAP-WAR">
      <p className="auth-eyebrow">ARENA DEL DESIERTO</p>
      <h1 className="lobby-title">TAP-WAR</h1>
      <div className="auth-characters" aria-hidden="true">
        {['fox', 'squirrel', 'mouse', 'rabbit'].map(skin =>
          <img key={skin} src={`/assets/characters/player-${skin}-idle.png`} alt="" />)}
      </div>
      {children}
    </section>
  </main>
}

function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    setError(''); setNotice('')
    if (mode === 'register' && password !== confirmation) {
      setError('Las contraseñas no coinciden.'); return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (failure) {
          setError(failure.code === 'email_not_confirmed'
            ? 'Confirma tu correo antes de entrar.'
            : 'No se pudo iniciar sesión. Revisa el correo y la contraseña.'); return
        }
      } else {
        const { data, error: failure } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (failure) {
          setError(failure.code === 'over_email_send_rate_limit'
            ? 'Se alcanzó el límite de correos. Inténtalo más tarde.'
            : 'No se pudo completar el registro. Comprueba los datos y la disponibilidad del correo de confirmación.'); return
        }
        if (!data.session) {
          setNotice('Si el registro procede, recibirás un correo para confirmar tu cuenta. Después podrás iniciar sesión.')
          setPassword(''); setConfirmation('')
        }
      }
    } catch { setError('No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.') }
    finally { setBusy(false) }
  }

  async function social(provider: 'google' | 'github') {
    if (!supabase || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: failure } = await supabase.auth.signInWithOAuth({
        provider,
        options: buildOAuthOptions(provider, window.location.origin),
      })
      if (failure) { setError('No se pudo abrir el proveedor. Inténtalo de nuevo.'); setBusy(false) }
    } catch { setError('No se pudo conectar con el proveedor.'); setBusy(false) }
  }

  return <AccountCard>
    <p className="lobby-subtitle">Tu cuenta, tu nombre y tu lugar en la arena.</p>
    <div className="auth-tabs" aria-label="Acceso a la cuenta">
      <button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => {
        setMode('login'); setError(''); setNotice('')
      }}>Iniciar sesión</button>
      <button type="button" aria-pressed={mode === 'register'} disabled={busy} onClick={() => {
        setMode('register'); setError(''); setNotice('')
      }}>Crear cuenta</button>
    </div>
    {error && <p className="lobby-alert" role="alert">{error}</p>}
    {notice && <p className="auth-notice" role="status">{notice}</p>}
    <form onSubmit={event => { void submit(event) }}>
      <fieldset disabled={busy} className="auth-fields">
        <div className="lobby-field"><label htmlFor="account-email">Correo electrónico</label>
          <input id="account-email" type="email" autoComplete="email" value={email}
            onChange={event => setEmail(event.target.value)} required maxLength={254} />
        </div>
        <div className="lobby-field"><label htmlFor="account-password">Contraseña</label>
          <input id="account-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password} onChange={event => setPassword(event.target.value)}
            minLength={mode === 'register' ? 8 : 1} required />
        </div>
        {mode === 'register' && <>
          <p className="auth-hint">Usa al menos 8 caracteres. Elegirás tu username después de entrar.</p>
          <div className="lobby-field"><label htmlFor="account-confirmation">Repite la contraseña</label>
            <input id="account-confirmation" type="password" autoComplete="new-password" value={confirmation}
              onChange={event => setConfirmation(event.target.value)} required minLength={8} />
          </div>
        </>}
        <button type="submit" className="lobby-submit">{busy ? 'Conectando…' : mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}</button>
      </fieldset>
    </form>
    <p className="auth-divider">O continúa con</p>
    <div className="auth-social">
      <button type="button" disabled={busy} onClick={() => { void social('google') }}>Google</button>
      {githubEnabled && <button type="button" disabled={busy} onClick={() => { void social('github') }}>GitHub</button>}
    </div>
    <p className="auth-hint">Una cuenta es necesaria para jugar. Tu username será visible en la arena.</p>
  </AccountCard>
}

export default function AuthApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [accountNotice, setAccountNotice] = useState('')
  const userId = session?.user.id

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, value) => {
      if (active) { setSession(value); setReady(true) }
    })
    void supabase.auth.getSession().then(({ error: failure }) => {
      if (active && failure) { setError('La sesión no pudo recuperarse. Vuelve a iniciar sesión.'); setReady(true) }
    }).catch(() => { if (active) { setError('No se pudo recuperar la sesión.'); setReady(true) } })
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    if (params.has('error') || hash.has('error')) {
      setError('El proveedor no completó el acceso. Puedes intentarlo de nuevo.')
      window.history.replaceState({}, '', window.location.pathname)
    }
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    setProfile(null)
    setProfileOpen(false)
    setAccountNotice('')
    if (!supabase || !userId) return
    let active = true
    const controller = new AbortController()
    setError('')
    void supabase.from('profiles').select('*').eq('id', userId)
      .abortSignal(controller.signal).single().then(({ data, error: failure }) => {
        if (!active) return
        if (failure || !data) setError('No se pudo cargar tu perfil. Reintenta; si continúa, revisa que la cuenta tenga un perfil creado.')
        else setProfile(data as Profile)
      })
    return () => { active = false; controller.abort() }
  }, [userId, retry])

  async function signOut() {
    if (!supabase) return
    setSigningOut(true) // Desmontar la arena y cerrar su conexion antes del logout.
    try {
      const { error: failure } = await supabase.auth.signOut({ scope: 'local' })
      if (failure) setError('No se pudo cerrar la sesión. Inténtalo de nuevo.')
      else { setSession(null); setProfile(null); setProfileOpen(false); setError('') }
    } catch { setError('No se pudo cerrar la sesión. Inténtalo de nuevo.') }
    finally { setSigningOut(false) }
  }

  if (!supabase) return <AccountCard><p role="alert">Falta configurar la conexión a Supabase. Consulta apps/web/.env.example.</p></AccountCard>
  if (!ready || signingOut) return <AccountCard><p role="status">{signingOut ? 'Cerrando sesión…' : 'Recuperando tu sesión…'}</p></AccountCard>
  if (!session) return <>{error && <p className="auth-global-alert" role="alert">{error}</p>}<Login /></>
  if (!profile || profile.id !== session.user.id) return <AccountCard>
    <p role={error ? 'alert' : 'status'}>{error || 'Cargando tu perfil…'}</p>
    {error && <button className="lobby-submit" onClick={() => setRetry(value => value + 1)}>Reintentar</button>}
    <button className="auth-text-button" onClick={() => { void signOut() }}>Cerrar sesión</button>
  </AccountCard>
  if (profileOpen || !validUsername(profile.username ?? '')) return <ProfileEditor
    key={`${profile.id}:${profile.updated_at}`}
    profile={profile} onboarding={!validUsername(profile.username ?? '')}
    onSaved={(saved, cleanupPending) => {
      setProfile(current => current?.id === saved.id ? saved : current)
      setProfileOpen(false)
      setAccountNotice(cleanupPending ? 'Perfil guardado. No se pudo eliminar el archivo de la foto anterior.' : '')
    }}
    onCancel={() => setProfileOpen(false)} onReload={() => setRetry(value => value + 1)}
    onSignOut={() => { void signOut() }} />
  return <>
    {error && <p className="auth-global-alert" role="alert">{error}</p>}
    <App key={session.user.id} profile={profile} onProfileSaved={saved => {
      setProfile(current => current?.id === saved.id ? saved : current)
    }} onOpenProfile={() => { setAccountNotice(''); setProfileOpen(true) }}
      accountNotice={accountNotice} onSignOut={() => { void signOut() }} />
  </>
}
