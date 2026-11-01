import { MapPin, User, X } from 'lucide-react'
import { useState } from 'react'
import { api, type Destination, type Trip, type TripDetail } from '../api'
import Modal from './Modal'
import { PlaceSearch } from '../places'

interface Props {
  open: boolean
  trip?: Trip | null
  defaultCurrency: string
  onClose: () => void
  onSaved: (t: TripDetail) => void
}

export default function TripForm({ open, trip, defaultCurrency, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(trip?.title ?? '')
  const [description, setDescription] = useState(trip?.description ?? '')
  const [start, setStart] = useState(trip?.start_date ?? '')
  const [end, setEnd] = useState(trip?.end_date ?? '')
  const [dests, setDests] = useState<Destination[]>(trip?.destinations ?? [])
  const [destInput, setDestInput] = useState('')
  const [travelers, setTravelers] = useState<string[]>(trip?.travelers ?? [])
  const [travelerInput, setTravelerInput] = useState('')
  const [currency, setCurrency] = useState(trip?.currency ?? defaultCurrency)
  const [budget, setBudget] = useState(trip?.budget?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const addDest = () => {
    const n = destInput.trim()
    if (n && !dests.some((d) => d.name.toLowerCase() === n.toLowerCase())) setDests([...dests, { name: n }])
    setDestInput('')
  }

  const addTraveler = () => {
    const n = travelerInput.trim()
    if (n && !travelers.some((t) => t.toLowerCase() === n.toLowerCase())) setTravelers([...travelers, n])
    setTravelerInput('')
  }

  const save = async () => {
    setError('')
    const allTravelers = travelerInput.trim() && !travelers.some((t) => t.toLowerCase() === travelerInput.trim().toLowerCase())
      ? [...travelers, travelerInput.trim()]
      : travelers
    const allDests = destInput.trim() ? [...dests, { name: destInput.trim() }] : dests
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      start_date: start,
      end_date: end || start,
      destinations: allDests,
      travelers: allTravelers,
      currency: currency.toUpperCase(),
      budget: budget ? Number(budget.replace(',', '.')) : null,
    }
    if (!payload.title || !payload.start_date) {
      setError('Titel und Startdatum sind Pflicht.')
      return
    }
    setBusy(true)
    try {
      const t = trip ? await api.updateTrip(trip.id, payload) : await api.createTrip(payload)
      onSaved(t)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={trip ? 'Reise bearbeiten' : 'Neue Reise'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{trip ? 'Speichern' : 'Reise anlegen'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Titel</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Sommer in Portugal" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Von</label>
            <input type="date" className="input" value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value) }} />
          </div>
          <div>
            <label className="label">Bis</label>
            <input type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Ziele</label>
          <div className="flex flex-wrap gap-2">
            {dests.map((d) => (
              <span key={d.name} className="chip bg-brand-50 py-1 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                <MapPin size={12} /> {d.name}
                <button onClick={() => setDests(dests.filter((x) => x !== d))} aria-label="Entfernen"><X size={12} /></button>
              </span>
            ))}
          </div>
          <div className="mt-2">
            <PlaceSearch
              value={destInput}
              onChange={setDestInput}
              placeholder="Stadt oder Region suchen"
              onSelect={(r) => {
                if (!dests.some((d) => d.name.toLowerCase() === r.name.toLowerCase()))
                  setDests([...dests, { name: r.name, lat: r.lat, lon: r.lon, country_code: r.country_code }])
                setDestInput('')
              }}
              onSubmitText={() => addDest()}
            />
          </div>
        </div>
        <div>
          <label className="label">Reisende</label>
          <div className="flex flex-wrap gap-2">
            {travelers.map((t) => (
              <span key={t} className="chip bg-slate-100 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <User size={12} /> {t}
                <button onClick={() => setTravelers(travelers.filter((x) => x !== t))} aria-label="Entfernen"><X size={12} /></button>
              </span>
            ))}
          </div>
          <input
            className="input mt-2"
            value={travelerInput}
            onChange={(e) => setTravelerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTraveler() } }}
            onBlur={addTraveler}
            placeholder="Name, mit Enter hinzufügen"
          />
        </div>
        <div>
          <label className="label">Beschreibung</label>
          <textarea className="input min-h-[72px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Budget</label>
            <input className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="label">Währung</label>
            <input className="input uppercase" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
