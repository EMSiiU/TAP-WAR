import MatchResults from './game/MatchResults'
import ArenaHeader from './game/ArenaHeader'
import MapPreview from './game/MapPreview'
import Rankings from './rankings/Rankings'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Client, ErrorCode, MatchMakeError, ServerError } from '@colyseus/sdk'
import './App.css'
import './game/arena-layout.css'
import { neutralTouchInput } from './game/touchInput'
import { supabase, validUsername, profileError, type Profile } from './auth/supabase'
import ProfileAvatar from './auth/ProfileAvatar'
import PhaserView from './game/PhaserView'
import TouchControls, { type TouchInputState } from './game/TouchControls'
import {
  MAP_LABEL_BY_SIZE,
  ENVIRONMENT_OPTIONS,
  normalizeEnvironment,
  getArenaMap,
  type MapEnvironment,
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
  environment: MapEnvironment
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
  environment: MapEnvironment
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
  const touchInputRef = useRef<TouchInputState>(neutralTouchInput())
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
    environment: roomRequest.mode === 'create' ? normalizeEnvironment(roomRequest.environment) : 'desert',
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
  const [stateReady, setStateReady] = useState(false)
  const [controls, setControls] = useState<ArenaControls | null>(null)
  const rematchRef = useRef<(() => void) | null>(null)
  const receiveTouchInput = useCallback((input: TouchInputState) => {
    const prev = touchInputRef.current
    touchInputRef.current = input
    const wasActive = prev.moveX !== 0 || prev.moveY !== 0 || prev.shoot
    if (wasActive && !input.moveX && !input.moveY && !input.shoot) {
      controls?.send({ moveX: 0, moveY: 0, aimAngle: input.aimAngle, shoot: false })
    }
  }, [controls])
  const resetTouchInput = useCallback(() => receiveTouchInput(neutralTouchInput()), [receiveTouchInput])
  useEffect(() => {
    if (!touchMode || localPaused || matchMeta.phase === 'finished') resetTouchInput()
  }, [touchMode, localPaused, matchMeta.phase, resetTouchInput])


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
                environment: roomRequest.environment,
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
          if (!active || !state || !state.roomCode) return
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
            environment: normalizeEnvironment(state.environment),
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
          setStateReady(true)
        }

        setStateReady(false)
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
            touchInputRef.current = neutralTouchInput()
            if (joined.connection.isOpen) joined.send('input', { moveX: 0, moveY: 0, aimAngle: 0, shoot: false })
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
  const showTouchControls = Boolean(
    controls && touchMode && !localPaused && matchMeta.phase !== 'finished',
  )

  return (
    <div ref={shellRef} className={`arena-shell${touchMode ? ' is-touch-mode' : ''}`}>
      <ArenaHeader
        roomCode={matchMeta.roomCode} roomName={matchMeta.roomName} isPrivate={matchMeta.isPrivate}
        environmentLabel={ENVIRONMENT_OPTIONS.find(option => option.id === matchMeta.environment)?.label || ''}
        sizeLabel={MAP_LABEL_BY_SIZE[matchMeta.mapSize]} playerCount={players.length} maxPlayers={matchMeta.maxPlayers}
        clock={formatClock(matchMeta.timeRemaining)} scoreLine={scoreLine} killsToWin={matchMeta.killsToWin}
        status={status} connected={Boolean(controls)} gamepadConnected={gamepadConnected}
        touchMode={touchMode} fullscreen={isFullscreen} copied={copiedCode}
        onCopy={() => { void copyRoomCode() }} onTouchToggle={() => { resetTouchInput(); setTouchMode(value => !value) }}
        onFullscreen={() => { void toggleFullscreen() }} onExit={onExit} onSignOut={onSignOut}
      />

      <div className={`arena-stage${showTouchControls ? ' has-touch-controls' : ''}`}>
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

        <div className="arena-viewport"><div className="arena-canvas-wrap">
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

          {controls && stateReady && (
            <PhaserView
              players={players}
              bullets={bullets}
              pickups={pickups}
              phase={matchMeta.phase}
              isPaused={localPaused}
              crosshairStyle={crosshairStyle}
              mapSize={matchMeta.mapSize}
              environment={matchMeta.environment}
              touchMode={touchMode}
              touchInputRef={touchInputRef}
              onMenuToggle={() => { resetTouchInput(); setLocalPaused(prev => !prev) }}
              onGamepadChange={setGamepadConnected}
              resumeSignal={resumeSignal}
              controls={controls}
            />
          )}
        </div></div>

        {showTouchControls && controls && (
          <TouchControls
            onTouchInput={receiveTouchInput}
            onEmote={(emote) => controls.sendEmote?.(emote)}
            onMenu={() => { resetTouchInput(); setLocalPaused(true) }}
          />
        )}

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
          <MatchResults
            title={finalPlayers.filter(p => p.outcome === 'draw').length > 1 ? `Empate: ${matchMeta.winnerName}` : matchMeta.winnerName ? `Ganador: ${matchMeta.winnerName}` : 'Partida interrumpida'}
            reason={finishReason} saveMessage={saveMessage} players={sortedPlayers}
            rematchDisabled={controls?.playerId !== matchMeta.hostId || ['saving', 'failed'].includes(matchMeta.saveStatus)}
            onRematch={() => rematchRef.current?.()} onExit={onExit}
          />
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

  const [createEnvironment, setCreateEnvironment] = useState<MapEnvironment>('desert')
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

            <span className="skin-grid-label">Escenario</span>
            <div className="room-environment-grid" role="radiogroup" aria-label="Escenario de la sala">
              {ENVIRONMENT_OPTIONS.map(option => (
                <button type="button" key={option.id} role="radio" aria-checked={createEnvironment === option.id}
                  className={`room-environment-option${createEnvironment === option.id ? ' is-selected' : ''}`}
                  onClick={() => setCreateEnvironment(option.id)}>
                  <MapPreview map={getArenaMap(createMaxPlayers === 20 ? 'large' : createMaxPlayers === 10 ? 'medium' : 'small', option.id)} />
                  <strong>{option.label}</strong><span>{option.description}</span>
                </button>
              ))}
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
                  environment: createEnvironment,
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
                        Código: {room.code} · {ENVIRONMENT_OPTIONS.find(option => option.id === normalizeEnvironment(room.environment))?.label} · {MAP_LABEL_BY_SIZE[room.mapSize]} · {room.clients}/
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
