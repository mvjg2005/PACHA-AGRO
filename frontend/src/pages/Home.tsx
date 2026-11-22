import { useEffect, useState } from 'react'
import { ArticleGrid } from '../components/ArticleCard'
import { SprayLine } from '../components/SprayCard'
import { DiagnoseCta, GanadoCta, MyCrops, SenasCta } from '../components/FieldBits'
import { onboarded, setOnboarded, useMyCrops } from '../lib/prefs'
import { Icon, type IconName } from '../components/Icon'
import { MunicipalitySelect } from '../components/SiteChrome'
import { StatusMark } from '../components/ui'
import { api } from '../lib/api'
import { lessonArticle, libraryArticle, recommended, type Article } from '../lib/articles'
import { dayLabel, round, weatherIcon } from '../lib/format'
import { useApp } from '../lib/store'
import type { Library, Status, Weather } from '../lib/types'

const QUICK_CROPS = [['papa', 'Papa'], ['maiz', 'Maíz'], ['quinua', 'Quinua'], ['haba', 'Haba']] as const

/** Campaña agrícola: de julio a junio del año siguiente. */
function campaign(d = new Date()) {
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
  return `${y}–${y + 1}`
}

function useWeather() {
  const { municipalityId, locationQuery, gps } = useApp()
  const [state, setState] = useState<{ id: string; wx: Weather | null } | undefined>()
  useEffect(() => {
    if (!municipalityId) return
    let alive = true
    api<Weather>(`/api/weather?${locationQuery(municipalityId)}`, { timeoutMs: 65000 })
      .then(wx => alive && setState({ id: municipalityId, wx }))
      .catch(() => alive && setState({ id: municipalityId, wx: null }))
    return () => { alive = false }
  }, [municipalityId, gps?.lat, gps?.lon])
  if (!municipalityId) return { status: 'none' as const }
  if (!state || state.id !== municipalityId) return { status: 'loading' as const }
  return state.wx ? { status: 'ok' as const, wx: state.wx } : { status: 'error' as const }
}

export default function Home() {
  const { user } = useApp()
  const myCrops = useMyCrops(user)
  const weather = useWeather()
  const [articles, setArticles] = useState<Article[] | null>(null)
  useEffect(() => {
    Promise.all([api<{ lessons: any[] }>('/api/education?lang=es'), api<Library>('/api/education/library')])
      .then(([les, lib]) => setArticles(recommended(
        les.lessons.map(lessonArticle),
        lib.items.map(i => ({ ...libraryArticle(i, lib.types), crop: i.crop })),
        user?.crops ?? [])))
      .catch(() => setArticles([]))
  }, [user?.crops.join(',')])

  return (
    <div className="home">
      {/* Propuesta de valor */}
      <section className="mx-auto flex max-w-3xl flex-col items-center pt-2 text-center md:pt-8">
        <span className="hero-badge"><span className="hero-dot" aria-hidden="true" />Plataforma agroclimática abierta</span>
        <h1 className="hero-title"><span className="block">Tu campo, tu comunidad,</span><span className="block italic text-[var(--color-secondary)]">mejores decisiones.</span></h1>
        <p className="hero-lead">Consulta el clima agrícola, planifica tus siembras según tu zona y mantente conectado con tu comunidad, sin costo.</p>
        <MobileQuick />
      </section>

      <div className="mt-6 grid items-stretch gap-6 md:mt-10 lg:grid-cols-12">
        <SowCard />
        <ForecastCard weather={weather} />
      </div>

      {!user && !onboarded() && myCrops.length === 0 ? <SetupInvite /> : <div className="mt-6 rounded-2xl bg-white px-5 py-4 shadow-sm"><MyCrops crops={myCrops} compact /></div>}

      <Indicators weather={weather} />

      <div className="mt-8"><GanadoCta /></div>
      <div className="mt-8"><SenasCta /></div>
      <div className="mt-8"><DiagnoseCta /></div>

      {/* Artículos */}
      <section className="mt-12">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Biblioteca y lecciones</p>
            <h2 className="section-title">Artículos recomendados</h2>
          </div>
          <a href="#/aprender/biblioteca" className="link-caps">Ver todos los artículos <Icon name="arrowRight" size={16} /></a>
        </div>
        {articles === null ? <p className="text-[var(--color-on-variant)]" role="status">Cargando artículos…</p>
          : articles.length === 0 ? <p className="text-[var(--color-on-variant)]">No se pudieron cargar los artículos. <a className="site-text-link" href="#/aprender">Ir a Aprender</a></p>
            : <ArticleGrid items={articles} showSummary />}
      </section>

      {/* Herramientas */}
      <section className="panel mt-12">
        <p className="eyebrow">Herramientas</p>
        <h2 className="section-title">Más herramientas</h2>
        <p className="mt-1 text-sm text-[var(--color-on-variant)]">Para consultar en el campo o en la asamblea de su comunidad.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Tool href="#/campo/calculadora/ganancia" icon="calculator" title="Calculadoras" text="Ganancia, precio sin pérdida, cosecha necesaria, insumos y mezcla según la etiqueta." cta="Calcular" />
          <Tool href="#/campo/parcelas" icon="notebook" title="Mis parcelas" text="Cuaderno de campo: siembra, labores, gastos, cosecha y ventas de cada parcela." cta="Abrir cuaderno" tone="secondary" />
          <Tool href="#/asesoria" icon="chat" title="Asesoría y técnicos" text="Cuente su problema: le orientamos y le damos contactos de técnicos de su zona y sitios útiles." cta="Preguntar" />
          <Tool href="#/aprender" icon="book" title="Lecciones y guías" text="Aprenda a leer el pronóstico y a reducir riesgos con lecciones de 2 minutos." cta="Aprender" />
        </div>
      </section>

      {/* Conexiones rurales */}
      <section className="mt-8 flex flex-col items-start justify-between gap-6 rounded-2xl bg-[var(--color-surface-mid)] p-6 sm:p-8 md:flex-row md:items-center">
        <div className="flex items-start gap-4">
          <span className="icon-square"><Icon name="signal" size={26} /></span>
          <div>
            <h2 className="font-display text-[1.3rem] font-semibold text-[var(--color-primary)]">Pensado para el campo y las conexiones rurales</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-on-variant)]">Es liviana, funciona en celulares sencillos y guarda los últimos datos consultados para verlos sin señal. Las lecciones en quechua y aimara están en preparación.</p>
          </div>
        </div>
        <a href="#/cobertura" className="btn-primary w-full shrink-0 sm:w-auto"><Icon name="map" size={18} />Ver cobertura</a>
      </section>

      <div className="mt-6 flex flex-col justify-between gap-3 rounded-xl bg-[var(--color-surface-low)] px-4 py-3 text-xs text-[var(--color-on-variant)] sm:flex-row sm:items-center">
        <p className="flex items-start gap-2"><Icon name="info" size={16} className="text-[var(--color-secondary)]" />
          <span>La orientación de siembra es referencial y sus reglas están en revisión. ¿Necesita hablar con alguien? En <a className="font-semibold text-[var(--color-primary)] underline" href="#/asesoria">Asesoría</a> encontrará técnicos de su zona.</span></p>
        <div className="flex shrink-0 gap-3 font-semibold">
          <a className="text-[var(--color-primary)] hover:underline" href="#/clima">Fuentes de datos</a>
          <span className="text-[var(--color-outline-variant)]">·</span>
          <a className="text-[var(--color-primary)] hover:underline" href="#/privacidad">Privacidad</a>
        </div>
      </div>
    </div>
  )
}

/** Solo en celular: las dos acciones principales a la vista sin desplazarse. */
function MobileQuick() {
  const { findMunicipality, municipalityId } = useApp()
  const m = findMunicipality(municipalityId)
  return (
    <div className="mobile-quick mt-5 grid w-full gap-2">
      <a href="#/sembrar" className="btn-primary !normal-case !tracking-normal !text-[.95rem]">Consultar condiciones de siembra <Icon name="arrowRight" size={18} /></a>
      <a href="#/clima" className="btn-soft !normal-case !tracking-normal !text-[.95rem]"><Icon name="cloudSun" size={18} />{m ? `Clima de ${m.name}` : 'Elegir municipio'}</a>
    </div>
  )
}

function SowCard() {
  return (
    <section className="sow-card lg:col-span-7">
      <div className="sow-glow" aria-hidden="true" />
      <div className="relative">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span className="chip-light"><Icon name="leaf" size={14} />Herramienta gratuita</span>
          <span className="text-xs font-medium tracking-wide text-[var(--color-primary-dim)]">Campaña agrícola {campaign()}</span>
        </div>
        <h2 className="font-display text-[2rem] leading-tight text-white">¿Cuándo puedo sembrar?</h2>
        <p className="sow-desc mt-3 max-w-xl text-[#d5dcd3]">Revise el riesgo de helada, la lluvia, la humedad del suelo y la época de siembra de su zona. Sin registrarse.</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[.72rem] font-semibold uppercase tracking-[.12em] text-[#d5dcd3]">Consulta rápida:</span>
          {QUICK_CROPS.map(([id, name]) => (
            <a key={id} href={`#/sembrar/cultivo/${id}`} className="chip-dark"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary-dim)]" aria-hidden="true" />{name}</a>
          ))}
        </div>
      </div>
      <div className="relative mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
        <a href="#/sembrar" className="btn-light">Consultar condiciones de siembra <Icon name="arrowRight" size={18} /></a>
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-primary-dim)]"><Icon name="offline" size={15} />Funciona con poca señal</span>
      </div>
    </section>
  )
}

const FROST: Record<string, { status: Status; text: string }> = {
  alto: { status: 'rojo', text: 'Alto' }, medio: { status: 'amarillo', text: 'Medio' },
  bajo: { status: 'verde', text: 'Bajo' }, desconocido: { status: 'gris', text: 'Sin datos' },
}

function sourceShort(wx: Weather) {
  if (wx.forecast.available) return wx.forecast.extra?.official ? wx.forecast.source : wx.forecast.source.split(' (')[0]
  if (wx.recent.available) return 'NASA POWER'
  return 'Sin datos'
}

function ForecastCard({ weather }: { weather: ReturnType<typeof useWeather> }) {
  const { findMunicipality, municipalityId } = useApp()
  const m = findMunicipality(municipalityId)
  const wx = weather.status === 'ok' ? weather.wx : null
  const today = wx?.forecast.available ? wx.forecast.daily[0] : undefined
  const w = today ? weatherIcon(today.weather_code, today.storm) : null
  const frost = wx ? FROST[wx.frost_risk.level] : null
  const when = wx ? new Date(wx.forecast.fetched_at ?? wx.generated_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <section className="forecast-card lg:col-span-5" aria-labelledby="pron-local">
      <div>
        <div className="flex items-center justify-between gap-2 pb-4">
          <h2 id="pron-local" className="flex items-center gap-2 font-display text-[1.2rem] font-semibold text-[var(--color-primary)]">
            <Icon name="cloudSun" size={22} className="text-[var(--color-secondary)]" />Pronóstico local
          </h2>
          {wx && <span className="rounded bg-[var(--color-surface-mid)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-tint)]">{sourceShort(wx)}</span>}
        </div>
        <label className="mb-1.5 block text-[.72rem] font-semibold uppercase tracking-[.12em] text-[var(--color-on-variant)]" htmlFor="muni-select">Municipio</label>
        <div className="relative">
          <MunicipalitySelect id="muni-select" className="h-12 w-full appearance-none rounded-xl bg-[var(--color-surface-low)] px-3.5 pr-9" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-on-variant)]">▾</span>
        </div>
        {!m && <a className="site-text-link mt-3" href="#/clima">Elegir municipio</a>}
        {weather.status === 'loading' && <p className="mt-4 text-sm text-[var(--color-on-variant)]" role="status">Consultando la fuente meteorológica…</p>}
        {weather.status === 'error' && <p className="mt-4 text-sm text-[var(--color-on-variant)]">No se pudo cargar el clima. Revise su conexión.</p>}
        {wx && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--color-surface-low)] p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-surface-high)] text-[var(--color-secondary)]">
                  {w?.icon ? <Icon name={w.icon} size={28} label={w.text} /> : <Icon name="cloud" size={28} />}
                </span>
                <div>
                  <div className="text-[1.35rem] font-bold leading-tight">{today ? round(wx.forecast.current_temp ?? today.tmax) : '—'}</div>
                  <div className="text-xs font-medium text-[var(--color-on-variant)]">{w ? w.text : 'Sin pronóstico'} · {wx.location.elevation.toLocaleString('es-BO')} m</div>
                </div>
              </div>
              <div className="text-right text-xs">
                {today ? <>
                  <div className="font-bold">Mín {round(today.tmin)} / Máx {round(today.tmax)}</div>
                  <div className="mt-0.5 text-[var(--color-on-variant)]">Lluvia: {today.precip_prob ?? '—'}% prob.</div>
                </> : <div className="text-[var(--color-on-variant)]">Pronóstico no<br />disponible ahora</div>}
              </div>
            </div>
            {frost && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-mid)] p-3 text-xs">
                <span className="flex items-center gap-2"><StatusMark status={frost.status} size={10} />
                  <span className="font-bold">Riesgo de helada:</span><span className="font-bold">{frost.text}</span>
                  {wx.frost_risk.basis === 'climatologia' && <span className="text-[var(--color-on-variant)]">(histórico)</span>}
                  {wx.frost_risk.basis === 'pronostico' && wx.frost_risk.date && <span className="text-[var(--color-on-variant)]">({dayLabel(wx.frost_risk.date)})</span>}
                </span>
                <span className="text-[var(--color-on-variant)] tabular-nums">{when}</span>
              </div>
            )}
            {wx.spray && <SprayLine spray={wx.spray} />}
          </div>
        )}
      </div>
      <a href="#/clima" className="btn-soft mt-6">Ver pronóstico de 7 días <Icon name="calendar" size={16} /></a>
    </section>
  )
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-high)]"><div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, pct))}%`, background: color }} /></div>
}

function Indicator({ icon, label, value, note, pct, color, source }: { icon: IconName; label: string; value: string; note: string; pct: number | null; color: string; source: string }) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-[var(--color-surface-low)] p-4">
      <div className="mb-2 flex items-start justify-between gap-2 text-[var(--color-on-variant)]">
        <span className="text-[.7rem] font-bold uppercase tracking-[.1em]">{label}</span>
        <Icon name={icon} size={20} className="shrink-0" />
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-bold text-[var(--color-primary)]">{value}</span>
          <span className="text-xs font-semibold text-[var(--color-on-variant)]">{note}</span>
        </div>
        {pct !== null && <Bar pct={pct} color={color} />}
        <p className="mt-2 text-[11px] text-[var(--color-on-variant)]">{source}</p>
      </div>
    </div>
  )
}

/** Indicadores con datos reales (modelos y satélite). Si falta un dato, se dice. */
function Indicators({ weather }: { weather: ReturnType<typeof useWeather> }) {
  const { findMunicipality, municipalityId } = useApp()
  if (weather.status !== 'ok') return null
  const wx = weather.wx
  const m = findMunicipality(municipalityId)
  const f = wx.forecast, r = wx.recent, c = wx.climatology

  let soil = { value: '—', note: 'Sin dato', pct: null as number | null, source: 'Sin estimación disponible' }
  if (f.available && f.soil_moisture != null) {
    const v = f.soil_moisture
    soil = { value: `${Math.round(v * 100)} %`, note: v >= 0.2 ? 'Buena' : v >= 0.12 ? 'Regular' : 'Baja', pct: (v / 0.4) * 100, source: 'Modelo Open-Meteo, 3–9 cm (volumen)' }
  } else if (r.available && r.soil_moisture != null) {
    const v = r.soil_moisture
    soil = { value: `${Math.round(v * 100)} %`, note: v >= 0.5 ? 'Buena' : v >= 0.3 ? 'Regular' : 'Baja', pct: v * 100, source: 'NASA POWER, capa superficial (índice)' }
  }
  const rains = (days: Weather['forecast']['daily']) => {
    const values = days.map(d => d.precip_mm).filter((v): v is number => v != null)
    return values.length === days.length ? values.reduce((a, v) => a + v, 0) : null
  }
  const pastRain = r.available ? rains(r.daily) : null
  const nextRain = f.available ? rains(f.daily) : null
  const frostDays = c.available ? c.frost_days_month ?? null : null
  const updated = new Date(wx.generated_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
  const fr = wx.frost_risk.level

  return (
    <section className="panel mt-8" aria-labelledby="indicadores">
      <div className="flex flex-col justify-between gap-3 pb-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="indicadores" className="eyebrow !mb-0">Indicadores del campo</h2>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-tint)]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[var(--color-on-variant)]">Actualizado {updated}</span>
          </div>
          <p className="mt-1 text-sm text-[var(--color-on-variant)]">Estimaciones de modelos y satélite para {m?.name ?? wx.location.name}. No son mediciones de su parcela.</p>
        </div>
        {(fr === 'alto' || fr === 'medio') && (
          <span className="self-start rounded bg-[var(--color-secondary-fixed)] px-2.5 py-1 text-xs font-bold text-[var(--color-secondary)] lg:self-center">
            Riesgo de helada {fr === 'alto' ? 'alto' : 'medio'}{wx.frost_risk.basis === 'climatologia' ? ' (histórico)' : ''}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 min-[30rem]:grid-cols-2 lg:grid-cols-4" data-testid="indicators">
        <Indicator icon="drop" label="Humedad del suelo" value={soil.value} note={soil.note} pct={soil.pct} color="var(--color-tint)" source={soil.source} />
        <Indicator icon="rain" label="Lluvia reciente" value={pastRain === null ? '—' : `${pastRain.toFixed(0)} mm`}
          note={pastRain === null ? (r.available ? 'Datos incompletos' : 'Sin dato') : `en ${r.daily.length} días`} pct={pastRain === null ? null : (pastRain / 30) * 100} color="var(--color-secondary)"
          source={r.available ? `NASA POWER, hasta el ${dayLabel(r.extra?.last_date ?? '')}` : 'Historial no disponible'} />
        <Indicator icon="cloud" label="Lluvia próxima" value={nextRain === null ? '—' : `${nextRain.toFixed(0)} mm`}
          note={nextRain === null ? (f.available ? 'Datos incompletos' : 'Sin pronóstico') : 'en 7 días'} pct={nextRain === null ? null : (nextRain / 30) * 100} color="#5f3900"
          source={f.available ? `Pronóstico ${sourceShort(wx)}` : 'El pronóstico no está disponible ahora'} />
        <Indicator icon="frost" label="Heladas en este mes" value={frostDays === null ? '—' : `${Math.round(frostDays)} días`}
          note="promedio histórico" pct={frostDays === null ? null : (frostDays / 30) * 100} color="var(--color-outline)"
          source={c.available ? 'NASA POWER, climatología 2001–2025' : 'Climatología no disponible'} />
      </div>
    </section>
  )
}

function Tool({ href, icon, title, text, cta, tone = 'primary' }: { href: string; icon: IconName; title: string; text: string; cta: string; tone?: 'primary' | 'secondary' | 'tint' }) {
  const color = tone === 'secondary' ? 'var(--color-secondary)' : tone === 'tint' ? 'var(--color-tint)' : 'var(--color-primary)'
  return (
    <a href={href} className="tool-card group">
      <div>
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface-high)]" style={{ color }}><Icon name={icon} size={22} /></span>
        <h3 className="font-display text-[1.2rem] font-semibold group-hover:underline group-hover:underline-offset-4" style={{ color: '#161d17' }}>{title}</h3>
        <p className="mt-2 text-sm text-[var(--color-on-variant)]">{text}</p>
      </div>
      <span className="inline-flex items-center gap-1 pt-4 text-xs font-semibold" style={{ color }}>{cta} <Icon name="arrowRight" size={14} /></span>
    </a>
  )
}

/** Invitación opcional a configurar la app (cultivos, perfil y ubicación). No interrumpe la portada. */
function SetupInvite() {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  return (
    <section className="mt-6 flex flex-col gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between" data-testid="setup-invite">
      <div className="flex items-start gap-3">
        <span className="icon-square"><Icon name="leaf" size={22} /></span>
        <div>
          <p className="font-semibold">Configure PACHA-AGRO para su campo</p>
          <p className="text-sm text-[var(--color-on-variant)]">Elija sus cultivos y su municipio en 4 pasos para ver primero lo que le sirve.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a href="#/bienvenida" className="btn-primary">Empezar</a>
        <button type="button" className="min-h-11 px-3 text-sm font-semibold text-[var(--color-on-variant)]" onClick={() => { setOnboarded(); setHidden(true) }}>Ahora no</button>
      </div>
    </section>
  )
}
