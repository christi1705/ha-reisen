import { CalendarPlus } from 'lucide-react'
import type { Attachment, Booking, TripDetail } from '../api'
import { cls, eachDay, fmtDayHeader, localDay } from '../util'
import BookingCard, { type TimelineRole } from './BookingCard'

interface Entry {
  booking: Booking
  role: TimelineRole
  sort: string
}

interface Props {
  trip: TripDetail
  onOpen: (b: Booking) => void
  onPreview: (a: Attachment) => void
  onAdd: () => void
}

/** Chronologischer Ablauf, nach Tagen gruppiert. Mehrtägige Buchungen erscheinen bei Beginn und Ende. */
export default function Timeline({ trip, onOpen, onPreview, onAdd }: Props) {
  const entries: Entry[] = []
  const undated: Booking[] = []

  for (const b of trip.bookings) {
    if (!b.start_at) {
      undated.push(b)
      continue
    }
    const multiDay = b.end_at && localDay(b.end_at) !== localDay(b.start_at)
    // Unterkünfte & Mietwagen: Beginn und Ende als eigene Einträge; Flüge über Nacht bleiben ein Eintrag
    const split = multiDay && (b.type === 'lodging' || b.type === 'rental_car' || b.type === 'bike' || b.type === 'activity')
    entries.push({ booking: b, role: split ? 'start' : 'single', sort: b.start_utc ?? b.start_at })
    if (split && b.end_at) entries.push({ booking: b, role: 'end', sort: b.end_utc ?? b.end_at })
  }
  entries.sort((a, b) => a.sort.localeCompare(b.sort))

  const byDay = new Map<string, Entry[]>()
  for (const e of entries) {
    const d = localDay(e.role === 'end' ? e.booking.end_at : e.booking.start_at)
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d)!.push(e)
  }

  const tripDays = eachDay(trip.start_date, trip.end_date)
  const allDays = Array.from(new Set([...tripDays, ...byDay.keys()])).sort()

  if (trip.bookings.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><CalendarPlus size={26} /></span>
        <h3 className="text-lg font-semibold">Noch nichts geplant</h3>
        <p className="max-w-sm text-sm text-slate-500">Füge Flüge, Unterkünfte, Mietwagen oder Tickets hinzu. Sie erscheinen hier automatisch in der richtigen Reihenfolge.</p>
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
            <div className="sticky top-[56px] z-10 -mx-1 mb-2 flex items-baseline gap-3 bg-slate-50/90 px-1 py-1.5 backdrop-blur dark:bg-slate-950/90">
              {!outside && <span className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">Tag {idx + 1}</span>}
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{fmtDayHeader(day)}</h3>
            </div>
            {list.length ? (
              <div className="relative space-y-3 pl-4 before:absolute before:bottom-2 before:left-1 before:top-2 before:w-0.5 before:rounded before:bg-slate-200 dark:before:bg-slate-800">
                {list.map((e) => (
                  <div key={e.booking.id + e.role} className="relative">
                    <span className={cls('absolute -left-[15px] top-6 h-2.5 w-2.5 rounded-full ring-4 ring-slate-50 dark:ring-slate-950', e.role === 'end' ? 'bg-slate-300' : 'bg-brand-500')} />
                    <BookingCard booking={e.booking} role={e.role} onOpen={onOpen} onPreview={onPreview} />
                  </div>
                ))}
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
