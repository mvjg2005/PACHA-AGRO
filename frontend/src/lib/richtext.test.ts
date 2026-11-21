import { describe, expect, it } from 'vitest'
import { parseRich } from './richtext'

describe('parseRich', () => {
  it('convierte negritas y viñetas sin dejar asteriscos', () => {
    const b = parseRich('Para la **siembra de quinua**:\n• **Humedad:** suficiente.\n• Revise **Sembrar**.\n\nGracias')
    expect(b[0]).toEqual({ type: 'p', parts: [{ text: 'Para la ' }, { text: 'siembra de quinua', bold: true }, { text: ':' }] })
    expect(b[1].type).toBe('ul')
    expect(JSON.stringify(b)).not.toContain('**')
    expect(b[2]).toEqual({ type: 'p', parts: [{ text: 'Gracias' }] })
  })
  it('listas numeradas y títulos', () => {
    const b = parseRich('## Consejos\n1. Riego\n2. Paja')
    expect(b[0]).toEqual({ type: 'p', parts: [{ text: 'Consejos' }] })
    expect(b[1]).toMatchObject({ type: 'ol', items: [[{ text: 'Riego' }], [{ text: 'Paja' }]] })
  })
})
