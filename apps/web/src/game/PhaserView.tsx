import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import ArenaScene, {
  type ArenaControls,
  type BulletState,
  type CrosshairStyle,
  type MatchPhase,
  type PickupState,
  type PlayerState,
} from './ArenaScene'
import type { MapEnvironment, MapSize } from './arenaMaps'
import type { TouchInputState } from './TouchControls'
import arena from '../../../../packages/shared/arena.json'

type PhaserViewProps = {
  players: PlayerState[]
  bullets: BulletState[]
  pickups: PickupState[]
  phase: MatchPhase
  isPaused: boolean
  crosshairStyle: CrosshairStyle
  mapSize: MapSize
  environment: MapEnvironment
  touchMode: boolean
  touchInputRef: React.RefObject<TouchInputState>
  onMenuToggle?: () => void
  onGamepadChange?: (connected: boolean) => void
  resumeSignal: number
  controls: ArenaControls
}

export default function PhaserView({
  players,
  bullets,
  pickups,
  phase,
  isPaused,
  crosshairStyle,
  mapSize,
  environment,
  touchMode,
  touchInputRef,
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
  const latestPhaseRef = useRef(phase)
  const latestPausedRef = useRef(isPaused)
  const latestCrosshairRef = useRef(crosshairStyle)
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
    latestPhaseRef.current = phase
    sceneRef.current?.setPhase(phase)
  }, [phase])

  useEffect(() => {
    latestPausedRef.current = isPaused
    sceneRef.current?.setPaused(isPaused)
  }, [isPaused])

  useEffect(() => {
    latestCrosshairRef.current = crosshairStyle
    sceneRef.current?.setCrosshairStyle(crosshairStyle)
  }, [crosshairStyle])

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
    scene.setPhase(latestPhaseRef.current)
    scene.setPaused(latestPausedRef.current)
    scene.setCrosshairStyle(latestCrosshairRef.current)
    sceneRef.current = scene
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
      sceneRef.current = null
      active = false
      resizeObserver?.disconnect()
      scene.stopControls()
      game?.destroy(true)
    }
  }, [controls, mapSize, environment, touchInputRef])

  useEffect(() => {
    if (resumeSignal > 0) {
      sceneRef.current?.resume()
    }
  }, [resumeSignal])

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
}
