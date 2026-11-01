import { AlertCircle, BedDouble, Plane, Ticket, UserPlus, UtensilsCrossed, Wallet, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { Booking, BookingType, TripDetail } from '../api'
import { BOOKING_TYPES, STATUS } from '../bookingTypes'
import { cls, fmtDate, fmtMoney, localDay } from '../util'

interface Props {
  trip: TripDetail
  onOpen: (b: Booking) => void
  onEditTrip: () => void
}

type CatKey = 'transport' | 'stay' | 'food' | 'activity'
const CATS: Record<CatKey, { label: string; icon: LucideIcon; color: string }> = {
  transport: { label: 'Anreise & Transport', icon: Plane, color: '#0ea5e9' },
  stay: { label: 'Unterkunft', icon: BedDouble, color: '#8b5cf6' },
  food: { label: 'Essen', icon: UtensilsCrossed, color: '#f59e0b' },
  activity: { label: 'Aktivitäten', icon: Ticket, color: '#ec4899' },
}
const CAT_ORDER: CatKey[] = ['transport', 'stay', 'food', 'activity']

function catOf(t: BookingType): CatKey {
  if (t === 'lodging') return 'stay'
  if (t === 'restaurant') return 'food'
  if (t === 'activity') return 'activity'
  return 'transport'
}

const isBooked = (b: Booking) => b.status === 'booked' || b.status === 'confirmed'

/** Kostenauswertung: Summen, pro Kategorie und pro Person (keine Abrechnung). */
export default function Costs({ trip, onOpen, onEditTrip }: Props) {
  const cur = trip.currency
  const travelers = trip.travelers

  const data = useMemo(() => {
    const active = trip.bookings.filter((b) => b.status !== 'cancelled')
    const priced = active.filter((b) => b.cost != null && (b.cost_currency || cur) === cur)
    const foreign = active.filter((b) => b.cost != null && (b.cost_currency || cur) !== cur)
    const unpriced = active.filter((b) => b.cost == null && !isBooked(b))

    const forWhom = (b: Booking) => {
      const sel = (b.travelers ?? []).filter((t) => travelers.includes(t))
      return sel.length ? sel : travelers
    }

    const byCat = Object.fromEntries(CAT_ORDER.map((c) => [c, { booked: 0, planned: 0 }])) as Record<CatKey, { booked: number; planned: number }>
    const perPerson = Object.fromEntries(travelers.map((t) => [t, { total: 0, booked: 0, cats: Object.fromEntries(CAT_ORDER.map((c) => [c, 0])) as Record<CatKey, number> }]))
    let booked = 0
    let planned = 0

    for (const b of priced) {
      const c = catOf(b.type)
      const v = b.cost!
      if (isBooked(b)) { booked += v; byCat[c].booked += v } else { planned += v; byCat[c].planned += v }
      const who = forWhom(b)
      for (const t of who) {
        const share = v / who.length
        perPerson[t].total += share
        perPerson[t].cats[c] += share
        if (isBooked(b)) perPerson[t].booked += share
      }
    }

    // Fremdwährungen getrennt summieren
    const foreignSums = new Map<string, number>()
    for (const b of foreign) foreignSums.set(b.cost_currency!, (foreignSums.get(b.cost_currency!) ?? 0) + b.cost!)

    const sorted = [...priced].sort((a, b) => (a.start_utc ?? '9').localeCompare(b.start_utc ?? '9'))
    return { priced: sorted, unpriced, booked, planned, total: booked + planned, byCat, perPerson, foreignSums, forWhom }
  }, [trip.bookings, travelers, cur])

  const maxCat = Math.max(1, ...CAT_ORDER.map((c) => data.byCat[c].booked + data.byCat[c].planned))
  const budgetPct = trip.budget ? Math.min(100, Math.round((data.total / trip.budget) * 100)) : null

  if (!data.priced.length && !data.unpriced.length) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center text-sm text-slate-500">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15"><Wallet size={24} /></span>
        Noch keine Kosten erfasst. Trag bei den Buchungen einen Preis ein, dann erscheint hier die Auswertung.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Gesamt</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{fmtMoney(data.total, cur)}</p>
          {budgetPct != null && (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={cls('h-full rounded-full', budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${budgetPct}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{budgetPct} % von {fmtMoney(trip.budget, cur)} Budget</p>
            </>
          )}
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Davon gebucht</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{fmtMoney(data.booked, cur)}</p>
          <p className="mt-1 text-xs text-slate-500">Status „Gebucht“ oder „Bestätigt“</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Noch offen (geschätzt)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{fmtMoney(data.planned, cur)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Status „Todo“ oder „Idee“{data.unpriced.length > 0 && <> · {data.unpriced.length} ohne Preis</>}
          </p>
        </div>
      </div>

      {/* Pro Person */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Pro Person</h3>
        {travelers.length === 0 ? (
          <button onClick={onEditTrip} className="card flex w-full items-center gap-3 p-4 text-left text-sm text-slate-600 hover:shadow-lg dark:text-slate-300">
            <UserPlus size={18} className="text-brand-600" />
            Trag in der Reise die Reisenden ein, dann siehst du hier die Kosten pro Person.
          </button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {travelers.map((t) => {
              const p = data.perPerson[t]
              return (
                <div key={t} className="card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold">{t}</p>
                    <p className="text-lg font-bold tabular-nums">{fmtMoney(Math.round(p.total * 100) / 100, cur)}</p>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    {CAT_ORDER.map((c) => p.cats[c] > 0 && (
                      <div key={c} style={{ width: `${(p.cats[c] / (p.total || 1)) * 100}%`, background: CATS[c].color }} title={`${CATS[c].label}: ${fmtMoney(Math.round(p.cats[c]), cur)}`} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">davon gebucht {fmtMoney(Math.round(p.booked * 100) / 100, cur)}</p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Nach Kategorie */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Nach Kategorie</h3>
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {CAT_ORDER.map((c) => {
            const v = data.byCat[c]
            const sum = v.booked + v.planned
            const C = CATS[c]
            return (
              <div key={c} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: C.color }}><C.icon size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{C.label}</span>
                    <span className="text-sm font-semibold tabular-nums">{fmtMoney(sum, cur)}</span>
                  </div>
                  <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div style={{ width: `${(v.booked / maxCat) * 100}%`, background: C.color }} />
                    <div style={{ width: `${(v.planned / maxCat) * 100}%`, background: C.color, opacity: 0.35 }} />
                  </div>
                  {v.planned > 0 && <p className="mt-1 text-xs text-slate-500">davon offen {fmtMoney(v.planned, cur)}</p>}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-1.5 px-1 text-xs text-slate-400">Kräftig = gebucht, blass = noch offen</p>
      </section>

      {/* Einzelposten */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Einzelposten</h3>
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
          {data.priced.map((b) => {
            const cfg = BOOKING_TYPES[b.type]
            const who = data.forWhom(b)
            return (
              <button key={b.id} onClick={() => onOpen(b)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className={cls('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', cfg.tone)}><cfg.icon size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{b.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    {b.start_at && <span>{fmtDate(localDay(b.start_at), { day: 'numeric', month: 'short' })}</span>}
                    <span className={cls('chip px-1.5 py-0 text-[10px]', STATUS[b.status].cls)}>{STATUS[b.status].label}</span>
                    {travelers.length > 0 && who.length < travelers.length && <span>für {who.join(', ')}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums">{fmtMoney(b.cost, cur)}</span>
                  {who.length > 1 && <span className="block text-xs text-slate-500 tabular-nums">{fmtMoney(Math.round((b.cost! / who.length) * 100) / 100, cur)} p. P.</span>}
                </span>
              </button>
            )
          })}
        </div>

        {data.unpriced.length > 0 && (
          <div className="mt-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"><AlertCircle size={14} /> Noch ohne Preis – fließen nicht in die Summen ein</p>
            <div className="flex flex-wrap gap-1.5">
              {data.unpriced.map((b) => (
                <button key={b.id} onClick={() => onOpen(b)} className="chip bg-white py-1 text-slate-700 ring-1 ring-amber-200 hover:ring-amber-400 dark:bg-slate-900 dark:text-slate-200 dark:ring-amber-500/30">
                  {b.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {data.foreignSums.size > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Nicht eingerechnet (andere Währung): {[...data.foreignSums.entries()].map(([c, v]) => fmtMoney(v, c)).join(' · ')}
          </p>
        )}
      </section>
    </div>
  )
}
