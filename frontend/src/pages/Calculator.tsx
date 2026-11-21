import { useState, type FormEvent, type ReactNode } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { Listen } from '../components/Listen'
import { Button, Notice, inputCls } from '../components/ui'
import {
  AREA_UNITS, WEIGHT_UNITS, breakEvenPrice, bs, fromKg, labelMix, maxInputBudget, num, pricePerKg, profit, requiredYield, toKg,
  type AreaUnit, type WeightUnit,
} from '../lib/calc'

export const CALCS: { id: string; icon: IconName; title: string; text: string }[] = [
  { id: 'ganancia', icon: 'coins', title: 'Ganancia estimada', text: 'Cuánto le queda después de vender y pagar sus gastos.' },
  { id: 'rendimiento', icon: 'scale', title: 'Rendimiento requerido', text: 'Cuánto tiene que cosechar para no perder.' },
  { id: 'precio', icon: 'calculator', title: 'Precio sin pérdida', text: 'El precio más bajo al que puede vender sin perder.' },
  { id: 'presupuesto', icon: 'notebook', title: 'Presupuesto de insumos', text: 'Cuánto puede gastar en semilla, abono y otros insumos.' },
  { id: 'mezcla', icon: 'spray', title: 'Mezcla según la etiqueta', text: 'Cuánto producto poner en cada mochila, según lo que dice la etiqueta.' },
]

type Vals = Record<string, string>
interface Recent { calc: string; at: string; summary: string; result: string }
const RECENT_KEY = 'agb_calcs'
const readRecent = (): Recent[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
const saveRecent = (r: Recent) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...readRecent()].slice(0, 30))) } catch { /* sin almacenamiento */ } }

const n = (v: string | undefined) => (v === undefined || v.trim() === '' ? NaN : Number(v.replace(',', '.')))

/** Lee valores iniciales del enlace, por ejemplo desde una parcela: c=gastos, y=cosecha en kg. */
function initial(params?: string): Vals {
  const out: Vals = {}
  if (!params) return out
  const q = new URLSearchParams(params)
  if (q.get('c')) out.costs = q.get('c')!
  if (q.get('y')) { out.yield = q.get('y')!; out.yieldUnit = 'kg' }
  return out
}

export default function Calculator({ calc, params }: { calc?: string; params?: string }) {
  const meta = CALCS.find(c => c.id === calc) ?? CALCS[0]
  const [vals, setVals] = useState<Vals>(() => ({ yieldUnit: 'qq', priceUnit: 'qq', areaUnit: 'ha', tank: '20', ...initial(params) }))
  const [result, setResult] = useState<{ big: string; lines: string[]; tone: 'ok' | 'warn' | 'info'; speech: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [recent, setRecent] = useState(() => readRecent().filter(r => r.calc === meta.id))
  const set = (k: string) => (v: string) => { setVals(s => ({ ...s, [k]: v })); setResult(null) }

  const yu = vals.yieldUnit as WeightUnit, pu = vals.priceUnit as WeightUnit
  const yKg = toKg(n(vals.yield), yu), pKg = pricePerKg(n(vals.price), pu), costs = n(vals.costs)

  const compute = (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    let out: typeof result = null, summary = ''
    if (meta.id === 'ganancia') {
      const r = profit(yKg, pKg, costs)
      if (r) {
        out = { big: bs(r.profit), tone: r.profit >= 0 ? 'ok' : 'warn',
          lines: [`Ingreso por la venta: ${bs(r.income)}`, `Gastos: ${bs(r.costs)}`, r.profit >= 0 ? 'Le queda ganancia.' : 'Con estos datos tendría pérdida.'],
          speech: `${r.profit >= 0 ? 'Ganancia estimada' : 'Pérdida estimada'}: ${Math.abs(Math.round(r.profit))} bolivianos.` }
        summary = `${vals.yield} ${WEIGHT_UNITS[yu].label} a Bs ${vals.price} por ${WEIGHT_UNITS[pu].one}, gastos Bs ${vals.costs}`
      }
    } else if (meta.id === 'rendimiento') {
      const kg = requiredYield(costs, pKg)
      if (kg !== null) {
        out = { big: `${num(fromKg(kg, 'qq'))} quintales`, tone: 'info',
          lines: [`Equivale a ${num(kg, 0)} kg o ${num(fromKg(kg, 'arroba'))} arrobas.`, 'Si cosecha más que esto, tiene ganancia.'],
          speech: `Necesita cosechar al menos ${Math.ceil(fromKg(kg, 'qq'))} quintales para no perder.` }
        summary = `Gastos Bs ${vals.costs}, precio Bs ${vals.price} por ${WEIGHT_UNITS[pu].one}`
      }
    } else if (meta.id === 'precio') {
      const p = breakEvenPrice(costs, yKg)
      if (p !== null) {
        out = { big: `${bs(p * 46)} por quintal`, tone: 'info',
          lines: [`Por kilo: ${bs(p)}. Por arroba: ${bs(p * 11.5)}.`, 'Si vende más caro que esto, tiene ganancia.'],
          speech: `Para no perder, venda a más de ${Math.ceil(p * 46)} bolivianos el quintal.` }
        summary = `Gastos Bs ${vals.costs}, cosecha ${vals.yield} ${WEIGHT_UNITS[yu].label}`
      }
    } else if (meta.id === 'presupuesto') {
      const b = maxInputBudget(yKg, pKg, n(vals.other || '0'), n(vals.desired || '0'))
      if (b !== null) {
        out = { big: b > 0 ? bs(b) : 'Sin margen', tone: b > 0 ? 'ok' : 'warn',
          lines: b > 0 ? ['Es lo máximo que puede gastar en insumos para lograr la ganancia que busca.'] : ['Con esta cosecha y precio, los otros gastos y la ganancia deseada ya superan el ingreso.'],
          speech: b > 0 ? `Puede gastar hasta ${Math.floor(b)} bolivianos en insumos.` : 'No queda margen para insumos con estos datos.' }
        summary = `${vals.yield} ${WEIGHT_UNITS[yu].label} a Bs ${vals.price}, otros gastos Bs ${vals.other || 0}, ganancia deseada Bs ${vals.desired || 0}`
      }
    } else {
      const ha = n(vals.area) * AREA_UNITS[vals.areaUnit as AreaUnit].ha
      const m = labelMix(n(vals.dose), ha, n(vals.water), n(vals.tank))
      if (m) {
        const u = vals.doseUnit === 'kg' ? 'kg' : 'L'
        const perTank = u === 'L' ? `${num(m.perTank * 1000, 0)} ml` : `${num(m.perTank * 1000, 0)} g`
        out = { big: `${perTank} por mochila`, tone: 'info',
          lines: [`Mochila de ${vals.tank} L de agua. Necesita unas ${m.tanks} mochilas.`, `Producto total: ${num(m.product, 2)} ${u}. Agua total: ${num(m.water, 0)} L.`],
          speech: `Ponga ${perTank} de producto en cada mochila de ${vals.tank} litros. Necesita unas ${m.tanks} mochilas.` }
        summary = `Etiqueta: ${vals.dose} ${u}/ha en ${vals.water} L/ha; ${vals.area} ${AREA_UNITS[vals.areaUnit as AreaUnit].label}`
      }
    }
    if (!out) { setErr('Complete todos los datos con números mayores a cero.'); setResult(null); return }
    setResult(out)
    const rec = { calc: meta.id, at: new Date().toISOString(), summary, result: out.big }
    saveRecent(rec); setRecent(r => [rec, ...r].slice(0, 5))
  }

  const yieldField = <Num label="Cosecha esperada" hint="Lo que espera cosechar" v={vals.yield} on={set('yield')} unit={<UnitSel v={vals.yieldUnit} on={set('yieldUnit')} />} />
  const priceField = <Num label="Precio de venta" hint="Bs por unidad" v={vals.price} on={set('price')} unit={<UnitSel v={vals.priceUnit} on={set('priceUnit')} prefix="Bs por " />} />
  const costsField = <Num label="Gastos totales" hint="Semilla, abono, jornales, transporte…" v={vals.costs} on={set('costs')} unit={<Fixed>Bs</Fixed>} />

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <a href="#/campo" className="link-caps"><Icon name="arrowRight" size={14} className="rotate-180" />Mi campo</a>
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Calculadoras">
        {CALCS.map(c => (
          <a key={c.id} href={`#/campo/calculadora/${c.id}`} aria-current={c.id === meta.id ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${c.id === meta.id ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface-low)] text-[var(--color-primary)]'}`}>{c.title}</a>
        ))}
      </nav>
      <header>
        <h1 className="font-display text-[2rem] leading-tight text-[var(--color-primary)]">{meta.title}</h1>
        <p className="mt-1 text-[var(--color-on-variant)]">{meta.text}</p>
      </header>

      <div className={`rounded-2xl p-6 text-center ${result?.tone === 'warn' ? 'bg-[#faefec]' : 'bg-[var(--color-surface-mid)]'}`} data-testid="calc-result" aria-live="polite">
        <p className="text-sm font-semibold text-[var(--color-on-variant)]">{meta.title}</p>
        <p className={`mt-1 font-display text-[2.2rem] font-semibold leading-tight ${result?.tone === 'warn' ? 'text-[#8a2e22]' : 'text-[var(--color-primary)]'}`}>{result ? result.big : '—'}</p>
        {result && <ul className="mt-2 space-y-0.5 text-sm">{result.lines.map(l => <li key={l}>{l}</li>)}</ul>}
        {result && <Listen text={result.speech} className="mt-2" />}
      </div>

      <form onSubmit={compute} className="panel space-y-4">
        {meta.id === 'ganancia' && <>{yieldField}{priceField}{costsField}</>}
        {meta.id === 'rendimiento' && <>{costsField}{priceField}</>}
        {meta.id === 'precio' && <>{costsField}{yieldField}</>}
        {meta.id === 'presupuesto' && <>{yieldField}{priceField}
          <Num label="Otros gastos (sin insumos)" hint="Jornales, alquiler, transporte" v={vals.other} on={set('other')} unit={<Fixed>Bs</Fixed>} />
          <Num label="Ganancia que quiere obtener" v={vals.desired} on={set('desired')} unit={<Fixed>Bs</Fixed>} /></>}
        {meta.id === 'mezcla' && <>
          <Notice tone="warn">Use solo la dosis que dice la etiqueta del producto para su cultivo. Esta calculadora no recomienda productos ni dosis.</Notice>
          <Num label="Dosis de la etiqueta por hectárea" v={vals.dose} on={set('dose')}
            unit={<select aria-label="Unidad de dosis" className={`${inputCls} !w-auto`} value={vals.doseUnit ?? 'L'} onChange={e => set('doseUnit')(e.target.value)}><option value="L">L/ha</option><option value="kg">kg/ha</option></select>} />
          <Num label="Agua por hectárea (de la etiqueta)" hint="Ejemplo: 200 L/ha" v={vals.water} on={set('water')} unit={<Fixed>L/ha</Fixed>} />
          <Num label="Superficie a aplicar" v={vals.area} on={set('area')}
            unit={<select aria-label="Unidad de superficie" className={`${inputCls} !w-auto`} value={vals.areaUnit} onChange={e => set('areaUnit')(e.target.value)}>{Object.entries(AREA_UNITS).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}</select>} />
          <Num label="Capacidad de su mochila" v={vals.tank} on={set('tank')} unit={<Fixed>L</Fixed>} /></>}
        {err && <p className="font-semibold text-rojo" role="alert">{err}</p>}
        <Button className="w-full">Calcular</Button>
      </form>

      <section className="rounded-2xl bg-[var(--color-surface-low)] p-5" aria-labelledby="recent-title">
        <h2 id="recent-title" className="font-display text-[1.2rem] font-semibold text-[var(--color-primary)]">Cálculos recientes</h2>
        {recent.length === 0
          ? <p className="mt-1 text-sm text-[var(--color-on-variant)]">Sus cálculos aparecerán aquí, guardados solo en este celular. Compare cómo cambian la cosecha, el precio o los gastos.</p>
          : <ul className="mt-3 divide-y divide-[var(--color-outline-variant)]" data-testid="calc-recent">
            {recent.map(r => <li key={r.at} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-sm"><span className="text-[var(--color-on-variant)]">{r.summary}</span><strong>{r.result}</strong></li>)}
          </ul>}
      </section>
    </div>
  )
}

function Num({ label, hint, v, on, unit }: { label: string; hint?: string; v?: string; on: (v: string) => void; unit: ReactNode }) {
  return (
    <label className="grid items-center gap-2 sm:grid-cols-[1fr_auto]">
      <span><span className="block font-semibold">{label}</span>{hint && <span className="block text-sm text-[var(--color-on-variant)]">{hint}</span>}</span>
      <span className="flex gap-2">
        <input className={`${inputCls} sm:!w-36`} inputMode="decimal" value={v ?? ''} onChange={e => on(e.target.value)} placeholder="0" aria-label={label} />
        {unit}
      </span>
    </label>
  )
}

function UnitSel({ v, on, prefix = '' }: { v: string; on: (v: string) => void; prefix?: string }) {
  return (
    <select aria-label={`${prefix}unidad`} className={`${inputCls} !w-auto`} value={v} onChange={e => on(e.target.value)}>
      {Object.entries(WEIGHT_UNITS).map(([k, u]) => <option key={k} value={k}>{prefix}{prefix ? u.one : u.label}</option>)}
    </select>
  )
}

const Fixed = ({ children }: { children: ReactNode }) => <span className="flex min-h-12 min-w-14 items-center justify-center rounded-md bg-[var(--color-surface-low)] px-3 font-semibold">{children}</span>
