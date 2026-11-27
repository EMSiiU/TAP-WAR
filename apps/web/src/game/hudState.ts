import {
  GUN_GAME_LADDER,
  MAX_DASHES,
  normalizeEnvironment,
  normalizeGameMode,
  type GameMode,
  type MapEnvironment,
  type MapSize,
  type RoomJoinRequest,
} from './arenaMaps.ts'
import type { MatchPhase, PlayerSkin, PlayerState, TeamColor, WeaponType } from './ArenaScene.ts'

export type MatchMeta = {
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

export type LocalHudState = {
  team: TeamColor | ''
  teamColor: TeamColor
  skin: PlayerSkin
  weaponType: WeaponType
  weaponTier: number
  ammo: number
  maxAmmo: number
  reserveAmmo: number
  isReloading: boolean
  reloadPct: number
  dashes: number
  maxDashes: number
  dashRechargePct: number
  shield: number
  shieldRemaining: number
  goldenRemaining: number
  kills: number
}

export type ArenaHudSnapshot = {
  matchMeta: MatchMeta
  playerCount: number
  clock: string
  scoreLine: string
  localPlayer: LocalHudState | null
}

export type HudSourceState = {
  roomCode?: string
  roomName?: string
  mapSize?: string
  environment?: string
  gameMode?: string
  maxPlayers?: number
  isPrivate?: boolean
  hostId?: string
  notice?: string
  announcement?: string
  saveStatus?: string
  resultSummary?: string
  finishReason?: string
  phase?: MatchPhase
  isPaused?: boolean
  pausedByName?: string
  timeRemaining?: number
  killsToWin?: number
  orangeScore?: number
  blueScore?: number
  winnerId?: string
  winnerName?: string
  players?: ReadonlyMap<string, PlayerState>
}

export function formatClock(seconds: number): string {
  const total = Math.ceil(Math.max(0, seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function buildScoreLine(
  gameMode: GameMode,
  orangeScore: number,
  blueScore: number,
  players: readonly PlayerState[],
  localPlayer: PlayerState | undefined,
): string {
  if (gameMode === 'tdm') {
    return `Naranja ${orangeScore} — ${blueScore} Azul`
  }

  const leaders = [...players]
    .sort((a, b) =>
      gameMode === 'gungame'
        ? (b.weaponTier ?? 0) - (a.weaponTier ?? 0) || b.kills - a.kills || a.deaths - b.deaths
        : b.kills - a.kills || a.deaths - b.deaths,
    )
    .slice(0, 3)

  if (gameMode === 'gungame') {
    const topStr = leaders
      .map((p) => `${p.name} Nv.${Math.min(GUN_GAME_LADDER.length, (p.weaponTier ?? 0) + 1)}`)
      .join(' · ')
    const ownTier = Math.min(GUN_GAME_LADDER.length, (localPlayer?.weaponTier ?? 0) + 1)
    return `Top: ${topStr} | Tú: Nv.${ownTier}`
  }

  if (players.length <= 4) {
    return players.map((p) => `${p.name}: ${p.kills}`).join(' vs ')
  }
  return `Top: ${leaders.map((p) => `${p.name} ${p.kills}`).join(' · ')} | Tú: ${localPlayer?.kills ?? 0}`
}

export function createInitialHudSnapshot(roomRequest: RoomJoinRequest): ArenaHudSnapshot {
  const timeRemaining = 300
  const mapSize: MapSize =
    roomRequest.mode === 'create'
      ? roomRequest.maxPlayers === 20
        ? 'large'
        : roomRequest.maxPlayers === 10
          ? 'medium'
          : 'small'
      : 'small'
  const gameMode: GameMode =
    roomRequest.mode === 'create' ? normalizeGameMode(roomRequest.gameMode) : 'ffa'

  return {
    matchMeta: {
      roomCode: roomRequest.mode === 'join' ? roomRequest.code : '',
      roomName: roomRequest.mode === 'create' ? roomRequest.roomName : '',
      mapSize,
      environment:
        roomRequest.mode === 'create' ? normalizeEnvironment(roomRequest.environment) : 'desert',
      gameMode,
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
      timeRemaining,
      killsToWin: 20,
      orangeScore: 0,
      blueScore: 0,
      winnerId: '',
      winnerName: '',
    },
    playerCount: 0,
    clock: formatClock(timeRemaining),
    scoreLine: buildScoreLine(gameMode, 0, 0, [], undefined),
    localPlayer: null,
  }
}

export function extractArenaHudSnapshot(
  state: HudSourceState,
  localPlayerId: string,
  fallbackRoomId = '',
): ArenaHudSnapshot {
  const mapSize: MapSize =
    state.mapSize === 'medium' || state.mapSize === 'large' ? state.mapSize : 'small'
  const gameMode = normalizeGameMode(state.gameMode)
  const orangeScore = typeof state.orangeScore === 'number' ? state.orangeScore : 0
  const blueScore = typeof state.blueScore === 'number' ? state.blueScore : 0
  const wholeTime =
    typeof state.timeRemaining === 'number' ? Math.ceil(Math.max(0, state.timeRemaining)) : 300

  const playerList = state.players ? Array.from(state.players.values()) : []
  const local = state.players?.get(localPlayerId) ?? playerList.find((p) => p.id === localPlayerId)

  const localPlayer: LocalHudState | null = local
    ? {
        team: local.team === 'blue' || local.team === 'orange' ? local.team : '',
        teamColor:
          local.team === 'blue' ||
          local.teamColor === 'blue' ||
          local.skin === 'mouse' ||
          local.skin === 'rabbit'
            ? 'blue'
            : 'orange',
        skin: local.skin,
        weaponType: local.weaponType,
        weaponTier: local.weaponTier ?? 0,
        ammo: local.ammo ?? 0,
        maxAmmo: local.maxAmmo ?? 0,
        reserveAmmo: local.reserveAmmo ?? 0,
        isReloading: Boolean(local.isReloading),
        reloadPct: Math.round((local.reloadProgress ?? 0) * 100),
        dashes: local.dashes ?? MAX_DASHES,
        maxDashes: local.maxDashes ?? MAX_DASHES,
        dashRechargePct: Math.round((local.dashRechargeProgress ?? 0) * 100),
        shield: local.shield ?? 0,
        shieldRemaining: local.shieldRemaining ?? 0,
        goldenRemaining: local.goldenRemaining ?? 0,
        kills: local.kills ?? 0,
      }
    : null

  return {
    matchMeta: {
      roomCode: state.roomCode || fallbackRoomId,
      roomName: state.roomName ?? '',
      mapSize,
      environment: normalizeEnvironment(state.environment),
      gameMode,
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
      timeRemaining: wholeTime,
      killsToWin: typeof state.killsToWin === 'number' ? state.killsToWin : 20,
      orangeScore,
      blueScore,
      winnerId: state.winnerId ?? '',
      winnerName: state.winnerName ?? '',
    },
    playerCount: playerList.length,
    clock: formatClock(wholeTime),
    scoreLine: buildScoreLine(gameMode, orangeScore, blueScore, playerList, local),
    localPlayer,
  }
}

function areLocalHudEqual(a: LocalHudState | null, b: LocalHudState | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.team === b.team &&
    a.teamColor === b.teamColor &&
    a.skin === b.skin &&
    a.weaponType === b.weaponType &&
    a.weaponTier === b.weaponTier &&
    a.ammo === b.ammo &&
    a.maxAmmo === b.maxAmmo &&
    a.reserveAmmo === b.reserveAmmo &&
    a.isReloading === b.isReloading &&
    a.reloadPct === b.reloadPct &&
    a.dashes === b.dashes &&
    a.maxDashes === b.maxDashes &&
    a.dashRechargePct === b.dashRechargePct &&
    a.shield === b.shield &&
    a.shieldRemaining === b.shieldRemaining &&
    a.goldenRemaining === b.goldenRemaining &&
    a.kills === b.kills
  )
}

export function areHudSnapshotsEqual(a: ArenaHudSnapshot, b: ArenaHudSnapshot): boolean {
  if (a === b) return true
  if (
    a.playerCount !== b.playerCount ||
    a.clock !== b.clock ||
    a.scoreLine !== b.scoreLine ||
    !areLocalHudEqual(a.localPlayer, b.localPlayer)
  ) {
    return false
  }
  const ma = a.matchMeta
  const mb = b.matchMeta
  return (
    ma.roomCode === mb.roomCode &&
    ma.roomName === mb.roomName &&
    ma.mapSize === mb.mapSize &&
    ma.environment === mb.environment &&
    ma.gameMode === mb.gameMode &&
    ma.maxPlayers === mb.maxPlayers &&
    ma.isPrivate === mb.isPrivate &&
    ma.hostId === mb.hostId &&
    ma.notice === mb.notice &&
    ma.announcement === mb.announcement &&
    ma.saveStatus === mb.saveStatus &&
    ma.resultSummary === mb.resultSummary &&
    ma.finishReason === mb.finishReason &&
    ma.phase === mb.phase &&
    ma.isPaused === mb.isPaused &&
    ma.pausedByName === mb.pausedByName &&
    ma.timeRemaining === mb.timeRemaining &&
    ma.killsToWin === mb.killsToWin &&
    ma.orangeScore === mb.orangeScore &&
    ma.blueScore === mb.blueScore &&
    ma.winnerId === mb.winnerId &&
    ma.winnerName === mb.winnerName
  )
}
