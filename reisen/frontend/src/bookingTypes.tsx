import {
  Bike, BedDouble, Bus, Car, CarTaxiFront, KeyRound, Plane, Ship, Ticket, TrainFront, UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { BookingStatus, BookingType } from './api'

export interface DetailField {
  key: string
  label: string
  placeholder?: string
  type?: 'text' | 'number'
  half?: boolean
}

export interface TypeConfig {
  label: string
  icon: LucideIcon
  /** Tailwind-Klassen für Symbol-Hintergrund */
  tone: string
  /** Hat Start- und Zielort (Transport) oder nur einen Ort */
  route: boolean
  startLabel: string
  endLabel: string
  fromLabel?: string
  toLabel?: string
  locationLabel?: string
  providerLabel: string
  details: DetailField[]
  group: 'transport' | 'stay' | 'do'
}

const seat: DetailField = { key: 'seat', label: 'Sitzplatz', half: true }

export const BOOKING_TYPES: Record<BookingType, TypeConfig> = {
  flight: {
    label: 'Flug', icon: Plane, tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    route: true, startLabel: 'Abflug', endLabel: 'Ankunft', fromLabel: 'Von', toLabel: 'Nach',
    providerLabel: 'Airline', group: 'transport',
    details: [
      { key: 'terminal', label: 'Terminal', half: true },
      { key: 'gate', label: 'Gate', half: true },
      seat,
      { key: 'class', label: 'Klasse', placeholder: 'Economy', half: true },
      { key: 'baggage', label: 'Gepäck', placeholder: '1× 23 kg' },
    ],
  },
  train: {
    label: 'Zug', icon: TrainFront, tone: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    route: true, startLabel: 'Abfahrt', endLabel: 'Ankunft', fromLabel: 'Von', toLabel: 'Nach',
    providerLabel: 'Bahn / Anbieter', group: 'transport',
    details: [
      { key: 'number', label: 'Zugnummer', placeholder: 'ICE 123', half: true },
      { key: 'platform', label: 'Gleis', half: true },
      { key: 'coach', label: 'Wagen', half: true },
      seat,
      { key: 'class', label: 'Klasse', half: true },
    ],
  },
  bus: {
    label: 'Bus', icon: Bus, tone: 'bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300',
    route: true, startLabel: 'Abfahrt', endLabel: 'Ankunft', fromLabel: 'Von', toLabel: 'Nach',
    providerLabel: 'Anbieter', group: 'transport',
    details: [{ key: 'number', label: 'Linie / Nummer', half: true }, seat],
  },
  boat: {
    label: 'Schiff / Fähre', icon: Ship, tone: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
    route: true, startLabel: 'Abfahrt', endLabel: 'Ankunft', fromLabel: 'Von', toLabel: 'Nach',
    providerLabel: 'Reederei', group: 'transport',
    details: [{ key: 'number', label: 'Schiff / Verbindung', half: true }, { key: 'cabin', label: 'Kabine / Deck', half: true }, { key: 'vehicle', label: 'Fahrzeug an Bord' }],
  },
  car: {
    label: 'Auto', icon: Car, tone: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
    route: true, startLabel: 'Start', endLabel: 'Ankunft', fromLabel: 'Von', toLabel: 'Nach',
    providerLabel: 'Fahrer / Fahrzeug', group: 'transport',
    details: [{ key: 'distance', label: 'Strecke (km)', type: 'number', half: true }],
  },
  taxi: {
    label: 'Taxi / Transfer', icon: CarTaxiFront, tone: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300',
    route: true, startLabel: 'Abholung', endLabel: 'Ankunft', fromLabel: 'Von', toLabel: 'Nach',
    providerLabel: 'Anbieter', group: 'transport',
    details: [{ key: 'contact', label: 'Kontakt / Telefon' }],
  },
  rental_car: {
    label: 'Mietwagen', icon: KeyRound, tone: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
    route: true, startLabel: 'Abholung', endLabel: 'Rückgabe', fromLabel: 'Abholort', toLabel: 'Rückgabeort',
    providerLabel: 'Vermieter', group: 'transport',
    details: [
      { key: 'vehicle', label: 'Fahrzeug / Klasse', half: true },
      { key: 'insurance', label: 'Versicherung', half: true },
      { key: 'fuel', label: 'Tankregelung', placeholder: 'voll/voll' },
    ],
  },
  bike: {
    label: 'Fahrrad', icon: Bike, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    route: true, startLabel: 'Start', endLabel: 'Ende', fromLabel: 'Von', toLabel: 'Nach',
    providerLabel: 'Verleih', group: 'transport',
    details: [{ key: 'bike', label: 'Rad', half: true }, { key: 'distance', label: 'Strecke (km)', type: 'number', half: true }],
  },
  lodging: {
    label: 'Unterkunft', icon: BedDouble, tone: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    route: false, startLabel: 'Check-in', endLabel: 'Check-out', locationLabel: 'Adresse',
    providerLabel: 'Buchungsportal', group: 'stay',
    details: [
      { key: 'room', label: 'Zimmer', half: true },
      { key: 'guests', label: 'Gäste', type: 'number', half: true },
      { key: 'board', label: 'Verpflegung', placeholder: 'Frühstück', half: true },
      { key: 'phone', label: 'Telefon', half: true },
    ],
  },
  restaurant: {
    label: 'Restaurant', icon: UtensilsCrossed, tone: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    route: false, startLabel: 'Reservierung', endLabel: 'Ende', locationLabel: 'Adresse',
    providerLabel: 'Reserviert über', group: 'do',
    details: [{ key: 'party', label: 'Personen', type: 'number', half: true }, { key: 'phone', label: 'Telefon', half: true }],
  },
  activity: {
    label: 'Aktivität / Ticket', icon: Ticket, tone: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
    route: false, startLabel: 'Beginn', endLabel: 'Ende', locationLabel: 'Ort',
    providerLabel: 'Anbieter', group: 'do',
    details: [{ key: 'tickets', label: 'Tickets / Personen', half: true }, { key: 'ticket_type', label: 'Ticketart', half: true }],
  },
}

export const TYPE_ORDER: BookingType[] = [
  'flight', 'train', 'bus', 'boat', 'car', 'taxi', 'rental_car', 'bike', 'lodging', 'restaurant', 'activity',
]

export const STATUS: Record<BookingStatus, { label: string; cls: string }> = {
  idea: { label: 'Idee', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  todo: { label: 'Todo', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30' },
  booked: { label: 'Gebucht', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  confirmed: { label: 'Bestätigt', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  cancelled: { label: 'Storniert', cls: 'bg-red-50 text-red-600 line-through dark:bg-red-500/15 dark:text-red-300' },
}
