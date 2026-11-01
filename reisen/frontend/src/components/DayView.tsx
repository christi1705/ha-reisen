import { BedDouble, ChevronLeft, ChevronRight, ListChecks, Map as MapIcon, MapPin, Wallet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, Booking, Place, TripDetail } from '../api'
import { dayColor } from '../places'
import { cls, eachDay, fmtDayHeader, fmtMoney, localDay, parseDate, useIsDesktop } from '../util'
import Timeline from './Timeline'
import TripMap, { type MapFocus } from './TripMap'

interface Props {
  trip: TripDetail
  day: string
  onDay: (day: string) => void
  onOpen: (b: Booking) => void
  onOpenPlace: (p: Place) => void
  onPreview: (a: Attachment) => void
  onAdd: () => void
  onPlan: () => void
  onTasks: () => void
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Sinnvoller Starttag: heute (wenn unterwegs), sonst erster Reisetag */
export function defaultDay(trip: TripDetail) {
  const t = todayStr()
  return t >= trip.start_date && t <= trip.end_date ? t : trip.start_date
}

/** Einzeltag-Ansicht: alles für einen Tag, mit Karte nur dieses Tages. */
export default function DayView({ trip, day, onDay, onOpen, onOpenPlace, onPreview, onAdd, onPlan, onTasks }: Props) {
  const days = useMemo(() => eachDay(trip.start_date, trip.end_date), [trip.start_date, trip.end_date])
  const idx = days.indexOf(day)
  const color = dayColor(idx)
  const isDesktop = useIsDesktop()
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [showMap, setShowMap] = useState(true)
  const strip = useRef<HTMLDivElement>(null)

  // Aktiven Tag in der Leiste sichtbar halten
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [day])

  // Pfeiltasten zum Blättern
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [role=dialog]')) return
      if (e.key === 'ArrowLeft' && idx > 0) onDay(days[idx - 1])
      if (e.key === 'ArrowRight' && idx < days.length - 1) onDay(days[idx + 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, days, onDay])

  const lodging = trip.bookings.find(
    (b) => b.type === 'lodging' && b.status !== 'cancelled' && localDay(b.start_at) <= day && day < (localDay(b.end_at) || localDay(b.start_at)),
  )
  const dayBookings = trip.bookings.filter((b) => localDay(b.start_at) === day && b.status !== 'cancelled')
  const dayPlaces = trip.places.filter((p) => p.day === day)
  const dayCost = dayBookings.reduce((a, b) => a + ((b.cost_currency || trip.currency) === trip.currency ? b.cost ?? 0 : 0), 0)
  const dueTasks = trip.tasks.filter((t) => !t.done && t.due_date === day)
  const hasGeo = dayPlaces.some((p) => p.lat != null) || dayBookings.some((b) => b.to_location?.lat != null || b.from_location?.lat != null) || !!lodging?.to_location?.lat

  const map = <TripMap trip={trip} activeDay={day} focus={focus} onPlaceClick={onOpenPlace} onBookingClick={onOpen} className={isDesktop ? 'h-[calc(100vh-6rem)] min-h-[420px]' : 'h-64'} />

  return (
    <div>
      {/* Tagesleiste */}
      <div className="mb-4 flex items-center gap-2">
        <button className="icon-btn shrink-0" onClick={() => idx > 0 && onDay(days[idx - 1])} disabled={idx <= 0} aria-label="Vorheriger Tag"><ChevronLeft size={18} /></button>
        <div ref={strip} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]">
          {days.map((d, i) => {
            const active = d === day
            const dt = parseDate(d)
            return (
              <button
                key={d}
                data-day={d}
                onClick={() => onDay(d)}
                className={cls(
                  'flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5 text-xs transition',
                  active ? 'text-white shadow-md' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700',
                )}
                style={active ? { background: dayColor(i) } : undefined}
              >
                <span className="text-[10px] uppercase opacity-80">{dt.toLocaleDateString('de-DE', { weekday: 'short' })}</span>
                <span className="text-sm font-bold">{dt.getDate()}.</span>
              </button>
            )
          })}
        </div>
        <button className="icon-btn shrink-0" onClick={() => idx < days.length - 1 && onDay(days[idx + 1])} disabled={idx >= days.length - 1} aria-label="Nächster Tag"><ChevronRight size={18} /></button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-4">
          {/* Kopf */}
          <div className="card overflow-hidden">
            <div className="h-1.5" style={{ background: color }} />
            <div className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{idx >= 0 ? `Tag ${idx + 1} von ${days.length}` : 'Außerhalb der Reise'}</p>
              <h2 className="text-xl font-bold">{fmtDayHeader(day)}</h2>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {lodging && (
                  <button onClick={() => onOpen(lodging)} className="chip gap-1.5 bg-violet-50 py-1 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300">
                    <BedDouble size={13} /> Übernachtung: {lodging.to_location?.name || lodging.title}
                  </button>
                )}
                {dayPlaces.length > 0 && <span className="chip gap-1.5 bg-slate-100 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><MapPin size={13} /> {dayPlaces.length} {dayPlaces.length === 1 ? 'Ort' : 'Orte'}</span>}
                {dayCost > 0 && <span className="chip gap-1.5 bg-slate-100 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Wallet size={13} /> {fmtMoney(dayCost, trip.currency)}</span>}
                {dueTasks.length > 0 && (
                  <button onClick={onTasks} className="chip gap-1.5 bg-amber-50 py-1 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300">
                    <ListChecks size={13} /> {dueTasks.length} fällig: {dueTasks.map((t) => t.title).join(', ')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {!isDesktop && hasGeo && (
            <div>
              <button className="btn-ghost -ml-3 mb-2" onClick={() => setShowMap(!showMap)}>
                <MapIcon size={16} /> {showMap ? 'Karte ausblenden' : 'Karte anzeigen'}
              </button>
              {showMap && map}
            </div>
          )}

          <Timeline
            trip={trip}
            onlyDay={day}
            onOpen={onOpen}
            onOpenPlace={onOpenPlace}
            onLocate={(lat, lon) => { setFocus({ lat, lon, zoom: 16, key: Date.now() }); setShowMap(true) }}
            onPreview={onPreview}
            onAdd={onAdd}
          />

          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={onPlan}><MapPin size={16} /> Orte planen</button>
            <button className="btn-outline" onClick={onAdd}>+ Buchung</button>
          </div>
        </div>

        {isDesktop && hasGeo && <div><div className="sticky top-16">{map}</div></div>}
      </div>
    </div>
  )
}
