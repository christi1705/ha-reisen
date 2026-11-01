import { BedDouble, CalendarPlus, ChevronRight, Paperclip } from 'lucide-react'
import type { Attachment, Booking, TripDetail } from '../api'
import { BOOKING_TYPES, STATUS } from '../bookingTypes'
import { dayColor } from '../places'
import { cls, eachDay, fmtDate, fmtDuration, fmtTime, localDay, nightsBetween, parseDate } from '../util'

interface Props {
  trip: TripDetail
  onOpen: (b: Booking) => void
  onDay: (day: string) => void
  onPreview: (a: Attachment) => void
  onAdd: () => void
}

const STAY_TYPES = new Set(['lodging', 'restaurant', 'activity'])

type Item =
  | { kind: 'transport'; b: Booking; key: string }
  | { kind: 'stay'; b: Booking; days: string[]; key: string }
  | { kind: 'day'; day: string; key: string }

const shortDay = (d: string) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })

/** Grober Ablauf: Stationen (Übernachtungen), Ortswechsel (Transport) und je Tag eine Zeile zur Tagesansicht. */
export default function Itinerary({ trip, onOpen, onDay, onPreview, onAdd }: Props) {
  const tripDays = eachDay(trip.start_date, trip.end_date)
  const active = trip.bookings.filter((b) => b.status !== 'cancelled')
  const lodgings = active.filter((b) => b.type === 'lodging' && b.start_at)
  const transports = active.filter((b) => !STAY_TYPES.has(b.type) && b.start_at)

  // Programm pro Tag (Details, die nur in der Tagesansicht stehen)
  const program = new Map<string, { places: string[]; events: string[] }>()
  const prog = (d: string) => {
    if (!program.has(d)) program.set(d, { places: [], events: [] })
    return program.get(d)!
  }
  for (const p of trip.places) if (p.day) prog(p.day).places.push(p.name)
  for (const b of active) if ((b.type === 'restaurant' || b.type === 'activity') && b.start_at) prog(localDay(b.start_at)).events.push(b.title)

  const covered = new Set<string>()
  const items: Item[] = []
  for (const b of lodgings) {
    const s = localDay(b.start_at)
    const e = localDay(b.end_at) || s
    const days = eachDay(s, e).filter((d) => d < e || d === s)
    days.forEach((d) => covered.add(d))
    items.push({ kind: 'stay', b, days, key: `${s}T23:58` })
  }
  for (const b of transports) items.push({ kind: 'transport', b, key: (b.start_at ?? '').slice(0, 16) })
  // Tage ohne Unterkunft: anzeigen, wenn dort etwas geplant ist oder an dem Tag keine Fahrt stattfindet
  // (reine Reisetage ohne Programm sind schon durch die Verbindung abgebildet)
  const travelDays = new Set(transports.flatMap((b) => [localDay(b.start_at), localDay(b.end_at)]))
  for (const d of tripDays) {
    if (covered.has(d)) continue
    if (program.has(d) || !travelDays.has(d)) items.push({ kind: 'day', day: d, key: `${d}T23:59` })
  }
  items.sort((a, b) => a.key.localeCompare(b.key))

  const undated = active.filter((b) => (b.type === 'lodging' || !STAY_TYPES.has(b.type)) && !b.start_at)

  if (!items.length) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><CalendarPlus size={26} /></span>
        <h3 className="text-lg font-semibold">Noch nichts geplant</h3>
        <p className="max-w-sm text-sm text-slate-500">Lege Unterkünfte und Verbindungen an – hier entsteht daraus die Reiseübersicht. Details pro Tag findest du im Reiter „Tag“.</p>
        <button className="btn-primary mt-2" onClick={onAdd}>Erste Buchung anlegen</button>
      </div>
    )
  }

  const DayRow = ({ day }: { day: string }) => {
    const i = tripDays.indexOf(day)
    const p = program.get(day)
    const names = p ? [...p.events, ...p.places] : []
    return (
      <button
        onClick={() => onDay(day)}
        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dayColor(i) }} />
        <span className="w-28 shrink-0 whitespace-nowrap text-xs">
          {i >= 0 && <span className="font-bold uppercase tracking-wide" style={{ color: dayColor(i) }}>Tag {i + 1} </span>}
          <span className="text-slate-500">{shortDay(day)}</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-600 dark:text-slate-300">
          {names.length ? names.join(' · ') : <span className="italic text-slate-400">frei</span>}
        </span>
        <ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </button>
    )
  }

  return (
    <div className="relative space-y-3 pl-5 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-0.5 before:rounded before:bg-slate-200 dark:before:bg-slate-800">
      {items.map((it) => {
        if (it.kind === 'transport') {
          const b = it.b
          const cfg = BOOKING_TYPES[b.type]
          const sameDay = localDay(b.start_at) === localDay(b.end_at)
          return (
            <div key={b.id} className="relative">
              <span className={cls('absolute -left-[18px] top-4 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-slate-50 dark:ring-slate-950', cfg.tone)} />
              <button onClick={() => onOpen(b)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5 text-left transition hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                <span className={cls('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', cfg.tone)}><cfg.icon size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{b.from_location?.name || b.title} → {b.to_location?.name || ''}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span>{fmtDate(localDay(b.start_at), { weekday: 'short', day: 'numeric', month: 'short' })}{fmtTime(b.start_at) && `, ${fmtTime(b.start_at)}`}{fmtTime(b.end_at) && ` – ${fmtTime(b.end_at)}${sameDay ? '' : ' (+1)'}`}</span>
                    {fmtDuration(b.start_utc, b.end_utc) && <span>· {fmtDuration(b.start_utc, b.end_utc)}</span>}
                    <span className="truncate">· {b.title}</span>
                  </span>
                </span>
                {b.attachments.length > 0 && (
                  <span role="button" onClick={(e) => { e.stopPropagation(); onPreview(b.attachments[0]) }} className="icon-btn h-7 w-7" title={b.attachments[0].filename}><Paperclip size={14} /></span>
                )}
                <span className={cls('chip shrink-0', STATUS[b.status].cls)}>{STATUS[b.status].label}</span>
              </button>
            </div>
          )
        }

        if (it.kind === 'stay') {
          const b = it.b
          const nights = nightsBetween(localDay(b.start_at), localDay(b.end_at))
          return (
            <div key={b.id} className="relative">
              <span className="absolute -left-[19px] top-5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-violet-500 text-white ring-4 ring-slate-50 dark:ring-slate-950"><BedDouble size={10} /></span>
              <div className="card overflow-hidden">
                <button onClick={() => onOpen(b)} className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{b.to_location?.name || b.title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {fmtDate(localDay(b.start_at), { weekday: 'short', day: 'numeric', month: 'short' })} – {b.end_at ? fmtDate(localDay(b.end_at), { weekday: 'short', day: 'numeric', month: 'short' }) : '?'}
                      {nights > 0 && ` · ${nights} ${nights === 1 ? 'Nacht' : 'Nächte'}`}
                      {b.to_location?.address && ` · ${b.to_location.address}`}
                    </span>
                  </span>
                  <span className={cls('chip shrink-0', STATUS[b.status].cls)}>{STATUS[b.status].label}</span>
                </button>
                <div className="p-1.5">
                  {it.days.map((d) => <DayRow key={d} day={d} />)}
                </div>
              </div>
            </div>
          )
        }

        return (
          <div key={it.key} className="relative">
            <span className="absolute -left-[16px] top-3.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-slate-50 dark:bg-slate-600 dark:ring-slate-950" />
            <div className="rounded-2xl border border-dashed border-slate-200 p-1.5 dark:border-slate-800"><DayRow day={it.day} /></div>
          </div>
        )
      })}

      {undated.length > 0 && (
        <div className="pt-2">
          <p className="mb-1 text-xs font-medium text-slate-500">Ohne Datum</p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((b) => <button key={b.id} onClick={() => onOpen(b)} className="chip bg-slate-100 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{b.title}</button>)}
          </div>
        </div>
      )}
    </div>
  )
}
