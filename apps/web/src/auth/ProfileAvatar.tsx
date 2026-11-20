import { useEffect, useState } from 'react'
import { supabase, type Profile } from './supabase'

export default function ProfileAvatar({ profile, preview }: { profile: Profile; preview?: string | null }) {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null)
  const path = profile.avatar_path
  useEffect(() => {
    if (!path || !supabase || preview !== undefined) return
    let active = true
    const client = supabase
    async function load() {
      try {
        const { data, error } = await client.storage.from('avatars').createSignedUrl(path!, 3600)
        if (active) setSigned(data && !error ? { path: path!, url: data.signedUrl } : null)
      } catch { if (active) setSigned(null) }
    }
    void load()
    const timer = setInterval(() => { void load() }, 50 * 60 * 1000)
    return () => { active = false; clearInterval(timer) }
  }, [path, preview])
  const photo = preview !== undefined ? preview : signed && signed.path === path ? signed.url : null
  const fallback = `/assets/characters/player-${profile.preferred_skin}-idle.png`
  return <img className={`profile-avatar${photo ? '' : ' is-pixel'}`} src={photo || fallback}
    alt={photo ? 'Tu foto de perfil' : 'Perfil sin foto personalizada'}
    onError={event => {
      if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback
    }} />
}
