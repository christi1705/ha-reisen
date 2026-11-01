import { Archive, ChevronDown, ListChecks, MapPin, Plane, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type AppInfo, type Trip } from '../api'
import TripForm from '../components/TripForm'
import { BOOKING_TYPES } from '../bookingTypes'
import { cls, countdownLabel, fmtRange, fmtTime, gradientFor } from '../util'

function TripCard({ t }: { t: Trip }) {
  const cd = countdownLabel(t.start_date, t.end_date)
  const NextIcon = t.next_booking ? BOOKING_TYPES[t.next_booking.type].icon : null
  return (
    <Link to={`/trip/${t.id}`} className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative h-40 overflow-hidden" style={t.cover_url ? undefined : { background: gradientFor(t.title) }}>
        {t.cover_url ? (
          <img src={t.cover_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <Plane className="absolute -bottom-4 -right-4 h-32 w-32 rotate-12 text-white/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        {cd && (
          <span className={cls('chip absolute right-3 top-3 backdrop-blur', t.status === 'running' ? 'bg-emerald-500 text-white' : 'bg-white/90 text-slate-800')}>
            {t.status === 'running' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
            {cd}
          </span>
        )}
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <h3 className="truncate text-lg font-bold drop-shadow">{t.title}</h3>
          <p className="text-sm text-white/85">{fmtRange(t.start_date, t.end_date)} · {t.days} {t.days === 1 ? 'Tag' : 'Tage'}</p>
        </div>
      </div>
      <div className="space-y-2 p-4">
        {t.destinations.length > 0 && (
          <p className="flex items-center gap-1.5 truncate text-sm text-slate-600 dark:text-slate-300">
            <MapPin size={14} className="shrink-0 text-slate-400" />
            {t.destinations.map((d) => d.name).join(' · ')}
          </p>
        )}
        {t.open_tasks > 0 && t.status !== 'past' && (
          <p className={cls('flex items-center gap-1.5 text-sm', t.overdue_tasks ? 'text-red-600 dark:text-red-400' : 'text-slate-500')}>
            <ListChecks size={14} className="shrink-0" />
            {t.open_tasks === 1 ? '1 offene Aufgabe' : `${t.open_tasks} offene Aufgaben`}
            {t.overdue_tasks > 0 && <span className="text-xs">· {t.overdue_tasks} überfällig</span>}
          </p>
        )}
        {t.next_booking && NextIcon && t.status !== 'past' ? (
          <p className="flex items-center gap-1.5 truncate text-sm text-slate-500">
            <NextIcon size={14} className="shrink-0" />
            <span className="truncate">{t.next_booking.title}</span>
            {t.next_booking.start_at && (
              <span className="ml-auto shrink-0 text-xs">
                {new Date(t.next_booking.start_at.slice(0, 10)).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} {fmtTime(t.next_booking.start_at)}
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-slate-400">{t.booking_count} Buchungen · {t.attachment_count} Dokumente</p>
        )}
      </div>
    </Link>
  )
}

function Section({ title, trips }: { title: string; trips: Trip[] }) {
  if (!trips.length) return null
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((t) => <TripCard key={t.id} t={t} />)}
      </div>
    </section>
  )
}

export default function TripList({ info }: { info: AppInfo | null }) {
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    api.trips().then(setTrips).catch((e) => setError(e.message))
  }, [])

  const active = (trips ?? []).filter((t) => !t.archived)
  const running = active.filter((t) => t.status === 'running')
  const upcoming = active.filter((t) => t.status === 'upcoming')
  const past = active.filter((t) => t.status === 'past').reverse()
  const archived = (trips ?? []).filter((t) => t.archived).reverse()

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{info?.user ? `Hallo ${info.user.split(' ')[0]}` : 'Willkommen'} 👋</p>
          <h1 className="text-3xl font-bold tracking-tight">Deine Reisen</h1>
        </div>
        <button className="btn-primary hidden sm:inline-flex" onClick={() => setCreating(true)}><Plus size={18} /> Neue Reise</button>
      </header>

      {error && <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {trips === null && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="card h-64 animate-pulse" />)}
        </div>
      )}

      {trips && active.length === 0 && (
        <div className="card mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><Plane size={30} /></span>
          <h2 className="text-xl font-semibold">Wohin geht's als Nächstes?</h2>
          <p className="text-sm text-slate-500">Lege deine erste Reise an und sammle Flüge, Unterkünfte und Dokumente an einem Ort.</p>
          <button className="btn-primary mt-2" onClick={() => setCreating(true)}><Plus size={18} /> Reise anlegen</button>
        </div>
      )}

      <div className="space-y-10">
        <Section title="Gerade unterwegs" trips={running} />
        <Section title="Kommende Reisen" trips={upcoming} />
        <Section title="Vergangene Reisen" trips={past} />
        {archived.length > 0 && (
          <section>
            <button className="btn-ghost -ml-3" onClick={() => setShowArchive(!showArchive)}>
              <Archive size={16} /> Archiv ({archived.length}) <ChevronDown size={16} className={cls('transition', showArchive && 'rotate-180')} />
            </button>
            {showArchive && <div className="mt-3 grid gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3">{archived.map((t) => <TripCard key={t.id} t={t} />)}</div>}
          </section>
        )}
      </div>

      <button
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-xl sm:hidden"
        onClick={() => setCreating(true)}
        aria-label="Neue Reise"
      >
        <Plus size={26} />
      </button>

      {creating && (
        <TripForm
          open
          defaultCurrency={info?.default_currency ?? 'EUR'}
          onClose={() => setCreating(false)}
          onSaved={(t) => nav(`/trip/${t.id}`)}
        />
      )}
    </div>
  )
}
