import { useEffect } from 'react'
import type { TeamColor, WeaponType } from './ArenaScene'

export type PracticeWeaponOption = {
  id: WeaponType
  name: string
  isMelee?: boolean
  damage: number
  explosionRadius?: number
  rangePx?: number
  pellets: number
  maxAmmo: number
}

export type PracticeUtilityAction =
  | 'refill'
  | 'self_damage'
  | 'reset_dummies'
  | 'toggle_dummy_shield'

type PracticeArsenalModalProps = {
  weapons: readonly PracticeWeaponOption[]
  currentWeapon?: WeaponType
  teamColor: TeamColor
  onSelectWeapon: (weapon: WeaponType) => void
  onAction: (action: PracticeUtilityAction) => void
  onClose: () => void
}

export default function PracticeArsenalModal({
  weapons,
  currentWeapon,
  teamColor,
  onSelectWeapon,
  onAction,
  onClose,
}: PracticeArsenalModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' || event.code === 'KeyB') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  return (
    <div
      className="keybindings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="practice-arsenal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="keybindings-modal practice-arsenal-modal">
        <div className="keybindings-header">
          <h2 id="practice-arsenal-title">Arsenal de práctica</h2>
          <button
            type="button"
            className="keybindings-close"
            aria-label="Cerrar arsenal de práctica"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p className="keybindings-subtitle">
          Elige cualquier arma al instante o usa las utilidades para probar daño, escudos y curación sobre los 4 NPCs.
        </p>

        <div className="practice-weapon-grid" role="radiogroup" aria-label="Armas de práctica">
          {weapons.map((weapon) => {
            const selected = weapon.id === currentWeapon
            const stat = weapon.isMelee
              ? `${weapon.damage} dmg · Melé`
              : weapon.explosionRadius
                ? `${weapon.damage} área`
                : weapon.pellets > 1
                  ? `${weapon.damage}×${weapon.pellets} dmg`
                  : `${weapon.damage} dmg`
            return (
              <button
                key={weapon.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`weapon-option${selected ? ' is-selected' : ''}`}
                onClick={() => onSelectWeapon(weapon.id)}
              >
                <img
                  src={`/assets/weapons/weapon-${weapon.id}-${teamColor}.png`}
                  alt={weapon.name}
                />
                <span>{weapon.name}</span>
                <span className="weapon-stats">{stat}</span>
              </button>
            )
          })}
        </div>

        <div className="practice-utility-grid">
          <button type="button" className="kenney-btn-secondary" onClick={() => onAction('refill')}>
            Recargar todo
          </button>
          <button type="button" className="kenney-btn-secondary" onClick={() => onAction('self_damage')}>
            Bajar vida (-50 HP)
          </button>
          <button type="button" className="kenney-btn-secondary" onClick={() => onAction('toggle_dummy_shield')}>
            Escudo en NPC
          </button>
          <button type="button" className="kenney-btn-secondary" onClick={() => onAction('reset_dummies')}>
            Reiniciar NPCs
          </button>
        </div>

        <div className="keybindings-footer">
          <p className="keybindings-storage-note">
            Los power-ups en el suelo (abajo) reaparecen cada 4 s. Pulsa <code>B</code> o <code>Esc</code> para cerrar.
          </p>
          <div className="keybindings-actions">
            <button type="button" className="kenney-btn-primary" onClick={onClose}>
              Continuar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
