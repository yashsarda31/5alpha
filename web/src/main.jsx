import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
