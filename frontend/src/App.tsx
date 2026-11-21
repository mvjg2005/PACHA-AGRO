import { lazy, Suspense, useEffect, useState } from 'react'
import { BottomNav } from './components/BottomNav'
import { LogoMark } from './components/Logo'
import { Loading } from './components/ui'
import { useRoute } from './lib/router'
import { useApp } from './lib/store'
import Home from './pages/Home'
import Sow from './pages/Sow'

const Compare = lazy(() => import('./pages/Compare'))
const Weather = lazy(() => import('./pages/Weather'))
const CommunityHome = lazy(() => import('./pages/Community'))
const CommunityDetail = lazy(() => import('./pages/CommunityDetail'))
const WhatsApp = lazy(() => import('./pages/WhatsApp'))
const Learn = lazy(() => import('./pages/Learn'))
const Admin = lazy(() => import('./pages/Admin'))
const Notices = lazy(() => import('./pages/Notices'))
const Coverage = lazy(() => import('./pages/Coverage'))
const Legal = lazy(() => import('./pages/Legal'))
const Auth = lazy(() => import('./pages/Auth').then(m => ({ default: m.Login })))
const Register = lazy(() => import('./pages/Auth').then(m => ({ default: m.Register })))
const Profile = lazy(() => import('./pages/Auth').then(m => ({ default: m.Profile })))
const ForcedPassword = lazy(() => import('./pages/Auth').then(m => ({ default: () => <m.ChangePassword forced /> })))

function Page({ parts }: { parts: string[] }) {
  const [a, b, c] = parts
  switch (a) {
    case undefined: return <Home />
    case 'escritorio':
    case 'sembrar': return (
      <>
        <nav className="section-nav" aria-label="Herramientas de siembra">
          <a href="#/sembrar" aria-current={a === 'sembrar' && !b ? 'page' : undefined}>Consulta de siembra</a>
          <a href="#/sembrar/comparar" aria-current={a === 'escritorio' || b === 'comparar' ? 'page' : undefined}>Comparar condiciones</a>
        </nav>
        {a === 'escritorio' || b === 'comparar' ? <Compare /> : <Sow />}
      </>
    )
    case 'clima': return <Weather />
    case 'comunidad': return b && /^\d+$/.test(b) ? <CommunityDetail id={Number(b)} /> : <CommunityHome />
    case 'whatsapp': return <WhatsApp />
    case 'aprender': return <Learn lessonId={b} itemId={c} />
    case 'avisos': return <Notices />
    case 'cobertura': return <Coverage />
    case 'privacidad': return <Legal doc="privacidad" />
    case 'terminos': return <Legal doc="terminos" />
    case 'ingresar': return <Auth />
    case 'registro': return <Register />
    case 'perfil': return <Profile />
    case 'admin': return <Admin />
    default: return <div className="py-10 text-center"><p className="text-xl">Esta página no existe.</p><a className="mt-3 inline-block font-semibold text-bosque underline" href="#/">Volver al inicio</a></div>
  }
}

/** Aviso visible cuando no hay conexión o se muestran datos guardados. */
function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  useEffect(() => {
    const on = () => { setOnline(true); setCachedAt(null) }
    const off = () => setOnline(false)
    const cached = (e: Event) => setCachedAt((e as CustomEvent<string | null>).detail ?? '')
    window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener('agb-offline', cached)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('agb-offline', cached) }
  }, [])
  if (online && cachedAt === null) return null
  const when = cachedAt ? new Date(cachedAt).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }) : null
  return (
    <div role="status" data-testid="offline-banner" className="border-b-2 border-ocre bg-sol-50 px-4 py-2 text-center font-semibold text-sol-ink">
      📶 Sin conexión.{cachedAt !== null ? ` Mostrando datos guardados${when ? ` (${when})` : ''}` : ' Se mostrarán los últimos datos guardados.'}
    </div>
  )
}

export default function App() {
  const parts = useRoute()
  const { user } = useApp()
  const section = parts[0] ?? ''
  // Avisos se abre desde Clima; cobertura y páginas legales no tienen pestaña propia.
  const nav = section === 'escritorio' ? 'sembrar' : section === 'avisos' ? 'clima' : section
  const learnList = section === 'aprender' && (!parts[1] || (parts[1] === 'biblioteca' && !parts[2]))
  const wide = ['', 'clima', 'escritorio'].includes(section) || parts[1] === 'comparar' || learnList
  const [layoutWidth, setLayoutWidth] = useState(() => document.documentElement.clientWidth)
  useEffect(() => {
    const updateLayoutWidth = () => setLayoutWidth(document.documentElement.clientWidth)
    updateLayoutWidth()
    window.addEventListener('resize', updateLayoutWidth)
    return () => window.removeEventListener('resize', updateLayoutWidth)
  }, [])
  const scrollbarGutter = Math.max(0, window.innerWidth - layoutWidth)
  return (
    <div className="min-h-screen pb-nav">
      <a href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus() }} className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:bg-papel focus:p-2">Ir al contenido</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a href="#/" className="flex items-center gap-2" aria-label="AgroBolivia, inicio">
            <LogoMark size={36} /><span className="site-brand">AgroBolivia</span>
          </a>
          <BottomNav current={nav} desktop viewportWidth={layoutWidth} />
          <a href={user ? '#/perfil' : '#/ingresar'} style={{ marginRight: scrollbarGutter }} className="flex min-h-12 items-center rounded-full border-2 border-linea px-3 font-semibold text-bosque">
            {user ? `${user.full_name.split(' ')[0]}` : 'Ingresar'}
          </a>
        </div>
      </header>
      <OfflineBanner />
      <main id="main" tabIndex={-1} className={`site-main ${wide ? 'site-main-wide' : ''}`}>
        <Suspense fallback={<Loading />}>{user?.must_change_password ? <ForcedPassword /> : <Page parts={parts} />}</Suspense>
      </main>
      <BottomNav current={nav} viewportWidth={layoutWidth} />
    </div>
  )
}
