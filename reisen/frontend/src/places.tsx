import { BedDouble, Landmark, MapPin, ShoppingBag, TrainFront, Trees, UtensilsCrossed, Wine, type LucideIcon } from 'lucide-react'
import { api, type GeoResult, type PlaceCategory } from './api'
import { Autocomplete } from './components/Autocomplete'

export const PLACE_CATEGORIES: Record<PlaceCategory, { label: string; icon: LucideIcon; color: string }> = {
  sight: { label: 'Sehenswürdigkeit', icon: Landmark, color: '#7c3aed' },
  food: { label: 'Essen & Trinken', icon: UtensilsCrossed, color: '#ea580c' },
  nature: { label: 'Natur', icon: Trees, color: '#16a34a' },
  shopping: { label: 'Shopping', icon: ShoppingBag, color: '#db2777' },
  nightlife: { label: 'Nachtleben', icon: Wine, color: '#9333ea' },
  lodging: { label: 'Unterkunft', icon: BedDouble, color: '#4f46e5' },
  transport: { label: 'Verkehr', icon: TrainFront, color: '#0891b2' },
  other: { label: 'Sonstiges', icon: MapPin, color: '#64748b' },
}

export const CATEGORY_ORDER: PlaceCategory[] = ['sight', 'food', 'nature', 'shopping', 'nightlife', 'lodging', 'transport', 'other']

/** Farben pro Reisetag (Marker, Linien, Badges) */
export const DAY_COLORS = ['#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626', '#4f46e5', '#059669']
export const UNPLANNED_COLOR = '#94a3b8'

export function dayColor(index: number) {
  return index < 0 ? UNPLANNED_COLOR : DAY_COLORS[index % DAY_COLORS.length]
}

interface PlaceSearchProps {
  value: string
  onChange: (v: string) => void
  onSelect: (r: GeoResult) => void
  onSubmitText?: (v: string) => void
  near?: { lat: number; lon: number } | null
  placeholder?: string
  autoFocus?: boolean
  icon?: React.ReactNode
}

/** Ortssuche über OpenStreetMap (über das Backend) */
export function PlaceSearch({ value, onChange, onSelect, onSubmitText, near, placeholder, autoFocus, icon }: PlaceSearchProps) {
  return (
    <Autocomplete<GeoResult>
      value={value}
      onChange={onChange}
      onSelect={onSelect}
      onSubmitText={onSubmitText}
      search={(q) => api.searchPlaces(q, near)}
      itemKey={(r) => r.source_ref + r.lat}
      minChars={3}
      delay={400}
      autoFocus={autoFocus}
      icon={icon}
      placeholder={placeholder ?? 'Ort, Adresse oder Sehenswürdigkeit suchen'}
      render={(r) => {
        const C = PLACE_CATEGORIES[r.category] ?? PLACE_CATEGORIES.other
        return (
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: C.color }}>
              <C.icon size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.name}</span>
              {r.address && <span className="block truncate text-xs text-slate-500">{r.address}</span>}
            </span>
          </div>
        )
      }}
    />
  )
}

/** Mittelpunkt einer Reise für die Suche (Orte > Ziele) */
export function tripCenter(points: { lat?: number | null; lon?: number | null }[]) {
  const pts = points.filter((p): p is { lat: number; lon: number } => p.lat != null && p.lon != null)
  if (!pts.length) return null
  return {
    lat: Math.round((pts.reduce((a, p) => a + p.lat, 0) / pts.length) * 100) / 100,
    lon: Math.round((pts.reduce((a, p) => a + p.lon, 0) / pts.length) * 100) / 100,
  }
}
