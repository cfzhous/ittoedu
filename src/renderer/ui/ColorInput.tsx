import { useEffect, useState } from 'react'

interface ColorInputProps {
  id: string
  label: string
  value: string
  onChange(value: string): void
  'data-testid'?: string
}

export function ColorInput({ id, label, value, onChange, 'data-testid': testId }: ColorInputProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  const commit = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(draft)) onChange(draft.toLowerCase())
    else setDraft(value)
  }

  return (
    <div className="form-field" {...(testId ? { 'data-testid': testId } : {})}>
      <label htmlFor={`${id}-text`}>{label}</label>
      <div className="color-control">
        <input
          className="color-swatch"
          id={`${id}-picker`}
          type="color"
          aria-label={`${label}选择器`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className="form-input"
          id={`${id}-text`}
          value={draft}
          maxLength={7}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraft(value)
              event.currentTarget.blur()
            }
          }}
        />
      </div>
    </div>
  )
}
