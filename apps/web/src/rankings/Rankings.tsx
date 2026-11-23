import { useEffect, useState } from 'react'
import { supabase } from '../auth/supabase'
import './rankings.css'

type Row = {
  username: string; avatar_path: string | null; preferred_skin: string; is_me?: boolean
  position: number | null; points: number; matches: number; wins: number; draws: number; losses: number
  abandonments: number; kills: number; deaths: number; win_rate: number | null; kd: number | null
}
type History = { match_id: string; ended_at: string; reason: string; outcome: string; points: number; kills: number; deaths: number; abandoned: boolean }
type Ranking = { rows: Row[]; total: number; top: Row[]; me: Row | null }
type Personal = { summary: Row | null; total: number; history: History[]; recent: History[] }
const resultNames: Record<string, string> = { win: 'Victoria', draw: 'Empate', loss: 'Derrota' }
const reasons: Record<string, string> = { time: 'Tiempo agotado', kills: '20 kills', abandon: 'Abandono' }
const date = (value: string) => new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
const position = (row?: Row | null) => row?.position ? `#${row.position}` : 'Sin clasificar'

function Avatar({ row, urls }: { row: Row; urls: Record<string, string> }) {
  const fallback = `/assets/characters/player-${row.preferred_skin}-idle.png`
  return <img className="ranking-avatar" src={(row.avatar_path && urls[row.avatar_path]) || fallback} alt={`Perfil de ${row.username}`}
    onError={event => { if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback }} />
}

function Pagination({ page, total, onPage, disabled }: { page: number; total: number; onPage: (page: number) => void; disabled: boolean }) {
  return <nav className="ranking-pagination" aria-label="Paginación">
    <button disabled={disabled || page === 0} onClick={() => onPage(page - 1)}>Anterior</button>
    <span>Página {page + 1} de {Math.max(1, Math.ceil(total / 20))} · {total} registros</span>
    <button disabled={disabled || (page + 1) * 20 >= total} onClick={() => onPage(page + 1)}>Siguiente</button>
  </nav>
}

export default function Rankings({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'global' | 'personal'>('global')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [historyPage, setHistoryPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [ranking, setRanking] = useState<Ranking | null>(null)
  const [personal, setPersonal] = useState<Personal | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const client = supabase
    if (!client) return
    async function load() {
      setLoading(true); setError('')
      try {
        const response = tab === 'global'
          ? await client!.rpc('get_rankings', { search, page })
          : await client!.rpc('get_my_statistics', { page: historyPage })
        if (!active) return
        if (response.error) throw response.error
        if (tab === 'global') setRanking(response.data as Ranking)
        else setPersonal(response.data as Personal)
      } catch {
        if (active) setError('No se pudieron cargar las estadísticas. Reintenta; si acabas de instalar este bloque, aplica la migración de rankings en Supabase.')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [tab, search, page, historyPage, revision])

  useEffect(() => {
    const client = supabase
    if (!client || !ranking) return
    const paths = [...new Set([...ranking.rows, ...ranking.top, ...(ranking.me ? [ranking.me] : [])].flatMap(r => r.avatar_path ? [r.avatar_path] : []))]
    let active = true
    async function loadPhotos() {
      if (!paths.length) { setUrls({}); return }
      try {
        const { data } = await client!.storage.from('avatars').createSignedUrls(paths, 3600)
        if (active) setUrls(Object.fromEntries((data || []).filter(p => p.signedUrl && !p.error).map(p => [p.path!, p.signedUrl!])))
      } catch { if (active) setUrls({}) }
    }
    void loadPhotos()
    const timer = setInterval(() => { void loadPhotos() }, 50 * 60 * 1000)
    return () => { active = false; clearInterval(timer) }
  }, [ranking])

  const me = tab === 'personal' ? personal?.summary : ranking?.me
  const top = ranking?.top || []
  const maxPoints = Math.max(1, ...top.map(r => r.points))
  const recent = personal?.recent || []
  const maxKills = Math.max(1, ...recent.flatMap(r => [r.kills, r.deaths]))
  const cards: [string, string | number][] = [
    ['Puesto global', position(me)], ['Puntos', me?.points ?? 0], ['Partidas', me?.matches ?? 0], ['Victorias', me?.wins ?? 0],
    ['Victorias %', me?.win_rate == null ? '—' : `${me.win_rate}%`], ['Kills', me?.kills ?? 0], ['Muertes', me?.deaths ?? 0], ['K/D', me?.kd ?? '—'],
  ]

  return <main className="rankings-page">
    <header className="rankings-header">
      <div><span className="ranking-eyebrow">TAP-WAR · CLASIFICACIÓN ACUMULADA</span><h1>La arena deja huella.</h1><p>Cada victoria suma. Cada partida cuenta.</p></div>
      <button onClick={onBack}>Volver al lobby</button>
    </header>
    <nav className="ranking-tabs" aria-label="Secciones de estadísticas">
      <button aria-current={tab === 'global' ? 'page' : undefined} onClick={() => setTab('global')}>Ranking global</button>
      <button aria-current={tab === 'personal' ? 'page' : undefined} onClick={() => setTab('personal')}>Mis estadísticas</button>
      <button className="ranking-refresh" disabled={loading} onClick={() => setRevision(n => n + 1)}>Actualizar</button>
    </nav>
    
    {error && <div role="alert" className="ranking-error">{error} <button onClick={() => setRevision(n => n + 1)}>Reintentar</button></div>}
    {loading && <p role="status">Cargando estadísticas…</p>}
    {!loading && !error && <>
      {tab === 'global' && ranking && <>
        <section aria-label="Tu posición" className="ranking-own-position"><strong>{position(me)}</strong><span>Tu posición global</span><b>{me?.points ?? 0} puntos</b></section>
        {top.length > 0 && <section className="ranking-podium" aria-label="Jugadores destacados">
          {top.slice(0, 3).map(row => <article key={row.username} className="ranking-highlight"><span>{position(row)}</span><Avatar row={row} urls={urls}/><h2>{row.username}</h2><strong>{row.points} puntos</strong></article>)}
        </section>}
        <section className="ranking-panel">
          <div className="ranking-section-heading"><h2>Todos los jugadores</h2><form onSubmit={event => { event.preventDefault(); setPage(0); setSearch(query.trim()) }}>
            <label htmlFor="ranking-search">Buscar username</label><div className="ranking-search"><input id="ranking-search" value={query} maxLength={20} onChange={event => setQuery(event.target.value)}/><button>Buscar</button></div>
          </form></div>
          <p>Los puntos iguales comparten puesto: 1, 1, 2. El orden alfabético solo organiza la tabla.</p>
          <div className="ranking-table-scroll"><table><caption>Clasificación global · {ranking.total} jugadores{search && ` · búsqueda: ${search}`}</caption><thead><tr>{['Puesto','Jugador','Puntos','Partidas','Victorias','Kills','Muertes','Victorias %'].map(t => <th key={t} scope="col">{t}</th>)}</tr></thead><tbody>
            {ranking.rows.map(row => <tr key={row.username} className={row.is_me ? 'ranking-is-me' : ''}><td>{position(row)}</td><th scope="row"><span className="ranking-player"><Avatar row={row} urls={urls}/>{row.username}{row.is_me && <small>Tú</small>}</span></th><td><b>{row.points}</b></td><td>{row.matches}</td><td>{row.wins}</td><td>{row.kills}</td><td>{row.deaths}</td><td>{row.win_rate == null ? '—' : `${row.win_rate}%`}</td></tr>)}
          </tbody></table></div>
          {ranking.rows.length === 0 && <p className="ranking-empty">{search ? 'No hay jugadores con ese username.' : 'Todavía no hay perfiles completos.'}</p>}
          <Pagination page={page} total={ranking.total} onPage={setPage} disabled={loading}/>
        </section>
        <section className="ranking-panel"><h2>Los 10 con más puntos</h2><p>Se muestran hasta diez cuentas; pueden compartir puesto.</p>
          {top.length ? <div className="ranking-bars" role="list">{top.map(row => <div role="listitem" className="ranking-bar-row" key={row.username}><span>{position(row)} {row.username}</span><svg viewBox="0 0 300 20" role="img" aria-label={`${row.points} puntos`}><rect width="300" height="20" className="ranking-bar-track"/><rect width={300 * row.points / maxPoints} height="20" className="ranking-bar-fill"/></svg><b>{row.points}</b></div>)}</div> : <p className="ranking-empty">El primer resultado guardado inaugurará la clasificación.</p>}
        </section>
      </>}
      {tab === 'personal' && personal && <>
        <h2>Tu recorrido, {me?.username || 'jugador'}</h2>
        <section className="ranking-stat-cards" aria-label="Estadísticas personales">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
        {!personal.total && <p className="ranking-empty">Aún no tienes partidas guardadas. Las estadísticas comienzan con este bloque.</p>}
        <div className="ranking-chart-grid">
          <section className="ranking-panel"><h2>Últimas diez partidas</h2><p><span className="ranking-legend-kills">■ Kills</span> · <span className="ranking-legend-deaths">■ Muertes</span> · Más reciente al final</p>
            {recent.length ? <div className="ranking-recent">{recent.map((r, index) => <div key={r.match_id}><svg viewBox="0 0 60 120" role="img" aria-label={`Partida ${index + 1}: ${r.kills} kills, ${r.deaths} muertes`}><rect x="5" y={110 - r.kills / maxKills * 90} width="22" height={r.kills / maxKills * 90} className="ranking-bar-fill"/><rect x="32" y={110 - r.deaths / maxKills * 90} width="22" height={r.deaths / maxKills * 90} className="ranking-death-fill"/></svg><small>{r.kills} / {r.deaths}</small><small>{new Date(r.ended_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</small></div>)}</div> : <p>Sin partidas todavía.</p>}
          </section>
          <section className="ranking-panel"><h2>Resultados</h2>{(['wins','draws','losses'] as const).map((key, index) => {
            const count = me?.[key] ?? 0; const percent = me?.matches ? 100 * count / me.matches : 0
            return <div className="ranking-distribution" key={key}><div><span>{['Victorias','Empates','Derrotas'][index]}</span><b>{count} · {percent.toFixed(1)}%</b></div><svg viewBox="0 0 300 14" role="img" aria-label={`${count} ${['victorias','empates','derrotas'][index]}`}><rect width="300" height="14" className="ranking-bar-track"/><rect width={percent * 3} height="14" className={`ranking-result-${key}`}/></svg></div>
          })}<p>Abandonos: {me?.abandonments ?? 0}, incluidos en las derrotas.</p></section>
        </div>
        <section className="ranking-panel"><h2>Historial de partidas</h2><div className="ranking-table-scroll"><table><caption>Solo partidas válidas guardadas · más recientes primero</caption><thead><tr>{['Fecha','Resultado','Kills','Muertes','Puntos','Final'].map(t => <th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{personal.history.map(r => <tr key={r.match_id}><td>{date(r.ended_at)}</td><td>{resultNames[r.outcome]}{r.abandoned ? ' · Abandono' : ''}</td><td>{r.kills}</td><td>{r.deaths}</td><td>+{r.points}</td><td>{reasons[r.reason] || r.reason}</td></tr>)}</tbody></table></div>
          <Pagination page={historyPage} total={personal.total} onPage={setHistoryPage} disabled={loading}/>
        </section>
      </>}
    </>}
    
  </main>
}
