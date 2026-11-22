/** Guardar datos para usar sin internet. Las respuestas las guarda el service worker (sw.js). */
const KEY = 'agb_offline_saved'

export interface SavedInfo { municipalityId: string; name: string; at: string }

export function savedInfo(): SavedInfo | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null }
}

/** ¿El modo sin conexión está activo en esta pestaña? (el service worker controla la página) */
export const offlineReady = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker.controller

/**
 * Descarga y deja guardado todo lo necesario para la semana: clima, noches peligrosas, alerta de año seco,
 * boletín, las pantallas de Clima y Ganado, y las fotos. Devuelve cuántos elementos se guardaron.
 */
export async function saveForOffline(municipalityId: string, name: string, weatherQuery: string): Promise<{ ok: number; total: number }> {
  const q = `municipality_id=${encodeURIComponent(municipalityId)}`
  const urls = [`/api/weather?${weatherQuery}`, `/api/weather?${q}`, `/api/ganado/noches?${q}`, `/api/ganado/sequia?${q}`,
    `/api/ganado/boletin?${q}`, '/api/ganado/catalogo', '/api/locations', '/',
    '/img/historia/pastoreo-seco.jpg', '/img/historia/suelo-seco.jpg', '/img/historia/forraje.jpg', '/img/historia/corderos.jpg']
  const results = await Promise.allSettled([
    ...urls.map(u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(String(r.status)) })),
    import('../pages/Weather'), import('../pages/Ganado'), import('../pages/Offline'),
  ])
  const ok = results.filter(r => r.status === 'fulfilled').length
  if (ok > 0) {
    try { localStorage.setItem(KEY, JSON.stringify({ municipalityId, name, at: new Date().toISOString() })) } catch { /* sin almacenamiento */ }
  }
  return { ok, total: results.length }
}
