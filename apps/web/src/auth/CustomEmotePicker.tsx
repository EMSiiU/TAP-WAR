import { useEffect, useRef, useState } from 'react'
import { supabase, type Profile } from './supabase'
import {
  prepareCustomEmote,
  saveCustomEmote,
  type CustomEmoteGateway,
} from './customEmote'

export default function CustomEmotePicker({
  profile,
  onProfileSaved,
  disabled = false,
}: {
  profile: Profile
  onProfileSaved: (profile: Profile) => void
  disabled?: boolean
}) {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const objectUrlRef = useRef<string | null>(null)
  const aliveRef = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const path = profile.custom_emote_path ?? null

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!path || !supabase) return
    let active = true
    const client = supabase
    async function loadSigned() {
      try {
        const { data, error: urlError } = await client.storage
          .from('emotes')
          .createSignedUrl(path!, 3600)
        if (active && aliveRef.current) {
          setSigned(data && !urlError ? { path: path!, url: data.signedUrl } : null)
        }
      } catch {
        if (active && aliveRef.current) setSigned(null)
      }
    }
    void loadSigned()
    const timer = window.setInterval(() => {
      void loadSigned()
    }, 50 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [path])

  function createGateway(): CustomEmoteGateway {
    const client = supabase!
    return {
      upload: async (objectPath, blob) => {
        const { error: uploadError } = await client.storage.from('emotes').upload(objectPath, blob, {
          contentType: 'image/webp',
          cacheControl: '3600',
          upsert: false,
        })
        return { error: uploadError }
      },
      update: async (id, updatedAt, fields) => {
        const { data, error: updateError } = await client
          .from('profiles')
          .update(fields)
          .eq('id', id)
          .eq('updated_at', updatedAt)
          .select('*')
          .maybeSingle()
        return { data: data as Profile | null, error: updateError }
      },
      remove: async (objectPath) => {
        const { error: removeError } = await client.storage.from('emotes').remove([objectPath])
        return { error: removeError }
      },
    }
  }

  async function selectFile(file?: File) {
    if (!file || !supabase || busy || disabled) return
    setBusy(true)
    setError('')
    try {
      const prepared = await prepareCustomEmote(file)
      const result = await saveCustomEmote(createGateway(), profile, prepared)
      if (!aliveRef.current) return
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = URL.createObjectURL(prepared)
      setPreviewUrl(objectUrlRef.current)
      onProfileSaved(result.profile)
    } catch (failure) {
      if (aliveRef.current) {
        setError(failure instanceof Error ? failure.message : 'No se pudo guardar el emote.')
      }
    } finally {
      if (aliveRef.current) setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removeEmote() {
    if (!supabase || busy || disabled || !path) return
    setBusy(true)
    setError('')
    try {
      const result = await saveCustomEmote(createGateway(), profile, null)
      if (!aliveRef.current) return
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      setPreviewUrl(null)
      setSigned(null)
      onProfileSaved(result.profile)
    } catch (failure) {
      if (aliveRef.current) {
        setError(failure instanceof Error ? failure.message : 'No se pudo quitar el emote.')
      }
    } finally {
      if (aliveRef.current) setBusy(false)
    }
  }

  const displaySrc = path ? (signed && signed.path === path ? signed.url : previewUrl) : null

  return (
    <div className="custom-emote-block">
      <span className="skin-grid-label">Emotes en partida (espacio 3 personalizado)</span>
      <div className="custom-emote-row">
        <div className="custom-emote-slot" title="Emote 1: Risa">
          <img src="/assets/ui/emote-laugh.svg" alt="Risa" className="custom-emote-thumb" />
          <span>1 · Risa</span>
        </div>
        <div className="custom-emote-slot" title="Emote 2: Corazón">
          <img src="/assets/ui/emote-heart.svg" alt="Corazón" className="custom-emote-thumb" />
          <span>2 · Corazón</span>
        </div>
        <div className={`custom-emote-slot is-custom${displaySrc ? ' is-filled' : ''}`}>
          {displaySrc ? (
            <img src={displaySrc} alt="Tu emote personalizado" className="custom-emote-thumb" />
          ) : (
            <span className="custom-emote-empty" aria-hidden="true">+</span>
          )}
          <div className="custom-emote-meta">
            <span>3 · Tuyo</span>
            <div className="custom-emote-actions">
              <label
                htmlFor="custom-emote-input"
                className={`auth-file-label custom-emote-upload${busy || disabled ? ' is-disabled' : ''}`}
              >
                {busy ? 'Subiendo…' : displaySrc ? 'Cambiar' : 'Subir'}
              </label>
              <input
                ref={inputRef}
                id="custom-emote-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="custom-emote-file-input"
                disabled={busy || disabled}
                onChange={(event) => {
                  void selectFile(event.target.files?.[0])
                }}
              />
              {path && (
                <button
                  type="button"
                  className="auth-text-button custom-emote-remove"
                  disabled={busy || disabled}
                  onClick={() => {
                    void removeEmote()
                  }}
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {error && (
        <p className="lobby-alert" role="alert" style={{ marginTop: 8, marginBottom: 0 }}>
          {error}
        </p>
      )}
    </div>
  )
}
