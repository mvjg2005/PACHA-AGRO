import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import type { Status } from '../lib/types'

/* Sistema visual sobrio: esquinas suaves (6 px), bordes de 1 px, avisos con filete lateral,
   títulos en serif y etiquetas pequeñas en mayúsculas. Sin emoticones. */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-bosque text-white hover:bg-bosque-800 active:bg-bosque-800',
  secondary: 'bg-white text-bosque border border-bosque hover:bg-brote-50',
  ghost: 'bg-transparent text-bosque underline underline-offset-4 hover:bg-brote-50',
  danger: 'bg-white text-rojo border border-rojo hover:bg-rojo-50',
}

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...p} className={`min-h-12 rounded-md px-5 py-3 text-base font-semibold tracking-[.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-linea bg-white p-4 ${className}`}>{children}</div>
}

/** Título de página. `icon` se conserva por compatibilidad, pero ya no se muestra. */
export function PageTitle({ title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-5 border-b border-linea pb-4">
      <h1 className="font-display text-[1.85rem] font-normal leading-tight tracking-[-.01em] text-[#17301f]">{title}</h1>
      {subtitle && <p className="mt-1.5 text-musgo">{subtitle}</p>}
    </header>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[.78rem] font-semibold uppercase tracking-[.12em] text-musgo">{children}</p>
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-6 text-musgo">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-linea border-t-bosque" aria-hidden="true" />
      {text}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="border-l-[3px] border-rojo bg-rojo-50/60 px-4 py-3">
      <p className="flex items-start gap-2 font-semibold text-rojo"><Icon name="alert" className="mt-0.5" />{message}</p>
      {onRetry && <Button variant="secondary" className="mt-3" onClick={onRetry}>Intentar de nuevo</Button>}
    </div>
  )
}

const TONE: Record<string, { cls: string; icon: IconName }> = {
  info: { cls: 'border-[#9aa79b] bg-[#f6f7f4] text-tinta', icon: 'info' },
  warn: { cls: 'border-ocre bg-[#fbf6e9] text-[#4d3a10]', icon: 'alert' },
  ok: { cls: 'border-bosque-600 bg-brote-50 text-bosque-800', icon: 'check' },
  sim: { cls: 'border-tierra bg-[#f7f1e8] text-[#5b3a21]', icon: 'info' },
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'sim'; children: ReactNode }) {
  const t = TONE[tone]
  return (
    <div role="status" className={`flex items-start gap-2.5 border-l-[3px] px-4 py-3 ${t.cls}`}>
      <Icon name={t.icon} className="mt-[.2em] opacity-80" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export const STATUS_UI: Record<Status, { label: string; color: string; box: string; ink: string }> = {
  verde: { label: 'Condiciones favorables', color: '#2f7a46', box: 'bg-[#f1f6ee] border-[#2f7a46]', ink: 'text-[#1f5531]' },
  amarillo: { label: 'Se recomienda precaución', color: '#b07a12', box: 'bg-[#fbf6e9] border-[#b07a12]', ink: 'text-[#5f4500]' },
  rojo: { label: 'Condiciones desfavorables', color: '#a63a2b', box: 'bg-[#faefec] border-[#a63a2b]', ink: 'text-[#8a2e22]' },
  gris: { label: 'Información insuficiente', color: '#77756d', box: 'bg-[#f4f3f0] border-[#77756d]', ink: 'text-[#3f3e3a]' },
}

/** Marca de estado: círculo de color (contorno si falta información). Va siempre junto a un texto. */
export function StatusMark({ status, size = 12 }: { status: Status; size?: number }) {
  const c = STATUS_UI[status].color
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="inline-block shrink-0">
      <circle cx="6" cy="6" r={status === 'gris' ? 4.75 : 5.5} fill={status === 'gris' ? 'none' : c} stroke={c} strokeWidth={status === 'gris' ? 1.5 : 0} />
    </svg>
  )
}

const KIND: Record<string, { label: string; cls: string }> = {
  pronostico: { label: 'Pronóstico', cls: 'text-bosque-800 border-bosque-600/40' },
  estimacion: { label: 'Estimación satelital', cls: 'text-[#24435f] border-[#24435f]/30' },
  climatologia: { label: 'Promedio histórico', cls: 'text-[#24435f] border-[#24435f]/30' },
  agricultor: { label: 'Dato suyo', cls: 'text-tierra border-tierra/40' },
  comunidad: { label: 'Observación comunitaria', cls: 'text-tierra border-tierra/40' },
  calendario: { label: 'Calendario regional', cls: 'text-bosque border-bosque/30' },
  simulado: { label: 'Simulado', cls: 'text-[#5f4500] border-ocre/60' },
  sin_datos: { label: 'Sin datos', cls: 'text-[#4a4944] border-[#77756d]/40' },
}

export function DataTag({ kind }: { kind: string }) {
  const k = KIND[kind] ?? { label: kind, cls: 'text-bosque border-bosque/30' }
  return <span className={`inline-block rounded-sm border px-2 py-0.5 text-[.72rem] font-semibold uppercase tracking-[.08em] ${k.cls}`}>{k.label}</span>
}

export function SimBanner() {
  return <Notice tone="sim"><strong>Demostración.</strong> Estos datos son simulados. No los use para decidir.</Notice>
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[.95rem] font-semibold">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-sm text-musgo">{hint}</span>}
      {error && <span className="mt-1 block font-semibold text-rojo" role="alert">{error}</span>}
    </label>
  )
}

export const inputCls = 'w-full min-h-12 rounded-md border border-[#bdb6a6] bg-white px-3.5 py-2 text-base focus:border-bosque'
