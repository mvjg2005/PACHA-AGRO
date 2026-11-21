const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function dayLabel(iso: string, today = new Date()): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((date.getTime() - t0.getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  return `${DIAS[date.getDay()]} ${d}`
}

export function dateLong(iso: string): string {
  // Una fecha sin offset representa hora local de Bolivia; las marcas con offset son instantes UTC/absolutos.
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(iso)
  const d = new Date(hasZone ? iso : `${iso}-04:00`)
  if (isNaN(d.getTime())) return iso
  const parts = new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz', weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const weekday = part('weekday').replace('.', '')
  return `${weekday} ${part('day')} ${part('month')} · ${part('hour')}:${part('minute')}`
}

export function updatedAt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-BO', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/La_Paz',
  })
}

export function weatherIcon(code: number | null, storm = false): { icon: string; text: string } {
  if (storm || (code !== null && code >= 95)) return { icon: '⛈️', text: 'Tormenta' }
  if (code === null) return { icon: '❔', text: 'Sin dato' }
  if (code === 0) return { icon: '☀️', text: 'Despejado' }
  if (code <= 3) return { icon: '⛅', text: 'Algo nublado' }
  if (code <= 48) return { icon: '🌫️', text: 'Niebla' }
  if (code <= 67) return { icon: '🌧️', text: 'Lluvia' }
  if (code <= 77) return { icon: '🌨️', text: 'Nieve' }
  if (code <= 82) return { icon: '🌦️', text: 'Chubascos' }
  return { icon: '🌨️', text: 'Nieve' }
}

export const round = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n)}°`)
