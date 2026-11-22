import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './lib/store'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppProvider><App /></AppProvider></StrictMode>,
)

// «Instalar app»: el navegador avisa que se puede instalar; se guarda para mostrar el botón después.
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); (window as unknown as { __agbInstall?: Event }).__agbInstall = e; window.dispatchEvent(new Event('agb-installable')) })

// Modo sin conexión (solo en la versión compilada).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* sin modo sin conexión */ }) })
}
