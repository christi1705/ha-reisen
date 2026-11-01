const LOCALE = 'de-DE'

export const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'

/** "2026-12-05" -> Date (lokal, ohne Zeitzonen-Verschiebung) */
export function parseDate(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return parseDate(d).toLocaleDateString(LOCALE, opts)
}

export function fmtRange(start: string, end: string) {
  const s = parseDate(start)
  const e = parseDate(end)
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()
  if (start === end) return fmtDate(start)
  if (sameMonth) return `${s.getDate()}.–${e.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })}`
  if (sameYear)
    return `${s.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

/** Lokale Zeit "YYYY-MM-DDTHH:MM" -> "10:25" */
export const fmtTime = (local: string | null) => {
  const t = local && local.length >= 16 ? local.slice(11, 16) : ''
  return t === '00:00' ? '' : t
}

/** Lokaler Datumsteil "YYYY-MM-DD" */
export const localDay = (local: string | null) => (local ? local.slice(0, 10) : '')

export function fmtDayHeader(day: string) {
  return parseDate(day).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })
}

export function daysUntil(d: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parseDate(d).getTime() - today.getTime()) / 86400000)
}

export function countdownLabel(start: string, end: string) {
  const n = daysUntil(start)
  if (n > 1) return `in ${n} Tagen`
  if (n === 1) return 'morgen'
  if (n === 0) return 'heute'
  const e = daysUntil(end)
  if (e >= 0) return e === 0 ? 'letzter Tag' : `noch ${e + 1} Tage`
  return null
}

export function fmtMoney(v: number | null | undefined, cur = 'EUR') {
  if (v === null || v === undefined) return ''
  try {
    return v.toLocaleString(LOCALE, { style: 'currency', currency: cur, maximumFractionDigits: v % 1 === 0 ? 0 : 2 })
  } catch {
    return `${v} ${cur}`
  }
}

export function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/** Dauer zwischen zwei UTC-Zeitpunkten, z. B. "8 h 55 min" */
export function fmtDuration(a: string | null, b: string | null) {
  if (!a || !b) return ''
  const min = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
  if (min <= 0) return ''
  if (min >= 60 * 24) {
    const n = Math.round(min / (60 * 24))
    return n === 1 ? '1 Nacht' : `${n} Nächte`
  }
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

/** Anzahl Tage zwischen zwei Datumsangaben (für Nächte bei Unterkünften) */
export function nightsBetween(a: string | null, b: string | null) {
  if (!a || !b) return 0
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000)
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = []
  const d = parseDate(start)
  const e = parseDate(end)
  while (d <= e) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Stabile Farbe aus einem Text, für Platzhalter-Titelbilder */
export function gradientFor(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360
  return `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 40) % 360} 75% 45%))`
}

export const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')
