import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Icon } from './Icon'
import { Listen } from './Listen'

interface BulletinT { available: boolean; error?: string; municipality?: string; sms: string; sms_parts: number; radio: string; from?: string; to?: string; fetched_at?: string }

/** Boletín de la semana: SMS corto (sin tildes, para que salga más barato) y texto para leer por radio. */
export function Bulletin({ municipalityId, compact = false }: { municipalityId: string; compact?: boolean }) {
  const [b, setB] = useState<BulletinT | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setB(null); api<BulletinT>(`/api/ganado/boletin?municipality_id=${municipalityId}`, { timeoutMs: 60000 }).then(setB).catch(e => setB({ available: false, error: e.message, sms: '', sms_parts: 0, radio: '' })) }, [municipalityId])
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* sin portapapeles */ } }
  return (
    <section className="panel space-y-3" aria-labelledby="bulletin-title" data-testid="bulletin">
      <p className="eyebrow">Para quien no tiene internet</p>
      <h2 id="bulletin-title" className={compact ? 'font-display text-[1.35rem] font-semibold text-[var(--color-primary)]' : 'section-title'}>Boletín de la semana por SMS o radio</h2>
      <p className="text-sm text-[var(--color-on-variant)]">En el campo muchas veces no hay datos, pero sí llegan mensajes de texto. Envíe este resumen a su familia desde su celular, o léalo en la radio comunitaria o el altavoz.</p>
      {!b ? <p role="status" className="text-sm">Preparando el boletín…</p> : !b.available ? <p className="font-semibold text-rojo">{b.error}</p> : <>
        <div className="rounded-xl bg-[var(--color-surface-low)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-on-variant)]">Mensaje de texto · {b.sms.length} caracteres · {b.sms_parts} SMS</p>
          <p className="mt-1 font-mono text-[0.95rem]" data-testid="bulletin-sms">{b.sms}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn-primary !min-h-11" href={`sms:?&body=${encodeURIComponent(b.sms)}`}><Icon name="chat" size={16} />Enviar por SMS</a>
            <a className="btn-soft !w-auto !min-h-11" href={`https://wa.me/?text=${encodeURIComponent(b.sms)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <button type="button" className="btn-soft !w-auto !min-h-11" onClick={() => copy(b.sms)}>{copied ? 'Copiado' : 'Copiar'}</button>
          </div>
          <p className="mt-2 text-xs text-[var(--color-on-variant)]">Va sin tildes a propósito: así cada SMS lleva 160 letras en vez de 70 y cuesta menos.</p>
        </div>
        {!compact && <div className="rounded-xl bg-[var(--color-surface-low)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-on-variant)]">Para leer en la radio o el altavoz</p>
          <p className="mt-1">{b.radio}</p>
          <div className="mt-2 flex flex-wrap gap-2"><Listen text={b.radio} label="Escuchar" /><button type="button" className="btn-soft !w-auto !min-h-10" onClick={() => copy(b.radio)}>Copiar texto</button></div>
        </div>}
      </>}
    </section>
  )
}
