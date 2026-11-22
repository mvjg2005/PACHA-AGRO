import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { MunicipalitySelect } from './SiteChrome'
import { Button, ErrorBox, Loading, Notice } from './ui'

export interface PostT {
  id: number; parent_id: number | null; text: string; kind: string; kind_label: string; author: string; author_role: string | null
  municipality_id: string; municipality_name: string | null; department_name: string | null; created_at: string
  useful: number; replies: number; useful_by_me: boolean; reported_by_me: boolean; can_delete: boolean
}
type Scope = 'todo' | 'departamento' | 'municipio'

const KINDS: [string, string][] = [['general', 'Comentario'], ['pregunta', 'Pregunta'], ['clima', 'Clima'], ['ganado', 'Ganado'], ['siembra', 'Siembra'], ['venta', 'Compra y venta']]

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })
}

/** Muro del campo: publicaciones abiertas que ve todo el mundo, con respuestas y «Me sirve». */
export function Wall() {
  const { user, municipalityId, findMunicipality } = useApp()
  const m = findMunicipality(municipalityId)
  const [scope, setScope] = useState<Scope>('todo')
  const [items, setItems] = useState<PostT[] | null>(null)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const query = (before?: number) => {
    const p = new URLSearchParams()
    if (scope === 'municipio' && m) p.set('municipality_id', m.id)
    if (scope === 'departamento' && m) p.set('department_id', m.department_id)
    if (before) p.set('before_id', String(before))
    return `/api/muro?${p}`
  }
  const load = () => { setErr(null); setItems(null); api<{ items: PostT[]; has_more: boolean }>(query()).then(d => { setItems(d.items); setMore(d.has_more) }).catch(e => setErr(e.message)) }
  const loadMore = () => {
    if (!items?.length) return
    api<{ items: PostT[]; has_more: boolean }>(query(items[items.length - 1].id)).then(d => { setItems([...items, ...d.items]); setMore(d.has_more) }).catch(e => setErr(e.message))
  }
  useEffect(load, [scope, m?.id])

  const update = (p: PostT) => setItems(list => list?.map(x => x.id === p.id ? p : x) ?? null)
  const remove = (id: number) => setItems(list => list?.filter(x => x.id !== id) ?? null)

  return (
    <section className="space-y-4" aria-labelledby="wall-title" data-testid="wall">
      <div>
        <p className="eyebrow">Red del campo</p>
        <h2 id="wall-title" className="section-title">Muro del campo</h2>
        <p className="mt-1 text-[var(--color-on-variant)]">Lo que pasa en el campo, contado por su gente: preguntas, heladas, ganado, siembra y ventas. Todos pueden verlo.</p>
      </div>

      {user ? <Composer onPosted={p => setItems(list => [p, ...(list ?? [])])} /> : (
        <div className="rounded-md border border-linea bg-white p-4">
          <p className="font-semibold">Para publicar, responder o marcar «Me sirve» necesita una cuenta gratuita.</p>
          <div className="mt-3 flex flex-wrap gap-2"><a className="btn-soft !w-auto" href="#/ingresar">Ingresar</a><a className="btn-soft !w-auto" href="#/registro">Crear cuenta</a></div>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Qué publicaciones ver">
        {([['todo', 'Todo Bolivia'], ['departamento', m ? m.department_name : 'Mi departamento'], ['municipio', m ? m.name : 'Mi municipio']] as [Scope, string][]).map(([k, l]) => (
          <button key={k} type="button" disabled={k !== 'todo' && !m} aria-pressed={scope === k} onClick={() => setScope(k)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold disabled:opacity-50 ${scope === k ? 'border-bosque bg-bosque text-white' : 'border-linea bg-white text-bosque'}`}>{l}</button>
        ))}
      </div>

      {err ? <ErrorBox message={err} onRetry={load} /> : !items ? <Loading /> : items.length === 0 ? (
        <Notice>Todavía no hay publicaciones aquí. {user ? '¡Sea el primero en contar cómo está su campo!' : 'Ingrese y sea el primero en publicar.'}</Notice>
      ) : (
        <ul className="space-y-3">
          {items.map(p => <li key={p.id}><PostCard p={p} onChange={update} onDelete={remove} /></li>)}
        </ul>
      )}
      {more && <Button variant="secondary" className="w-full" onClick={loadMore}>Ver más publicaciones</Button>}
    </section>
  )
}

function Composer({ onPosted }: { onPosted: (p: PostT) => void }) {
  const { municipalityId, findMunicipality } = useApp()
  const m = findMunicipality(municipalityId)
  const [kind, setKind] = useState('general')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!m) return
    setBusy(true); setErr(null)
    try { onPosted(await api<PostT>('/api/muro', { body: { text, kind, municipality_id: m.id } })); setText(''); setKind('general') }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-bosque bg-white p-4" data-testid="wall-composer">
      <label htmlFor="wall-text" className="block font-semibold">¿Qué está pasando en su campo?</label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Tema">
        {KINDS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={`min-h-10 rounded-full border px-3 text-sm font-semibold ${kind === k ? 'border-bosque bg-[#e3efe2] text-bosque' : 'border-linea bg-white text-[var(--color-on-variant)]'}`}>{l}</button>
        ))}
      </div>
      <textarea id="wall-text" className="w-full rounded-md border border-[#bdb6a6] bg-white px-3 py-2.5 text-base" rows={3} maxLength={800} required minLength={3}
        placeholder="Ejemplo: Anoche cayó helada fuerte en Huayñacagua. ¿Cómo están sus ovejas?" value={text} onChange={e => setText(e.target.value)} />
      <p className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-on-variant)]">Se publica desde: {m ? <strong>{m.name}</strong> : <span className="rounded-md border border-[#bdb6a6] bg-white px-2 py-1"><MunicipalitySelect /></span>}</p>
      <p className="text-sm text-[var(--color-on-variant)]">Lo verá cualquier persona. Se muestra su nombre corto y su municipio, nunca su celular.</p>
      {err && <p role="alert" className="font-semibold text-rojo">{err}</p>}
      <Button className="w-full sm:w-auto" disabled={busy || !m || text.trim().length < 3}>{busy ? 'Publicando…' : 'Publicar'}</Button>
    </form>
  )
}

function PostCard({ p, onChange, onDelete, isReply = false }: { p: PostT; onChange: (p: PostT) => void; onDelete: (id: number) => void; isReply?: boolean }) {
  const { user } = useApp()
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const act = async (fn: () => Promise<void>) => { setMsg(null); try { await fn() } catch (e) { setMsg((e as Error).message) } }
  const useful = () => act(async () => onChange(await api<PostT>(`/api/muro/${p.id}/me-sirve`, { method: 'POST' })))
  const report = () => act(async () => {
    if (!confirm('¿Reportar esta publicación por ser falsa u ofensiva?')) return
    const r = await api<{ hidden: boolean; message: string }>(`/api/muro/${p.id}/reportar`, { method: 'POST' })
    if (r.hidden) onDelete(p.id); else { setMsg(r.message); onChange({ ...p, reported_by_me: true }) }
  })
  const del = () => act(async () => { if (!confirm('¿Borrar esta publicación?')) return; await api(`/api/muro/${p.id}`, { method: 'DELETE' }); onDelete(p.id) })
  return (
    <article className={`rounded-md border border-linea bg-white ${isReply ? 'p-3' : 'p-4'}`} data-testid="wall-post">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong className="text-bosque">{p.author}</strong>
        {p.author_role === 'admin' && <span className="rounded-full bg-[#e3efe2] px-2 text-xs font-bold text-bosque">Equipo PACHA-AGRO</span>}
        <span className="text-sm text-[var(--color-on-variant)]">{p.municipality_name}{p.department_name ? `, ${p.department_name}` : ''} · {ago(p.created_at)}</span>
        {!isReply && p.kind !== 'general' && <span className="ml-auto rounded-full bg-[#fbf6e9] px-2.5 py-0.5 text-xs font-bold text-[#5f4500]">{p.kind_label}</span>}
      </header>
      <p className="mt-2 whitespace-pre-wrap break-words text-[1.05rem] leading-relaxed">{p.text}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <button type="button" disabled={!user} onClick={useful} aria-pressed={p.useful_by_me}
          className={`min-h-10 rounded-full border px-3 font-semibold disabled:opacity-60 ${p.useful_by_me ? 'border-bosque bg-[#e3efe2] text-bosque' : 'border-linea text-[var(--color-on-variant)]'}`}>Me sirve{p.useful ? ` · ${p.useful}` : ''}</button>
        {!isReply && <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="min-h-10 rounded-full border border-linea px-3 font-semibold text-bosque">
          {open ? 'Ocultar respuestas' : p.replies ? `Ver ${p.replies} ${p.replies === 1 ? 'respuesta' : 'respuestas'}` : 'Responder'}</button>}
        {user && !p.can_delete && !p.reported_by_me && <button type="button" onClick={report} className="min-h-10 px-2 text-[var(--color-on-variant)] underline">Reportar</button>}
        {p.can_delete && <button type="button" onClick={del} className="min-h-10 px-2 text-rojo underline">Borrar</button>}
      </div>
      {msg && <p role="status" className="mt-2 text-sm font-semibold">{msg}</p>}
      {open && <Replies post={p} onCount={n => onChange({ ...p, replies: n })} />}
    </article>
  )
}

function Replies({ post, onCount }: { post: PostT; onCount: (n: number) => void }) {
  const { user } = useApp()
  const [list, setList] = useState<PostT[] | null>(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api<PostT[]>(`/api/muro/${post.id}/respuestas`).then(setList).catch(e => setErr(e.message)) }, [post.id])
  const set = (l: PostT[]) => { setList(l); onCount(l.length) }
  const send = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    try {
      const r = await api<PostT>('/api/muro', { body: { text, kind: 'general', municipality_id: post.municipality_id, parent_id: post.id } })
      set([...(list ?? []), r]); setText('')
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div className="mt-3 space-y-2 border-l-2 border-[#e3efe2] pl-3">
      {err && <p role="alert" className="text-sm font-semibold text-rojo">{err}</p>}
      {!list ? <Loading /> : list.map(r => <PostCard key={r.id} p={r} isReply onChange={x => set(list.map(y => y.id === x.id ? x : y))} onDelete={id => set(list.filter(y => y.id !== id))} />)}
      {user ? (
        <form onSubmit={send} className="flex gap-2">
          <label htmlFor={`reply-${post.id}`} className="sr-only">Su respuesta</label>
          <input id={`reply-${post.id}`} className="min-h-11 min-w-0 flex-1 rounded-md border border-[#bdb6a6] bg-white px-3" maxLength={800} minLength={3} required
            placeholder="Escriba una respuesta…" value={text} onChange={e => setText(e.target.value)} />
          <Button className="!min-h-11 !px-4" disabled={text.trim().length < 3}>Enviar</Button>
        </form>
      ) : <p className="text-sm"><a className="font-semibold underline" href="#/ingresar">Ingrese</a> para responder.</p>}
    </div>
  )
}
