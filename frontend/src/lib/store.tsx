import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, getToken, SESSION_EXPIRED_EVENT, setToken } from './api'
import type { Department, Municipality, User } from './types'

const LOC_KEY = 'agb_municipality'
const GPS_KEY = 'agb_gps'
const USER_KEY = 'agb_user'

/** Ubicación exacta por GPS. Se guarda solo en este celular; el servidor no la almacena. */
export interface Gps { lat: number; lon: number; municipalityId: string; distanceKm: number; far: boolean }
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignorar */ } }
const remove = (k: string) => { try { localStorage.removeItem(k) } catch { /* ignorar */ } }
const readUser = (): User | null => {
  try {
    const u = JSON.parse(read(USER_KEY) ?? 'null') as User | null
    return u && typeof u.id === 'number' ? u : null
  } catch { return null }
}

/** Borra del service worker las respuestas guardadas con coordenadas exactas. */
function clearLocationCache() {
  if (typeof caches === 'undefined') return
  caches.keys().then(keys => Promise.all(keys.map(async key => {
    const cache = await caches.open(key)
    const requests = await cache.keys()
    await Promise.all(requests.filter(req => {
      const url = new URL(req.url)
      return url.searchParams.has('lat') || url.searchParams.has('lon')
    }).map(req => cache.delete(req)))
  }))).catch(() => { /* almacenamiento no disponible */ })
}

interface Ctx {
  user: User | null
  setSession: (token: string, user: User) => void
  logout: () => void
  refreshUser: () => Promise<void>
  departments: Department[] | null
  locationsError: string | null
  reloadLocations: () => void
  municipalityId: string | null
  setMunicipalityId: (id: string) => void
  findMunicipality: (id: string | null) => (Municipality & { department_id: string; department_name: string }) | null
  gps: Gps | null
  setGps: (g: Gps) => void
  /** Parámetros de ubicación para la API: coordenadas exactas si hay GPS para ese municipio. */
  locationQuery: (municipalityId: string) => string
}

const AppCtx = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getToken() ? readUser() : null)
  const [departments, setDepartments] = useState<Department[] | null>(null)
  const [locationsError, setLocationsError] = useState<string | null>(null)
  const [municipalityId, setMid] = useState<string | null>(read(LOC_KEY))
  const [gps, setGpsState] = useState<Gps | null>(() => { try { return JSON.parse(read(GPS_KEY) ?? 'null') } catch { return null } })

  const loadLocations = useCallback(() => {
    setLocationsError(null)
    api<{ departments: Department[] }>('/api/locations').then(d => setDepartments(d.departments)).catch(e => setLocationsError(e.message))
  }, [])

  const clearCredentials = useCallback(() => {
    setToken(null)
    setUser(null)
    remove(USER_KEY)
  }, [])

  const clearSession = useCallback(() => {
    clearCredentials()
    setMid(null)
    setGpsState(null)
    remove(LOC_KEY)
    remove(GPS_KEY)
    clearLocationCache()
  }, [clearCredentials])

  const refreshUser = useCallback(async () => {
    if (!getToken()) { clearCredentials(); return }
    try {
      const u = await api<User>('/api/auth/me')
      setUser(u)
      write(USER_KEY, JSON.stringify(u))
    } catch (e) {
      // Sin red se conserva el último perfil conocido; solo un 401 cierra la sesión.
      if (e instanceof ApiError && e.status === 401) clearSession()
    }
  }, [clearCredentials, clearSession])

  useEffect(() => { loadLocations(); refreshUser() }, [loadLocations, refreshUser])

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, clearSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, clearSession)
  }, [clearSession])

  const value = useMemo<Ctx>(() => ({
    user,
    setSession: (token, u) => {
      setToken(token); setUser(u); write(USER_KEY, JSON.stringify(u))
      if (u.default_municipality_id && !read(LOC_KEY)) { setMid(u.default_municipality_id); write(LOC_KEY, u.default_municipality_id) }
    },
    logout: clearSession,
    refreshUser,
    departments, locationsError, reloadLocations: loadLocations,
    municipalityId,
    setMunicipalityId: (id) => {
      setMid(id); write(LOC_KEY, id)
      if (gps && gps.municipalityId !== id) { setGpsState(null); try { localStorage.removeItem(GPS_KEY) } catch { /* ignorar */ } }
    },
    gps,
    setGps: (g) => { setGpsState(g); write(GPS_KEY, JSON.stringify(g)); setMid(g.municipalityId); write(LOC_KEY, g.municipalityId) },
    locationQuery: (id) => gps && gps.municipalityId === id
      ? `lat=${gps.lat.toFixed(4)}&lon=${gps.lon.toFixed(4)}` : `municipality_id=${encodeURIComponent(id)}`,
    findMunicipality: (id) => {
      if (!id || !departments) return null
      for (const d of departments) {
        const m = d.municipalities.find(x => x.id === id)
        if (m) return { ...m, department_id: d.id, department_name: d.name }
      }
      return null
    },
  }), [user, departments, locationsError, municipalityId, gps, refreshUser, loadLocations])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('AppProvider faltante')
  return c
}
