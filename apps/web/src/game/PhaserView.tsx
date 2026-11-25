import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import ArenaScene, {
  type ArenaActionKind,
  type ArenaControls,
  type BulletState,
  type CrosshairStyle,
  type MatchPhase,
  type PickupState,
  type PlayerState,
  type PowerUpState,
} from './ArenaScene'
import type { GameMode, MapEnvironment, MapSize } from './arenaMaps'
import type { PcControlConfig } from './keybindings'
import type { TouchInputState } from './TouchControls'
import arena from '../../../../packages/shared/arena.json'

type PhaserViewProps = {
  players: PlayerState[]
  bullets: BulletState[]
  pickups: PickupState[]
  powerUps: PowerUpState[]
  phase: MatchPhase
  gameMode: GameMode
  isPaused: boolean
  crosshairStyle: CrosshairStyle
  pcControls: PcControlConfig
  mapSize: MapSize
  environment: MapEnvironment
  touchMode: boolean
  touchInputRef: React.RefObject<TouchInputState>
  actionTriggerRef?: React.RefObject<((action: ArenaActionKind) => void) | null>
  explosionTriggerRef?: React.RefObject<((x: number, y: number, radius: number) => void) | null>
  onMenuToggle?: () => void
  onGamepadChange?: (connected: boolean) => void
  resumeSignal: number
  controls: ArenaControls
}

export default function PhaserView({
  players,
  bullets,
  pickups,
  powerUps,
  phase,
  gameMode,
  isPaused,
  crosshairStyle,
  pcControls,
  mapSize,
  environment,
  touchMode,
  touchInputRef,
  actionTriggerRef,
  explosionTriggerRef,
  onMenuToggle,
  onGamepadChange,
  resumeSignal,
  controls,
}: PhaserViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ArenaScene | null>(null)
  const latestPlayersRef = useRef(players)
  const latestBulletsRef = useRef(bullets)
  const latestPickupsRef = useRef(pickups)
  const latestPowerUpsRef = useRef(powerUps)
  const latestPhaseRef = useRef(phase)
  const latestGameModeRef = useRef(gameMode)
  const latestPausedRef = useRef(isPaused)
  const latestCrosshairRef = useRef(crosshairStyle)
  const latestPcControlsRef = useRef(pcControls)
  const latestTouchModeRef = useRef(touchMode)
  const onMenuToggleRef = useRef(onMenuToggle)
  const onGamepadChangeRef = useRef(onGamepadChange)

  useEffect(() => {
    onMenuToggleRef.current = onMenuToggle
  }, [onMenuToggle])

  useEffect(() => {
    onGamepadChangeRef.current = onGamepadChange
  }, [onGamepadChange])

  useEffect(() => {
    latestPlayersRef.current = players
    sceneRef.current?.setPlayers(players)
  }, [players])

  useEffect(() => {
    latestBulletsRef.current = bullets
    sceneRef.current?.setBullets(bullets)
  }, [bullets])

  useEffect(() => {
    latestPickupsRef.current = pickups
    sceneRef.current?.setPickups(pickups)
  }, [pickups])

  useEffect(() => {
    latestPowerUpsRef.current = powerUps
    sceneRef.current?.setPowerUps(powerUps)
  }, [powerUps])

  useEffect(() => {
    latestPhaseRef.current = phase
    sceneRef.current?.setPhase(phase)
  }, [phase])

  useEffect(() => {
    latestGameModeRef.current = gameMode
    sceneRef.current?.setGameMode(gameMode)
  }, [gameMode])

  useEffect(() => {
    latestPausedRef.current = isPaused
    sceneRef.current?.setPaused(isPaused)
  }, [isPaused])

  useEffect(() => {
    latestCrosshairRef.current = crosshairStyle
    sceneRef.current?.setCrosshairStyle(crosshairStyle)
  }, [crosshairStyle])

  useEffect(() => {
    latestPcControlsRef.current = pcControls
    sceneRef.current?.setPcControls(pcControls)
  }, [pcControls])

  useEffect(() => {
    latestTouchModeRef.current = touchMode
    sceneRef.current?.setTouchMode(touchMode)
  }, [touchMode])

  useEffect(() => {
    const parent = hostRef.current
    if (!parent) return

    const scene = new ArenaScene(
      controls,
      mapSize,
      latestTouchModeRef.current,
      () => touchInputRef.current,
      () => onMenuToggleRef.current?.(),
      (connected) => onGamepadChangeRef.current?.(connected),
      environment,
    )
    scene.setPlayers(latestPlayersRef.current)
    scene.setBullets(latestBulletsRef.current)
    scene.setPickups(latestPickupsRef.current)
    scene.setPowerUps(latestPowerUpsRef.current)
    scene.setPhase(latestPhaseRef.current)
    scene.setGameMode(latestGameModeRef.current)
    scene.setPaused(latestPausedRef.current)
    scene.setCrosshairStyle(latestCrosshairRef.current)
    scene.setPcControls(latestPcControlsRef.current)
    sceneRef.current = scene
    if (actionTriggerRef) {
      actionTriggerRef.current = (action) => scene.triggerAction(action)
    }
    if (explosionTriggerRef) {
      explosionTriggerRef.current = (x, y, radius) => scene.triggerExplosion(x, y, radius)
    }

    let game: Phaser.Game | undefined
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            game?.scale.refresh()
          })
        : undefined
    resizeObserver?.observe(parent)

    let active = true
    queueMicrotask(() => {
      if (!active) return

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: arena.width,
        height: arena.height,
        backgroundColor: '#2b2038',
        pixelArt: true,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: arena.width,
          height: arena.height,
        },
        scene: [scene],
      })
    })

    return () => {
      if (actionTriggerRef) actionTriggerRef.current = null
      if (explosionTriggerRef) explosionTriggerRef.current = null
      sceneRef.current = null
      active = false
      resizeObserver?.disconnect()
      scene.stopControls()
      game?.destroy(true)
    }
  }, [controls, mapSize, environment, touchInputRef, actionTriggerRef, explosionTriggerRef])

  useEffect(() => {
    if (resumeSignal > 0) {
      sceneRef.current?.resume()
    }
  }, [resumeSignal])

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
}
