import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Listen } from '../components/Listen'
import { MunicipalitySelect } from '../components/SiteChrome'
import { Bulletin } from '../components/Bulletin'
import { Button, ErrorBox, Loading, Notice, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { HERD, bs, forage, num, type HerdKind } from '../lib/calc'
import { useApp } from '../lib/store'
import type { DroughtT, LivestockReportT, LossSummaryT, LossT, NightT, NightsT, WinterT } from '../lib/types'

/* Uywa · Ganado en riesgo. Nace de un caso real: ovejas sin corral techado en la comunidad Huayñacagua,
   pastizales secos, crías muertas en invierno y llamas muertas por nevadas en comunidades vecinas. */

const fmt = (s: string, o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('es-BO', o)
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const LEVEL_UI: Record<NightT['level'], { bg: string; ink: string; bar: string }> = {
  extremo: { bg: 'bg-[#f3dcd7]', ink: 'text-[#7a1f14]', bar: '#7a1f14' },
  alto: { bg: 'bg-[#faefec]', ink: 'text-[#8a2e22]', bar: '#c0604f' },
  medio: { bg: 'bg-[#fbf6e9]', ink: 'text-[#5f4500]', bar: '#d9a63a' },
  bajo: { bg: 'bg-[#f1f6ee]', ink: 'text-[#1f5531]', bar: '#2f7a46' },
}
interface Catalog { species: Record<string, string>; causes: Record<string, string>; no_roof: { title: string; text: string }[]; current_campaign: number }

export default function Ganado({ sub }: { sub?: string }) {
  const { municipalityId, findMunicipality } = useApp()
  const m = findMunicipality(municipalityId)
  if (sub === 'informe') return <Report />
  return (
    <div className="space-y-10" data-testid="ganado-page">
      <Story />
      <section className="panel grid items-end gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block"><span className="mb-1 block text-sm font-semibold">Municipio de su rebaño</span>
          <span className="block rounded-md border border-[#bdb6a6] bg-white px-3 py-2.5"><MunicipalitySelect className="w-full" /></span></label>
        <a href="#senas-ganado" className="btn-soft sm:!w-auto">Ver alerta de año seco</a>
      </section>
      {!m ? <Notice tone="info">Elija el municipio donde está su rebaño para ver las alertas.</Notice> : <>
        <Nights municipalityId={m.id} name={m.name} />
        <Bulletin municipalityId={m.id} compact />
        <a href="#/sin-internet" className="btn-soft" data-testid="go-offline"><Icon name="offline" size={18} />¿Su familia no tiene internet? Guarde la semana en el celular</a>
        <Drought municipalityId={m.id} />
        <WinterPanel municipalityId={m.id} name={m.name} />
      </>}
      <Forage />
      <NoRoof />
      {m && <Losses municipalityId={m.id} name={m.name} />}
    </div>
  )
}

/** El problema real, contado con las fotos de la familia. */
function Story() {
  const [show, setShow] = useState(false)
  return (
    <section className="space-y-5" aria-labelledby="story-title" data-testid="ganado-story">
      <div className="sow-card">
        <div className="sow-glow" aria-hidden="true" />
        <div className="relative">
          <span className="chip-light"><Icon name="alert" size={14} />Un problema real</span>
          <h1 id="story-title" className="mt-4 font-display text-[2.1rem] leading-tight text-white">Uywa · Ganado en riesgo</h1>
          <p className="mt-3 max-w-3xl text-[#d5dcd3]">
            En la comunidad <strong className="text-white">Huayñacagua</strong>, una familia criadora de ovejas no tiene corral techado. En invierno el pasto se seca,
            el suelo se agrieta y las ovejas adelgazan; hay que comprar alimento. Las crías nacen en los meses más fríos y algunas mueren. En comunidades vecinas,
            las nevadas mataron llamas. Esta sección ayuda a <strong className="text-white">anticipar</strong> esas noches y esos años, a <strong className="text-white">calcular el forraje</strong> y a
            <strong className="text-white"> pedir apoyo con datos</strong>.
          </p>
          <Listen className="mt-3 !text-white hover:!bg-white/10" text="Uywa, ganado en riesgo. En la comunidad Huayñacagua, una familia criadora de ovejas no tiene corral techado. En invierno el pasto se seca y las ovejas adelgazan. Las crías nacen en los meses más fríos y algunas mueren. En comunidades vecinas, las nevadas mataron llamas. Esta sección ayuda a anticipar las noches peligrosas y los años secos, a calcular el forraje y a pedir apoyo con datos." />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['pastoreo-seco', 'Ovejas flacas pastando en rastrojo seco'], ['suelo-seco', 'Suelo agrietado y sin pasto'], ['forraje', 'Alimento comprado en bebedero, sin techo']].map(([f, t]) => (
          <figure key={f} className="overflow-hidden rounded-xl bg-white shadow-sm">
            <img src={`/img/historia/${f}.jpg`} alt={t} loading="lazy" className="aspect-[3/4] w-full object-cover" />
            <figcaption className="p-2 text-xs text-[var(--color-on-variant)]">{t}</figcaption>
          </figure>
        ))}
        <figure className="relative overflow-hidden rounded-xl bg-white shadow-sm">
          <img src="/img/historia/corderos.jpg" alt="Dos corderos muertos en el corral" loading="lazy"
            className={`aspect-[3/4] w-full object-cover transition ${show ? '' : 'scale-110 blur-xl'}`} />
          {!show && <button type="button" onClick={() => setShow(true)} className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 p-3 text-center text-sm font-semibold text-white">
            <Icon name="alert" size={20} />Imagen sensible<span className="font-normal">Toque para ver</span></button>}
          <figcaption className="p-2 text-xs text-[var(--color-on-variant)]">Crías muertas. Las heridas en el cuello sugieren ataque de un depredador.</figcaption>
        </figure>
      </div>
      <p className="text-xs text-[var(--color-on-variant)]">Fotos propias de la familia, julio de 2025, publicadas con su permiso.</p>
    </section>
  )
}

function Nights({ municipalityId, name }: { municipalityId: string; name: string }) {
  const [d, setD] = useState<NightsT | null>(null)
  useEffect(() => { setD(null); api<NightsT>(`/api/ganado/noches?municipality_id=${municipalityId}`, { timeoutMs: 60000 }).then(setD).catch(() => setD({ available: false, nights: [], error: 'No se pudo cargar el pronóstico.' })) }, [municipalityId])
  return (
    <section aria-labelledby="nights-title" data-testid="ganado-nights">
      <p className="eyebrow">Pronóstico</p>
      <h2 id="nights-title" className="section-title">Noches peligrosas para el rebaño en {name}</h2>
      <p className="mt-1 text-sm text-[var(--color-on-variant)]">Helada fuerte, nevada y viento de noche: lo que más mata a las crías recién nacidas y a los animales débiles.</p>
      {!d ? <Loading text="Revisando las próximas noches…" /> : !d.available ? <Notice tone="warn">{d.error} Mientras tanto: encierre de noche a las crías con sus madres al abrigo del viento.</Notice> : <>
        {d.worst && d.worst.level !== 'bajo' && (
          <div className={`mt-4 rounded-2xl p-5 ${LEVEL_UI[d.worst.level].bg}`} role="alert">
            <p className={`font-display text-[1.4rem] font-semibold ${LEVEL_UI[d.worst.level].ink}`}>Riesgo {d.worst.label.toLowerCase()} la noche del {fmt(d.worst.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p className="text-sm">{d.worst.reasons.join(' · ')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{d.worst.actions.map(a => <li key={a}>{a}</li>)}</ul>
            <Listen className="mt-1" text={`Riesgo ${d.worst.label} la noche del ${fmt(d.worst.date, { weekday: 'long', day: 'numeric', month: 'long' })}. ${d.worst.reasons.join('. ')}. ${d.worst.actions.join(' ')}`} />
          </div>
        )}
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {d.nights.map(n => (
            <li key={n.date} className={`rounded-xl p-3 ${LEVEL_UI[n.level].bg}`}>
              <p className="text-xs font-semibold uppercase text-[var(--color-on-variant)]">{fmt(n.date)}</p>
              <p className={`font-bold ${LEVEL_UI[n.level].ink}`}>{n.label}</p>
              <p className="text-sm">{n.tmin != null ? `${Math.round(n.tmin)} °C` : '—'}{n.snow ? ' · nevada' : ''}</p>
              {n.wind_kmh != null && <p className="text-xs text-[var(--color-on-variant)]">viento {n.wind_kmh} km/h</p>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[var(--color-on-variant)]">{d.note} Criterio orientativo: extremo ≤ −10 °C o nevada con helada; alto ≤ −6 °C, nevada, o helada con viento.</p>
      </>}
    </section>
  )
}

function Drought({ municipalityId }: { municipalityId: string }) {
  const [d, setD] = useState<DroughtT | null>(null)
  useEffect(() => { setD(null); api<DroughtT>(`/api/ganado/sequia?municipality_id=${municipalityId}`, { timeoutMs: 60000 }).then(setD).catch(() => setD(null)) }, [municipalityId])
  const tone = d?.level === 'alta' ? 'bg-[#faefec] text-[#8a2e22]' : d?.level === 'media' ? 'bg-[#fbf6e9] text-[#5f4500]' : 'bg-[#f1f6ee] text-[#1f5531]'
  return (
    <section id="senas-ganado" className="panel space-y-3" aria-labelledby="drought-title" data-testid="ganado-drought">
      <p className="eyebrow">Alerta temprana · señas + satélite</p>
      <h2 id="drought-title" className="section-title">¿Viene un año seco? Prepare el forraje a tiempo</h2>
      {!d ? <Loading text="Uniendo señas y datos satelitales…" /> : <>
        <p className={`inline-block rounded-lg px-3 py-1.5 font-bold ${tone}`}>Alerta de año seco: {d.level}</p>
        {d.signals.length > 0 ? <ul className="list-disc space-y-1 pl-5">{d.signals.map(s => <li key={s}>{s}</li>)}</ul> : <p>Por ahora no hay señales de año seco.</p>}
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          {d.rain && <div className="rounded-xl bg-[var(--color-surface-low)] p-3"><p className="text-xs font-semibold uppercase text-[var(--color-on-variant)]">Lluvia desde septiembre</p>
            <p className="font-bold">{d.rain.observed} mm</p><p className="text-xs">promedio {d.rain.normal} mm · {d.rain.category}</p></div>}
          {d.last_season && <div className="rounded-xl bg-[var(--color-surface-low)] p-3"><p className="text-xs font-semibold uppercase text-[var(--color-on-variant)]">Temporada {d.last_season.campaign_label}</p>
            <p className="font-bold">{d.last_season.label}</p><p className="text-xs">{d.last_season.observed} mm · promedio {d.last_season.normal} mm</p></div>}
          <div className="rounded-xl bg-[var(--color-surface-low)] p-3"><p className="text-xs font-semibold uppercase text-[var(--color-on-variant)]">Señas de la zona ({d.campaign_label})</p>
            <p className="font-bold">{d.senas.n ? `${d.senas.dry_share ?? 0} % anuncian año seco` : 'Sin señas registradas'}</p>
            <a href="#/senas" className="text-xs font-semibold underline">Registrar una seña</a></div>
        </div>
        <h3 className="pt-2 font-semibold">Qué hacer</h3>
        <ul className="list-disc space-y-1 pl-5">{d.actions.map(a => <li key={a}>{a}</li>)}</ul>
        <Listen text={`Alerta de año seco: ${d.level}. ${d.signals.join(' ')} Qué hacer: ${d.actions.join(' ')}`} />
        <p className="text-xs text-[var(--color-on-variant)]">Lluvia: NASA POWER, comparada con todas las temporadas desde 2001 en el mismo lugar (terciles).</p>
      </>}
    </section>
  )
}

/** Los últimos inviernos según el satélite: heladas y posibles nevadas frente al promedio. */
function WinterPanel({ municipalityId, name }: { municipalityId: string; name: string }) {
  const [winters, setWinters] = useState<WinterT[] | null>(null)
  const [i, setI] = useState(0)
  useEffect(() => {
    setWinters(null)
    api<{ current_campaign: number }>('/api/ganado/catalogo').then(c => Promise.all([1, 2, 3].map(k =>
      api<LivestockReportT>(`/api/ganado/informe?municipality_id=${municipalityId}&campaign=${c.current_campaign - k}`, { timeoutMs: 60000 }).then(r => r.winter).catch(() => null))))
      .then(ws => { const ok = ws.filter((x): x is WinterT => !!x).filter((x, k, arr) => arr.findIndex(y => y.winter === x.winter) === k); setWinters(ok); setI(0) })
      .catch(() => setWinters([]))
  }, [municipalityId])
  if (winters === null) return <Loading text="Revisando los últimos inviernos…" />
  if (!winters.length) return null
  const w = winters[i]
  const x = w.normal_rain_mm ? w.rain_mm / w.normal_rain_mm : null
  return (
    <section className="panel space-y-3" aria-labelledby="winter-title" data-testid="ganado-winter">
      <p className="eyebrow">Lo que pasó · satélite</p>
      <h2 id="winter-title" className="section-title">Los inviernos en {name}</h2>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Invierno">
        {winters.map((v, k) => (
          <button key={v.winter} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${k === i ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface-low)] text-[var(--color-primary)]'}`}>
            {v.winter.replace('junio a agosto de ', 'Invierno ')}{v.snow_events.length ? ` · ${v.snow_events.length} nevada${v.snow_events.length > 1 ? 's' : ''}` : ''}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <Stat label="Precipitación jun–ago" value={`${num(w.rain_mm, 0)} mm`} sub={`promedio ${w.normal_rain_mm ?? '—'} mm${x && x >= 1.5 ? ` · ${num(x, 1)} veces lo normal` : ''}`} warn={!!x && x >= 1.5} />
        <Stat label="Posibles nevadas" value={String(w.snow_events.length)} sub="días con precipitación y helada" warn={w.snow_events.length > 0} />
        <Stat label="Noches con helada" value={String(w.frost_nights)} sub={`promedio ${w.normal_frost_nights ?? '—'}`} />
        <Stat label="Mínima registrada" value={`${w.min} °C`} sub={`promedio ${w.normal_min ?? '—'} °C`} />
      </div>
      {w.snow_events.length > 0 && <p className="text-sm"><strong>Días compatibles con nevada:</strong> {w.snow_events.map(e => `${fmt(e.date, { day: 'numeric', month: 'long' })} (${e.precip_mm} mm, ${e.tmin} °C)`).join(' · ')}.</p>}
      <p className="text-xs text-[var(--color-on-variant)]">{w.note}</p>
    </section>
  )
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${warn ? 'bg-[#faefec]' : 'bg-[var(--color-surface-low)]'}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-on-variant)]">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${warn ? 'text-[#8a2e22]' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--color-on-variant)]">{sub}</div>}
    </div>
  )
}

/** ¿Hasta cuándo me alcanza el forraje? */
function Forage() {
  const [herd, setHerd] = useState<Record<HerdKind, string>>({ oveja: '', llama: '', alpaca: '', vaca: '' })
  const [unit, setUnit] = useState<'fardo' | 'kg' | 'qq'>('fardo')
  const [qty, setQty] = useState('')
  const [fardoKg, setFardoKg] = useState('20')
  const [price, setPrice] = useState('')
  const [until, setUntil] = useState(`${new Date().getMonth() >= 11 ? new Date().getFullYear() + 1 : new Date().getFullYear()}-12-15`)
  const n = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')))
  const kgPerUnit = unit === 'fardo' ? n(fardoKg) : unit === 'qq' ? 46 : 1
  const r = forage(Object.fromEntries(Object.entries(herd).map(([k, v]) => [k, n(v)])) as Record<HerdKind, number>, n(qty) * kgPerUnit,
    new Date(`${today()}T12:00:00`), new Date(`${until}T12:00:00`), unit === 'fardo' ? n(price) / (n(fardoKg) || 1) : unit === 'qq' ? n(price) / 46 : n(price))
  const units = (kg: number) => unit === 'fardo' ? `${num(Math.ceil(kg / (n(fardoKg) || 1)), 0)} fardos` : unit === 'qq' ? `${num(kg / 46, 1)} qq` : `${num(kg, 0)} kg`
  const say = r ? `Su forraje alcanza para ${r.days} días, hasta el ${r.runsOut.toLocaleDateString('es-BO', { day: 'numeric', month: 'long' })}. ${r.enough ? 'Le alcanza hasta la fecha que eligió.' : `Le faltan ${units(r.missingKg)}.`}` : ''
  return (
    <section className="panel space-y-4" aria-labelledby="forage-title" data-testid="ganado-forage">
      <p className="eyebrow">Calculadora</p>
      <h2 id="forage-title" className="section-title">¿Hasta cuándo me alcanza el forraje?</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(HERD) as HerdKind[]).map(k => (
          <label key={k} className="block"><span className="mb-1 block text-sm font-semibold">{HERD[k].label}</span>
            <input className={inputCls} inputMode="numeric" value={herd[k]} onChange={e => setHerd(h => ({ ...h, [k]: e.target.value }))} placeholder="0" aria-label={`Cantidad de ${HERD[k].label.toLowerCase()}`} /></label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Forraje guardado (heno, fardos, rastrojo seco)</span>
          <span className="flex gap-2"><input className={inputCls} inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" aria-label="Forraje guardado" />
            <select className={`${inputCls} !w-auto`} value={unit} onChange={e => setUnit(e.target.value as typeof unit)} aria-label="Unidad de forraje"><option value="fardo">fardos</option><option value="kg">kg</option><option value="qq">quintales</option></select></span></label>
        {unit === 'fardo' && <label className="block"><span className="mb-1 block text-sm font-semibold">Kilos por fardo</span><input className={inputCls} inputMode="decimal" value={fardoKg} onChange={e => setFardoKg(e.target.value)} /></label>}
        <label className="block"><span className="mb-1 block text-sm font-semibold">Precio por {unit === 'fardo' ? 'fardo' : unit === 'qq' ? 'quintal' : 'kg'} (Bs, opcional)</span><input className={inputCls} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></label>
      </div>
      <label className="block sm:w-64"><span className="mb-1 block text-sm font-semibold">¿Hasta cuándo necesita? (vuelve el pasto)</span><input type="date" className={inputCls} value={until} onChange={e => setUntil(e.target.value)} /></label>
      {r && (
        <div className={`rounded-2xl p-5 ${r.enough ? 'bg-[#f1f6ee]' : 'bg-[#faefec]'}`} aria-live="polite" data-testid="forage-result">
          <p className="font-display text-[1.6rem] font-semibold">Alcanza para {r.days} días</p>
          <p>Hasta el <strong>{r.runsOut.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. Su rebaño come unos <strong>{num(r.perDayKg, 1)} kg</strong> de forraje seco al día.</p>
          {r.enough ? <p className="mt-1 font-semibold text-[#1f5531]">Le alcanza hasta la fecha que eligió.</p>
            : <p className="mt-1 font-semibold text-[#8a2e22]">Le faltan {units(r.missingKg)} para llegar al {new Date(`${until}T12:00:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'long' })}{r.cost > 0 ? `: unos ${bs(r.cost)}` : ''}.</p>}
          <Listen className="mt-1" text={say} />
        </div>
      )}
      <p className="text-xs text-[var(--color-on-variant)]">Referencia general: una oveja de ~30 kg come cerca del 2,5 % de su peso en materia seca al día; llamas y alpacas, cerca del 2 %. Animales preñados, con cría o muy flacos necesitan más. El pasto que encuentren en el campo reduce lo que hace falta.</p>
    </section>
  )
}

function NoRoof() {
  const [items, setItems] = useState<Catalog['no_roof'] | null>(null)
  useEffect(() => { api<Catalog>('/api/ganado/catalogo').then(c => setItems(c.no_roof)).catch(() => setItems([])) }, [])
  if (!items?.length) return null
  return (
    <section aria-labelledby="noroof-title" data-testid="ganado-noroof">
      <p className="eyebrow">Sin corral techado</p>
      <h2 id="noroof-title" className="section-title">Cómo proteger al rebaño con lo que hay</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map(i => (
          <article key={i.title} className="panel !p-5">
            <h3 className="font-display text-[1.15rem] font-semibold text-[var(--color-primary)]">{i.title}</h3>
            <p className="mt-1 text-sm">{i.text}</p>
            <Listen className="mt-2" text={`${i.title}. ${i.text}`} />
          </article>
        ))}
      </div>
      <p className="mt-3 text-sm">¿Necesita ayuda de un técnico o veterinario? <a href="#/asesoria" className="font-semibold underline">Asesoría</a></p>
    </section>
  )
}

function Losses({ municipalityId, name }: { municipalityId: string; name: string }) {
  const { user } = useApp()
  const [cat, setCat] = useState<Catalog | null>(null)
  const [sum, setSum] = useState<LossSummaryT | null>(null)
  const [mine, setMine] = useState<LossT[]>([])
  const [f, setF] = useState({ date: today(), species: 'oveja', count: '', cause: 'helada', community: '', notes: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { api<Catalog>('/api/ganado/catalogo').then(setCat).catch(() => setCat(null)) }, [])
  useEffect(() => {
    if (!cat) return
    api<LossSummaryT>(`/api/ganado/perdidas/resumen?municipality_id=${municipalityId}&campaign=${cat.current_campaign}`).then(setSum).catch(() => setSum(null))
    if (user) api<LossT[]>('/api/ganado/perdidas/mias').then(setMine).catch(() => setMine([]))
  }, [cat, municipalityId, user?.id, tick])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }))
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    try {
      await api('/api/ganado/perdidas', { body: { municipality_id: municipalityId, date: f.date, species: f.species, count: Number(f.count), cause: f.cause, community_name: f.community, notes: f.notes } })
      setMsg({ ok: true, text: 'Pérdida registrada. Se suma al informe de su municipio (sin su nombre).' }); setF(s => ({ ...s, count: '', notes: '' })); setTick(t => t + 1)
    } catch (e2) { setMsg({ ok: false, text: (e2 as Error).message }) }
  }
  return (
    <section className="space-y-4" aria-labelledby="loss-title" data-testid="ganado-losses">
      <div>
        <p className="eyebrow">Datos de la comunidad</p>
        <h2 id="loss-title" className="section-title">Pérdidas de ganado en {name}</h2>
        <p className="mt-1 text-sm text-[var(--color-on-variant)]">Cada familia registra sus pérdidas. Se publican solo los totales, nunca nombres. Con ellos se arma un informe para pedir apoyo a su municipio o gobernación.</p>
      </div>
      {sum && (
        <div className="panel">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Animales perdidos" value={String(sum.animals)} sub={`campaña ${sum.campaign_label}`} warn={sum.animals > 0} />
            <Stat label="Familias" value={String(sum.families)} />
            <Stat label="Reportes" value={String(sum.reports)} />
          </div>
          {sum.animals > 0 && <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <p><strong>Por especie:</strong> {sum.by_species.map(s => `${s.label} ${s.count}`).join(' · ')}</p>
            <p><strong>Por causa:</strong> {sum.by_cause.map(s => `${s.label} ${s.count}`).join(' · ')}</p>
            {sum.communities.length > 0 && <p><strong>Comunidades:</strong> {sum.communities.map(s => `${s.name} ${s.count}`).join(' · ')}</p>}
          </div>}
          {sum.has_demo && <p className="mt-2 text-xs font-semibold text-[var(--color-secondary)]">Incluye registros de ejemplo (ficticios).</p>}
          <a href="#/ganado/informe" className="btn-primary mt-4"><Icon name="notebook" size={18} />Informe para autoridades</a>
        </div>
      )}
      {!user ? <Notice tone="info">Para registrar pérdidas necesita una cuenta gratuita. <a className="font-semibold underline" href="#/ingresar">Ingresar</a> o <a className="font-semibold underline" href="#/registro">crear cuenta</a>.</Notice>
        : cat && (
          <form onSubmit={submit} className="panel space-y-3" data-testid="loss-form">
            <h3 className="font-display text-[1.25rem] font-semibold text-[var(--color-primary)]">Registrar una pérdida</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block"><span className="mb-1 block text-sm font-semibold">Animal</span><select className={inputCls} value={f.species} onChange={set('species')}>{Object.entries(cat.species).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-sm font-semibold">Cuántos</span><input className={inputCls} inputMode="numeric" value={f.count} onChange={set('count')} required aria-label="Cuántos animales" /></label>
              <label className="block"><span className="mb-1 block text-sm font-semibold">Causa</span><select className={inputCls} value={f.cause} onChange={set('cause')}>{Object.entries(cat.causes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-sm font-semibold">Fecha</span><input type="date" className={inputCls} value={f.date} max={today()} onChange={set('date')} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-sm font-semibold">Comunidad</span><input className={inputCls} value={f.community} onChange={set('community')} maxLength={80} placeholder="Ej.: Huayñacagua" /></label>
              <label className="block"><span className="mb-1 block text-sm font-semibold">Nota (solo usted la ve)</span><input className={inputCls} value={f.notes} onChange={set('notes')} maxLength={300} /></label>
            </div>
            {msg && <p className={`font-semibold ${msg.ok ? 'text-[#1f5531]' : 'text-rojo'}`} role="status">{msg.text}</p>}
            <Button>Registrar</Button>
            {mine.length > 0 && <ul className="divide-y divide-[var(--color-outline-variant)] text-sm" data-testid="my-losses">
              {mine.map(x => <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                <span>{fmt(x.date, { day: 'numeric', month: 'short', year: 'numeric' })}: {x.count} {x.species_label.toLowerCase()} · {x.cause_label}{x.community ? ` · ${x.community}` : ''}</span>
                <button type="button" aria-label="Borrar registro" className="rounded-lg p-2 text-[var(--color-on-variant)] hover:bg-[var(--color-surface-low)]"
                  onClick={async () => { await api(`/api/ganado/perdidas/${x.id}`, { method: 'DELETE' }); setTick(t => t + 1) }}><Icon name="trash" size={16} /></button>
              </li>)}
            </ul>}
          </form>
        )}
    </section>
  )
}

/** Informe imprimible para pedir apoyo a autoridades. */
function Report() {
  const { municipalityId, findMunicipality } = useApp()
  const m = findMunicipality(municipalityId)
  const [r, setR] = useState<LivestockReportT | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (m) api<LivestockReportT>(`/api/ganado/informe?municipality_id=${m.id}`, { timeoutMs: 60000 }).then(setR).catch(e => setErr(e.message)) }, [m?.id])
  if (!m) return <Notice tone="info">Elija su municipio en <a className="underline" href="#/ganado">Ganado</a>.</Notice>
  if (err) return <ErrorBox message={err} />
  if (!r) return <Loading text="Preparando el informe…" />
  const L = r.losses, w = r.winter
  return (
    <article className="mx-auto max-w-3xl space-y-5 bg-white p-6 print:p-0" data-testid="ganado-report">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <a href="#/ganado" className="link-caps"><Icon name="arrowRight" size={14} className="rotate-180" />Ganado</a>
        <button type="button" className="btn-primary" onClick={() => window.print()}>Imprimir o guardar PDF</button>
      </div>
      <header className="border-b border-linea pb-3">
        <p className="eyebrow">Informe de la comunidad · PACHA-AGRO</p>
        <h1 className="font-display text-[1.9rem] leading-tight text-[var(--color-primary)]">Pérdidas de ganado y condiciones climáticas — {r.municipality.name}, {r.municipality.department_name}</h1>
        <p className="text-sm text-[var(--color-on-variant)]">Campaña {L.campaign_label} · generado el {r.generated_at}</p>
      </header>
      <section><h2 className="text-lg font-bold">1. Pérdidas reportadas por las familias</h2>
        {L.animals === 0 ? <p>Aún no hay pérdidas registradas en esta campaña.</p> : <>
          <p><strong>{L.animals}</strong> animales perdidos, reportados por <strong>{L.families}</strong> familias ({L.reports} reportes).</p>
          <ul className="list-disc pl-5"><li>Por especie: {L.by_species.map(s => `${s.label}: ${s.count}`).join('; ')}</li>
            <li>Por causa: {L.by_cause.map(s => `${s.label}: ${s.count}`).join('; ')}</li>
            {L.communities.length > 0 && <li>Comunidades: {L.communities.map(s => `${s.name}: ${s.count}`).join('; ')}</li>}</ul>
          {L.has_demo && <p className="text-xs text-[var(--color-secondary)]">Incluye registros de ejemplo (ficticios).</p>}</>}
      </section>
      {w && <section><h2 className="text-lg font-bold">2. Invierno {w.winter.replace('junio a agosto de ', '')} (satélite NASA POWER)</h2>
        <ul className="list-disc pl-5">
          <li>Precipitación de junio a agosto: <strong>{w.rain_mm} mm</strong> (promedio de {w.years} inviernos: {w.normal_rain_mm} mm).</li>
          <li>Días compatibles con nevada: <strong>{w.snow_events.length}</strong>{w.snow_events.length ? ` (${w.snow_events.map(e => `${e.date}: ${e.precip_mm} mm, ${e.tmin} °C`).join('; ')})` : ''}.</li>
          <li>Noches con helada: {w.frost_nights} (promedio {w.normal_frost_nights}). Mínima: {w.min} °C (promedio {w.normal_min} °C).</li>
        </ul><p className="text-xs text-[var(--color-on-variant)]">{w.note}</p></section>}
      {r.rain?.status === 'evaluado' && <section><h2 className="text-lg font-bold">3. Lluvia de la temporada {r.rain_campaign_label}</h2>
        <p>{r.rain.label}: {r.rain.observed} mm de noviembre a marzo (promedio {r.rain.normal} mm).</p></section>}
      <section><h2 className="text-lg font-bold">{r.rain?.status === 'evaluado' ? 4 : 3}. Apoyo que se solicita</h2>
        <ul className="list-disc pl-5">{r.requests.map(x => <li key={x}>{x}</li>)}</ul></section>
      <p className="border-t border-linea pt-3 text-xs text-[var(--color-on-variant)]">Datos de pérdidas: reportes de las propias familias en PACHA-AGRO (sin nombres). Datos climáticos: NASA POWER, estimación satelital de ~50 km; no reemplaza a SENAMHI.</p>
    </article>
  )
}
