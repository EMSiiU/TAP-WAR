import { useEffect, useState } from 'react'
import { Client, ErrorCode, MatchMakeError } from '@colyseus/sdk'
import PhaserView from './game/PhaserView'
import type { PlayerState } from './game/ArenaScene'

type ArenaState = {
  players: Map<string, PlayerState>
}

const client = new Client('http://127.0.0.1:2567')

function ArenaSession() {
  const [players, setPlayers] = useState<PlayerState[]>([])
  const [status, setStatus] = useState('Conectando…')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let active = true
    let disconnect: (() => void) | undefined

    async function connect() {
      try {
        const joined = await client.joinById<ArenaState>('arena-local')
        joined.reconnection.enabled = false

        if (!active) {
          await joined.leave()
          return
        }

        disconnect = () => { void joined.leave() }

        function syncPlayers(state: ArenaState) {
          if (active && state?.players) {
            setPlayers(Array.from(state.players.values()))
          }
        }

        joined.onStateChange(syncPlayers)
        joined.onLeave(() => {
          if (active) {
            setPlayers([])
            setConnected(false)
            setStatus('Se perdió la conexión. Sal de la arena para volver a entrar.')
          }
        })
        syncPlayers(joined.state)
        setConnected(true)
        setStatus('Conectado')
      } catch (error) {
        if (active) {
          setStatus(
            error instanceof MatchMakeError &&
            error.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID &&
            error.message.endsWith(' is locked')
              ? 'La sala está llena.'
              : 'No se pudo conectar a la arena. Comprueba que el servidor esté iniciado.',
          )
        }
      }
    }

    queueMicrotask(() => {
      if (active) void connect()
    })

    return () => {
      active = false
      disconnect?.()
    }
  }, [])

  return (
    <>
      <p role="status">{connected ? `${status} · Jugadores: ${players.length}` : status}</p>
      {connected && <PhaserView players={players} />}
    </>
  )
}

export default function App() {
  const [inArena, setInArena] = useState(false)

  return (
    <main style={{ width: 'min(94vw, 760px)', margin: '2rem auto' }}>
      <h1>TAP-WAR</h1>

      <button onClick={() => setInArena(!inArena)}>
        {inArena ? 'Salir de la arena' : 'Entrar a la arena'}
      </button>

      {inArena && <ArenaSession />}
    </main>
  )
}
