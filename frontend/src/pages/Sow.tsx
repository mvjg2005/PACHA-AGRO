import { useEffect, useRef, useState } from 'react'
import { GpsButton } from '../components/GpsButton'
import { DepartmentList, MunicipalityList, OptionButton } from '../components/LocationPicker'
import { Button, Card, DataTag, ErrorBox, Loading, Notice, PageTitle, STATUS_UI, StatusMark } from '../components/ui'
import { api } from '../lib/api'
import { updatedAt } from '../lib/format'
import { shareText, whatsappShareUrl } from '../lib/share'
import { useApp } from '../lib/store'
import type { Crop, Recommendation } from '../lib/types'

type Answers = { dept?: string; muni?: string; crop?: string; variety?: string; moisture?: string; irrigation?: string }
const STEPS = ['dept', 'muni', 'crop', 'variety', 'moisture', 'irrigation'] as const

export default function Sow({ presetCrop }: { presetCrop?: string }) {
  const { findMunicipality, municipalityId, setMunicipalityId, gps } = useApp()
  const saved = findMunicipality(municipalityId)
  const [a, setA] = useState<Answers>(presetCrop ? { crop: presetCrop } : {})
  const [step, setStep] = useState(0)
  const [crops, setCrops] = useState<Crop[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<Recommendation | null>(null)
  const [loading, setLoading] = useState(false)

  const loadCrops = () => { setErr(null); api<{ crops: Crop[] }>('/api/crops').then(d => setCrops(d.crops)).catch(e => setErr(e.message)) }
  useEffect(loadCrops, [])

  const set = (k: keyof Answers, v: string) => { setA(p => ({ ...p, [k]: v })); setStep(s => s + 1) }
  const useSaved = () => { if (saved) { setA({ dept: saved.department_id, muni: saved.id }); setStep(2) } }

  const submit = async (irrigation: string, extra: Partial<Answers> = {}) => {
    const ans = { ...a, ...extra, irrigation }
    setA(ans); setLoading(true); setErr(null)
    try {
      // Con GPS para ese municipio se envía el punto exacto (el clima es de su parcela, no del centro urbano).
      const where = gps && gps.municipalityId === ans.muni ? { lat: gps.lat, lon: gps.lon } : { municipality_id: ans.muni }
      const r = await api<Recommendation>('/api/recommendations', { timeoutMs: 65000, body: {
        ...where, crop: ans.crop, variety: ans.variety === 'Otra / no sé' ? null : ans.variety,
        soil_moisture: ans.moisture, irrigation: ans.irrigation, mode: 'real' } })
      setResult(r)
      if (ans.muni && !(gps && gps.municipalityId === ans.muni)) setMunicipalityId(ans.muni)
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }
  const restart = () => { setA({}); setStep(0); setResult(null) }

  // Acceso rápido desde la portada (#/sembrar/cultivo/papa): al llegar a la pregunta del cultivo se salta una vez.
  const skipped = useRef(false)
  useEffect(() => {
    if (presetCrop && step === 2 && a.crop === presetCrop && !skipped.current && crops?.some(c => c.id === presetCrop)) {
      skipped.current = true; setStep(3)
    }
  }, [step, crops])

  if (loading) return <><PageTitle title="¿Cuándo puedo sembrar?" /><Loading text="Revisando clima y calendario…" /></>
  const tryCrop = (id: string) => { setResult(null); submit(a.irrigation ?? 'secano', { crop: id, variety: undefined }) }
  if (result) return <Result r={result} onRestart={restart} onTry={tryCrop} />

  const crop = crops?.find(c => c.id === a.crop)
  const muni = findMunicipality(a.muni ?? null)
  const key = STEPS[step]

  return (
    <div>
      <PageTitle title="¿Cuándo puedo sembrar?" subtitle={presetCrop && crops?.find(c => c.id === presetCrop) ? `Consulta para ${crops.find(c => c.id === presetCrop)!.name.toLowerCase()}. Responda unas preguntas cortas.` : 'Responda 6 preguntas cortas.'} />
      <div className="mb-4" aria-label={`Paso ${step + 1} de 6`}>
        <div className="flex gap-1.5" aria-hidden="true">{STEPS.map((_, i) => <span key={i} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-bosque' : 'bg-linea'}`} />)}</div>
        <div className="mt-1 flex justify-between text-musgo"><span>Paso {step + 1} de 6</span>
          {step > 0 && <button className="min-h-10 font-semibold text-bosque underline underline-offset-4" onClick={() => setStep(s => s - 1)}>← Atrás</button>}</div>
      </div>
      {err && <div className="mb-4"><ErrorBox message={err} onRetry={crops ? undefined : loadCrops} /></div>}

      {key === 'dept' && (<>
        <Q n={1} text="¿En qué departamento está?" />
        <div className="mb-3"><GpsButton onLocated={g => { const m = findMunicipality(g.municipalityId); if (m) { setA({ dept: m.department_id, muni: m.id }); setStep(2) } }} /></div>
        {saved && <div className="mb-3"><OptionButton onClick={useSaved}>{gps && gps.municipalityId === saved.id ? `Usar mi ubicación guardada (cerca de ${saved.name})` : `Usar ${saved.name}, ${saved.department_name}`}</OptionButton></div>}
        <DepartmentList selected={a.dept} onPick={v => set('dept', v)} />
      </>)}
      {key === 'muni' && a.dept && (<><Q n={2} text="¿En qué municipio o comunidad?" /><MunicipalityList departmentId={a.dept} selected={a.muni} onPick={v => set('muni', v)} /></>)}
      {key === 'crop' && (<>
        <Q n={3} text="¿Qué cultivo quiere sembrar?" />
        {!crops ? <Loading /> : (
          <div className="grid grid-cols-2 gap-3">
            {crops.map(c => {
              const st = muni ? c.regions[muni.region] : undefined
              return (
                <OptionButton key={c.id} selected={a.crop === c.id} onClick={() => set('crop', c.id)}>
                  <span className="block">{c.name}</span>
                  <span className="block text-sm font-normal text-musgo">{st === 'implemented' ? 'Disponible' : st === 'demo' ? 'Demostración' : 'Sin reglas aún'}</span>
                </OptionButton>
              )
            })}
          </div>
        )}
      </>)}
      {key === 'variety' && crop && (<><Q n={4} text={`¿Qué variedad de ${crop.name.toLowerCase()} va a usar?`} />
        <div className="grid gap-3">{crop.varieties.map(v => <OptionButton key={v} selected={a.variety === v} onClick={() => set('variety', v)}>{v}</OptionButton>)}</div></>)}
      {key === 'moisture' && (<><Q n={5} text="¿Su terreno tiene humedad suficiente?" />
        <p className="mb-3 text-musgo">Prueba: apriete tierra de 5-10 cm de hondo. Si forma un terrón, hay humedad.</p>
        <div className="grid gap-3">
          <OptionButton onClick={() => set('moisture', 'si')}>Sí, está húmedo</OptionButton>
          <OptionButton onClick={() => set('moisture', 'poca')}>Un poco</OptionButton>
          <OptionButton onClick={() => set('moisture', 'no')}>No, está seco</OptionButton>
          <OptionButton onClick={() => set('moisture', 'no_se')}>No sé</OptionButton>
        </div></>)}
      {key === 'irrigation' && (<><Q n={6} text="¿Tiene riego o depende de la lluvia?" />
        <div className="grid gap-3">
          <OptionButton onClick={() => submit('riego')}>Tengo riego</OptionButton>
          <OptionButton onClick={() => submit('secano')}>Depende de la lluvia</OptionButton>
        </div></>)}
    </div>
  )
}

function Q({ n, text }: { n: number; text: string }) {
  return <h2 className="mb-3 text-[1.4rem] font-bold leading-snug"><span className="sr-only">Pregunta {n}: </span>{text}</h2>
}

function Result({ r, onRestart, onTry }: { r: Recommendation; onRestart: () => void; onTry: (crop: string) => void }) {
  const ui = STATUS_UI[r.status]
  const sim = r.mode === 'simulado'
  const noForecast = r.weather_summary && !r.weather_summary.forecast_available && r.mode === 'real'
  const key = r.key_factor
  const [copied, setCopied] = useState(false)
  const message = shareText(r)
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true) } catch { setCopied(false) }
  }
  return (
    <div className="space-y-3.5">
      <div>
        <h1 className="font-display text-[1.5rem] font-bold leading-tight text-bosque">{r.crop_name} en {r.location.name}</h1>
        <p className="text-[0.95rem] text-musgo">{r.location.department_name}{r.variety ? ` · ${r.variety}` : ''}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {sim && <span data-testid="sim-badge" className="rounded-full border border-dashed border-tierra bg-tierra-100 px-2 py-px text-[0.8rem] font-bold text-tierra">Caso simulado</span>}
          <span className="rounded-full bg-sol-50 px-2 py-0.5 text-[0.8rem] font-semibold text-sol-ink">Orientación experimental</span>
          {r.scenario_status === 'demo' && <span className="rounded-full bg-sol-50 px-2 py-0.5 text-[0.8rem] font-semibold text-sol-ink">Reglas preliminares</span>}
        </div>
      </div>

      <section aria-live="polite" aria-label="Resultado" className={`border-l-4 p-4 ${ui.box}`}>
        <div className={`flex items-center gap-2.5 font-display text-[1.45rem] leading-tight ${ui.ink}`}><StatusMark status={r.status} size={14} />{r.headline}</div>
        {key && (
          <div className="mt-2.5" data-testid="key-factor">
            <p className="text-sm font-bold uppercase tracking-wide text-musgo">Lo que más pesa</p>
            <p className="flex items-center gap-2 text-lg font-bold"><StatusMark status={key.status} />{key.label}</p>
            <p className="mt-0.5">{key.explanation}</p>
          </div>
        )}
        {!key && <p className="mt-2 text-lg">{r.summary}</p>}
        <div className="mt-2.5 rounded-md bg-white p-3" data-testid="main-action">
          <p className="text-sm font-bold uppercase tracking-wide text-bosque">Qué hacer ahora</p>
          <p className="text-lg font-semibold">{r.main_action}</p>
          {!!r.alternatives?.length && <div className="mt-2.5 flex flex-wrap gap-2" data-testid="crop-alternatives">
            {r.alternatives.map(c => <button key={c.id} type="button" className="btn-soft !w-auto !min-h-11" onClick={() => onTry(c.id)}>Ver {c.name.toLowerCase()}</button>)}
          </div>}
        </div>
        {sim && <p className="mt-2 text-sm font-semibold text-tierra">Caso simulado: el clima usado es ficticio. No lo use para decidir.</p>}
      </section>

      {r.missing_data.length > 0 && (
        <Notice tone="warn"><strong>Faltan datos:</strong> {r.missing_data.join(', ')}. El resultado se basa en menos información.</Notice>
      )}

      <div className="grid gap-2">
        <a className="flex min-h-12 items-center justify-center rounded-md bg-[#1f7a4a] px-5 text-lg font-semibold text-white" href={whatsappShareUrl(r)} target="_blank" rel="noopener noreferrer" data-testid="share-whatsapp">Compartir por WhatsApp</a>
        <a className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-bosque bg-white px-5 text-lg font-semibold text-bosque" href={`#/asesoria/${r.crop}`} data-testid="talk-expert">Hablar con un técnico</a>
        <details className="rounded-md border border-linea bg-white p-3">
          <summary className="cursor-pointer font-semibold text-bosque">Ver el mensaje que se enviará</summary>
          <p className="mt-2 whitespace-pre-line rounded-lg bg-[#efe9dc] p-3 text-[0.95rem]" data-testid="share-preview">{message}</p>
          <Button variant="secondary" className="mt-2 w-full" onClick={copy}>{copied ? 'Mensaje copiado' : 'Copiar mensaje'}</Button>
          <p className="mt-2 text-sm text-musgo">Se abre WhatsApp en su celular y usted elige a quién enviarlo. El asistente automático de AgroBolivia en WhatsApp todavía es un simulador.</p>
        </details>
      </div>

      <details className="rounded-md border border-linea bg-white p-3">
        <summary className="cursor-pointer font-semibold text-bosque">Confianza: {r.confidence} · ¿qué significa?</summary>
        <p className="mt-2">{r.confidence_explanation}</p>
        <p className="mt-2 text-sm text-musgo">Las reglas son experimentales y están pendientes de validación agronómica. No es una fecha exacta de siembra.</p>
      </details>

      {r.weather_summary?.stale && (
        <Notice tone="warn"><span data-testid="stale-forecast"><strong>Pronóstico no actualizado.</strong> Usamos el último pronóstico obtenido ({updatedAt(r.weather_summary.stale_fetched_at ?? null)}). Vuelva a consultar más tarde antes de decidir.</span></Notice>
      )}
      {noForecast && (
        <Notice tone="warn">
          <strong>Sin pronóstico ahora.</strong> {r.weather_summary?.forecast_error} {r.weather_summary?.recent_source ? 'La consulta incluye datos históricos disponibles.' : 'Revise los criterios que tienen datos disponibles.'}
        </Notice>
      )}

      {r.criteria.length > 0 && (
        <section aria-labelledby="todos">
          <h2 id="todos" className="mb-2 text-xl font-bold">Todos los factores</h2>
          <ul className="space-y-2">
            {r.criteria.map(c => (
              <li key={c.id} className={`rounded-md border bg-white p-3 ${key?.id === c.id ? 'border border-bosque' : 'border-linea'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-lg font-bold"><StatusMark status={c.status} />{c.label}</span><DataTag kind={c.data_kind} />
                </div>
                <p className="mt-1">{c.explanation}</p>
                {c.source && <p className="mt-1 text-sm text-musgo">Fuente: {c.source}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card>
        <h2 className="mb-2 text-xl font-bold">Otras recomendaciones</h2>
        <ul className="list-disc space-y-1 pl-5">{r.actions.map(x => <li key={x}>{x}</li>)}</ul>
      </Card>

      <Button variant="secondary" className="w-full" onClick={onRestart}>Hacer otra consulta</Button>

      <details className="rounded-md border border-linea bg-white p-3">
        <summary className="cursor-pointer text-lg font-semibold text-bosque">Detalles técnicos y fuentes</summary>
        <div className="mt-2 space-y-2 text-base">
          <p>{r.disclaimer}</p>
          {r.score !== null && <p>Puntaje experimental ponderado: <strong>{r.score}</strong> (no es una probabilidad).</p>}
          {r.variety_note && <p>{r.variety_note}</p>}
          {r.notes.map(n => <p key={n}>• {n}</p>)}
          {r.sources.length > 0 && <><p className="font-semibold">Referencias:</p><ul className="list-disc pl-5">{r.sources.map(s => <li key={s}>{s}</li>)}</ul></>}
        </div>
      </details>
    </div>
  )
}
