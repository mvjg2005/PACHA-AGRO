import { useEffect, useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { Listen } from '../components/Listen'
import { ErrorBox, Loading, Notice } from '../components/ui'
import { api } from '../lib/api'
import type { CropSheetT, SheetItem } from '../lib/types'
import { CropMark } from '../components/FieldBits'

const ICONS = new Set<string>(['thermo', 'frost', 'rain', 'drop', 'sun', 'clock', 'leaf', 'calendar', 'mountain', 'signal'])

/** Ficha de cultivo: condiciones de crecimiento, cultivo, suelo y problemas frecuentes, con lectura en voz alta. */
export default function CropSheet({ id }: { id: string }) {
  const [s, setS] = useState<CropSheetT | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setS(null); setErr(null); api<CropSheetT>(`/api/crops/sheets/${encodeURIComponent(id)}`).then(setS).catch(e => setErr(e.message)) }, [id])
  if (err) return <ErrorBox message={err} />
  if (!s) return <Loading />
  const say = (title: string, items: SheetItem[]) => `${title}. ${items.map(i => `${i.label}: ${i.value}.`).join(' ')}`
  return (
    <article className="mx-auto max-w-3xl space-y-6" data-testid="crop-sheet">
      <a href="#/campo" className="link-caps"><Icon name="arrowRight" size={14} className="rotate-180" />Mi campo</a>
      <header className="flex items-center gap-4">
        <CropMark id={s.id} size={72} />
        <div>
          <h1 className="font-display text-[2.2rem] leading-tight text-[var(--color-primary)]">{s.name}</h1>
          <p className="italic text-[var(--color-on-variant)]">{s.scientific}</p>
        </div>
      </header>
      <p className="text-lg">{s.summary}</p>
      <p className="flex items-start gap-2 text-sm"><Icon name="pin" size={16} className="mt-0.5 text-[var(--color-secondary)]" /><span><strong>Dónde se cultiva en Bolivia:</strong> {s.regions}</span></p>
      <Listen text={`${s.name}. ${s.summary} ${say('Condiciones de crecimiento', s.growing)} ${say('Cultivo', s.crop)} ${say('Suelo', s.soil)} Problemas frecuentes: ${s.problems.join('. ')}.`} label="Escuchar toda la ficha" />

      <Block title="Condiciones de crecimiento" items={s.growing} speech={say('Condiciones de crecimiento', s.growing)} />
      <Block title="Cultivo" items={s.crop} speech={say('Cultivo', s.crop)} />
      <Block title="Suelo" items={s.soil} speech={say('Suelo', s.soil)} />

      <section className="panel">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[1.35rem] font-semibold text-[var(--color-primary)]">Problemas frecuentes</h2>
          <Listen text={`Problemas frecuentes: ${s.problems.join('. ')}.`} />
        </div>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">{s.problems.map(p => <li key={p}>{p}</li>)}</ul>
        <a href="#/campo/diagnostico" className="btn-soft mt-4"><Icon name="camera" size={18} />¿Ve algo así? Revise su planta con una foto</a>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        {s.sow_supported && <a href={`#/sembrar/cultivo/${s.id}`} className="btn-primary">¿Cuándo sembrar {s.name.toLowerCase()}? <Icon name="arrowRight" size={16} /></a>}
        <a href={`#/asesoria/${s.id}`} className="btn-soft sm:!w-auto">Hablar con un técnico</a>
      </div>
      <Notice tone="info">{s.note} <a className="font-semibold underline" href={s.source_link.url} target="_blank" rel="noopener noreferrer">{s.source_link.name}</a>.</Notice>
    </article>
  )
}

function Block({ title, items, speech }: { title: string; items: SheetItem[]; speech: string }) {
  return (
    <section className="panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[1.35rem] font-semibold text-[var(--color-primary)]">{title}</h2>
        <Listen text={speech} />
      </div>
      <dl className="mt-3 grid divide-y divide-[var(--color-outline-variant)] sm:grid-cols-2 sm:divide-y-0 sm:gap-x-6">
        {items.map(i => (
          <div key={i.label} className="flex items-start gap-3 py-3 sm:border-b sm:border-[var(--color-outline-variant)]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-mid)] text-[var(--color-primary)]">
              <Icon name={(ICONS.has(i.icon) ? i.icon : 'leaf') as IconName} size={20} />
            </span>
            <div><dt className="text-sm text-[var(--color-on-variant)]">{i.label}</dt><dd className="font-semibold">{i.value}</dd></div>
          </div>
        ))}
      </dl>
    </section>
  )
}
