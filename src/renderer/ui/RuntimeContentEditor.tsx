import type { RuntimeDocument } from '../../shared/runtimeTypes'

export interface RuntimeContentEditorProps {
  runtime: RuntimeDocument
  onChange(runtime: RuntimeDocument): void
}

function humanizeKey(key: string): string {
  const leaf = key.split('.').pop() ?? key
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim() || key
}

export function RuntimeContentEditor({
  runtime,
  onChange,
}: RuntimeContentEditorProps) {
  const entries = Object.entries(runtime.content.values)
  if (entries.length === 0) {
    return (
      <p className="property-empty" data-testid="runtime-content-empty">
        该运行时没有登记人工文案
      </p>
    )
  }

  const updateValue = (key: string, value: string) => {
    onChange({
      ...runtime,
      content: {
        ...runtime.content,
        values: {
          ...runtime.content.values,
          [key]: value,
        },
      },
    })
  }

  return (
    <div className="runtime-content-editor" data-testid="runtime-content-editor">
      {entries.map(([key, value]) => {
        const metadata = runtime.content.metadata?.[key]
        const label = metadata?.label ?? humanizeKey(key)
        const id = `runtime-content-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`
        const descriptionId = metadata?.description ? `${id}-description` : undefined
        const common = {
          id,
          'aria-label': label,
          'aria-describedby': descriptionId,
          value,
          maxLength: metadata?.maxLength,
          onChange: (
            event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) => updateValue(key, event.target.value),
        }
        return (
          <div key={key} className="form-field runtime-content-field">
            <label htmlFor={id}>{label}</label>
            {metadata?.description && (
              <small id={descriptionId}>{metadata.description}</small>
            )}
            {metadata?.multiline
              ? <textarea {...common} className="form-textarea" rows={4} />
              : <input {...common} className="form-input" type="text" />}
          </div>
        )
      })}
    </div>
  )
}
