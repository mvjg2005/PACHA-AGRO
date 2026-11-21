import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Status } from '../lib/types'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-bosque text-white hover:bg-bosque-800 active:bg-bosque-800',
  secondary: 'bg-papel text-bosque border-2 border-bosque hover:bg-brote-50',
  ghost: 'bg-transparent text-bosque underline underline-offset-4 hover:bg-brote-50',
  danger: 'bg-papel text-rojo border-2 border-rojo hover:bg-rojo-50',
}

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...p} className={`min-h-12 rounded-xl px-5 py-3 text-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-linea bg-papel p-4 ${className}`}>{children}</div>
}

export function PageTitle({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="flex min-w-0 items-start gap-2 font-display text-[1.7rem] font-bold leading-tight text-bosque">
        <span className="shrink-0" aria-hidden="true">{icon}</span>
        <span className="min-w-0 break-words">{title}</span>
      </h1>
      {subtitle && <p className="mt-1 text-musgo">{subtitle}</p>}
    </div>
  )
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-6 text-musgo">
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-brote border-t-bosque" aria-hidden="true" />
      {text}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border-2 border-rojo bg-rojo-50 p-4">
      <p className="font-semibold text-rojo">⚠️ {message}</p>
      {onRetry && <Button variant="secondary" className="mt-3" onClick={onRetry}>Intentar de nuevo</Button>}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'sim'; children: ReactNode }) {
  const cls = {
    info: 'border-linea bg-brote-50 text-tinta',
    warn: 'border-ocre bg-sol-50 text-sol-ink',
    ok: 'border-bosque-600 bg-brote text-bosque-800',
    sim: 'border-dashed border-tierra bg-tierra-100 text-tierra',
  }[tone]
  return <div className={`rounded-xl border-2 px-4 py-3 ${cls}`}>{children}</div>
}

export const STATUS_UI: Record<Status, { emoji: string; label: string; box: string; ink: string }> = {
  verde: { emoji: '🟢', label: 'Condiciones favorables', box: 'bg-brote border-bosque-600', ink: 'text-bosque-800' },
  amarillo: { emoji: '🟡', label: 'Se recomienda precaución', box: 'bg-sol-50 border-ocre', ink: 'text-sol-ink' },
  rojo: { emoji: '🔴', label: 'Condiciones desfavorables', box: 'bg-rojo-50 border-rojo', ink: 'text-rojo' },
  gris: { emoji: '⚪', label: 'Información insuficiente', box: 'bg-[#ecebe5] border-[#77756d]', ink: 'text-[#3f3e3a]' },
}

const KIND: Record<string, { label: string; cls: string }> = {
  pronostico: { label: 'Pronóstico', cls: 'bg-brote text-bosque-800' },
  estimacion: { label: 'Estimación satelital', cls: 'bg-[#e1e8ef] text-[#24435f]' },
  climatologia: { label: 'Promedio histórico', cls: 'bg-[#e1e8ef] text-[#24435f]' },
  agricultor: { label: 'Dato suyo', cls: 'bg-tierra-100 text-tierra' },
  comunidad: { label: 'Observación comunitaria', cls: 'bg-tierra-100 text-tierra' },
  calendario: { label: 'Calendario regional', cls: 'bg-brote-50 text-bosque' },
  simulado: { label: 'SIMULADO', cls: 'bg-sol text-sol-ink' },
  sin_datos: { label: 'Sin datos', cls: 'bg-[#ecebe5] text-[#3f3e3a]' },
}

export function DataTag({ kind }: { kind: string }) {
  const k = KIND[kind] ?? { label: kind, cls: 'bg-brote-50 text-bosque' }
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${k.cls}`}>{k.label}</span>
}

export function SimBanner() {
  return <Notice tone="sim"><strong>🧪 DEMOSTRACIÓN:</strong> estos datos son SIMULADOS. No los use para decidir.</Notice>
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-lg font-semibold">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-musgo">{hint}</span>}
      {error && <span className="mt-1 block font-semibold text-rojo" role="alert">{error}</span>}
    </label>
  )
}

export const inputCls = 'w-full min-h-12 rounded-xl border-2 border-linea bg-white px-4 py-2 text-lg focus:border-bosque'
