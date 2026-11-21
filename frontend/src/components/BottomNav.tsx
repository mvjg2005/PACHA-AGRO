const ITEMS = [
  { path: '', label: 'Inicio', d: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { path: 'sembrar', label: 'Sembrar', d: 'M12 21v-9m0 0c-4 0-7-3-7-7 4 0 7 3 7 7zm0-2c0-4 3-7 7-7 0 4-3 7-7 7z' },
  { path: 'clima', label: 'Clima', d: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18z' },
  { path: 'comunidad', label: 'Comunidad', d: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5m-1-4.6c1-.3 2-.4 3-.4 3 0 6 2 6 5' },
  { path: 'aprender', label: 'Aprender', d: 'M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zm16 0h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z' },
]

export function BottomNav({ current, desktop = false }: { current: string; desktop?: boolean }) {
  return (
    <nav aria-label="Navegación principal" className={desktop ? 'site-nav-desktop' : 'site-nav-mobile fixed left-0 right-auto bottom-0 z-20 w-full border-t border-linea bg-papel pb-[env(safe-area-inset-bottom)]'}>
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {ITEMS.map(it => {
          const active = current === it.path
          return (
            <li key={it.label}>
              <a href={`#/${it.path}`} aria-current={active ? 'page' : undefined}
                 className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.74rem] font-semibold tracking-tight ${active ? 'text-bosque' : 'text-musgo'}`}>
                <span className={`flex h-8 w-12 items-center justify-center rounded-full ${active ? 'bg-brote' : ''}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={it.d} /></svg>
                </span>
                {it.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
