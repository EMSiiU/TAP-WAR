import { memo, useEffect, useRef } from 'react'
import './arena-header.css'

type ArenaHeaderProps = {
  roomCode: string
  roomName: string
  isPrivate: boolean
  hideRoomCode?: boolean
  gameModeLabel: string
  environmentLabel: string
  sizeLabel: string
  playerCount: number
  maxPlayers: number
  clock: string
  scoreLine: string
  killsToWin: number
  targetLabel?: string
  status: string
  connected: boolean
  gamepadConnected: boolean
  touchMode: boolean
  fullscreen: boolean
  copied: boolean
  onCopy: () => void
  onTouchToggle: () => void
  onFullscreen: () => void
  onExit: () => void
  onSignOut: () => void
}

function ArenaHeader(props: ArenaHeaderProps) {
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (menu.current && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])

  return <header className="arena-header" aria-label="Información y controles de la partida">
    <div className="arena-header-identity">
      <strong className="arena-brand">TAP-WAR</strong>
      <span className="arena-mode-pill">{props.gameModeLabel}</span>
      <span className="arena-room-visibility">{props.isPrivate ? 'Privada' : 'Pública'}</span>
      {!props.hideRoomCode && props.roomCode && <button type="button" className="arena-code-button" onClick={props.onCopy}
        title={`Copiar código de ${props.roomName || 'la sala'}`} aria-label={props.copied ? 'Código copiado' : `Copiar código ${props.roomCode}`}>
        <span className="arena-copy-icon" aria-hidden="true">⧉</span><span>{props.copied ? 'Copiado' : props.roomCode}</span>
      </button>}
    </div>

    <div className="arena-header-actions">
      <button type="button" className="arena-toolbar-button arena-touch-toggle" aria-pressed={props.touchMode} onClick={props.onTouchToggle}>
        Táctil <span className="arena-toggle-state">{props.touchMode ? 'ON' : 'OFF'}</span>
      </button>
      <button type="button" className="arena-toolbar-button arena-fullscreen-button" onClick={props.onFullscreen}
        aria-label={props.fullscreen ? 'Salir de pantalla completa' : 'Activar pantalla completa'}>
        <span aria-hidden="true">⛶</span><span className="arena-fullscreen-label">{props.fullscreen ? 'Salir pantalla' : 'Pantalla completa'}</span>
      </button>
      <details ref={menu} className="arena-toolbar-menu" onKeyDown={event => {
        if (event.key === 'Escape' && menu.current?.open) {
          event.preventDefault(); event.stopPropagation(); menu.current.open = false
          menu.current.querySelector('summary')?.focus()
        }
      }}>
        <summary>Opciones <span aria-hidden="true">▾</span></summary>
        <div className="arena-toolbar-dropdown">
          <button type="button" onClick={props.onExit}>Salir de la arena</button>
          <button type="button" onClick={props.onSignOut}>Cerrar sesión</button>
        </div>
      </details>
    </div>

    <div className="arena-header-context">
      <span className="arena-environment-name" title={`${props.environmentLabel} · ${props.sizeLabel}`}>{props.environmentLabel}</span>
      <span className="arena-header-divider" aria-hidden="true">/</span>
      <span className="arena-size-name">{props.sizeLabel}</span>
      <span className="arena-player-count" aria-label={`${props.playerCount} de ${props.maxPlayers} jugadores`}>{props.playerCount}/{props.maxPlayers}</span>
    </div>

    <div className="arena-scoreboard">
      <span className="arena-clock" role="timer" aria-label={`Tiempo restante ${props.clock}`}>{props.clock}</span>
      <span className="arena-live-score" title={props.scoreLine}>{props.scoreLine || 'Esperando jugadores'}</span>
      {props.killsToWin > 0 && <span className="arena-kill-target">{props.targetLabel ?? 'Meta'} <b>{props.killsToWin}</b></span>}
      <span className={`arena-connection${props.connected ? ' is-connected' : ''}`} role="status" title={props.status}>
        <span aria-hidden="true" className="arena-connection-dot"/><span>{props.connected ? 'Conectado' : props.status}</span>
      </span>
      {props.gamepadConnected && <span className="arena-gamepad-status">Mando</span>}
    </div>
  </header>
}

export default memo(ArenaHeader)
