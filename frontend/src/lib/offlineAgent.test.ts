import { describe, expect, it } from 'vitest'
import { answerOffline, type OfflineData } from './offlineAgent'

const night = (date: string, level: 'extremo' | 'alto' | 'medio' | 'bajo', tmin: number, snow = false) =>
  ({ date, tmin, snow, wind_kmh: 10, level, label: level === 'alto' ? 'Noche peligrosa' : 'Noche tranquila', reasons: [], actions: ['Encierre a las crías con sus madres.'] })
const data: OfflineData = {
  place: 'Challapata', savedAt: '2026-11-22T10:00:00Z',
  days: [
    { date: '2026-11-23', tmin: -4, tmax: 15, precip_mm: 0 },
    { date: '2026-11-24', tmin: 1, tmax: 16, precip_mm: 6 },
    { date: '2026-11-25', tmin: -1, tmax: 14, precip_mm: 0.5 },
  ],
  nights: [night('2026-11-23', 'alto', -4, true), night('2026-11-24', 'bajo', 1)],
  sms: 'PACHA-AGRO Challapata 23/11: Helada fuerte lun 23 (-4C).',
}
const T = '2026-11-23'

describe('Pacha IA sin internet', () => {
  it('responde por el ganado con las noches guardadas y acciones', () => {
    const r = answerOffline('¿Mis ovejas corren peligro esta noche?', data, T)
    expect(r.reply).toContain('Sin internet')
    expect(r.reply).toContain('posible nevada')
    expect(r.reply).toContain('Encierre a las crías')
    expect(r.speech).not.toContain('**')
    expect(r.speech).toContain('grados')
  })
  it('cuenta las heladas y la más fuerte', () => {
    const r = answerOffline('¿va a helar esta semana?', data, T)
    expect(r.reply).toContain('2 días con helada')
    expect(r.reply).toContain('-4 °C')
  })
  it('suma la lluvia guardada', () => {
    expect(answerOffline('¿Va a llover?', data, T).reply).toContain('7 mm')
  })
  it('lee el boletín', () => {
    expect(answerOffline('Leer el boletín de la semana', data, T).reply).toContain('Helada fuerte lun 23')
  })
  it('sin datos guardados explica cómo guardarlos y no inventa', () => {
    const r = answerOffline('¿va a helar?', { place: 'X', savedAt: null, days: [], nights: [], sms: null }, T)
    expect(r.reply).toContain('Guardar para usar sin internet')
  })
})
