import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import { parseRich, type Inline } from '../lib/richtext'
import { createSpeechRecognizer, isSpeechRecognitionSupported, isSpeechSynthesisSupported, speakText, stopSpeaking } from '../lib/speech'
import { useApp } from '../lib/store'
import type { ExpertT } from '../lib/types'
import { Icon } from './Icon'
import { LogoMark } from './Logo'

/* Pacha IA: asistente flotante por voz y texto. Basado en el prototipo hecho con Antigravity;
   ahora usa el clima real, muestra el formato sin asteriscos y ofrece técnicos del directorio. */

interface Msg { id: string; role: 'user' | 'assistant' | 'system'; content: string; speech?: string; time: string; sources?: string[]; suggestions?: string[]; experts?: ExpertT[]; aiError?: string | null }
interface Reply { reply: string; speech_text: string; provider: string; ai_error: string | null; sources: string[]; suggested_questions: string[]; experts: ExpertT[]; location: { name: string; department_name: string } }

const VOICE_KEY = 'agb_agent_voice'
const now = () => new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })

/** Muestra el texto de la IA con negritas y listas, sin símbolos sueltos. */
export function RichText({ text }: { text: string }) {
  const inl = (parts: Inline[]) => parts.map((p, i) => p.bold ? <strong key={i} className="font-semibold text-[var(--color-primary)]">{p.text}</strong> : p.italic ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>)
  return (
    <div className="space-y-2 leading-relaxed">
      {parseRich(text).map((b, i): ReactNode => b.type === 'p'
        ? <p key={i}>{inl(b.parts)}</p>
        : b.type === 'ul'
          ? <ul key={i} className="list-disc space-y-1 pl-5 marker:text-[var(--color-secondary)]">{b.items.map((it, j) => <li key={j}>{inl(it)}</li>)}</ul>
          : <ol key={i} className="list-decimal space-y-1 pl-5 marker:font-semibold marker:text-[var(--color-secondary)]">{b.items.map((it, j) => <li key={j}>{inl(it)}</li>)}</ol>)}
    </div>
  )
}

export function PachaIA() {
  const { municipalityId, findMunicipality, gps, user } = useApp()
  const m = findMunicipality(municipalityId)
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceOn, setVoiceOn] = useState(() => { try { return localStorage.getItem(VOICE_KEY) !== 'false' } catch { return true } })
  const [listening, setListening] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [voiceErr, setVoiceErr] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<ReturnType<typeof createSpeechRecognizer> | null>(null)

  const welcome = (): Msg => ({
    id: 'welcome', role: 'assistant', time: now(),
    content: `¡Jallalla${user ? `, ${user.full_name.split(' ')[0]}` : ''}! Soy **Pacha IA**, su asistente agroclimático.\n\nPuede **hablarme con el micrófono** o **escribirme**. Le ayudo con el clima${m ? ` de ${m.name}` : ''}, las heladas, la siembra, plagas y su comunidad.`,
    suggestions: [`¿Cómo está el clima hoy${m ? ` en ${m.name}` : ''}?`, '¿Hay riesgo de helada?', '¿Puedo fumigar hoy?', '¿Cuándo siembro quinua?'],
  })
  useEffect(() => { setMsgs(prev => (prev.length <= 1 ? [welcome()] : prev)) }, [municipalityId, user?.id])
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, open, busy])
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200)
      if (provider === null) api<{ provider: string }>('/api/ai/agent/status').then(r => setProvider(r.provider)).catch(() => setProvider('desconocido'))
      return
    }
    stopSpeaking(); setSpeakingId(null); recRef.current?.stop(); setListening(false)
  }, [open])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])

  const speak = (id: string, s: string) => {
    if (speakingId === id) { stopSpeaking(); setSpeakingId(null); return }
    setSpeakingId(id)
    speakText(s, { onEnd: () => setSpeakingId(null), onError: () => setSpeakingId(null) })
  }

  const send = async (raw: string) => {
    const q = raw.trim()
    if (!q || busy) return
    recRef.current?.stop(); setListening(false); stopSpeaking(); setSpeakingId(null)
    const history = msgs.filter(x => x.role !== 'system').slice(-6).map(x => ({ role: x.role, content: x.content }))
    setMsgs(p => [...p, { id: `u${Date.now()}`, role: 'user', content: q, time: now() }])
    setText(''); setBusy(true)
    try {
      const ask = () => api<Reply>('/api/ai/agent/chat', { timeoutMs: 45000, body: {
        message: q, municipality_id: municipalityId, lat: gps && gps.municipalityId === municipalityId ? gps.lat : null,
        lon: gps && gps.municipalityId === municipalityId ? gps.lon : null, crop: user?.crops[0] ?? null, history } })
      let r: Reply
      try { r = await ask() } catch (e) {
        // Si la conexión se cortó (por ejemplo, el servidor se estaba reiniciando), reintenta una vez.
        if (!(e instanceof ApiError) || e.status !== 0 || /lenta/.test(e.message)) throw e
        await new Promise(res => setTimeout(res, 2500))
        r = await ask()
      }
      const id = `a${Date.now()}`
      setMsgs(p => [...p, { id, role: 'assistant', content: r.reply, speech: r.speech_text, time: now(), sources: r.sources, suggestions: r.suggested_questions, experts: r.experts, aiError: r.ai_error }])
      if (voiceOn && isSpeechSynthesisSupported()) { setSpeakingId(id); speakText(r.speech_text, { onEnd: () => setSpeakingId(null), onError: () => setSpeakingId(null) }) }
    } catch (e) {
      setMsgs(p => [...p, { id: `e${Date.now()}`, role: 'system', content: (e as Error).message || 'No se pudo conectar con Pacha IA. Intente de nuevo.', time: now() }])
    } finally { setBusy(false) }
  }

  const toggleMic = () => {
    setVoiceErr(null)
    if (listening) { recRef.current?.stop(); setListening(false); return }
    if (!isSpeechRecognitionSupported()) { setVoiceErr('Este navegador no reconoce la voz. Puede escribir su pregunta (en Chrome sí funciona).'); return }
    stopSpeaking(); setSpeakingId(null)
    recRef.current = createSpeechRecognizer({
      lang: 'es-BO',
      onStart: () => setListening(true),
      onResult: (t, final) => { setText(t); if (final && t.trim()) { setListening(false); send(t) } },
      onError: err => { setVoiceErr(err); setListening(false) },
      onEnd: () => setListening(false),
    })
    recRef.current?.start()
  }

  const toggleVoice = () => {
    const v = !voiceOn; setVoiceOn(v)
    try { localStorage.setItem(VOICE_KEY, String(v)) } catch { /* ignorar */ }
    if (!v) { stopSpeaking(); setSpeakingId(null) }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); send(text) }

  return (
    <>
      {!open && (
        <div className="pacha-fab fixed right-4 z-40 flex items-center gap-2">
          <button type="button" onClick={() => setOpen(true)} className="hidden items-center gap-2 rounded-full border border-linea bg-papel px-3.5 py-1.5 text-xs font-semibold text-bosque shadow-md hover:bg-white md:flex">
            <span className="h-2 w-2 rounded-full bg-[#2f7a46]" aria-hidden="true" />Pacha IA · voz y texto
          </button>
          <button type="button" onClick={() => setOpen(true)} aria-label="Abrir Pacha IA, asistente por voz y texto" data-testid="pacha-open"
            className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-brote bg-bosque text-white shadow-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ocre">
            <LogoMark size={30} />
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-ocre px-1 text-[9px] font-bold text-white">IA</span>
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-end sm:justify-end sm:bg-transparent sm:p-6">
          <div className="fixed inset-0 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label="Pacha IA" data-testid="pacha-dialog"
            className="relative flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-linea bg-papel shadow-2xl sm:h-[600px] sm:max-h-[90vh] sm:w-[420px] sm:rounded-2xl">
            <div className="aguayo shrink-0" />
            <header className="flex items-center justify-between gap-2 border-b border-linea bg-white px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-linea bg-brote-50">
                  <LogoMark size={24} />
                  <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${listening ? 'bg-rojo' : speakingId ? 'bg-ocre' : 'bg-[#2f7a46]'}`} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-display text-base font-semibold leading-tight text-tinta">Pacha IA
                    <span className="rounded bg-brote px-1.5 text-[10px] font-bold text-bosque">Voz y texto</span></p>
                  <p className="flex items-center gap-1 truncate text-xs text-musgo"><Icon name="pin" size={12} />{m ? `${m.name} (${m.department_name})` : 'Asistente agrícola de Bolivia'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={toggleVoice} aria-pressed={voiceOn} aria-label={voiceOn ? 'Silenciar respuestas en voz' : 'Leer respuestas en voz alta'} title={voiceOn ? 'Voz activada' : 'Voz desactivada'}
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${voiceOn ? 'bg-brote-50 text-bosque' : 'text-musgo hover:bg-linea/40'}`}><Icon name={voiceOn ? 'volume' : 'volumeMute'} size={18} /></button>
                <button type="button" onClick={() => { stopSpeaking(); setSpeakingId(null); setMsgs([welcome()]) }} aria-label="Reiniciar conversación" title="Reiniciar"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-musgo hover:bg-linea/40"><Icon name="refresh" size={17} /></button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar Pacha IA" title="Cerrar"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-musgo hover:bg-linea/40"><Icon name="chevronDown" size={20} /></button>
              </div>
            </header>

            {provider === 'local' && <p className="border-b border-linea bg-[var(--color-surface-low)] px-3 py-1.5 text-[11px] text-musgo" data-testid="pacha-basic">Modo básico: respuestas automáticas con datos reales. La conversación libre con IA se activa cuando el administrador configura la clave de IA.</p>}
            {listening && <p className="flex items-center gap-2 border-b border-rojo/20 bg-rojo-50 px-3 py-1.5 text-xs font-semibold text-rojo" role="status"><span className="h-2 w-2 animate-ping rounded-full bg-rojo" />Le escucho… hable con claridad</p>}
            {voiceErr && <p className="border-b border-rojo/20 bg-rojo-50 px-3 py-1.5 text-xs text-rojo" role="alert">{voiceErr}</p>}

            <div className="flex-1 space-y-3 overflow-y-auto p-3.5 text-[0.95rem]" role="log" aria-live="polite" data-testid="pacha-log">
              {msgs.map(x => (
                <div key={x.id} className={`flex flex-col ${x.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 shadow-sm ${x.role === 'user' ? 'rounded-tr-sm bg-bosque text-white' : x.role === 'system' ? 'border border-rojo/20 bg-rojo-50 text-rojo' : 'rounded-tl-sm border border-linea bg-white text-tinta'}`}>
                    {x.role === 'assistant' ? <RichText text={x.content} /> : <p className="whitespace-pre-line">{x.content}</p>}
                    {x.experts && x.experts.length > 0 && (
                      <ul className="mt-3 space-y-2 border-t border-linea pt-2">
                        {x.experts.map(e => (
                          <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0"><strong className="block truncate">{e.full_name}</strong><span className="block truncate text-xs text-musgo">{e.specialty}{e.is_demo ? ' · ejemplo ficticio' : ''}</span></span>
                            {e.whatsapp_url && <a href={`${e.whatsapp_url}?text=${encodeURIComponent('Hola, le escribo desde PACHA-AGRO.')}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-bosque px-3 py-1 text-xs font-semibold text-white">WhatsApp</a>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] opacity-80">
                      <span>{x.time}</span>
                      {x.role === 'assistant' && isSpeechSynthesisSupported() && (
                        <button type="button" onClick={() => speak(x.id, x.speech ?? x.content)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-bosque hover:bg-brote-50">
                          <Icon name={speakingId === x.id ? 'stop' : 'volume'} size={13} />{speakingId === x.id ? 'Detener' : 'Escuchar'}
                        </button>
                      )}
                    </div>
                    {x.sources && x.sources.length > 0 && <p className="mt-1 text-[10px] text-musgo">Fuente: {x.sources.join(' · ')}</p>}
                    {x.aiError && <p className="mt-1 text-[11px] text-rojo" data-testid="pacha-ai-error">{user?.role === 'admin' ? `La IA no respondió: ${x.aiError}` : 'La IA no está disponible en este momento; se usó la respuesta automática.'}</p>}
                  </div>
                  {x.suggestions && x.suggestions.length > 0 && x.id === msgs[msgs.length - 1]?.id && (
                    <div className="mt-2 flex max-w-[95%] flex-wrap gap-1.5">
                      {x.suggestions.map(s => <button key={s} type="button" disabled={busy} onClick={() => send(s)} className="rounded-full border border-bosque/30 bg-white px-3 py-1.5 text-left text-xs font-semibold text-bosque hover:bg-brote-50">{s}</button>)}
                    </div>
                  )}
                </div>
              ))}
              {busy && <p className="flex w-fit items-center gap-2 rounded-2xl border border-linea bg-white px-3.5 py-2 text-xs text-musgo" role="status"><span className="h-2 w-2 animate-ping rounded-full bg-bosque" />Pacha está revisando los datos de su zona…</p>}
              <div ref={endRef} />
            </div>

            <form onSubmit={submit} className="flex items-center gap-1.5 border-t border-linea bg-white p-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={toggleMic} aria-label={listening ? 'Detener micrófono' : 'Hablar con el micrófono'} aria-pressed={listening}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${listening ? 'bg-rojo text-white' : 'bg-brote-50 text-bosque hover:bg-brote'}`}><Icon name={listening ? 'micOff' : 'mic'} size={20} /></button>
              <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} maxLength={500} disabled={busy} aria-label="Su pregunta" data-testid="pacha-input"
                placeholder={listening ? 'Le escucho…' : 'Escriba o hable su pregunta…'}
                className="min-w-0 flex-1 rounded-full border border-linea bg-papel px-3.5 py-2.5 text-[0.95rem] focus:bg-white focus:outline-none focus:ring-2 focus:ring-bosque" />
              <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar pregunta"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bosque text-white disabled:opacity-40"><Icon name="send" size={18} /></button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
