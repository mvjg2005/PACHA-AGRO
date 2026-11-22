import { SprayCard } from '../components/SprayCard'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { LocationSelector } from '../components/LocationPicker'
import { Button, Card, DataTag, ErrorBox, Loading, Notice, PageTitle } from '../components/ui'
import { api } from '../lib/api'
import { dayLabel, round, updatedAt, weatherIcon } from '../lib/format'
import { useApp } from '../lib/store'
import type { Weather as W } from '../lib/types'

const MapView = lazy(() => import('../components/MapView'))

const FROST = {
  alto: { cls: 'border-[#a63a2b] bg-[#faefec] text-[#8a2e22]', title: 'Riesgo ALTO de helada' },
  medio: { cls: 'border-[#b07a12] bg-[#fbf6e9] text-[#5f4500]', title: 'Puede haber helada' },
  bajo: { cls: 'border-[#2f7a46] bg-[#f1f6ee] text-[#1f5531]', title: 'Riesgo bajo de helada' },
  desconocido: { cls: 'border-[#77756d] bg-[#f4f3f0] text-[#3f3e3a]', title: 'Riesgo de helada desconocido' },
}

export default function Weather() {
  const { municipalityId, setMunicipalityId, locationQuery, gps } = useApp()
  const [wx, setWx] = useState<W | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [map, setMap] = useState(false)
  const [retry, setRetry] = useState(0)

  const load = () => setRetry(attempt => attempt + 1)
  useEffect(() => {
    if (!municipalityId) return
    let current = true
    setWx(null); setErr(null)
    api<W>(`/api/weather?${locationQuery(municipalityId)}`, { timeoutMs: 65000 })
      .then(value => { if (current) setWx(value) })
      .catch(error => { if (current) setErr(error.message) })
    return () => { current = false }
  }, [municipalityId, retry, gps?.lat, gps?.lon])

  return (
    <div className="space-y-4">
      <PageTitle title="¿Cómo estará el clima?" />
      <LocationSelector value={municipalityId} onChange={setMunicipalityId} />
      {!municipalityId ? null : err ? <ErrorBox message={err} onRetry={load} /> : !wx ? <Loading text="Buscando el pronóstico…" /> : (
        <>
          {wx.location.far && <Notice tone="warn">Su ubicación está a {Math.round(wx.location.distance_km ?? 0)} km del municipio registrado más cercano ({wx.location.nearest_name}). El clima es de su punto exacto.</Notice>}
          {wx.forecast.extra?.stale && (
            <Notice tone="warn" ><span data-testid="stale-forecast"><strong>No pudimos actualizar el pronóstico ahora.</strong> Mostramos el último que obtuvimos ({updatedAt(wx.forecast.extra.stale_fetched_at)}). Vuelva a consultar más tarde.</span></Notice>
          )}
          {wx.forecast.available && wx.forecast.extra?.fallback_from?.length > 0 && (
            <Notice tone="info"><strong>Pronóstico de respaldo.</strong> Open-Meteo no respondió; mostramos los datos de MET Norway.</Notice>
          )}
          <FrostCard wx={wx} />

          {wx.forecast.available ? (
            <>
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-musgo">Temperatura ahora</div>
                    <div className="text-5xl font-bold text-bosque">{round(wx.forecast.current_temp)}</div>
                  </div>
                  <div className="text-right text-sm text-musgo">
                    <DataTag kind={wx.forecast.kind} /><div className="mt-1">{wx.forecast.current_time?.replace('T', ' ')}</div>
                  </div>
                </div>
              </Card>
              <section aria-labelledby="pron">
                <h2 id="pron" className="mb-2 text-xl font-bold">Próximos 7 días</h2>
                <ul className="divide-y divide-linea overflow-hidden rounded-md border border-linea bg-white">
                  {wx.forecast.daily.map(d => {
                    const w = weatherIcon(d.weather_code, d.storm)
                    const frosty = d.tmin !== null && d.tmin <= 0
                    return (
                      <li key={d.date} className="grid grid-cols-[4.3rem_2.2rem_1fr_auto] items-center gap-2 px-3 py-3">
                        <span className="font-bold">{dayLabel(d.date)}</span>
                        <span className="text-[#3c4a3f]" title={w.text}>{w.icon ? <Icon name={w.icon} size={24} label={w.text} /> : <span className="text-sm">—</span>}</span>
                        <span className="whitespace-nowrap leading-tight"><span className="block text-base">{d.precip_mm?.toFixed(0) ?? '—'} mm</span>{d.precip_prob !== null && <span className="block text-sm text-musgo">{d.precip_prob}% prob.</span>}</span>
                        <span className="text-right text-lg">
                          <span className={frosty ? 'font-bold text-rojo' : 'text-[#24435f]'}>{frosty && ''}{round(d.tmin)}</span>
                          <span className="text-musgo"> / </span><span className="font-semibold">{round(d.tmax)}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-1 text-sm text-musgo">Mínima / máxima a 2 m del suelo. A ras del suelo puede hacer más frío.</p>
              </section>
            </>
          ) : (
            <Notice tone="warn">
              <p className="font-bold">No hay pronóstico disponible en este momento.</p>
              <p className="mt-1">{wx.forecast.error}</p>
              <Button className="mt-3" variant="secondary" onClick={load}>Intentar de nuevo</Button>
            </Notice>
          )}

          {wx.spray && <SprayCard spray={wx.spray} />}
          <StormCard wx={wx} />
          {wx.recent.available && <RecentCard wx={wx} />}

          <a href="#/sin-internet" className="flex min-h-12 items-center justify-between rounded-md border border-linea bg-white px-4 py-3 font-semibold text-bosque" data-testid="weather-offline-link">
            <span>Sin internet: guardar la semana o enviarla por SMS</span><span aria-hidden="true">→</span>
          </a>
          <a href="#/avisos" className="flex min-h-12 items-center justify-between rounded-md border border-linea bg-white px-4 py-3 font-semibold text-bosque">
            <span>Avisos de la plataforma para su zona</span><span aria-hidden="true">→</span>
          </a>
          {wx.forecast.extra?.official && <Notice tone="ok">Pronóstico de fuente oficial: {wx.forecast.source}.</Notice>}

          <Card className="border border-tierra">
            <h2 className="text-lg font-bold">Avisos oficiales (SENAMHI)</h2>
            <p className="mt-1">{wx.official_alerts.message}</p>
            <a className="mt-2 inline-block min-h-12 py-2 font-semibold text-bosque underline underline-offset-4" href={wx.official_alerts.url} target="_blank" rel="noopener noreferrer">Abrir senamhi.gob.bo ↗</a>
          </Card>

          {!map ? <Button variant="secondary" className="w-full" onClick={() => setMap(true)}>Ver ubicación en el mapa</Button>
            : <Suspense fallback={<Loading text="Cargando mapa…" />}><MapView lat={wx.location.lat} lon={wx.location.lon} label={wx.location.name} /></Suspense>}

          <Card className="text-sm text-musgo">
            <p><strong>Fuentes:</strong> {wx.forecast.source}{wx.recent.available ? ` · ${wx.recent.source}` : ''}{wx.climatology.available ? ` · ${wx.climatology.source}` : ''}.</p>
            <p>Actualizado: {updatedAt(wx.forecast.fetched_at ?? wx.generated_at)}</p>
            {wx.forecast.extra?.license && <p>{wx.forecast.extra.license}</p>}
            <p>Coordenadas aproximadas del centro del municipio ({wx.location.lat}, {wx.location.lon}).</p>
          </Card>
        </>
      )}
    </div>
  )
}

function FrostCard({ wx }: { wx: W }) {
  const f = wx.frost_risk
  const ui = FROST[f.level] ?? FROST.desconocido
  return (
    <section className={`border-l-4 px-4 py-3.5 ${ui.cls}`} aria-live="polite">
      <h2 className="flex items-center gap-2 font-display text-[1.4rem] leading-tight"><Icon name="frost" size={22} />{ui.title}</h2>
      {f.basis === 'pronostico' && f.min_tmin != null && <p className="mt-1 text-lg">Mínima más baja: <strong>{round(f.min_tmin)}</strong> el {dayLabel(f.date!)} (próximos 7 días).</p>}
      {f.basis === 'climatologia' && (f.frost_days_month != null
        ? <p className="mt-1 text-lg">Sin pronóstico. En este mes suele haber unos <strong>{Math.round(f.frost_days_month)} días con helada</strong> (promedio histórico).</p>
        : <p className="mt-1 text-lg">Sin pronóstico y sin promedio histórico disponible para este mes.</p>)}
      {f.basis === null && <p className="mt-1">No hay datos suficientes para estimar el riesgo.</p>}
      {f.basis && <div className="mt-2"><DataTag kind={wx.mode === 'simulado' ? 'simulado' : f.basis} /></div>}
    </section>
  )
}

function StormCard({ wx }: { wx: W }) {
  const s = wx.storm_risk
  if (s.level === 'desconocido') return null
  return (
    <Card className={s.level === 'posible' ? 'border border-ocre bg-sol-50' : ''}>
      <h2 className="text-lg font-bold">{s.level === 'posible' ? 'Tormentas posibles' : 'Sin tormentas pronosticadas'}</h2>
      {s.days.length > 0 && <p className="mt-1">Días: {s.days.map(d => dayLabel(d)).join(', ')}</p>}
      <p className="mt-1 text-musgo">{s.note}</p>
    </Card>
  )
}

function RecentCard({ wx }: { wx: W }) {
  const r = wx.recent
  const rains = r.daily.map(d => d.precip_mm).filter((v): v is number => v != null)
  const mins = r.daily.map(d => d.tmin).filter((v): v is number => v != null)
  const total = rains.length ? rains.reduce((a, v) => a + v, 0) : null
  const coldest = mins.length ? Math.min(...mins) : null
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Lo que pasó los últimos días</h2><DataTag kind="estimacion" /></div>
      <p className="mt-1">Lluvia acumulada: <strong>{total === null ? '—' : `${total.toFixed(0)} mm`}</strong>{total !== null && ` en ${rains.length} días`} · Mínima más baja: <strong>{coldest === null ? '—' : round(coldest)}</strong></p>
      <p className="mt-1 text-sm text-musgo">Hasta el {r.extra?.last_date}. {r.source}. Los datos llegan con algunos días de retraso.</p>
    </Card>
  )
}
