import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Notice, PageTitle } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../lib/store'

type Msg = { from: 'user' | 'bot' | 'system'; text: string; time: string }
const SUGGESTIONS = ['¿Cuándo puedo sembrar quinua en Challapata?', '¿Hay riesgo de helada mañana?', '¿Cuándo es la reunión de mi comunidad?', 'Quiero avisar que cayó granizo en mi zona.']
const now = () => new Date().toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' })
const SESSION = Math.random().toString(36).slice(2, 12)

export default function WhatsApp() {
  const { user } = useApp()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sim, setSim] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const intro: Msg[] = [{ from: 'bot', time: now(), text: '👋 Hola, soy el asistente de AgroBolivia. Pregúnteme sobre siembra, heladas o su comunidad.' }]
    if (!user) { setMsgs(intro); return }
    api<any[]>('/api/whatsapp/inbox').then(inbox => {
      const received = inbox.slice(0, 3).reverse().map(m => ({ from: 'bot' as const, time: new Date(m.created_at).toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' }), text: `${m.body}\n\n(mensaje simulado · plantilla "${m.template}")` }))
      setMsgs([...received, ...intro])
    }).catch(() => setMsgs(intro))
  }, [user])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs])

  const send = async (t: string) => {
    const clean = t.trim()
    if (!clean || busy) return
    setMsgs(m => [...m, { from: 'user', text: clean, time: now() }]); setText(''); setBusy(true)
    try {
      const r = await api<{ replies: string[] }>(`/api/whatsapp/simulate?mode=${sim ? 'simulado' : 'real'}`, { body: { text: clean, session_id: SESSION } })
      setMsgs(m => [...m, ...r.replies.map(x => ({ from: 'bot' as const, text: x, time: now() }))])
    } catch (e) {
      setMsgs(m => [...m, { from: 'system', text: (e as Error).message, time: now() }])
    } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); send(text) }

  return (
    <div className="space-y-3">
      <PageTitle icon="💬" title="Consultar por WhatsApp" />
      <Notice tone="sim">
        <strong>🧪 SIMULADOR.</strong> WhatsApp todavía <strong>no está conectado</strong>. Aquí puede probar cómo funcionará el asistente. No se envían mensajes reales.
      </Notice>
      {!user && <p className="text-musgo">Puede preguntar por clima y siembra sin cuenta. Para reuniones y reportes, <a className="font-semibold text-bosque underline" href="#/ingresar">ingrese</a>.</p>}
      <label className="flex items-center gap-2 text-musgo"><input type="checkbox" className="h-5 w-5 accent-[#1e4a2c]" checked={sim} onChange={e => setSim(e.target.checked)} />Usar datos meteorológicos simulados (si no hay pronóstico real)</label>

      <div className="overflow-hidden rounded-2xl border border-linea">
        <div className="flex items-center gap-3 bg-[#1f5c3e] px-4 py-3 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brote text-xl" aria-hidden="true">🌱</span>
          <div><div className="font-bold">AgroBolivia</div><div className="text-sm text-brote">asistente agrícola · simulación</div></div>
        </div>
        <div className="h-[52vh] min-h-72 space-y-2 overflow-y-auto bg-[#efe9dc] p-3" aria-live="polite" role="log">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-[1.02rem] shadow-sm ${m.from === 'user' ? 'rounded-br-sm bg-[#d6efc9]' : m.from === 'system' ? 'bg-rojo-50 text-rojo' : 'rounded-bl-sm bg-white'}`}>
                {m.text}<div className="mt-0.5 text-right text-xs text-musgo">{m.time}</div>
              </div>
            </div>
          ))}
          {busy && <div className="text-musgo">escribiendo…</div>}
          <div ref={end} />
        </div>
        <div className="flex gap-2 overflow-x-auto bg-papel px-3 py-2">
          {SUGGESTIONS.map(s => <button key={s} onClick={() => send(s)} className="min-h-10 shrink-0 rounded-full border border-bosque-600 px-3 text-sm font-semibold text-bosque">{s}</button>)}
        </div>
        <form onSubmit={submit} className="flex gap-2 border-t border-linea bg-papel p-2">
          <label htmlFor="chat" className="sr-only">Escriba su mensaje</label>
          <input id="chat" className="min-h-12 min-w-0 flex-1 rounded-full border-2 border-linea bg-white px-4 text-lg" value={text} onChange={e => setText(e.target.value)} placeholder="Escriba su pregunta…" maxLength={500} autoComplete="off" />
          <button className="min-h-12 rounded-full bg-[#1f5c3e] px-5 font-bold text-white disabled:opacity-50" disabled={busy || !text.trim()}>Enviar</button>
        </form>
      </div>
      <details className="rounded-xl border border-linea bg-papel p-3">
        <summary className="cursor-pointer font-semibold text-bosque">¿Cómo se conectará WhatsApp de verdad?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Con la plataforma oficial <strong>WhatsApp Business (Cloud API de Meta)</strong>, no con automatizaciones no autorizadas.</li>
          <li>Solo enviamos recordatorios a quienes <strong>aceptaron</strong> recibirlos. Escriba BAJA para dejar de recibirlos.</li>
          <li>Los recordatorios usan <strong>plantillas aprobadas</strong> por Meta; pueden tener costo por mensaje.</li>
          <li>El mismo asistente que ve aquí responderá en WhatsApp cuando existan credenciales.</li>
        </ul>
      </details>
    </div>
  )
}
