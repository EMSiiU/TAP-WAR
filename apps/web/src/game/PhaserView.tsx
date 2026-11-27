import { memo, useEffect, useRef } from 'react'
import Phaser from 'phaser'
import ArenaScene, {
  type ArenaActionKind,
  type ArenaControls,
  type ArenaWorldSnapshot,
  type CrosshairStyle,
  type MatchPhase,
} from './ArenaScene'
import type { GameMode, MapEnvironment, MapSize } from './arenaMaps'
import type { PcControlConfig } from './keybindings'
import type { TouchInputState } from './TouchControls'
import arena from '../../../../packages/shared/arena.json'

type PhaserViewProps = {
  worldStateRef: React.RefObject<ArenaWorldSnapshot>
  worldPushRef: React.RefObject<((snapshot: ArenaWorldSnapshot) => void) | null>
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
  damageFeedbackTriggerRef?: React.RefObject<
    ((x: number, y: number, damage: number, blocked: boolean) => void) | null
  >
  onMenuToggle?: () => void
  onPracticeArsenalToggle?: () => void
  onGamepadChange?: (connected: boolean) => void
  resumeSignal: number
  controls: ArenaControls
}

function PhaserView({
  worldStateRef,
  worldPushRef,
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
  damageFeedbackTriggerRef,
  onMenuToggle,
  onPracticeArsenalToggle,
  onGamepadChange,
  resumeSignal,
  controls,
}: PhaserViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ArenaScene | null>(null)
  const latestPhaseRef = useRef(phase)
  const latestGameModeRef = useRef(gameMode)
  const latestPausedRef = useRef(isPaused)
  const latestCrosshairRef = useRef(crosshairStyle)
  const latestPcControlsRef = useRef(pcControls)
  const latestTouchModeRef = useRef(touchMode)
  const onMenuToggleRef = useRef(onMenuToggle)
  const onPracticeArsenalToggleRef = useRef(onPracticeArsenalToggle)
  const onGamepadChangeRef = useRef(onGamepadChange)

  useEffect(() => {
    onMenuToggleRef.current = onMenuToggle
  }, [onMenuToggle])

  useEffect(() => {
    onPracticeArsenalToggleRef.current = onPracticeArsenalToggle
  }, [onPracticeArsenalToggle])

  useEffect(() => {
    onGamepadChangeRef.current = onGamepadChange
  }, [onGamepadChange])

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
    scene.applyWorldSnapshot(worldStateRef.current)
    scene.setPhase(latestPhaseRef.current)
    scene.setGameMode(latestGameModeRef.current)
    scene.setPaused(latestPausedRef.current)
    scene.setCrosshairStyle(latestCrosshairRef.current)
    scene.setPcControls(latestPcControlsRef.current)
    scene.setPracticeArsenalToggle(() => onPracticeArsenalToggleRef.current?.())
    sceneRef.current = scene
    worldPushRef.current = (snapshot) => scene.applyWorldSnapshot(snapshot)

    if (actionTriggerRef) {
      actionTriggerRef.current = (action) => scene.triggerAction(action)
    }
    if (explosionTriggerRef) {
      explosionTriggerRef.current = (x, y, radius) => scene.triggerExplosion(x, y, radius)
    }
    if (damageFeedbackTriggerRef) {
      damageFeedbackTriggerRef.current = (x, y, damage, blocked) =>
        scene.triggerDamageFeedback(x, y, damage, blocked)
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
      worldPushRef.current = null
      if (actionTriggerRef) actionTriggerRef.current = null
      if (explosionTriggerRef) explosionTriggerRef.current = null
      if (damageFeedbackTriggerRef) damageFeedbackTriggerRef.current = null
      sceneRef.current = null
      active = false
      resizeObserver?.disconnect()
      scene.stopControls()
      game?.destroy(true)
    }
  }, [
    controls,
    mapSize,
    environment,
    touchInputRef,
    worldStateRef,
    worldPushRef,
    actionTriggerRef,
    explosionTriggerRef,
    damageFeedbackTriggerRef,
  ])

  useEffect(() => {
    if (resumeSignal > 0) {
      sceneRef.current?.resume()
    }
  }, [resumeSignal])

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
}

export default memo(PhaserView)
