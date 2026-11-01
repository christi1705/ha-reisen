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
}

export function Autocomplete<T>({
  value, onChange, onSelect, search, render, itemKey, placeholder, minChars = 2, autoFocus,
}: Props<T>) {
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
      search(q)
        .then((r) => {
          if (n === seq.current) {
            setItems(r)
            setActive(0)
            setOpen(true)
          }
        })
        .catch(() => setItems([]))
    }, 150)
    return () => clearTimeout(t)
  }, [value, minChars, search])

  const pick = (it: T) => {
    skip.current = true
    onSelect(it)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
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
