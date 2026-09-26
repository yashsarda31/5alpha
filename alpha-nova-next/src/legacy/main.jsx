import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { inject } from '@vercel/analytics'
import { createVercelBeforeSend, shouldEnableVercelAnalytics } from './lib/vercelAnalytics.js'

// The official SDK tracks the landing page and SPA history changes, including
// React Router navigation. Inject once, before the router can redirect '/'.
if (shouldEnableVercelAnalytics({ production: import.meta.env.PROD, hostname: window.location.hostname })) {
  inject({ mode: 'production', beforeSend: createVercelBeforeSend(window.location.href), framework: 'react' })
}

// Chrome fires beforeinstallprompt ONCE, often before React mounts the
// sidebar — a listener added in a component's useEffect loses that race and
// the Install App button never appears (Android users "can't download").
// Capture it at module scope and let InstallApp pick it up from window.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__anInstallPrompt = e
  window.dispatchEvent(new Event('an-install-ready'))
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registered after load so it never competes with first-paint resources.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
