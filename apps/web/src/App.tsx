import { useEffect, useState, useCallback } from 'react'
import { Client, ErrorCode, MatchMakeError, ServerError } from '@colyseus/sdk'
import PhaserView from './game/PhaserView'
import type { ArenaControls, PlayerState } from './game/ArenaScene'

type ArenaState = {
  players: Map<string, PlayerState>
}

const client = new Client('http://127.0.0.1:2567')

function ArenaSession({ 
    playerName,
    onEnd
  }: { 
    playerName: string
    onEnd: (message: string) => void
  }) {
  const [players, setPlayers] = useState<PlayerState[]>([])
  const [status, setStatus] = useState('Conectando…')
  const [controls, setControls] = useState<ArenaControls | null>(null)

  useEffect(() => {
    let active = true
    let disconnect: (() => void) | undefined

    async function connect() {
      try {
        const joined = await client.joinById<ArenaState>('arena-local', {
          name: playerName,
        })
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
          if (active) onEnd('Se perdió la conexión. Puedes volver a entrar.')
        })
        syncPlayers(joined.state)
        setControls({
          playerId: joined.sessionId,
          send: (input) => {
            if (joined.connection.isOpen) joined.send('input', input)
          },
        })
        setStatus('Conectado')
      } catch (error) {
        if (!active) return

        if (
          error instanceof MatchMakeError &&
          error.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID &&
          error.message.endsWith(' is locked')
        ) {
          onEnd('La sala está llena. Inténtalo cuando haya una plaza.')
          return
        }

        if (error instanceof ServerError && error.code === ErrorCode.AUTH_FAILED) {
          onEnd('El nombre temporal debe tener entre 1 y 24 caracteres.')
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
      disconnect?.()
    }
  }, [playerName, onEnd])

  return (
    <>
      <p role="status">{controls ? `${status} · Jugadores: ${players.length}` : status}</p>
      {controls && <PhaserView players={players} controls={controls} />}
    </>
  )
}

export default function App() {
  const [name, setName] = useState('')
  const [playerName, setPlayerName] = useState<string | null>(null)

  const [entryMessage, setEntryMessage] = useState('')

  const returnToForm = useCallback((message: string) => {
    setEntryMessage(message)
    setPlayerName(null)
  }, [])

  return (
    <main style={{ width: 'min(94vw, 760px)', margin: '2rem auto' }}>
      <h1>TAP-WAR</h1>

      {playerName === null ? (
        <form onSubmit={(event) => {
          event.preventDefault()
          const trimmedName = name.trim()
          if (trimmedName) {
            setEntryMessage('')
            setPlayerName(trimmedName)
          }
        }}>
          {entryMessage && <p role='alert'>{entryMessage}</p>}
          <label htmlFor="player-name">Nombre temporal</label>
          <input
            id="player-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            required
          />
          <button type="submit" disabled={!name.trim()}>
            Entrar a la arena
          </button>
        </form>
      ) : (
        <>
          <button type="button" onClick={() => returnToForm('')}>
            Salir de la arena
          </button>
          <ArenaSession playerName={playerName} onEnd={returnToForm} />
        </>
      )}
    </main>
  )
}
