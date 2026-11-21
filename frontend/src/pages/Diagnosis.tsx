import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Listen } from '../components/Listen'
import { Button, ErrorBox, Loading, Notice, PageTitle, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { CROP_LIST, useMyCrops } from '../lib/prefs'
import { useApp } from '../lib/store'
import type { DiagnosisT, SymptomT } from '../lib/types'
import { ExpertCard, ResourceCard } from './Advice'

/** Reduce la foto en el celular antes de enviarla: menos datos móviles y respuesta más rápida. */
async function compress(file: File): Promise<{ data: string; preview: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url })
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const preview = canvas.toDataURL('image/jpeg', 0.82)
    return { data: preview.split(',')[1], preview }
  } finally { URL.revokeObjectURL(url) }
}

const CONF = { alta: 'Probable', media: 'Posible', baja: 'Poco probable' } as const
const URG = { alta: { t: 'Atención urgente', c: 'bg-[#faefec] text-[#8a2e22]' }, media: { t: 'Revise pronto', c: 'bg-[#fbf6e9] text-[#5f4500]' }, baja: { t: 'Sin urgencia', c: 'bg-[#f1f6ee] text-[#1f5531]' } } as const

export default function Diagnosis() {
  const { user, municipalityId } = useApp()
  const mine = useMyCrops(user)
  const [crop, setCrop] = useState(mine[0] ?? '')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<{ data: string; preview: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<DiagnosisT | null>(null)
  const [guideOnly, setGuideOnly] = useState<SymptomT[] | null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  const pick = async (f: File | undefined) => {
    if (!f) return
    setErr(null); setRes(null)
    try { setPhoto(await compress(f)) } catch { setErr('No se pudo leer la foto. Intente con otra.') }
  }
  const send = async () => {
    if (!photo) return
    setBusy(true); setErr(null); setRes(null)
    try {
      setRes(await api<DiagnosisT>('/api/diagnosis', { timeoutMs: 90000, body: { image: photo.data, media_type: 'image/jpeg', crop: crop || null, municipality_id: municipalityId, notes: notes.trim() || null } }))
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const openGuide = () => api<{ guide: SymptomT[] }>('/api/diagnosis/guide').then(d => setGuideOnly(d.guide)).catch(e => setErr(e.message))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <a href="#/campo" className="link-caps"><Icon name="arrowRight" size={14} className="rotate-180" />Mi campo</a>
      <PageTitle title="Revisar una planta" subtitle="Tome una foto de cerca, con luz de día, de la hoja o el tallo con el problema." />

      <section className="panel space-y-4">
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => pick(e.target.files?.[0])} data-testid="photo-camera" />
        <input ref={galRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => pick(e.target.files?.[0])} data-testid="photo-input" />
        {photo
          ? <div className="flex flex-col items-start gap-3 sm:flex-row">
            <img src={photo.preview} alt="Foto de la planta" className="max-h-64 w-full rounded-xl object-cover sm:w-64" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold">Foto lista.</p>
              <p className="text-[var(--color-on-variant)]">Se usa solo para esta consulta y no se guarda.</p>
              <button type="button" className="link-caps" onClick={() => camRef.current?.click()}>Tomar otra</button>
            </div>
          </div>
          : <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" className="btn-primary !min-h-16" onClick={() => camRef.current?.click()}><Icon name="camera" size={22} />Tomar una foto</button>
            <button type="button" className="btn-soft !min-h-16" onClick={() => galRef.current?.click()}>Elegir de la galería</button>
          </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-sm font-semibold">Cultivo</span>
            <select className={inputCls} value={crop} onChange={e => setCrop(e.target.value)}>
              <option value="">No sé / otro</option>{CROP_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block text-sm font-semibold">Algo más (opcional)</span>
            <input className={inputCls} maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej.: apareció después de la lluvia" /></label>
        </div>
        <Button className="w-full" disabled={!photo || busy} onClick={send}>{busy ? 'Revisando la foto…' : 'Ver posibles causas'}</Button>
        <p className="text-sm text-[var(--color-on-variant)]">¿No puede tomar una foto? <button type="button" className="font-semibold text-[var(--color-primary)] underline" onClick={openGuide}>Use la guía por síntomas</button>.</p>
      </section>

      {busy && <Loading text="Revisando la foto y buscando técnicos de su zona…" />}
      {err && <ErrorBox message={err} />}
      {res && <Result r={res} />}
      {!res && guideOnly && <Guide items={guideOnly} />}
    </div>
  )
}

function Result({ r }: { r: DiagnosisT }) {
  const x = r.result
  const speech = x ? [x.summary, ...x.candidates.map(c => `${CONF[c.confidence]}: ${c.name}.`), 'Qué hacer ahora:', ...x.actions].join(' ') : ''
  return (
    <section className="space-y-6" data-testid="diagnosis-result" aria-live="polite">
      {x ? (
        <div className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow !mb-0">Orientación por foto</p>
            <span className={`rounded px-2 py-1 text-xs font-bold ${URG[x.urgency].c}`}>{URG[x.urgency].t}</span>
          </div>
          {(!x.is_plant || x.image_quality === 'insuficiente') && <Notice tone="warn">La foto no permite ver bien el problema. Tome otra de cerca, con luz de día, mostrando también la parte de abajo de la hoja.</Notice>}
          <p className="text-lg">{x.summary}</p>
          <Listen text={speech} />
          {x.candidates.length > 0 && <div>
            <h2 className="font-display text-[1.25rem] font-semibold text-[var(--color-primary)]">Posibles causas</h2>
            <ol className="mt-2 space-y-2">
              {x.candidates.map(c => (
                <li key={c.name} className="rounded-xl bg-[var(--color-surface-low)] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="text-[1.05rem]">{c.name}</strong>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-on-variant)]">{c.kind_label} · {CONF[c.confidence]}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-on-variant)]">{c.signs}</p>
                </li>
              ))}
            </ol>
          </div>}
          <TwoLists verify={x.verify} actions={x.actions} />
        </div>
      ) : (
        <>
          <Notice tone="info">{r.ai_available ? 'No se pudo revisar la foto en este momento.' : 'La revisión automática de fotos no está activa en este servidor.'} Use la guía por síntomas y consulte a un técnico con su foto.</Notice>
          {r.guide && <Guide items={r.guide} />}
        </>
      )}
      <Notice tone="warn">{r.note}</Notice>
      <div>
        <h2 className="section-title">Técnicos que pueden ayudarle</h2>
        {r.experts.length ? <div className="mt-4 grid gap-4 md:grid-cols-2">{r.experts.map(e => <ExpertCard key={e.id} e={e} question={x ? `Mi planta tiene: ${x.summary}` : 'Tengo una planta enferma'} />)}</div>
          : <p className="mt-2 text-[var(--color-on-variant)]">Todavía no hay técnicos registrados para su zona. Consulte en las instituciones de abajo o en su municipio.</p>}
      </div>
      <div>
        <h2 className="section-title">Para identificar y tratar</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">{r.resources.map(x2 => <ResourceCard key={x2.id} r={x2} />)}</div>
      </div>
    </section>
  )
}

function TwoLists({ verify, actions }: { verify: string[]; actions: string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div><h3 className="font-semibold">Revise en su parcela</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{verify.map(v => <li key={v}>{v}</li>)}</ul></div>
      <div><h3 className="font-semibold">Qué hacer ahora (sin químicos)</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{actions.map(v => <li key={v}>{v}</li>)}</ul></div>
    </div>
  )
}

function Guide({ items }: { items: SymptomT[] }) {
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => setOpen(null), [items])
  return (
    <section className="panel" data-testid="symptom-guide">
      <h2 className="font-display text-[1.3rem] font-semibold text-[var(--color-primary)]">Guía por síntomas</h2>
      <p className="mt-1 text-sm text-[var(--color-on-variant)]">Elija lo que más se parece a lo que ve. Es una orientación general, no un diagnóstico.</p>
      <ul className="mt-4 divide-y divide-[var(--color-outline-variant)]">
        {items.map(s => (
          <li key={s.id}>
            <button type="button" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}
              className="flex min-h-12 w-full items-center justify-between gap-2 py-2 text-left font-semibold">
              {s.title}<Icon name="arrowRight" size={16} className={open === s.id ? 'rotate-90' : ''} />
            </button>
            {open === s.id && (
              <div className="space-y-3 pb-4">
                <p><strong>Podría ser:</strong> {s.could_be}</p>
                <TwoLists verify={s.check} actions={s.first_steps} />
                <Listen text={`${s.title}. Podría ser: ${s.could_be} Qué hacer: ${s.first_steps.join(' ')}`} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
