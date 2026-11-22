/**
 * Pacha IA sin internet: responde en el celular con lo que quedó guardado (pronóstico, noches peligrosas y boletín).
 * No inventa: si un dato no está guardado, lo dice y explica cómo guardarlo.
 */
import type { NightT, NightsT } from './types'

export interface OfflineDay { date: string; tmin: number | null; tmax: number | null; precip_mm: number | null }
export interface OfflineData {
  place: string
  savedAt: string | null
  days: OfflineDay[]
  nights: NightT[]
  sms: string | null
}
export interface OfflineReply { reply: string; speech: string; suggestions: string[] }

export const OFFLINE_SUGGESTIONS = ['¿Mis ovejas corren peligro esta noche?', '¿Va a helar esta semana?', '¿Va a llover?', 'Leer el boletín de la semana']

const DAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const has = (t: string, words: string[]) => words.some(w => t.includes(w))
const dayName = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return `${DAY[d.getDay()]} ${d.getDate()}` }
const deg = (n: number | null) => n === null ? '—' : `${Math.round(n)} °C`
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null
/** Para leer en voz alta: sin asteriscos y con «grados» en lugar de «°C». */
const toSpeech = (s: string) => s.replace(/\*\*/g, '').replace(/°C/g, 'grados').replace(/^- /gm, '').replace(/\n+/g, '. ')

export function answerOffline(question: string, d: OfflineData, today = new Date().toISOString().slice(0, 10)): OfflineReply {
  const t = fold(question)
  const head = `Sin internet · uso lo guardado${d.savedAt ? ` el ${when(d.savedAt)}` : ''} para ${d.place}.`
  const days = d.days.filter(x => x.date >= today)
  const nights = d.nights.filter(x => x.date >= today)
  const done = (body: string): OfflineReply => {
    const reply = `${head}\n\n${body}`
    return { reply, speech: toSpeech(body), suggestions: OFFLINE_SUGGESTIONS }
  }

  if (!days.length && !nights.length && !d.sms) {
    return { reply: 'Sin internet y sin datos guardados para estos días. Cuando tenga señal, entre a **Sin internet** y toque «Guardar para usar sin internet»: después podré responderle en el campo.',
      speech: 'Sin internet y sin datos guardados para estos días. Cuando tenga señal, entre a Sin internet y toque Guardar para usar sin internet.', suggestions: [] }
  }

  if (/^(hola|buen|jallalla|que tal|saludos)/.test(t)) {
    return done('¡Jallalla! Ahora no hay internet, pero puedo contarle lo que guardé: las noches peligrosas para su ganado, las heladas y la lluvia de la semana.')
  }

  if (has(t, ['boletin', 'sms', 'radio', 'resumen'])) {
    if (d.sms) return done(`Boletín guardado:\n\n${d.sms}`)
  }

  if (has(t, ['oveja', 'llama', 'alpaca', 'vaca', 'cria', 'cordero', 'ganado', 'rebano', 'animal', 'nevada', 'nevar', 'nieve', 'noche', 'peligro', 'abrig', 'encierr'])) {
    if (!nights.length) return done('No tengo guardadas las noches de estos días. Por si acaso: encierre de noche a las crías con sus madres, al abrigo del viento, y deles forraje seco al atardecer.')
    const bad = nights.filter(n => n.level === 'extremo' || n.level === 'alto')
    const first = nights[0]
    const lines = [`**Esta noche (${dayName(first.date)}): ${first.label.toLowerCase()}**, mínima ${deg(first.tmin)}${first.snow ? ', posible nevada' : ''}.`]
    if (bad.length) lines.push(`Noches peligrosas: ${bad.slice(0, 4).map(n => `**${dayName(n.date)}** (${deg(n.tmin)}${n.snow ? ', nevada' : ''})`).join(', ')}.`)
    else lines.push('No hay noches de riesgo alto en lo guardado.')
    const acts = (bad[0] ?? first).actions.slice(0, 3)
    if (acts.length) lines.push(acts.map(a => `- ${a}`).join('\n'))
    return done(lines.join('\n'))
  }

  if (has(t, ['helad', 'helar', 'hiela', 'frio', 'temperatura', 'minima', 'congel'])) {
    if (!days.length) return done('No tengo guardado el pronóstico de estos días.')
    const frost = days.filter(x => x.tmin !== null && x.tmin <= 0)
    const coldest = days.reduce((a, b) => (b.tmin ?? 99) < (a.tmin ?? 99) ? b : a)
    return done(frost.length
      ? `Sí: hay **${frost.length} ${frost.length === 1 ? 'día' : 'días'} con helada** (0 °C o menos): ${frost.slice(0, 5).map(x => `${dayName(x.date)} (${deg(x.tmin)})`).join(', ')}. La más fuerte: **${dayName(coldest.date)}, ${deg(coldest.tmin)}**.`
      : `No se esperan heladas en lo guardado. La mínima más baja: ${dayName(coldest.date)}, ${deg(coldest.tmin)}.`)
  }

  if (has(t, ['lluv', 'llov', 'agua', 'seco', 'sequia', 'precip'])) {
    if (!days.length) return done('No tengo guardado el pronóstico de estos días.')
    const total = Math.round(days.reduce((s, x) => s + (x.precip_mm ?? 0), 0))
    const wet = days.filter(x => (x.precip_mm ?? 0) >= 2)
    return done(wet.length
      ? `Se esperan unos **${total} mm** en ${days.length} días. Días con lluvia: ${wet.slice(0, 5).map(x => `${dayName(x.date)} (${Math.round(x.precip_mm ?? 0)} mm)`).join(', ')}.`
      : `No se espera lluvia importante en los próximos ${days.length} días (${total} mm en total).`)
  }

  if (has(t, ['sembr', 'siembr', 'quinua', 'papa', 'haba', 'cebada', 'maiz', 'fumig', 'cultivo', 'planta'])) {
    const frost = days.filter(x => x.tmin !== null && x.tmin <= -2)
    return done(`Sin internet no puedo revisar todas las reglas de siembra, pero con lo guardado: ${frost.length ? `hay **heladas fuertes** el ${frost.slice(0, 3).map(x => dayName(x.date)).join(', ')}; espere a que pasen antes de sembrar.` : 'no hay heladas fuertes en los próximos días.'} Revise la humedad del suelo con la mano: si la tierra forma un terrón, hay humedad.`)
  }

  // Resumen de la semana
  const lines: string[] = []
  if (days.length) {
    const coldest = days.reduce((a, b) => (b.tmin ?? 99) < (a.tmin ?? 99) ? b : a)
    const total = Math.round(days.reduce((s, x) => s + (x.precip_mm ?? 0), 0))
    lines.push(`Próximos ${days.length} días: la mínima más baja es **${deg(coldest.tmin)} el ${dayName(coldest.date)}** y se esperan **${total} mm** de lluvia.`)
  }
  const bad = nights.filter(n => n.level === 'extremo' || n.level === 'alto')
  if (bad.length) lines.push(`Noches peligrosas para el ganado: ${bad.slice(0, 3).map(n => dayName(n.date)).join(', ')}.`)
  lines.push('Puede preguntarme por las heladas, la lluvia, su ganado o el boletín.')
  return done(lines.join('\n'))
}

async function cached<T>(url: string): Promise<{ data: T | null; at: string | null }> {
  try {
    const r = await fetch(url)
    if (!r.ok) return { data: null, at: null }
    return { data: await r.json() as T, at: r.headers.get('x-agb-cached-at') }
  } catch { return { data: null, at: null } }
}

/** Lee lo guardado por el service worker y responde. */
export async function offlineAnswer(question: string, municipalityId: string, place: string): Promise<OfflineReply> {
  const q = `municipality_id=${encodeURIComponent(municipalityId)}`
  const [wx, ni, bu] = await Promise.all([
    cached<{ forecast?: { available: boolean; daily: OfflineDay[] } }>(`/api/weather?${q}`),
    cached<NightsT>(`/api/ganado/noches?${q}`),
    cached<{ available: boolean; sms?: string }>(`/api/ganado/boletin?${q}`),
  ])
  const ats = [wx.at, ni.at, bu.at].filter(Boolean) as string[]
  return answerOffline(question, {
    place,
    savedAt: ats.sort()[0] ?? null,
    days: wx.data?.forecast?.available ? wx.data.forecast.daily ?? [] : [],
    nights: ni.data?.available ? ni.data.nights : [],
    sms: bu.data?.available ? bu.data.sms ?? null : null,
  })
}
