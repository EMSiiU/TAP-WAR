import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import ArenaScene, { type PlayerState } from './ArenaScene'

export default function PhaserView({ players }: { players: PlayerState[] }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ArenaScene | null>(null)

  useEffect(() => {
    const parent = hostRef.current
    if (!parent) return

    const scene = new ArenaScene()
    sceneRef.current = scene
    let game: Phaser.Game | undefined

    let active = true
    queueMicrotask(() => {
      if (!active) return

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: 1024,
        height: 768,
        backgroundColor: '#101827',
        scale: { mode: Phaser.Scale.FIT },
        scene: [scene],
      })
    })

    return () => {
      sceneRef.current = null
      active = false
      game?.destroy(true)
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setPlayers(players)
  }, [players])

  return <div ref={hostRef} style={{ width: '100%', aspectRatio: '4 / 3' }} />
}
