import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BedDouble, Clock, Crosshair, GripVertical, Map as MapIcon, MapPinOff, Search, StickyNote } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type Booking, type Place, type PlaceCategory, type TripDetail } from '../api'
import { CATEGORY_ORDER, PLACE_CATEGORIES, PlaceSearch, UNPLANNED_COLOR, dayColor, tripCenter } from '../places'
import { cls, eachDay, fmtDayHeader, localDay, useIsDesktop } from '../util'
import PlaceForm from './PlaceForm'
import TripMap, { type MapFocus } from './TripMap'

interface Props {
  trip: TripDetail
  onChanged: () => void
  onOpenBooking: (b: Booking) => void
}

const UNPLANNED = 'c:unplanned'
const cid = (day: string | null) => (day ? `c:${day}` : UNPLANNED)
const dayOf = (c: string) => (c === UNPLANNED ? null : c.slice(2))

function buildContainers(places: Place[], days: string[]) {
  const m: Record<string, string[]> = { [UNPLANNED]: [] }
  for (const d of days) m[cid(d)] = []
  const sorted = [...places].sort((a, b) => a.sort_order - b.sort_order)
  for (const p of sorted) {
    const k = cid(p.day)
    if (!m[k]) m[k] = [] // Ort liegt außerhalb des Reisezeitraums
    m[k].push(p.id)
  }
  return m
}

export default function Planning({ trip, onChanged, onOpenBooking }: Props) {
  const days = useMemo(() => eachDay(trip.start_date, trip.end_date), [trip.start_date, trip.end_date])
  const byId = useMemo(() => new Map(trip.places.map((p) => [p.id, p])), [trip.places])
  const [containers, setContainers] = useState(() => buildContainers(trip.places, days))
  const [dragId, setDragId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<string>('')
  const [filter, setFilter] = useState<PlaceCategory | null>(null)
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [editing, setEditing] = useState<Place | null>(null)
  const [showMap, setShowMap] = useState(true)
  const [error, setError] = useState('')
  const isDesktop = useIsDesktop()

  useEffect(() => setContainers(buildContainers(trip.places, days)), [trip.places, days])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const near = tripCenter([...trip.places, ...trip.destinations, ...trip.bookings.map((b) => b.to_location ?? { lat: null, lon: null })])
  const usedCats = CATEGORY_ORDER.filter((c) => trip.places.some((p) => p.category === c))
  const dayIdx = (c: string) => days.indexOf(dayOf(c) ?? '')

  const lodgingFor = (d: string) =>
    trip.bookings.find((b) => b.type === 'lodging' && b.status !== 'cancelled' && localDay(b.start_at) <= d && d < (localDay(b.end_at) || localDay(b.start_at)))

  const find = (id: string) => (id in containers ? id : Object.keys(containers).find((k) => containers[k].includes(id)))

  const persist = async (next: Record<string, string[]>) => {
    const moves = Object.entries(next).flatMap(([c, ids]) => ids.map((id, i) => ({ id, day: dayOf(c), sort_order: i })))
    try {
      await api.arrangePlaces(trip.id, moves)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
      setContainers(buildContainers(trip.places, days))
    }
  }

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id))

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const from = find(String(active.id))
    const to = find(String(over.id))
    if (!from || !to || from === to) return
    setContainers((c) => {
      const fromList = c[from].filter((x) => x !== active.id)
      const toList = [...c[to]]
      const overIdx = toList.indexOf(String(over.id))
      toList.splice(overIdx >= 0 ? overIdx : toList.length, 0, String(active.id))
      return { ...c, [from]: fromList, [to]: toList }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragId(null)
    if (!over) return
    const c = find(String(active.id))
    const o = find(String(over.id))
    let next = containers
    if (c && o && c === o) {
      const list = containers[c]
      const a = list.indexOf(String(active.id))
      const b = list.indexOf(String(over.id))
      if (b >= 0 && a !== b) next = { ...containers, [c]: arrayMove(list, a, b) }
    }
    setContainers(next)
    // Nur speichern, wenn sich etwas geändert hat
    const original = buildContainers(trip.places, days)
    if (JSON.stringify(original) !== JSON.stringify(next)) persist(next)
  }

  const addFromSearch = async (r: { name: string; address?: string | null; lat?: number | null; lon?: number | null; category?: PlaceCategory; source_ref?: string | null }) => {
    setError('')
    try {
      const p = await api.createPlace(trip.id, {
        name: r.name,
        address: r.address || null,
        lat: r.lat ?? null,
        lon: r.lon ?? null,
        category: r.category ?? 'other',
        source_ref: r.source_ref ?? null,
        day: target || null,
      })
      setQuery('')
      if (p.lat != null) setFocus({ lat: p.lat, lon: p.lon!, zoom: 15, key: Date.now() })
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const showOnMap = (p: Place) => {
    if (p.lat != null) setFocus({ lat: p.lat, lon: p.lon!, zoom: 16, key: Date.now() })
    setShowMap(true)
  }

  const renderList = (c: string) => {
    const ids = containers[c] ?? []
    const visible = filter ? ids.filter((id) => byId.get(id)?.category === filter) : ids
    const idx = dayIdx(c)
    return (
      <DroppableList id={c} empty={ids.length === 0} disabled={!!filter}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!!filter}>
          {visible.map((id, i) => {
            const p = byId.get(id)
            if (!p) return null
            return (
              <SortablePlace
                key={id}
                place={p}
                number={c === UNPLANNED ? null : (filter ? ids.indexOf(id) : i) + 1}
                color={c === UNPLANNED ? UNPLANNED_COLOR : dayColor(idx)}
                onOpen={() => setEditing(p)}
                onLocate={() => showOnMap(p)}
                onHover={setHover}
                dragDisabled={!!filter}
              />
            )
          })}
        </SortableContext>
      </DroppableList>
    )
  }

  const dragged = dragId ? byId.get(dragId) : null
  const draggedContainer = dragId ? find(dragId) : null

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Liste */}
      <div className="min-w-0 space-y-4">
        <div className="card space-y-2 p-3">
          <PlaceSearch
            value={query}
            onChange={setQuery}
            near={near}
            icon={<Search size={16} />}
            onSelect={(r) => addFromSearch(r)}
            onSubmitText={(t) => t.trim() && addFromSearch({ name: t.trim() })}
          />
          <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500">
            <span>Hinzufügen zu</span>
            <select className="rounded-lg border-0 bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Ungeplant</option>
              {days.map((d, i) => <option key={d} value={d}>Tag {i + 1} – {fmtDayHeader(d)}</option>)}
            </select>
            <span className="ml-auto hidden sm:inline">Enter ohne Treffer = Ort ohne Karte anlegen</span>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        </div>

        {usedCats.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            <button onClick={() => setFilter(null)} className={cls('chip shrink-0 py-1', !filter ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700')}>Alle</button>
            {usedCats.map((c) => {
              const C = PLACE_CATEGORIES[c]
              return (
                <button key={c} onClick={() => setFilter(filter === c ? null : c)} className={cls('chip shrink-0 gap-1.5 py-1', filter === c ? 'text-white' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700')} style={filter === c ? { background: C.color } : undefined}>
                  <C.icon size={12} /> {C.label}
                </button>
              )
            })}
          </div>
        )}
        {filter && <p className="-mt-2 text-xs text-slate-500">Filter aktiv – zum Verschieben den Filter aufheben.</p>}

        {/* Karte auf dem Handy */}
        {!isDesktop && <div>
          <button className="btn-ghost -ml-3 mb-2" onClick={() => setShowMap(!showMap)}>
            <MapIcon size={16} /> {showMap ? 'Karte ausblenden' : 'Karte anzeigen'}
          </button>
          {showMap && <TripMap trip={trip} activeDay={activeDay} focus={focus} highlightId={hover} onPlaceClick={setEditing} onBookingClick={onOpenBooking} className="h-72" />}
        </div>}

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragId(null); setContainers(buildContainers(trip.places, days)) }}>
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: UNPLANNED_COLOR }} />
              <h3 className="text-sm font-semibold">Ungeplant</h3>
              <span className="text-xs text-slate-400">{containers[UNPLANNED]?.length ?? 0}</span>
            </div>
            {renderList(UNPLANNED)}
          </section>

          {days.map((d, i) => {
            const c = cid(d)
            const lodging = lodgingFor(d)
            const active = activeDay === d
            return (
              <section key={d}>
                <button
                  onClick={() => setActiveDay(active ? null : d)}
                  className={cls('mb-2 flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left transition', active && 'bg-brand-50 dark:bg-brand-500/10')}
                  title="Auf der Karte hervorheben"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: dayColor(i) }} />
                  <span className="shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-wider" style={{ color: dayColor(i) }}>Tag {i + 1}</span>
                  <h3 className="min-w-0 truncate text-sm font-semibold">{fmtDayHeader(d)}</h3>
                  <span className="shrink-0 text-xs text-slate-400">{containers[c]?.length ?? 0}</span>
                  {lodging && (
                    <span className="ml-auto flex min-w-0 shrink items-center gap-1 truncate text-xs text-slate-400" title={lodging.to_location?.name || lodging.title} onClick={(e) => { e.stopPropagation(); onOpenBooking(lodging) }}>
                      <BedDouble size={12} className="shrink-0" /> <span className="hidden truncate sm:inline">{lodging.to_location?.name || lodging.title}</span>
                    </span>
                  )}
                </button>
                {renderList(c)}
              </section>
            )
          })}

          {/* Orte außerhalb des Reisezeitraums */}
          {Object.keys(containers)
            .filter((c) => c !== UNPLANNED && !days.includes(dayOf(c)!) && containers[c].length)
            .map((c) => (
              <section key={c}>
                <h3 className="mb-2 text-sm font-semibold text-amber-600">Außerhalb der Reise: {fmtDayHeader(dayOf(c)!)}</h3>
                {renderList(c)}
              </section>
            ))}

          <DragOverlay>
            {dragged && (
              <PlaceRow
                place={dragged}
                number={null}
                color={draggedContainer && draggedContainer !== UNPLANNED ? dayColor(dayIdx(draggedContainer)) : UNPLANNED_COLOR}
                overlay
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Karte am Desktop */}
      {isDesktop && <div>
        <div className="sticky top-16">
          <TripMap
            trip={trip}
            activeDay={activeDay}
            focus={focus}
            highlightId={hover}
            onPlaceClick={setEditing}
            onBookingClick={onOpenBooking}
            className="h-[calc(100vh-6rem)] min-h-[420px]"
          />
        </div>
      </div>}

      {editing && <PlaceForm trip={trip} place={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged() }} />}
    </div>
  )
}

function DroppableList({ id, empty, disabled, children }: { id: string; empty: boolean; disabled?: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      className={cls(
        'min-h-[52px] space-y-2 rounded-2xl transition',
        empty && 'flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800',
        isOver && 'bg-brand-50/60 ring-2 ring-brand-300 dark:bg-brand-500/10',
      )}
    >
      {empty ? <span className="text-xs text-slate-400">Orte hierher ziehen</span> : children}
    </div>
  )
}

interface RowProps {
  place: Place
  number: number | null
  color: string
  overlay?: boolean
  onOpen?: () => void
  onLocate?: () => void
  onHover?: (id: string | null) => void
  dragProps?: Record<string, unknown>
  dragging?: boolean
  dragDisabled?: boolean
}

function PlaceRow({ place: p, number, color, overlay, onOpen, onLocate, onHover, dragProps, dragging, dragDisabled }: RowProps) {
  const C = PLACE_CATEGORIES[p.category] ?? PLACE_CATEGORIES.other
  return (
    <div
      onMouseEnter={() => onHover?.(p.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cls(
        'card group flex items-center gap-3 p-2.5 pr-2',
        overlay && 'rotate-1 shadow-2xl ring-2 ring-brand-400',
        dragging && 'opacity-30',
      )}
    >
      <span
        {...dragProps}
        className={cls('flex shrink-0 touch-none items-center text-slate-300 dark:text-slate-600', dragDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing')}
        aria-label="Verschieben"
      >
        <GripVertical size={16} />
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm" style={{ background: number ? color : C.color }}>
        {number ?? <C.icon size={15} />}
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <span className="block truncate text-sm font-semibold">{p.name}</span>
        <span className="flex items-center gap-1.5 truncate text-xs text-slate-500">
          <C.icon size={11} className="shrink-0" style={{ color: C.color }} />
          <span className="truncate">{p.address || C.label}</span>
        </span>
      </button>
      {p.notes && <StickyNote size={14} className="shrink-0 text-slate-300" />}
      {p.time && <span className="chip shrink-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Clock size={11} /> {p.time}</span>}
      {p.lat == null ? (
        <span title="Keine Koordinaten"><MapPinOff size={15} className="shrink-0 text-amber-500" /></span>
      ) : (
        onLocate && <button className="icon-btn h-8 w-8 shrink-0" onClick={onLocate} title="Auf Karte zeigen"><Crosshair size={15} /></button>
      )}
    </div>
  )
}

function SortablePlace(props: Omit<RowProps, 'dragProps' | 'dragging'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.place.id, disabled: props.dragDisabled })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <PlaceRow {...props} dragProps={{ ...attributes, ...listeners }} dragging={isDragging} />
    </div>
  )
}
