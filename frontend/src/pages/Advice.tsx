import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { MunicipalitySelect } from '../components/SiteChrome'
import { Button, ErrorBox, Loading, PageTitle, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import type { AdviceT, ExpertT, Resources, ResourceT } from '../lib/types'

const QUICK = [
  'Las hojas de mi papa tienen manchas oscuras',
  '¿Habrá helada esta semana en mi zona?',
  '¿Qué variedad de quinua me conviene?',
  '¿Cómo mejoro la humedad de mi suelo?',
]
const CROPS = [['', 'Cualquier cultivo'], ['quinua', 'Quinua'], ['papa', 'Papa'], ['maiz', 'Maíz'], ['haba', 'Haba'], ['cebada', 'Cebada']] as const

/** Asesoría: el asistente responde y conecta con técnicos del directorio y con recursos útiles.
 *  Los contactos y enlaces vienen del directorio de la plataforma, no de la IA. */
export default function Advice({ presetCrop }: { presetCrop?: string }) {
  const { municipalityId, user } = useApp()
  const [q, setQ] = useState('')
  const [crop, setCrop] = useState(presetCrop ?? user?.crops[0] ?? '')
  const [res, setRes] = useState<AdviceT | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [all, setAll] = useState<Resources | null>(null)
  useEffect(() => { api<Resources>('/api/resources').then(setAll).catch(() => setAll(null)) }, [])

  const ask = async (question: string) => {
    if (question.trim().length < 3) { setErr('Escriba su pregunta.'); return }
    setQ(question); setBusy(true); setErr(null); setRes(null)
    try {
      setRes(await api<AdviceT>('/api/assistant', { timeoutMs: 60000, body: { question: question.trim(), municipality_id: municipalityId, crop: crop || null } }))
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); ask(q) }

  return (
    <div className="space-y-6">
      <PageTitle title="Asesoría" subtitle="Cuéntenos su problema con sus palabras. Le orientamos y le damos contactos de técnicos y sitios útiles." />

      <form onSubmit={submit} className="panel space-y-4">
        <label className="block">
          <span className="eyebrow">Su consulta</span>
          <textarea className={`${inputCls} mt-1 min-h-28`} value={q} onChange={e => setQ(e.target.value)} maxLength={500}
            placeholder="Ejemplo: las hojas de mi papa tienen manchas oscuras, ¿qué hago?" />
        </label>
        <div className="flex flex-wrap gap-2" aria-label="Preguntas frecuentes">
          {QUICK.map(t => <button type="button" key={t} onClick={() => ask(t)} className="rounded-lg bg-[var(--color-surface-low)] px-3 py-2 text-left text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-surface-high)]">{t}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-sm font-semibold">Municipio</span>
            <span className="block rounded-md border border-[#bdb6a6] bg-white px-3 py-2.5"><MunicipalitySelect className="w-full" /></span></label>
          <label className="block"><span className="mb-1 block text-sm font-semibold">Cultivo</span>
            <select className={inputCls} value={crop} onChange={e => setCrop(e.target.value)}>{CROPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <Button className="w-full sm:w-auto" disabled={busy}>{busy ? 'Buscando respuesta…' : 'Preguntar'}</Button>
      </form>

      {busy && <Loading text="Buscando la mejor orientación y contactos…" />}
      {err && <ErrorBox message={err} />}
      {res && <AdviceResult r={res} question={q} />}

      {all && <ResourceDirectory data={all} />}
    </div>
  )
}

function AdviceResult({ r, question }: { r: AdviceT; question: string }) {
  return (
    <section className="space-y-5" aria-live="polite" data-testid="advice-result">
      <div className="panel">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow !mb-0">Respuesta</p>
          <span className="rounded-sm border border-[var(--color-outline-variant)] px-2 py-0.5 text-[.7rem] font-semibold uppercase tracking-[.08em] text-[var(--color-on-variant)]" data-testid="advice-mode">
            {r.mode === 'ia' ? 'Redactada con IA (Claude)' : 'Respuesta automática básica'}
          </span>
        </div>
        <p className="whitespace-pre-line text-lg leading-relaxed">{r.answer}</p>
        {r.location && <p className="mt-2 text-sm text-[var(--color-on-variant)]">Para: {r.location}</p>}
      </div>

      <div>
        <h2 className="section-title !text-[1.5rem]">Técnicos recomendados</h2>
        {r.experts.length === 0 ? (
          <p className="mt-2 text-[var(--color-on-variant)]">Aún no hay técnicos registrados para su zona y cultivo. Estas instituciones brindan asistencia técnica:</p>
        ) : (
          <ul className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{r.experts.map(e => <li key={e.id}><ExpertCard e={e} question={question} /></li>)}</ul>
        )}
      </div>

      <div>
        <h2 className="section-title !text-[1.5rem]">Sitios recomendados para su consulta</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">{r.resources.map(x => <li key={x.id}><ResourceCard r={x} /></li>)}</ul>
      </div>
    </section>
  )
}

function ExpertCard({ e, question }: { e: ExpertT; question: string }) {
  const msg = encodeURIComponent(`Hola, le escribo desde PACHA-AGRO. Mi consulta: ${question}`)
  return (
    <div className="panel h-full !p-5" data-testid="expert-card">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-[1.2rem] font-semibold text-[#161d17]">{e.full_name}</h3>
        {e.verified && <span className="flex items-center gap-1 text-xs font-semibold text-[var(--color-tint)]"><Icon name="check" size={14} />Verificado</span>}
      </div>
      <p className="mt-1 text-sm">{e.specialty}</p>
      {e.institution && <p className="text-sm text-[var(--color-on-variant)]">{e.institution}</p>}
      {e.is_demo && <p className="mt-1 text-xs font-semibold text-[var(--color-secondary)]">Contacto de demostración (ficticio)</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {e.whatsapp_url && <a className="btn-primary !min-h-10 !px-3" href={`${e.whatsapp_url}?text=${msg}`} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={16} />WhatsApp</a>}
        {e.phone && <a className="btn-soft !w-auto !min-h-10 !px-3" href={`tel:${e.phone}`}>Llamar</a>}
        {e.email && <a className="btn-soft !w-auto !min-h-10 !px-3" href={`mailto:${e.email}?subject=${encodeURIComponent('Consulta desde PACHA-AGRO')}&body=${msg}`}>Correo</a>}
      </div>
    </div>
  )
}

function ResourceCard({ r }: { r: ResourceT }) {
  return (
    <a href={r.url} target="_blank" rel="noopener noreferrer" className="tool-card h-full" data-testid="resource-card">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-[1.1rem] font-semibold text-[#161d17]">{r.name}</h3>
          {r.official && <span className="shrink-0 rounded-sm bg-[var(--color-secondary-fixed)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-secondary)]">Oficial · Bolivia</span>}
        </div>
        <p className="mt-1 text-sm text-[var(--color-on-variant)]">{r.description}</p>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">Abrir sitio <Icon name="arrowRight" size={14} /></span>
    </a>
  )
}

function ResourceDirectory({ data }: { data: Resources }) {
  return (
    <section className="panel" aria-labelledby="recursos">
      <p className="eyebrow">Recursos útiles</p>
      <h2 id="recursos" className="section-title">Sitios para cuidar su cultivo</h2>
      <p className="mt-1 text-sm text-[var(--color-on-variant)]">{data.note}</p>
      {Object.entries(data.categories).map(([k, label]) => (
        <div key={k} className="mt-6">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-[.1em] text-[var(--color-primary)]">{label}</h3>
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.items.filter(i => i.category === k).map(i => <li key={i.id}><ResourceCard r={i} /></li>)}
          </ul>
        </div>
      ))}
    </section>
  )
}
