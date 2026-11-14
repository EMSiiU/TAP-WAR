import { useEffect, useState, useCallback } from 'react'
import { Client, ErrorCode, MatchMakeError, ServerError } from '@colyseus/sdk'
import PhaserView from './game/PhaserView'
import type { ArenaControls, BulletState, PlayerState } from './game/ArenaScene'

type ArenaState = {
  players: Map<string, PlayerState>
  bullets: Map<string, BulletState>
}

const client = new Client('http://127.0.0.1:2567')

function ArenaSession({
    playerName,
    onExit,
    onEnd
  }: {
    playerName: string
    onExit: () => void
    onEnd: (message: string) => void
  }) {
  const [players, setPlayers] = useState<PlayerState[]>([])
  const [bullets, setBullets] = useState<BulletState[]>([])
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

        function syncState(state: ArenaState) {
          if (!active || !state) return
          if (state.players) {
            setPlayers(Array.from(state.players.values()))
          }
          if (state.bullets) {
            setBullets(Array.from(state.bullets.values()))
          }
        }

        joined.onStateChange(syncState)
        joined.onLeave(() => {
          if (active) onEnd('Se perdió la conexión. Puedes volver a entrar.')
        })
        syncState(joined.state)
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
    <div style={{ width: '100%', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header
        style={{
          height: '48px',
          flexShrink: 0,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <strong style={{ fontSize: '1rem', color: 'var(--text-h)' }}>TAP-WAR</strong>
        <p role="status" style={{ fontSize: '0.9rem' }}>
          {controls ? `${status} · Jugadores: ${players.length}` : status}
        </p>
        <button type="button" onClick={onExit} style={{ padding: '4px 12px', fontSize: '0.85rem' }}>
          Salir de la arena
        </button>
      </header>
      <div style={{ flex: 1, minHeight: 0, width: '100%', backgroundColor: '#101827' }}>
        {controls && <PhaserView players={players} bullets={bullets} controls={controls} />}
      </div>
    </div>
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

  if (playerName !== null) {
    return (
      <ArenaSession
        playerName={playerName}
        onExit={() => returnToForm('')}
        onEnd={returnToForm}
      />
    )
  }

  return (
    <main style={{ width: 'min(94vw, 520px)', margin: '3rem auto' }}>
      <h1>TAP-WAR</h1>

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
    </main>
  )
}
