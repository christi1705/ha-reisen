import { Check, Copy, Paperclip } from 'lucide-react'
import { useState } from 'react'
import type { Attachment, Booking } from '../api'
import { BOOKING_TYPES, STATUS } from '../bookingTypes'
import { cls, fmtDate, fmtDuration, fmtMoney, fmtTime, localDay, nightsBetween } from '../util'

export type TimelineRole = 'single' | 'start' | 'end'

interface Props {
  booking: Booking
  role?: TimelineRole
  showDate?: boolean
  onOpen: (b: Booking) => void
  onPreview: (a: Attachment) => void
}

function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="chip bg-slate-100 font-mono text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
      title="Buchungsnummer kopieren"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1200) })
      }}
    >
      {code} {done ? <Check size={12} /> : <Copy size={12} className="opacity-50" />}
    </button>
  )
}

export default function BookingCard({ booking: b, role = 'single', showDate, onOpen, onPreview }: Props) {
  const cfg = BOOKING_TYPES[b.type]
  const Icon = cfg.icon
  const st = STATUS[b.status]
  const isRoute = cfg.route

  const time = role === 'end' ? fmtTime(b.end_at) : fmtTime(b.start_at)
  const timeLabel = role === 'end' ? cfg.endLabel : role === 'start' ? cfg.startLabel : null
  const nights = b.type === 'lodging' ? nightsBetween(localDay(b.start_at), localDay(b.end_at)) : 0
  const duration = isRoute ? fmtDuration(b.start_utc, b.end_utc) : ''
  const sameDayEnd = localDay(b.start_at) === localDay(b.end_at)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(b)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(b)}
      className={cls('card group flex cursor-pointer gap-3 p-3 transition hover:shadow-lg sm:gap-4 sm:p-4', b.status === 'cancelled' && 'opacity-60')}
    >
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-0.5">
        <span className={cls('flex h-10 w-10 items-center justify-center rounded-xl', cfg.tone)}><Icon size={20} /></span>
        {time && <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{time}</span>}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {timeLabel && <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{timeLabel}</span>}
          {showDate && b.start_at && <span className="text-xs text-slate-400">{fmtDate(localDay(role === 'end' ? b.end_at : b.start_at))}</span>}
        </div>
        <h3 className="truncate font-semibold">{b.title}</h3>

        {isRoute && (b.from_location?.name || b.to_location?.name) && role !== 'end' && (
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="min-w-0 truncate">{b.from_location?.name}</span>
            {b.to_location?.name && (
              <>
                <span className="relative hidden h-px min-w-[24px] flex-1 bg-slate-300 sm:block dark:bg-slate-600">
                  {duration && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white px-1 text-[10px] text-slate-400 dark:bg-slate-900">{duration}</span>}
                </span>
                <span className="shrink-0 text-slate-400 sm:hidden">→</span>
                <span className="truncate sm:text-right">
                  {b.to_location?.name}
                  {b.end_at && <span className="ml-1 text-xs text-slate-400">{fmtTime(b.end_at)}{!sameDayEnd && ' (+1)'}</span>}
                </span>
              </>
            )}
          </div>
        )}
        {!isRoute && (b.to_location?.address || nights > 0) && role !== 'end' && (
          <p className="mt-0.5 truncate text-sm text-slate-500">
            {nights > 0 && <span>{nights === 1 ? '1 Nacht' : `${nights} Nächte`}</span>}
            {nights > 0 && b.to_location?.address && ' · '}
            {b.to_location?.address}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={cls('chip', st.cls)}>{st.label}</span>
          {b.confirmation_code && <CopyCode code={b.confirmation_code} />}
          {b.provider && b.type !== 'lodging' && <span className="chip bg-slate-50 text-slate-500 dark:bg-slate-800/60">{b.provider}</span>}
          {b.travelers?.length > 0 && <span className="chip bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">nur {b.travelers.join(', ')}</span>}
          {b.details.seat && <span className="chip bg-slate-50 text-slate-500 dark:bg-slate-800/60">Sitz {b.details.seat}</span>}
          {duration && role !== 'end' && <span className="chip bg-slate-50 text-slate-500 sm:hidden dark:bg-slate-800/60">{duration}</span>}
          {b.cost != null && role !== 'end' && <span className="chip ml-auto bg-transparent px-0 text-slate-500">{fmtMoney(b.cost, b.cost_currency ?? 'EUR')}</span>}
        </div>

        {b.attachments.length > 0 && role !== 'end' && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {b.attachments.map((a) => (
              <button
                key={a.id}
                onClick={(e) => { e.stopPropagation(); onPreview(a) }}
                className="chip max-w-[200px] bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-200"
              >
                <Paperclip size={12} /> <span className="truncate">{a.filename}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
