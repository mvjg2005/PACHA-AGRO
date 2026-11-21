import { describe, expect, it } from 'vitest'
import { dayLabel, dateLong, weatherIcon, round } from './format'

describe('format', () => {
  const today = new Date(2026, 10, 21)
  it('etiqueta hoy y mañana', () => {
    expect(dayLabel('2026-11-21', today)).toBe('Hoy')
    expect(dayLabel('2026-11-22', today)).toBe('Mañana')
    expect(dayLabel('2026-11-23', today)).toBe('Lun 23')
  })
  it('formatea horas locales de reuniones en Bolivia', () => {
    expect(dateLong('2026-11-22T10:30:00')).toBe('dom 22 nov · 10:30')
  })
  it('convierte marcas UTC a la hora local de Bolivia', () => {
    expect(dateLong('2026-11-22T14:30:00+00:00')).toBe('dom 22 nov · 10:30')
  })
  it('iconos con texto', () => {
    expect(weatherIcon(95).text).toBe('Tormenta')
    expect(weatherIcon(0).icon).toBe('☀️')
    expect(weatherIcon(null).text).toBe('Sin dato')
  })
  it('redondea con guion si falta dato', () => {
    expect(round(null)).toBe('—')
    expect(round(-1.6)).toBe('-2°')
  })
})
