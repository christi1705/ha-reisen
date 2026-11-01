import {
  Archive, ArchiveRestore, ArrowLeft, CalendarDays, FileText, ImagePlus, ListChecks, MapPin, MoreHorizontal,
  Map as MapIcon, Pencil, Plus, Receipt, Ticket, Trash2, Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type AppInfo, type Attachment, type Booking, type BookingType, type Place, type TripDetail as TD } from '../api'
import BookingCard from '../components/BookingCard'
import BookingForm from '../components/BookingForm'
import Documents from '../components/Documents'
import Planning from '../components/Planning'
import PlaceForm from '../components/PlaceForm'
import TripMap, { type MapFocus } from '../components/TripMap'
import Preview from '../components/Preview'
import Tasks from '../components/Tasks'
import Timeline from '../components/Timeline'
import TripForm from '../components/TripForm'
import { BOOKING_TYPES, TYPE_ORDER } from '../bookingTypes'
import { cls, countdownLabel, fmtMoney, fmtRange, gradientFor, useIsDesktop } from '../util'

type Tab = 'ablauf' | 'planung' | 'buchungen' | 'dokumente' | 'aufgaben'
const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'ablauf', label: 'Ablauf', icon: CalendarDays },
  { id: 'planung', label: 'Planung', icon: MapIcon },
  { id: 'buchungen', label: 'Buchungen', icon: Ticket },
  { id: 'dokumente', label: 'Dokumente', icon: FileText },
  { id: 'aufgaben', label: 'Aufgaben', icon: ListChecks },
]

export default function TripDetail({ info }: { info: AppInfo | null }) {
  const { id = '', tab = 'ablauf' } = useParams()
  const nav = useNavigate()
  const [trip, setTrip] = useState<TD | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [bookingForm, setBookingForm] = useState<{ booking?: Booking; type?: BookingType } | null>(null)
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [menu, setMenu] = useState(false)
  const [filter, setFilter] = useState<BookingType | 'all'>('all')
  const [placeEdit, setPlaceEdit] = useState<Place | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [showMap, setShowMap] = useState(false)
  const isDesktop = useIsDesktop()
  const coverInput = useRef<HTMLInputElement>(null)

  const load = useCallback(() => api.trip(id).then(setTrip).catch((e) => setError(e.message)), [id])
  useEffect(() => { load() }, [load])

  if (error) return <div className="mx-auto max-w-3xl p-6"><Link to="/" className="btn-ghost -ml-3"><ArrowLeft size={16} /> Zurück</Link><p className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p></div>
  if (!trip) return <div className="mx-auto max-w-6xl p-6"><div className="card h-64 animate-pulse" /></div>

  const current = (TABS.find((t) => t.id === tab)?.id ?? 'ablauf') as Tab
  const hasGeo =
    trip.places.some((p) => p.lat != null) ||
    trip.bookings.some((b) => b.to_location?.lat != null || b.from_location?.lat != null) ||
    trip.destinations.some((d) => d.lat != null)
  const cd = countdownLabel(trip.start_date, trip.end_date)
  const budgetPct = trip.budget ? Math.min(100, Math.round((trip.total_cost / trip.budget) * 100)) : null
  const usedTypes = TYPE_ORDER.filter((t) => trip.bookings.some((b) => b.type === t))
  const filtered = filter === 'all' ? trip.bookings : trip.bookings.filter((b) => b.type === filter)

  const onCover = async (f?: File) => {
    if (!f) return
    try { setTrip(await api.uploadCover(trip.id, f)) } catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="pb-24">
      {/* Kopfbereich */}
      <div className="relative h-56 overflow-hidden sm:h-72" style={trip.cover_url ? undefined : { background: gradientFor(trip.title) }}>
        {trip.cover_url && <img src={trip.cover_url} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30" />
        <div className="absolute inset-x-0 top-0 mx-auto flex max-w-6xl items-center justify-between px-3 pt-3 sm:px-6">
          <Link to="/" className="icon-btn bg-black/20 text-white backdrop-blur hover:bg-black/40 hover:text-white" aria-label="Zurück"><ArrowLeft size={18} /></Link>
          <div className="relative flex gap-2">
            <button className="icon-btn bg-black/20 text-white backdrop-blur hover:bg-black/40 hover:text-white" onClick={() => coverInput.current?.click()} title="Titelbild ändern"><ImagePlus size={18} /></button>
            <button className="icon-btn bg-black/20 text-white backdrop-blur hover:bg-black/40 hover:text-white" onClick={() => setEditing(true)} title="Bearbeiten"><Pencil size={18} /></button>
            <button className="icon-btn bg-black/20 text-white backdrop-blur hover:bg-black/40 hover:text-white" onClick={() => setMenu(!menu)} aria-label="Mehr"><MoreHorizontal size={18} /></button>
            {menu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-2xl bg-white py-1 text-sm shadow-xl ring-1 ring-slate-900/10 dark:bg-slate-900">
                  {trip.cover_url && (
                    <button className="flex w-full items-center gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={async () => { setMenu(false); setTrip(await api.deleteCover(trip.id)) }}>
                      <ImagePlus size={16} /> Titelbild entfernen
                    </button>
                  )}
                  <button className="flex w-full items-center gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={async () => { setMenu(false); setTrip(await api.updateTrip(trip.id, { archived: !trip.archived })) }}>
                    {trip.archived ? <><ArchiveRestore size={16} /> Aus Archiv holen</> : <><Archive size={16} /> Archivieren</>}
                  </button>
                  <button className="flex w-full items-center gap-2 px-4 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={async () => {
                    setMenu(false)
                    if (confirm(`„${trip.title}“ mit allen Buchungen und Dokumenten endgültig löschen?`)) { await api.deleteTrip(trip.id); nav('/') }
                  }}>
                    <Trash2 size={16} /> Reise löschen
                  </button>
                </div>
              </>
            )}
          </div>
          <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => { onCover(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-5 text-white sm:px-6">
          <div className="mb-2 flex flex-wrap gap-2">
            {cd && <span className={cls('chip backdrop-blur', trip.status === 'running' ? 'bg-emerald-500' : 'bg-white/20')}>{cd}</span>}
            {trip.archived && <span className="chip bg-white/20 backdrop-blur"><Archive size={12} /> Archiviert</span>}
          </div>
          <h1 className="text-3xl font-bold tracking-tight drop-shadow sm:text-4xl">{trip.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
            <span>{fmtRange(trip.start_date, trip.end_date)} · {trip.days} Tage</span>
            {trip.destinations.length > 0 && <span className="flex items-center gap-1"><MapPin size={14} /> {trip.destinations.map((d) => d.name).join(' · ')}</span>}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Kennzahlen */}
        <div className="-mt-px grid grid-cols-2 gap-3 py-4 sm:grid-cols-4">
          <Stat icon={Ticket} label="Buchungen" value={String(trip.booking_count)} />
          <Stat icon={FileText} label="Dokumente" value={String(trip.attachment_count)} />
          <Stat
            icon={ListChecks}
            label={trip.overdue_tasks ? `${trip.overdue_tasks} überfällig` : 'Aufgaben offen'}
            value={String(trip.open_tasks)}
            warn={trip.overdue_tasks > 0}
            onClick={() => nav(`/trip/${trip.id}/aufgaben`, { replace: true })}
          />
          <Stat
            icon={Wallet}
            label={trip.budget ? `Budget ${fmtMoney(trip.budget, trip.currency)}` : 'Kosten'}
            value={fmtMoney(trip.total_cost, trip.currency) || '–'}
            bar={budgetPct}
          />
        </div>
        {trip.description && <p className="mb-4 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{trip.description}</p>}

        {/* Reiter */}
        <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-0.5 overflow-x-auto border-b border-slate-200 bg-slate-50/90 px-2 backdrop-blur [scrollbar-width:none] sm:-mx-6 sm:gap-1 sm:px-6 dark:border-slate-800 dark:bg-slate-950/90">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => nav(`/trip/${trip.id}/${t.id}`, { replace: true })}
              className={cls(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-3.5 text-sm font-medium transition sm:gap-2 sm:px-3',
                current === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
              )}
            >
              <t.icon size={16} className="hidden sm:block" /> <span>{t.label}</span>
              {t.id === 'aufgaben' && trip.open_tasks > 0 && (
                <span className={cls('chip px-1.5 py-0 text-[11px]', trip.overdue_tasks ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200')}>{trip.open_tasks}</span>
              )}
            </button>
          ))}
          <button className="btn-primary my-2 ml-auto hidden px-3 sm:inline-flex" onClick={() => setBookingForm({})}><Plus size={16} /> Buchung</button>
        </div>

        {current === 'ablauf' && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="min-w-0">
              {hasGeo && !isDesktop && (
                <div className="mb-4">
                  <button className="btn-ghost -ml-3 mb-2" onClick={() => setShowMap(!showMap)}>
                    <MapIcon size={16} /> {showMap ? 'Karte ausblenden' : 'Karte anzeigen'}
                  </button>
                  {showMap && <TripMap trip={trip} focus={focus} onPlaceClick={setPlaceEdit} onBookingClick={(b) => setBookingForm({ booking: b })} className="h-72" />}
                </div>
              )}
              <Timeline
                trip={trip}
                onOpen={(b) => setBookingForm({ booking: b })}
                onOpenPlace={setPlaceEdit}
                onLocate={(lat, lon) => { setFocus({ lat, lon, zoom: 15, key: Date.now() }); setShowMap(true) }}
                onPreview={setPreview}
                onAdd={() => setBookingForm({})}
              />
            </div>
            {hasGeo && isDesktop && (
              <div>
                <div className="sticky top-16">
                  <TripMap trip={trip} focus={focus} onPlaceClick={setPlaceEdit} onBookingClick={(b) => setBookingForm({ booking: b })} className="h-[calc(100vh-6rem)] min-h-[420px]" />
                </div>
              </div>
            )}
          </div>
        )}

        {current === 'planung' && <Planning trip={trip} onChanged={load} onOpenBooking={(b) => setBookingForm({ booking: b })} />}

        {current === 'buchungen' && (
          <div>
            {usedTypes.length > 1 && (
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Alle ({trip.bookings.length})</FilterChip>
                {usedTypes.map((t) => {
                  const C = BOOKING_TYPES[t]
                  return (
                    <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)}>
                      <C.icon size={14} /> {C.label} ({trip.bookings.filter((b) => b.type === t).length})
                    </FilterChip>
                  )
                })}
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="card flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500">
                <Receipt size={28} />
                Noch keine Buchungen.
                <button className="btn-primary" onClick={() => setBookingForm({})}><Plus size={16} /> Buchung anlegen</button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filtered.map((b) => <BookingCard key={b.id} booking={b} showDate onOpen={(x) => setBookingForm({ booking: x })} onPreview={setPreview} />)}
              </div>
            )}
          </div>
        )}

        {current === 'dokumente' && <Documents trip={trip} onChanged={load} onPreview={setPreview} />}

        {current === 'aufgaben' && <Tasks trip={trip} onChanged={load} />}

        <p className="mt-10 flex items-center justify-center gap-2 text-xs text-slate-400">
          <MapPin size={14} /> Notizen, Ausgaben und die HA-Anbindung folgen in der nächsten Etappe.
        </p>
      </div>

      {/* Mobile: Plus-Knopf */}
      <button
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-xl sm:hidden"
        onClick={() => setBookingForm({})}
        aria-label="Neue Buchung"
      >
        <Plus size={26} />
      </button>

      {editing && (
        <TripForm open trip={trip} defaultCurrency={info?.default_currency ?? 'EUR'} onClose={() => setEditing(false)} onSaved={(t) => { setTrip(t); setEditing(false) }} />
      )}
      {bookingForm && (
        <BookingForm
          trip={trip}
          booking={bookingForm.booking}
          initialType={bookingForm.type}
          onClose={() => setBookingForm(null)}
          onSaved={() => { setBookingForm(null); load() }}
          onPreview={setPreview}
        />
      )}
      <Preview attachment={preview} onClose={() => setPreview(null)} />
      {placeEdit && <PlaceForm trip={trip} place={placeEdit} onClose={() => setPlaceEdit(null)} onSaved={() => { setPlaceEdit(null); load() }} />}
    </div>
  )
}

function Stat({ icon: Icon, label, value, bar, warn, onClick }: {
  icon: typeof Ticket; label: string; value: string; bar?: number | null; warn?: boolean; onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cls('card p-3 text-left sm:p-4', onClick && 'transition hover:shadow-lg')}>
      <div className={cls('flex items-center gap-1.5', warn ? 'text-red-600 dark:text-red-400' : 'text-slate-500')}><Icon size={14} className="hidden shrink-0 sm:block" /><span className="truncate text-xs">{label}</span></div>
      <p className="mt-1 truncate text-lg font-bold tabular-nums sm:text-xl">{value}</p>
      {bar != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className={cls('h-full rounded-full', bar >= 100 ? 'bg-red-500' : bar >= 80 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${bar}%` }} />
        </div>
      )}
    </Tag>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition',
        active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700',
      )}
    >
      {children}
    </button>
  )
}
