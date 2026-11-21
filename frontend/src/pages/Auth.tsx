import { useState, type FormEvent } from 'react'
import { Button, Field, Notice, PageTitle, inputCls } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { go } from '../lib/router'
import { useApp } from '../lib/store'
import type { User } from '../lib/types'

export function Login() {
  const { setSession } = useApp()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const r = await api<{ token: string; user: User }>('/api/auth/login', { body: { phone, password } })
      setSession(r.token, r.user); go('/comunidad')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <PageTitle title="Ingresar" subtitle="Solo necesita cuenta para su comunidad. El clima y la siembra son libres." />
      <Field label="Número de celular"><input className={inputCls} inputMode="tel" autoComplete="tel" placeholder="71234567" value={phone} onChange={e => setPhone(e.target.value)} required /></Field>
      <Field label="Clave"><input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
      {err && <p role="alert" className="font-semibold text-rojo">{err}</p>}
      <Button className="w-full" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</Button>
      <a href="#/registro" className="block min-h-12 py-3 text-center text-lg font-semibold text-bosque underline underline-offset-4">¿No tiene cuenta? Regístrese</a>
    </form>
  )
}

export function Register() {
  const { setSession, municipalityId } = useApp()
  const [f, setF] = useState({ full_name: '', phone: '', password: '', whatsapp_opt_in: false })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null); setErrs({})
    try {
      const r = await api<{ token: string; user: User }>('/api/auth/register', { body: { ...f, default_municipality_id: municipalityId } })
      setSession(r.token, r.user); go('/comunidad')
    } catch (e) {
      if (e instanceof ApiError) { setErrs(e.fields); setErr(e.message) } else setErr('Ocurrió un problema.')
    } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <PageTitle title="Crear cuenta" subtitle="Para unirse a su comunidad y recibir avisos." />
      <Field label="Nombre completo" error={errs.full_name}><input className={inputCls} autoComplete="name" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field>
      <Field label="Número de celular" error={errs.phone} hint="8 dígitos, por ejemplo 71234567"><input className={inputCls} inputMode="tel" autoComplete="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Clave (mínimo 6 letras o números)" error={errs.password}><input className={inputCls} type="password" autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
      <label className="flex min-h-12 items-start gap-3 rounded-md border border-linea bg-white p-3">
        <input type="checkbox" className="mt-1 h-6 w-6 accent-[#1e4a2c]" checked={f.whatsapp_opt_in} onChange={e => setF({ ...f, whatsapp_opt_in: e.target.checked })} />
        <span><strong>Acepto recibir por WhatsApp</strong> recordatorios de reuniones y avisos de mi comunidad. Puedo darme de baja cuando quiera escribiendo BAJA.</span>
      </label>
      <p className="text-sm text-musgo">Usamos su número solo para su cuenta y avisos de su comunidad. Los demás miembros no ven su número completo. Lea la <a className="font-semibold text-bosque underline" href="#/privacidad">política de privacidad</a>.</p>
      {err && <p role="alert" className="font-semibold text-rojo">{err}</p>}
      <Button className="w-full" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</Button>
      <a href="#/ingresar" className="block min-h-12 py-3 text-center text-lg font-semibold text-bosque underline underline-offset-4">Ya tengo cuenta</a>
    </form>
  )
}

export function Profile() {
  const { user, logout, refreshUser } = useApp()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!user) return <Login />
  const toggle = async () => {
    setBusy(true); setErr(null)
    try { await api('/api/auth/me', { method: 'PATCH', body: { whatsapp_opt_in: !user.whatsapp_opt_in } }); await refreshUser() }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <PageTitle title={user.full_name} subtitle={`Celular terminado en ${user.phone.slice(-4)}`} />
      {user.is_demo && <Notice tone="sim">Esta es una cuenta de DEMOSTRACIÓN ficticia.</Notice>}
      <div className="rounded-md border border-linea bg-white p-4">
        <p className="text-lg font-bold">Avisos por WhatsApp</p>
        <p className="mt-1">{user.whatsapp_opt_in ? 'Usted aceptó recibir recordatorios y avisos.' : 'No recibe recordatorios ni avisos.'}</p>
        {err && <p role="alert" className="mt-1 font-semibold text-rojo">{err}</p>}
        <Button variant="secondary" className="mt-3" disabled={busy} onClick={toggle}>{user.whatsapp_opt_in ? 'Dejar de recibir' : 'Aceptar recibir avisos'}</Button>
      </div>
      <CropInterests />
      <ChangePassword />
      <a href="#/privacidad" className="block min-h-12 py-3 font-semibold text-bosque underline underline-offset-4">Política de privacidad</a>
      {(user.role === 'admin' || user.role === 'editor') && <a href="#/admin" className="block rounded-md bg-tierra px-5 py-3 text-center text-lg font-semibold text-white">{user.role === 'admin' ? 'Panel de administración' : 'Publicar avisos'}</a>}
      <Button variant="danger" className="w-full" onClick={() => { logout(); go('/') }}>Salir de mi cuenta</Button>
      {user.role !== 'admin' && <DeleteAccount />}
    </div>
  )
}

const CROPS = [['quinua', 'Quinua'], ['papa', 'Papa'], ['maiz', 'Maíz'], ['haba', 'Haba'], ['cebada', 'Cebada']] as const

/** Cultivos de interés (idea de PACHAAGRO): segmentan los avisos regionales que recibe. */
function CropInterests() {
  const { user, refreshUser } = useApp()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!user) return null
  const toggle = async (id: string) => {
    setBusy(true); setSaved(false); setErr(null)
    const next = user.crops.includes(id) ? user.crops.filter(c => c !== id) : [...user.crops, id]
    try { await api('/api/auth/me', { method: 'PATCH', body: { crops: next } }); await refreshUser(); setSaved(true) }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-md border border-linea bg-white p-4">
      <p className="text-lg font-bold">Mis cultivos</p>
      <p className="mt-1 text-musgo">Recibirá los avisos de estos cultivos además de los de su zona.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {CROPS.map(([id, label]) => {
          const on = user.crops.includes(id)
          return <button key={id} disabled={busy} aria-pressed={on} onClick={() => toggle(id)}
            className={`min-h-12 rounded-md border text-lg font-semibold ${on ? 'border-bosque bg-brote text-bosque-800' : 'border-linea bg-white'}`}>{on ? '' : ''}{label}</button>
        })}
      </div>
      {saved && <p className="mt-2 font-semibold text-bosque" role="status">Guardado</p>}
      {err && <p className="mt-2 font-semibold text-rojo" role="alert">{err}</p>}
    </div>
  )
}


/** Cambio de clave. Con `forced`, es la pantalla obligatoria tras recibir una clave temporal. */
export function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { refreshUser, logout, setSession } = useApp()
  const [f, setF] = useState({ current: '', next: '', repeat: '' })
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setOk(false)
    if (f.next.length < 8) { setErr('La clave nueva debe tener al menos 8 letras o números.'); return }
    if (f.next !== f.repeat) { setErr('Las dos claves nuevas no son iguales.'); return }
    setBusy(true)
    try {
      const r = await api<{ token: string; user: User }>('/api/auth/password', { body: { current_password: f.current, new_password: f.next } })
      setSession(r.token, r.user)
      setF({ current: '', next: '', repeat: '' }); setOk(true); await refreshUser()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-linea bg-white p-4" noValidate>
      {forced ? <>
        <PageTitle title="Cree su clave nueva" subtitle="Ingresó con una clave temporal. Por seguridad, elija una clave que solo usted conozca." />
      </> : <p className="text-lg font-bold">Cambiar mi clave</p>}
      <Field label={forced ? 'Clave temporal' : 'Clave actual'}><input className={inputCls} type="password" autoComplete="current-password" value={f.current} onChange={e => setF({ ...f, current: e.target.value })} /></Field>
      <Field label="Clave nueva (mínimo 8)"><input className={inputCls} type="password" autoComplete="new-password" value={f.next} onChange={e => setF({ ...f, next: e.target.value })} /></Field>
      <Field label="Repita la clave nueva"><input className={inputCls} type="password" autoComplete="new-password" value={f.repeat} onChange={e => setF({ ...f, repeat: e.target.value })} /></Field>
      {err && <p role="alert" className="font-semibold text-rojo">{err}</p>}
      {ok && <p role="status" className="font-semibold text-bosque">Clave cambiada.</p>}
      <Button className="w-full" disabled={busy}>{busy ? 'Guardando…' : 'Guardar clave nueva'}</Button>
      {forced && <Button type="button" variant="ghost" className="w-full" onClick={() => { logout(); go('/') }}>Salir</Button>}
    </form>
  )
}

/** Eliminar la cuenta (derecho de supresión de datos personales). */
function DeleteAccount() {
  const { logout } = useApp()
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  if (!open) return <button className="min-h-12 w-full font-semibold text-rojo underline underline-offset-4" onClick={() => setOpen(true)}>Eliminar mi cuenta</button>
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    try { await api('/api/auth/me', { method: 'DELETE', body: { password: pw } }); logout(); go('/') } catch (e) { setErr((e as Error).message) }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-rojo bg-rojo-50 p-4">
      <p className="text-lg font-bold text-rojo">Eliminar mi cuenta</p>
      <p>Se borrarán su nombre, número, ubicación, cultivos, mensajes y su participación en comunidades. Lo que publicó en su comunidad quedará como «Cuenta eliminada». No se puede deshacer.</p>
      <Field label="Escriba su clave para confirmar"><input className={inputCls} type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
      {err && <p role="alert" className="font-semibold text-rojo">{err}</p>}
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="danger">Eliminar</Button></div>
    </form>
  )
}
