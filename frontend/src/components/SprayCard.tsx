import type { SprayT, Status } from '../lib/types'
import { Icon } from './Icon'
import { StatusMark } from './ui'

const MAP: Record<SprayT['status'], { s: Status; box: string; ink: string }> = {
  bueno: { s: 'verde', box: 'bg-[#f1f6ee]', ink: 'text-[#1f5531]' },
  moderado: { s: 'amarillo', box: 'bg-[#fbf6e9]', ink: 'text-[#5f4500]' },
  no: { s: 'rojo', box: 'bg-[#faefec]', ink: 'text-[#8a2e22]' },
}
const hour = (t: string) => `${Number(t.slice(11, 13))}:00`
const r = (v: number | null, u: string) => (v == null ? '—' : `${Math.round(v)}${u}`)

/** Condiciones para fumigar ahora y en las próximas 24 horas (pronóstico por hora). */
export function SprayCard({ spray }: { spray: SprayT }) {
  const m = MAP[spray.status]
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm" aria-labelledby="spray-title" data-testid="spray-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="spray-title" className="flex items-center gap-2 text-lg font-bold"><Icon name="spray" size={22} className="text-[var(--color-secondary)]" />Condiciones para fumigar</h2>
        <span className={`flex items-center gap-2 rounded px-2.5 py-1 font-bold ${m.box} ${m.ink}`}><StatusMark status={m.s} size={10} />{spray.label} ahora</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg bg-[var(--color-surface-low)] p-2"><Icon name="wind" size={18} /><div className="font-bold">{r(spray.wind_kmh, ' km/h')}</div><div className="text-xs text-musgo">Viento</div></div>
        <div className="rounded-lg bg-[var(--color-surface-low)] p-2"><Icon name="thermo" size={18} /><div className="font-bold">{r(spray.temp_c, ' °C')}</div><div className="text-xs text-musgo">Temperatura</div></div>
        <div className="rounded-lg bg-[var(--color-surface-low)] p-2"><Icon name="drop" size={18} /><div className="font-bold">{r(spray.rh, ' %')}</div><div className="text-xs text-musgo">Humedad</div></div>
      </div>
      {spray.reasons.length > 0 && <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm">{spray.reasons.map(x => <li key={x}>{x[0].toUpperCase() + x.slice(1)}</li>)}</ul>}
      <p className="mt-3 font-semibold">
        {spray.best_window ? <>Mejor momento: de {hour(spray.best_window.start)} a {Number(spray.best_window.end.slice(11, 13)) + 1}:00{spray.best_window.start.slice(0, 10) !== spray.hours[0].time.slice(0, 10) ? ' de mañana' : ''}.</>
          : 'No hay un buen momento de día en las próximas 24 horas.'}
      </p>
      <div className="mt-3" aria-label="Próximas 24 horas">
        <div className="flex gap-[2px]">
          {spray.hours.map(h => <span key={h.time} title={`${hour(h.time)}: ${h.status}`} className="h-5 flex-1 rounded-[2px]"
            style={{ background: h.status === 'bueno' ? '#2f7a46' : h.status === 'moderado' ? '#d9a63a' : '#c0604f' }} />)}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-musgo">
          {spray.hours.filter((_, k) => k % 6 === 0).map(h => <span key={h.time}>{hour(h.time)}</span>)}
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-musgo">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#2f7a46]" />Buenas</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#d9a63a]" />Moderadas</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#c0604f]" />No recomendado</span>
        </p>
      </div>
      <p className="mt-3 text-xs text-musgo">{spray.note}</p>
    </section>
  )
}

export function SprayLine({ spray }: { spray: SprayT }) {
  const m = MAP[spray.status]
  return (
    <a href="#/clima" className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-mid)] p-3 text-xs" data-testid="spray-line">
      <span className="flex items-center gap-2 whitespace-nowrap"><Icon name="spray" size={16} className="text-[var(--color-secondary)]" /><span className="font-bold">Fumigar:</span>
        <StatusMark status={m.s} size={10} /><span className={`font-bold ${m.ink}`}>{spray.label}</span></span>
      <span className="text-[var(--color-on-variant)]">{spray.best_window ? `Mejor: ${hour(spray.best_window.start)}` : 'Ver horas'}</span>
    </a>
  )
}
