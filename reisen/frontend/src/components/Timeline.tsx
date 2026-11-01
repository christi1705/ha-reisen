import { CalendarPlus, Clock, Crosshair } from 'lucide-react'
import type { Attachment, Booking, Place, TripDetail } from '../api'
import { PLACE_CATEGORIES, dayColor } from '../places'
import { cls, eachDay, fmtDayHeader, localDay } from '../util'
import BookingCard, { type TimelineRole } from './BookingCard'

type Entry =
  | { kind: 'booking'; booking: Booking; role: TimelineRole; day: string; sort: string }
  | { kind: 'place'; place: Place; number: number; day: string; sort: string }

interface Props {
  trip: TripDetail
  onOpen: (b: Booking) => void
  onOpenPlace: (p: Place) => void
  onLocate: (lat: number, lon: number) => void
  onPreview: (a: Attachment) => void
  onAdd: () => void
}

/** Chronologischer Ablauf nach Tagen: Buchungen und geplante Orte. Mehrtägige Buchungen erscheinen bei Beginn und Ende. */
export default function Timeline({ trip, onOpen, onOpenPlace, onLocate, onPreview, onAdd }: Props) {
  const entries: Entry[] = []
  const undated: Booking[] = []
  const hhmm = (local: string | null) => (local && local.length >= 16 ? local.slice(11, 16) : '00:00')

  for (const b of trip.bookings) {
    if (!b.start_at) {
      undated.push(b)
      continue
    }
    const multiDay = b.end_at && localDay(b.end_at) !== localDay(b.start_at)
    // Unterkünfte & Mietwagen: Beginn und Ende als eigene Einträge; Flüge über Nacht bleiben ein Eintrag
    const split = multiDay && (b.type === 'lodging' || b.type === 'rental_car' || b.type === 'bike' || b.type === 'activity')
    entries.push({ kind: 'booking', booking: b, role: split ? 'start' : 'single', day: localDay(b.start_at), sort: hhmm(b.start_at) })
    if (split && b.end_at) entries.push({ kind: 'booking', booking: b, role: 'end', day: localDay(b.end_at), sort: hhmm(b.end_at) })
  }

  // Geplante Orte: mit Uhrzeit einsortiert, ohne Uhrzeit in ihrer Reihenfolge ans Ende
  const planned = trip.places.filter((p) => p.day).sort((a, b) => a.sort_order - b.sort_order)
  const counter = new Map<string, number>()
  for (const p of planned) {
    const n = (counter.get(p.day!) ?? 0) + 1
    counter.set(p.day!, n)
    entries.push({ kind: 'place', place: p, number: n, day: p.day!, sort: p.time ?? `99:${String(p.sort_order).padStart(4, '0')}` })
  }

  const byDay = new Map<string, Entry[]>()
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, [])
    byDay.get(e.day)!.push(e)
  }
  for (const list of byDay.values()) list.sort((a, b) => a.sort.localeCompare(b.sort))

  const tripDays = eachDay(trip.start_date, trip.end_date)
  const allDays = Array.from(new Set([...tripDays, ...byDay.keys()])).sort()

  if (trip.bookings.length === 0 && planned.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><CalendarPlus size={26} /></span>
        <h3 className="text-lg font-semibold">Noch nichts geplant</h3>
        <p className="max-w-sm text-sm text-slate-500">Füge Flüge, Unterkünfte, Mietwagen oder Tickets hinzu, oder plane Orte im Reiter „Planung“. Alles erscheint hier automatisch in der richtigen Reihenfolge.</p>
        <button className="btn-primary mt-2" onClick={onAdd}>Erste Buchung anlegen</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {allDays.map((day) => {
        const list = byDay.get(day) ?? []
        const idx = tripDays.indexOf(day)
        const outside = idx === -1
        if (outside && !list.length) return null
        return (
          <section key={day} className="relative">
            <div className="sticky top-[50px] z-10 -mx-1 mb-2 flex items-baseline gap-3 bg-slate-50/90 px-1 py-1.5 backdrop-blur dark:bg-slate-950/90">
              {!outside && <span className="text-xs font-bold uppercase tracking-wider" style={{ color: dayColor(idx) }}>Tag {idx + 1}</span>}
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{fmtDayHeader(day)}</h3>
            </div>
            {list.length ? (
              <div className="relative space-y-3 pl-4 before:absolute before:bottom-2 before:left-1 before:top-2 before:w-0.5 before:rounded before:bg-slate-200 dark:before:bg-slate-800">
                {list.map((e) =>
                  e.kind === 'booking' ? (
                    <div key={e.booking.id + e.role} className="relative">
                      <span className={cls('absolute -left-[15px] top-6 h-2.5 w-2.5 rounded-full ring-4 ring-slate-50 dark:ring-slate-950', e.role === 'end' ? 'bg-slate-300' : 'bg-brand-500')} />
                      <BookingCard booking={e.booking} role={e.role} onOpen={onOpen} onPreview={onPreview} />
                    </div>
                  ) : (
                    <div key={e.place.id} className="relative">
                      <span className="absolute -left-[15px] top-[18px] h-2.5 w-2.5 rounded-full ring-4 ring-slate-50 dark:ring-slate-950" style={{ background: dayColor(idx) }} />
                      <PlaceEntry place={e.place} number={e.number} color={dayColor(idx)} onOpen={() => onOpenPlace(e.place)} onLocate={onLocate} />
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="pl-4 text-sm italic text-slate-400">Nichts geplant</p>
            )}
          </section>
        )
      })}

      {undated.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-500">Ohne Datum</h3>
          <div className="space-y-3">
            {undated.map((b) => <BookingCard key={b.id} booking={b} onOpen={onOpen} onPreview={onPreview} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function PlaceEntry({ place: p, number, color, onOpen, onLocate }: {
  place: Place; number: number; color: string; onOpen: () => void; onLocate: (lat: number, lon: number) => void
}) {
  const C = PLACE_CATEGORIES[p.category] ?? PLACE_CATEGORIES.other
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color }}>{number}</span>
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <span className="block truncate text-sm font-medium">{p.name}</span>
        <span className="flex items-center gap-1 truncate text-xs text-slate-500">
          <C.icon size={11} style={{ color: C.color }} className="shrink-0" /> <span className="truncate">{p.address || C.label}</span>
        </span>
      </button>
      {p.time && <span className="chip shrink-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Clock size={11} /> {p.time}</span>}
      {p.lat != null && (
        <button className="icon-btn h-8 w-8 shrink-0" onClick={() => onLocate(p.lat!, p.lon!)} title="Auf Karte zeigen"><Crosshair size={15} /></button>
      )}
    </div>
  )
}
