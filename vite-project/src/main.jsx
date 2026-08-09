import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true)
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) {
        return
      }

      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload()
        }, { once: true })
      }

      // Poll for updates so installed PWAs pick up fresh deployments quickly.
      setInterval(() => {
        registration.update()
      }, 60 * 1000)
    },
  })
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister()
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
