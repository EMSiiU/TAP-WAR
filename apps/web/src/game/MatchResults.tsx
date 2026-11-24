export type MatchResultRow = {
  sessionId: string; name: string; kills: number; deaths: number; abandoned: boolean; outcome: string; points: number
}

export default function MatchResults({ title, reason, saveMessage, players, rematchDisabled, onRematch, onExit }: {
  title: string; reason: string; saveMessage?: string; players: MatchResultRow[]; rematchDisabled: boolean
  onRematch: () => void; onExit: () => void
}) {
  return <div className="arena-results-overlay" role="dialog" aria-modal="true" aria-labelledby="arena-results-title">
    <div className="arena-results-modal">
      <div className="arena-results-body" tabIndex={0} aria-label="Detalle de resultados">
        <h2 id="arena-results-title">{title}</h2>
        <p className="arena-results-subtitle">{reason}</p>
        <p role="status">{saveMessage}</p>
        <div className="arena-results-scroll">
          <table className="arena-results-table">
            <thead><tr><th>Jugador</th><th>Eliminaciones</th><th>Muertes</th><th>Resultado</th><th>Puntos</th></tr></thead>
            <tbody>{players.map(player => <tr key={player.sessionId}>
              <td>{player.name}{player.abandoned ? ' (abandono)' : ''}</td>
              <td>{player.kills}</td><td>{player.deaths}</td>
              <td>{({ win: 'Victoria', draw: 'Empate', loss: 'Derrota' } as Record<string,string>)[player.outcome]}</td>
              <td>+{player.points}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="arena-results-actions">
        <button type="button" className="arena-btn-primary" disabled={rematchDisabled} onClick={onRematch}>Jugar revancha</button>
        <button type="button" className="arena-btn-secondary" onClick={onExit}>Salir de la arena</button>
      </div>
    </div>
  </div>
}
