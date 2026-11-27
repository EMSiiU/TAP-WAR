import { gameModeLabel, type GameMode } from './arenaMaps'
import type { ScoreboardRow } from './hudState'

type LiveScoreboardProps = {
  roomName: string
  gameMode: GameMode
  clock: string
  killsToWin: number
  orangeScore: number
  blueScore: number
  rows: readonly ScoreboardRow[]
  interactive: boolean
  onClose?: () => void
}

function formatRatio(kills: number, deaths: number): string {
  if (deaths <= 0) return kills > 0 ? `${kills}.0` : '0.0'
  return (kills / deaths).toFixed(1)
}

export default function LiveScoreboard({
  roomName,
  gameMode,
  clock,
  killsToWin,
  orangeScore,
  blueScore,
  rows,
  interactive,
  onClose,
}: LiveScoreboardProps) {
  return (
    <div
      className={`arena-live-scoreboard-overlay${interactive ? ' is-interactive' : ' is-passive'}`}
      role={interactive ? 'dialog' : 'status'}
      aria-modal={interactive ? true : undefined}
      aria-label="Estadísticas de la partida"
      onClick={(event) => {
        if (interactive && event.target === event.currentTarget) {
          onClose?.()
        }
      }}
    >
      <div className="arena-live-scoreboard-card">
        <div className="arena-live-scoreboard-head">
          <div className="arena-live-scoreboard-title">
            <strong>{roomName || 'Arena'}</strong>
            <span>
              {gameModeLabel(gameMode)} · {clock}
              {killsToWin > 0 ? ` · Meta ${killsToWin}` : ''}
            </span>
          </div>
          {gameMode === 'tdm' && (
            <div className="arena-live-scoreboard-teams" aria-label="Marcador por equipos">
              <span className="team-chip is-orange">Naranja {orangeScore}</span>
              <span className="team-chip is-blue">Azul {blueScore}</span>
            </div>
          )}
          {interactive && onClose && (
            <button
              type="button"
              className="keybindings-close arena-scoreboard-close"
              aria-label="Cerrar estadísticas"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>

        <div className="arena-live-scoreboard-scroll">
          <table className="arena-live-scoreboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jugador</th>
                {gameMode === 'tdm' && <th>Equipo</th>}
                {gameMode === 'gungame' && <th>Nivel</th>}
                <th>Kills</th>
                <th>Muertes</th>
                <th>K/D</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={gameMode === 'tdm' || gameMode === 'gungame' ? 6 : 5}>
                    Sin jugadores conectados.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`arena-scoreboard-row${row.isLocal ? ' is-local' : ''}${row.isDead ? ' is-dead' : ''}`}
                  >
                    <td>{index + 1}</td>
                    <td className="arena-scoreboard-name-cell">
                      <span className="arena-scoreboard-player-name">{row.name}</span>
                      {row.isLocal && <span className="arena-scoreboard-tag is-you">Tú</span>}
                      {row.isBot && <span className="arena-scoreboard-tag is-npc">NPC</span>}
                      {row.isDead && <span className="arena-scoreboard-tag is-ko">KO</span>}
                    </td>
                    {gameMode === 'tdm' && (
                      <td>
                        <span className={`team-chip is-${row.team || 'orange'}`}>
                          {row.team === 'blue' ? 'Azul' : 'Naranja'}
                        </span>
                      </td>
                    )}
                    {gameMode === 'gungame' && <td>Nv.{row.weaponTier + 1}/10</td>}
                    <td>{row.kills}</td>
                    <td>{row.deaths}</td>
                    <td>{formatRatio(row.kills, row.deaths)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
