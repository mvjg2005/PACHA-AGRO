import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import type { RegionalNotice } from '../lib/types'
import { Icon } from './Icon'
import { LogoMark } from './Logo'

/** Selector compacto de municipio agrupado por departamento (datos reales del catálogo). */
export function MunicipalitySelect({ id, className = '', compact = false }: { id?: string; className?: string; compact?: boolean }) {
  const { departments, municipalityId, setMunicipalityId, gps } = useApp()
  if (!departments) return null
  return (
    <select id={id} aria-label="Municipio" value={municipalityId ?? ''} onChange={e => e.target.value && setMunicipalityId(e.target.value)}
      className={`cursor-pointer bg-transparent font-semibold text-[#161d17] focus:outline-none ${compact ? 'text-xs' : 'text-sm'} ${className}`}>
      {!municipalityId && <option value="">Elija su municipio</option>}
      {departments.map(d => (
        <optgroup key={d.id} label={d.name}>
          {d.municipalities.map(m => (
            <option key={m.id} value={m.id}>{m.name} · {d.name}{gps && gps.municipalityId === m.id ? ' (GPS)' : ''}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/** Franja superior: aviso de la plataforma vigente para la zona elegida. Si no hay, no se muestra. */
export function AlertBar() {
  const { municipalityId } = useApp()
  const [n, setN] = useState<RegionalNotice | null>(null)
  useEffect(() => {
    let alive = true
    const q = municipalityId ? `?municipality_id=${encodeURIComponent(municipalityId)}` : ''
    api<RegionalNotice[]>(`/api/notices${q}`).then(list => {
      if (!alive) return
      // Prioriza avisos de clima y los más específicos (municipio/departamento) sobre los nacionales.
      const rank = (x: RegionalNotice) => (x.kind === 'clima' ? 0 : 2) + (x.scope === 'nacional' ? 1 : 0)
      setN([...list].sort((a, b) => rank(a) - rank(b))[0] ?? null)
    }).catch(() => alive && setN(null))
    return () => { alive = false }
  }, [municipalityId])
  if (!n) return null
  return (
    <div className="bg-[var(--color-surface-high)] px-4 py-1.5 text-xs font-medium text-[var(--color-on-variant)]" data-testid="alert-bar">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="megaphone" size={15} className="text-[var(--color-secondary)]" />
          <span className="shrink-0 rounded-sm bg-[var(--color-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{n.kind_label}</span>
          <span className="truncate text-[#161d17]">{n.title}{n.is_demo ? ' (ejemplo)' : ''} · <span className="text-[var(--color-on-variant)]">{n.scope_label}. Aviso de la plataforma, no oficial.</span></span>
        </div>
        <a href="#/avisos" className="hidden shrink-0 font-semibold text-[var(--color-primary)] underline underline-offset-2 sm:inline">Ver avisos</a>
      </div>
    </div>
  )
}

const NAV = [
  { path: '', label: 'Inicio' },
  { path: 'sembrar', label: '¿Cuándo sembrar?' },
  { path: 'campo', label: 'Mi campo' },
  { path: 'ganado', label: 'Ganado' },
  { path: 'senas', label: 'Señas' },
  { path: 'clima', label: 'Clima' },
  { path: 'comunidad', label: 'Comunidad' },
  { path: 'aprender', label: 'Aprender' },
  { path: 'asesoria', label: 'Asesoría' },
]

export function SiteHeader({ current }: { current: string }) {
  const { user } = useApp()
  return (
    <header className="site-header">
      <AlertBar />
      <div className="site-header-inner">
        <div className="flex min-w-0 items-center gap-4">
          <a href="#/" className="flex shrink-0 items-center gap-2.5" aria-label="PACHA-AGRO, inicio">
            <LogoMark size={34} />
            <span className="flex flex-col leading-none">
              <span className="site-brand">PACHA-AGRO</span>
              <span className="mt-0.5 text-[.65rem] font-semibold uppercase tracking-[.18em] text-[var(--color-secondary)]">AgroBolivia</span>
            </span>
          </a>
          <nav aria-label="Navegación principal" className="site-nav-desktop">
            <ul className="flex items-center gap-1 rounded-xl bg-[var(--color-surface-low)] p-1">
              {NAV.map(it => {
                const active = current === it.path
                return (
                  <li key={it.label}>
                    <a href={`#/${it.path}`} aria-current={active ? 'page' : undefined}
                      className={`block whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors ${active ? 'bg-[var(--color-primary)] font-semibold text-white' : 'text-[var(--color-on-variant)] hover:bg-[var(--color-surface-high)] hover:text-[#161d17]'}`}>
                      {it.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <label className="hidden items-center gap-1.5 rounded-lg bg-[var(--color-surface-mid)] px-3 py-2 text-[var(--color-on-variant)] min-[92rem]:flex">
            <Icon name="pin" size={16} />
            <MunicipalitySelect compact className="max-w-[11rem]" />
          </label>
          <a href={user ? '#/perfil' : '#/ingresar'}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[var(--color-primary)] px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[var(--color-primary-container)]">
            {user ? <><Icon name="user" size={16} />{user.full_name.split(' ')[0]}</> : <>Ingresar<span className="hidden sm:inline min-[72rem]:hidden min-[92rem]:inline">&nbsp;/ Registrarse</span></>}
          </a>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-[var(--color-surface-low)] py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 pb-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-3 lg:col-span-2">
            <div className="flex items-center gap-2">
              <span className="font-display text-[1.35rem] font-semibold text-[var(--color-primary)]">PACHA-AGRO</span>
              <span className="rounded bg-[var(--color-secondary-fixed)] px-2 py-0.5 text-[.7rem] font-bold uppercase tracking-widest text-[var(--color-secondary)]">Bolivia</span>
            </div>
            <p className="max-w-sm text-sm text-[var(--color-on-variant)]">Plataforma abierta de orientación agroclimática, calendarios de siembra y organización comunitaria para productoras y productores de Bolivia.</p>
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-on-variant)]"><Icon name="info" size={15} className="text-[var(--color-tint)]" />Datos del clima: Open-Meteo y NASA POWER. Avisos oficiales: SENAMHI.</p>
          </div>
          <FooterCol title="Zonas agrícolas" links={[['Altiplano', '#/cobertura'], ['Valles interandinos', '#/cobertura'], ['Llanos y Amazonía', '#/cobertura'], ['Cobertura nacional', '#/cobertura']]} />
          <FooterCol title="Módulos" links={[['¿Cuándo sembrar?', '#/sembrar'], ['Revisar una planta con foto', '#/campo/diagnostico'], ['Calculadoras y parcelas', '#/campo'], ['Pronóstico y heladas', '#/clima'], ['Biblioteca y guías', '#/aprender/biblioteca'], ['Avisos para el campo', '#/avisos']]} />
          <FooterCol title="Comunidad" links={[['Ganado en riesgo (Uywa)', '#/ganado'], ['Sin internet: guardar y SMS', '#/sin-internet'], ['Señas andinas y Pachagrama', '#/senas'], ['Asesoría y técnicos', '#/asesoria'], ['Mi comunidad', '#/comunidad'], ['Asistente de WhatsApp (simulador)', '#/whatsapp'], ['Lecciones (quechua y aimara en preparación)', '#/aprender'], ['Comparar condiciones', '#/sembrar/comparar']]} />
        </div>
        <div className="flex flex-col items-center justify-between gap-4 rounded-xl bg-[var(--color-surface-mid)] px-6 py-4 text-xs text-[var(--color-on-variant)] md:flex-row">
          <p className="text-center md:text-left">© 2026 PACHA-AGRO (AgroBolivia). Orientación agroclimática referencial. Avisos oficiales de clima: SENAMHI.</p>
          <div className="flex shrink-0 items-center gap-4">
            <a className="hover:text-[#161d17] hover:underline" href="#/terminos">Términos de uso</a>
            <a className="hover:text-[#161d17] hover:underline" href="#/privacidad">Privacidad</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">{title}</h2>
      <ul className="flex flex-col gap-2 text-sm text-[var(--color-on-variant)]">
        {links.map(([l, h]) => <li key={l}><a className="hover:text-[var(--color-primary)] hover:underline" href={h}>{l}</a></li>)}
      </ul>
    </div>
  )
}
