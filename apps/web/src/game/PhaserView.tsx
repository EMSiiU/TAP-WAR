// Este componente es el puente: React proporciona el contenedor y pheaser coloca ahí su canvas.

import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import ArenaScene from './ArenaScene'

export default function PhaserView() {
    const hostRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const parent = hostRef.current
        if (!parent) return

        let game: Phaser.Game | undefined

        // Permite cancelar el arranque si React desmonta antes del primer frame.
        const frame = requestAnimationFrame(() => {
        game = new Phaser.Game({
            type: Phaser.AUTO,
            parent,
            width: 1024,
            height: 768,
            backgroundColor: '#101827',
            scale: { mode: Phaser.Scale.FIT },
            scene: [ArenaScene],
        })
        })

        return () => {
        cancelAnimationFrame(frame)
        game?.destroy(true)
        }
    }, [])

    return <div ref={hostRef} style={{ width: '100%', aspectRatio: '4 / 3' }} />
}