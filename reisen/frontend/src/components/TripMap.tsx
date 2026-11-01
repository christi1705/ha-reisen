import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Layers, Maximize2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { api, type Booking, type Place, type TileConfig, type TripDetail } from '../api'
import { BOOKING_TYPES } from '../bookingTypes'
import { PLACE_CATEGORIES, dayColor } from '../places'
import { cls, eachDay } from '../util'

export interface MapFocus {
  lat: number
  lon: number
  zoom?: number
  key: number
}

interface Props {
  trip: TripDetail
  /** Optional: nur diesen Tag hervorheben (YYYY-MM-DD) */
  activeDay?: string | null
  /** Nur diesen Tag zeigen (alles andere ausblenden) und auf alle Stationen des Tages zoomen */
  dayOnly?: string | null
  /** Grobe Übersicht: nur Unterkünfte und Strecken (keine einzelnen Orte/Termine) */
  overview?: boolean
  focus?: MapFocus | null
  onPlaceClick?: (p: Place) => void
  onBookingClick?: (b: Booking) => void
  className?: string
  /** Hervorgehobener Ort (z. B. beim Überfahren in der Liste) */
  highlightId?: string | null
}

type LayerKey = 'places' | 'stays' | 'transport'
const LAYER_LABEL: Record<LayerKey, string> = { places: 'Orte', stays: 'Unterkünfte & Aktivitäten', transport: 'Verkehr' }
const OSM_FALLBACK: TileConfig = {
  url: 'api/tiles/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
  subdomains: '',
  max_zoom: 19,
  provider: 'osm',
}
const STAY_TYPES = new Set(['lodging', 'restaurant', 'activity'])

const iconCache = new Map<string, L.DivIcon>()

function pinIcon(color: string, label: string, opts: { dim?: boolean; big?: boolean } = {}) {
  const k = `p|${color}|${label}|${opts.dim}|${opts.big}`
  if (!iconCache.has(k)) {
    const size = opts.big ? 34 : 28
    iconCache.set(
      k,
      L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<div class="map-pin${opts.dim ? ' map-pin-dim' : ''}${opts.big ? ' map-pin-big' : ''}" style="background:${color}">${label}</div>`,
      }),
    )
  }
  return iconCache.get(k)!
}

function bookingIcon(b: Booking, dim: boolean) {
  const k = `b|${b.type}|${dim}`
  if (!iconCache.has(k)) {
    const cfg = BOOKING_TYPES[b.type]
    const svg = renderToStaticMarkup(<cfg.icon size={15} color="white" strokeWidth={2.2} />)
    iconCache.set(
      k,
      L.divIcon({
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        html: `<div class="map-pin map-pin-square${dim ? ' map-pin-dim' : ''}" style="background:#0f172a">${svg}</div>`,
      }),
    )
  }
  return iconCache.get(k)!
}

function categoryGlyph(cat: string) {
  const C = PLACE_CATEGORIES[cat as keyof typeof PLACE_CATEGORIES] ?? PLACE_CATEGORIES.other
  return renderToStaticMarkup(<C.icon size={13} color="white" strokeWidth={2.4} />)
}

/** Bogen zwischen zwei Punkten (für Flüge), wölbt sich wie ein Großkreis Richtung Pol */
function arc(a: [number, number], b: [number, number], n = 48): [number, number][] {
  const [lat1, lon1] = a
  let [lat2, lon2] = b
  if (Math.abs(lon2 - lon1) > 180) lon2 += lon2 > lon1 ? -360 : 360
  const mx = (lat1 + lat2) / 2
  const my = (lon1 + lon2) / 2
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  // Senkrechte zur Verbindungslinie, Richtung des näheren Pols
  let px = -dLon
  let py = dLat
  if ((mx >= 0 && px < 0) || (mx < 0 && px > 0)) { px = -px; py = -py }
  const k = 0.2
  const cx = mx + px * k
  const cy = my + py * k
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push([(1 - t) ** 2 * lat1 + 2 * (1 - t) * t * cx + t * t * lat2, (1 - t) ** 2 * lon1 + 2 * (1 - t) * t * cy + t * t * lon2])
  }
  return pts
}

const has = (l: { lat?: number | null; lon?: number | null } | null | undefined): l is { lat: number; lon: number } =>
  !!l && l.lat != null && l.lon != null

function FitBounds({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap()
  const last = useRef('')
  useEffect(() => {
    const tryFit = () => {
      if (fitKey === last.current) return
      const size = map.getSize()
      if (!size.x || !size.y) return // unsichtbar: beim nächsten resize erneut
      last.current = fitKey
      if (points.length === 0) map.setView([30, 10], 2)
      else if (points.length === 1) map.setView(points[0], 13)
      else map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 })
    }
    tryFit()
    map.on('resize', tryFit)
    return () => { map.off('resize', tryFit) }
  }, [fitKey, points, map])
  return null
}

function FlyTo({ focus }: { focus?: MapFocus | null }) {
  const map = useMap()
  useEffect(() => {
    if (!focus) return
    const size = map.getSize()
    if (!size.x || !size.y) return
    try {
      map.flyTo([focus.lat, focus.lon], focus.zoom ?? Math.max(map.getZoom(), 14), { duration: 0.6 })
    } catch {
      map.setView([focus.lat, focus.lon], focus.zoom ?? 14)
    }
  }, [focus, map])
  return null
}

function InvalidateOnResize() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])
  return null
}

export default function TripMap({ trip, activeDay: activeDayProp, dayOnly, overview, focus, onPlaceClick, onBookingClick, className, highlightId }: Props) {
  const activeDay = dayOnly ?? activeDayProp
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ places: true, stays: true, transport: true })
  const [menu, setMenu] = useState(false)
  const [fitNonce, setFitNonce] = useState(0)
  const [tiles, setTiles] = useState<TileConfig | null>(null)
  useEffect(() => { api.info().then((i) => setTiles(i.tiles)).catch(() => setTiles(OSM_FALLBACK)) }, [])

  const days = useMemo(() => eachDay(trip.start_date, trip.end_date), [trip.start_date, trip.end_date])
  const dayIndex = (d: string | null) => (d ? days.indexOf(d) : -1)

  // Orte nach Tag gruppieren und nummerieren
  const placesByDay = useMemo(() => {
    const m = new Map<string, Place[]>()
    for (const p of trip.places) {
      if (!has(p)) continue
      if (overview) continue
      if (dayOnly && p.day !== dayOnly) continue
      const k = p.day ?? ''
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(p)
    }
    for (const list of m.values()) list.sort((a, b) => a.sort_order - b.sort_order)
    return m
  }, [trip.places, dayOnly, overview])

  const day10 = (v: string | null) => (v ? v.slice(0, 10) : '')
  // Im Tagesmodus: nur was zu diesem Tag gehört
  const relevantStay = (b: Booking) => {
    if (overview) return b.type === 'lodging'
    if (!dayOnly) return true
    if (b.type === 'lodging') {
      const s = day10(b.start_at)
      const e = day10(b.end_at) || s
      // Übernachtung dieser Nacht oder Check-out an diesem Morgen
      return (s <= dayOnly && dayOnly < e) || e === dayOnly
    }
    return day10(b.start_at) === dayOnly
  }
  const relevantRoute = (b: Booking) => !dayOnly || day10(b.start_at) === dayOnly || day10(b.end_at) === dayOnly
  const stays = trip.bookings.filter((b) => STAY_TYPES.has(b.type) && has(b.to_location) && b.status !== 'cancelled' && relevantStay(b))
  const routes = trip.bookings.filter((b) => !STAY_TYPES.has(b.type) && has(b.from_location) && has(b.to_location) && b.status !== 'cancelled' && relevantRoute(b))

  // Bereich für die Ansicht
  const fitPoints = useMemo(() => {
    const pts: [number, number][] = []
    if (dayOnly) {
      // Alle Stationen des Tages: Orte, Unterkünfte/Termine und Start/Ziel der Fahrten
      for (const list of placesByDay.values()) for (const p of list) pts.push([p.lat!, p.lon!])
      for (const b of stays) pts.push([b.to_location!.lat!, b.to_location!.lon!])
      for (const b of routes) pts.push([b.from_location!.lat!, b.from_location!.lon!], [b.to_location!.lat!, b.to_location!.lon!])
      return pts
    }
    if (activeDay) {
      for (const p of placesByDay.get(activeDay) ?? []) pts.push([p.lat!, p.lon!])
    }
    if (!pts.length) {
      for (const list of placesByDay.values()) for (const p of list) pts.push([p.lat!, p.lon!])
      for (const b of stays) pts.push([b.to_location!.lat!, b.to_location!.lon!])
      // Übersicht: Bahn-/Bus-/Autostrecken gehören zum Ausschnitt (Flüge nicht, sonst halbe Weltkarte)
      if (overview) for (const b of routes) if (b.type !== 'flight') pts.push([b.from_location!.lat!, b.from_location!.lon!], [b.to_location!.lat!, b.to_location!.lon!])
      // Flüge nur einbeziehen, wenn sonst nichts da ist (sonst halbe Weltkarte)
      if (!pts.length) for (const b of routes) pts.push([b.from_location!.lat!, b.from_location!.lon!], [b.to_location!.lat!, b.to_location!.lon!])
      if (!pts.length) for (const d of trip.destinations) if (has(d)) pts.push([d.lat, d.lon])
    }
    return pts
  }, [activeDay, dayOnly, overview, placesByDay, stays, routes, trip.destinations])

  const fitKey = `${trip.id}|${activeDay ?? ''}|${dayOnly ? 'only' : ''}|${fitPoints.length}|${fitNonce}`
  const dimOther = (d: string | null) => !dayOnly && !!activeDay && d !== activeDay

  return (
    <div className={cls('relative isolate overflow-hidden rounded-2xl ring-1 ring-slate-900/10 dark:ring-white/10', className)}>
      <MapContainer center={[30, 10]} zoom={2} className="h-full w-full" zoomControl={false} attributionControl>
        {tiles && (
          <TileLayer
            key={tiles.url}
            url={tiles.url}
            attribution={tiles.attribution}
            {...(tiles.subdomains ? { subdomains: tiles.subdomains } : {})}
            maxZoom={tiles.max_zoom}
          />
        )}
        <FitBounds points={fitPoints} fitKey={fitKey} />
        <FlyTo focus={focus} />
        <InvalidateOnResize />

        {/* Verkehr */}
        {layers.transport &&
          routes.map((b) => {
            const a: [number, number] = [b.from_location!.lat!, b.from_location!.lon!]
            const z: [number, number] = [b.to_location!.lat!, b.to_location!.lon!]
            const isFlight = b.type === 'flight'
            return (
              <Polyline
                key={b.id}
                positions={isFlight ? arc(a, z) : [a, z]}
                pathOptions={{ color: isFlight ? '#0ea5e9' : '#0f172a', weight: isFlight ? 2.5 : 3, dashArray: isFlight ? '6 8' : '2 7', opacity: 0.85 }}
                eventHandlers={{ click: () => onBookingClick?.(b) }}
              >
                <Tooltip sticky>{b.title}</Tooltip>
              </Polyline>
            )
          })}
        {layers.transport &&
          routes.flatMap((b) =>
            [b.from_location!, b.to_location!].map((l, i) => (
              <Marker key={`${b.id}-${i}`} position={[l.lat!, l.lon!]} icon={bookingIcon(b, false)} eventHandlers={{ click: () => onBookingClick?.(b) }}>
                <Tooltip direction="top" offset={[0, -12]}>{l.name}</Tooltip>
              </Marker>
            )),
          )}

        {/* Tagesrouten */}
        {layers.places &&
          [...placesByDay.entries()]
            .filter(([d, list]) => d && list.length > 1)
            .map(([d, list]) => (
              <Polyline
                key={`route-${d}`}
                positions={list.map((p) => [p.lat!, p.lon!] as [number, number])}
                pathOptions={{ color: dayColor(dayIndex(d)), weight: dimOther(d) ? 2 : 4, opacity: dimOther(d) ? 0.25 : 0.8 }}
              />
            ))}

        {/* Unterkünfte, Restaurants, Aktivitäten */}
        {layers.stays &&
          stays.map((b) => (
            <Marker
              key={b.id}
              position={[b.to_location!.lat!, b.to_location!.lon!]}
              icon={bookingIcon(b, !dayOnly && !!activeDay && b.type !== 'lodging' && b.start_at?.slice(0, 10) !== activeDay)}
              eventHandlers={{ click: () => onBookingClick?.(b) }}
              zIndexOffset={-100}
            >
              <Tooltip direction="top" offset={[0, -12]}>{b.title}</Tooltip>
            </Marker>
          ))}

        {/* Reiseziele (nur Übersicht, wenn es noch keine Unterkünfte gibt) */}
        {overview && stays.length === 0 &&
          trip.destinations.filter(has).map((d) => (
            <Marker key={`dest-${d.name}`} position={[d.lat!, d.lon!]} icon={pinIcon('#64748b', '')}>
              <Tooltip direction="top" offset={[0, -14]}>{d.name}</Tooltip>
            </Marker>
          ))}

        {/* Orte */}
        {layers.places &&
          [...placesByDay.entries()].flatMap(([d, list]) =>
            list.map((p, i) => {
              const idx = dayIndex(d || null)
              const label = d ? String(i + 1) : categoryGlyph(p.category)
              return (
                <Marker
                  key={p.id}
                  position={[p.lat!, p.lon!]}
                  icon={pinIcon(dayColor(idx), label, { dim: dimOther(d || null), big: highlightId === p.id })}
                  eventHandlers={{ click: () => onPlaceClick?.(p) }}
                  zIndexOffset={highlightId === p.id ? 1000 : d ? 100 : 0}
                >
                  <Tooltip direction="top" offset={[0, -14]}>
                    <b>{p.name}</b>
                    {d && <span className="block text-[11px] opacity-70">Tag {idx + 1}{p.time ? ` · ${p.time}` : ''}</span>}
                    {!d && <span className="block text-[11px] opacity-70">ungeplant</span>}
                  </Tooltip>
                </Marker>
              )
            }),
          )}
      </MapContainer>

      {/* Bedienelemente */}
      <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
        <div className="flex gap-1.5">
          <button className="map-btn" onClick={() => setFitNonce((n) => n + 1)} title="Alles anzeigen"><Maximize2 size={16} /></button>
          <button className="map-btn" onClick={() => setMenu(!menu)} title="Ebenen"><Layers size={16} /></button>
        </div>
        {menu && (
          <div className="w-56 rounded-xl bg-white p-2 text-sm shadow-xl ring-1 ring-slate-900/10 dark:bg-slate-900">
            {(Object.keys(LAYER_LABEL) as LayerKey[]).map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                <input type="checkbox" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} className="accent-brand-600" />
                {LAYER_LABEL[k]}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Legende der Tage */}
      {!dayOnly && !overview && days.length > 1 && trip.places.some((p) => p.day) && (
        <div className="pointer-events-none absolute bottom-6 left-3 z-[500] flex max-w-[70%] flex-wrap gap-1">
          {days.map((d, i) =>
            placesByDay.has(d) ? (
              <span key={d} className={cls('chip bg-white/95 text-[11px] shadow dark:bg-slate-900/95', dimOther(d) && 'opacity-40')}>
                <span className="h-2 w-2 rounded-full" style={{ background: dayColor(i) }} /> Tag {i + 1}
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}
