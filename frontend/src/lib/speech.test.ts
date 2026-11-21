import { describe, expect, it } from 'vitest'
import { cleanTextForSpeech } from './speech'

describe('cleanTextForSpeech', () => {
  it('elimina markdown y caracteres especiales para lectura fluida', () => {
    const input = 'Hola **amigo agricultor**, revise este enlace [clima](https://agrobolivia.bo).\n• Punto 1\n• Punto 2'
    const cleaned = cleanTextForSpeech(input)

    expect(cleaned).not.toContain('**')
    expect(cleaned).not.toContain('[clima]')
    expect(cleaned).toContain('clima')
    expect(cleaned).toContain('Punto 1')
  })

  it('maneja textos vacíos sin fallar', () => {
    expect(cleanTextForSpeech('')).toBe('')
    expect(cleanTextForSpeech('   ')).toBe('')
  })
})

