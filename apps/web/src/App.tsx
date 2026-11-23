import Rankings from './rankings/Rankings'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Client, ErrorCode, MatchMakeError, ServerError } from '@colyseus/sdk'
import './App.css'
import { supabase, validUsername, profileError, type Profile } from './auth/supabase'
import ProfileAvatar from './auth/ProfileAvatar'
import PhaserView from './game/PhaserView'
import TouchControls, { type TouchInputState } from './game/TouchControls'
import {
  MAP_LABEL_BY_SIZE,
  MAP_OPTIONS,
  normalizeRoomCode,
  type MapSize,
  type PublicRoomSummary,
  type RoomCapacity,
  type RoomJoinRequest,
} from './game/arenaMaps'
import { resolveGameServerUrl, toApiUrl, toHealthCheckUrl } from './game/serverUrl'
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
  roomCode: string
  roomName: string
  mapSize: MapSize
  maxPlayers: number
  isPrivate: boolean
  hostId: string
  notice: string
  saveStatus: string
  resultSummary: string
  finishReason: string
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
  roomCode: string
  roomName: string
  mapSize: MapSize
  maxPlayers: number
  isPrivate: boolean
  hostId: string
  notice: string
  saveStatus: string
  resultSummary: string
  finishReason: string
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

function detectDefaultTouchMode(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0)
}

const GAME_SERVER_URL = resolveGameServerUrl(
  import.meta.env.VITE_GAME_SERVER_URL,
  import.meta.env.DEV,
  typeof window !== 'undefined' ? window.location.origin : undefined,
)

const client = new Client(GAME_SERVER_URL)

function ArenaSession({
  playerName,
  playerSkin,
  playerWeapon,
  crosshairStyle,
  roomRequest,
  onExit,
  onSignOut,
  onEnd,
}: {
  playerName: string
  playerSkin: PlayerSkin
  playerWeapon: WeaponType
  crosshairStyle: CrosshairStyle
  roomRequest: RoomJoinRequest
  onExit: () => void
  onSignOut: () => void
  onEnd: (message: string) => void
}) {
  const [players, setPlayers] = useState<PlayerState[]>([])
  const [bullets, setBullets] = useState<BulletState[]>([])
  const [pickups, setPickups] = useState<PickupState[]>([])
  const [localPaused, setLocalPaused] = useState(false)
  const [touchMode, setTouchMode] = useState<boolean>(() => detectDefaultTouchMode())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [gamepadConnected, setGamepadConnected] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const touchInputRef = useRef<TouchInputState>({
    moveX: 0,
    moveY: 0,
    aimActive: false,
    aimAngle: 0,
    aimMagnitude: 0,
    shoot: false,
  })
  const startRef = useRef<(() => void) | null>(null)
  const [resumeSignal, setResumeSignal] = useState(0)
  const [matchMeta, setMatchMeta] = useState<MatchMeta>({
    roomCode: roomRequest.mode === 'join' ? roomRequest.code : '',
    roomName: roomRequest.mode === 'create' ? roomRequest.roomName : '',
    mapSize:
      roomRequest.mode === 'create'
        ? roomRequest.maxPlayers === 20
          ? 'large'
          : roomRequest.maxPlayers === 10
            ? 'medium'
            : 'small'
        : 'small',
    maxPlayers: roomRequest.mode === 'create' ? roomRequest.maxPlayers : 4,
    isPrivate: roomRequest.mode === 'create' ? roomRequest.isPrivate : false,
    hostId: '',
    notice: '',
    saveStatus: '',
    resultSummary: '',
    finishReason: '',
    phase: 'waiting',
    isPaused: false,
    pausedByName: '',
    timeRemaining: 300,
    killsToWin: 20,
    winnerId: '',
    winnerName: '',
  })
  const [status, setStatus] = useState('Conectando…')
  const [controls, setControls] = useState<ArenaControls | null>(null)
  const rematchRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    if (controls !== null) return
    const timer = window.setTimeout(() => {
      setStatus('Conectando… (si el servidor estaba en reposo puede tardar hasta 1 min)')
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [controls])

  useEffect(() => {
    let active = true
    let disconnect: (() => void) | undefined

    async function connect() {
      try {
        if (!supabase) throw new Error('Supabase no está configurado')
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()
        if (!active) return
        if (sessionError || !session) {
          onEnd('Tu sesión terminó. Vuelve a iniciar sesión.')
          return
        }

        const joined =
          roomRequest.mode === 'create'
            ? await client.create<ArenaState>('arena', {
                accessToken: session.access_token,
                skin: playerSkin,
                weapon: playerWeapon,
                maxPlayers: roomRequest.maxPlayers,
                isPrivate: roomRequest.isPrivate,
                roomName: roomRequest.roomName,
              })
            : await client.joinById<ArenaState>(roomRequest.code, {
                accessToken: session.access_token,
                skin: playerSkin,
                weapon: playerWeapon,
              })

        joined.reconnection.enabled = false

        if (!active) {
          await joined.leave()
          return
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, currentSession) => {
          if (event === 'TOKEN_REFRESHED' && currentSession && joined.connection.isOpen) {
            joined.send('auth_refresh', { accessToken: currentSession.access_token })
          }
        })
        disconnect = () => {
          subscription.unsubscribe()
          void joined.leave()
        }
        startRef.current = () => {
          if (joined.connection.isOpen) joined.send('start')
        }
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
            roomCode: state.roomCode || joined.roomId || '',
            roomName: state.roomName ?? '',
            mapSize:
              state.mapSize === 'medium' || state.mapSize === 'large' ? state.mapSize : 'small',
            maxPlayers: typeof state.maxPlayers === 'number' ? state.maxPlayers : 4,
            isPrivate: Boolean(state.isPrivate),
            hostId: state.hostId ?? '',
            notice: state.notice ?? '',
            saveStatus: state.saveStatus ?? '',
            resultSummary: state.resultSummary ?? '',
            finishReason: state.finishReason ?? '',
            phase: state.phase ?? 'waiting',
            isPaused: Boolean(state.isPaused),
            pausedByName: state.pausedByName ?? '',
            timeRemaining: typeof state.timeRemaining === 'number' ? state.timeRemaining : 300,
            killsToWin: typeof state.killsToWin === 'number' ? state.killsToWin : 20,
            winnerId: state.winnerId ?? '',
            winnerName: state.winnerName ?? '',
          })
        }

        joined.onStateChange(syncState)
        joined.onLeave((code) => {
          if (active) {
            onEnd(
              code === 4001
                ? 'Tu sesión terminó. Vuelve a entrar con una sesión válida.'
                : 'Se perdió la conexión. Puedes volver a entrar.',
            )
          }
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
            setLocalPaused(paused)
          },
        })
        setStatus('Conectado')
      } catch (error) {
        if (!active) return

        if (error instanceof MatchMakeError && error.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID) {
          onEnd(
            error.message.endsWith(' is locked')
              ? 'La sala está llena o la partida ya inició.'
              : 'No se encontró ninguna sala con ese código.',
          )
          return
        }

        if (
          (error instanceof ServerError || error instanceof MatchMakeError) &&
          error.code === ErrorCode.AUTH_FAILED
        ) {
          onEnd(error.message || 'No se pudo verificar tu cuenta. Revisa tu sesión y username.')
          return
        }

        if (error instanceof ServerError) {
          onEnd(error.message || 'No se pudo entrar a la sala.')
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
  }, [playerName, playerSkin, playerWeapon, roomRequest, onEnd])

  useEffect(() => {
    if (
      matchMeta.phase === 'finished' &&
      matchMeta.winnerId &&
      matchMeta.winnerId !== controls?.playerId
    ) {
      const audio = new Audio('/assets/sounds/lose-a.ogg')
      audio.volume = 0.55
      audio.play().catch(() => {})
    }
  }, [matchMeta.phase, matchMeta.winnerId, controls?.playerId])

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        const el = shellRef.current as
          | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> })
          | null
        if (el?.requestFullscreen) {
          await el.requestFullscreen()
        } else if (el?.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen()
        }
        await (
          screen.orientation as unknown as { lock?: (mode: string) => Promise<void> }
        )?.lock?.('landscape')?.catch(() => {})
      } else {
        await document.exitFullscreen?.()
      }
    } catch {
      // Algunos navegadores móviles (p. ej. iOS Safari) restringen Fullscreen API.
    }
  }

  async function copyRoomCode() {
    if (!matchMeta.roomCode) return
    try {
      await navigator.clipboard.writeText(matchMeta.roomCode)
      setCopiedCode(true)
      window.setTimeout(() => setCopiedCode(false), 1800)
    } catch {
      // Sin permiso de portapapeles.
    }
  }

  const finalPlayers: {
    sessionId: string
    name: string
    kills: number
    deaths: number
    abandoned: boolean
    outcome: string
    points: number
  }[] = matchMeta.resultSummary ? JSON.parse(matchMeta.resultSummary) : []
  const sortedPlayers = [...finalPlayers].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
  const localPlayer = players.find((p) => p.id === controls?.playerId)
  const liveLeaders = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).slice(0, 3)
  const scoreLine =
    players.length <= 4
      ? players.map((p) => `${p.name}: ${p.kills}`).join(' vs ')
      : `Top: ${liveLeaders.map((p) => `${p.name} ${p.kills}`).join(' · ')} | Tú: ${localPlayer?.kills ?? 0}`

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
    (
      {
        time: 'Tiempo agotado',
        kills: 'Meta de 20 kills alcanzada',
        abandon: 'Victoria por abandono',
        interrupted: 'Partida interrumpida',
      } as Record<string, string>
    )[matchMeta.finishReason] || ''
  const saveMessage = (
    {
      saving: 'Guardando resultado…',
      saved: 'Resultado guardado. Ya cuenta para el ranking.',
      pending: 'Guardado pendiente. El servidor reintentará automáticamente.',
      failed:
        'No se pudo guardar el archivo de resultados. Revisa el disco del servidor; la revancha está bloqueada.',
    } as Record<string, string>
  )[matchMeta.saveStatus]

  return (
    <div ref={shellRef} className="arena-shell">
      <header className="arena-header">
        <div className="arena-room-meta">
          <strong style={{ fontSize: '1.05rem', color: '#ffffff', letterSpacing: '1px' }}>
            TAP-WAR
          </strong>
          {matchMeta.roomCode && (
            <span className="arena-pill-badge">
              {matchMeta.isPrivate ? 'Privada' : 'Pública'} · {matchMeta.roomCode}
            </span>
          )}
          <span className="arena-pill-badge">
            {MAP_LABEL_BY_SIZE[matchMeta.mapSize]} · {players.length}/{matchMeta.maxPlayers}
          </span>
          {matchMeta.roomCode && (
            <button type="button" onClick={() => void copyRoomCode()} className="arena-mini-btn">
              {copiedCode ? 'Copiado' : 'Copiar código'}
            </button>
          )}
        </div>

        <div className="arena-scoreboard" role="status">
          <span className="arena-clock">{formatClock(matchMeta.timeRemaining)}</span>
          {players.length > 0 && (
            <span>
              {scoreLine} | Meta: {matchMeta.killsToWin}
            </span>
          )}
          <span>{controls ? status : `${status}`}</span>
          {gamepadConnected && <span className="arena-pill-badge is-active">Mando conectado</span>}
        </div>

        <div className="arena-header-actions">
          <button
            type="button"
            onClick={() => setTouchMode((v) => !v)}
            className="kenney-btn-secondary"
          >
            {touchMode ? 'Táctil: ON' : 'Táctil: OFF'}
          </button>
          <button
            type="button"
            onClick={() => {
              void toggleFullscreen()
            }}
            className="kenney-btn-secondary"
          >
            {isFullscreen ? 'Salir pantalla' : 'Pantalla completa'}
          </button>
          <button type="button" onClick={onExit} className="kenney-btn-secondary">
            Salir de la arena
          </button>
          <button type="button" onClick={onSignOut} className="kenney-btn-secondary">
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="arena-stage">
        {controls && matchMeta.phase === 'waiting' && (
          <div className="arena-waiting-banner" role="status">
            <span>
              Sala <strong>{matchMeta.roomName || matchMeta.roomCode}</strong> · Código:{' '}
              <strong>{matchMeta.roomCode}</strong> ({players.length}/{matchMeta.maxPlayers}) ·{' '}
              {players.length < 2
                ? 'Se necesitan al menos dos jugadores.'
                : 'Esperando al anfitrión para iniciar.'}
            </span>
            {controls.playerId === matchMeta.hostId && (
              <button
                type="button"
                className="arena-mini-btn is-primary"
                disabled={players.length < 2}
                onClick={() => startRef.current?.()}
              >
                Iniciar partida
              </button>
            )}
            {matchMeta.notice && <p role="alert">{matchMeta.notice}</p>}
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
              isPaused={localPaused}
              crosshairStyle={crosshairStyle}
              mapSize={matchMeta.mapSize}
              touchMode={touchMode}
              touchInputRef={touchInputRef}
              onMenuToggle={() => setLocalPaused((prev) => !prev)}
              onGamepadChange={setGamepadConnected}
              resumeSignal={resumeSignal}
              controls={controls}
            />
          )}

          {controls && touchMode && !localPaused && matchMeta.phase !== 'finished' && (
            <TouchControls
              onTouchInput={(next) => {
                touchInputRef.current = next
              }}
              onEmote={(emote) => controls.sendEmote?.(emote)}
              onMenu={() => setLocalPaused(true)}
            />
          )}
        </div>

        {localPaused && matchMeta.phase !== 'finished' && (
          <div className="arena-results-overlay" role="dialog" aria-modal="true" aria-label="Menú personal">
            <div className="arena-pause-modal">
              <h2 className="arena-pause-title">MENÚ</h2>
              <p className="arena-pause-hint">
                La partida continúa mientras este menú está abierto.
              </p>
              <div className="arena-pause-actions">
                <button
                  type="button"
                  className="kenney-btn-primary"
                  onClick={() => {
                    setLocalPaused(false)
                    setResumeSignal((n) => n + 1)
                  }}
                >
                  Continuar
                </button>
                <button type="button" className="kenney-btn-secondary" onClick={onExit}>
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
                {finalPlayers.filter((p) => p.outcome === 'draw').length > 1
                  ? `Empate: ${matchMeta.winnerName}`
                  : matchMeta.winnerName
                    ? `Ganador: ${matchMeta.winnerName}`
                    : 'Partida interrumpida'}
              </h2>
              <p className="arena-results-subtitle">{finishReason}</p>
              <p role="status">{saveMessage}</p>

              <div className="arena-results-scroll">
                <table className="arena-results-table">
                  <thead>
                    <tr>
                      <th>Jugador</th>
                      <th>Eliminaciones</th>
                      <th>Muertes</th>
                      <th>Resultado</th>
                      <th>Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayers.map((player) => (
                      <tr key={player.sessionId}>
                        <td>
                          {player.name}
                          {player.abandoned ? ' (abandono)' : ''}
                        </td>
                        <td>{player.kills}</td>
                        <td>{player.deaths}</td>
                        <td>
                          {
                            (
                              {
                                win: 'Victoria',
                                draw: 'Empate',
                                loss: 'Derrota',
                              } as Record<string, string>
                            )[player.outcome]
                          }
                        </td>
                        <td>+{player.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="arena-results-actions">
                <button
                  type="button"
                  className="arena-btn-primary"
                  disabled={
                    controls?.playerId !== matchMeta.hostId ||
                    ['saving', 'failed'].includes(matchMeta.saveStatus)
                  }
                  onClick={() => rematchRef.current?.()}
                >
                  Jugar revancha
                </button>
                <button type="button" className="arena-btn-secondary" onClick={onExit}>
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

export default function App({
  profile,
  onProfileSaved,
  onOpenProfile,
  onSignOut,
  accountNotice,
}: {
  profile: Profile
  onProfileSaved: (profile: Profile) => void
  onOpenProfile: () => void
  accountNotice?: string
  onSignOut: () => void
}) {
  const [skin, setSkin] = useState<PlayerSkin>(profile.preferred_skin)
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponType>(profile.preferred_weapon)
  const [crosshairStyle, setCrosshairStyle] = useState<CrosshairStyle>(profile.crosshair_style)
  const [rankingsOpen, setRankingsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [roomRequest, setRoomRequest] = useState<RoomJoinRequest | null>(null)

  const [createMaxPlayers, setCreateMaxPlayers] = useState<RoomCapacity>(4)
  const [createPrivate, setCreatePrivate] = useState(false)
  const [createRoomName, setCreateRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomsError, setRoomsError] = useState('')

  const [entryMessage, setEntryMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetch(toHealthCheckUrl(GAME_SERVER_URL), { signal: controller.signal }).catch(() => {})
    return () => controller.abort()
  }, [])

  const loadPublicRooms = useCallback(async () => {
    setRoomsLoading(true)
    setRoomsError('')
    try {
      const response = await fetch(toApiUrl(GAME_SERVER_URL, '/api/rooms'))
      if (!response.ok) throw new Error('HTTP error')
      const data = (await response.json()) as { rooms?: PublicRoomSummary[] }
      setPublicRooms(Array.isArray(data.rooms) ? data.rooms : [])
    } catch {
      setRoomsError('No se pudo cargar la lista de salas públicas.')
    } finally {
      setRoomsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (playerName !== null || rankingsOpen) return
    let active = true
    queueMicrotask(() => {
      if (active) void loadPublicRooms()
    })
    const timer = window.setInterval(() => {
      void loadPublicRooms()
    }, 10_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [playerName, rankingsOpen, loadPublicRooms])

  const returnToForm = useCallback((message: string) => {
    setEntryMessage(message)
    setPlayerName(null)
    setRoomRequest(null)
  }, [])

  async function saveProfile(nextRoom?: RoomJoinRequest) {
    if (!supabase || saving) return
    setEntryMessage('')
    setSavedMessage('')
    if (!validUsername(profile.username ?? '')) {
      setEntryMessage('Usa de 3 a 20 letras sin acentos, números o guion bajo.')
      return
    }
    if (nextRoom?.mode === 'join' && !normalizeRoomCode(nextRoom.code)) {
      setEntryMessage('Introduce un código de sala válido (letras y números, 4 a 12 caracteres).')
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          preferred_skin: skin,
          preferred_weapon: selectedWeapon,
          crosshair_style: crosshairStyle,
        })
        .eq('id', profile.id)
        .select('*')
        .single()
      if (error || !data) {
        setEntryMessage(profileError(error ?? {}))
        return
      }
      onProfileSaved(data as Profile)
      setSavedMessage('Perfil guardado.')
      if (nextRoom) {
        setRoomRequest(nextRoom)
        setPlayerName(data.username)
      }
    } catch {
      setEntryMessage('No se pudo guardar el perfil. Comprueba tu conexión.')
    } finally {
      setSaving(false)
    }
  }

  if (rankingsOpen) return <Rankings onBack={() => setRankingsOpen(false)} />

  if (playerName !== null && roomRequest !== null) {
    return (
      <ArenaSession
        playerName={playerName}
        playerSkin={skin}
        playerWeapon={selectedWeapon}
        crosshairStyle={crosshairStyle}
        roomRequest={roomRequest}
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
            <p>
              <strong>{profile.username}</strong>
              <br />
              Listo para la arena
            </p>
          </div>
          <button type="button" className="auth-text-button" onClick={() => setRankingsOpen(true)}>
            Rankings y estadísticas
          </button>
          <button type="button" className="auth-text-button" onClick={onOpenProfile}>
            Mi perfil
          </button>
          <button type="button" className="auth-text-button" onClick={onSignOut}>
            Cerrar sesión
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void saveProfile()
          }}
        >
          {entryMessage && (
            <p className="lobby-alert" role="alert">
              {entryMessage}
            </p>
          )}

          {accountNotice && (
            <p className="auth-notice" role="status">
              {accountNotice}
            </p>
          )}
          {savedMessage && (
            <p className="auth-notice" role="status">
              {savedMessage}
            </p>
          )}
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
              <button type="submit" disabled={!validUsername(profile.username ?? '') || saving}>
                {saving ? 'Guardando…' : 'Guardar preferencias'}
              </button>
            </div>
          </fieldset>
        </form>

        <section className="rooms-section" aria-label="Salas de juego">
          <h2 className="rooms-heading">Salas de juego</h2>

          <div className="rooms-panel">
            <span className="skin-grid-label">Crear nueva sala</span>
            <div className="room-toggle-grid" role="radiogroup" aria-label="Visibilidad de sala">
              <button
                type="button"
                role="radio"
                aria-checked={!createPrivate}
                className={`crosshair-option${!createPrivate ? ' is-selected' : ''}`}
                onClick={() => setCreatePrivate(false)}
              >
                <span>Pública (visible en la lista)</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={createPrivate}
                className={`crosshair-option${createPrivate ? ' is-selected' : ''}`}
                onClick={() => setCreatePrivate(true)}
              >
                <span>Privada (solo por código)</span>
              </button>
            </div>

            <span className="skin-grid-label">Capacidad y tamaño de mapa</span>
            <div className="room-capacity-grid" role="radiogroup" aria-label="Capacidad y mapa">
              {MAP_OPTIONS.map((opt) => (
                <button
                  key={opt.maxPlayers}
                  type="button"
                  role="radio"
                  aria-checked={createMaxPlayers === opt.maxPlayers}
                  className={`weapon-option${createMaxPlayers === opt.maxPlayers ? ' is-selected' : ''}`}
                  onClick={() => setCreateMaxPlayers(opt.maxPlayers)}
                >
                  <span>{opt.label}</span>
                  <span className="weapon-stats">{opt.dimensionsLabel}</span>
                </button>
              ))}
            </div>

            <div className="lobby-field">
              <label htmlFor="room-name-input">Nombre de la sala (opcional)</label>
              <input
                id="room-name-input"
                type="text"
                maxLength={32}
                placeholder="Ej. Duelo del desierto"
                value={createRoomName}
                onChange={(e) => setCreateRoomName(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="lobby-submit"
              disabled={!validUsername(profile.username ?? '') || saving}
              onClick={() => {
                void saveProfile({
                  mode: 'create',
                  maxPlayers: createMaxPlayers,
                  isPrivate: createPrivate,
                  roomName: createRoomName,
                })
              }}
            >
              Crear sala
            </button>
          </div>

          <div className="rooms-panel">
            <span className="skin-grid-label">Unirse con código</span>
            <div className="room-join-row">
              <input
                type="text"
                aria-label="Código de sala"
                maxLength={12}
                placeholder="Ej. K7MP2A"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <button
                type="button"
                className="kenney-btn-primary"
                disabled={!validUsername(profile.username ?? '') || saving}
                onClick={() => {
                  const normalized = normalizeRoomCode(joinCode)
                  void saveProfile({ mode: 'join', code: normalized })
                }}
              >
                Unirse
              </button>
            </div>
          </div>

          <div className="rooms-panel">
            <div className="rooms-list-header">
              <span className="skin-grid-label" style={{ marginBottom: 0 }}>
                Salas públicas abiertas
              </span>
              <button
                type="button"
                className="auth-text-button"
                style={{ margin: 0, padding: '6px 12px' }}
                disabled={roomsLoading}
                onClick={() => {
                  void loadPublicRooms()
                }}
              >
                {roomsLoading ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>

            {roomsError && <p className="lobby-alert">{roomsError}</p>}
            {!roomsError && publicRooms.length === 0 && (
              <p className="auth-hint" style={{ marginTop: 10 }}>
                No hay salas públicas disponibles. Crea una nueva para empezar.
              </p>
            )}
            {publicRooms.length > 0 && (
              <ul className="public-rooms-list">
                {publicRooms.map((room) => (
                  <li key={room.code} className="public-room-item">
                    <div className="public-room-info">
                      <strong>{room.name}</strong>
                      <span>
                        Código: {room.code} · {MAP_LABEL_BY_SIZE[room.mapSize]} · {room.clients}/
                        {room.maxClients}
                        {room.hostName ? ` · Anfitrión: ${room.hostName}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="kenney-btn-primary"
                      disabled={!validUsername(profile.username ?? '') || saving}
                      onClick={() => {
                        void saveProfile({ mode: 'join', code: room.code })
                      }}
                    >
                      Entrar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <p className="auth-hint" style={{ marginTop: 14 }}>
          Controles: PC (WASD + ratón/ESPACIO), móvil/tablet (joysticks táctiles + pantalla completa)
          y mando USB/Bluetooth (sticks + RT/RB/A).
        </p>
      </div>
    </main>
  )
}
