/** Calculadoras del campo. Todo se convierte a kg y a hectáreas antes de calcular. */

export const WEIGHT_UNITS = {
  kg: { label: 'kg', one: 'kg', kg: 1 },
  qq: { label: 'quintales (46 kg)', one: 'quintal', kg: 46 },
  arroba: { label: 'arrobas (11,5 kg)', one: 'arroba', kg: 11.5 },
  t: { label: 'toneladas', one: 'tonelada', kg: 1000 },
} as const
export type WeightUnit = keyof typeof WEIGHT_UNITS

export const AREA_UNITS = { ha: { label: 'hectáreas', ha: 1 }, m2: { label: 'm²', ha: 0.0001 } } as const
export type AreaUnit = keyof typeof AREA_UNITS

export const toKg = (qty: number, unit: WeightUnit) => qty * WEIGHT_UNITS[unit].kg
export const fromKg = (kg: number, unit: WeightUnit) => kg / WEIGHT_UNITS[unit].kg
/** Precio por unidad elegida → Bs por kg. */
export const pricePerKg = (price: number, unit: WeightUnit) => price / WEIGHT_UNITS[unit].kg

const ok = (...n: number[]) => n.every(x => Number.isFinite(x) && x >= 0)

export function profit(yieldKg: number, priceKg: number, costs: number) {
  if (!ok(yieldKg, priceKg, costs)) return null
  const income = yieldKg * priceKg
  return { income, costs, profit: income - costs }
}

export function requiredYield(costs: number, priceKg: number) {
  if (!ok(costs, priceKg) || priceKg === 0) return null
  return costs / priceKg
}

export function breakEvenPrice(costs: number, yieldKg: number) {
  if (!ok(costs, yieldKg) || yieldKg === 0) return null
  return costs / yieldKg
}

/** Lo máximo que puede gastar en insumos para quedar con la ganancia deseada. */
export function maxInputBudget(yieldKg: number, priceKg: number, otherCosts: number, desiredProfit: number) {
  if (!ok(yieldKg, priceKg, otherCosts, desiredProfit)) return null
  return yieldKg * priceKg - otherCosts - desiredProfit
}

/**
 * Mezcla según la etiqueta: con la dosis por hectárea y el volumen de agua por hectárea que indica
 * la etiqueta, calcula cuánto producto y agua necesita, y cuánto poner en cada mochila.
 */
export function labelMix(dosePerHa: number, areaHa: number, waterPerHa: number, tankL: number) {
  if (!ok(dosePerHa, areaHa, waterPerHa, tankL) || waterPerHa === 0 || tankL === 0 || areaHa === 0) return null
  const water = waterPerHa * areaHa
  return { product: dosePerHa * areaHa, water, tanks: Math.ceil(water / tankL - 1e-9), perTank: (dosePerHa * tankL) / waterPerHa }
}

/** Superficie de un polígono de coordenadas GPS (grados) en hectáreas. Proyección local equirectangular. */
export function polygonAreaHa(points: { lat: number; lon: number }[]) {
  if (points.length < 3) return 0
  const R = 6371008.8
  const lat0 = (points.reduce((a, p) => a + p.lat, 0) / points.length) * Math.PI / 180
  const xy = points.map(p => [R * (p.lon * Math.PI / 180) * Math.cos(lat0), R * (p.lat * Math.PI / 180)])
  let s = 0
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2 / 10000
}

export const bs = (n: number) => `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const num = (n: number, d = 1) => n.toLocaleString('es-BO', { maximumFractionDigits: d })
