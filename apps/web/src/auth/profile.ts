import type { CrosshairStyle, PlayerSkin, WeaponType } from '../game/ArenaScene'

export const validUsername = (value: string) =>
  value.length >= 3 && value.length <= 20 && !/[^A-Za-z0-9_]/.test(value)

export type Profile = {
  id: string
  username: string | null
  preferred_skin: PlayerSkin
  preferred_weapon: WeaponType
  crosshair_style: CrosshairStyle
  created_at: string
  updated_at: string
  avatar_path?: string | null
}
