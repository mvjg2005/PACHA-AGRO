import { useEffect, useState, type FormEvent } from 'react'
import { DepartmentList, MunicipalityList } from '../components/LocationPicker'
import { Wall } from '../components/Wall'
import { Button, Card, ErrorBox, Field, Loading, Notice, PageTitle, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import type { Community } from '../lib/types'

const ROLE = (m: Community['my_membership']) => !m ? null : m.status === 'pending' ? '⏳ Solicitud pendiente' : m.status === 'rejected' ? 'Rechazada' : m.role === 'representative' ? 'Representante' : 'Miembro'

export default function CommunityHome() {
  const { user } = useApp()
  if (!user) {
    return (
      <div className="space-y-4">
        <PageTitle title="Mi comunidad" subtitle="Organícese con su comunidad: reuniones, avisos y reportes de heladas o granizo." />
        <Card>
          <ul className="space-y-2 text-lg">
            <li>Vea las reuniones y confirme si asistirá.</li>
            <li>Reciba avisos de su representante.</li>
            <li>Avise si cayó granizo o helada.</li>
          </ul>
        </Card>
        <a href="#/ingresar" className="flex min-h-14 items-center justify-center rounded-md bg-bosque text-lg font-semibold text-white">Ingresar</a>
        <a href="#/registro" className="flex min-h-14 items-center justify-center rounded-md border border-bosque bg-white text-lg font-semibold text-bosque">Crear cuenta</a>
        <div className="pt-4"><Wall /></div>
      </div>
    )
  }
  return <Mine />
}

function Mine() {
  const { user } = useApp()
  const [list, setList] = useState<Community[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<'mine' | 'join' | 'create'>('mine')
  const [pending, setPending] = useState(0)
  const load = () => {
    setErr(null); api<Community[]>('/api/me/communities').then(setList).catch(e => setErr(e.message))
    if (user?.role === 'admin') api<Community[]>('/api/admin/communities?status=pending').then(l => setPending(l.length)).catch(() => setPending(0))
  }
  useEffect(load, [])
  if (view === 'join') return <Join onDone={() => { setView('mine'); load() }} />
  if (view === 'create') return <Create onDone={() => { setView('mine'); load() }} />
  return (
    <div className="space-y-4">
      <PageTitle title="Mi comunidad" subtitle={`Hola, ${user!.full_name.split(' ')[0]}.`} />
      {user?.role === 'admin' && (
        <Notice tone={pending ? 'warn' : 'info'}>
          {pending ? <><strong>{pending} {pending === 1 ? 'comunidad espera' : 'comunidades esperan'} su aprobación.</strong> </> : 'Usted es administrador. '}
          <a href="#/admin" className="font-semibold underline" data-testid="admin-pending-link">Abrir el panel de administración</a>
        </Notice>
      )}
      {err ? <ErrorBox message={err} onRetry={load} /> : !list ? <Loading /> : list.length === 0 ? (
        <Notice>Aún no pertenece a ninguna comunidad. Busque la suya y pida unirse.</Notice>
      ) : (
        <ul className="space-y-3">
          {list.map(c => (
            <li key={c.id}>
              {c.status === 'approved' && c.my_membership?.status === 'approved' ? (
                <a href={`#/comunidad/${c.id}`} className="block rounded-md border border-bosque bg-white p-4">
                  <div className="text-xl font-bold text-bosque">{c.name} →</div>
                  <div className="text-musgo">{c.municipality_name}, {c.department_name} · {c.members} miembros</div>
                  <div className="mt-1 font-semibold">{ROLE(c.my_membership)}</div>
                  {c.is_demo && <div className="mt-1 text-sm font-semibold text-tierra">Comunidad de DEMOSTRACIÓN</div>}
                </a>
              ) : (
                <div className="rounded-md border border-linea bg-white p-4">
                  <div className="text-xl font-bold">{c.name}</div>
                  <div className="text-musgo">{c.municipality_name}, {c.department_name}</div>
                  <div className="mt-1 font-semibold">{c.status === 'pending' ? '⏳ Comunidad en revisión por un administrador' : ROLE(c.my_membership)}</div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button className="w-full" onClick={() => setView('join')}>Buscar y unirme a una comunidad</Button>
      <Button variant="secondary" className="w-full" onClick={() => setView('create')}>Registrar una comunidad nueva</Button>
      <a href="#/perfil" className="block min-h-12 py-3 text-center font-semibold text-bosque underline underline-offset-4">Mi cuenta y avisos por WhatsApp</a>
      <div className="pt-2"><Wall /></div>
    </div>
  )
}

function Join({ onDone }: { onDone: () => void }) {
  const [dept, setDept] = useState<string | null>(null)
  const [muni, setMuni] = useState<string | null>(null)
  const [list, setList] = useState<Community[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!muni) return
    setList(null); api<Community[]>(`/api/communities?municipality_id=${muni}`).then(setList).catch(e => setErr(e.message))
  }, [muni])
  const join = async (id: number) => {
    setErr(null)
    try { const r = await api<{ message: string }>(`/api/communities/${id}/join`, { method: 'POST' }); setMsg(r.message) } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div className="space-y-4">
      <PageTitle title="Buscar mi comunidad" />
      <button className="min-h-12 font-semibold text-bosque underline" onClick={onDone}>← Volver</button>
      {msg ? (<><Notice tone="ok">{msg}</Notice><Button className="w-full" onClick={onDone}>Listo</Button></>) :
        !dept ? (<><h2 className="text-xl font-bold">¿Departamento?</h2><DepartmentList onPick={setDept} /></>) :
          !muni ? (<><h2 className="text-xl font-bold">¿Municipio?</h2><MunicipalityList departmentId={dept} onPick={setMuni} /></>) : (
            <>
              <h2 className="text-xl font-bold">Comunidades registradas</h2>
              {err && <ErrorBox message={err} />}
              {!list ? <Loading /> : list.length === 0 ? <Notice>No hay comunidades registradas en este municipio. Puede registrar una nueva.</Notice> : (
                <ul className="space-y-3">{list.map(c => (
                  <li key={c.id} className="rounded-md border border-linea bg-white p-4">
                    <div className="text-xl font-bold">{c.name}</div>
                    <div className="text-musgo">{c.members} miembros · Representante: {c.representatives.join(', ') || '—'}</div>
                    <Button className="mt-3 w-full" onClick={() => join(c.id)}>Pedir unirme</Button>
                  </li>))}</ul>
              )}
              <button className="min-h-12 font-semibold text-bosque underline" onClick={() => setMuni(null)}>← Otro municipio</button>
            </>
          )}
    </div>
  )
}

function Create({ onDone }: { onDone: () => void }) {
  const [dept, setDept] = useState<string | null>(null)
  const [muni, setMuni] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    try { const c = await api<Community>('/api/communities', { body: { name, municipality_id: muni, description } }); setDone(c.status) } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div className="space-y-4">
      <PageTitle title="Registrar comunidad" subtitle="Un administrador revisará la solicitud para evitar comunidades falsas." />
      <button className="min-h-12 font-semibold text-bosque underline" onClick={onDone}>← Volver</button>
      {done ? (<><Notice tone="ok">{done === 'approved' ? 'Comunidad registrada y aprobada. Usted es su representante.' : 'Solicitud enviada. Cuando un administrador la apruebe, usted será el representante.'}</Notice><Button className="w-full" onClick={onDone}>Listo</Button></>) :
        !dept ? <DepartmentList onPick={setDept} /> : !muni ? <MunicipalityList departmentId={dept} onPick={setMuni} /> : (
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Nombre de la comunidad"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} minLength={3} maxLength={120} required /></Field>
            <Field label="Descripción (opcional)"><textarea className={inputCls} rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={600} /></Field>
            {err && <p role="alert" className="font-semibold text-rojo">{err}</p>}
            <Button className="w-full">Enviar solicitud</Button>
          </form>
        )}
    </div>
  )
}
