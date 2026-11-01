import { CalendarClock, Check, ChevronDown, ListChecks, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type Task, type TripDetail } from '../api'
import { cls, daysUntil, fmtDate, parseDate } from '../util'

interface Props {
  trip: TripDetail
  onChanged: () => void
}

/** Typische Aufgaben vor einer Reise, als Vorschläge zum Antippen */
const SUGGESTIONS: { title: string; daysBefore?: number }[] = [
  { title: 'Reisepass / Ausweis prüfen', daysBefore: 42 },
  { title: 'Auslandskrankenversicherung prüfen', daysBefore: 14 },
  { title: 'Online-Check-in', daysBefore: 1 },
  { title: 'Haustier- / Pflanzenbetreuung organisieren', daysBefore: 14 },
  { title: 'Nachbarn Bescheid geben', daysBefore: 3 },
  { title: 'Bargeld & Kreditkarte', daysBefore: 3 },
  { title: 'Reiseadapter einpacken', daysBefore: 1 },
  { title: 'Offline-Karten laden', daysBefore: 2 },
  { title: 'Urlaubsmodus in Home Assistant', daysBefore: 0 },
  { title: 'Impfungen / Einreisebestimmungen prüfen', daysBefore: 42 },
]

function shiftDate(day: string, delta: number) {
  const d = parseDate(day)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dueInfo(t: Task) {
  if (!t.due_date) return null
  const n = daysUntil(t.due_date)
  if (t.done) return { label: fmtDate(t.due_date, { day: 'numeric', month: 'short' }), cls: 'text-slate-400' }
  if (n < 0) return { label: n === -1 ? 'seit gestern fällig' : `seit ${-n} Tagen fällig`, cls: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' }
  if (n === 0) return { label: 'heute', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' }
  if (n === 1) return { label: 'morgen', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' }
  if (n <= 7) return { label: `in ${n} Tagen`, cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' }
  return { label: fmtDate(t.due_date, { day: 'numeric', month: 'short' }), cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
}

export default function Tasks({ trip, onChanged }: Props) {
  const [tasks, setTasks] = useState<Task[]>(trip.tasks)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [showSuggest, setShowSuggest] = useState(trip.tasks.length === 0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => setTasks(trip.tasks), [trip.tasks])

  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const existing = new Set(tasks.map((t) => t.title.toLowerCase()))
  const suggestions = SUGGESTIONS.filter((s) => !existing.has(s.title.toLowerCase()))
  const tripStarted = daysUntil(trip.start_date) <= 0

  const add = async (t: string, d: string | null) => {
    const clean = t.trim()
    if (!clean) return
    const created = await api.createTask(trip.id, { title: clean, due_date: d || null })
    setTasks((xs) => [...xs, created])
    onChanged()
  }

  const submit = async () => {
    await add(title, due)
    setTitle('')
    setDue('')
    input.current?.focus()
  }

  const patch = async (t: Task, d: Partial<Task>) => {
    setTasks((xs) => xs.map((x) => (x.id === t.id ? { ...x, ...d } : x)))
    try {
      await api.updateTask(t.id, d)
      onChanged()
    } catch (e) {
      alert((e as Error).message)
      setTasks((xs) => xs.map((x) => (x.id === t.id ? t : x)))
    }
  }

  const remove = async (t: Task) => {
    setTasks((xs) => xs.filter((x) => x.id !== t.id))
    await api.deleteTask(t.id)
    onChanged()
  }

  // Offene Aufgaben: zuerst nach Fälligkeit, dann Reihenfolge des Anlegens
  const sortedOpen = [...open].sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return a.sort_order - b.sort_order
  })

  const quickDue: { label: string; value: string }[] = [
    { label: 'Heute', value: todayStr() },
    { label: '1 Woche vorher', value: shiftDate(trip.start_date, -7) },
    { label: 'Tag vor Abreise', value: shiftDate(trip.start_date, -1) },
  ].filter((q) => q.value >= todayStr())

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Neue Aufgabe */}
      <div className="card p-3">
        <div className="flex items-center gap-2">
          <Plus size={18} className="ml-1 shrink-0 text-slate-400" />
          <input
            ref={input}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400"
            placeholder="Neue Aufgabe …"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="btn-primary px-3" onClick={submit} disabled={!title.trim()}>Hinzufügen</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
          <CalendarClock size={14} className="ml-1 text-slate-400" />
          <span className="text-xs text-slate-500">Fällig:</span>
          {quickDue.map((q) => (
            <button
              key={q.label}
              onClick={() => { setDue(due === q.value ? '' : q.value); input.current?.focus() }}
              className={cls('chip transition', due === q.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300')}
            >
              {q.label}
            </button>
          ))}
          <input type="date" className="rounded-lg border-0 bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800" value={due} onChange={(e) => setDue(e.target.value)} />
          {due && <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setDue('')}>keins</button>}
        </div>
      </div>

      {/* Vorschläge */}
      {suggestions.length > 0 && !tripStarted && (
        <div>
          <button className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" onClick={() => setShowSuggest(!showSuggest)}>
            <Sparkles size={14} /> Vorschläge <ChevronDown size={14} className={cls('transition', showSuggest && 'rotate-180')} />
          </button>
          {showSuggest && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => {
                const d = s.daysBefore !== undefined ? shiftDate(trip.start_date, -s.daysBefore) : null
                const dueVal = d && d >= todayStr() ? d : null
                return (
                  <button
                    key={s.title}
                    onClick={() => add(s.title, dueVal)}
                    className="chip border border-dashed border-slate-300 bg-white py-1 text-slate-600 transition hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    title={dueVal ? `fällig am ${fmtDate(dueVal)}` : undefined}
                  >
                    <Plus size={12} /> {s.title}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Offen */}
      {open.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15"><ListChecks size={24} /></span>
          {done.length ? 'Alles erledigt – gute Reise! 🎉' : 'Noch keine Aufgaben für diese Reise.'}
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
          {sortedOpen.map((t) => (
            <TaskRow key={t.id} task={t} editing={editing === t.id} onEdit={(v) => setEditing(v ? t.id : null)} onPatch={(d) => patch(t, d)} onRemove={() => remove(t)} />
          ))}
        </ul>
      )}

      {/* Erledigt */}
      {done.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <button className="btn-ghost -ml-3" onClick={() => setShowDone(!showDone)}>
              <Check size={16} /> Erledigt ({done.length}) <ChevronDown size={16} className={cls('transition', showDone && 'rotate-180')} />
            </button>
            {showDone && (
              <button
                className="text-xs text-slate-400 hover:text-red-600"
                onClick={async () => { if (confirm('Alle erledigten Aufgaben löschen?')) { await api.clearDoneTasks(trip.id); setTasks((xs) => xs.filter((x) => !x.done)); onChanged() } }}
              >
                Erledigte löschen
              </button>
            )}
          </div>
          {showDone && (
            <ul className="card mt-2 divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} editing={editing === t.id} onEdit={(v) => setEditing(v ? t.id : null)} onPatch={(d) => patch(t, d)} onRemove={() => remove(t)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task: t, editing, onEdit, onPatch, onRemove }: {
  task: Task
  editing: boolean
  onEdit: (v: boolean) => void
  onPatch: (d: Partial<Task>) => void
  onRemove: () => void
}) {
  const [title, setTitle] = useState(t.title)
  const [notes, setNotes] = useState(t.notes ?? '')
  const info = dueInfo(t)

  useEffect(() => { setTitle(t.title); setNotes(t.notes ?? '') }, [t.title, t.notes, editing])

  const saveText = () => {
    const d: Partial<Task> = {}
    if (title.trim() && title.trim() !== t.title) d.title = title.trim()
    if ((notes.trim() || null) !== (t.notes || null)) d.notes = notes.trim() || null
    if (Object.keys(d).length) onPatch(d)
  }

  return (
    <li className={cls('group', editing && 'bg-slate-50 dark:bg-slate-800/40')}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          onClick={() => onPatch({ done: !t.done })}
          aria-label={t.done ? 'Als offen markieren' : 'Erledigt'}
          className={cls(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition',
            t.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-500 dark:border-slate-600',
          )}
        >
          {t.done && <Check size={12} strokeWidth={3} />}
        </button>

        {editing ? (
          <div className="min-w-0 flex-1 space-y-2">
            <input
              className="input"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { saveText(); onEdit(false) } if (e.key === 'Escape') onEdit(false) }}
            />
            <textarea className="input min-h-[56px]" placeholder="Notiz (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock size={14} className="text-slate-400" />
              <input type="date" className="input w-auto py-1 text-xs" value={t.due_date ?? ''} onChange={(e) => onPatch({ due_date: e.target.value || null })} />
              {t.due_date && <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => onPatch({ due_date: null })}>Datum entfernen</button>}
              <div className="ml-auto flex gap-1">
                <button className="btn-danger px-2 py-1 text-xs" onClick={onRemove}><Trash2 size={14} /> Löschen</button>
                <button className="btn-primary px-3 py-1 text-xs" onClick={() => { saveText(); onEdit(false) }}>Fertig</button>
              </div>
            </div>
          </div>
        ) : (
          <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(true)}>
            <span className={cls('block text-sm [overflow-wrap:anywhere]', t.done && 'text-slate-400 line-through')}>{t.title}</span>
            {t.notes && <span className="mt-0.5 block truncate text-xs text-slate-500">{t.notes}</span>}
          </button>
        )}

        {!editing && info && <span className={cls('chip shrink-0', info.cls)}>{info.label}</span>}
        {!editing && (
          <button className="icon-btn -my-1 hidden h-7 w-7 shrink-0 opacity-0 transition group-hover:opacity-100 sm:inline-flex" onClick={onRemove} aria-label="Löschen">
            <X size={14} />
          </button>
        )}
      </div>
    </li>
  )
}
