import { useEffect, useState, useCallback, useRef } from 'react'
import { Client, ErrorCode, MatchMakeError, ServerError } from '@colyseus/sdk'
import './App.css'
import { supabase, validUsername, profileError, type Profile } from './auth/supabase'
import ProfileAvatar from './auth/ProfileAvatar'
import PhaserView from './game/PhaserView'
import weaponsConfig from '../../../packages/shared/weapons.json'
import type {
  ArenaControls,
  BulletState,
  CrosshairStyle,
  MatchPhase,
  PickupState,
  PlayerSkin,
  PlayerState,
  TeamColor,
  WeaponType,
} from './game/ArenaScene'

type ArenaState = {
  phase: MatchPhase
  isPaused: boolean
  pausedByName: string
  timeRemaining: number
  killsToWin: number
  winnerId: string
  winnerName: string
  players: Map<string, PlayerState>
  bullets: Map<string, BulletState>
  pickups: Map<string, PickupState>
}

const SKIN_OPTIONS: { id: PlayerSkin; label: string }[] = [
  { id: 'fox', label: 'Zorro' },
  { id: 'squirrel', label: 'Ardilla' },
  { id: 'mouse', label: 'Ratón' },
  { id: 'rabbit', label: 'Conejo' },
]

const WEAPON_OPTIONS = Object.values(weaponsConfig.weapons) as {
  id: WeaponType
  name: string
  isMelee?: boolean
  cooldownMs: number
  damage: number
  rangePx?: number
  arcDeg?: number
  speed: number
  pellets: number
  spreadDeg: number
  bulletScale: number
  maxAmmo: number
}[]

const WEAPON_BY_ID = Object.fromEntries(WEAPON_OPTIONS.map((w) => [w.id, w])) as Record<
  WeaponType,
  (typeof WEAPON_OPTIONS)[number]
>

type MatchMeta = {
  phase: MatchPhase
  isPaused: boolean
  pausedByName: string
  timeRemaining: number
  killsToWin: number
  winnerId: string
  winnerName: string
}

function formatClock(seconds: number): string {
  const total = Math.ceil(Math.max(0, seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const client = new Client(import.meta.env.VITE_GAME_SERVER_URL || 'http://127.0.0.1:2567')

function ArenaSession({
    playerName,
    playerSkin,
    playerWeapon,
    crosshairStyle,
    onExit,
    onSignOut,
    onEnd
  }: {
    playerName: string
    playerSkin: PlayerSkin
    playerWeapon: WeaponType
    crosshairStyle: CrosshairStyle
    onExit: () => void
    onSignOut: () => void
    onEnd: (message: string) => void
  }) {
  const [players, setPlayers] = useState<PlayerState[]>([])
  const [bullets, setBullets] = useState<BulletState[]>([])
  const [pickups, setPickups] = useState<PickupState[]>([])
  const [resumeSignal, setResumeSignal] = useState(0)
  const [matchMeta, setMatchMeta] = useState<MatchMeta>({
    phase: 'waiting',
    isPaused: false,
    pausedByName: '',
    timeRemaining: 180,
    killsToWin: 10,
    winnerId: '',
    winnerName: '',
  })
  const [status, setStatus] = useState('Conectando…')
  const [controls, setControls] = useState<ArenaControls | null>(null)
  const rematchRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let active = true
    let disconnect: (() => void) | undefined

    async function connect() {
      try {
        if (!supabase) throw new Error('Supabase no está configurado')
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (!active) return
        if (sessionError || !session) {
          onEnd('Tu sesión terminó. Vuelve a iniciar sesión.'); return
        }
        const joined = await client.joinById<ArenaState>('arena-local', {
          accessToken: session.access_token,
          skin: playerSkin,
          weapon: playerWeapon,
        })
        joined.reconnection.enabled = false

        if (!active) {
          await joined.leave()
          return
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
          if (event === 'TOKEN_REFRESHED' && currentSession && joined.connection.isOpen) {
            joined.send('auth_refresh', { accessToken: currentSession.access_token })
          }
        })
        disconnect = () => { subscription.unsubscribe(); void joined.leave() }
        rematchRef.current = () => {
          if (joined.connection.isOpen) joined.send('rematch')
        }

        function syncState(state: ArenaState) {
          if (!active || !state) return
          if (state.players) {
            setPlayers(Array.from(state.players.values()))
          }
          if (state.bullets) {
            setBullets(Array.from(state.bullets.values()))
          }
          if (state.pickups) {
            setPickups(Array.from(state.pickups.values()))
          }
          setMatchMeta({
            phase: state.phase ?? 'waiting',
            isPaused: Boolean(state.isPaused),
            pausedByName: state.pausedByName ?? '',
            timeRemaining: typeof state.timeRemaining === 'number' ? state.timeRemaining : 180,
            killsToWin: typeof state.killsToWin === 'number' ? state.killsToWin : 10,
            winnerId: state.winnerId ?? '',
            winnerName: state.winnerName ?? '',
          })
        }

        joined.onStateChange(syncState)
        joined.onLeave((code) => {
          if (active) onEnd(code === 4001 ? 'Tu sesión terminó. Vuelve a entrar con una sesión válida.' : 'Se perdió la conexión. Puedes volver a entrar.')
        })
        syncState(joined.state)
        setControls({
          playerId: joined.sessionId,
          send: (input) => {
            if (joined.connection.isOpen) joined.send('input', input)
          },
          sendEmote: (emote) => {
            if (joined.connection.isOpen) joined.send('emote', emote)
          },
          sendPause: (paused) => {
            if (joined.connection.isOpen) joined.send('pause', paused)
          },
        })
        setStatus('Conectado')
      } catch (error) {
        if (!active) return

        if (
          error instanceof MatchMakeError &&
          error.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID &&
          error.message.endsWith(' is locked')
        ) {
          onEnd('La sala está llena. Inténtalo cuando haya una plaza.')
          return
        }

        if ((error instanceof ServerError || error instanceof MatchMakeError) && error.code === ErrorCode.AUTH_FAILED) {
          onEnd(error.message || 'No se pudo verificar tu cuenta. Revisa tu sesión y username.')
          return
        }

        onEnd('No se pudo conectar a la arena. Comprueba que el servidor esté iniciado.')
      }
    }

    queueMicrotask(() => {
      if (active) void connect()
    })

    return () => {
      active = false
      rematchRef.current = null
      disconnect?.()
    }
  }, [playerName, playerSkin, playerWeapon, onEnd])

  useEffect(() => {
    if (matchMeta.phase === 'finished' && matchMeta.winnerId && matchMeta.winnerId !== controls?.playerId) {
      const audio = new Audio('/assets/sounds/lose-a.ogg')
      audio.volume = 0.55
      audio.play().catch(() => {})
    }
  }, [matchMeta.phase, matchMeta.winnerId, controls?.playerId])

  const sortedPlayers = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
  const scoreLine = players.map((p) => `${p.name}: ${p.kills}`).join(' vs ')
  const localPlayer = players.find((p) => p.id === controls?.playerId)
  const localWeaponSpec = localPlayer ? WEAPON_BY_ID[localPlayer.weaponType] : undefined
  const localTeamColor: TeamColor =
    localPlayer?.teamColor === 'blue' ||
    localPlayer?.skin === 'mouse' ||
    localPlayer?.skin === 'rabbit'
      ? 'blue'
      : 'orange'
  const localAmmo = localPlayer?.ammo ?? 0
  const localMaxAmmo = localPlayer?.maxAmmo ?? localWeaponSpec?.maxAmmo ?? 0
  const isLocalFirearm = Boolean(localWeaponSpec && !localWeaponSpec.isMelee && localMaxAmmo > 0)
  const isLowAmmo = isLocalFirearm && localAmmo <= Math.ceil(localMaxAmmo * 0.25)
  const ammoIconSrc =
    localPlayer?.weaponType === 'shotgun' ? '/assets/ui/icon-shell.png' : '/assets/ui/icon-bullet.png'
  const finishReason =
    matchMeta.timeRemaining <= 0
      ? 'Tiempo agotado'
      : `Meta de ${matchMeta.killsToWin} bajas alcanzada`

  return (
    <div className="arena-shell">
      <header className="arena-header">
        <strong style={{ fontSize: '1.05rem', color: '#ffffff', letterSpacing: '1px' }}>
          TAP-WAR
        </strong>
        <div className="arena-scoreboard" role="status">
          <span className="arena-clock">{formatClock(matchMeta.timeRemaining)}</span>
          {players.length > 0 && (
            <span>
              {scoreLine} | Meta: {matchMeta.killsToWin}
            </span>
          )}
          <span>{controls ? status : `${status}`}</span>
        </div>
        <div className="arena-header-actions">
          <span style={{ fontSize: '0.78rem', opacity: 0.85 }}>[ESC] Pausa</span>
          <button type="button" onClick={onExit} className="kenney-btn-secondary">
            Salir de la arena
          </button>
          <button type="button" onClick={onSignOut} className="kenney-btn-secondary">Cerrar sesión</button>
        </div>
      </header>

      <div className="arena-stage">
        {controls && matchMeta.phase === 'waiting' && (
          <div className="arena-waiting-banner" role="status">
            Esperando al segundo jugador para iniciar la partida...
          </div>
        )}

        <div className="arena-canvas-wrap">
          {controls && localWeaponSpec && localPlayer && (
            <div className={`arena-ammo-badge${isLowAmmo ? ' is-low' : ''}`} role="status">
              {isLocalFirearm ? (
                <>
                  <span className="arena-ammo-icons" aria-hidden="true">
                    <img src={ammoIconSrc} alt="" className="arena-ammo-icon" />
                    <img src={ammoIconSrc} alt="" className="arena-ammo-icon" />
                    <img src={ammoIconSrc} alt="" className="arena-ammo-icon" />
                  </span>
                  <span>
                    {localAmmo} / {localMaxAmmo}
                  </span>
                </>
              ) : (
                <>
                  <img
                    src={`/assets/weapons/weapon-${localPlayer.weaponType}-${localTeamColor}.png`}
                    alt={localWeaponSpec.name}
                    className="arena-melee-icon"
                  />
                  <span>{localWeaponSpec.name} · Melé</span>
                </>
              )}
            </div>
          )}

          {controls && (
            <PhaserView
              players={players}
              bullets={bullets}
              pickups={pickups}
              phase={matchMeta.phase}
              isPaused={matchMeta.isPaused}
              crosshairStyle={crosshairStyle}
              resumeSignal={resumeSignal}
              controls={controls}
            />
          )}
        </div>

        {matchMeta.isPaused && matchMeta.phase !== 'finished' && (
          <div className="arena-results-overlay" role="dialog" aria-modal="true" aria-label="Pausa">
            <div className="arena-pause-modal">
              <h2 className="arena-pause-title">PAUSA</h2>
              <p className="arena-pause-hint">
                {matchMeta.pausedByName
                  ? `Partida pausada por ${matchMeta.pausedByName}.`
                  : 'Partida en pausa.'}
              </p>
              <div className="arena-pause-actions">
                <button
                  type="button"
                  className="kenney-btn-primary"
                  onClick={() => setResumeSignal((n) => n + 1)}
                >
                  Continuar
                </button>
                <button
                  type="button"
                  className="kenney-btn-secondary"
                  onClick={onExit}
                >
                  Salir de la arena
                </button>
              </div>
            </div>
          </div>
        )}

        {matchMeta.phase === 'finished' && (
          <div className="arena-results-overlay" role="dialog" aria-modal="true">
            <div className="arena-results-modal">
              <h2>
                {matchMeta.winnerName ? `Ganador: ${matchMeta.winnerName}` : 'Empate'}
              </h2>
              <p className="arena-results-subtitle">{finishReason}</p>

              <table className="arena-results-table">
                <thead>
                  <tr>
                    <th>Jugador</th>
                    <th>Eliminaciones</th>
                    <th>Muertes</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player) => (
                    <tr key={player.id}>
                      <td>{player.name}</td>
                      <td>{player.kills}</td>
                      <td>{player.deaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="arena-results-actions">
                <button
                  type="button"
                  className="arena-btn-primary"
                  onClick={() => rematchRef.current?.()}
                >
                  Jugar revancha
                </button>
                <button
                  type="button"
                  className="arena-btn-secondary"
                  onClick={onExit}
                >
                  Salir de la arena
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App({ profile, onProfileSaved, onOpenProfile, onSignOut, accountNotice }: {
  profile: Profile
  onProfileSaved: (profile: Profile) => void
  onOpenProfile: () => void
  accountNotice?: string
  onSignOut: () => void
}) {
  const [skin, setSkin] = useState<PlayerSkin>(profile.preferred_skin)
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponType>(profile.preferred_weapon)
  const [crosshairStyle, setCrosshairStyle] = useState<CrosshairStyle>(profile.crosshair_style)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const [playerName, setPlayerName] = useState<string | null>(null)

  const [entryMessage, setEntryMessage] = useState('')

  const returnToForm = useCallback((message: string) => {
    setEntryMessage(message)
    setPlayerName(null)
  }, [])

  async function saveProfile(enterArena: boolean) {
    if (!supabase || saving) return
    setEntryMessage(''); setSavedMessage('')
    if (!validUsername(profile.username ?? '')) {
      setEntryMessage('Usa de 3 a 20 letras sin acentos, números o guion bajo.'); return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('profiles').update({
        preferred_skin: skin, preferred_weapon: selectedWeapon,
        crosshair_style: crosshairStyle,
      }).eq('id', profile.id).select('*').single()
      if (error || !data) { setEntryMessage(profileError(error ?? {})); return }
      onProfileSaved(data as Profile)
      setSavedMessage('Perfil guardado.')
      if (enterArena) setPlayerName(data.username)
    } catch { setEntryMessage('No se pudo guardar el perfil. Comprueba tu conexión.') }
    finally { setSaving(false) }
  }

  if (playerName !== null) {
    return (
      <ArenaSession
        playerName={playerName}
        playerSkin={skin}
        playerWeapon={selectedWeapon}
        crosshairStyle={crosshairStyle}
        onExit={() => returnToForm('')}
        onSignOut={onSignOut}
        onEnd={returnToForm}
      />
    )
  }

  const currentTeamColor: TeamColor = weaponsConfig.skinTeams.blue.includes(skin)
    ? 'blue'
    : 'orange'

  return (
    <main className="lobby-page">
      <div className="lobby-card">
        <h1 className="lobby-title">TAP-WAR</h1>
        <div className="account-heading">
          <div className="account-details">
            <ProfileAvatar profile={profile} />
            <p><strong>{profile.username}</strong><br />Listo para la arena</p>
          </div>
          <button type="button" className="auth-text-button" onClick={onOpenProfile}>Mi perfil</button>
          <button type="button" className="auth-text-button" onClick={onSignOut}>Cerrar sesión</button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void saveProfile(false)
          }}
        >
          {entryMessage && (
            <p className="lobby-alert" role="alert">
              {entryMessage}
            </p>
          )}

          {accountNotice && <p className="auth-notice" role="status">{accountNotice}</p>}
          {savedMessage && <p className="auth-notice" role="status">{savedMessage}</p>}
          <fieldset className="auth-fields" disabled={saving}>
          <span className="skin-grid-label">Elige tu personaje</span>
          <div className="skin-grid" role="radiogroup" aria-label="Selector de personaje">
            {SKIN_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={skin === option.id}
                className={`skin-option${skin === option.id ? ' is-selected' : ''}`}
                onClick={() => setSkin(option.id)}
              >
                <img src={`/assets/characters/player-${option.id}-idle.png`} alt={option.label} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          <span className="skin-grid-label">Elige tu arma inicial</span>
          <div className="weapon-grid" role="radiogroup" aria-label="Selector de arma">
            {WEAPON_OPTIONS.map((weapon) => (
              <button
                key={weapon.id}
                type="button"
                role="radio"
                aria-checked={selectedWeapon === weapon.id}
                className={`weapon-option${selectedWeapon === weapon.id ? ' is-selected' : ''}`}
                onClick={() => setSelectedWeapon(weapon.id)}
              >
                <img
                  src={`/assets/weapons/weapon-${weapon.id}-${currentTeamColor}.png`}
                  alt={weapon.name}
                />
                <span>{weapon.name}</span>
                <span className="weapon-stats">
                  {weapon.isMelee
                    ? `${weapon.damage} dmg · ${weapon.rangePx ?? 60}px · Melé`
                    : `${weapon.pellets > 1 ? `${weapon.damage}×${weapon.pellets}` : weapon.damage} dmg · ${weapon.maxAmmo} balas`}
                </span>
              </button>
            ))}
          </div>

          <span className="skin-grid-label">Estilo de mira</span>
          <div className="crosshair-grid" role="radiogroup" aria-label="Estilo de mira">
            <button
              type="button"
              role="radio"
              aria-checked={crosshairStyle === 'outline'}
              className={`crosshair-option${crosshairStyle === 'outline' ? ' is-selected' : ''}`}
              onClick={() => setCrosshairStyle('outline')}
            >
              <img
                src={`/assets/ui/crosshair-${selectedWeapon === 'knife' || selectedWeapon === 'axe' ? 'rifle' : selectedWeapon}-orange.png`}
                alt="Con contorno"
              />
              <span>Con contorno</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={crosshairStyle === 'plain'}
              className={`crosshair-option${crosshairStyle === 'plain' ? ' is-selected' : ''}`}
              onClick={() => setCrosshairStyle('plain')}
            >
              <img
                src={`/assets/ui/crosshair-${selectedWeapon === 'knife' || selectedWeapon === 'axe' ? 'rifle' : selectedWeapon}-blue.png`}
                alt="Sin contorno"
              />
              <span>Sin contorno</span>
            </button>
          </div>

          <div className="profile-actions">
            <button type="submit" disabled={!validUsername(profile.username ?? '') || saving}>{saving ? 'Guardando…' : 'Guardar preferencias'}</button>
            <button type="button" className="lobby-submit" disabled={!validUsername(profile.username ?? '') || saving}
              onClick={() => { void saveProfile(true) }}>Entrar a la arena</button>
          </div>
          </fieldset>
        </form>
      </div>
    </main>
  )
}
