import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, ErrorBox, Field, Loading, Notice, PageTitle, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import type { Community, RegionalNotice } from '../lib/types'

export default function AdminPage() {
  const { user } = useApp()
  if (!user || (user.role !== 'admin' && user.role !== 'editor')) return <ErrorBox message="Solo para administradores o editores de contenido." />
  return (
    <div className="space-y-6">
      {user.role === 'editor' && <PageTitle title="Publicar avisos" subtitle="Usted es editor de contenido." />}
      <PublishNotices />
      {user.role === 'admin' && <Admin />}
    </div>
  )
}

function Admin() {
  const { user } = useApp()
  const [pending, setPending] = useState<(Community & { requested_by: string })[] | null>(null)
  const [approved, setApproved] = useState<Community[] | null>(null)
  const [users, setUsers] = useState<any[] | null>(null)
  const [report, setReport] = useState<Record<string, any> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [members, setMembers] = useState<{ cid: number; list: any[] } | null>(null)
  const load = () => {
    setErr(null)
    Promise.all([api('/api/admin/communities?status=pending'), api('/api/admin/communities?status=approved'), api('/api/admin/users'), api('/api/admin/reports')])
      .then(([p, a, u, r]) => { setPending(p); setApproved(a); setUsers(u); setReport(r) }).catch(e => setErr(e.message))
  }
  useEffect(() => { if (user?.role === 'admin') load() }, [user])
  if (!user || user.role !== 'admin') return <ErrorBox message="Solo para administradores." />
  const action = async (fn: () => Promise<unknown>) => {
    setActionErr(null)
    try { await fn() } catch (e) { setActionErr((e as Error).message) }
  }
  const decide = (id: number, d: string) => action(async () => { await api(`/api/admin/communities/${id}/${d}`, { method: 'POST' }); load() })
  const showMembers = (cid: number) => action(async () => setMembers({ cid, list: await api(`/api/admin/memberships?community_id=${cid}`) }))
  const setRole = (mid: number, role: string) => action(async () => { await api(`/api/admin/memberships/${mid}/role`, { body: { role } }); if (members) await showMembers(members.cid) })
  const [temp, setTemp] = useState<{ name: string; pw: string } | null>(null)
  const resetPw = (uid: number, name: string) => {
    if (!window.confirm(`¿Dar una clave temporal a ${name}? Su clave actual dejará de funcionar.`)) return
    return action(async () => {
      const r = await api<{ temporary_password: string }>(`/api/admin/users/${uid}/reset-password`, { method: 'POST' })
      setTemp({ name, pw: r.temporary_password })
    })
  }
  const setGlobalRole = (uid: number, role: string) => action(async () => { await api(`/api/admin/users/${uid}/role`, { body: { role } }); load() })
  const deactivate = (uid: number) => { if (window.confirm('¿Desactivar esta cuenta?')) return action(async () => { await api(`/api/admin/users/${uid}/deactivate`, { method: 'POST' }); load() }) }
  if (err) return <ErrorBox message={err} onRetry={load} />
  if (!pending || !users || !report || !approved) return <Loading />
  return (
    <div className="space-y-5">
      <PageTitle title="Administración" subtitle="Comunidades, permisos y reportes." />
      {actionErr && <p role="alert" className="font-semibold text-rojo">{actionErr}</p>}
      <section>
        <h2 className="mb-2 text-xl font-bold">Comunidades por aprobar ({pending.length})</h2>
        {pending.length === 0 ? <Notice>No hay solicitudes.</Notice> : pending.map(c => (
          <Card key={c.id} className="mb-2">
            <div className="text-lg font-bold">{c.name}</div>
            <div className="text-musgo">{c.municipality_name}, {c.department_name} · Solicita: {c.requested_by}</div>
            {c.description && <p>{c.description}</p>}
            <p className="mt-1 text-sm">Al aprobar, el solicitante queda como representante.</p>
            <div className="mt-2 grid grid-cols-2 gap-2"><Button onClick={() => decide(c.id, 'approve')}>Aprobar</Button><Button variant="danger" onClick={() => decide(c.id, 'reject')}>Rechazar</Button></div>
          </Card>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-xl font-bold">Comunidades activas</h2>
        {approved.map(c => (
          <Card key={c.id} className="mb-2">
            <div className="flex items-center justify-between gap-2"><div><div className="font-bold">{c.name}</div><div className="text-sm text-musgo">{c.municipality_name} · {c.members} miembros</div></div>
              <Button variant="secondary" onClick={() => showMembers(c.id)}>Permisos</Button></div>
            {members?.cid === c.id && <ul className="mt-2 space-y-2">{members.list.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-2 border-t border-linea pt-2">
                <span>{m.user_name} · <em>{m.role === 'representative' ? 'Representante' : 'Miembro'}</em> · {m.status}</span>
                {m.status === 'approved' && <Button variant="ghost" onClick={() => setRole(m.id, m.role === 'representative' ? 'member' : 'representative')}>{m.role === 'representative' ? 'Quitar rol' : 'Hacer representante'}</Button>}
              </li>))}</ul>}
          </Card>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-xl font-bold">Reporte del sistema</h2>
        <Card><ul className="grid grid-cols-2 gap-2">
          {Object.entries(report).filter(([k]) => !k.startsWith('_') && typeof report[k] === 'number').map(([k, v]) => <li key={k}><div className="text-2xl font-bold text-bosque">{v as number}</div><div className="text-sm text-musgo">{k.replace(/_/g, ' ')}</div></li>)}
        </ul><p className="mt-2 text-sm text-musgo">{report._nota}</p></Card>
      </section>
      <section>
        <h2 className="mb-2 text-xl font-bold">Usuarios ({users.length})</h2>
        <p className="mb-2 text-musgo">¿Alguien olvidó su clave? Verifique su identidad en persona y dele una clave temporal: deberá cambiarla al ingresar.</p>
        {temp && <Notice tone="ok"><span data-testid="temp-password">Clave temporal de {temp.name}: <strong className="text-xl tracking-widest">{temp.pw}</strong></span><br />Entréguela en persona. No se volverá a mostrar.</Notice>}
        <ul className="space-y-2">{users.map(u => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-linea bg-white p-3">
            <span>{u.full_name} <span className="text-sm text-musgo">· …{u.phone_last4} · {u.role}{u.is_demo ? ' · demo' : ''}{!u.is_active ? ' · inactivo' : ''}</span></span>
            {u.is_active && u.role !== 'admin' && <span className="flex flex-wrap gap-1">
              <Button variant="ghost" onClick={() => resetPw(u.id, u.full_name)}>Clave temporal</Button>
              <Button variant="ghost" onClick={() => setGlobalRole(u.id, u.role === 'editor' ? 'farmer' : 'editor')}>{u.role === 'editor' ? 'Quitar editor' : 'Hacer editor'}</Button>
              <Button variant="ghost" onClick={() => deactivate(u.id)}>Desactivar</Button></span>}
          </li>))}</ul>
      </section>
      <MessageHistory />
    </div>
  )
}

const STATUS_TXT: Record<string, string> = { simulado: 'Simulado', enviado: 'Enviado', entregado: 'Entregado', leido: 'Leído', fallido: 'Fallido' }

/** Historial de mensajes salientes con su estado (idea de PACHAAGRO). */
function MessageHistory() {
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => { api<any[]>('/api/admin/messages').then(setRows).catch(() => setRows([])) }, [])
  return (
    <section>
      <h2 className="mb-2 text-xl font-bold">Historial de mensajes de WhatsApp</h2>
      <p className="mb-2 text-musgo">Sin credenciales de Meta todos quedan como «Simulado»: no se envió nada real.</p>
      {!rows ? <Loading /> : rows.length === 0 ? <Notice>Aún no hay mensajes.</Notice> : (
        <ul className="space-y-2">{rows.slice(0, 20).map(m => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border border-linea bg-white p-3">
            <span>{m.user_name} <span className="text-sm text-musgo">· {m.template} · {m.created_at.replace('T', ' ')}</span>{m.error && <span className="block text-sm text-rojo">{m.error}</span>}</span>
            <span className="shrink-0 font-semibold">{STATUS_TXT[m.status] ?? m.status}</span>
          </li>))}</ul>
      )}
    </section>
  )
}

const SCOPES = [['nacional', 'Todo el país'], ['departamento', 'Un departamento'], ['municipio', 'Un municipio'], ['cultivo', 'Productores de un cultivo']] as const

/** Publicación de avisos regionales segmentados (adaptado de PACHAAGRO). */
function PublishNotices() {
  const { departments } = useApp()
  const empty = { title: '', summary: '', body: '', kind: 'aviso', scope: 'nacional', department_id: '', municipality_id: '', crop_id: 'quinua', days: '14' }
  const [f, setF] = useState(empty)
  const [list, setList] = useState<RegionalNotice[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => api<RegionalNotice[]>('/api/notices').then(setList).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  const dept = departments?.find(d => d.id === f.department_id)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null)
    const expires = new Date(Date.now() + Number(f.days) * 86400000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const local = `${expires.getFullYear()}-${pad(expires.getMonth() + 1)}-${pad(expires.getDate())}T23:59:00`
    try {
      await api('/api/notices', { body: {
        title: f.title, summary: f.summary, body: f.body, kind: f.kind, scope: f.scope, expires_at: local,
        department_id: f.department_id || null, municipality_id: f.municipality_id || null, crop_id: f.scope === 'cultivo' ? f.crop_id : null } })
      setF(empty); setMsg('Aviso publicado.'); load()
    } catch (e) { setErr((e as Error).message) }
  }
  const notify = async (n: RegionalNotice) => {
    try { const r = await api<{ message: string; recipients: number }>(`/api/notices/${n.id}/notify`, { method: 'POST' }); setMsg(`${r.message} (${r.recipients} personas)`) }
    catch (e) { setErr((e as Error).message) }
  }
  const archive = async (n: RegionalNotice) => {
    if (!window.confirm(`¿Retirar "${n.title}"?`)) return
    try { await api(`/api/notices/${n.id}/archive`, { method: 'POST' }); load() }
    catch (e) { setErr((e as Error).message) }
  }
  const sel = inputCls
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Avisos regionales</h2>
      <Notice tone="warn">Se muestran como <strong>avisos de la plataforma, no oficiales</strong>. No copie ni invente alertas del SENAMHI.</Notice>
      <form onSubmit={submit} className="space-y-3 rounded-md border border-bosque bg-white p-4">
        <Field label="Título"><input className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} required minLength={5} maxLength={140} /></Field>
        <Field label="Resumen (lo que llega por WhatsApp)"><textarea className={inputCls} rows={2} value={f.summary} onChange={e => setF({ ...f, summary: e.target.value })} required minLength={5} maxLength={300} /></Field>
        <Field label="Detalle (opcional)"><textarea className={inputCls} rows={3} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} maxLength={3000} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tipo"><select className={sel} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
            <option value="aviso">Aviso</option><option value="comunicado">Comunicado</option><option value="clima">Clima</option><option value="evento">Evento</option></select></Field>
          <Field label="Vigencia"><select className={sel} value={f.days} onChange={e => setF({ ...f, days: e.target.value })}>
            <option value="3">3 días</option><option value="7">7 días</option><option value="14">14 días</option><option value="30">30 días</option></select></Field>
        </div>
        <Field label="¿Para quién?"><select className={sel} value={f.scope} onChange={e => setF({ ...f, scope: e.target.value, department_id: '', municipality_id: '' })}>
          {SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {(f.scope === 'departamento' || f.scope === 'municipio') && (
          <Field label="Departamento"><select className={sel} value={f.department_id} onChange={e => setF({ ...f, department_id: e.target.value, municipality_id: '' })} required>
            <option value="">Elija…</option>{departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>)}
        {f.scope === 'municipio' && dept && (
          <Field label="Municipio"><select className={sel} value={f.municipality_id} onChange={e => setF({ ...f, municipality_id: e.target.value })} required>
            <option value="">Elija…</option>{dept.municipalities.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>)}
        {f.scope === 'cultivo' && (
          <Field label="Cultivo"><select className={sel} value={f.crop_id} onChange={e => setF({ ...f, crop_id: e.target.value })}>
            <option value="quinua">Quinua</option><option value="papa">Papa</option><option value="maiz">Maíz</option><option value="haba">Haba</option><option value="cebada">Cebada</option></select></Field>)}
        {err && <p role="alert" className="font-semibold text-rojo">{err}</p>}
        <Button className="w-full">Publicar aviso</Button>
      </form>
      {msg && <Notice tone="ok">{msg}</Notice>}
      {!list ? <Loading /> : list.map(n => (
        <Card key={n.id}>
          <div className="text-sm font-semibold text-tierra">{n.kind_label} · Para: {n.scope_label}{n.is_demo ? ' · DEMO' : ''}</div>
          <div className="text-lg font-bold">{n.title}</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => notify(n)}>Enviar por WhatsApp</Button>
            <Button variant="danger" onClick={() => archive(n)}>Retirar</Button>
          </div>
        </Card>
      ))}
    </section>
  )
}
