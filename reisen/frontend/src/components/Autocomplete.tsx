import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type Airline, type Airport } from '../api'
import { cls } from '../util'

interface Props<T> {
  value: string
  onChange: (text: string) => void
  onSelect: (item: T) => void
  search: (q: string) => Promise<T[]>
  render: (item: T) => ReactNode
  itemKey: (item: T) => string
  placeholder?: string
  minChars?: number
  autoFocus?: boolean
  delay?: number
  /** Enter ohne Auswahl aus der Liste */
  onSubmitText?: (text: string) => void
  className?: string
  icon?: ReactNode
}

export function Autocomplete<T>({
  value, onChange, onSelect, search, render, itemKey, placeholder, minChars = 2, autoFocus, delay = 150, onSubmitText,
  className, icon,
}: Props<T>) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<T[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const seq = useRef(0)
  const skip = useRef(false)

  useEffect(() => {
    if (skip.current) {
      skip.current = false
      return
    }
    const q = value.trim()
    if (q.length < minChars) {
      setItems([])
      return
    }
    const n = ++seq.current
    const t = setTimeout(() => {
      setLoading(true)
      search(q)
        .then((r) => {
          if (n === seq.current) {
            setItems(r)
            setActive(0)
            setOpen(true)
          }
        })
        .catch(() => n === seq.current && setItems([]))
        .finally(() => n === seq.current && setLoading(false))
    }, delay)
    return () => clearTimeout(t)
  }, [value, minChars, search, delay])

  const pick = (it: T) => {
    skip.current = true
    onSelect(it)
    setOpen(false)
  }

  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
      {loading && <span className="absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />}
      <input
        className={cls('input', icon ? 'pl-9' : '', className)}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmitText && (!open || !items.length)) {
            e.preventDefault()
            seq.current++
            setOpen(false)
            onSubmitText(value)
            return
          }
          if (!open || !items.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          if (e.key === 'Enter') { e.preventDefault(); pick(items[active]) }
        }}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {items.map((it, i) => (
            <li
              key={itemKey(it)}
              onMouseDown={(e) => { e.preventDefault(); pick(it) }}
              onMouseMove={() => active !== i && setActive(i)}
              className={cls('cursor-pointer px-3 py-2 text-sm', i === active && 'bg-brand-50 dark:bg-slate-800')}
            >
              {render(it)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AirportInput({ value, onChange, onSelect, placeholder }: {
  value: string; onChange: (s: string) => void; onSelect: (a: Airport) => void; placeholder?: string
}) {
  return (
    <Autocomplete<Airport>
      value={value}
      onChange={onChange}
      onSelect={onSelect}
      search={api.airports}
      itemKey={(a) => a.iata}
      placeholder={placeholder ?? 'Stadt, Flughafen oder Code'}
      render={(a) => (
        <div className="flex items-center gap-3">
          <span className="w-10 font-mono font-semibold text-brand-700 dark:text-brand-300">{a.iata}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{a.city || a.name}</span>
            <span className="block truncate text-xs text-slate-500">{a.name} · {a.country}</span>
          </span>
        </div>
      )}
    />
  )
}

export function AirlineInput({ value, onChange, onSelect }: {
  value: string; onChange: (s: string) => void; onSelect: (a: Airline) => void
}) {
  return (
    <Autocomplete<Airline>
      value={value}
      onChange={onChange}
      onSelect={onSelect}
      search={api.airlines}
      itemKey={(a) => a.iata + a.name}
      placeholder="Airline oder Code"
      render={(a) => (
        <div className="flex items-center gap-3">
          <span className="w-8 font-mono font-semibold text-brand-700 dark:text-brand-300">{a.iata}</span>
          <span className="truncate">{a.name}</span>
          <span className="ml-auto text-xs text-slate-500">{a.country}</span>
        </div>
      )}
    />
  )
}
