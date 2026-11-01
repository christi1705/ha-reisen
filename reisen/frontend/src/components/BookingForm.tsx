import { ArrowLeft, ArrowRightLeft, MapPin, Paperclip, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, type Attachment, type Booking, type BookingInput, type BookingStatus, type BookingType, type Location, type TripDetail } from '../api'
import { BOOKING_TYPES, STATUS, TYPE_ORDER } from '../bookingTypes'
import { browserTz, cls, fmtSize } from '../util'
import { PlaceSearch, tripCenter } from '../places'
import { AirlineInput, AirportInput } from './Autocomplete'
import Modal from './Modal'

interface Props {
  trip: TripDetail
  booking?: Booking | null
  initialType?: BookingType
  onClose: () => void
  onSaved: () => void
  onPreview: (a: Attachment) => void
}

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
  } catch {
    return []
  }
})()

const emptyLoc = (): Location => ({ name: '' })
const timePart = (v?: string | null) => (v && v.length >= 16 && v.slice(11, 16) !== '00:00' ? v.slice(11, 16) : '')
const join = (d: string, t: string) => (d ? `${d}T${t || '00:00'}` : null)

export default function BookingForm({ trip, booking, initialType, onClose, onSaved, onPreview }: Props) {
  const [type, setType] = useState<BookingType | null>(booking?.type ?? initialType ?? null)
  const cfg = type ? BOOKING_TYPES[type] : null
  const defaultTz = booking?.start_tz ?? browserTz()

  const [title, setTitle] = useState(booking?.title ?? '')
  const [titleTouched, setTitleTouched] = useState(!!booking)
  const [provider, setProvider] = useState(booking?.provider ?? '')
  const [code, setCode] = useState(booking?.confirmation_code ?? '')
  const [status, setStatus] = useState<BookingStatus>(booking?.status ?? 'booked')
  const [startDate, setStartDate] = useState(booking?.start_at?.slice(0, 10) ?? trip.start_date)
  const [startTime, setStartTime] = useState(timePart(booking?.start_at))
  const [startTz, setStartTz] = useState(booking?.start_tz ?? defaultTz)
  const [endDate, setEndDate] = useState(booking?.end_at?.slice(0, 10) ?? '')
  const [endTime, setEndTime] = useState(timePart(booking?.end_at))
  const [endTz, setEndTz] = useState(booking?.end_tz ?? defaultTz)
  const [from, setFrom] = useState<Location>(booking?.from_location ?? emptyLoc())
  const [to, setTo] = useState<Location>(booking?.to_location ?? emptyLoc())
  const [cost, setCost] = useState(booking?.cost?.toString().replace('.', ',') ?? '')
  const [costCur, setCostCur] = useState(booking?.cost_currency ?? trip.currency)
  const [details, setDetails] = useState<Record<string, string>>(booking?.details ?? {})
  const [notes, setNotes] = useState(booking?.notes ?? '')
  const [attachments, setAttachments] = useState<Attachment[]>(booking?.attachments ?? [])
  const [pending, setPending] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const near = tripCenter([...trip.places, ...trip.destinations])
  const setDetail = (k: string, v: string) => setDetails((d) => ({ ...d, [k]: v }))

  const suggestedTitle = useMemo(() => {
    if (!cfg || !type) return ''
    const f = from.ref || from.name
    const t = to.ref || to.name
    if (type === 'flight') {
      const no = [details.airline_iata, details.flight_number].filter(Boolean).join(' ')
      return [no, f && t ? `${f} → ${t}` : f || t].filter(Boolean).join(' · ') || 'Flug'
    }
    if (cfg.route) {
      const num = details.number ? `${details.number} ` : ''
      if (type === 'rental_car') return `Mietwagen${provider ? ` ${provider}` : ''}${f ? ` · ${f}` : ''}`
      return `${num || cfg.label + ' '}${f && t ? `${f} → ${t}` : f || t}`.trim()
    }
    return to.name || provider || cfg.label
  }, [cfg, type, from, to, details, provider])

  const effectiveTitle = titleTouched ? title : suggestedTitle

  const swap = () => {
    setFrom(to)
    setTo(from)
  }

  const save = async () => {
    if (!type || !cfg) return
    setError('')
    const clean = (l: Location) => (l.name.trim() ? { ...l, name: l.name.trim() } : null)
    const startVal = join(startDate, startTime)
    const endVal = join(endDate, endTime)
    const payload: BookingInput = {
      type,
      title: (effectiveTitle || cfg.label).trim(),
      provider: provider.trim() || null,
      confirmation_code: code.trim() || null,
      status,
      start_at: startVal || null,
      start_tz: startTz || null,
      end_at: endVal || null,
      end_tz: (cfg.route ? endTz : startTz) || null,
      from_location: cfg.route ? clean(from) : null,
      to_location: clean(to),
      cost: cost ? Number(cost.replace(/\./g, '').replace(',', '.')) : null,
      cost_currency: cost ? costCur.toUpperCase() : null,
      details: Object.fromEntries(Object.entries(details).filter(([, v]) => v !== '' && v != null)),
      notes: notes.trim() || null,
    }
    setBusy(true)
    try {
      const saved = booking ? await api.updateBooking(booking.id, payload) : await api.createBooking(trip.id, payload)
      if (pending.length) await api.upload(trip.id, pending, saved.id)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!booking) return
    const withFiles = attachments.length
      ? confirm(`Buchung löschen. Sollen auch die ${attachments.length} Anhänge gelöscht werden? (Abbrechen = Anhänge behalten)`)
      : false
    if (!attachments.length && !confirm('Buchung wirklich löschen?')) return
    await api.deleteBooking(booking.id, withFiles)
    onSaved()
  }

  const uploadNow = async (files: File[]) => {
    if (!booking) {
      setPending((p) => [...p, ...files])
      return
    }
    const res = await api.upload(trip.id, files, booking.id)
    setAttachments((a) => [...a, ...res])
  }

  // ---------- Schritt 1: Typ wählen
  if (!type || !cfg) {
    return (
      <Modal open onClose={onClose} title="Neue Buchung" size="lg">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TYPE_ORDER.map((t) => {
            const c = BOOKING_TYPES[t]
            const Icon = c.icon
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-sm font-medium transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card dark:border-slate-700"
              >
                <span className={cls('flex h-11 w-11 items-center justify-center rounded-xl', c.tone)}><Icon size={22} /></span>
                {c.label}
              </button>
            )
          })}
        </div>
      </Modal>
    )
  }

  const Icon = cfg.icon
  const tzInput = (val: string, set: (v: string) => void) => (
    <>
      <input className="input mt-1 text-xs" list="tz-list" value={val} onChange={(e) => set(e.target.value)} placeholder="Zeitzone" />
    </>
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-3">
          {!booking && (
            <button className="icon-btn -ml-2" onClick={() => setType(null)} aria-label="Zurück"><ArrowLeft size={18} /></button>
          )}
          <span className={cls('flex h-8 w-8 items-center justify-center rounded-lg', cfg.tone)}><Icon size={17} /></span>
          {booking ? `${cfg.label} bearbeiten` : cfg.label}
        </span>
      }
      footer={
        <>
          {booking && <button className="btn-danger mr-auto" onClick={remove}><Trash2 size={16} /> Löschen</button>}
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={busy}>Speichern</button>
        </>
      }
    >
      <datalist id="tz-list">{TIMEZONES.map((z) => <option key={z} value={z} />)}</datalist>
      <div className="space-y-5">
        {/* Flug: Airline + Nummer */}
        {type === 'flight' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="label">Airline</label>
              <AirlineInput
                value={provider}
                onChange={(v) => { setProvider(v); if (!v) setDetail('airline_iata', '') }}
                onSelect={(a) => { setProvider(a.name); setDetail('airline_iata', a.iata) }}
              />
            </div>
            <div>
              <label className="label">Flugnummer</label>
              <input className="input" value={details.flight_number ?? ''} onChange={(e) => setDetail('flight_number', e.target.value.replace(/^[A-Za-z]{2}\s?/, ''))} placeholder="400" />
            </div>
          </div>
        )}

        {/* Strecke */}
        {cfg.route ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label className="label">{cfg.fromLabel}</label>
              {type === 'flight' ? (
                <AirportInput
                  value={from.name}
                  onChange={(v) => setFrom({ name: v })}
                  onSelect={(a) => { setFrom({ name: `${a.city || a.name} (${a.iata})`, lat: a.lat, lon: a.lon, ref: a.iata }); if (a.tz) setStartTz(a.tz) }}
                />
              ) : (
                <PlaceSearch value={from.name} near={near} placeholder="Ort / Bahnhof / Adresse" onChange={(v) => setFrom({ name: v })} onSelect={(r) => setFrom({ name: r.name, lat: r.lat, lon: r.lon, address: r.address })} />
              )}
            </div>
            <button className="icon-btn mb-0.5" onClick={swap} title="Tauschen" type="button"><ArrowRightLeft size={16} /></button>
            <div>
              <label className="label">{cfg.toLabel}</label>
              {type === 'flight' ? (
                <AirportInput
                  value={to.name}
                  onChange={(v) => setTo({ name: v })}
                  onSelect={(a) => { setTo({ name: `${a.city || a.name} (${a.iata})`, lat: a.lat, lon: a.lon, ref: a.iata }); if (a.tz) setEndTz(a.tz) }}
                />
              ) : (
                <PlaceSearch value={to.name} near={near} placeholder="Ort / Bahnhof / Adresse" onChange={(v) => setTo({ name: v })} onSelect={(r) => setTo({ name: r.name, lat: r.lat, lon: r.lon, address: r.address })} />
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <PlaceSearch
                value={to.name}
                near={near}
                placeholder={type === 'lodging' ? 'Hotel / Unterkunft suchen' : 'Name oder Ort suchen'}
                onChange={(v) => setTo({ ...to, name: v })}
                onSelect={(r) => setTo({ name: r.name, address: r.address, lat: r.lat, lon: r.lon })}
              />
              <p className="mt-1 flex items-center gap-1 px-1 text-xs text-slate-400">
                <MapPin size={11} /> {to.lat != null ? 'Auf der Karte' : 'Aus der Suche wählen, damit es auf der Karte erscheint'}
              </p>
            </div>
            <div>
              <label className="label">{cfg.locationLabel}</label>
              <input className="input" value={to.address ?? ''} onChange={(e) => setTo({ ...to, address: e.target.value })} placeholder="Straße, Ort" />
            </div>
          </div>
        )}

        {/* Zeiten */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{cfg.startLabel}</label>
            <div className="flex gap-2">
              <input type="date" className="input" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate && endDate < e.target.value) setEndDate(e.target.value) }} />
              <input type="time" className="input w-32" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            {tzInput(startTz, setStartTz)}
          </div>
          <div>
            <label className="label">{cfg.endLabel}</label>
            <div className="flex gap-2">
              <input type="date" className="input" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
              <input type="time" className="input w-32" value={endTime} onChange={(e) => { setEndTime(e.target.value); if (!endDate && startDate) setEndDate(startDate) }} />
            </div>
            {cfg.route ? tzInput(endTz, setEndTz) : <p className="mt-1 px-1 text-xs text-slate-400">Zeitzone wie {cfg.startLabel}</p>}
          </div>
        </div>

        {/* Buchungsdaten */}
        <div className="grid gap-3 sm:grid-cols-3">
          {type !== 'flight' && (
            <div>
              <label className="label">{cfg.providerLabel}</label>
              <input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label">Buchungsnummer</label>
            <input className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)}>
              {(Object.keys(STATUS) as BookingStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
          </div>
          <div className={type === 'flight' ? '' : 'sm:col-span-3'}>
            <label className="label">Kosten</label>
            <div className="flex gap-2">
              <input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
              <input className="input w-20 uppercase" maxLength={3} value={costCur} onChange={(e) => setCostCur(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Typ-spezifisch */}
        {cfg.details.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {cfg.details.map((f) => (
              <div key={f.key} className={f.half ? '' : 'col-span-2'}>
                <label className="label">{f.label}</label>
                <input
                  className="input"
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  value={details[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setDetail(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="label">Titel</label>
          <input
            className="input"
            value={effectiveTitle}
            onChange={(e) => { setTitle(e.target.value); setTitleTouched(true) }}
            placeholder={cfg.label}
          />
          {titleTouched && !booking && (
            <button className="mt-1 text-xs text-brand-600" onClick={() => setTitleTouched(false)}>Automatischen Titel verwenden</button>
          )}
        </div>

        <div>
          <label className="label">Notizen</label>
          <textarea className="input min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Anhänge */}
        <div>
          <label className="label">Anhänge</label>
          <div className="space-y-2">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <Paperclip size={14} className="text-slate-400" />
                <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onPreview(a)}>{a.filename}</button>
                <span className="text-xs text-slate-400">{fmtSize(a.size)}</span>
                <button
                  className="icon-btn h-7 w-7"
                  onClick={async () => { if (confirm(`„${a.filename}“ löschen?`)) { await api.deleteAttachment(a.id); setAttachments((x) => x.filter((y) => y.id !== a.id)) } }}
                  aria-label="Löschen"
                ><Trash2 size={14} /></button>
              </div>
            ))}
            {pending.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
                <Paperclip size={14} className="text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-slate-400">wird beim Speichern hochgeladen</span>
              </div>
            ))}
            <label className="btn-outline w-full cursor-pointer">
              <Paperclip size={16} /> Datei anhängen
              <input type="file" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) uploadNow(f) }} />
            </label>
          </div>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
