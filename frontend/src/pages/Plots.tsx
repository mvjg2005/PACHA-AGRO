import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Button, ErrorBox, Field, Loading, Notice, PageTitle, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { bs, num, polygonAreaHa } from '../lib/calc'
import { CROP_LIST } from '../lib/prefs'
import { go } from '../lib/router'
import { useApp } from '../lib/store'
import type { PlotT } from '../lib/types'

const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const fmtDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
const area = (ha: number | null) => ha == null ? 'Sin superficie' : ha < 1 ? `${num(ha * 10000, 0)} m²` : `${num(ha, 2)} ha`

export default function Plots({ id }: { id?: string }) {
  const { user } = useApp()
  if (!user) return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title="Mis parcelas" subtitle="Lleve el registro de sus parcelas: siembra, labores, gastos, cosecha y ventas." />
      <Notice tone="info">Para guardar sus parcelas necesita una cuenta gratuita (solo su celular y una clave). Sus datos son privados: nadie más los ve.</Notice>
      <div className="flex gap-3"><a className="btn-primary" href="#/ingresar">Ingresar</a><a className="btn-soft !w-auto" href="#/registro">Crear cuenta</a></div>
    </div>
  )
  return id && /^\d+$/.test(id) ? <PlotDetail id={Number(id)} /> : <PlotList />
}

function PlotList() {
  const [plots, setPlots] = useState<PlotT[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const load = () => api<{ plots: PlotT[] }>('/api/plots').then(d => { setPlots(d.plots); if (!d.plots.length) setAdding(true) }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  if (err) return <ErrorBox message={err} onRetry={load} />
  if (!plots) return <Loading />
  const totals = plots.reduce((a, p) => ({ ha: a.ha + (p.area_ha ?? 0), costs: a.costs + p.summary.costs_bs, income: a.income + p.summary.income_bs }), { ha: 0, costs: 0, income: 0 })
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <a href="#/campo" className="link-caps"><Icon name="arrowRight" size={14} className="rotate-180" />Mi campo</a>
      <PageTitle title="Mis parcelas" subtitle="Sus datos son privados: solo usted los ve. Se guardan en su cuenta." />
      {plots.length > 0 && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Superficie" value={area(totals.ha)} />
          <Stat label="Gastos" value={bs(totals.costs)} />
          <Stat label="Ventas" value={bs(totals.income)} />
        </div>
      )}
      <ul className="grid gap-4 md:grid-cols-2" data-testid="plot-list">
        {plots.map(p => (
          <li key={p.id}>
            <a href={`#/campo/parcelas/${p.id}`} className="panel block h-full hover:bg-[var(--color-surface-low)]">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-[1.3rem] font-semibold text-[var(--color-primary)]">{p.name}</h2>
                <span className="text-sm font-semibold text-[var(--color-on-variant)]">{area(p.area_ha)}</span>
              </div>
              <p className="text-sm text-[var(--color-on-variant)]">{[p.crop_name, p.variety, p.municipality_name].filter(Boolean).join(' · ') || 'Sin cultivo'}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {p.summary.days_since_sowing != null && <span>{p.summary.days_since_sowing >= 0 ? `${p.summary.days_since_sowing} días desde la siembra` : `Siembra en ${-p.summary.days_since_sowing} días`}</span>}
                <span>Gastos: <strong>{bs(p.summary.costs_bs)}</strong></span>
                <span>{p.summary.records} registros</span>
              </div>
            </a>
          </li>
        ))}
      </ul>
      {adding ? <PlotForm onSaved={p => go(`/campo/parcelas/${p.id}`)} onCancel={plots.length ? () => setAdding(false) : undefined} />
        : <Button onClick={() => setAdding(true)} className="w-full sm:w-auto"><Icon name="plus" size={18} className="mr-1" />Agregar parcela</Button>}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-low)] px-2 py-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-on-variant)]">{label}</div>
      <div className={`mt-0.5 font-bold ${tone === 'bad' ? 'text-[#8a2e22]' : tone === 'ok' ? 'text-[#1f5531]' : ''}`}>{value}</div>
    </div>
  )
}

function PlotForm({ initial, onSaved, onCancel }: { initial?: PlotT; onSaved: (p: PlotT) => void; onCancel?: () => void }) {
  const { municipalityId, findMunicipality } = useApp()
  const [f, setF] = useState({
    name: initial?.name ?? '', crop: initial?.crop ?? '', variety: initial?.variety ?? '', sowing_date: initial?.sowing_date ?? '',
    notes: initial?.notes ?? '', areaValue: initial?.area_ha != null ? String(initial.area_ha) : '', areaUnit: 'ha',
  })
  const [gpsHa, setGpsHa] = useState<number | null>(initial?.area_method === 'gps' ? initial.area_ha : null)
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }))
  const muni = initial?.municipality_id ?? municipalityId
  const m = findMunicipality(muni)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setErrs({})
    const v = Number(f.areaValue.replace(',', '.'))
    const ha = gpsHa ?? (f.areaValue.trim() ? (f.areaUnit === 'm2' ? v / 10000 : v) : null)
    if (ha !== null && !(ha > 0)) { setErrs({ area_ha: 'Escriba una superficie mayor a cero.' }); return }
    setBusy(true)
    try {
      const body = { name: f.name, crop: f.crop, variety: f.variety, sowing_date: f.sowing_date || null, notes: f.notes,
        area_ha: ha === null ? null : Math.round(ha * 10000) / 10000, area_method: gpsHa !== null ? 'gps' : 'manual', municipality_id: muni }
      onSaved(await api<PlotT>(initial ? `/api/plots/${initial.id}` : '/api/plots', { method: initial ? 'PUT' : 'POST', body }))
    } catch (e2) { const x = e2 as { message: string; fields?: Record<string, string> }; setErr(x.message); setErrs(x.fields ?? {}) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="panel space-y-4" data-testid="plot-form">
      <h2 className="font-display text-[1.35rem] font-semibold text-[var(--color-primary)]">{initial ? 'Editar parcela' : 'Nueva parcela'}</h2>
      <Field label="Nombre de la parcela" error={errs.name}><input className={inputCls} value={f.name} onChange={set('name')} maxLength={80} placeholder="Ej.: Parcela de la loma" required /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cultivo"><select className={inputCls} value={f.crop} onChange={set('crop')}><option value="">Sin cultivo por ahora</option>{CROP_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Variedad (opcional)"><input className={inputCls} value={f.variety} onChange={set('variety')} maxLength={60} /></Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 font-semibold">Superficie</legend>
        {gpsHa !== null
          ? <p className="flex flex-wrap items-center gap-3"><strong>{area(gpsHa)}</strong><span className="text-sm text-[var(--color-on-variant)]">medida con GPS</span>
            <button type="button" className="link-caps" onClick={() => setGpsHa(null)}>Escribir a mano</button></p>
          : <div className="flex gap-2">
            <input className={`${inputCls} !w-40`} inputMode="decimal" value={f.areaValue} onChange={set('areaValue')} placeholder="0" aria-label="Superficie" />
            <select className={`${inputCls} !w-auto`} value={f.areaUnit} onChange={set('areaUnit')} aria-label="Unidad de superficie"><option value="ha">hectáreas</option><option value="m2">m²</option></select>
          </div>}
        {errs.area_ha && <p className="font-semibold text-rojo" role="alert">{errs.area_ha}</p>}
        <GpsWalk onDone={setGpsHa} />
      </fieldset>
      <Field label="Fecha de siembra (opcional)" hint="Si todavía no sembró, puede dejarla vacía."><input type="date" className={inputCls} value={f.sowing_date} onChange={set('sowing_date')} /></Field>
      <Field label="Notas (opcional)"><textarea className={`${inputCls} min-h-20`} value={f.notes} onChange={set('notes')} maxLength={500} /></Field>
      <p className="text-sm text-[var(--color-on-variant)]">Municipio: <strong>{m ? `${m.name}, ${m.department_name}` : 'sin elegir'}</strong>{!initial && ' (el elegido en la aplicación)'}</p>
      {err && <p className="font-semibold text-rojo" role="alert">{err}</p>}
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy}>{busy ? 'Guardando…' : 'Guardar parcela'}</Button>
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}
      </div>
    </form>
  )
}

/** Medir caminando el borde con el GPS. Solo se guarda la superficie, no el recorrido. */
function GpsWalk({ onDone }: { onDone: (ha: number) => void }) {
  const [state, setState] = useState<'idle' | 'walking' | 'error'>('idle')
  const [pts, setPts] = useState<{ lat: number; lon: number }[]>([])
  const [acc, setAcc] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const watch = useRef<number | null>(null)
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current) }, [])
  if (!('geolocation' in navigator)) return null
  const start = () => {
    setPts([]); setMsg(null); setState('walking')
    watch.current = navigator.geolocation.watchPosition(p => {
      setAcc(Math.round(p.coords.accuracy))
      if (p.coords.accuracy > 30) return // punto poco preciso: se descarta
      setPts(s => [...s, { lat: p.coords.latitude, lon: p.coords.longitude }])
    }, e => { setState('error'); setMsg(e.code === 1 ? 'Sin permiso de ubicación. Actívelo en su celular o escriba la superficie a mano.' : 'No se pudo usar el GPS. Escriba la superficie a mano.') },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 })
  }
  const stop = () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
    const ha = polygonAreaHa(pts)
    if (pts.length < 4 || ha <= 0) { setState('idle'); setMsg('Faltaron puntos. Camine todo el borde despacio y vuelva al inicio.'); return }
    setState('idle'); onDone(ha)
  }
  return (
    <div className="rounded-xl bg-[var(--color-surface-low)] p-3 text-sm">
      {state === 'walking' ? <>
        <p><strong>Camine despacio por todo el borde</strong> y vuelva al punto de inicio. Puntos: {pts.length}{acc !== null && ` · precisión ±${acc} m`}. Superficie hasta ahora: {area(polygonAreaHa(pts))}.</p>
        <Button type="button" className="mt-2" onClick={stop}>Terminar y calcular</Button>
      </> : <>
        <button type="button" className="link-caps" onClick={start}><Icon name="pin" size={14} />Medir caminando con el GPS</button>
        <p className="mt-1 text-[var(--color-on-variant)]">Aproximado: el GPS del celular tiene un margen de varios metros. Solo se guarda la superficie.</p>
      </>}
      {msg && <p className="mt-1 font-semibold text-rojo" role="alert">{msg}</p>}
    </div>
  )
}

const UNITS = [['', '—'], ['kg', 'kg'], ['qq', 'quintales'], ['arroba', 'arrobas'], ['t', 'toneladas'], ['l', 'litros'], ['bolsa', 'bolsas'], ['jornal', 'jornales'], ['hora', 'horas']]

function PlotDetail({ id }: { id: number }) {
  const [p, setP] = useState<(PlotT & { record_kinds: Record<string, string> }) | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [edit, setEdit] = useState(false)
  const load = () => api<PlotT & { record_kinds: Record<string, string> }>(`/api/plots/${id}`).then(setP).catch(e => setErr(e.message))
  useEffect(() => { load() }, [id])
  if (err) return <ErrorBox message={err} />
  if (!p) return <Loading />
  const s = p.summary
  const update = (x: PlotT) => setP(old => old && { ...old, ...x })
  const remove = async () => {
    if (!window.confirm(`¿Eliminar la parcela «${p.name}» y todos sus registros?`)) return
    try { await api(`/api/plots/${p.id}`, { method: 'DELETE' }); go('/campo/parcelas') } catch (e) { setErr((e as Error).message) }
  }
  const delRecord = async (rid: number) => {
    try { update(await api<PlotT>(`/api/plots/${p.id}/records/${rid}`, { method: 'DELETE' })) } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="plot-detail">
      <a href="#/campo/parcelas" className="link-caps"><Icon name="arrowRight" size={14} className="rotate-180" />Mis parcelas</a>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-linea pb-4">
        <div>
          <h1 className="font-display text-[2rem] leading-tight text-[var(--color-primary)]">{p.name}</h1>
          <p className="text-[var(--color-on-variant)]">{[p.crop_name, p.variety, area(p.area_ha) + (p.area_method === 'gps' ? ' (GPS)' : ''), p.municipality_name].filter(Boolean).join(' · ')}</p>
          {p.sowing_date && <p className="text-sm">Sembrada el {fmtDate(p.sowing_date)}{s.days_since_sowing != null && s.days_since_sowing >= 0 ? ` · hace ${s.days_since_sowing} días` : ''}</p>}
        </div>
        <button type="button" className="link-caps" onClick={() => setEdit(v => !v)}>{edit ? 'Cerrar' : 'Editar'}</button>
      </header>
      {edit && <PlotForm initial={p} onSaved={x => { update(x); setEdit(false) }} onCancel={() => setEdit(false)} />}

      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4" data-testid="plot-summary">
        <Stat label="Gastos" value={bs(s.costs_bs)} />
        <Stat label="Ventas" value={bs(s.income_bs)} />
        <Stat label="Balance" value={bs(s.balance_bs)} tone={s.income_bs || s.costs_bs ? (s.balance_bs >= 0 ? 'ok' : 'bad') : undefined} />
        <Stat label="Cosecha" value={s.harvest_kg ? `${num(s.harvest_kg / 46)} qq` : '—'} />
      </div>
      {s.yield_kg_ha && <p className="text-sm">Rendimiento: <strong>{num(s.yield_kg_ha / 46)} quintales por hectárea</strong> ({num(s.yield_kg_ha, 0)} kg/ha).</p>}
      <div className="flex flex-wrap gap-3">
        {s.costs_bs > 0 && <a className="btn-soft !w-auto" href={`#/campo/calculadora/precio/c=${s.costs_bs}${s.harvest_kg ? `&y=${s.harvest_kg}` : ''}`}><Icon name="calculator" size={16} />Precio sin pérdida con estos gastos</a>}
        {p.crop && <a className="btn-soft !w-auto" href={`#/sembrar/cultivo/${p.crop}`}>¿Cuándo sembrar?</a>}
        <a className="btn-soft !w-auto" href="#/campo/diagnostico"><Icon name="camera" size={16} />Revisar una planta</a>
      </div>

      <RecordForm plotId={p.id} kinds={p.record_kinds} onSaved={update} />

      <section aria-labelledby="records-title">
        <h2 id="records-title" className="section-title">Cuaderno de campo</h2>
        {p.records && p.records.length
          ? <ul className="mt-3 divide-y divide-[var(--color-outline-variant)] rounded-xl bg-white" data-testid="record-list">
            {p.records.map(r => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.kind_label} <span className="font-normal text-[var(--color-on-variant)]">· {fmtDate(r.date)}</span></p>
                  {r.description && <p className="text-sm">{r.description}</p>}
                  <p className="text-sm text-[var(--color-on-variant)]">
                    {r.quantity != null && `${num(r.quantity, 2)} ${UNITS.find(u => u[0] === r.unit)?.[1] ?? r.unit}`}
                    {r.quantity != null && r.cost_bs != null && ' · '}
                    {r.cost_bs != null && `${r.kind === 'venta' ? 'Recibió' : 'Costo'}: ${bs(r.cost_bs)}`}
                  </p>
                </div>
                <button type="button" onClick={() => delRecord(r.id)} aria-label={`Eliminar registro de ${r.kind_label}`} className="rounded-lg p-2 text-[var(--color-on-variant)] hover:bg-[var(--color-surface-low)]"><Icon name="trash" size={18} /></button>
              </li>
            ))}
          </ul>
          : <p className="mt-2 text-[var(--color-on-variant)]">Todavía no hay registros. Anote la siembra, el riego, los gastos y la cosecha.</p>}
      </section>
      <button type="button" onClick={remove} className="text-sm font-semibold text-rojo underline">Eliminar esta parcela</button>
    </div>
  )
}

function RecordForm({ plotId, kinds, onSaved }: { plotId: number; kinds: Record<string, string>; onSaved: (p: PlotT) => void }) {
  const empty = { date: today(), kind: 'siembra', description: '', quantity: '', unit: '', cost: '' }
  const [f, setF] = useState(empty)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }))
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      onSaved(await api<PlotT>(`/api/plots/${plotId}/records`, { body: { date: f.date, kind: f.kind, description: f.description, quantity: n(f.quantity), unit: f.unit, cost_bs: n(f.cost) } }))
      setF({ ...empty, kind: f.kind })
    } catch (e2) { setErr((e2 as Error).message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="panel space-y-3" data-testid="record-form">
      <h2 className="font-display text-[1.25rem] font-semibold text-[var(--color-primary)]">Anotar una actividad</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Qué hizo"><select className={inputCls} value={f.kind} onChange={set('kind')}>{Object.entries(kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Fecha"><input type="date" className={inputCls} value={f.date} onChange={set('date')} required /></Field>
      </div>
      <Field label="Detalle (opcional)"><input className={inputCls} value={f.description} onChange={set('description')} maxLength={300} placeholder="Ej.: semilla certificada, 2 jornales" /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cantidad"><input className={inputCls} inputMode="decimal" value={f.quantity} onChange={set('quantity')} /></Field>
        <Field label="Unidad"><select className={inputCls} value={f.unit} onChange={set('unit')}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label={f.kind === 'venta' ? 'Monto recibido (Bs)' : 'Costo (Bs)'}><input className={inputCls} inputMode="decimal" value={f.cost} onChange={set('cost')} /></Field>
      </div>
      {err && <p className="font-semibold text-rojo" role="alert">{err}</p>}
      <Button disabled={busy} className="w-full sm:w-auto">{busy ? 'Guardando…' : 'Guardar en el cuaderno'}</Button>
    </form>
  )
}
