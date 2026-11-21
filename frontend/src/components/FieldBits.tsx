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

