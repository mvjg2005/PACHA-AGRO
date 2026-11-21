import { useEffect, useState } from 'react'
import { Icon } from './Icon'

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

/** Lee el texto en voz alta con la voz del celular (sin internet, sin costo). Útil para quien lee con dificultad. */
export function Listen({ text, label = 'Escuchar', className = '' }: { text: string; label?: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => () => { if (supported()) window.speechSynthesis.cancel() }, [])
  if (!supported() || !text.trim()) return null
  const toggle = () => {
    const synth = window.speechSynthesis
    if (speaking) { synth.cancel(); setSpeaking(false); return }
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    const voice = voices.find(v => v.lang === 'es-BO') ?? voices.find(v => v.lang.startsWith('es-4') || v.lang === 'es-US' || v.lang === 'es-MX') ?? voices.find(v => v.lang.startsWith('es'))
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'es-BO'
    u.rate = 0.92
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    setSpeaking(true)
    synth.speak(u)
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={speaking} data-testid="listen"
      className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-surface-high)] ${className}`}>
      <Icon name={speaking ? 'stop' : 'volume'} size={18} />{speaking ? 'Detener' : label}
    </button>
  )
}
