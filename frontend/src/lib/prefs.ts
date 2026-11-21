import { useEffect, useState } from 'react'
import type { User } from './types'

/** Preferencias guardadas solo en este celular (para quien no tiene cuenta). */
const CROPS_KEY = 'agb_my_crops'
const PROFILE_KEY = 'agb_profile'
const ONBOARD_KEY = 'agb_onboarded'

export const CROP_LIST = [
  { id: 'quinua', name: 'Quinua' }, { id: 'papa', name: 'Papa' }, { id: 'maiz', name: 'Maíz' },
  { id: 'haba', name: 'Haba' }, { id: 'cebada', name: 'Cebada' },
] as const
export const cropName = (id: string) => CROP_LIST.find(c => c.id === id)?.name ?? id

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

export function localCrops(): string[] {
  try { const v = JSON.parse(read(CROPS_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => CROP_LIST.some(c => c.id === x)) : [] } catch { return [] }
}
export function setLocalCrops(ids: string[]) { write(CROPS_KEY, JSON.stringify(ids)); window.dispatchEvent(new Event('agb-prefs')) }
export const getProfile = () => read(PROFILE_KEY)
export const setProfile = (v: string) => write(PROFILE_KEY, v)
export const onboarded = () => read(ONBOARD_KEY) === '1'
export const setOnboarded = () => write(ONBOARD_KEY, '1')

/** Cultivos de la persona: los de su cuenta, o los elegidos en este celular. */
export function useMyCrops(user: User | null): string[] {
  const [local, setLocal] = useState(localCrops)
  useEffect(() => {
    const on = () => setLocal(localCrops())
    window.addEventListener('agb-prefs', on)
    return () => window.removeEventListener('agb-prefs', on)
  }, [])
  return user && user.crops.length ? user.crops : local
}
