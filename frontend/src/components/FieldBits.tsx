import { Icon, type IconName } from './Icon'
import { cropName } from '../lib/prefs'

/** Monograma sobrio para cada cultivo (en lugar de dibujos o emoticones). */
export function CropMark({ id, size = 56 }: { id: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.42 }}
      className="flex shrink-0 items-center justify-center rounded-full border border-[var(--color-outline-variant)] bg-white font-display font-semibold text-[var(--color-primary)]">
      {cropName(id).slice(0, 1)}
    </span>
  )
}

export function MyCrops({ crops, compact = false }: { crops: string[]; compact?: boolean }) {
  return (
    <section aria-label="Mis cultivos" data-testid="my-crops" className={compact ? '' : 'panel'}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={compact ? 'eyebrow !mb-0' : 'font-display text-[1.3rem] font-semibold text-[var(--color-primary)]'}>Mis cultivos</h2>
        <a href="#/bienvenida/cultivos" className="link-caps"><Icon name="plus" size={14} />{crops.length ? 'Cambiar' : 'Elegir'}</a>
      </div>
      {crops.length === 0
        ? <p className="mt-2 text-sm text-[var(--color-on-variant)]">Elija sus cultivos para ver primero lo que le sirve.</p>
        : <ul className="mt-3 flex gap-4 overflow-x-auto pb-1">
          {crops.map(c => (
            <li key={c}><a href={`#/cultivos/${c}`} className="flex w-16 flex-col items-center gap-1.5 text-sm font-semibold">
              <CropMark id={c} />{cropName(c)}</a></li>
          ))}
        </ul>}
    </section>
  )
}

export function DiagnoseCta() {
  const steps: [IconName, string][] = [['camera', 'Tome una foto'], ['scan', 'Vea las posibles causas'], ['chat', 'Hable con un técnico']]
  return (
    <section className="sow-card" aria-labelledby="diag-title" data-testid="diagnose-cta">
      <div className="sow-glow" aria-hidden="true" />
      <div className="relative">
        <span className="chip-light"><Icon name="leaf" size={14} />Sanidad vegetal</span>
        <h2 id="diag-title" className="mt-4 font-display text-[1.9rem] leading-tight text-white">¿Su planta está enferma?</h2>
        <p className="mt-2 max-w-xl text-[#d5dcd3]">Tome una foto de la hoja o el tallo afectado. Le mostramos las posibles causas, qué revisar en su parcela y a qué técnico consultar.</p>
        <ol className="mt-6 grid grid-cols-3 gap-2 text-center text-[.8rem] font-semibold text-white sm:max-w-lg">
          {steps.map(([icon, text], i) => (
            <li key={text} className="flex flex-col items-center gap-2">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10"><Icon name={icon} size={24} /></span>
              <span><span className="text-[var(--color-primary-dim)]">{i + 1}.</span> {text}</span>
            </li>
          ))}
        </ol>
        <a href="#/campo/diagnostico" className="btn-light mt-6 w-full sm:w-auto"><Icon name="camera" size={18} />Revisar una planta</a>
      </div>
    </section>
  )
}


/** Señas andinas medidas con datos: la innovación central, visible en la portada y en Mi campo. */
export function SenasCta() {
  return (
    <section className="grid items-center gap-6 rounded-2xl bg-[var(--color-surface-mid)] p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr]" data-testid="senas-cta">
      <div>
        <p className="eyebrow">Saber andino + satélite</p>
        <h2 className="section-title">Señas que se miden</h2>
        <p className="mt-2 max-w-2xl text-[var(--color-on-variant)]">Las Pléyades en San Juan, el nido del leque leque, el aullido del zorro: registre las señas de su comunidad. Al terminar la temporada, PACHA-AGRO las compara con la lluvia y las heladas medidas por satélite y muestra cuántas veces acertó cada una. Evidencia propia, construida por la comunidad.</p>
        <a href="#/senas" className="btn-primary mt-5"><Icon name="sun" size={18} />Ver señas y Pachagrama</a>
      </div>
      <svg viewBox="0 0 240 120" className="w-full" role="img" aria-label="Ejemplo de comparación entre señas y datos satelitales">
        {[22, 30, 18, 44, 60, 72, 58, 40, 20, 12, 8, 6].map((v, i) => <rect key={i} x={10 + i * 19} y={95 - v} width={13} height={v} rx={2} fill="#6f93b8" />)}
        <polyline points="16,80 35,70 54,76 73,58 92,45 111,36 130,48 149,60 168,78 187,84 206,88 225,90" fill="none" stroke="#8a5a2b" strokeWidth={2} strokeDasharray="4 3" />
        {[1, 4, 7].map(i => <path key={i} d={`M${16 + i * 19} 102 l5 9 h-10 z`} fill="#b07a12" />)}
      </svg>
    </section>
  )
}
