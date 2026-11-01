import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Attachment } from '../api'
import Modal from './Modal'

/** Vorschau für PDFs (pdf.js, funktioniert auch in der HA-App) und Bilder. */
export default function Preview({ attachment, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  if (!attachment) return null
  const a = attachment
  const isImage = a.mime.startsWith('image/')
  const isPdf = a.mime === 'application/pdf'

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={a.filename}
      footer={
        <>
          <a className="btn-ghost" href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Neuer Tab</a>
          <a className="btn-primary" href={`${a.url}?download=true`}><Download size={16} /> Herunterladen</a>
        </>
      }
    >
      {isImage && <img src={a.url} alt={a.filename} className="mx-auto max-h-[70vh] rounded-xl object-contain" />}
      {isPdf && <PdfView url={a.url} />}
      {!isImage && !isPdf && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <FileText size={48} />
          <p>Für diesen Dateityp gibt es keine Vorschau.</p>
        </div>
      )}
    </Modal>
  )
}

function PdfView({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [pages, setPages] = useState(0)

  useEffect(() => {
    let cancelled = false
    const container = ref.current
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const doc = await pdfjs.getDocument(url).promise
        if (cancelled || !container) return
        setPages(doc.numPages)
        container.innerHTML = ''
        const width = Math.min(container.clientWidth || 800, 1000)
        const ratio = window.devicePixelRatio || 1
        for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
          const page = await doc.getPage(i)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const vp = page.getViewport({ scale: (width / base.width) * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = vp.width
          canvas.height = vp.height
          canvas.style.width = `${vp.width / ratio}px`
          canvas.className = 'mx-auto mb-3 rounded-lg bg-white shadow ring-1 ring-slate-900/10'
          container.appendChild(canvas)
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
          if (i === 1) setState('ok')
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [url])

  return (
    <div>
      {state === 'loading' && <div className="flex justify-center py-16 text-slate-400"><Loader2 className="animate-spin" /></div>}
      {state === 'error' && (
        <div className="py-16 text-center text-slate-500">
          PDF konnte nicht angezeigt werden. <a className="text-brand-600 underline" href={url} target="_blank" rel="noreferrer">Direkt öffnen</a>
        </div>
      )}
      <div ref={ref} />
      {pages > 30 && <p className="text-center text-xs text-slate-500">Nur die ersten 30 von {pages} Seiten werden angezeigt.</p>}
    </div>
  )
}
