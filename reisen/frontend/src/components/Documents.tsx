import { FileImage, FileText, File as FileIcon, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { api, type Attachment, type TripDetail } from '../api'
import { BOOKING_TYPES } from '../bookingTypes'
import { cls, fmtSize } from '../util'

interface Props {
  trip: TripDetail
  onChanged: () => void
  onPreview: (a: Attachment) => void
}

function iconFor(mime: string) {
  if (mime.startsWith('image/')) return FileImage
  if (mime === 'application/pdf') return FileText
  return FileIcon
}

export default function Documents({ trip, onChanged, onPreview }: Props) {
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const bookings = new Map(trip.bookings.map((b) => [b.id, b]))

  const upload = async (files: File[]) => {
    if (!files.length) return
    setBusy(true)
    try {
      await api.upload(trip.id, files)
      onChanged()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const sorted = [...trip.attachments].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(Array.from(e.dataTransfer.files)) }}
        className={cls(
          'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center text-sm transition',
          drag ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-300 text-slate-500 hover:border-brand-400 dark:border-slate-700',
        )}
      >
        <Upload size={22} className={busy ? 'animate-bounce' : ''} />
        <span><b className="text-slate-700 dark:text-slate-200">Dateien hierher ziehen</b> oder klicken</span>
        <span className="text-xs">PDF, Bilder & mehr · max. 50 MB pro Datei</span>
        <input type="file" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; upload(f) }} />
      </label>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Noch keine Dokumente. Tickets, Bestätigungen und Reisepässe kannst du hier ablegen.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((a) => {
            const Icon = iconFor(a.mime)
            const b = a.booking_id ? bookings.get(a.booking_id) : null
            const cfg = b ? BOOKING_TYPES[b.type] : null
            return (
              <div key={a.id} className="card group relative flex flex-col overflow-hidden">
                <button onClick={() => onPreview(a)} className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-800">
                  {a.mime.startsWith('image/') ? (
                    <img src={a.url} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <Icon size={40} className={a.mime === 'application/pdf' ? 'text-red-500' : 'text-slate-400'} />
                  )}
                </button>
                <div className="flex items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={a.filename}>{a.filename}</p>
                    <p className="truncate text-xs text-slate-500">
                      {fmtSize(a.size)}
                      {b && cfg && <> · {b.title}</>}
                    </p>
                  </div>
                  <button
                    className="icon-btn h-7 w-7 opacity-60 hover:opacity-100"
                    aria-label="Löschen"
                    onClick={async () => { if (confirm(`„${a.filename}“ löschen?`)) { await api.deleteAttachment(a.id); onChanged() } }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
