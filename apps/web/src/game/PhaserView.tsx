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
import type { MapSize } from './arenaMaps'
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
  touchMode,
  touchInputRef,
  onMenuToggle,
  onGamepadChange,
  resumeSignal,
  controls,
}: PhaserViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ArenaScene | null>(null)
  const initialMapSizeRef = useRef(mapSize)
  const initialTouchModeRef = useRef(touchMode)
  const onMenuToggleRef = useRef(onMenuToggle)
  const onGamepadChangeRef = useRef(onGamepadChange)

  useEffect(() => {
    onMenuToggleRef.current = onMenuToggle
  }, [onMenuToggle])

  useEffect(() => {
    onGamepadChangeRef.current = onGamepadChange
  }, [onGamepadChange])

  useEffect(() => {
    const parent = hostRef.current
    if (!parent) return

    const scene = new ArenaScene(
      controls,
      initialMapSizeRef.current,
      initialTouchModeRef.current,
      () => touchInputRef.current,
      () => onMenuToggleRef.current?.(),
      (connected) => onGamepadChangeRef.current?.(connected),
    )
    sceneRef.current = scene
    let game: Phaser.Game | undefined

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
      scene.stopControls()
      game?.destroy(true)
    }
  }, [controls, mapSize, touchInputRef])

  useEffect(() => {
    initialMapSizeRef.current = mapSize
  }, [mapSize])

  useEffect(() => {
    sceneRef.current?.setPlayers(players)
  }, [players])

  useEffect(() => {
    sceneRef.current?.setBullets(bullets)
  }, [bullets])

  useEffect(() => {
    sceneRef.current?.setPickups(pickups)
  }, [pickups])

  useEffect(() => {
    sceneRef.current?.setPhase(phase)
  }, [phase])

  useEffect(() => {
    sceneRef.current?.setPaused(isPaused)
  }, [isPaused])

  useEffect(() => {
    sceneRef.current?.setCrosshairStyle(crosshairStyle)
  }, [crosshairStyle])

  useEffect(() => {
    initialTouchModeRef.current = touchMode
    sceneRef.current?.setTouchMode(touchMode)
  }, [touchMode])

  useEffect(() => {
    if (resumeSignal > 0) {
      sceneRef.current?.resume()
    }
  }, [resumeSignal])

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
}
