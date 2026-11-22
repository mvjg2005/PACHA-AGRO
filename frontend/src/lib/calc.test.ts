import { describe, expect, it } from 'vitest'
import { breakEvenPrice, labelMix, maxInputBudget, polygonAreaHa, pricePerKg, profit, requiredYield, toKg } from './calc'

describe('calculadoras', () => {
  it('convierte unidades bolivianas', () => {
    expect(toKg(10, 'qq')).toBe(460)
    expect(toKg(4, 'arroba')).toBe(46)
    expect(pricePerKg(230, 'qq')).toBe(5)
  })
  it('ganancia, rendimiento requerido y precio sin pérdida son coherentes', () => {
    expect(profit(1000, 5, 3000)).toEqual({ income: 5000, costs: 3000, profit: 2000 })
    expect(requiredYield(3000, 5)).toBe(600)
    expect(breakEvenPrice(3000, 600)).toBe(5)
    expect(maxInputBudget(1000, 5, 1000, 1500)).toBe(2500)
  })
  it('rechaza datos imposibles', () => {
    expect(requiredYield(3000, 0)).toBeNull()
    expect(breakEvenPrice(100, 0)).toBeNull()
    expect(profit(-1, 5, 0)).toBeNull()
    expect(labelMix(1, 0, 200, 20)).toBeNull()
  })
  it('mezcla según etiqueta por mochila', () => {
    // 1 L/ha en 200 L de agua/ha, 0,5 ha, mochila de 20 L
    expect(labelMix(1, 0.5, 200, 20)).toEqual({ product: 0.5, water: 100, tanks: 5, perTank: 0.1 })
  })
  it('área de un cuadrado de unos 100 m de lado ≈ 1 ha', () => {
    const d = 100 / 111320
    const lat = -17.97, lon = -67.11, dl = d / Math.cos(lat * Math.PI / 180)
    const a = polygonAreaHa([{ lat, lon }, { lat, lon: lon + dl }, { lat: lat + d, lon: lon + dl }, { lat: lat + d, lon }])
    expect(a).toBeGreaterThan(0.99); expect(a).toBeLessThan(1.01)
  })
})

import { forage } from './calc'
describe('forraje', () => {
  it('20 ovejas consumen ~16,7 kg de heno al día; 500 kg alcanzan 29 días completos', () => {
    const r = forage({ oveja: 20 }, 500, new Date('2026-07-01'), new Date('2026-12-15'), 2)!
    expect(r.perDayKg).toBeCloseTo(16.67, 1)
    expect(r.days).toBe(29)
    expect(r.runsOut.toISOString().slice(0, 10)).toBe('2026-07-30')
    expect(r.enough).toBe(false)
    expect(Math.round(r.missingKg)).toBe(Math.round(167 * 16.6667 - 500))
    expect(r.cost).toBeCloseTo(r.missingKg * 2)
  })
  it('sin animales o con datos imposibles no calcula', () => {
    expect(forage({}, 100, new Date(), new Date())).toBeNull()
    expect(forage({ llama: 2 }, -5, new Date(), new Date())).toBeNull()
  })
})
