import MatchResults, { type MatchResultRow } from './game/MatchResults'
import ArenaHeader from './game/ArenaHeader'
import MapPreview from './game/MapPreview'
import KeybindingsModal from './game/KeybindingsModal'
import TouchLayoutEditorModal from './game/TouchLayoutEditorModal'
import Rankings from './rankings/Rankings'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Client, ErrorCode, MatchMakeError, ServerError } from '@colyseus/sdk'
import './App.css'
import './game/arena-layout.css'
import { neutralTouchInput } from './game/touchInput'
import {
  controlsSyncMessage,
  loadAccountDeviceControls,
  saveAccountDeviceControls,
  type ControlsSyncStatus,
} from './game/controlsSync'
import { getOrCreateDeviceIdentity, type DeviceIdentity } from './game/deviceIdentity'
import { detectDefaultTouchMode } from './game/deviceInput'
import {
  loadLocalTouchLayouts,
  type TouchLayoutByOrientation,
} from './game/touchLayout'
import {
  formatBindingLabel,
  formatMoveGroupLabel,
  loadPcControls,
  type PcControlConfig,
} from './game/keybindings'
import { supabase, validUsername, profileError, type Profile } from './auth/supabase'
import ProfileAvatar from './auth/ProfileAvatar'
import PhaserView from './game/PhaserView'
import TouchControls, { type TouchInputState } from './game/TouchControls'
import {
  ENVIRONMENT_OPTIONS,
  GAME_MODE_OPTIONS,
  GUN_GAME_LADDER,
  MAP_LABEL_BY_SIZE,
  MAP_OPTIONS,
  MAX_DASHES,
  gameModeLabel,
  getArenaMap,
  normalizeEnvironment,
  normalizeGameMode,
  normalizeRoomCode,
  type GameMode,
  type MapEnvironment,
  type MapSize,
  type PublicRoomSummary,
  type RoomCapacity,
  type RoomJoinRequest,
} from './game/arenaMaps'
import { resolveGameServerUrl, toApiUrl, toHealthCheckUrl } from './game/serverUrl'
import weaponsConfig from '../../../packages/shared/weapons.json'
import type {
  ArenaActionKind,
  ArenaControls,
  BulletState,
  CrosshairStyle,
  MatchPhase,
  PickupState,
  PlayerSkin,
  PlayerState,
  PowerUpState,
  TeamColor,
  WeaponType,
} from './game/ArenaScene'

type ArenaState = {
  roomCode: string
  roomName: string
  mapSize: MapSize
  environment: MapEnvironment
  gameMode: GameMode
  maxPlayers: number
  isPrivate: boolean
  hostId: string
  notice: string
  announcement: string
  saveStatus: string
  resultSummary: string
  finishReason: string
  phase: MatchPhase
  isPaused: boolean
  pausedByName: string
  timeRemaining: number
  killsToWin: number
  orangeScore: number
  blueScore: number
  winnerId: string
  winnerName: string
  players: Map<string, PlayerState>
  bullets: Map<string, BulletState>
  pickups: Map<string, PickupState>
  powerUps: Map<string, PowerUpState>
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
  reloadMs?: number
  damage: number
  explosionRadius?: number
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
  gameMode: GameMode
  maxPlayers: number
  isPrivate: boolean
  hostId: string
  notice: string
  announcement: string
  saveStatus: string
  resultSummary: string
  finishReason: string
  phase: MatchPhase
  isPaused: boolean
  pausedByName: string
  timeRemaining: number
  killsToWin: number
  orangeScore: number
  blueScore: number
  winnerId: string
  winnerName: string
}

function formatClock(seconds: number): string {
  const total = Math.ceil(Math.max(0, seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
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
  pcControls,
  onPcControlsChange,
  touchLayouts,
  onTouchLayoutsChange,
  deviceLabel,
  controlsSyncStatus,
  roomRequest,
  onExit,
  onSignOut,
  onEnd,
}: {
  playerName: string
  playerSkin: PlayerSkin
  playerWeapon: WeaponType
  crosshairStyle: CrosshairStyle
  pcControls: PcControlConfig
  onPcControlsChange: (next: PcControlConfig) => void
  touchLayouts: TouchLayoutByOrientation
  onTouchLayoutsChange: (next: TouchLayoutByOrientation) => void
  deviceLabel: string
  controlsSyncStatus: ControlsSyncStatus
  roomRequest: RoomJoinRequest
  onExit: () => void
  onSignOut: () => void
  onEnd: (message: string) => void
}) {
  const [players, setPlayers] = useState<PlayerState[]>([])
  const [bullets, setBullets] = useState<BulletState[]>([])
  const [pickups, setPickups] = useState<PickupState[]>([])
  const [powerUps, setPowerUps] = useState<PowerUpState[]>([])
  const [localPaused, setLocalPaused] = useState(false)
  const [controlsModalOpen, setControlsModalOpen] = useState(false)
  const [touchEditorOpen, setTouchEditorOpen] = useState(false)
  const [touchMode, setTouchMode] = useState<boolean>(() => detectDefaultTouchMode())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [gamepadConnected, setGamepadConnected] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const touchInputRef = useRef<TouchInputState>(neutralTouchInput())
  const actionTriggerRef = useRef<((action: ArenaActionKind) => void) | null>(null)
  const explosionTriggerRef = useRef<((x: number, y: number, radius: number) => void) | null>(null)
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
    gameMode: roomRequest.mode === 'create' ? normalizeGameMode(roomRequest.gameMode) : 'ffa',
    maxPlayers: roomRequest.mode === 'create' ? roomRequest.maxPlayers : 4,
    isPrivate: roomRequest.mode === 'create' ? roomRequest.isPrivate : false,
    hostId: '',
    notice: '',
    announcement: '',
    saveStatus: '',
    resultSummary: '',
    finishReason: '',
    phase: 'waiting',
    isPaused: false,
    pausedByName: '',
    timeRemaining: 300,
    killsToWin: 20,
    orangeScore: 0,
    blueScore: 0,
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
    if (
      input.autoAimShotSeq > prev.autoAimShotSeq ||
      input.manualShotSeq > prev.manualShotSeq
    ) {
      actionTriggerRef.current?.('touchSync')
      return
    }
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
                gameMode: roomRequest.gameMode ?? 'ffa',
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

        joined.onMessage<{ x?: unknown; y?: unknown; radius?: unknown }>('explosion', (payload) => {
          if (
            active &&
            payload &&
            typeof payload.x === 'number' &&
            typeof payload.y === 'number' &&
            typeof payload.radius === 'number' &&
            Number.isFinite(payload.x) &&
            Number.isFinite(payload.y) &&
            Number.isFinite(payload.radius)
          ) {
            explosionTriggerRef.current?.(payload.x, payload.y, payload.radius)
          }
        })

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
          if (state.powerUps) {
            setPowerUps(Array.from(state.powerUps.values()))
          }
          setMatchMeta({
            roomCode: state.roomCode || joined.roomId || '',
            roomName: state.roomName ?? '',
            mapSize:
              state.mapSize === 'medium' || state.mapSize === 'large' ? state.mapSize : 'small',
            environment: normalizeEnvironment(state.environment),
            gameMode: normalizeGameMode(state.gameMode),
            maxPlayers: typeof state.maxPlayers === 'number' ? state.maxPlayers : 4,
            isPrivate: Boolean(state.isPrivate),
            hostId: state.hostId ?? '',
            notice: state.notice ?? '',
            announcement: state.announcement ?? '',
            saveStatus: state.saveStatus ?? '',
            resultSummary: state.resultSummary ?? '',
            finishReason: state.finishReason ?? '',
            phase: state.phase ?? 'waiting',
            isPaused: Boolean(state.isPaused),
            pausedByName: state.pausedByName ?? '',
            timeRemaining: typeof state.timeRemaining === 'number' ? state.timeRemaining : 300,
            killsToWin: typeof state.killsToWin === 'number' ? state.killsToWin : 20,
            orangeScore: typeof state.orangeScore === 'number' ? state.orangeScore : 0,
            blueScore: typeof state.blueScore === 'number' ? state.blueScore : 0,
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
            if (!paused) {
              setControlsModalOpen(false)
              setTouchEditorOpen(false)
            }
          },
        })
        setStatus('Conectado')
      } catch (error) {
        if (!active) return

        if (error instanceof MatchMakeError && error.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID) {
          onEnd(
            error.message.endsWith(' is locked')
              ? 'La sala está llena o la partida ya terminó.'
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

  const localPlayer = players.find((p) => p.id === controls?.playerId)

  useEffect(() => {
    if (matchMeta.phase !== 'finished' || !matchMeta.winnerId) return
    const localWon =
      matchMeta.gameMode === 'tdm'
        ? Boolean(localPlayer?.team && matchMeta.winnerId === `team:${localPlayer.team}`)
        : matchMeta.winnerId === controls?.playerId
    if (!localWon) {
      const audio = new Audio('/assets/sounds/lose-a.ogg')
      audio.volume = 0.55
      audio.play().catch(() => {})
    }
  }, [matchMeta.phase, matchMeta.winnerId, matchMeta.gameMode, controls?.playerId, localPlayer?.team])

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

  const finalPlayers: MatchResultRow[] = matchMeta.resultSummary ? JSON.parse(matchMeta.resultSummary) : []
  const sortedPlayers = [...finalPlayers].sort((a, b) => {
    if (matchMeta.gameMode === 'gungame') {
      return (b.weaponTier ?? 0) - (a.weaponTier ?? 0) || b.kills - a.kills || a.deaths - b.deaths
    }
    if (matchMeta.gameMode === 'tdm') {
      const rank = (o: string) => (o === 'win' ? 2 : o === 'draw' ? 1 : 0)
      return rank(b.outcome) - rank(a.outcome) || b.kills - a.kills || a.deaths - b.deaths
    }
    return b.kills - a.kills || a.deaths - b.deaths
  })

  const liveLeaders = [...players]
    .sort((a, b) =>
      matchMeta.gameMode === 'gungame'
        ? (b.weaponTier ?? 0) - (a.weaponTier ?? 0) || b.kills - a.kills || a.deaths - b.deaths
        : b.kills - a.kills || a.deaths - b.deaths,
    )
    .slice(0, 3)

  const scoreLine =
    matchMeta.gameMode === 'tdm'
      ? `Naranja ${matchMeta.orangeScore} — ${matchMeta.blueScore} Azul`
      : matchMeta.gameMode === 'gungame'
        ? `Top: ${liveLeaders.map((p) => `${p.name} Nv.${Math.min(GUN_GAME_LADDER.length, (p.weaponTier ?? 0) + 1)}`).join(' · ')} | Tú: Nv.${Math.min(GUN_GAME_LADDER.length, (localPlayer?.weaponTier ?? 0) + 1)}`
        : players.length <= 4
          ? players.map((p) => `${p.name}: ${p.kills}`).join(' vs ')
          : `Top: ${liveLeaders.map((p) => `${p.name} ${p.kills}`).join(' · ')} | Tú: ${localPlayer?.kills ?? 0}`

  const localWeaponSpec = localPlayer ? WEAPON_BY_ID[localPlayer.weaponType] : undefined
  const localTeamColor: TeamColor =
    localPlayer?.team === 'blue' ||
    localPlayer?.teamColor === 'blue' ||
    localPlayer?.skin === 'mouse' ||
    localPlayer?.skin === 'rabbit'
      ? 'blue'
      : 'orange'
  const localAmmo = localPlayer?.ammo ?? 0
  const localMaxAmmo = localPlayer?.maxAmmo ?? localWeaponSpec?.maxAmmo ?? 0
  const localReserveAmmo = localPlayer?.reserveAmmo ?? 0
  const localReloading = Boolean(localPlayer?.isReloading)
  const localReloadProgress = localPlayer?.reloadProgress ?? 0
  const localDashes = localPlayer?.dashes ?? MAX_DASHES
  const localMaxDashes = localPlayer?.maxDashes ?? MAX_DASHES
  const localDashRecharge = localPlayer?.dashRechargeProgress ?? 0
  const localShield = localPlayer?.shield ?? 0
  const localShieldSec = localPlayer?.shieldRemaining ?? 0
  const localGoldenSec = localPlayer?.goldenRemaining ?? 0
  const isGolden = localGoldenSec > 0
  const isLocalFirearm = Boolean(localWeaponSpec && !localWeaponSpec.isMelee && localMaxAmmo > 0)
  const canReload = isLocalFirearm && !isGolden && !localReloading && localAmmo < localMaxAmmo && localReserveAmmo > 0
  const needsReload = isLocalFirearm && !isGolden && !localReloading && localAmmo === 0 && localReserveAmmo > 0
  const isLowAmmo = isLocalFirearm && !isGolden && localAmmo <= Math.ceil(localMaxAmmo * 0.25)
  const ammoIconSrc =
    localPlayer?.weaponType === 'shotgun' ? '/assets/ui/icon-shell.png' : '/assets/ui/icon-bullet.png'
  const finishReason =
    (
      {
        time: 'Tiempo agotado',
        kills:
          matchMeta.gameMode === 'gungame'
            ? 'Todas las armas completadas'
            : matchMeta.gameMode === 'tdm'
              ? `Meta de ${matchMeta.killsToWin} bajas de equipo alcanzada`
              : `Meta de ${matchMeta.killsToWin} kills alcanzada`,
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
  const resultsTitle =
    matchMeta.gameMode === 'tdm'
      ? finalPlayers.some((p) => p.outcome === 'draw')
        ? 'Empate entre equipos'
        : matchMeta.winnerName
          ? `Ganador: ${matchMeta.winnerName}`
          : 'Partida interrumpida'
      : finalPlayers.filter((p) => p.outcome === 'draw').length > 1
        ? `Empate: ${matchMeta.winnerName}`
        : matchMeta.winnerName
          ? `Ganador: ${matchMeta.winnerName}`
          : 'Partida interrumpida'

  const reloadKeyLabel = formatBindingLabel(pcControls.reload)
  const meleeKeyLabel = formatBindingLabel(pcControls.melee)
  const dashKeyLabel = formatBindingLabel(pcControls.dash)
  const shootKeyLabel = formatBindingLabel(pcControls.shoot)
  const moveKeysLabel = formatMoveGroupLabel(pcControls)
  const emote1KeyLabel = formatBindingLabel(pcControls.emote1)
  const emote2KeyLabel = formatBindingLabel(pcControls.emote2)

  return (
    <div ref={shellRef} className={`arena-shell${touchMode ? ' is-touch-mode' : ''}`}>
      <ArenaHeader
        roomCode={matchMeta.roomCode}
        roomName={matchMeta.roomName}
        isPrivate={matchMeta.isPrivate}
        gameModeLabel={gameModeLabel(matchMeta.gameMode)}
        environmentLabel={ENVIRONMENT_OPTIONS.find(option => option.id === matchMeta.environment)?.label || ''}
        sizeLabel={MAP_LABEL_BY_SIZE[matchMeta.mapSize]}
        playerCount={players.length}
        maxPlayers={matchMeta.maxPlayers}
        clock={formatClock(matchMeta.timeRemaining)}
        scoreLine={scoreLine}
        killsToWin={matchMeta.killsToWin}
        targetLabel={matchMeta.gameMode === 'gungame' ? 'Armas' : 'Meta'}
        status={status}
        connected={Boolean(controls)}
        gamepadConnected={gamepadConnected}
        touchMode={touchMode}
        fullscreen={isFullscreen}
        copied={copiedCode}
        onCopy={() => { void copyRoomCode() }}
        onTouchToggle={() => { resetTouchInput(); setTouchMode(value => !value) }}
        onFullscreen={() => { void toggleFullscreen() }}
        onExit={onExit}
        onSignOut={onSignOut}
      />

      <div className={`arena-stage${showTouchControls ? ' has-touch-controls' : ''}`}>
        {controls && matchMeta.phase === 'waiting' && (
          <div className="arena-waiting-banner" role="status">
            <span>
              Sala <strong>{matchMeta.roomName || matchMeta.roomCode}</strong> ·{' '}
              <strong>{gameModeLabel(matchMeta.gameMode)}</strong> · Código:{' '}
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

        {controls && matchMeta.phase === 'playing' && matchMeta.announcement && (
          <div className="arena-announcement-banner" role="status">
            <img src="/assets/ui/powerup-golden.svg" alt="" className="arena-announcement-icon" />
            <span>{matchMeta.announcement}</span>
          </div>
        )}

        <div className="arena-viewport"><div className="arena-canvas-wrap">
          {controls && localWeaponSpec && localPlayer && (
            <div className="arena-hud-bottom" role="status">
              <div className="arena-hud-badges-row">
                {matchMeta.gameMode === 'tdm' && localPlayer.team && (
                  <span className={`arena-status-pill is-team-${localPlayer.team}`}>
                    {localPlayer.team === 'blue' ? 'Equipo Azul' : 'Equipo Naranja'}
                  </span>
                )}
                {matchMeta.gameMode === 'gungame' && (
                  <span className="arena-status-pill is-gungame">
                    Nivel {Math.min(GUN_GAME_LADDER.length, (localPlayer.weaponTier ?? 0) + 1)}/{GUN_GAME_LADDER.length}
                  </span>
                )}
                {isGolden && (
                  <span className="arena-status-pill is-golden">
                    <img src="/assets/ui/powerup-golden.svg" alt="" />
                    DORADO {localGoldenSec}s · Munición ∞
                  </span>
                )}
                {localShield > 0 && localShieldSec > 0 && (
                  <span className="arena-status-pill is-shield">
                    <img src="/assets/ui/powerup-shield.svg" alt="" />
                    Escudo {localShieldSec}s
                  </span>
                )}
              </div>

              <div className="arena-hud-primary-row">
                <div className={`arena-ammo-badge${isLowAmmo ? ' is-low' : ''}${isGolden ? ' is-golden' : ''}`}>
                  {isLocalFirearm ? (
                    <>
                      <span className="arena-ammo-icons" aria-hidden="true">
                        <img src={ammoIconSrc} alt="" className="arena-ammo-icon" />
                      </span>
                      <div className="arena-ammo-text">
                        <strong>
                          {isGolden ? '∞' : `${localAmmo} / ${localReserveAmmo}`}
                        </strong>
                        <small>
                          {localReloading
                            ? 'Recargando…'
                            : needsReload
                              ? touchMode
                                ? 'Pulsa REC'
                                : `Pulsa ${reloadKeyLabel} para recargar`
                              : !isGolden && localAmmo === 0 && localReserveAmmo === 0
                                ? touchMode
                                  ? 'Sin balas · Usa MELÉ'
                                  : `Sin balas · ${meleeKeyLabel} Melé`
                                : localWeaponSpec.name}
                        </small>
                        {localReloading && (
                          <span className="arena-reload-track" aria-hidden="true">
                            <span
                              className="arena-reload-fill"
                              style={{ width: `${Math.round(localReloadProgress * 100)}%` }}
                            />
                          </span>
                        )}
                      </div>
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

                <div
                  className={`arena-dash-badge${localDashes <= 0 ? ' is-empty' : ''}`}
                  title={touchMode ? 'Dashes restantes (recarga 1 cada 10 s)' : `Dash (${dashKeyLabel}) · recarga 1 cada 10 s`}
                >
                  <img src="/assets/ui/powerup-dash.svg" alt="" className="arena-dash-icon" />
                  <div className="arena-dash-info">
                    <span className="arena-dash-label">
                      DASH {localDashes}/{localMaxDashes}
                      {!touchMode && <kbd className="hud-kbd">{dashKeyLabel}</kbd>}
                    </span>
                    <span className="arena-dash-pips" aria-hidden="true">
                      {Array.from({ length: localMaxDashes }, (_, idx) => (
                        <i key={idx} className={idx < localDashes ? 'is-filled' : ''} />
                      ))}
                    </span>
                    <span
                      className="arena-dash-recharge-track"
                      aria-label={
                        localDashes < localMaxDashes
                          ? `Recarga de dash ${Math.round(localDashRecharge * 100)}%`
                          : 'Dashes completos'
                      }
                    >
                      <span
                        className={`arena-dash-recharge-fill${localDashes >= localMaxDashes ? ' is-full' : ''}`}
                        style={{
                          width: `${localDashes >= localMaxDashes ? 100 : Math.round(localDashRecharge * 100)}%`,
                        }}
                      />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {controls && !touchMode && matchMeta.phase === 'waiting' && (
            <div className="arena-pc-legend" aria-label="Leyenda de controles de PC">
              <span><kbd>{moveKeysLabel}</kbd> Mover</span>
              <span><kbd>{shootKeyLabel}</kbd> Disparar</span>
              <span><kbd>{meleeKeyLabel}</kbd> Melé</span>
              <span><kbd>{reloadKeyLabel}</kbd> Recargar</span>
              <span><kbd>{dashKeyLabel}</kbd> Dash</span>
              <span><kbd>{emote1KeyLabel}/{emote2KeyLabel}</kbd> Emotes</span>
              <span><kbd>Esc</kbd> Menú</span>
            </div>
          )}

          {controls && stateReady && (
            <PhaserView
              players={players}
              bullets={bullets}
              pickups={pickups}
              powerUps={powerUps}
              phase={matchMeta.phase}
              gameMode={matchMeta.gameMode}
              isPaused={localPaused}
              crosshairStyle={crosshairStyle}
              pcControls={pcControls}
              mapSize={matchMeta.mapSize}
              environment={matchMeta.environment}
              touchMode={touchMode}
              touchInputRef={touchInputRef}
              actionTriggerRef={actionTriggerRef}
              explosionTriggerRef={explosionTriggerRef}
              onMenuToggle={() => { resetTouchInput(); setLocalPaused(prev => !prev) }}
              onGamepadChange={setGamepadConnected}
              resumeSignal={resumeSignal}
              controls={controls}
            />
          )}
        </div></div>

        {showTouchControls && controls && (
          <TouchControls
            layout={touchLayouts}
            onTouchInput={receiveTouchInput}
            onEmote={(emote) => controls.sendEmote?.(emote)}
            onMenu={() => { resetTouchInput(); setLocalPaused(true) }}
            onMelee={() => actionTriggerRef.current?.('melee')}
            onReload={() => actionTriggerRef.current?.('reload')}
            onDash={() => actionTriggerRef.current?.('dash')}
            dashes={localDashes}
            maxDashes={localMaxDashes}
            dashRechargeProgress={localDashRecharge}
            canReload={canReload}
            isReloading={localReloading}
            needsReload={needsReload}
          />
        )}

        {localPaused && matchMeta.phase !== 'finished' && !controlsModalOpen && !touchEditorOpen && (
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
                <button
                  type="button"
                  className="kenney-btn-secondary"
                  onClick={() => setControlsModalOpen(true)}
                >
                  Configurar controles PC
                </button>
                <button
                  type="button"
                  className="kenney-btn-secondary"
                  onClick={() => setTouchEditorOpen(true)}
                >
                  Personalizar controles táctiles
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
            title={resultsTitle}
            reason={finishReason}
            saveMessage={saveMessage}
            players={sortedPlayers}
            gameMode={matchMeta.gameMode}
            rematchDisabled={controls?.playerId !== matchMeta.hostId || ['saving', 'failed'].includes(matchMeta.saveStatus)}
            onRematch={() => rematchRef.current?.()}
            onExit={onExit}
          />
        )}
      </div>

      {localPaused && controlsModalOpen && matchMeta.phase !== 'finished' && (
        <KeybindingsModal
          controls={pcControls}
          deviceLabel={deviceLabel}
          syncStatus={controlsSyncStatus}
          onChange={onPcControlsChange}
          onClose={() => setControlsModalOpen(false)}
        />
      )}

      {localPaused && touchEditorOpen && matchMeta.phase !== 'finished' && (
        <TouchLayoutEditorModal
          layouts={touchLayouts}
          deviceLabel={deviceLabel}
          syncStatus={controlsSyncStatus}
          onSave={onTouchLayoutsChange}
          onClose={() => setTouchEditorOpen(false)}
        />
      )}
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
  const [deviceIdentity] = useState<DeviceIdentity>(() => getOrCreateDeviceIdentity())
  const [pcControls, setPcControls] = useState<PcControlConfig>(() => loadPcControls(undefined, profile.id))
  const [touchLayouts, setTouchLayouts] = useState<TouchLayoutByOrientation>(() =>
    loadLocalTouchLayouts(profile.id),
  )
  const [controlsSyncStatus, setControlsSyncStatus] = useState<ControlsSyncStatus>('local')
  const [defaultTouchOnDevice] = useState<boolean>(() => detectDefaultTouchMode())
  const [controlsModalOpen, setControlsModalOpen] = useState(false)
  const [touchEditorOpen, setTouchEditorOpen] = useState(false)
  const [rankingsOpen, setRankingsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [roomRequest, setRoomRequest] = useState<RoomJoinRequest | null>(null)
  const latestPcControlsRef = useRef(pcControls)
  const latestTouchLayoutsRef = useRef(touchLayouts)
  const dirtyControlsRef = useRef(false)

  const [createGameMode, setCreateGameMode] = useState<GameMode>('ffa')
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
    let active = true
    void loadAccountDeviceControls({
      client: supabase,
      accountId: profile.id,
      identity: deviceIdentity,
    }).then((result) => {
      if (!active || dirtyControlsRef.current) return
      latestPcControlsRef.current = result.pcControls
      latestTouchLayoutsRef.current = result.touchLayouts
      setPcControls(result.pcControls)
      setTouchLayouts(result.touchLayouts)
      setControlsSyncStatus(result.syncStatus)
    })
    return () => {
      active = false
    }
  }, [profile.id, deviceIdentity])

  const updatePcControls = useCallback(
    (next: PcControlConfig) => {
      dirtyControlsRef.current = true
      latestPcControlsRef.current = next
      setPcControls(next)
      void saveAccountDeviceControls({
        client: supabase,
        accountId: profile.id,
        identity: deviceIdentity,
        pcControls: next,
        touchLayouts: latestTouchLayoutsRef.current,
      }).then((nextStatus) => {
        setControlsSyncStatus(nextStatus)
      })
    },
    [profile.id, deviceIdentity],
  )

  const updateTouchLayouts = useCallback(
    (next: TouchLayoutByOrientation) => {
      dirtyControlsRef.current = true
      latestTouchLayoutsRef.current = next
      setTouchLayouts(next)
      void saveAccountDeviceControls({
        client: supabase,
        accountId: profile.id,
        identity: deviceIdentity,
        pcControls: latestPcControlsRef.current,
        touchLayouts: next,
      }).then((nextStatus) => {
        setControlsSyncStatus(nextStatus)
      })
    },
    [profile.id, deviceIdentity],
  )

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
        pcControls={pcControls}
        onPcControlsChange={updatePcControls}
        touchLayouts={touchLayouts}
        onTouchLayoutsChange={updateTouchLayouts}
        deviceLabel={deviceIdentity.deviceLabel}
        controlsSyncStatus={controlsSyncStatus}
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
      <div className="lobby-card is-main-menu">
        <header className="lobby-topbar">
          <div className="lobby-topbar-brand">
            <h1 className="lobby-title">TAP-WAR</h1>
            <div className="account-details">
              <ProfileAvatar profile={profile} />
              <p>
                <strong>{profile.username}</strong>
                <br />
                Listo para la arena
              </p>
            </div>
          </div>
          <div className="lobby-topbar-actions">
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
        </header>

        {(entryMessage || accountNotice || savedMessage) && (
          <div className="lobby-messages">
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
          </div>
        )}

        <div className="lobby-grid">
          <section className="lobby-panel lobby-loadout-panel" aria-label="Equipamiento del jugador">
            <h2 className="lobby-section-heading">Tu equipamiento</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void saveProfile()
              }}
            >
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
                          : weapon.explosionRadius
                            ? `${weapon.damage} área · ${weapon.maxAmmo}×2`
                            : `${weapon.pellets > 1 ? `${weapon.damage}×${weapon.pellets}` : weapon.damage} dmg · ${weapon.maxAmmo}×2`}
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
                  <button type="button" onClick={() => setControlsModalOpen(true)}>
                    Controles PC
                  </button>
                  <button type="button" onClick={() => setTouchEditorOpen(true)}>
                    Personalizar táctil
                  </button>
                </div>
              </fieldset>
            </form>
          </section>

          <section className="rooms-section lobby-rooms-panel" aria-label="Salas de juego">
            <h2 className="lobby-section-heading">Salas de juego</h2>

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
                        <strong>
                          {room.name}{' '}
                          <span className={`room-phase-tag is-${room.phase}`}>
                            {room.phase === 'playing' ? 'En curso' : 'En espera'}
                          </span>
                        </strong>
                        <span>
                          Código: {room.code} · {gameModeLabel(normalizeGameMode(room.gameMode))} ·{' '}
                          {ENVIRONMENT_OPTIONS.find(option => option.id === normalizeEnvironment(room.environment))?.label} ·{' '}
                          {MAP_LABEL_BY_SIZE[room.mapSize]} · {room.clients}/{room.maxClients}
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

              <span className="skin-grid-label">Modo de juego</span>
              <div className="room-mode-grid" role="radiogroup" aria-label="Modo de juego">
                {GAME_MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    role="radio"
                    aria-checked={createGameMode === mode.id}
                    className={`room-mode-option${createGameMode === mode.id ? ' is-selected' : ''}`}
                    onClick={() => setCreateGameMode(mode.id)}
                  >
                    <strong>{mode.label}</strong>
                    <span>{mode.description}</span>
                  </button>
                ))}
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
                    gameMode: createGameMode,
                    isPrivate: createPrivate,
                    roomName: createRoomName,
                  })
                }}
              >
                Crear sala
              </button>
            </div>
          </section>

          <section className="pc-controls-summary lobby-controls-panel" aria-label="Guía de controles">
            <div className="pc-controls-summary-head">
              <strong>Controles activos</strong>
              <span className="device-default-pill">
                {deviceIdentity.deviceLabel} · {defaultTouchOnDevice ? 'Táctil por defecto' : 'Teclado y ratón'}
              </span>
              <div className="pc-controls-summary-buttons">
                <button
                  type="button"
                  className="auth-text-button"
                  style={{ margin: 0, padding: '4px 10px', fontSize: '0.78rem' }}
                  onClick={() => setControlsModalOpen(true)}
                >
                  Controles PC
                </button>
                <button
                  type="button"
                  className="auth-text-button"
                  style={{ margin: 0, padding: '4px 10px', fontSize: '0.78rem' }}
                  onClick={() => setTouchEditorOpen(true)}
                >
                  Táctil
                </button>
              </div>
            </div>
            <div className="pc-controls-chips">
              <span><kbd>{formatMoveGroupLabel(pcControls)}</kbd> Mover</span>
              <span><kbd>{formatBindingLabel(pcControls.shoot)}</kbd> Disparar</span>
              <span><kbd>{formatBindingLabel(pcControls.melee)}</kbd> Melé</span>
              <span><kbd>{formatBindingLabel(pcControls.reload)}</kbd> Recargar</span>
              <span><kbd>{formatBindingLabel(pcControls.dash)}</kbd> Dash (1 cada 10s)</span>
              <span><kbd>{formatBindingLabel(pcControls.emote1)}</kbd> / <kbd>{formatBindingLabel(pcControls.emote2)}</kbd> Emotes</span>
              <span><kbd>Esc</kbd> Menú</span>
            </div>
            <p className="auth-hint" style={{ marginTop: 8 }}>
              Móvil / Tablet: joystick izquierdo; disparo estilo Brawl Stars con deadzone + botones DASH, MELÉ y REC a la derecha, reposicionables a tu gusto.{' '}
              {controlsSyncMessage(controlsSyncStatus, deviceIdentity.deviceLabel)}
            </p>
          </section>
        </div>
      </div>

      {controlsModalOpen && (
        <KeybindingsModal
          controls={pcControls}
          deviceLabel={deviceIdentity.deviceLabel}
          syncStatus={controlsSyncStatus}
          onChange={updatePcControls}
          onClose={() => setControlsModalOpen(false)}
        />
      )}

      {touchEditorOpen && (
        <TouchLayoutEditorModal
          layouts={touchLayouts}
          deviceLabel={deviceIdentity.deviceLabel}
          syncStatus={controlsSyncStatus}
          onSave={updateTouchLayouts}
          onClose={() => setTouchEditorOpen(false)}
        />
      )}
    </main>
  )
}
