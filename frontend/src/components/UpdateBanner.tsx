import { useEffect, useState } from 'react'

/** Si la web se actualizó mientras la pestaña estaba abierta, ofrece recargar (evita usar una versión vieja). */
export function UpdateBanner() {
  const [stale, setStale] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    const current = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')
    if (!current) return
    const check = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text()
        const latest = html.match(/\/assets\/index-[^"']+\.js/)?.[0]
        if (latest && latest !== current) setStale(true)
      } catch { /* sin conexión: se revisa después */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    const t = window.setInterval(check, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  if (!stale) return null
  return (
    <div role="status" className="border-b-2 border-[var(--color-primary)] bg-[var(--color-surface-high)] px-4 py-2 text-center text-sm font-semibold" data-testid="update-banner">
      Hay una versión nueva de PACHA-AGRO. <button type="button" className="underline" onClick={() => window.location.reload()}>Actualizar</button>
    </div>
  )
}
