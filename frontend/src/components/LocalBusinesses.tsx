import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Icon } from './Icon'

interface Biz { id: string; name: string; kind: string; address: string; phone: string; offers: string; service_labels: string[]; url: string; municipality: string; same_municipality: boolean; whatsapp_url: string }
interface BizList { note: string; source: { name: string; url: string; retrieved: string }; items: Biz[] }

/** Negocios agropecuarios de un directorio público, con su fuente y el aviso de que no están verificados. */
export function LocalBusinesses({ municipalityId, service, title = 'Negocios agropecuarios y veterinarios de la zona' }: { municipalityId: string | null; service?: string; title?: string }) {
  const [d, setD] = useState<BizList | null>(null)
  useEffect(() => {
    const q = new URLSearchParams()
    if (municipalityId) q.set('municipality_id', municipalityId)
    if (service) q.set('service', service)
    api<BizList>(`/api/ganado/negocios?${q}`).then(setD).catch(() => setD(null))
  }, [municipalityId, service])
  if (!d || !d.items.length) return null
  const fmtPhone = (p: string) => p.replace(/^\+591/, '').replace(/(\d{4})(\d{4})/, '$1 $2')
  return (
    <section aria-labelledby="biz-title" data-testid="local-businesses">
      <p className="eyebrow">Directorio público</p>
      <h2 id="biz-title" className="section-title">{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {d.items.map(b => (
          <article key={b.id} className="panel flex flex-col !p-5" data-testid="business-card">
            <h3 className="font-display text-[1.2rem] font-semibold text-[#161d17]">{b.name}</h3>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-on-variant)]">{b.kind} · {b.municipality}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {b.service_labels.map(s => <span key={s} className="rounded-sm bg-[var(--color-surface-high)] px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">{s}</span>)}
            </div>
            <p className="mt-2 text-sm">{b.offers}</p>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-[var(--color-on-variant)]"><Icon name="pin" size={15} className="mt-0.5" />{b.address}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <a className="btn-primary !min-h-10 !px-3" href={`tel:${b.phone}`}>Llamar {fmtPhone(b.phone)}</a>
              <a className="btn-soft !w-auto !min-h-10 !px-3" href={`${b.whatsapp_url}?text=${encodeURIComponent('Hola, encontré su contacto en PACHA-AGRO. Quisiera consultar por')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--color-on-variant)]">{d.note} Fuente: <a className="underline" href={d.source.url} target="_blank" rel="noopener noreferrer">{d.source.name}</a> (consultado el {new Date(`${d.source.retrieved}T12:00:00`).toLocaleDateString('es-BO')}). Puede que algún número no use WhatsApp. ¿Su negocio aparece aquí y quiere corregir o quitar sus datos? Escriba al administrador de PACHA-AGRO.</p>
    </section>
  )
}
