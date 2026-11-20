import { useEffect, useRef, useState } from 'react'
import { supabase, validUsername, type Profile } from './supabase'
import { AccountSaveError, prepareAvatar, saveAccountProfile, type ProfileGateway } from './account'
import ProfileAvatar from './ProfileAvatar'

export default function ProfileEditor({ profile, onboarding, onSaved, onCancel, onReload, onSignOut }: {
  profile: Profile
  onboarding: boolean
  onSaved: (profile: Profile, cleanupPending: boolean) => void
  onCancel: () => void
  onReload: () => void
  onSignOut: () => void
}) {
  const [username, setUsername] = useState(profile.username ?? '')
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined)
  const [preview, setPreview] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [needsReload, setNeedsReload] = useState(false)
  const objectUrl = useRef<string | null>(null)
  const alive = useRef(true)
  const photoInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

  async function selectPhoto(file?: File) {
    if (!file) return
    setProcessing(true); setError('')
    try {
      const prepared = await prepareAvatar(file)
      if (!alive.current) return
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = URL.createObjectURL(prepared)
      setPreview(objectUrl.current); setPhoto(prepared)
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'No se pudo leer la imagen.')
    } finally {
      if (alive.current) setProcessing(false)
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  function removePhoto() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = null
    setPhoto(profile.avatar_path ? null : undefined)
    setPreview(profile.avatar_path ? null : undefined)
    setError('')
  }

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy || processing || needsReload) return
    setBusy(true); setError('')
    const client = supabase
    const gateway: ProfileGateway = {
      upload: async (path, blob) => {
        const { error: failure } = await client.storage.from('avatars').upload(path, blob,
          { contentType: 'image/webp', cacheControl: '3600', upsert: false })
        return { error: failure }
      },
      update: async (id, updatedAt, fields) => {
        const { data, error: failure } = await client.from('profiles').update(fields)
          .eq('id', id).eq('updated_at', updatedAt).select('*').maybeSingle()
        return { data: data as Profile | null, error: failure }
      },
      remove: async path => {
        const { error: failure } = await client.storage.from('avatars').remove([path])
        return { error: failure }
      },
    }
    try {
      const result = await saveAccountProfile(gateway, profile, username, photo)
      if (alive.current) onSaved(result.profile, result.cleanupPending)
    } catch (failure) {
      if (!alive.current) return
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar el perfil.')
      setNeedsReload(failure instanceof AccountSaveError ? failure.reloadProfile : true)
    } finally { if (alive.current) setBusy(false) }
  }

  return <main className="lobby-page auth-page">
    <section className="lobby-card profile-card" aria-labelledby="profile-title">
      <p className="auth-eyebrow">TAP-WAR · TU CUENTA</p>
      <h1 id="profile-title" className="lobby-title">{onboarding ? 'Elige tu identidad' : 'Mi perfil'}</h1>
      <p className="lobby-subtitle">{onboarding ? 'Un nombre propio antes de tu primera partida.' : 'Tu nombre y tu foto, a tu manera.'}</p>
      {error && <p className="lobby-alert" role="alert">{error}</p>}
      {needsReload && <button type="button" className="auth-text-button" onClick={onReload}>Actualizar perfil</button>}
      <form onSubmit={event => { void save(event) }}>
        <fieldset className="auth-fields" disabled={busy || processing || needsReload}>
          <ProfileAvatar profile={profile} preview={preview} />
          <div className="profile-photo-actions">
            <label htmlFor="profile-photo" className="auth-file-label">{processing ? 'Preparando imagen…' : 'Elegir foto'}</label>
            <input ref={photoInput} id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp"
              aria-describedby="photo-help" onChange={event => { void selectPhoto(event.target.files?.[0]) }} />
            {(profile.avatar_path || photo instanceof Blob) && preview !== null &&
              <button type="button" className="auth-text-button" onClick={removePhoto}>Quitar foto</button>}
          </div>
          <p id="photo-help" className="auth-hint">Opcional. JPG, PNG o WebP, máximo 2 MB. Se recorta al centro en formato cuadrado.</p>
          <div className="lobby-field">
            <label htmlFor="profile-username">Username</label>
            <input id="profile-username" autoComplete="nickname" value={username}
              onChange={event => setUsername(event.target.value)} minLength={3} maxLength={20}
              pattern="[A-Za-z0-9_]{3,20}" aria-describedby="profile-username-help" required />
          </div>
          <p id="profile-username-help" className="auth-hint">De 3 a 20 letras sin acentos, números o guion bajo. Será tu nombre en la arena y puedes cambiarlo después.</p>
          <button type="submit" className="lobby-submit" disabled={!validUsername(username)}>
            {busy ? 'Guardando…' : onboarding ? 'Continuar al lobby' : 'Guardar y volver'}
          </button>
        </fieldset>
      </form>
      <div className="profile-actions">
        {!onboarding && <button type="button" disabled={busy || processing} onClick={onCancel}>Cancelar</button>}
        <button type="button" onClick={onSignOut}>Cerrar sesión</button>
      </div>
    </section>
  </main>
}
