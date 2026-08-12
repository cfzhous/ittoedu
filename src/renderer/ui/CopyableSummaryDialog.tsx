import { Check, Clipboard, FileText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface CopyableSummaryDialogProps {
  open: boolean
  title: string
  summary: string
  onClose(): void
}

export function CopyableSummaryDialog({
  open,
  title,
  summary,
  onClose,
}: CopyableSummaryDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setCopied(false)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, summary])

  if (!open) return null

  const copySummary = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary)
      } else {
        textareaRef.current?.select()
        document.execCommand('copy')
      }
      setCopied(true)
    } catch {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal copyable-summary-dialog" role="dialog" aria-modal="true" aria-labelledby="copyable-summary-title">
        <header className="copyable-summary-dialog__header">
          <span><FileText size={18} /></span>
          <h2 id="copyable-summary-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="关闭批次摘要" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <textarea
          ref={textareaRef}
          className="copyable-summary-dialog__content"
          aria-label="完整批次摘要"
          value={summary}
          readOnly
        />
        <div className="modal__actions">
          <button type="button" className="secondary-button" onClick={() => void copySummary()}>
            {copied ? <Check size={14} /> : <Clipboard size={14} />}
            {copied ? '已复制' : '复制完整摘要'}
          </button>
          <button type="button" className="primary-button" onClick={onClose}>完成</button>
        </div>
      </section>
    </div>
  )
}
