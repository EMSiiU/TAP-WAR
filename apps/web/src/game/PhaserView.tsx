import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import ArenaScene, { type ArenaControls, type BulletState, type PlayerState } from './ArenaScene'
import arena from '../../../../packages/shared/arena.json'

type PhaserViewProps = {
  players: PlayerState[]
  bullets: BulletState[]
  controls: ArenaControls
}

export default function PhaserView({ players, bullets, controls }: PhaserViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ArenaScene | null>(null)

  useEffect(() => {
    const parent = hostRef.current
    if (!parent) return

    const scene = new ArenaScene(controls)
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
        backgroundColor: '#101827',
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
  }, [controls])

  useEffect(() => {
    sceneRef.current?.setPlayers(players)
  }, [players])

  useEffect(() => {
    sceneRef.current?.setBullets(bullets)
  }, [bullets])

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
}
