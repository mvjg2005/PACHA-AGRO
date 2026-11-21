import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, ErrorBox, Field, Loading, Notice, PageTitle, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { dateLong } from '../lib/format'
import type { Community, Meeting } from '../lib/types'

type Tab = 'reuniones' | 'avisos' | 'reportes' | 'historial' | 'solicitudes'

export default function CommunityDetail({ id }: { id: number }) {
  const [c, setC] = useState<Community | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('reuniones')
  useEffect(() => { api<Community>(`/api/communities/${id}`).then(setC).catch(e => setErr(e.message)) }, [id])
  if (err) return <ErrorBox message={err} />
  if (!c) return <Loading />
  const isRep = c.my_membership?.role === 'representative' && c.my_membership.status === 'approved'
  const tabs: [Tab, string][] = [['reuniones', '📅 Reuniones'], ['avisos', '📢 Avisos'], ['reportes', '🧊 Reportes'], ['historial', '🕘 Historial']]
  if (isRep) tabs.push(['solicitudes', '👥 Solicitudes'])
  return (
    <div className="space-y-4">
      <a href="#/comunidad" className="inline-block min-h-10 font-semibold text-bosque underline">← Mis comunidades</a>
      <PageTitle icon="👨‍🌾" title={c.name} subtitle={`${c.municipality_name}, ${c.department_name} · ${c.members} miembros`} />
      {c.is_demo && <Notice tone="sim">Comunidad de DEMOSTRACIÓN (ficticia).</Notice>}
      {isRep && <Notice tone="ok">⭐ Usted es representante verificado de esta comunidad.</Notice>}
      <div role="tablist" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-12 shrink-0 rounded-full border-2 px-4 font-semibold ${tab === k ? 'border-bosque bg-bosque text-white' : 'border-linea bg-papel text-tinta'}`}>{l}</button>
        ))}
      </div>
      {tab === 'reuniones' && <Meetings cid={id} isRep={isRep} />}
      {tab === 'avisos' && <Notices cid={id} isRep={isRep} />}
      {tab === 'reportes' && <Reports cid={id} isRep={isRep} />}
      {tab === 'historial' && <History cid={id} />}
      {tab === 'solicitudes' && <Requests cid={id} />}
    </div>
  )
}

function useList<T>(url: string): [T[] | null, string | null, () => void] {
  const [data, setData] = useState<T[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => { setErr(null); api<T[]>(url).then(setData).catch(e => setErr(e.message)) }
  useEffect(load, [url])
  return [data, err, load]
}

function Meetings({ cid, isRep }: { cid: number; isRep: boolean }) {
  const [list, err, reload] = useList<Meeting>(`/api/communities/${cid}/meetings`)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const respond = async (m: Meeting, response: string) => {
    try { await api(`/api/meetings/${m.id}/attendance`, { body: { response } }); setFlash('✅ Respuesta guardada.'); reload() } catch (e) { setFlash(`⚠️ ${(e as Error).message}`) }
  }
  const remind = async (m: Meeting) => {
    try { const r = await api<{ message: string; recipients: number }>(`/api/meetings/${m.id}/remind`, { method: 'POST' }); setFlash(`${r.message} (${r.recipients} personas con WhatsApp aceptado)`) } catch (e) { setFlash(`⚠️ ${(e as Error).message}`) }
  }
  const cancel = async (m: Meeting) => {
    if (!window.confirm(`¿Cancelar la reunión "${m.title}"?`)) return
    await api(`/api/meetings/${m.id}/cancel`, { method: 'POST' }); reload()
  }
  if (creating) return <MeetingForm cid={cid} onDone={() => { setCreating(false); reload(); setFlash('✅ Reunión creada.') }} onCancel={() => setCreating(false)} />
  return (
    <div className="space-y-3">
      {flash && <Notice tone={flash.startsWith('⚠️') ? 'warn' : 'ok'}>{flash}</Notice>}
      {isRep && <Button className="w-full" onClick={() => setCreating(true)}>➕ Convocar reunión</Button>}
      {err ? <ErrorBox message={err} onRetry={reload} /> : !list ? <Loading /> : list.length === 0 ? <Notice>No hay reuniones programadas.</Notice> : list.map(m => (
        <Card key={m.id} className={m.cancelled ? 'opacity-70' : ''}>
          <div className="text-sm font-bold text-tierra">{dateLong(m.starts_at)}</div>
          <h3 className="text-xl font-bold">{m.cancelled && '❌ CANCELADA · '}{m.title}</h3>
          <p>📍 {m.place}</p>
          {m.description && <p className="mt-1 text-musgo">{m.description}</p>}
          <p className="mt-1 text-sm text-musgo">Convoca: {m.created_by} · Asistirán: {m.attendance.si} · No: {m.attendance.no} · Tal vez: {m.attendance.tal_vez}</p>
          {!m.cancelled && (
            <>
              <p className="mt-3 font-semibold">¿Va a asistir?</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {[['si', '✔ Sí'], ['no', '✖ No'], ['tal_vez', '? Tal vez']].map(([k, l]) => (
                  <button key={k} onClick={() => respond(m, k)} aria-pressed={m.my_response === k}
                    className={`min-h-12 rounded-xl border-2 font-semibold ${m.my_response === k ? 'border-bosque bg-bosque text-white' : 'border-linea bg-papel'}`}>{l}</button>
                ))}
              </div>
              {isRep && <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => remind(m)}>💬 Recordar</Button>
                <Button variant="danger" onClick={() => cancel(m)}>Cancelar</Button>
              </div>}
            </>
          )}
        </Card>
      ))}
    </div>
  )
}

function MeetingForm({ cid, onDone, onCancel }: { cid: number; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ title: '', place: '', date: '', time: '10:00', description: '' })
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    if (!f.date) { setErr('Elija la fecha.'); return }
    try { await api(`/api/communities/${cid}/meetings`, { body: { title: f.title, place: f.place, description: f.description, starts_at: `${f.date}T${f.time}:00-04:00` } }); onDone() }
    catch (e) { setErr((e as Error).message) }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-bold">Nueva reunión</h2>
      <Field label="¿Sobre qué es?"><input className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Ej. Planificar la siembra" required minLength={3} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día"><input type="date" className={inputCls} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} required /></Field>
        <Field label="Hora"><input type="time" className={inputCls} value={f.time} onChange={e => setF({ ...f, time: e.target.value })} required /></Field>
      </div>
      <Field label="Lugar"><input className={inputCls} value={f.place} onChange={e => setF({ ...f, place: e.target.value })} placeholder="Ej. Sede de la comunidad" required minLength={2} /></Field>
      <Field label="Detalles (opcional)"><textarea className={inputCls} rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      {err && <p role="alert" className="font-semibold text-rojo">⚠️ {err}</p>}
      <div className="grid grid-cols-2 gap-2"><Button variant="secondary" type="button" onClick={onCancel}>Volver</Button><Button>Guardar</Button></div>
    </form>
  )
}

function Notices({ cid, isRep }: { cid: number; isRep: boolean }) {
  const [list, err, reload] = useList<any>(`/api/communities/${cid}/notices`)
  const [f, setF] = useState({ title: '', body: '', category: 'general' })
  const [open, setOpen] = useState(false)
  const [e2, setE2] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setE2(null)
    try { await api(`/api/communities/${cid}/notices`, { body: f }); setF({ title: '', body: '', category: 'general' }); setOpen(false); reload() } catch (e) { setE2((e as Error).message) }
  }
  return (
    <div className="space-y-3">
      {isRep && (open ? (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border-2 border-bosque bg-papel p-4">
          <Field label="Título"><input className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} required minLength={3} /></Field>
          <Field label="Mensaje"><textarea className={inputCls} rows={4} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} required minLength={3} /></Field>
          <Field label="Tipo"><select className={inputCls} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            <option value="general">General</option><option value="clima">Clima</option><option value="reunion">Reunión</option><option value="siembra">Siembra</option></select></Field>
          {e2 && <p role="alert" className="font-semibold text-rojo">⚠️ {e2}</p>}
          <div className="grid grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Volver</Button><Button>Publicar</Button></div>
        </form>
      ) : <Button className="w-full" onClick={() => setOpen(true)}>📢 Publicar aviso</Button>)}
      {err ? <ErrorBox message={err} onRetry={reload} /> : !list ? <Loading /> : list.length === 0 ? <Notice>No hay avisos.</Notice> : list.map(n => (
        <Card key={n.id}>
          <h3 className="text-lg font-bold">{n.title}</h3>
          <p className="mt-1 whitespace-pre-line">{n.body}</p>
          <p className="mt-2 text-sm text-musgo">✔ {n.author} · {n.author_role} · {dateLong(n.created_at)}</p>
        </Card>
      ))}
    </div>
  )
}

const KINDS = [['helada', '❄️ Helada'], ['granizo', '🧊 Granizo'], ['lluvia_fuerte', '🌧️ Lluvia fuerte'], ['sequia', '🏜️ Sequía'], ['otro', '❔ Otro']]

function Reports({ cid, isRep }: { cid: number; isRep: boolean }) {
  const [list, err, reload] = useList<any>(`/api/communities/${cid}/observations`)
  const [kind, setKind] = useState<string | null>(null)
  const [desc, setDesc] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const send = async () => {
    try { const r = await api<{ label: string }>(`/api/communities/${cid}/observations`, { body: { kind, description: desc } }); setMsg(`✅ ${r.label}`); setKind(null); setDesc(''); reload() }
    catch (e) { setMsg(`⚠️ ${(e as Error).message}`) }
  }
  const review = async (id: number, status: string) => { await api(`/api/observations/${id}/review`, { body: { status } }); reload() }
  return (
    <div className="space-y-3">
      <Notice tone="warn">Los reportes son <strong>observaciones de la comunidad</strong>. No son avisos oficiales del SENAMHI.</Notice>
      {msg && <Notice tone={msg.startsWith('⚠️') ? 'warn' : 'ok'}>{msg}</Notice>}
      <Card>
        <h3 className="text-lg font-bold">¿Qué pasó hoy en su zona?</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {KINDS.map(([k, l]) => <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
            className={`min-h-14 rounded-xl border-2 text-lg font-semibold ${kind === k ? 'border-bosque bg-brote' : 'border-linea bg-papel'}`}>{l}</button>)}
        </div>
        {kind && <div className="mt-3 space-y-3">
          <Field label="Detalle (opcional)"><input className={inputCls} value={desc} onChange={e => setDesc(e.target.value)} maxLength={600} placeholder="Ej. granizo pequeño, 10 minutos" /></Field>
          <Button className="w-full" onClick={send}>Enviar reporte</Button>
        </div>}
      </Card>
      {err ? <ErrorBox message={err} onRetry={reload} /> : !list ? <Loading /> : list.map(o => (
        <Card key={o.id}>
          <div className="flex items-center justify-between gap-2"><h3 className="text-lg font-bold">{KINDS.find(k => k[0] === o.kind)?.[1]}</h3>
            <span className="text-sm font-semibold text-tierra">{o.review_status === 'confirmada' ? '✔ Confirmado por representante' : o.review_status === 'descartada' ? '✖ Descartado' : 'Sin revisar'}</span></div>
          {o.description && <p>{o.description}</p>}
          <p className="text-sm text-musgo">{o.author} · {dateLong(o.observed_at)}{o.channel !== 'web' ? ' · vía WhatsApp (simulador)' : ''}</p>
          <p className="text-sm text-musgo">{o.label}</p>
          {isRep && o.review_status === 'sin_revisar' && <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => review(o.id, 'confirmada')}>Confirmar</Button><Button variant="danger" onClick={() => review(o.id, 'descartada')}>Descartar</Button></div>}
        </Card>
      ))}
    </div>
  )
}

const ACTIONS: Record<string, string> = {
  reunion_creada: '📅 Reunión creada', reunion_cancelada: '❌ Reunión cancelada', asistencia: '✔ Asistencia', aviso_publicado: '📢 Aviso',
  observacion: '🧊 Reporte', observacion_revisada: '🔎 Reporte revisado', miembro_aprobado: '👥 Nuevo miembro', miembro_rechazado: '✖ Solicitud rechazada',
  solicitud_union: '🙋 Solicitud', recordatorio: '💬 Recordatorio', comunidad_aprobada: '✅ Comunidad aprobada', comunidad_solicitada: '📝 Comunidad solicitada', rol_cambiado: '⭐ Cambio de rol',
}

function History({ cid }: { cid: number }) {
  const [list, err, reload] = useList<any>(`/api/communities/${cid}/activity`)
  if (err) return <ErrorBox message={err} onRetry={reload} />
  if (!list) return <Loading />
  return (
    <ol className="space-y-2">
      {list.map((a, i) => (
        <li key={i} className="rounded-xl border border-linea bg-papel p-3">
          <div className="font-semibold">{ACTIONS[a.action] ?? a.action}</div>
          <div>{a.detail}</div><div className="text-sm text-musgo">{dateLong(a.created_at)}</div>
        </li>
      ))}
    </ol>
  )
}

function Requests({ cid }: { cid: number }) {
  const [list, err, reload] = useList<any>(`/api/communities/${cid}/requests`)
  const decide = async (id: number, d: string) => { await api(`/api/memberships/${id}/${d}`, { method: 'POST' }); reload() }
  if (err) return <ErrorBox message={err} onRetry={reload} />
  if (!list) return <Loading />
  if (list.length === 0) return <Notice>No hay solicitudes pendientes.</Notice>
  return (
    <div className="space-y-3">
      <p className="text-musgo">Apruebe solo a personas que conoce de su comunidad.</p>
      {list.map(r => (
        <Card key={r.id}>
          <div className="text-lg font-bold">{r.user_name}</div>
          <div className="text-musgo">Celular terminado en {r.phone_last4} · {dateLong(r.created_at)}</div>
          <div className="mt-2 grid grid-cols-2 gap-2"><Button onClick={() => decide(r.id, 'approve')}>Aprobar</Button><Button variant="danger" onClick={() => decide(r.id, 'reject')}>Rechazar</Button></div>
        </Card>
      ))}
    </div>
  )
}
