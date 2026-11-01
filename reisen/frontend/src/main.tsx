import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { api, type AppInfo } from './api'
import './index.css'
import TripDetail from './pages/TripDetail'
import TripList from './pages/TripList'

// HashRouter: funktioniert hinter HA Ingress ohne Kenntnis des Basis-Pfads
function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => { api.info().then(setInfo).catch(() => {}) }, [])
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<TripList info={info} />} />
        <Route path="/trip/:id" element={<TripDetail info={info} />} />
        <Route path="/trip/:id/:tab" element={<TripDetail info={info} />} />
        <Route path="/trip/:id/:tab/:day" element={<TripDetail info={info} />} />
        <Route path="*" element={<TripList info={info} />} />
      </Routes>
    </HashRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
