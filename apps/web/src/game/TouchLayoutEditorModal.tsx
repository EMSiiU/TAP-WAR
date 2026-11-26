import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { controlsSyncMessage, type ControlsSyncStatus } from './controlsSync'
import {
  cloneTouchLayouts,
  DEFAULT_TOUCH_LAYOUTS,
  TOUCH_CONTROL_SLOT_META,
  TOUCH_SLOT_MAX_SCALE,
  TOUCH_SLOT_MAX_X,
  TOUCH_SLOT_MAX_Y,
  TOUCH_SLOT_MIN_SCALE,
  TOUCH_SLOT_MIN_X,
  TOUCH_SLOT_MIN_Y,
  type TouchControlSlotId,
  type TouchLayoutByOrientation,
} from './touchLayout'

type TouchLayoutEditorModalProps = {
  layouts: TouchLayoutByOrientation
  deviceLabel?: string
  syncStatus?: ControlsSyncStatus
  onSave: (next: TouchLayoutByOrientation) => void
  onClose: () => void
}

type DragSession = {
  slotId: TouchControlSlotId
  pointerId: number
  startX: number
  startY: number
  originSlotX: number
  originSlotY: number
  rectWidth: number
  rectHeight: number
}

function detectInitialOrientation(): 'landscape' | 'portrait' {
  if (typeof window === 'undefined') return 'landscape'
  if (window.matchMedia?.('(orientation: portrait)')?.matches) return 'portrait'
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
}

export default function TouchLayoutEditorModal({
  layouts,
  deviceLabel = 'Móvil / Tablet',
  syncStatus = 'local',
  onSave,
  onClose,
}: TouchLayoutEditorModalProps) {
  const [draft, setDraft] = useState<TouchLayoutByOrientation>(() => cloneTouchLayouts(layouts))
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>(() => detectInitialOrientation())
  const [selectedId, setSelectedId] = useState<TouchControlSlotId>('aim')
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const activeLayout = draft[orientation]
  const selectedSlot = activeLayout[selectedId]
  const selectedMeta = TOUCH_CONTROL_SLOT_META.find((item) => item.id === selectedId)

  function updateSlot(slotId: TouchControlSlotId, patch: Partial<{ x: number; y: number; scale: number }>) {
    setDraft((prev) => {
      const current = prev[orientation][slotId]
      return {
        ...prev,
        [orientation]: {
          ...prev[orientation],
          [slotId]: {
            x: patch.x ?? current.x,
            y: patch.y ?? current.y,
            scale: patch.scale ?? current.scale,
          },
        },
      }
    })
  }

  function startDrag(slotId: TouchControlSlotId, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(slotId)
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return

    dragRef.current = {
      slotId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originSlotX: activeLayout[slotId].x,
      originSlotY: activeLayout[slotId].y,
      rectWidth: rect.width,
      rectHeight: rect.height,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* Pointer capture optional in simulated environments. */
    }
  }

  function moveDrag(slotId: TouchControlSlotId, event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.slotId !== slotId || drag.pointerId !== event.pointerId) return
    const dx = (event.clientX - drag.startX) / drag.rectWidth
    const dy = (event.clientY - drag.startY) / drag.rectHeight
    const nextX = Math.min(TOUCH_SLOT_MAX_X, Math.max(TOUCH_SLOT_MIN_X, Math.round((drag.originSlotX + dx) * 1000) / 1000))
    const nextY = Math.min(TOUCH_SLOT_MAX_Y, Math.max(TOUCH_SLOT_MIN_Y, Math.round((drag.originSlotY + dy) * 1000) / 1000))
    updateSlot(slotId, { x: nextX, y: nextY })
  }

  function endDrag(slotId: TouchControlSlotId, event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.slotId !== slotId || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      /* Already released. */
    }
  }

  function previewLabel(id: TouchControlSlotId): string {
    if (id === 'move') return 'MOVER'
    if (id === 'aim') return 'DISPARO'
    if (id === 'dash') return 'DASH'
    if (id === 'melee') return 'MELÉ'
    if (id === 'reload') return 'REC'
    if (id === 'emotes') return 'Emotes'
    return 'Menú'
  }

  return (
    <div
      className="touch-editor-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="touch-editor-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="touch-editor-modal">
        <div className="keybindings-header">
          <h2 id="touch-editor-title">Controles táctiles personalizados</h2>
          <button
            type="button"
            className="keybindings-close"
            aria-label="Cerrar editor de controles táctiles"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="touch-editor-toolbar">
          <p className="keybindings-subtitle" style={{ margin: 0 }}>
            Arrastra cada control al lugar que prefieras y ajusta su tamaño.
          </p>
          <div className="touch-editor-orientations" role="tablist" aria-label="Orientación a editar">
            <button
              type="button"
              role="tab"
              aria-selected={orientation === 'landscape'}
              className={`touch-editor-tab${orientation === 'landscape' ? ' is-active' : ''}`}
              onClick={() => setOrientation('landscape')}
            >
              Horizontal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={orientation === 'portrait'}
              className={`touch-editor-tab${orientation === 'portrait' ? ' is-active' : ''}`}
              onClick={() => setOrientation('portrait')}
            >
              Vertical
            </button>
          </div>
        </div>

        <div className="touch-editor-stage-wrap">
          <div
            ref={stageRef}
            className={`touch-editor-canvas is-${orientation}`}
            aria-label={`Vista previa de controles (${orientation === 'landscape' ? 'horizontal' : 'vertical'})`}
          >
            <div className="touch-editor-arena-hint">
              <span>ARENA DE JUEGO</span>
            </div>

            {TOUCH_CONTROL_SLOT_META.map(({ id, label }) => {
              const slot = activeLayout[id]
              const isStick = id === 'move' || id === 'aim'
              const isSelected = selectedId === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={`${label}: arrastrar para mover`}
                  className={`touch-editor-node${isStick ? ' is-stick' : ''}${id === 'aim' ? ' is-aim' : ''}${id === 'dash' ? ' is-dash' : ''}${isSelected ? ' is-selected' : ''}`}
                  style={{
                    left: `${slot.x * 100}%`,
                    top: `${slot.y * 100}%`,
                    transform: `translate(-50%, -50%) scale(${slot.scale})`,
                  }}
                  onPointerDown={(e) => startDrag(id, e)}
                  onPointerMove={(e) => moveDrag(id, e)}
                  onPointerUp={(e) => endDrag(id, e)}
                  onPointerCancel={(e) => endDrag(id, e)}
                >
                  {previewLabel(id)}
                </button>
              )
            })}
          </div>
        </div>

        <div className="touch-editor-scale-bar">
          <label htmlFor="touch-slot-scale">
            Tamaño de <strong>{selectedMeta?.label ?? selectedId}</strong>: {Math.round(selectedSlot.scale * 100)}%
          </label>
          <input
            id="touch-slot-scale"
            type="range"
            min={TOUCH_SLOT_MIN_SCALE}
            max={TOUCH_SLOT_MAX_SCALE}
            step={0.05}
            value={selectedSlot.scale}
            onChange={(e) => updateSlot(selectedId, { scale: Number(e.target.value) })}
          />
        </div>

        <div className="keybindings-footer">
          <p className="keybindings-storage-note">
            {controlsSyncMessage(syncStatus, deviceLabel)}
          </p>
          <div className="keybindings-actions">
            <button
              type="button"
              className="kenney-btn-secondary"
              onClick={() => setDraft(cloneTouchLayouts(DEFAULT_TOUCH_LAYOUTS))}
            >
              Restablecer
            </button>
            <button type="button" className="kenney-btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="kenney-btn-primary"
              onClick={() => {
                onSave(cloneTouchLayouts(draft))
                onClose()
              }}
            >
              Guardar controles
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
