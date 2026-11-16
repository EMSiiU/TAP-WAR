import { useEffect, useState, useCallback, useRef } from 'react'
import { Client, ErrorCode, MatchMakeError, ServerError } from '@colyseus/sdk'
import './App.css'
import PhaserView from './game/PhaserView'
import type {
  ArenaControls,
  BulletState,
  MatchPhase,
  PickupState,
  PlayerSkin,
  PlayerState,
} from './game/ArenaScene'

type ArenaState = {
  phase: MatchPhase
  timeRemaining: number
  killsToWin: number
  winnerId: string
  winnerName: string
  players: Map<string, PlayerState>
  bullets: Map<string, BulletState>
  pickups: Map<string, PickupState>
}

const SKIN_OPTIONS: { id: PlayerSkin; label: string }[] = [
  { id: 'fox', label: 'Zorro' },
  { id: 'squirrel', label: 'Ardilla' },
  { id: 'mouse', label: 'Ratón' },
  { id: 'rabbit', label: 'Conejo' },
]

type MatchMeta = {
  phase: MatchPhase
  timeRemaining: number
  killsToWin: number
  winnerId: string
  winnerName: string
}

function formatClock(seconds: number): string {
  const total = Math.ceil(Math.max(0, seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const client = new Client('http://127.0.0.1:2567')

function ArenaSession({
    playerName,
    playerSkin,
    onExit,
    onEnd
  }: {
    playerName: string
    playerSkin: PlayerSkin
    onExit: () => void
    onEnd: (message: string) => void
  }) {
  const [players, setPlayers] = useState<PlayerState[]>([])
  const [bullets, setBullets] = useState<BulletState[]>([])
  const [pickups, setPickups] = useState<PickupState[]>([])
  const [matchMeta, setMatchMeta] = useState<MatchMeta>({
    phase: 'waiting',
    timeRemaining: 180,
    killsToWin: 10,
    winnerId: '',
    winnerName: '',
  })
  const [status, setStatus] = useState('Conectando…')
  const [controls, setControls] = useState<ArenaControls | null>(null)
  const rematchRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let active = true
    let disconnect: (() => void) | undefined

    async function connect() {
      try {
        const joined = await client.joinById<ArenaState>('arena-local', {
          name: playerName,
          skin: playerSkin,
        })
        joined.reconnection.enabled = false

        if (!active) {
          await joined.leave()
          return
        }

        disconnect = () => { void joined.leave() }
        rematchRef.current = () => {
          if (joined.connection.isOpen) joined.send('rematch')
        }

        function syncState(state: ArenaState) {
          if (!active || !state) return
          if (state.players) {
            setPlayers(Array.from(state.players.values()))
          }
          if (state.bullets) {
            setBullets(Array.from(state.bullets.values()))
          }
          if (state.pickups) {
            setPickups(Array.from(state.pickups.values()))
          }
          setMatchMeta({
            phase: state.phase ?? 'waiting',
            timeRemaining: typeof state.timeRemaining === 'number' ? state.timeRemaining : 180,
            killsToWin: typeof state.killsToWin === 'number' ? state.killsToWin : 10,
            winnerId: state.winnerId ?? '',
            winnerName: state.winnerName ?? '',
          })
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
          sendEmote: (emote) => {
            if (joined.connection.isOpen) joined.send('emote', emote)
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
      rematchRef.current = null
      disconnect?.()
    }
  }, [playerName, playerSkin, onEnd])

  const sortedPlayers = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
  const scoreLine = players.map((p) => `${p.name}: ${p.kills}`).join(' vs ')
  const finishReason =
    matchMeta.timeRemaining <= 0
      ? 'Tiempo agotado'
      : `Meta de ${matchMeta.killsToWin} bajas alcanzada`

  return (
    <div className="arena-shell">
      <header className="arena-header">
        <strong style={{ fontSize: '1rem', color: 'var(--text-h)' }}>TAP-WAR</strong>
        <div className="arena-scoreboard" role="status">
          <span className="arena-clock">{formatClock(matchMeta.timeRemaining)}</span>
          {players.length > 0 && (
            <span>
              {scoreLine} | Meta: {matchMeta.killsToWin}
            </span>
          )}
          <span>{controls ? status : `${status}`}</span>
        </div>
        <button type="button" onClick={onExit} className="arena-btn-secondary">
          Salir de la arena
        </button>
      </header>

      <div className="arena-stage">
        {controls && matchMeta.phase === 'waiting' && (
          <div className="arena-waiting-banner" role="status">
            Esperando al segundo jugador para iniciar la partida...
          </div>
        )}

        {controls && (
          <PhaserView
            players={players}
            bullets={bullets}
            pickups={pickups}
            phase={matchMeta.phase}
            controls={controls}
          />
        )}

        {matchMeta.phase === 'finished' && (
          <div className="arena-results-overlay" role="dialog" aria-modal="true">
            <div className="arena-results-modal">
              <h2>
                {matchMeta.winnerName ? `Ganador: ${matchMeta.winnerName}` : 'Empate'}
              </h2>
              <p className="arena-results-subtitle">{finishReason}</p>

              <table className="arena-results-table">
                <thead>
                  <tr>
                    <th>Jugador</th>
                    <th>Eliminaciones</th>
                    <th>Muertes</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player) => (
                    <tr key={player.id}>
                      <td>{player.name}</td>
                      <td>{player.kills}</td>
                      <td>{player.deaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="arena-results-actions">
                <button
                  type="button"
                  className="arena-btn-primary"
                  onClick={() => rematchRef.current?.()}
                >
                  Jugar revancha
                </button>
                <button
                  type="button"
                  className="arena-btn-secondary"
                  onClick={onExit}
                >
                  Salir de la arena
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [name, setName] = useState('')
  const [skin, setSkin] = useState<PlayerSkin>('fox')
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
        playerSkin={skin}
        onExit={() => returnToForm('')}
        onEnd={returnToForm}
      />
    )
  }

  return (
    <main className="lobby-page">
      <div className="lobby-card">
        <h1 className="lobby-title">TAP-WAR</h1>
        <p className="lobby-subtitle">Duelo multijugador en la arena del desierto</p>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            const trimmedName = name.trim()
            if (trimmedName) {
              setEntryMessage('')
              setPlayerName(trimmedName)
            }
          }}
        >
          {entryMessage && (
            <p className="lobby-alert" role="alert">
              {entryMessage}
            </p>
          )}

          <span className="skin-grid-label">Elige tu personaje</span>
          <div className="skin-grid" role="radiogroup" aria-label="Selector de personaje">
            {SKIN_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={skin === option.id}
                className={`skin-option${skin === option.id ? ' is-selected' : ''}`}
                onClick={() => setSkin(option.id)}
              >
                <img src={`/assets/characters/player-${option.id}-idle.png`} alt={option.label} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          <div className="lobby-field">
            <label htmlFor="player-name">Nombre de jugador</label>
            <input
              id="player-name"
              placeholder="Ej. Johnny"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              required
            />
          </div>

          <button type="submit" className="lobby-submit" disabled={!name.trim()}>
            Entrar a la arena
          </button>
        </form>
      </div>
    </main>
  )
}
