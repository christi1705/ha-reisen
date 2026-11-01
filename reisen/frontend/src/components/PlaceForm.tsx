import { ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api, type Place, type PlaceCategory, type TripDetail } from '../api'
import { CATEGORY_ORDER, PLACE_CATEGORIES, PlaceSearch, dayColor, tripCenter } from '../places'
import { cls, eachDay, fmtDayHeader } from '../util'
import Modal from './Modal'

interface Props {
  trip: TripDetail
  place: Place
  onClose: () => void
  onSaved: () => void
}

export default function PlaceForm({ trip, place, onClose, onSaved }: Props) {
  const [name, setName] = useState(place.name)
  const [address, setAddress] = useState(place.address ?? '')
  const [coords, setCoords] = useState<{ lat: number | null; lon: number | null }>({ lat: place.lat, lon: place.lon })
  const [category, setCategory] = useState<PlaceCategory>(place.category)
  const [day, setDay] = useState(place.day ?? '')
  const [time, setTime] = useState(place.time ?? '')
  const [url, setUrl] = useState(place.url ?? '')
  const [notes, setNotes] = useState(place.notes ?? '')
  const [relocate, setRelocate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const days = eachDay(trip.start_date, trip.end_date)

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await api.updatePlace(place.id, {
        name: name.trim() || place.name,
        address: address.trim() || null,
        lat: coords.lat,
        lon: coords.lon,
        category,
        day: day || null,
        time: time || null,
        url: url.trim() || null,
        notes: notes.trim() || null,
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`„${place.name}“ entfernen?`)) return
    await api.deletePlace(place.id)
    onSaved()
  }

  const mapsUrl = coords.lat != null ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}` : null

  return (
    <Modal
      open
      onClose={onClose}
      title="Ort bearbeiten"
      footer={
        <>
          <button className="btn-danger mr-auto" onClick={remove}><Trash2 size={16} /> Entfernen</button>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={busy}>Speichern</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Adresse</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          <div className="mt-1 flex flex-wrap items-center gap-3 px-1 text-xs text-slate-500">
            {coords.lat != null ? <span>📍 {coords.lat.toFixed(5)}, {coords.lon!.toFixed(5)}</span> : <span className="text-amber-600">Keine Koordinaten – erscheint nicht auf der Karte</span>}
            {mapsUrl && <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={mapsUrl} target="_blank" rel="noreferrer">In Google Maps öffnen <ExternalLink size={11} /></a>}
          </div>
        </div>
        <div>
          <label className="label">Position neu suchen</label>
          <PlaceSearch
            value={relocate}
            onChange={setRelocate}
            near={tripCenter([coords, ...trip.places])}
            placeholder="Anderen Ort / Adresse suchen"
            onSelect={(r) => { setCoords({ lat: r.lat, lon: r.lon }); setAddress(r.address); setRelocate(r.name) }}
          />
        </div>

        <div>
          <label className="label">Kategorie</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ORDER.map((c) => {
              const C = PLACE_CATEGORIES[c]
              const active = c === category
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cls('chip gap-1.5 py-1 transition', active ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300')}
                  style={active ? { background: C.color } : undefined}
                >
                  <C.icon size={12} /> {C.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="label">Tag</label>
            <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">Ungeplant</option>
              {days.map((d, i) => <option key={d} value={d}>Tag {i + 1} – {fmtDayHeader(d)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Uhrzeit</label>
            <input type="time" className="input w-32" value={time} onChange={(e) => setTime(e.target.value)} disabled={!day} />
          </div>
        </div>
        {day && <div className="h-1 rounded-full" style={{ background: dayColor(days.indexOf(day)) }} />}

        <div>
          <label className="label">Link</label>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <label className="label">Notizen</label>
          <textarea className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Öffnungszeiten, Tipps, Tickets …" />
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
