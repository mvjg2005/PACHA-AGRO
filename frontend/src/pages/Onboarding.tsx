import { useState } from 'react'
import { GpsButton } from '../components/GpsButton'
import { Icon, type IconName } from '../components/Icon'
import { MunicipalitySelect } from '../components/SiteChrome'
import { api } from '../lib/api'
import { CROP_LIST, getProfile, localCrops, setLocalCrops, setOnboarded, setProfile } from '../lib/prefs'
import { go } from '../lib/router'
import { useApp } from '../lib/store'
import { CropMark } from '../components/FieldBits'

const POINTS: [IconName, string, string][] = [
  ['calendar', '¿Cuándo sembrar?', 'Heladas, lluvia, humedad y la época de siembra de su zona, explicadas.'],
  ['camera', 'Revise una planta enferma', 'Con una foto: posibles causas, qué revisar y a qué técnico llamar.'],
  ['notebook', 'Haga sus cuentas', 'Calculadoras y un cuaderno de campo para saber cuánto gasta y cuánto gana.'],
  ['users', 'Su comunidad conectada', 'Reuniones, avisos y reportes de helada o granizo.'],
]
const PROFILES = [['parcelas', 'Tengo parcelas de cultivo'], ['huerto', 'Cultivo en un huerto familiar'], ['tecnico', 'Soy técnico, promotor o estudiante']]
const STEPS = ['inicio', 'cultivos', 'perfil', 'ubicacion'] as const

/** Bienvenida en 4 pasos. Todo se puede saltar; las elecciones quedan en este celular (y en la cuenta, si hay). */
export default function Onboarding({ step }: { step?: string }) {
  const { user, refreshUser, municipalityId, findMunicipality } = useApp()
  const [i, setI] = useState(Math.max(0, STEPS.indexOf((step ?? 'inicio') as typeof STEPS[number])))
  const [crops, setCrops] = useState<string[]>(() => (user?.crops.length ? user.crops : localCrops()))
  const [profile, setProf] = useState(getProfile() ?? '')
  const only = step === 'cultivos' // se abrió solo para cambiar cultivos
  const m = findMunicipality(municipalityId)

  const saveCrops = async () => {
    setLocalCrops(crops)
    if (user) { try { await api('/api/auth/me', { method: 'PATCH', body: { crops } }); await refreshUser() } catch { /* quedan en el celular */ } }
  }
  const finish = () => { setOnboarded(); go('/') }
  const next = async () => {
    if (STEPS[i] === 'cultivos') { await saveCrops(); if (only) { setOnboarded(); if (window.history.length > 1) window.history.back(); else go('/campo'); return } }
    if (STEPS[i] === 'perfil' && profile) setProfile(profile)
    if (i === STEPS.length - 1) finish(); else setI(i + 1)
  }
  const toggle = (id: string) => setCrops(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col" data-testid="onboarding">
      <div className="flex-1">
        {STEPS[i] === 'inicio' && <>
          <p className="eyebrow">Bienvenida</p>
          <h1 className="font-display text-[2.1rem] leading-tight text-[var(--color-primary)]">PACHA-AGRO le acompaña en su campo</h1>
          <ul className="mt-6 space-y-4">
            {POINTS.map(([icon, t, d]) => (
              <li key={t} className="flex items-start gap-4"><span className="icon-square"><Icon name={icon} size={24} /></span>
                <div><p className="font-semibold">{t}</p><p className="text-sm text-[var(--color-on-variant)]">{d}</p></div></li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-[var(--color-on-variant)]">Gratis y sin registrarse. Funciona con poca señal.</p>
        </>}
        {STEPS[i] === 'cultivos' && <>
          <h1 className="font-display text-[2rem] leading-tight text-[var(--color-primary)]">¿Qué cultiva?</h1>
          <p className="mt-1 text-[var(--color-on-variant)]">Elija uno o varios. Puede cambiarlo más tarde.</p>
          <div className="mt-6 grid grid-cols-3 gap-4" role="group" aria-label="Cultivos">
            {CROP_LIST.map(c => {
              const on = crops.includes(c.id)
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle(c.id)}
                  className={`relative flex flex-col items-center gap-2 rounded-2xl p-3 font-semibold ${on ? 'bg-[var(--color-surface-high)] ring-2 ring-[var(--color-primary)]' : 'bg-[var(--color-surface-low)]'}`}>
                  {on && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-white"><Icon name="check" size={14} /></span>}
                  <CropMark id={c.id} size={60} />{c.name}
                </button>
              )
            })}
          </div>
        </>}
        {STEPS[i] === 'perfil' && <>
          <h1 className="font-display text-[2rem] leading-tight text-[var(--color-primary)]">Elija lo que mejor le describe</h1>
          <div className="mt-6 space-y-3" role="radiogroup" aria-label="Perfil">
            {PROFILES.map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={profile === v} onClick={() => setProf(v)}
                className={`flex min-h-16 w-full items-center justify-between rounded-2xl border px-5 text-left text-[1.05rem] ${profile === v ? 'border-[var(--color-primary)] bg-[var(--color-surface-low)] font-semibold' : 'border-[var(--color-outline-variant)] bg-white'}`}>
                {l}<span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${profile === v ? 'border-[var(--color-primary)]' : 'border-[var(--color-outline-variant)]'}`}>{profile === v && <span className="h-3 w-3 rounded-full bg-[var(--color-primary)]" />}</span>
              </button>
            ))}
          </div>
        </>}
        {STEPS[i] === 'ubicacion' && <>
          <h1 className="font-display text-[2rem] leading-tight text-[var(--color-primary)]">¿Dónde está su campo?</h1>
          <p className="mt-1 text-[var(--color-on-variant)]">Para mostrarle el clima y la época de siembra de su zona. Su ubicación exacta queda solo en este celular.</p>
          <div className="mt-6 space-y-4">
            <GpsButton />
            <label className="block rounded-xl border border-[var(--color-outline-variant)] bg-white px-4 py-3">
              <span className="mb-1 block text-sm font-semibold">O elija su municipio</span>
              <MunicipalitySelect className="w-full" />
            </label>
            {m && <p className="flex items-center gap-2 font-semibold text-[var(--color-tint)]"><Icon name="check" size={18} />{m.name}, {m.department_name}</p>}
          </div>
        </>}
      </div>

      {!only && <div className="mt-8 flex justify-center gap-2" aria-hidden="true">
        {STEPS.map((s, k) => <span key={s} className={`h-2 rounded-full ${k === i ? 'w-6 bg-[var(--color-primary)]' : 'w-2 bg-[var(--color-outline-variant)]'}`} />)}
      </div>}
      <div className="mt-6 flex items-center justify-between gap-3">
        {!only ? <button type="button" className="min-h-12 px-3 font-semibold text-[var(--color-on-variant)]" onClick={finish}>Saltar</button> : <span />}
        <button type="button" className="btn-primary min-w-40" onClick={next}>
          {only ? 'Guardar' : i === STEPS.length - 1 ? 'Empezar' : 'Siguiente'}
        </button>
      </div>
    </div>
  )
}
