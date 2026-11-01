// API-Zugriff – immer relative Pfade, damit HA Ingress funktioniert.

export type BookingType =
  | 'flight' | 'train' | 'bus' | 'boat' | 'car' | 'taxi' | 'rental_car' | 'bike'
  | 'lodging' | 'restaurant' | 'activity'
export type BookingStatus = 'idea' | 'booked' | 'confirmed' | 'cancelled'

export interface Location {
  name: string
  lat?: number | null
  lon?: number | null
  ref?: string | null
  address?: string | null
}

export interface Destination {
  name: string
  lat?: number | null
  lon?: number | null
  country_code?: string | null
}

export interface Attachment {
  id: string
  trip_id: string
  booking_id: string | null
  filename: string
  mime: string
  size: number
  url: string
  uploaded_by: string | null
  uploaded_at: string
}

export interface Booking {
  id: string
  trip_id: string
  type: BookingType
  title: string
  provider: string | null
  confirmation_code: string | null
  status: BookingStatus
  start_at: string | null
  start_tz: string | null
  end_at: string | null
  end_tz: string | null
  start_utc: string | null
  end_utc: string | null
  from_location: Location | null
  to_location: Location | null
  cost: number | null
  cost_currency: string | null
  details: Record<string, string>
  notes: string | null
  attachments: Attachment[]
}

export interface Trip {
  id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  destinations: Destination[]
  currency: string
  budget: number | null
  archived: boolean
  cover_url: string | null
  status: 'upcoming' | 'running' | 'past'
  days: number
  booking_count: number
  attachment_count: number
  total_cost: number
  place_count: number
  open_tasks: number
  overdue_tasks: number
  next_booking: { id: string; type: BookingType; title: string; start_at: string | null; start_tz: string | null } | null
  created_by: string | null
}

export interface Task {
  id: string
  trip_id: string
  title: string
  done: boolean
  due_date: string | null
  notes: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  done_at: string | null
}

export type PlaceCategory = 'sight' | 'food' | 'nature' | 'shopping' | 'nightlife' | 'lodging' | 'transport' | 'other'

export interface Place {
  id: string
  trip_id: string
  name: string
  address: string | null
  lat: number | null
  lon: number | null
  category: PlaceCategory
  source_ref: string | null
  day: string | null
  sort_order: number
  time: string | null
  duration_min: number | null
  url: string | null
  notes: string | null
}

export type PlaceInput = Partial<Omit<Place, 'id' | 'trip_id' | 'sort_order'>> & { name?: string }

export interface GeoResult {
  name: string
  address: string
  lat: number
  lon: number
  category: PlaceCategory
  kind: string
  country_code: string | null
  source_ref: string
}

export interface TripDetail extends Trip {
  bookings: Booking[]
  attachments: Attachment[]
  tasks: Task[]
  places: Place[]
}

export interface Airport {
  iata: string
  icao: string
  name: string
  city: string
  country: string
  lat: number
  lon: number
  tz: string
}

export interface Airline {
  iata: string
  icao: string
  name: string
  country: string
}

export interface AppInfo {
  user: string | null
  default_currency: string
  default_timezone: string
  version: string
}

export type TripInput = Pick<Trip, 'title' | 'start_date' | 'end_date' | 'destinations' | 'currency'> & {
  description?: string | null
  budget?: number | null
}
export type BookingInput = Omit<Booking, 'id' | 'trip_id' | 'start_utc' | 'end_utc' | 'attachments'>

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const j = await res.json()
      if (typeof j.detail === 'string') msg = j.detail
      else if (Array.isArray(j.detail)) msg = j.detail.map((d: { msg: string }) => d.msg).join(', ')
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  info: () => req<AppInfo>('GET', 'api/info'),
  trips: () => req<Trip[]>('GET', 'api/trips'),
  trip: (id: string) => req<TripDetail>('GET', `api/trips/${id}`),
  createTrip: (d: TripInput) => req<TripDetail>('POST', 'api/trips', d),
  updateTrip: (id: string, d: Partial<TripInput> & { archived?: boolean }) => req<TripDetail>('PATCH', `api/trips/${id}`, d),
  deleteTrip: (id: string) => req<void>('DELETE', `api/trips/${id}`),
  uploadCover: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return req<TripDetail>('POST', `api/trips/${id}/cover`, fd)
  },
  deleteCover: (id: string) => req<TripDetail>('DELETE', `api/trips/${id}/cover`),

  createBooking: (tripId: string, d: BookingInput) => req<Booking>('POST', `api/trips/${tripId}/bookings`, d),
  updateBooking: (id: string, d: Partial<BookingInput>) => req<Booking>('PATCH', `api/bookings/${id}`, d),
  deleteBooking: (id: string, withFiles = false) =>
    req<void>('DELETE', `api/bookings/${id}?delete_attachments=${withFiles}`),

  upload: (tripId: string, files: File[], bookingId?: string | null) => {
    const fd = new FormData()
    fd.append('trip_id', tripId)
    if (bookingId) fd.append('booking_id', bookingId)
    files.forEach((f) => fd.append('files', f))
    return req<Attachment[]>('POST', 'api/attachments', fd)
  },
  updateAttachment: (id: string, d: { filename?: string; booking_id?: string | null }) =>
    req<Attachment>('PATCH', `api/attachments/${id}`, d),
  deleteAttachment: (id: string) => req<void>('DELETE', `api/attachments/${id}`),

  createTask: (tripId: string, d: { title: string; due_date?: string | null; notes?: string | null }) =>
    req<Task>('POST', `api/trips/${tripId}/tasks`, d),
  updateTask: (id: string, d: Partial<Pick<Task, 'title' | 'done' | 'due_date' | 'notes'>>) => req<Task>('PATCH', `api/tasks/${id}`, d),
  deleteTask: (id: string) => req<void>('DELETE', `api/tasks/${id}`),
  clearDoneTasks: (tripId: string) => req<void>('POST', `api/trips/${tripId}/tasks/clear-done`),

  createPlace: (tripId: string, d: PlaceInput & { name: string }) => req<Place>('POST', `api/trips/${tripId}/places`, d),
  updatePlace: (id: string, d: PlaceInput) => req<Place>('PATCH', `api/places/${id}`, d),
  deletePlace: (id: string) => req<void>('DELETE', `api/places/${id}`),
  arrangePlaces: (tripId: string, moves: { id: string; day: string | null; sort_order: number }[]) =>
    req<Place[]>('POST', `api/trips/${tripId}/places/arrange`, moves),
  searchPlaces: (q: string, near?: { lat: number; lon: number } | null) =>
    req<GeoResult[]>('GET', `api/search/places?q=${encodeURIComponent(q)}${near ? `&lat=${near.lat}&lon=${near.lon}` : ''}`),

  airports: (q: string) => req<Airport[]>('GET', `api/ref/airports?q=${encodeURIComponent(q)}&limit=8`),
  airlines: (q: string) => req<Airline[]>('GET', `api/ref/airlines?q=${encodeURIComponent(q)}&limit=8`),
}
