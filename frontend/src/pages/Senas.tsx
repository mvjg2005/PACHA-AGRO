import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Listen } from '../components/Listen'
import { MunicipalitySelect } from '../components/SiteChrome'
import { Button, ErrorBox, Loading, Notice, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import type { OutcomeT, PachagramaT, ReliabilityRow, SenaT, SenaZoneT, SenasCatalog } from '../lib/types'

const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })
const RAIN_ORDER = ['seco', 'normal', 'lluvioso'] as const
const RAIN_COLOR: Record<string, string> = { seco: '#a0522d', normal: '#7a8b6f', lluvioso: '#2f5d8a' }

/** Señas andinas medidas con datos + Pachagrama: el saber local y el satélite, lado a lado. */
export default function Senas() {
  const { municipalityId, findMunicipality } = useApp()
  const [cat, setCat] = useState<SenasCatalog | null>(null)
  const [campaign, setCampaign] = useState<number | null>(null)
  const [zone, setZone] = useState<SenaZoneT | null>(null)
  const [pacha, setPacha] = useState<PachagramaT | null>(null)
  const [rel, setRel] = useState<ReliabilityRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const m = findMunicipality(municipalityId)

  useEffect(() => { api<SenasCatalog>('/api/senas').then(c => { setCat(c); setCampaign(c.current_campaign) }).catch(e => setErr(e.message)) }, [])
  useEffect(() => {
    if (!municipalityId || campaign === null) return
    setZone(null); setPacha(null); setErr(null)
    const q = `municipality_id=${encodeURIComponent(municipalityId)}&campaign=${campaign}`
    api<SenaZoneT>(`/api/senas/zona?${q}`).then(setZone).catch(e => setErr(e.message))
    api<PachagramaT>(`/api/pachagrama?${q}`, { timeoutMs: 60000 }).then(setPacha).catch(e => setErr(e.message))
  }, [municipalityId, campaign, tick])
  useEffect(() => {
    if (!m) return
    api<{ senas: ReliabilityRow[] }>(`/api/senas/confiabilidad?department_id=${m.department_id}`, { timeoutMs: 90000 }).then(r => setRel(r.senas)).catch(() => setRel([]))
  }, [m?.department_id, tick])

  if (!cat) return err ? <ErrorBox message={err} /> : <Loading />
  const campaigns = Array.from({ length: cat.current_campaign - 2015 + 1 }, (_, i) => cat.current_campaign - i)

  return (
    <div className="space-y-8" data-testid="senas-page">
      <header className="sow-card">
        <div className="sow-glow" aria-hidden="true" />
        <div className="relative">
          <span className="chip-light"><Icon name="sun" size={14} />Saber andino + satélite</span>
          <h1 className="mt-4 font-display text-[2.2rem] leading-tight text-white">Señas que se miden</h1>
          <p className="mt-3 max-w-3xl text-[#d5dcd3]">{cat.intro}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Listen text={`Señas que se miden. ${cat.intro}`} className="!text-white hover:!bg-white/10" />
            <a href="#senas-registrar" className="btn-light">Registrar una seña <Icon name="arrowRight" size={16} /></a>
          </div>
        </div>
      </header>

      <section className="panel grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-sm font-semibold">Municipio</span>
          <span className="block rounded-md border border-[#bdb6a6] bg-white px-3 py-2.5"><MunicipalitySelect className="w-full" /></span></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Campaña agrícola (julio a junio)</span>
          <select className={inputCls} value={campaign ?? ''} onChange={e => setCampaign(Number(e.target.value))} aria-label="Campaña">
            {campaigns.map(c => <option key={c} value={c}>{c}–{c + 1}{c === cat.current_campaign ? ' (actual)' : ''}</option>)}
          </select></label>
      </section>

      {!m ? <Notice tone="info">Elija su municipio para ver las señas y el Pachagrama de su zona.</Notice> : <>
        {err && <ErrorBox message={err} onRetry={() => setTick(t => t + 1)} />}
        {zone ? <TwoKnowledges zone={zone} cat={cat} /> : !err && <Loading text="Reuniendo las señas de su zona…" />}
        {pacha ? <Pachagrama p={pacha} /> : !err && <Loading text="Armando el Pachagrama con datos satelitales…" />}
        <Reliability rows={rel} dept={m.department_name} method={cat.method} />
        <Register cat={cat} municipalityId={m.id} onSaved={() => setTick(t => t + 1)} mine={zone?.mine ?? []} />
      </>}
    </div>
  )
}

function Votes({ votes, n, title }: { votes: Record<string, number>; n: number; title: string }) {
  const total = RAIN_ORDER.reduce((a, k) => a + (votes[k] ?? 0), 0)
  return (
    <div>
      <p className="text-sm font-semibold">{title} <span className="font-normal text-[var(--color-on-variant)]">({n} {n === 1 ? 'seña' : 'señas'})</span></p>
      {total === 0 ? <p className="mt-1 text-sm text-[var(--color-on-variant)]">Todavía no hay señas sobre la lluvia.</p> : <>
        <div className="mt-2 flex h-7 overflow-hidden rounded-md" role="img" aria-label={RAIN_ORDER.map(k => `${k}: ${votes[k] ?? 0}`).join(', ')}>
          {RAIN_ORDER.map(k => (votes[k] ?? 0) > 0 && <span key={k} style={{ width: `${(votes[k] / total) * 100}%`, background: RAIN_COLOR[k] }} className="flex items-center justify-center text-[11px] font-bold text-white">{Math.round((votes[k] / total) * 100)}%</span>)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--color-on-variant)]">
          {RAIN_ORDER.map(k => <span key={k}><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: RAIN_COLOR[k] }} />{k === 'seco' ? 'Año seco' : k === 'normal' ? 'Normal' : 'Lluvioso'}</span>)}
        </div>
      </>}
    </div>
  )
}

function OutcomeBox({ o, kind }: { o?: OutcomeT; kind: 'lluvia' | 'helada' }) {
  if (!o) return null
  const title = kind === 'lluvia' ? 'Lluvia de noviembre a marzo' : 'Heladas tempranas (septiembre a noviembre)'
  if (o.status === 'pendiente') return <p className="text-sm"><strong>{title}:</strong> se sabrá desde el {fmt(o.available_after!)}.</p>
  if (o.status === 'sin_datos') return <p className="text-sm"><strong>{title}:</strong> sin datos satelitales suficientes.</p>
  return (
    <div className="rounded-xl bg-[var(--color-surface-low)] p-4" data-testid={`outcome-${kind}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-on-variant)]">{title}</p>
      <p className="mt-1 font-display text-[1.5rem] font-semibold" style={{ color: kind === 'lluvia' ? RAIN_COLOR[o.value!] : 'var(--color-primary)' }}>{o.label}</p>
      <p className="text-sm">{o.observed} {o.unit} · promedio de {o.years} años: {o.normal} {o.unit}</p>
      <p className="text-xs text-[var(--color-on-variant)]">Tercio normal: entre {o.low} y {o.high} {o.unit}. Fuente: NASA POWER.</p>
    </div>
  )
}

function TwoKnowledges({ zone, cat }: { zone: SenaZoneT; cat: SenasCatalog }) {
  return (
    <section aria-labelledby="dos-saberes" className="grid gap-4 lg:grid-cols-2" data-testid="two-knowledges">
      <div className="panel space-y-4">
        <p className="eyebrow">Saber local</p>
        <h2 id="dos-saberes" className="font-display text-[1.4rem] font-semibold text-[var(--color-primary)]">Lo que anuncian las señas · {zone.campaign_label}</h2>
        <Votes votes={zone.local.votes.lluvia} n={zone.local.n} title={zone.municipality.name} />
        <Votes votes={zone.department.votes.lluvia} n={zone.department.n} title={`Todo ${zone.municipality.department_name}`} />
        {zone.recent.length > 0 && <ul className="space-y-1 text-sm">
          {zone.recent.slice(0, 6).map(o => <li key={o.id} className="flex justify-between gap-2"><span>{o.sena_name}: <strong>{o.reading_label}</strong>{o.is_demo && <span className="ml-1 text-xs text-[var(--color-secondary)]">(ejemplo)</span>}</span><span className="shrink-0 text-[var(--color-on-variant)]">{o.observed_on.slice(5).split('-').reverse().join('/')}</span></li>)}
        </ul>}
      </div>
      <div className="panel space-y-4">
        <p className="eyebrow">Medido por satélite</p>
        <h2 className="font-display text-[1.4rem] font-semibold text-[var(--color-primary)]">Lo que pasó en {zone.municipality.name}</h2>
        <OutcomeBox o={zone.outcome.lluvia} kind="lluvia" />
        <OutcomeBox o={zone.outcome.helada} kind="helada" />
        <p className="text-xs text-[var(--color-on-variant)]">{cat.method}</p>
      </div>
    </section>
  )
}

/** Pachagrama: la campaña semana a semana (lluvia, promedio, heladas, reportes y señas). */
function Pachagrama({ p }: { p: PachagramaT }) {
  const W = 52, cw = 12, h = 110, top = 8
  const max = Math.max(10, ...p.weeks.map(w => Math.max(w.rain_mm ?? 0, w.normal_mm ?? 0)))
  const y = (v: number) => top + h - (v / max) * h
  const line = p.weeks.map((w, i) => w.normal_mm == null ? null : `${i * cw + cw / 2},${y(w.normal_mm)}`).filter(Boolean).join(' ')
  const monthStarts = p.weeks.map((w, i) => ({ i, m: Number(w.start.slice(5, 7)), d: Number(w.start.slice(8, 10)) })).filter(x => x.d <= 7)
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const totalRain = p.weeks.reduce((a, w) => a + (w.rain_mm ?? 0), 0)
  const frost = p.weeks.reduce((a, w) => a + (w.frost_days ?? 0), 0)
  const reports = p.weeks.reduce((a, w) => a + Object.values(w.reports).reduce((x, y2) => x + y2, 0), 0)
  return (
    <section className="panel" aria-labelledby="pacha-title" data-testid="pachagrama">
      <p className="eyebrow">Pachagrama digital</p>
      <h2 id="pacha-title" className="section-title">El calendario vivo de {p.municipality.name}, {p.campaign_label}</h2>
      <p className="mt-1 text-sm text-[var(--color-on-variant)]">Cada columna es una semana, de julio a junio. Junta la lluvia y las heladas medidas por satélite, el promedio de cada semana desde 2001, los reportes de la comunidad y las señas registradas.</p>
      {!p.data_available ? <Notice tone="warn">Los datos satelitales no están disponibles ahora. Intente más tarde.</Notice> : (
        <>
          <div className="-mx-2 mt-4 overflow-x-auto px-2" tabIndex={0} aria-label="Pachagrama (deslice para ver todo el año)">
          <svg viewBox={`0 0 ${W * cw} ${h + top + 74}`} className="w-full min-w-[600px]" role="img"
            aria-label={`Lluvia total ${Math.round(totalRain)} milímetros, ${frost} días de helada y ${reports} reportes comunitarios en la campaña.`}>
            {p.weeks.map((w, i) => w.rain_mm != null && (
              <rect key={w.start} x={i * cw + 1.5} width={cw - 3} y={y(w.rain_mm)} height={Math.max(0.5, top + h - y(w.rain_mm))} rx={1.5}
                fill={w.normal_mm != null && w.rain_mm > w.normal_mm * 1.5 ? '#2f5d8a' : '#6f93b8'}><title>{`Semana del ${w.start}: ${w.rain_mm} mm (promedio ${w.normal_mm ?? '—'} mm)`}</title></rect>
            ))}
            {p.weeks.map((w, i) => w.future && <rect key={`f${i}`} x={i * cw} width={cw} y={top} height={h} fill="#f3f4ef" />)}
            {line && <polyline points={line} fill="none" stroke="#8a5a2b" strokeWidth={1.6} strokeDasharray="3 2" />}
            <line x1={0} x2={W * cw} y1={top + h} y2={top + h} stroke="#c9c5b9" />
            {/* Heladas */}
            {p.weeks.map((w, i) => (w.frost_days ?? 0) > 0 && <circle key={`h${i}`} cx={i * cw + cw / 2} cy={top + h + 14} r={1.5 + Math.min(4, w.frost_days!)} fill="#5b7fa6" opacity={0.85}><title>{`${w.frost_days} días de helada`}</title></circle>)}
            {/* Reportes comunitarios */}
            {p.weeks.map((w, i) => Object.keys(w.reports).length > 0 && <rect key={`r${i}`} x={i * cw + 2} y={top + h + 26} width={cw - 4} height={8} rx={2} fill="#a63a2b"><title>{Object.entries(w.reports).map(([k, n]) => `${n} reporte(s) de ${k}`).join(', ')}</title></rect>)}
            {/* Señas */}
            {p.weeks.map((w, i) => w.senas.length > 0 && <path key={`s${i}`} d={`M${i * cw + cw / 2} ${top + h + 38} l4 7 h-8 z`} fill="#b07a12"><title>{w.senas.join(', ')}</title></path>)}
            {monthStarts.map(x => <text key={x.i} x={x.i * cw + 1} y={top + h + 64} fontSize={11} fill="#5c625a">{MES[x.m - 1]}</text>)}
          </svg>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-on-variant)]">
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#6f93b8]" />Lluvia de la semana</span>
            <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-[#8a5a2b] align-middle" />Promedio desde 2001</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#5b7fa6]" />Días de helada</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#a63a2b]" />Reportes de la comunidad</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 bg-[#b07a12]" style={{ clipPath: 'polygon(50% 0,100% 100%,0 100%)' }} />Señas registradas</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-[var(--color-surface-low)] p-3"><div className="text-xs font-semibold uppercase text-[var(--color-on-variant)]">Lluvia</div><div className="font-bold">{Math.round(totalRain)} mm</div></div>
            <div className="rounded-xl bg-[var(--color-surface-low)] p-3"><div className="text-xs font-semibold uppercase text-[var(--color-on-variant)]">Heladas</div><div className="font-bold">{frost} días</div></div>
            <div className="rounded-xl bg-[var(--color-surface-low)] p-3"><div className="text-xs font-semibold uppercase text-[var(--color-on-variant)]">Reportes</div><div className="font-bold">{reports}</div></div>
          </div>
          <p className="mt-3 text-xs text-[var(--color-on-variant)]">{p.note} Inspirado en el Pachagrama que usan los Yapuchiris del Altiplano.</p>
        </>
      )}
    </section>
  )
}

function Reliability({ rows, dept, method }: { rows: ReliabilityRow[] | null; dept: string; method: string }) {
  return (
    <section className="panel" aria-labelledby="rel-title" data-testid="reliability">
      <p className="eyebrow">Evidencia</p>
      <h2 id="rel-title" className="section-title">¿Las señas aciertan en {dept}?</h2>
      <p className="mt-1 text-sm text-[var(--color-on-variant)]">Cada seña ya evaluada se compara con lo que midió el satélite. La marca vertical muestra cuánto se acertaría adivinando al azar.</p>
      {rows === null ? <Loading text="Calculando aciertos…" /> : rows.length === 0 ? <p className="mt-3 text-[var(--color-on-variant)]">Todavía no hay señas registradas en este departamento. Sea la primera persona en registrar una.</p> : (
        <ul className="mt-4 space-y-4">
          {rows.map(r => (
            <li key={r.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{r.name}</span>
                <span className="text-sm">{r.evaluated ? <><strong>{r.hits} de {r.evaluated}</strong> aciertos ({r.rate}%)</> : 'Aún sin evaluar'}</span>
              </div>
              {r.evaluated > 0 && (
                <div className="relative mt-1 h-3 rounded-full bg-[var(--color-surface-high)]" role="img" aria-label={`Acierto ${r.rate}%, azar ${r.chance}%`}>
                  <div className="h-full rounded-full" style={{ width: `${r.rate}%`, background: (r.rate ?? 0) > (r.chance ?? 0) ? '#2f7a46' : '#a0522d' }} />
                  <span className="absolute -top-1 h-5 w-0.5 bg-[#161d17]" style={{ left: `${r.chance}%` }} title={`Azar: ${r.chance}%`} />
                </div>
              )}
              <p className="mt-1 text-xs text-[var(--color-on-variant)]">
                {r.observations} {r.observations === 1 ? 'registro' : 'registros'}{r.campaigns.length > 0 && ` · campañas ${r.campaigns.join(', ')}`}{r.evaluated > 0 && ` · azar: ${r.chance}%`}
                {r.evaluated > 0 && !r.enough && ' · todavía son pocos datos para concluir'}
              </p>
              {r.demo > 0 && <p className="text-xs font-semibold text-[var(--color-secondary)]">Incluye {r.demo} {r.demo === 1 ? 'registro' : 'registros'} de ejemplo (ficticios). Lo que pasó cada año sí es dato real del satélite.</p>}
            </li>
          ))}
        </ul>
      )}
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-[var(--color-primary)]">¿Cómo se mide?</summary><p className="mt-2 text-[var(--color-on-variant)]">{method}</p></details>
    </section>
  )
}

function Register({ cat, municipalityId, onSaved, mine }: { cat: SenasCatalog; municipalityId: string; onSaved: () => void; mine: SenaZoneT['mine'] }) {
  const { user } = useApp()
  const [sel, setSel] = useState<SenaT | null>(null)
  const [readingId, setReading] = useState('')
  const [day, setDay] = useState(today())
  const [custom, setCustom] = useState('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!sel || !readingId) return
    setBusy(true); setMsg(null)
    try {
      await api('/api/senas/observaciones', { body: { sena_id: sel.id, reading: readingId, municipality_id: municipalityId, observed_on: day, custom_name: custom, notes } })
      setMsg({ ok: true, text: 'Seña registrada. Al terminar la temporada sabremos si acertó.' }); setSel(null); setReading(''); setCustom(''); setNotes(''); onSaved()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  const del = async (id: number) => { try { await api(`/api/senas/observaciones/${id}`, { method: 'DELETE' }); onSaved() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } }
  return (
    <section id="senas-registrar" className="space-y-4" aria-labelledby="reg-title">
      <div>
        <p className="eyebrow">Su saber cuenta</p>
        <h2 id="reg-title" className="section-title">Registrar una seña</h2>
        <p className="mt-1 text-sm text-[var(--color-on-variant)]">También puede registrar lo que vio en años anteriores: elija la fecha en que lo observó.</p>
      </div>
      {msg && <Notice tone={msg.ok ? 'ok' : 'warn'}>{msg.text}</Notice>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cat.senas.map(s => (
          <article key={s.id} className={`panel flex flex-col !p-5 ${sel?.id === s.id ? 'ring-2 ring-[var(--color-primary)]' : ''}`} data-testid="sena-card">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-[1.2rem] font-semibold text-[#161d17]">{s.name}</h3>
              {s.science && <span className="shrink-0 rounded-sm bg-[var(--color-secondary-fixed)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-secondary)]">Con estudio científico</span>}
            </div>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-on-variant)]">{s.when}</p>
            <p className="mt-2 text-sm">{s.how}</p>
            {s.science && <p className="mt-2 text-sm text-[var(--color-on-variant)]">{s.science}</p>}
            <div className="mt-auto pt-3">
              <Listen text={`${s.name}. ${s.when}. ${s.how} ${s.readings.filter(r => r.meaning).map(r => `${r.label}: ${r.meaning}`).join(' ')}`} />
              <button type="button" className="btn-soft mt-2" onClick={() => { setSel(s); setReading('') }} aria-pressed={sel?.id === s.id}>Registré esta seña</button>
            </div>
          </article>
        ))}
      </div>
      {sel && (
        <div className="panel space-y-4" data-testid="sena-form">
          <h3 className="font-display text-[1.3rem] font-semibold text-[var(--color-primary)]">{sel.name}</h3>
          {!user ? <Notice tone="info">Para registrar señas necesita una cuenta gratuita, así cada registro cuenta una sola vez. <a className="font-semibold underline" href="#/ingresar">Ingresar</a> o <a className="font-semibold underline" href="#/registro">crear cuenta</a>.</Notice> : <>
            {sel.id === 'otra' && <label className="block"><span className="mb-1 block font-semibold">Nombre de la seña</span><input className={inputCls} value={custom} onChange={e => setCustom(e.target.value)} maxLength={80} placeholder="Ej.: rueda alrededor de la luna" /></label>}
            <fieldset><legend className="mb-2 font-semibold">¿Qué observó?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {sel.readings.map(r => (
                  <label key={r.id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 ${readingId === r.id ? 'border-[var(--color-primary)] bg-[var(--color-surface-low)]' : 'border-[var(--color-outline-variant)]'}`}>
                    <input type="radio" name="reading" className="mt-1" checked={readingId === r.id} onChange={() => setReading(r.id)} />
                    <span><span className="block font-semibold">{r.label}</span>{r.meaning && <span className="block text-sm text-[var(--color-on-variant)]">{r.meaning}</span>}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block font-semibold">Fecha en que la observó</span><input type="date" className={inputCls} value={day} max={today()} onChange={e => setDay(e.target.value)} /></label>
              <label className="block"><span className="mb-1 block font-semibold">Nota (solo usted la ve)</span><input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} /></label>
            </div>
            <Button onClick={save} disabled={busy || !readingId}>{busy ? 'Guardando…' : 'Guardar seña'}</Button>
          </>}
        </div>
      )}
      {mine.length > 0 && (
        <div className="panel">
          <h3 className="font-semibold">Mis señas en esta campaña</h3>
          <ul className="mt-2 divide-y divide-[var(--color-outline-variant)]" data-testid="my-senas">
            {mine.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{o.sena_name}: <strong>{o.reading_label}</strong> · {fmt(o.observed_on)}{o.notes && <span className="block text-[var(--color-on-variant)]">{o.notes}</span>}</span>
                <button type="button" onClick={() => del(o.id)} aria-label={`Borrar ${o.sena_name}`} className="rounded-lg p-2 text-[var(--color-on-variant)] hover:bg-[var(--color-surface-low)]"><Icon name="trash" size={18} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
