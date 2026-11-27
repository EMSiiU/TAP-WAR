import MatchResults, { type MatchResultRow } from './game/MatchResults'
import ArenaHeader from './game/ArenaHeader'
import MapPreview from './game/MapPreview'
import KeybindingsModal from './game/KeybindingsModal'
import TouchLayoutEditorModal from './game/TouchLayoutEditorModal'
import PracticeArsenalModal, { type PracticeUtilityAction } from './game/PracticeArsenalModal'
import LiveScoreboard from './game/LiveScoreboard'
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
  ArenaWorldSnapshot,
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
import {
  areHudSnapshotsEqual,
  createInitialHudSnapshot,
  extractArenaHudSnapshot,
  type ArenaHudSnapshot,
} from './game/hudState'

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
  const [hud, setHud] = useState<ArenaHudSnapshot>(() => createInitialHudSnapshot(roomRequest))
  const hudRef = useRef<ArenaHudSnapshot | null>(null)
  const worldStateRef = useRef<ArenaWorldSnapshot>({
    players: [],
    bullets: [],
    pickups: [],
    powerUps: [],
  })
  const worldPushRef = useRef<((snapshot: ArenaWorldSnapshot) => void) | null>(null)
  const [localPaused, setLocalPaused] = useState(false)
  const [practiceArsenalOpen, setPracticeArsenalOpen] = useState(false)
  const [scoreboardHeld, setScoreboardHeld] = useState(false)
  const [scoreboardToggled, setScoreboardToggled] = useState(false)
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
  const damageFeedbackTriggerRef = useRef<
    ((x: number, y: number, damage: number, blocked: boolean) => void) | null
  >(null)
  const practiceActionRef = useRef<
    ((payload: { action: 'equip_weapon'; weapon: WeaponType } | { action: PracticeUtilityAction }) => void) | null
  >(null)
  const startRef = useRef<(() => void) | null>(null)
  const [resumeSignal, setResumeSignal] = useState(0)
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
    if (!touchMode || localPaused || hud.matchMeta.phase === 'finished') resetTouchInput()
  }, [touchMode, localPaused, hud.matchMeta.phase, resetTouchInput])

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
        practiceActionRef.current = (payload) => {
          if (joined.connection.isOpen) joined.send('practice_action', payload)
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

        joined.onMessage<{ x?: unknown; y?: unknown; damage?: unknown; blocked?: unknown }>(
          'damage_feedback',
          (payload) => {
            if (
              active &&
              payload &&
              typeof payload.x === 'number' &&
              typeof payload.y === 'number' &&
              typeof payload.damage === 'number' &&
              typeof payload.blocked === 'boolean' &&
              Number.isFinite(payload.x) &&
              Number.isFinite(payload.y) &&
              Number.isFinite(payload.damage)
            ) {
              damageFeedbackTriggerRef.current?.(payload.x, payload.y, payload.damage, payload.blocked)
            }
          },
        )

        let markedReady = false

        function syncState(state: ArenaState) {
          if (!active || !state || !state.roomCode) return

          const snapshot: ArenaWorldSnapshot = {
            players: state.players ? Array.from(state.players.values()) : [],
            bullets: state.bullets ? Array.from(state.bullets.values()) : [],
            pickups: state.pickups ? Array.from(state.pickups.values()) : [],
            powerUps: state.powerUps ? Array.from(state.powerUps.values()) : [],
          }
          worldStateRef.current = snapshot
          worldPushRef.current?.(snapshot)

          const nextHud = extractArenaHudSnapshot(state, joined.sessionId, joined.roomId)
          if (!hudRef.current || !areHudSnapshotsEqual(hudRef.current, nextHud)) {
            hudRef.current = nextHud
            setHud(nextHud)
          }

          if (!markedReady) {
            markedReady = true
            setStateReady(true)
          }
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
            setPracticeArsenalOpen(false)
            setScoreboardHeld(false)
            setScoreboardToggled(false)
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
      practiceActionRef.current = null
      disconnect?.()
    }
  }, [playerName, playerSkin, playerWeapon, roomRequest, onEnd])

  const closePracticeArsenal = useCallback(() => {
    setPracticeArsenalOpen(false)
    setResumeSignal((n) => n + 1)
  }, [])

  const togglePracticeArsenal = useCallback(() => {
    if (hud.matchMeta.gameMode !== 'practice' || hud.matchMeta.phase === 'finished') return
    setControlsModalOpen(false)
    setTouchEditorOpen(false)
    setLocalPaused(false)
    setScoreboardHeld(false)
    setScoreboardToggled(false)
    setPracticeArsenalOpen((prev) => {
      const next = !prev
      if (!next) setResumeSignal((n) => n + 1)
      return next
    })
  }, [hud.matchMeta.gameMode, hud.matchMeta.phase])

  const tabBoundInControls = Object.values(pcControls).includes('Tab')
  useEffect(() => {
    const canHoldTab = Boolean(
      controls &&
      hud.matchMeta.phase !== 'finished' &&
      !localPaused &&
      !practiceArsenalOpen &&
      !tabBoundInControls,
    )
    if (!canHoldTab) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Tab') {
        event.preventDefault()
        if (!event.repeat) setScoreboardHeld(true)
      } else if (event.code === 'Escape' && scoreboardToggled && !event.repeat) {
        event.preventDefault()
        event.stopPropagation()
        setScoreboardToggled(false)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Tab') {
        event.preventDefault()
        setScoreboardHeld(false)
      }
    }
    const clearHeld = () => setScoreboardHeld(false)

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', clearHeld)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', clearHeld)
    }
  }, [controls, hud.matchMeta.phase, localPaused, practiceArsenalOpen, tabBoundInControls, scoreboardToggled])

  const toggleScoreboard = useCallback(() => {
    if (!controls || hud.matchMeta.phase === 'finished') return
    setScoreboardHeld(false)
    setScoreboardToggled((prev) => !prev)
  }, [controls, hud.matchMeta.phase])

  const scoreboardVisible = Boolean(
    controls &&
    hud.matchMeta.phase !== 'finished' &&
    !localPaused &&
    !practiceArsenalOpen &&
    (scoreboardHeld || scoreboardToggled),
  )

  const localHud = hud.localPlayer
  const localTeam = localHud?.team

  useEffect(() => {
    if (hud.matchMeta.phase !== 'finished' || !hud.matchMeta.winnerId) return
    const localWon =
      hud.matchMeta.gameMode === 'tdm'
        ? Boolean(localTeam && hud.matchMeta.winnerId === `team:${localTeam}`)
        : hud.matchMeta.winnerId === controls?.playerId
    if (!localWon) {
      const audio = new Audio('/assets/sounds/lose-a.ogg')
      audio.volume = 0.55
      audio.play().catch(() => {})
    }
  }, [hud.matchMeta.phase, hud.matchMeta.winnerId, hud.matchMeta.gameMode, controls?.playerId, localTeam])

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
    if (!hud.matchMeta.roomCode) return
    try {
      await navigator.clipboard.writeText(hud.matchMeta.roomCode)
      setCopiedCode(true)
      window.setTimeout(() => setCopiedCode(false), 1800)
    } catch {
      // Sin permiso de portapapeles.
    }
  }

  const finalPlayers: MatchResultRow[] = hud.matchMeta.resultSummary ? JSON.parse(hud.matchMeta.resultSummary) : []
  const sortedPlayers = [...finalPlayers].sort((a, b) => {
    if (hud.matchMeta.gameMode === 'gungame') {
      return (b.weaponTier ?? 0) - (a.weaponTier ?? 0) || b.kills - a.kills || a.deaths - b.deaths
    }
    if (hud.matchMeta.gameMode === 'tdm') {
      const rank = (o: string) => (o === 'win' ? 2 : o === 'draw' ? 1 : 0)
      return rank(b.outcome) - rank(a.outcome) || b.kills - a.kills || a.deaths - b.deaths
    }
    return b.kills - a.kills || a.deaths - b.deaths
  })

  const localWeaponSpec = localHud ? WEAPON_BY_ID[localHud.weaponType] : undefined
  const localTeamColor: TeamColor = localHud?.teamColor ?? 'orange'
  const localAmmo = localHud?.ammo ?? 0
  const localMaxAmmo = localHud?.maxAmmo ?? localWeaponSpec?.maxAmmo ?? 0
  const localReserveAmmo = localHud?.reserveAmmo ?? 0
  const localReloading = Boolean(localHud?.isReloading)
  const localReloadPct = localHud?.reloadPct ?? 0
  const localDashes = localHud?.dashes ?? MAX_DASHES
  const localMaxDashes = localHud?.maxDashes ?? MAX_DASHES
  const localDashRechargePct = localHud?.dashRechargePct ?? 0
  const localShield = localHud?.shield ?? 0
  const localShieldSec = localHud?.shieldRemaining ?? 0
  const localGoldenSec = localHud?.goldenRemaining ?? 0
  const isGolden = localGoldenSec > 0
  const isLocalFirearm = Boolean(localWeaponSpec && !localWeaponSpec.isMelee && localMaxAmmo > 0)
  const canReload = isLocalFirearm && !isGolden && !localReloading && localAmmo < localMaxAmmo && localReserveAmmo > 0
  const needsReload = isLocalFirearm && !isGolden && !localReloading && localAmmo === 0 && localReserveAmmo > 0
  const isLowAmmo = isLocalFirearm && !isGolden && localAmmo <= Math.ceil(localMaxAmmo * 0.25)
  const ammoIconSrc =
    localHud?.weaponType === 'shotgun' ? '/assets/ui/icon-shell.png' : '/assets/ui/icon-bullet.png'
  const finishReason =
    (
      {
        time: 'Tiempo agotado',
        kills:
          hud.matchMeta.gameMode === 'gungame'
            ? 'Todas las armas completadas'
            : hud.matchMeta.gameMode === 'tdm'
              ? `Meta de ${hud.matchMeta.killsToWin} bajas de equipo alcanzada`
              : `Meta de ${hud.matchMeta.killsToWin} kills alcanzada`,
        abandon: 'Victoria por abandono',
        interrupted: 'Partida interrumpida',
      } as Record<string, string>
    )[hud.matchMeta.finishReason] || ''
  const saveMessage = (
    {
      saving: 'Guardando resultado…',
      saved: 'Resultado guardado. Ya cuenta para el ranking.',
      pending: 'Guardado pendiente. El servidor reintentará automáticamente.',
      failed:
        'No se pudo guardar el archivo de resultados. Revisa el disco del servidor; la revancha está bloqueada.',
    } as Record<string, string>
  )[hud.matchMeta.saveStatus]
  const showTouchControls = Boolean(
    controls && touchMode && !localPaused && !practiceArsenalOpen && hud.matchMeta.phase !== 'finished',
  )
  const resultsTitle =
    hud.matchMeta.gameMode === 'tdm'
      ? finalPlayers.some((p) => p.outcome === 'draw')
        ? 'Empate entre equipos'
        : hud.matchMeta.winnerName
          ? `Ganador: ${hud.matchMeta.winnerName}`
          : 'Partida interrumpida'
      : finalPlayers.filter((p) => p.outcome === 'draw').length > 1
        ? `Empate: ${hud.matchMeta.winnerName}`
        : hud.matchMeta.winnerName
          ? `Ganador: ${hud.matchMeta.winnerName}`
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
        roomCode={hud.matchMeta.roomCode}
        roomName={hud.matchMeta.roomName}
        isPrivate={hud.matchMeta.isPrivate}
        hideRoomCode={hud.matchMeta.gameMode === 'practice'}
        gameModeLabel={gameModeLabel(hud.matchMeta.gameMode)}
        environmentLabel={ENVIRONMENT_OPTIONS.find(option => option.id === hud.matchMeta.environment)?.label || ''}
        sizeLabel={MAP_LABEL_BY_SIZE[hud.matchMeta.mapSize]}
        playerCount={hud.playerCount}
        maxPlayers={hud.matchMeta.maxPlayers}
        clock={hud.clock}
        scoreLine={hud.scoreLine}
        killsToWin={hud.matchMeta.killsToWin}
        targetLabel={hud.matchMeta.gameMode === 'gungame' ? 'Armas' : 'Meta'}
        status={status}
        connected={Boolean(controls)}
        gamepadConnected={gamepadConnected}
        touchMode={touchMode}
        fullscreen={isFullscreen}
        copied={copiedCode}
        scoreboardOpen={scoreboardVisible}
        onCopy={() => { void copyRoomCode() }}
        onTouchToggle={() => { resetTouchInput(); setTouchMode(value => !value) }}
        onFullscreen={() => { void toggleFullscreen() }}
        onToggleScoreboard={controls && hud.matchMeta.phase !== 'finished' ? toggleScoreboard : undefined}
        onExit={onExit}
        onSignOut={onSignOut}
      />

      <div className={`arena-stage${showTouchControls ? ' has-touch-controls' : ''}`}>
        {controls && hud.matchMeta.phase === 'waiting' && (
          <div className="arena-waiting-banner" role="status">
            <span>
              Sala <strong>{hud.matchMeta.roomName || hud.matchMeta.roomCode}</strong> ·{' '}
              <strong>{gameModeLabel(hud.matchMeta.gameMode)}</strong> · Código:{' '}
              <strong>{hud.matchMeta.roomCode}</strong> ({hud.playerCount}/{hud.matchMeta.maxPlayers}) ·{' '}
              {hud.playerCount < 2
                ? 'Se necesitan al menos dos jugadores.'
                : 'Esperando al anfitrión para iniciar.'}
            </span>
            {controls.playerId === hud.matchMeta.hostId && (
              <button
                type="button"
                className="arena-mini-btn is-primary"
                disabled={hud.playerCount < 2}
                onClick={() => startRef.current?.()}
              >
                Iniciar partida
              </button>
            )}
            {hud.matchMeta.notice && <p role="alert">{hud.matchMeta.notice}</p>}
          </div>
        )}

        {controls && hud.matchMeta.phase === 'playing' && hud.matchMeta.announcement && (
          <div className="arena-announcement-banner" role="status">
            <img src="/assets/ui/powerup-golden.svg" alt="" className="arena-announcement-icon" />
            <span>{hud.matchMeta.announcement}</span>
          </div>
        )}

        <div className="arena-viewport"><div className="arena-canvas-wrap">
          {controls && localWeaponSpec && localHud && (
            <div className="arena-hud-bottom" role="status">
              <div className="arena-hud-badges-row">
                {hud.matchMeta.gameMode === 'tdm' && localHud.team && (
                  <span className={`arena-status-pill is-team-${localHud.team}`}>
                    {touchMode
                      ? localHud.team === 'blue'
                        ? 'Azul'
                        : 'Naranja'
                      : localHud.team === 'blue'
                        ? 'Equipo Azul'
                        : 'Equipo Naranja'}
                  </span>
                )}
                {hud.matchMeta.gameMode === 'gungame' && (
                  <span className="arena-status-pill is-gungame">
                    {touchMode ? 'Nv.' : 'Nivel '}
                    {Math.min(GUN_GAME_LADDER.length, (localHud.weaponTier ?? 0) + 1)}/{GUN_GAME_LADDER.length}
                  </span>
                )}
                {isGolden && (
                  <span
                    className="arena-status-pill is-golden"
                    aria-label={`Poder dorado ${localGoldenSec}s, munición infinita`}
                    title={`Dorado ${localGoldenSec}s · Munición ∞`}
                  >
                    <img src="/assets/ui/powerup-golden.svg" alt="" />
                    <span>{touchMode ? `${localGoldenSec}s` : `DORADO ${localGoldenSec}s · Munición ∞`}</span>
                  </span>
                )}
                {localShield > 0 && localShieldSec > 0 && (
                  <span
                    className="arena-status-pill is-shield"
                    aria-label={`Escudo ${localShieldSec}s`}
                    title={`Escudo ${localShieldSec}s`}
                  >
                    <img src="/assets/ui/powerup-shield.svg" alt="" />
                    <span>{touchMode ? `${localShieldSec}s` : `Escudo ${localShieldSec}s`}</span>
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
                              style={{ width: `${localReloadPct}%` }}
                            />
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <img
                        src={`/assets/weapons/weapon-${localHud.weaponType}-${localTeamColor}.png`}
                        alt={localWeaponSpec.name}
                        className="arena-melee-icon"
                      />
                      <span>{localWeaponSpec.name} · Melé</span>
                    </>
                  )}
                </div>

                {!touchMode && (
                  <div
                    className={`arena-dash-badge${localDashes <= 0 ? ' is-empty' : ''}`}
                    title={`Dash (${dashKeyLabel}) · recarga 1 cada 10 s`}
                  >
                    <img src="/assets/ui/powerup-dash.svg" alt="" className="arena-dash-icon" />
                    <div className="arena-dash-info">
                      <span className="arena-dash-label">
                        DASH {localDashes}/{localMaxDashes}
                        <kbd className="hud-kbd">{dashKeyLabel}</kbd>
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
                            ? `Recarga de dash ${localDashRechargePct}%`
                            : 'Dashes completos'
                        }
                      >
                        <span
                          className={`arena-dash-recharge-fill${localDashes >= localMaxDashes ? ' is-full' : ''}`}
                          style={{
                            width: `${localDashes >= localMaxDashes ? 100 : localDashRechargePct}%`,
                          }}
                        />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {controls && !touchMode && hud.matchMeta.phase === 'waiting' && (
            <div className="arena-pc-legend" aria-label="Leyenda de controles de PC">
              <span><kbd>{moveKeysLabel}</kbd> Mover</span>
              <span><kbd>{shootKeyLabel}</kbd> Disparar</span>
              <span><kbd>{meleeKeyLabel}</kbd> Melé</span>
              <span><kbd>{reloadKeyLabel}</kbd> Recargar</span>
              <span><kbd>{dashKeyLabel}</kbd> Dash</span>
              <span><kbd>{emote1KeyLabel}/{emote2KeyLabel}</kbd> Emotes</span>
              <span><kbd>Tab</kbd> Marcador</span>
              <span><kbd>Esc</kbd> Menú</span>
            </div>
          )}

          {controls && hud.matchMeta.gameMode === 'practice' && hud.matchMeta.phase === 'playing' && (
            <button
              type="button"
              className="arena-practice-fab"
              onClick={togglePracticeArsenal}
              title="Abrir arsenal de práctica (B)"
            >
              <span>Arsenal</span>
              {!touchMode && <kbd>B</kbd>}
            </button>
          )}

          {controls && stateReady && (
            <PhaserView
              worldStateRef={worldStateRef}
              worldPushRef={worldPushRef}
              phase={hud.matchMeta.phase}
              gameMode={hud.matchMeta.gameMode}
              isPaused={localPaused || practiceArsenalOpen}
              crosshairStyle={crosshairStyle}
              pcControls={pcControls}
              mapSize={hud.matchMeta.mapSize}
              environment={hud.matchMeta.environment}
              touchMode={touchMode}
              touchInputRef={touchInputRef}
              actionTriggerRef={actionTriggerRef}
              explosionTriggerRef={explosionTriggerRef}
              damageFeedbackTriggerRef={damageFeedbackTriggerRef}
              onMenuToggle={() => { resetTouchInput(); setLocalPaused(prev => !prev) }}
              onPracticeArsenalToggle={togglePracticeArsenal}
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
            dashRechargeProgress={localDashRechargePct / 100}
            canReload={canReload}
            isReloading={localReloading}
            needsReload={needsReload}
            scoreboardOpen={scoreboardVisible}
            onToggleScoreboard={toggleScoreboard}
          />
        )}

        {scoreboardVisible && (
          <LiveScoreboard
            roomName={hud.matchMeta.roomName || hud.matchMeta.roomCode}
            gameMode={hud.matchMeta.gameMode}
            clock={hud.clock}
            killsToWin={hud.matchMeta.killsToWin}
            orangeScore={hud.matchMeta.orangeScore}
            blueScore={hud.matchMeta.blueScore}
            rows={hud.scoreboard}
            interactive={scoreboardToggled && !scoreboardHeld}
            onClose={() => setScoreboardToggled(false)}
          />
        )}

        {localPaused && hud.matchMeta.phase !== 'finished' && !controlsModalOpen && !touchEditorOpen && (
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
                {hud.matchMeta.gameMode === 'practice' && (
                  <button
                    type="button"
                    className="kenney-btn-secondary"
                    onClick={() => {
                      setLocalPaused(false)
                      setControlsModalOpen(false)
                      setTouchEditorOpen(false)
                      setPracticeArsenalOpen(true)
                    }}
                  >
                    Arsenal de práctica
                  </button>
                )}
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

        {hud.matchMeta.phase === 'finished' && (
          <MatchResults
            title={resultsTitle}
            reason={finishReason}
            saveMessage={saveMessage}
            players={sortedPlayers}
            gameMode={hud.matchMeta.gameMode}
            rematchDisabled={controls?.playerId !== hud.matchMeta.hostId || ['saving', 'failed'].includes(hud.matchMeta.saveStatus)}
            onRematch={() => rematchRef.current?.()}
            onExit={onExit}
          />
        )}
      </div>

      {localPaused && controlsModalOpen && hud.matchMeta.phase !== 'finished' && (
        <KeybindingsModal
          controls={pcControls}
          deviceLabel={deviceLabel}
          syncStatus={controlsSyncStatus}
          onChange={onPcControlsChange}
          onClose={() => setControlsModalOpen(false)}
        />
      )}

      {localPaused && touchEditorOpen && hud.matchMeta.phase !== 'finished' && (
        <TouchLayoutEditorModal
          layouts={touchLayouts}
          deviceLabel={deviceLabel}
          syncStatus={controlsSyncStatus}
          onSave={onTouchLayoutsChange}
          onClose={() => setTouchEditorOpen(false)}
        />
      )}

      {practiceArsenalOpen && hud.matchMeta.gameMode === 'practice' && hud.matchMeta.phase !== 'finished' && (
        <PracticeArsenalModal
          weapons={WEAPON_OPTIONS}
          currentWeapon={localHud?.weaponType}
          teamColor={localTeamColor}
          onSelectWeapon={(weapon) => {
            practiceActionRef.current?.({ action: 'equip_weapon', weapon })
          }}
          onAction={(action) => {
            practiceActionRef.current?.({ action })
          }}
          onClose={closePracticeArsenal}
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

            <div className="rooms-panel practice-lobby-card">
              <div className="practice-lobby-head">
                <div>
                  <span className="skin-grid-label" style={{ marginBottom: 4 }}>
                    Campo de tiro
                  </span>
                  <p className="practice-lobby-desc">
                    Entrena movimiento, dashes, las 10 armas, todos los power-ups y daño real sobre 4 NPCs sin afectar estadísticas.
                  </p>
                </div>
                <span className="practice-lobby-badge">1 jugador · Práctica</span>
              </div>
              <div className="practice-lobby-controls">
                <div className="practice-env-pills" role="radiogroup" aria-label="Escenario del campo de tiro">
                  {ENVIRONMENT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={createEnvironment === option.id}
                      className={`crosshair-option practice-env-pill${createEnvironment === option.id ? ' is-selected' : ''}`}
                      onClick={() => setCreateEnvironment(option.id)}
                    >
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="kenney-btn-primary practice-enter-btn"
                  disabled={!validUsername(profile.username ?? '') || saving}
                  onClick={() => {
                    void saveProfile({
                      mode: 'create',
                      maxPlayers: 4,
                      environment: createEnvironment,
                      gameMode: 'practice',
                      isPrivate: true,
                      roomName: 'Campo de tiro',
                    })
                  }}
                >
                  Entrar al Campo de tiro
                </button>
              </div>
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
              <span><kbd>Tab</kbd> Marcador</span>
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
