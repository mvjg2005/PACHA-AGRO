import { useEffect, useState } from 'react'
import { Bulletin } from '../components/Bulletin'
import { Icon } from '../components/Icon'
import { MunicipalitySelect } from '../components/SiteChrome'
import { Button, Notice, PageTitle } from '../components/ui'
import { offlineReady, saveForOffline, savedInfo, type SavedInfo } from '../lib/offline'
import { useApp } from '../lib/store'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const getInstall = () => (window as unknown as { __agbInstall?: InstallEvent }).__agbInstall
const installed = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const when = (iso: string) => new Date(iso).toLocaleString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Sin internet: guardar la semana, instalar la app y enviar el boletín por SMS o radio. */
export default function Offline() {
  const { municipalityId, findMunicipality, locationQuery } = useApp()
  const m = findMunicipality(municipalityId)
  const [online, setOnline] = useState(navigator.onLine)
  const [saved, setSaved] = useState<SavedInfo | null>(savedInfo)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [canInstall, setCanInstall] = useState(!!getInstall())
  const [isInstalled, setIsInstalled] = useState(installed())

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false), inst = () => setCanInstall(!!getInstall())
    const done = () => { setIsInstalled(true); setCanInstall(false) }
    window.addEventListener('online', on); window.addEventListener('offline', off)
    window.addEventListener('agb-installable', inst); window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('agb-installable', inst); window.removeEventListener('appinstalled', done) }
  }, [])

  const save = async () => {
    if (!m) return
    setBusy(true); setMsg(null)
    const r = await saveForOffline(m.id, m.name, locationQuery(m.id))
    setBusy(false); setSaved(savedInfo())
    if (r.ok === 0) setMsg({ ok: false, text: 'No se pudo guardar: revise que tenga señal e intente de nuevo.' })
    else if (!offlineReady()) setMsg({ ok: true, text: 'Datos descargados. Para que queden disponibles sin internet, recargue esta página una vez con señal y vuelva a tocar «Guardar».' })
    else setMsg({ ok: true, text: `Listo: la semana de ${m.name} quedó guardada (${r.ok} de ${r.total} elementos). Ya puede verla sin internet.` })
  }
  const install = async () => {
    const e = getInstall()
    if (!e) return
    await e.prompt()
    const c = await e.userChoice
    if (c.outcome === 'accepted') setIsInstalled(true)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="offline-page">
      <PageTitle title="Sin internet" subtitle="Para el campo: guarde el pronóstico de la semana cuando tenga señal, instale la app y envíe el boletín por SMS." />
      <p className={`flex items-center gap-2 rounded-xl px-4 py-3 font-semibold ${online ? 'bg-[#f1f6ee] text-[#1f5531]' : 'bg-[#fbf6e9] text-[#5f4500]'}`} role="status">
        <Icon name={online ? 'signal' : 'offline'} size={20} />{online ? 'Ahora tiene conexión: buen momento para guardar la semana.' : 'Sin conexión: puede ver lo que guardó antes.'}
      </p>

      <section className="panel space-y-4" aria-labelledby="save-title">
        <h2 id="save-title" className="font-display text-[1.4rem] font-semibold text-[var(--color-primary)]">1. Guardar la semana en el celular</h2>
        <p className="text-sm">Se guardan el pronóstico de 7 días, las noches peligrosas para el ganado, la alerta de año seco y el boletín. Sin señal, la app los muestra con la fecha en que se guardaron, y <strong>Pacha IA le responde con esos datos y se los lee en voz alta</strong>.</p>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Municipio</span>
          <span className="block rounded-md border border-[#bdb6a6] bg-white px-3 py-2.5"><MunicipalitySelect className="w-full" /></span></label>
        <Button onClick={save} disabled={!m || busy || !online} className="w-full sm:w-auto" data-testid="save-offline">{busy ? 'Guardando…' : 'Guardar para usar sin internet'}</Button>
        {msg && <Notice tone={msg.ok ? 'ok' : 'warn'}>{msg.text}</Notice>}
        {saved && <div className="rounded-xl bg-[var(--color-surface-low)] p-4 text-sm" data-testid="offline-saved">
          <p><strong>Guardado:</strong> {saved.name}, el {when(saved.at)}</p>
          <p className="text-[var(--color-on-variant)]">El pronóstico sirve para los días que siguen; vuelva a guardar cuando tenga señal.</p>
          <div className="mt-2 flex flex-wrap gap-2"><a className="btn-soft !w-auto !min-h-10" href="#/clima">Ver clima guardado</a><a className="btn-soft !w-auto !min-h-10" href="#/ganado">Ver ganado</a></div>
        </div>}
      </section>

      <section className="panel space-y-3" aria-labelledby="install-title">
        <h2 id="install-title" className="font-display text-[1.4rem] font-semibold text-[var(--color-primary)]">2. Instalar PACHA-AGRO en el celular</h2>
        {isInstalled ? <p className="font-semibold text-[#1f5531]">Ya está instalada: ábrala desde el ícono de su pantalla de inicio, también sin internet.</p> : <>
          <p className="text-sm">Queda como una aplicación con su ícono y se abre sin internet. Ocupa muy poco espacio.</p>
          {canInstall ? <Button onClick={install} data-testid="install-app"><Icon name="plus" size={18} className="mr-1" />Instalar app</Button> : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li><strong>Android (Chrome):</strong> toque <strong>⋮</strong> arriba a la derecha → <strong>«Agregar a la pantalla principal»</strong> o «Instalar app».</li>
              <li><strong>iPhone (Safari):</strong> toque <strong>Compartir</strong> → <strong>«Agregar a inicio»</strong>.</li>
            </ul>
          )}
        </>}
      </section>

      {m ? <Bulletin municipalityId={m.id} /> : <Notice tone="info">Elija un municipio para preparar el boletín.</Notice>}

      <section className="panel space-y-2" aria-labelledby="tips-title">
        <h2 id="tips-title" className="font-display text-[1.4rem] font-semibold text-[var(--color-primary)]">Consejos para ahorrar batería y saldo</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Guarde la semana cuando pase por un lugar con señal (pueblo, feria, cerro) y luego apague los datos.</li>
          <li>Un SMS gasta mucho menos batería y saldo que abrir internet: pida a un familiar que le envíe el boletín.</li>
          <li>Baje el brillo de la pantalla y active el ahorro de batería.</li>
          <li>Los avisos oficiales del SENAMHI también se difunden por radio: escuche la radio de su zona.</li>
        </ul>
      </section>
    </div>
  )
}
