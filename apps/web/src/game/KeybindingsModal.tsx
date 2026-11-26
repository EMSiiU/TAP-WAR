import { useEffect, useState } from 'react'
import {
  DEFAULT_PC_CONTROLS,
  PC_CONTROL_LABELS,
  formatBindingLabel,
  isValidPcBinding,
  rebindPcControl,
  type PcControlAction,
  type PcControlConfig,
} from './keybindings'

type KeybindingsModalProps = {
  controls: PcControlConfig
  onChange: (next: PcControlConfig) => void
  onClose: () => void
}

export default function KeybindingsModal({
  controls,
  onChange,
  onClose,
}: KeybindingsModalProps) {
  const [listeningAction, setListeningAction] = useState<PcControlAction | null>(null)
  const [hint, setHint] = useState('')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    if (!listeningAction) {
      const onCloseKey = (event: KeyboardEvent) => {
        if (event.code === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }
      window.addEventListener('keydown', onCloseKey, true)
      return () => {
        window.removeEventListener('keydown', onCloseKey, true)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === 'Escape') {
        setListeningAction(null)
        setHint('Asignación cancelada (Esc está reservado para el menú).')
        return
      }
      if (!isValidPcBinding(event.code)) {
        setHint('Esa tecla no es compatible. Prueba con letras, números, flechas, Espacio, Shift o Ctrl.')
        return
      }
      onChange(rebindPcControl(controls, listeningAction, event.code))
      setListeningAction(null)
      setHint('')
    }

    const onMouseDown = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const mouseCode = `Mouse${event.button}`
      if (!isValidPcBinding(mouseCode)) {
        setHint('Usa botón izquierdo, medio o derecho del ratón.')
        return
      }
      onChange(rebindPcControl(controls, listeningAction, mouseCode))
      setListeningAction(null)
      setHint('')
    }

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('contextmenu', onContextMenu, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('contextmenu', onContextMenu, true)
    }
  }, [listeningAction, controls, onChange, onClose])

  return (
    <div
      className="keybindings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keybindings-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !listeningAction) {
          onClose()
        }
      }}
    >
      <div className="keybindings-modal">
        <div className="keybindings-header">
          <h2 id="keybindings-title">Controles de PC</h2>
          <button
            type="button"
            className="keybindings-close"
            aria-label="Cerrar configuración de controles"
            onClick={() => {
              setListeningAction(null)
              onClose()
            }}
          >
            ×
          </button>
        </div>

        <p className="keybindings-subtitle">
          Pulsa cualquier acción y luego presiona la tecla o botón del ratón que deseas usar.{' '}
          <code>Esc</code> siempre abre o cierra el menú.
        </p>

        {hint && (
          <p className="keybindings-hint" role="status">
            {hint}
          </p>
        )}

        <ul className="keybindings-list">
          {PC_CONTROL_LABELS.map(({ action, label }) => {
            const isListening = listeningAction === action
            return (
              <li key={action} className="keybindings-row">
                <span>{label}</span>
                <button
                  type="button"
                  className={`keybinding-btn${isListening ? ' is-listening' : ''}`}
                  onClick={() => {
                    setHint('')
                    setListeningAction(isListening ? null : action)
                  }}
                >
                  {isListening ? 'Pulsa una tecla o clic…' : formatBindingLabel(controls[action])}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="keybindings-footer">
          <p className="keybindings-storage-note">
            Se guardan automáticamente en este navegador (<code>localStorage</code>).
          </p>
          <div className="keybindings-actions">
            <button
              type="button"
              className="kenney-btn-secondary"
              onClick={() => {
                setListeningAction(null)
                setHint('Controles restablecidos a los valores predeterminados.')
                onChange({ ...DEFAULT_PC_CONTROLS })
              }}
            >
              Restablecer predeterminados
            </button>
            <button
              type="button"
              className="kenney-btn-primary"
              onClick={() => {
                setListeningAction(null)
                onClose()
              }}
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
