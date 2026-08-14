import { useEffect, useId, useState, type ReactNode } from 'react'
import { formulaAstSchema } from '../../shared/projectSchema'
import {
  SHAPE_TYPES,
  type ArrowHead,
  type ImageFit,
  type ShapeLineStyle,
  type ShapeType,
  type TextAlign,
  type TextOverflowMode,
  type VerticalAlign,
  type WritingMode,
} from '../../shared/projectTypes'
import type { AuthoringInventoryValueKind } from '../../shared/courseProjectModel'
import type {
  ComponentLayerItem,
  LayerItem,
  NativeLayerItem,
  RuntimeLayerItem,
} from '../../shared/courseProjectTypes'

export interface AuthoringValueEditorEntry {
  field: string
  label: string
  valueKind: AuthoringInventoryValueKind
  currentValue: unknown
  disabled?: boolean
}

export interface AuthoringValueEditorProps {
  entry: AuthoringValueEditorEntry
  onCommit(value: unknown): void
  onReplaceAsset?(field: string): void
}

function valueAsDraft(entry: AuthoringValueEditorEntry): string {
  if (entry.valueKind === 'object' || entry.valueKind === 'array' || entry.valueKind === 'formula') {
    return JSON.stringify(entry.currentValue, null, 2)
  }
  if (entry.valueKind === 'null') return 'null'
  return entry.currentValue === null || entry.currentValue === undefined
    ? ''
    : String(entry.currentValue)
}

function valueKindName(kind: AuthoringInventoryValueKind): string {
  switch (kind) {
    case 'formula': return '公式结构'
    case 'array': return '列表内容'
    case 'object': return '结构化内容'
    case 'null': return '空值'
    default: return '内容'
  }
}

/**
 * One small editor for a derived authoring-inventory value. It intentionally
 * speaks in teacher-facing labels; the stable field is kept on data-field for
 * authoring integration and is not rendered as protocol UI.
 */
export function AuthoringValueEditor({
  entry,
  onCommit,
  onReplaceAsset,
}: AuthoringValueEditorProps) {
  const inputId = useId()
  const [draft, setDraft] = useState(() => valueAsDraft(entry))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(valueAsDraft(entry))
    setError(null)
  }, [entry.currentValue, entry.field, entry.valueKind])

  const commitNumber = () => {
    const value = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(value)) {
      setError('请输入有效数字。')
      return
    }
    setError(null)
    onCommit(value)
  }

  const commitJson = () => {
    let value: unknown
    try {
      value = JSON.parse(draft) as unknown
    } catch {
      setError(`${valueKindName(entry.valueKind)}不是有效 JSON，请检查括号和引号。`)
      return
    }
    if (entry.valueKind === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      setError('请输入一个 JSON 对象。')
      return
    }
    if (entry.valueKind === 'array' && !Array.isArray(value)) {
      setError('请输入一个 JSON 列表。')
      return
    }
    if (entry.valueKind === 'null' && value !== null) {
      setError('空值只能保留为 null。')
      return
    }
    if (entry.valueKind === 'formula') {
      const parsed = formulaAstSchema.safeParse(value)
      if (!parsed.success) {
        setError('公式结构不完整，请检查节点类型和必填内容。')
        return
      }
      value = parsed.data
    }
    setError(null)
    onCommit(value)
  }

  if (entry.valueKind === 'boolean') {
    return (
      <label className="course-check" data-field={entry.field}>
        <input
          id={inputId}
          type="checkbox"
          checked={entry.currentValue === true}
          disabled={entry.disabled}
          onChange={(event) => onCommit(event.target.checked)}
        />
        {entry.label}
      </label>
    )
  }

  if (entry.valueKind === 'asset') {
    return (
      <div className="course-field course-asset-field" data-field={entry.field}>
        <label htmlFor={inputId}>{entry.label}</label>
        <input
          id={inputId}
          value={draft}
          readOnly
          disabled={entry.disabled}
          aria-label={`${entry.label}当前素材`}
        />
        <button
          type="button"
          disabled={entry.disabled || !onReplaceAsset}
          onClick={() => onReplaceAsset?.(entry.field)}
        >
          替换素材
        </button>
      </div>
    )
  }

  if (
    entry.valueKind === 'object' ||
    entry.valueKind === 'array' ||
    entry.valueKind === 'formula' ||
    entry.valueKind === 'null'
  ) {
    return (
      <div className="course-field course-json-field" data-field={entry.field}>
        <label htmlFor={inputId}>{entry.label}</label>
        <textarea
          id={inputId}
          value={draft}
          disabled={entry.disabled}
          spellCheck={false}
          rows={entry.valueKind === 'formula' ? 8 : 5}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        <button type="button" disabled={entry.disabled} onClick={commitJson}>
          {entry.valueKind === 'formula' ? '应用公式结构' : '应用更改'}
        </button>
        {error && <span id={`${inputId}-error`} role="alert">{error}</span>}
      </div>
    )
  }

  return (
    <div className="course-field" data-field={entry.field}>
      <label htmlFor={inputId}>{entry.label}</label>
      <input
        id={inputId}
        type={entry.valueKind === 'number' ? 'number' : 'text'}
        value={draft}
        disabled={entry.disabled}
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
        }}
        onBlur={() => {
          if (entry.disabled) return
          if (entry.valueKind === 'number') commitNumber()
          else onCommit(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
      />
      {error && <span id={`${inputId}-error`} role="alert">{error}</span>}
    </div>
  )
}

type LayerUpdater = (update: (item: LayerItem) => void) => void

export interface NativeLayerContentEditorProps {
  item: NativeLayerItem
  disabled?: boolean
  onChange: LayerUpdater
  onReplaceAsset?(field: string): void
}

interface Option<T extends string> {
  value: T
  label: string
}

function SelectField<T extends string>({
  field,
  label,
  value,
  options,
  disabled,
  onCommit,
}: {
  field: string
  label: string
  value: T
  options: ReadonlyArray<Option<T>>
  disabled?: boolean
  onCommit(value: T): void
}) {
  const inputId = useId()
  return (
    <div className="course-field" data-field={field}>
      <label htmlFor={inputId}>{label}</label>
      <select
        id={inputId}
        value={value}
        disabled={disabled}
        onChange={(event) => onCommit(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

function EditorGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="course-authoring-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  )
}

const textAlignOptions: ReadonlyArray<Option<TextAlign>> = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
]
const verticalAlignOptions: ReadonlyArray<Option<VerticalAlign>> = [
  { value: 'top', label: '顶部' },
  { value: 'middle', label: '垂直居中' },
  { value: 'bottom', label: '底部' },
]
const writingModeOptions: ReadonlyArray<Option<WritingMode>> = [
  { value: 'horizontal', label: '横排' },
  { value: 'vertical-rl', label: '竖排（从右向左）' },
  { value: 'vertical-lr', label: '竖排（从左向右）' },
]
const overflowOptions: ReadonlyArray<Option<TextOverflowMode>> = [
  { value: 'auto-height', label: '自动增高' },
  { value: 'fixed', label: '固定文本框' },
  { value: 'shrink', label: '自动缩小文字' },
]
const fitOptions: ReadonlyArray<Option<ImageFit>> = [
  { value: 'contain', label: '完整显示' },
  { value: 'cover', label: '填满画框' },
  { value: 'stretch', label: '拉伸填满' },
]
const lineStyleOptions: ReadonlyArray<Option<ShapeLineStyle>> = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
]
const arrowOptions: ReadonlyArray<Option<ArrowHead>> = [
  { value: 'none', label: '无' },
  { value: 'triangle', label: '三角' },
  { value: 'stealth', label: '尖角' },
  { value: 'circle', label: '圆点' },
  { value: 'diamond', label: '菱形' },
]

function shapeTypeLabel(value: ShapeType): string {
  const labels: Partial<Record<ShapeType, string>> = {
    rectangle: '矩形',
    'rounded-rectangle': '圆角矩形',
    ellipse: '椭圆',
    triangle: '三角形',
    diamond: '菱形',
    line: '直线',
    'arrow-left': '左箭头',
    'arrow-right': '右箭头',
    'arrow-up': '上箭头',
    'arrow-down': '下箭头',
    'arrow-left-right': '双向箭头',
    'elbow-arrow': '折线箭头',
    'brace-left': '左大括号',
    'brace-right': '右大括号',
    'brace-top': '上大括号',
    'brace-bottom': '下大括号',
    'brace-pair-horizontal': '水平大括号组',
    'brace-pair-vertical': '垂直大括号组',
    'bracket-left': '左方括号',
    'bracket-right': '右方括号',
    'emphasis-dot': '着重点',
    'emphasis-triangle': '着重三角',
  }
  return labels[value] ?? value
}

function scalarEntry(
  field: string,
  label: string,
  valueKind: AuthoringInventoryValueKind,
  currentValue: unknown,
  disabled?: boolean,
): AuthoringValueEditorEntry {
  return { field, label, valueKind, currentValue, disabled }
}

export function NativeLayerContentEditor({
  item,
  disabled,
  onChange,
  onReplaceAsset,
}: NativeLayerContentEditorProps) {
  const nativeType = item.content.nativeType
  const update = (
    expectedType: NativeLayerItem['content']['nativeType'],
    apply: (content: NativeLayerItem['content']) => void,
  ) => onChange((draft) => {
    if (draft.kind !== 'native' || draft.content.nativeType !== expectedType) return
    apply(draft.content)
  })

  if (nativeType === 'text') {
    const data = item.content.data
    const commitStyle = <K extends keyof typeof data.style>(key: K, value: typeof data.style[K]) => {
      update('text', (content) => {
        if (content.nativeType === 'text') content.data.style[key] = value
      })
    }
    return (
      <div className="course-authoring-controls" aria-label="文字内容与样式">
        <AuthoringValueEditor
          entry={scalarEntry('content.data.text', '文字内容', 'string', data.text, disabled)}
          onCommit={(value) => update('text', (content) => {
            if (content.nativeType === 'text') content.data.text = String(value)
          })}
        />
        <EditorGroup title="文字样式">
          <AuthoringValueEditor entry={scalarEntry('content.data.style.fontFamily', '字体', 'string', data.style.fontFamily, disabled)} onCommit={(value) => commitStyle('fontFamily', String(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.fontSize', '字号', 'number', data.style.fontSize, disabled)} onCommit={(value) => commitStyle('fontSize', Number(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.color', '文字颜色', 'string', data.style.color, disabled)} onCommit={(value) => commitStyle('color', String(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.bold', '加粗', 'boolean', data.style.bold, disabled)} onCommit={(value) => commitStyle('bold', Boolean(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.italic', '斜体', 'boolean', data.style.italic, disabled)} onCommit={(value) => commitStyle('italic', Boolean(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.underline', '下划线', 'boolean', data.style.underline, disabled)} onCommit={(value) => commitStyle('underline', Boolean(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.strike', '删除线', 'boolean', data.style.strike, disabled)} onCommit={(value) => commitStyle('strike', Boolean(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.emphasis', '着重号', 'boolean', data.style.emphasis, disabled)} onCommit={(value) => commitStyle('emphasis', Boolean(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.highlightColor', '强调色（留空为无）', 'string', data.style.highlightColor ?? '', disabled)} onCommit={(value) => commitStyle('highlightColor', String(value).trim() || null)} />
          <SelectField field="content.data.style.align" label="水平对齐" value={data.style.align} options={textAlignOptions} disabled={disabled} onCommit={(value) => commitStyle('align', value)} />
          <SelectField field="content.data.style.verticalAlign" label="垂直对齐" value={data.style.verticalAlign} options={verticalAlignOptions} disabled={disabled} onCommit={(value) => commitStyle('verticalAlign', value)} />
          <SelectField field="content.data.style.writingMode" label="排文方向" value={data.style.writingMode} options={writingModeOptions} disabled={disabled} onCommit={(value) => commitStyle('writingMode', value)} />
          <SelectField field="content.data.style.overflow" label="文字超出时" value={data.style.overflow} options={overflowOptions} disabled={disabled} onCommit={(value) => commitStyle('overflow', value)} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.lineSpacing', '行距', 'number', data.style.lineSpacing, disabled)} onCommit={(value) => commitStyle('lineSpacing', Number(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.letterSpacing', '字距', 'number', data.style.letterSpacing, disabled)} onCommit={(value) => commitStyle('letterSpacing', Number(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.padding', '内边距', 'number', data.style.padding, disabled)} onCommit={(value) => commitStyle('padding', Number(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.backgroundColor', '背景颜色', 'string', data.style.backgroundColor, disabled)} onCommit={(value) => commitStyle('backgroundColor', String(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.backgroundOpacity', '背景不透明度', 'number', data.style.backgroundOpacity, disabled)} onCommit={(value) => commitStyle('backgroundOpacity', Number(value))} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.cornerRadius', '圆角', 'number', data.style.cornerRadius, disabled)} onCommit={(value) => commitStyle('cornerRadius', Number(value))} />
        </EditorGroup>
      </div>
    )
  }

  if (nativeType === 'formula') {
    const data = item.content.data
    return (
      <div className="course-authoring-controls" aria-label="公式内容与样式">
        <AuthoringValueEditor entry={scalarEntry('content.data.accessibleText', '公式的文字说明', 'string', data.accessibleText, disabled)} onCommit={(value) => update('formula', (content) => {
          if (content.nativeType === 'formula') content.data.accessibleText = String(value)
        })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.ast', '公式结构', 'formula', data.ast, disabled)} onCommit={(value) => update('formula', (content) => {
          if (content.nativeType === 'formula') content.data.ast = formulaAstSchema.parse(value)
        })} />
        <EditorGroup title="公式样式">
          <AuthoringValueEditor entry={scalarEntry('content.data.style.fontSize', '字号', 'number', data.style.fontSize, disabled)} onCommit={(value) => update('formula', (content) => { if (content.nativeType === 'formula') content.data.style.fontSize = Number(value) })} />
          <AuthoringValueEditor entry={scalarEntry('content.data.style.color', '颜色', 'string', data.style.color, disabled)} onCommit={(value) => update('formula', (content) => { if (content.nativeType === 'formula') content.data.style.color = String(value) })} />
          <SelectField field="content.data.style.align" label="对齐" value={data.style.align} options={textAlignOptions} disabled={disabled} onCommit={(value) => update('formula', (content) => { if (content.nativeType === 'formula') content.data.style.align = value })} />
        </EditorGroup>
      </div>
    )
  }

  if (nativeType === 'image') {
    const data = item.content.data
    const setNumber = (field: keyof typeof data.crop, value: unknown) => update('image', (content) => {
      if (content.nativeType === 'image') content.data.crop[field] = Number(value)
    })
    return (
      <div className="course-authoring-controls" aria-label="图片内容与样式">
        <AuthoringValueEditor entry={scalarEntry('content.data.assetId', '图片素材', 'asset', data.assetId, disabled)} onCommit={() => undefined} onReplaceAsset={onReplaceAsset} />
        <SelectField field="content.data.fit" label="图片适应方式" value={data.fit} options={fitOptions} disabled={disabled} onCommit={(value) => update('image', (content) => { if (content.nativeType === 'image') content.data.fit = value })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.preserveAspectRatio', '保持原始比例', 'boolean', data.preserveAspectRatio, disabled)} onCommit={(value) => update('image', (content) => { if (content.nativeType === 'image') content.data.preserveAspectRatio = Boolean(value) })} />
        <EditorGroup title="裁剪与焦点">
          <AuthoringValueEditor entry={scalarEntry('content.data.crop.left', '左侧裁剪', 'number', data.crop.left, disabled)} onCommit={(value) => setNumber('left', value)} />
          <AuthoringValueEditor entry={scalarEntry('content.data.crop.top', '顶部裁剪', 'number', data.crop.top, disabled)} onCommit={(value) => setNumber('top', value)} />
          <AuthoringValueEditor entry={scalarEntry('content.data.crop.right', '右侧裁剪', 'number', data.crop.right, disabled)} onCommit={(value) => setNumber('right', value)} />
          <AuthoringValueEditor entry={scalarEntry('content.data.crop.bottom', '底部裁剪', 'number', data.crop.bottom, disabled)} onCommit={(value) => setNumber('bottom', value)} />
          <AuthoringValueEditor entry={scalarEntry('content.data.cropX', '水平焦点', 'number', data.cropX, disabled)} onCommit={(value) => update('image', (content) => { if (content.nativeType === 'image') content.data.cropX = Number(value) })} />
          <AuthoringValueEditor entry={scalarEntry('content.data.cropY', '垂直焦点', 'number', data.cropY, disabled)} onCommit={(value) => update('image', (content) => { if (content.nativeType === 'image') content.data.cropY = Number(value) })} />
        </EditorGroup>
        <AuthoringValueEditor entry={scalarEntry('content.data.flipX', '水平翻转', 'boolean', data.flipX, disabled)} onCommit={(value) => update('image', (content) => { if (content.nativeType === 'image') content.data.flipX = Boolean(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.flipY', '垂直翻转', 'boolean', data.flipY, disabled)} onCommit={(value) => update('image', (content) => { if (content.nativeType === 'image') content.data.flipY = Boolean(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.cornerRadius', '圆角', 'number', data.cornerRadius, disabled)} onCommit={(value) => update('image', (content) => { if (content.nativeType === 'image') content.data.cornerRadius = Number(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.feather.amount', '边缘柔化', 'number', data.feather.amount, disabled)} onCommit={(value) => update('image', (content) => { if (content.nativeType === 'image') content.data.feather.amount = Number(value) })} />
        <SelectField field="content.data.feather.mode" label="柔化形状" value={data.feather.mode} options={[{ value: 'rectangle', label: '矩形' }, { value: 'ellipse', label: '椭圆' }]} disabled={disabled} onCommit={(value) => update('image', (content) => { if (content.nativeType === 'image') content.data.feather.mode = value })} />
      </div>
    )
  }

  if (nativeType === 'video') {
    const data = item.content.data
    return (
      <div className="course-authoring-controls" aria-label="视频内容与播放">
        <AuthoringValueEditor entry={scalarEntry('content.data.assetId', '视频素材', 'asset', data.assetId, disabled)} onCommit={() => undefined} onReplaceAsset={onReplaceAsset} />
        <SelectField field="content.data.fit" label="视频适应方式" value={data.fit} options={fitOptions} disabled={disabled} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.fit = value })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.autoplay', '进入时自动播放', 'boolean', data.autoplay, disabled)} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.autoplay = Boolean(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.loop', '循环播放', 'boolean', data.loop, disabled)} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.loop = Boolean(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.muted', '静音', 'boolean', data.muted, disabled)} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.muted = Boolean(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.volume', '音量', 'number', data.volume, disabled)} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.volume = Number(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.playbackRate', '播放速度', 'number', data.playbackRate, disabled)} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.playbackRate = Number(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.showControls', '显示播放控件', 'boolean', data.showControls, disabled)} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.showControls = Boolean(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.clickToToggle', '点击切换播放', 'boolean', data.clickToToggle, disabled)} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.clickToToggle = Boolean(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.startTime', '开始时间（秒）', 'number', data.startTime, disabled)} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.startTime = Number(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.endTime', '结束时间（留空播到结束）', 'string', data.endTime ?? '', disabled)} onCommit={(value) => update('video', (content) => {
          if (content.nativeType !== 'video') return
          const text = String(value).trim()
          const number = Number(text)
          if (!text) content.data.endTime = null
          else if (Number.isFinite(number)) content.data.endTime = number
        })} />
        <SelectField field="content.data.poster.mode" label="封面来源" value={data.poster.mode} options={[{ value: 'video-frame', label: '视频画面' }, { value: 'image', label: '自选图片' }]} disabled={disabled} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.poster.mode = value })} />
        {data.poster.mode === 'image' && (
          <AuthoringValueEditor entry={scalarEntry('content.data.poster.assetId', '封面图片', 'asset', data.poster.assetId ?? '', disabled)} onCommit={() => undefined} onReplaceAsset={onReplaceAsset} />
        )}
        <AuthoringValueEditor entry={scalarEntry('content.data.poster.time', '封面时间（秒）', 'number', data.poster.time, disabled)} onCommit={(value) => update('video', (content) => { if (content.nativeType === 'video') content.data.poster.time = Number(value) })} />
      </div>
    )
  }

  if (nativeType === 'shape') {
    const data = item.content.data
    const styleNumber = (key: 'fillOpacity' | 'borderOpacity' | 'borderWidth' | 'cornerRadius', value: unknown) => update('shape', (content) => {
      if (content.nativeType === 'shape') content.data.style[key] = Number(value)
    })
    return (
      <div className="course-authoring-controls" aria-label="形状样式">
        <SelectField field="content.data.shapeType" label="形状" value={data.shapeType} options={SHAPE_TYPES.map((value) => ({ value, label: shapeTypeLabel(value) }))} disabled={disabled} onCommit={(value) => update('shape', (content) => { if (content.nativeType === 'shape') content.data.shapeType = value })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.style.fillColor', '填充颜色', 'string', data.style.fillColor, disabled)} onCommit={(value) => update('shape', (content) => { if (content.nativeType === 'shape') content.data.style.fillColor = String(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.style.fillOpacity', '填充不透明度', 'number', data.style.fillOpacity, disabled)} onCommit={(value) => styleNumber('fillOpacity', value)} />
        <AuthoringValueEditor entry={scalarEntry('content.data.style.borderColor', '边框颜色', 'string', data.style.borderColor, disabled)} onCommit={(value) => update('shape', (content) => { if (content.nativeType === 'shape') content.data.style.borderColor = String(value) })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.style.borderOpacity', '边框不透明度', 'number', data.style.borderOpacity, disabled)} onCommit={(value) => styleNumber('borderOpacity', value)} />
        <AuthoringValueEditor entry={scalarEntry('content.data.style.borderWidth', '边框粗细', 'number', data.style.borderWidth, disabled)} onCommit={(value) => styleNumber('borderWidth', value)} />
        <SelectField field="content.data.style.lineStyle" label="边框线型" value={data.style.lineStyle} options={lineStyleOptions} disabled={disabled} onCommit={(value) => update('shape', (content) => { if (content.nativeType === 'shape') content.data.style.lineStyle = value })} />
        <AuthoringValueEditor entry={scalarEntry('content.data.style.cornerRadius', '圆角', 'number', data.style.cornerRadius, disabled)} onCommit={(value) => styleNumber('cornerRadius', value)} />
        <SelectField field="content.data.style.startArrow" label="起点端点" value={data.style.startArrow} options={arrowOptions} disabled={disabled} onCommit={(value) => update('shape', (content) => { if (content.nativeType === 'shape') content.data.style.startArrow = value })} />
        <SelectField field="content.data.style.endArrow" label="终点端点" value={data.style.endArrow} options={arrowOptions} disabled={disabled} onCommit={(value) => update('shape', (content) => { if (content.nativeType === 'shape') content.data.style.endArrow = value })} />
      </div>
    )
  }

  const data = item.content.data
  return (
    <div className="course-authoring-controls" aria-label="教师控制器设置">
      <AuthoringValueEditor entry={scalarEntry('content.data.title', '控制器标题', 'string', data.title, disabled)} onCommit={(value) => update('teacher-controller', (content) => { if (content.nativeType === 'teacher-controller') content.data.title = String(value) })} />
      <AuthoringValueEditor entry={scalarEntry('content.data.showSceneProgress', '显示课程进度', 'boolean', data.showSceneProgress, disabled)} onCommit={(value) => update('teacher-controller', (content) => { if (content.nativeType === 'teacher-controller') content.data.showSceneProgress = Boolean(value) })} />
      <AuthoringValueEditor entry={scalarEntry('content.data.compact', '紧凑显示', 'boolean', data.compact, disabled)} onCommit={(value) => update('teacher-controller', (content) => { if (content.nativeType === 'teacher-controller') content.data.compact = Boolean(value) })} />
      <AuthoringValueEditor entry={scalarEntry('content.data.collapsible', '允许收起', 'boolean', data.collapsible, disabled)} onCommit={(value) => update('teacher-controller', (content) => { if (content.nativeType === 'teacher-controller') content.data.collapsible = Boolean(value) })} />
      <AuthoringValueEditor entry={scalarEntry('content.data.defaultCollapsed', '默认收起', 'boolean', data.defaultCollapsed, disabled)} onCommit={(value) => update('teacher-controller', (content) => { if (content.nativeType === 'teacher-controller') content.data.defaultCollapsed = Boolean(value) })} />
      <EditorGroup title="控制按钮">
        {data.buttons.map((button, index) => (
          <div key={button.id} className="course-controller-button-editor">
            <AuthoringValueEditor entry={scalarEntry(`content.data.buttons.${index}.label`, `按钮文字：${button.label}`, 'string', button.label, disabled)} onCommit={(value) => update('teacher-controller', (content) => {
              if (content.nativeType === 'teacher-controller' && content.data.buttons[index]) content.data.buttons[index].label = String(value)
            })} />
            <AuthoringValueEditor entry={scalarEntry(`content.data.buttons.${index}.visible`, `显示“${button.label}”按钮`, 'boolean', button.visible, disabled)} onCommit={(value) => update('teacher-controller', (content) => {
              if (content.nativeType === 'teacher-controller' && content.data.buttons[index]) content.data.buttons[index].visible = Boolean(value)
            })} />
          </div>
        ))}
      </EditorGroup>
    </div>
  )
}

export interface DynamicLayerContentEditorProps {
  item: ComponentLayerItem | RuntimeLayerItem
  selectedField?: string
  selectedLabel?: string
  selectedTargetKind?: 'text' | 'asset'
  disabled?: boolean
  onChange: LayerUpdater
  onReplaceAsset?(field: string): void
}

function decodePath(field: string): string[] {
  return field.split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function dynamicSelection(item: ComponentLayerItem | RuntimeLayerItem, field: string): {
  value: unknown
  valueKind: AuthoringInventoryValueKind
} | null {
  const path = decodePath(field)
  if (item.kind === 'runtime') {
    if (path.length === 4 && path[0] === 'runtime' && path[1] === 'content' && path[2] === 'values') {
      const key = path[3]!
      return Object.prototype.hasOwnProperty.call(item.runtime.content.values, key)
        ? { value: item.runtime.content.values[key], valueKind: 'string' }
        : null
    }
    if (path.length === 4 && path[0] === 'runtime' && path[1] === 'assets' && path[3] === 'assetId') {
      const key = path[2]!
      return item.runtime.assets[key]
        ? { value: item.runtime.assets[key].assetId, valueKind: 'asset' }
        : null
    }
    return null
  }
  if (path[0] !== 'props' || path.length < 2) return null
  let value: unknown = item.props
  for (const part of path.slice(1)) {
    if (Array.isArray(value)) {
      const index = Number(part)
      if (!Number.isInteger(index) || index < 0 || index >= value.length) return null
      value = value[index]
    } else if (typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, part)) {
      value = (value as Record<string, unknown>)[part]
    } else return null
  }
  const valueKind: AuthoringInventoryValueKind = value === null
    ? 'null'
    : Array.isArray(value)
      ? 'array'
      : typeof value === 'object'
        ? 'object'
        : typeof value === 'number'
          ? 'number'
          : typeof value === 'boolean'
            ? 'boolean'
            : 'string'
  return { value, valueKind }
}

function setNestedValue(root: Record<string, unknown>, path: readonly string[], nextValue: unknown): boolean {
  let current: unknown = root
  for (const part of path.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = Number(part)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return false
      current = current[index]
    } else if (typeof current === 'object' && current !== null && Object.prototype.hasOwnProperty.call(current, part)) {
      current = (current as Record<string, unknown>)[part]
    } else return false
  }
  const last = path.at(-1)
  if (last === undefined) return false
  if (Array.isArray(current)) {
    const index = Number(last)
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return false
    current[index] = nextValue
    return true
  }
  if (typeof current !== 'object' || current === null || !Object.prototype.hasOwnProperty.call(current, last)) return false
  ;(current as Record<string, unknown>)[last] = nextValue
  return true
}

/** Directly edits the selected inventory leaf; no parallel property schema. */
export function DynamicLayerContentEditor({
  item,
  selectedField,
  selectedLabel,
  selectedTargetKind,
  disabled,
  onChange,
  onReplaceAsset,
}: DynamicLayerContentEditorProps) {
  if (!selectedField) {
    return <p className="course-authoring-empty">在画布中选中具体文字、数值或素材后，即可在这里修改。</p>
  }
  const selected = dynamicSelection(item, selectedField)
  if (!selected) {
    return <p role="status">当前选中的内容已变化，请在画布中重新选择。</p>
  }
  const path = decodePath(selectedField)
  return (
    <div className="course-authoring-controls" aria-label={item.kind === 'runtime' ? '互动内容编辑' : '组件内容编辑'}>
      <AuthoringValueEditor
        entry={{
          field: selectedField,
          label: selectedLabel ?? (item.kind === 'runtime' ? item.runtime.content.metadata?.[path.at(-1) ?? '']?.label : undefined) ?? '当前选中内容',
          valueKind: selectedTargetKind === 'asset' ? 'asset' : selected.valueKind,
          currentValue: selected.value,
          disabled,
        }}
        onReplaceAsset={onReplaceAsset}
        onCommit={(value) => onChange((draft) => {
          if (item.kind === 'runtime') {
            if (draft.kind !== 'runtime') return
            if (path[0] === 'runtime' && path[1] === 'content' && path[2] === 'values' && path[3] !== undefined) {
              draft.runtime.content.values[path[3]] = String(value)
            } else if (path[0] === 'runtime' && path[1] === 'assets' && path[2] !== undefined && path[3] === 'assetId' && draft.runtime.assets[path[2]]) {
              draft.runtime.assets[path[2]].assetId = String(value)
            }
          } else if (draft.kind === 'component' && path[0] === 'props') {
            setNestedValue(draft.props, path.slice(1), value)
          }
        })}
      />
    </div>
  )
}
