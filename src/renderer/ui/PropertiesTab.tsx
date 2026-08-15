import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Box,
  Check,
  ChevronDown,
  Copy,
  Code2,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Highlighter,
  ImageIcon,
  Italic,
  Layers3,
  Lock,
  Palette,
  Play,
  Globe2,
  Shapes,
  SlidersHorizontal,
  Sigma,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Unlock,
  Video,
  Workflow,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import {
  findPresentationState,
  isNodeOverriddenInState,
  materializeScene,
} from '../../shared/presentation'
import type {
  ArrowHead,
  DeepPartial,
  FeatherMode,
  FormulaNode,
  GlobalLayerVisibility,
  ImageFit,
  ImageNode,
  ProjectDocument,
  SceneDocument,
  SceneNode,
  ShapeLineStyle,
  ShapeNode,
  ShapeType,
  TextAlign,
  TextNode,
  TeacherControllerAction,
  TeacherControllerNode,
  VideoNode,
  TextOverflowMode,
  VerticalAlign,
  WritingMode,
  SoundDefinition,
} from '../../shared/projectTypes'
import type { InteractionRule } from '../../shared/interactionTypes'
import { formulaAstToAccessibleText } from '../../shared/formulaLinear'
import type {
  RuntimeDocument,
  RuntimeLayer,
  RuntimeRenderMode,
} from '../../shared/runtimeTypes'
import { isStrokeOnlyShapeType, SHAPE_TYPES } from '../../shared/projectTypes'
import {
  isVerticalWritingMode,
  renderTextNodeCanvas,
} from '../../shared/textLayout'
import { remapTextRuns } from '../../shared/textRuns'
import {
  opacityToTransparencyPercent,
  transparencyPercentToOpacity,
} from '../../shared/opacity'
import { collectProjectDiagnostics } from '../../shared/projectDiagnostics'
import {
  selectActiveScene,
  selectEditingNodes,
  selectSelectedNode,
  type AlignmentMode,
  useEditorStore,
} from '../store/editorStore'
import { ColorInput } from './ColorInput'
import { ComponentPropertiesEditor } from './ComponentPropertiesEditor'
import { RuntimeContentEditor } from './RuntimeContentEditor'
import { InteractionEditor } from './InteractionEditor'
import { PresenterSettingsEditor } from './PresenterSettingsEditor'
import { DesignTokensEditor } from './DesignTokensEditor'
import { SimpleEntranceAnimationEditor } from './SimpleEntranceAnimationEditor'
import { FormulaAuthoringEditor } from './FormulaAuthoringEditor'

interface BufferedInputProps {
  label: string
  value: string | number
  type?: 'text' | 'number'
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  title?: string
  onCommit(value: string): void
}

function BufferedInput({
  label,
  value,
  type = 'text',
  min,
  max,
  step,
  disabled,
  title,
  onCommit,
}: BufferedInputProps) {
  const [draft, setDraft] = useState(String(value))
  const cancelledRef = useRef(false)
  useLayoutEffect(() => {
    setDraft(String(value))
    cancelledRef.current = false
  }, [value])
  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false
      setDraft(String(value))
      return
    }
    if (draft === String(value)) return
    if (type === 'number') {
      const parsed = Number(draft)
      if (!Number.isFinite(parsed)) {
        setDraft(String(value))
        return
      }
      const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed))
      onCommit(String(clamped))
      setDraft(String(clamped))
      return
    }
    if (draft.trim()) onCommit(draft.trim())
    else setDraft(String(value))
  }
  return (
    <div className="form-field">
      <label>{label}</label>
      <input
        className="form-input"
        aria-label={label}
        type={type}
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        title={title}
        onChange={(event) => {
          cancelledRef.current = false
          setDraft(event.target.value)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            cancelledRef.current = true
            setDraft(String(value))
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange(value: T): void
}) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <select
        className="form-input"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange(value: number): void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next))
    setDraft(clamped)
    if (clamped !== value) onChange(clamped)
  }
  return (
    <div className="form-field range-field">
      <label><span>{label}</span><span>{Number(draft.toFixed(2))}{suffix}</span></label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-label={label}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onPointerCancel={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
        onBlur={(event) => commit(Number(event.currentTarget.value))}
      />
    </div>
  )
}

interface PropertyColorInputProps {
  id: string
  label: string
  value: string
  onChange(value: string): boolean | void
}

type PropertyColorInputComponent = ComponentType<PropertyColorInputProps>

function LegacyPropertyColorInput({
  id,
  label,
  value,
  onChange,
}: PropertyColorInputProps) {
  return (
    <ColorInput
      id={id}
      label={label}
      value={value}
      onChange={(next) => { onChange(next) }}
    />
  )
}

function ControlledPropertyColorInput({
  id,
  label,
  value,
  onChange,
}: PropertyColorInputProps) {
  const [draft, setDraft] = useState(value)
  const submittedRef = useRef(value.toLowerCase())
  const cancelledRef = useRef(false)
  useEffect(() => {
    setDraft(value)
    submittedRef.current = value.toLowerCase()
    cancelledRef.current = false
  }, [value])
  const valid = /^#[0-9a-fA-F]{6}$/.test(draft)
  const normalizedDraft = valid ? draft.toLowerCase() : ''
  const dirty = valid && normalizedDraft !== value.toLowerCase()
  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false
      setDraft(value)
      return
    }
    if (!valid) {
      setDraft(value)
      return
    }
    if (
      normalizedDraft === value.toLowerCase() ||
      normalizedDraft === submittedRef.current
    ) return
    const accepted = onChange(normalizedDraft)
    if (accepted === false) {
      submittedRef.current = value.toLowerCase()
      setDraft(value)
      return
    }
    submittedRef.current = normalizedDraft
    setDraft(normalizedDraft)
  }

  return (
    <div className="form-field">
      <label htmlFor={`${id}-controlled-text`}>{label}</label>
      <div className="color-control color-control--controlled">
        <input
          className="color-swatch"
          id={`${id}-controlled-picker`}
          type="color"
          aria-label={`${label}选择器`}
          value={valid ? normalizedDraft : value}
          onChange={(event) => {
            cancelledRef.current = false
            setDraft(event.target.value)
          }}
        />
        <input
          className="form-input"
          id={`${id}-controlled-text`}
          aria-label={label}
          value={draft}
          maxLength={7}
          onChange={(event) => {
            cancelledRef.current = false
            setDraft(event.target.value)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelledRef.current = true
              setDraft(value)
              event.currentTarget.blur()
            }
          }}
        />
        <button
          type="button"
          className="secondary-button"
          aria-label={`应用${label}`}
          disabled={!dirty}
          onClick={commit}
        >
          应用
        </button>
      </div>
    </div>
  )
}

function ToggleRow({ label, checked, disabled = false, onChange }: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange(checked: boolean): void
}) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <label className="toggle">
        <input
          type="checkbox"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="toggle-track" />
      </label>
    </div>
  )
}

function TextContentTextarea({
  label,
  value,
  disabled = false,
  title,
  onBegin,
  onChange,
  onCommit,
  onCancel,
}: {
  label: string
  value: string
  disabled?: boolean
  title?: string
  onBegin(): void
  onChange(value: string): void
  onCommit(): void
  onCancel(): void
}) {
  const composingRef = useRef(false)
  return (
    <div className="form-field">
      <label>{label}</label>
      <textarea
        className="form-textarea"
        aria-label={label}
        value={value}
        disabled={disabled}
        title={title}
        onFocus={onBegin}
        onChange={(event) => onChange(event.target.value)}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (composingRef.current || event.nativeEvent.isComposing) return
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
            event.currentTarget.blur()
          }
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            onCommit()
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

export const FONT_FAMILY_OPTIONS = [
  { label: '微软雅黑', family: 'Microsoft YaHei' },
  { label: '微软雅黑 UI', family: 'Microsoft YaHei UI' },
  { label: '微软正黑体', family: 'Microsoft JhengHei' },
  { label: '等线', family: 'DengXian' },
  { label: '宋体', family: 'SimSun' },
  { label: '黑体', family: 'SimHei' },
  { label: '楷体', family: 'KaiTi' },
  { label: '仿宋', family: 'FangSong' },
  { label: '华文黑体', family: 'STHeiti' },
  { label: '华文宋体', family: 'STSong' },
  { label: '华文楷体', family: 'STKaiti' },
  { label: '华文仿宋', family: 'STFangsong' },
  { label: '苹方', family: 'PingFang SC' },
  { label: '冬青黑体', family: 'Hiragino Sans GB' },
  { label: '思源黑体', family: 'Source Han Sans SC' },
  { label: '思源宋体', family: 'Source Han Serif SC' },
  { label: 'Noto 无衬线中文', family: 'Noto Sans SC' },
  { label: 'Noto 衬线中文', family: 'Noto Serif SC' },
  { label: 'Noto CJK 黑体', family: 'Noto Sans CJK SC' },
  { label: 'Noto CJK 宋体', family: 'Noto Serif CJK SC' },
  { label: 'Inter', family: 'Inter' },
  { label: 'Arial', family: 'Arial' },
  { label: 'Helvetica', family: 'Helvetica' },
  { label: 'Verdana', family: 'Verdana' },
  { label: 'Tahoma', family: 'Tahoma' },
  { label: 'Trebuchet MS', family: 'Trebuchet MS' },
  { label: 'Georgia', family: 'Georgia' },
  { label: 'Times New Roman', family: 'Times New Roman' },
  { label: 'Courier New', family: 'Courier New' },
  { label: '无衬线通用字体', family: 'sans-serif' },
  { label: '衬线通用字体', family: 'serif' },
  { label: '等宽通用字体', family: 'monospace' },
] as const

export const COMMON_FONT_FAMILIES = FONT_FAMILY_OPTIONS.map(
  (option) => option.family,
)

type FontAvailability = 'available' | 'unavailable' | 'unknown'

export function detectFontAvailability(fontFamily: string): FontAvailability {
  if (['sans-serif', 'serif', 'monospace'].includes(fontFamily)) {
    return 'available'
  }
  if (typeof document === 'undefined' || !document.fonts?.check) {
    return 'unknown'
  }
  const escapedFamily = fontFamily.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  try {
    return document.fonts.check(
      `16px "${escapedFamily}"`,
      '中文字体预览 Aa 123',
    )
      ? 'available'
      : 'unavailable'
  } catch {
    return 'unknown'
  }
}

function FontFamilyPicker({ value, onCommit }: {
  value: string
  onCommit(value: string): void
}) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const [queryDirty, setQueryDirty] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const focusedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focusedRef.current) setDraft(value)
  }, [value])

  const currentOption = FONT_FAMILY_OPTIONS.find(
    (option) => option.family === value,
  )
  const availableFonts = currentOption
    ? [...FONT_FAMILY_OPTIONS]
    : [
        ...(value
          ? [{ label: '自定义字体', family: value } as const]
          : []),
        ...FONT_FAMILY_OPTIONS,
      ]
  const normalizedQuery = draft.trim().toLocaleLowerCase()
  const visibleFonts = queryDirty && normalizedQuery
    ? availableFonts.filter((font) => (
      font.family.toLocaleLowerCase().includes(normalizedQuery) ||
      font.label.toLocaleLowerCase().includes(normalizedQuery)
    ))
    : availableFonts

  const commit = (candidate = draft) => {
    const next = candidate.trim()
    if (!next) {
      setDraft(value)
      return
    }
    setDraft(next)
    if (next !== value) onCommit(next)
  }

  const openAllFonts = () => {
    const selectedIndex = availableFonts.findIndex(
      (font) => font.family === draft,
    )
    setQueryDirty(false)
    setActiveIndex(Math.max(0, selectedIndex))
    setOpen(true)
  }

  const selectFont = (font: string) => {
    setDraft(font)
    setOpen(false)
    setQueryDirty(false)
    if (font !== value) onCommit(font)
    inputRef.current?.focus()
  }

  return (
    <div
      className="form-field font-family-field"
      onFocus={() => { focusedRef.current = true }}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return
        }
        focusedRef.current = false
        setOpen(false)
        setQueryDirty(false)
        commit()
      }}
    >
      <label htmlFor="text-font-family">字体</label>
      <div className="font-family-combobox">
        <input
          ref={inputRef}
          id="text-font-family"
          className="form-input font-family-input"
          type="text"
          role="combobox"
          aria-label="字体"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="courseware-font-families"
          aria-activedescendant={
            open && visibleFonts[activeIndex]
              ? `courseware-font-option-${activeIndex}`
              : undefined
          }
          value={draft}
          spellCheck={false}
          onFocus={() => {
            if (!open) openAllFonts()
          }}
          onClick={() => {
            if (!open) openAllFonts()
          }}
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            setQueryDirty(true)
            setActiveIndex(0)
            setOpen(true)
            if (COMMON_FONT_FAMILIES.some((font) => font === next)) commit(next)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (!open) {
                openAllFonts()
                return
              }
              const direction = event.key === 'ArrowDown' ? 1 : -1
              setActiveIndex((current) => {
                if (visibleFonts.length === 0) return 0
                return (current + direction + visibleFonts.length) % visibleFonts.length
              })
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const activeFont = open ? visibleFonts[activeIndex] : undefined
              if (activeFont) selectFont(activeFont.family)
              else {
                commit()
                setOpen(false)
              }
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setDraft(value)
              setOpen(false)
              setQueryDirty(false)
            }
          }}
          style={{ fontFamily: draft || value }}
        />
        <button
          type="button"
          className="font-family-toggle"
          aria-label={open ? '收起字体列表' : '展开字体列表'}
          aria-controls="courseware-font-families"
          aria-expanded={open}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) setOpen(false)
            else openAllFonts()
            inputRef.current?.focus()
          }}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open ? (
          <div
            id="courseware-font-families"
            className="font-family-listbox"
            role="listbox"
            aria-label="常用字体"
          >
            {visibleFonts.length > 0 ? visibleFonts.map((font, index) => {
              const availability = detectFontAvailability(font.family)
              const availabilityLabel = availability === 'available'
                ? '可用'
                : availability === 'unavailable'
                  ? '未安装'
                  : '未检测'
              return (
              <button
                id={`courseware-font-option-${index}`}
                type="button"
                role="option"
                aria-selected={font.family === draft}
                aria-label={`${font.label}，${font.family}，${availabilityLabel}`}
                className={
                  `font-family-option${index === activeIndex ? ' is-active' : ''}`
                }
                key={font.family}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectFont(font.family)}
                style={{ fontFamily: font.family }}
              >
                <span className="font-family-option__identity">
                  <strong>{font.label}</strong>
                  <small>{font.family}</small>
                </span>
                <span
                  className={`font-family-option__status font-family-option__status--${availability}`}
                >
                  {availabilityLabel}
                </span>
                {font.family === draft
                  ? <Check size={14} aria-hidden="true" />
                  : null}
              </button>
              )
            }) : (
              <div className="font-family-empty">
                按 Enter 使用“{draft.trim()}”
              </div>
            )}
          </div>
        ) : null}
      </div>
      <div
        className="font-family-preview"
        data-testid="font-family-preview"
        style={{ fontFamily: draft || value }}
      >
        中文字体预览 Aa 123
      </div>
      <small className="font-family-help">
        列表同时显示中文名、CSS 字体名和本机可用状态；仍可输入自定义字体或回退字体串。
      </small>
    </div>
  )
}

function CommonNodeProperties({ node, editorMode, update }: {
  node: SceneNode
  editorMode: 'simple' | 'professional'
  update(patch: DeepPartial<SceneNode>): void
}) {
  const autoSizedText = node.type === 'text' &&
    node.style.overflow === 'auto-height'
  const verticalAutoSizedText = autoSizedText &&
    isVerticalWritingMode(node.style.writingMode)
  return (
    <section className="property-section">
      <h3 className="property-title"><SlidersHorizontal size={14} />通用</h3>
      <BufferedInput label="名称" value={node.name} onCommit={(name) => update({ name })} />
      {editorMode === 'professional' && <div className="coordinate-grid">
        <BufferedInput label="X" type="number" step={0.1} value={Number(node.x.toFixed(1))} onCommit={(x) => update({ x: Number(x) })} />
        <BufferedInput label="Y" type="number" step={0.1} value={Number(node.y.toFixed(1))} onCommit={(y) => update({ y: Number(y) })} />
      </div>}
      <div className="coordinate-grid">
        <BufferedInput
          label="宽"
          type="number"
          min={16}
          step={0.1}
          value={Number(node.width.toFixed(1))}
          disabled={verticalAutoSizedText}
          title={verticalAutoSizedText
            ? '当前由竖排文字内容自动计算宽度'
            : undefined}
          onCommit={(width) => update({ width: Number(width) })}
        />
        <BufferedInput
          label="高"
          type="number"
          min={16}
          step={0.1}
          value={Number(node.height.toFixed(1))}
          disabled={autoSizedText && !verticalAutoSizedText}
          title={autoSizedText && !verticalAutoSizedText
            ? '当前由横排文字内容自动计算高度'
            : undefined}
          onCommit={(height) => update({ height: Number(height) })}
        />
      </div>
      {autoSizedText && (
        <p className="property-hint">
          {verticalAutoSizedText
            ? '竖排时宽度自动适应内容；高度可直接输入或拖动画布上下边缘调整。'
            : '横排时高度自动适应内容；宽度可直接输入或拖动画布左右边缘调整。'}
        </p>
      )}
      {editorMode === 'professional' ? <div className="coordinate-grid">
        <BufferedInput label="旋转角度" type="number" min={-36000} max={36000} step={1} value={Number(node.rotation.toFixed(1))} onCommit={(rotation) => update({ rotation: Number(rotation) })} />
        <BufferedInput
          label="透明度 %"
          type="number"
          min={0}
          max={100}
          step={1}
          value={opacityToTransparencyPercent(node.opacity)}
          onCommit={(transparency) => update({
            opacity: transparencyPercentToOpacity(Number(transparency)),
          })}
        />
      </div> : (
        <>
          <BufferedInput
            label="透明度 %"
            type="number"
            min={0}
            max={100}
            step={1}
            value={opacityToTransparencyPercent(node.opacity)}
            onCommit={(transparency) => update({
              opacity: transparencyPercentToOpacity(Number(transparency)),
            })}
          />
          <details className="simple-advanced-properties">
            <summary>更多布局设置</summary>
            <div className="coordinate-grid">
              <BufferedInput label="X" type="number" step={0.1} value={Number(node.x.toFixed(1))} onCommit={(x) => update({ x: Number(x) })} />
              <BufferedInput label="Y" type="number" step={0.1} value={Number(node.y.toFixed(1))} onCommit={(y) => update({ y: Number(y) })} />
              <BufferedInput label="旋转角度" type="number" min={-36000} max={36000} step={1} value={Number(node.rotation.toFixed(1))} onCommit={(rotation) => update({ rotation: Number(rotation) })} />
            </div>
          </details>
        </>
      )}
      <ToggleRow label="显示图层" checked={node.visible} onChange={(visible) => update({ visible })} />
      <button type="button" className="secondary-button" style={{ width: '100%' }} onClick={() => update({ locked: !node.locked })}>
        {node.locked ? <Unlock size={14} /> : <Lock size={14} />}
        {node.locked ? '解锁图层' : '锁定图层'}
      </button>
      {editorMode === 'professional' && <div className="form-field" style={{ marginTop: 12 }}>
        <label>互动播放初始状态</label>
        <SelectField<SceneNode['playbackInitialVisibility']>
          label="播放开始时"
          value={node.playbackInitialVisibility}
          options={[
            { value: 'inherit', label: '跟随作者可见性' },
            { value: 'hidden', label: '先隐藏，等待入场动作' },
          ]}
          onChange={(playbackInitialVisibility) => update({
            playbackInitialVisibility,
          })}
        />
        <p className="property-hint">
          “等待入场”只影响互动播放；编辑画布、缩略图和 PDF/PPTX 仍显示作者设定的稳定画面。何时出现或退出请在规则的动作步骤中配置。
        </p>
      </div>}
    </section>
  )
}

function TextPropertiesView({
  node,
  update,
  onBeginTextEdit,
  onChangeText,
  onCommitTextEdit,
  onCancelTextEdit,
  onOpenRichText,
  ColorField = LegacyPropertyColorInput,
  textContentUnavailableReason,
  richTextUnavailableReason,
}: {
  node: TextNode
  update(patch: DeepPartial<SceneNode>): void
  onBeginTextEdit(): void
  onChangeText(text: string): void
  onCommitTextEdit(): void
  onCancelTextEdit(): void
  onOpenRichText?(): void
  ColorField?: PropertyColorInputComponent
  textContentUnavailableReason?: string
  richTextUnavailableReason?: string
}) {
  const style = node.style
  const toggleStyle = (key: 'bold' | 'italic' | 'underline' | 'strike') =>
    update({ style: { [key]: !style[key] } } as DeepPartial<SceneNode>)
  return (
    <section className="property-section">
      <h3 className="property-title"><Type size={14} />文本</h3>
      <TextContentTextarea
        label="文字内容"
        value={node.text}
        disabled={Boolean(textContentUnavailableReason)}
        title={textContentUnavailableReason}
        onBegin={onBeginTextEdit}
        onChange={onChangeText}
        onCommit={onCommitTextEdit}
        onCancel={onCancelTextEdit}
      />
      {textContentUnavailableReason && (
        <p className="property-hint" role="status">{textContentUnavailableReason}</p>
      )}
      <button
        type="button"
        className="secondary-button"
        style={{ width: '100%', marginBottom: 10 }}
        disabled={!onOpenRichText}
        title={richTextUnavailableReason}
        onClick={onOpenRichText}
      >
        <Type size={14} />编辑局部文字格式
      </button>
      {richTextUnavailableReason ? (
        <p className="property-hint" role="status">{richTextUnavailableReason}</p>
      ) : (
        <p className="property-hint">也可以双击画布中的文字，选中部分内容后设置局部格式。</p>
      )}
      <FontFamilyPicker value={style.fontFamily} onCommit={(fontFamily) => update({ style: { fontFamily } })} />
      <div className="coordinate-grid">
        <BufferedInput label="字号" type="number" min={8} max={400} value={style.fontSize} onCommit={(fontSize) => update({ style: { fontSize: Number(fontSize) } })} />
        <BufferedInput label="行距" type="number" min={0} max={200} value={style.lineSpacing} onCommit={(lineSpacing) => update({ style: { lineSpacing: Number(lineSpacing) } })} />
        <BufferedInput label="字距" type="number" min={-20} max={100} value={style.letterSpacing} onCommit={(letterSpacing) => update({ style: { letterSpacing: Number(letterSpacing) } })} />
        <BufferedInput label="内边距" type="number" min={0} max={200} value={style.padding} onCommit={(padding) => update({ style: { padding: Number(padding) } })} />
      </div>
      <ColorField id="text-color" label="文字颜色" value={style.color} onChange={(color) => update({ style: { color } })} />
      <div className="form-field">
        <label>文字样式</label>
        <div className="segmented-control text-style-control">
          {[
            ['bold', '加粗', Bold], ['italic', '斜体', Italic], ['underline', '下划线', Underline], ['strike', '删除线', Strikethrough],
          ].map(([key, label, Icon]) => (
            <button type="button" key={String(key)} title={String(label)} aria-label={String(label)} className={`segment-button${style[key as 'bold'] ? ' segment-button--active' : ''}`} onClick={() => toggleStyle(key as 'bold' | 'italic' | 'underline' | 'strike')}>
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="form-field">
        <label>高亮</label>
        <div className="inline-control">
          <button type="button" className={`secondary-button${style.highlightColor ? ' secondary-button--active' : ''}`} onClick={() => update({ style: { highlightColor: style.highlightColor ? null : '#fff3a3' } })}>
            <Highlighter size={14} />{style.highlightColor ? '取消高亮' : '启用高亮'}
          </button>
          {style.highlightColor && <ColorField id="text-highlight" label="高亮颜色" value={style.highlightColor} onChange={(highlightColor) => update({ style: { highlightColor } })} />}
        </div>
      </div>
      <ToggleRow
        label="文字着重号"
        checked={style.emphasis}
        onChange={(emphasis) => update({ style: { emphasis } })}
      />
      <p className="property-hint">
        横排显示在字下，竖排显示在字右；局部内容可在画布文字编辑器中单独设置。
      </p>
      <div className="form-field">
        <label>水平对齐</label>
        <div className="segmented-control">
          {([
            ['left', '左对齐', AlignLeft], ['center', '居中', AlignCenter], ['right', '右对齐', AlignRight],
          ] as Array<[TextAlign, string, typeof AlignLeft]>).map(([value, label, Icon]) => (
            <button type="button" key={value} aria-label={label} title={label} className={`segment-button${style.align === value ? ' segment-button--active' : ''}`} onClick={() => update({ style: { align: value } })}><Icon size={15} /></button>
          ))}
        </div>
      </div>
      <SelectField<VerticalAlign> label="垂直对齐" value={style.verticalAlign} options={[{ value: 'top', label: '顶部' }, { value: 'middle', label: '居中' }, { value: 'bottom', label: '底部' }]} onChange={(verticalAlign) => update({ style: { verticalAlign } })} />
      <SelectField<WritingMode>
        label="文字方向"
        value={style.writingMode}
        options={[
          { value: 'horizontal', label: '横排' },
          { value: 'vertical-rl', label: '竖排（列从右向左）' },
          { value: 'vertical-lr', label: '竖排（列从左向右）' },
        ]}
        onChange={(writingMode) => update({ style: { writingMode } })}
      />
      <SelectField<TextOverflowMode>
        label="溢出策略"
        value={style.overflow}
        options={[
          {
            value: 'auto-height',
            label: isVerticalWritingMode(style.writingMode)
              ? '自动增宽'
              : '自动增高',
          },
          { value: 'fixed', label: '固定尺寸并裁切' },
          { value: 'shrink', label: '自动缩小字体' },
        ]}
        onChange={(overflow) => update({ style: { overflow } })}
      />
      <ColorField id="text-background" label="文本框背景" value={style.backgroundColor} onChange={(backgroundColor) => update({ style: { backgroundColor } })} />
      <RangeField
        label="背景透明度"
        value={opacityToTransparencyPercent(style.backgroundOpacity)}
        min={0}
        max={100}
        suffix="%"
        onChange={(value) => update({
          style: { backgroundOpacity: transparencyPercentToOpacity(value) },
        })}
      />
      <RangeField label="文本框圆角" value={style.cornerRadius} min={0} max={Math.min(node.width, node.height) / 2} suffix="px" onChange={(cornerRadius) => update({ style: { cornerRadius } })} />
    </section>
  )
}

function LegacyTextPropertiesAdapter({ node, update }: {
  node: TextNode
  update(patch: DeepPartial<SceneNode>): void
}) {
  const beginTextEdit = useEditorStore((state) => state.beginTextEdit)
  const commitTextEdit = useEditorStore((state) => state.commitTextEdit)
  const cancelTextEdit = useEditorStore((state) => state.cancelTextEdit)
  const updateTextDraft = (text: string) => {
    let state = useEditorStore.getState()
    if (state.textEditSession?.nodeId !== node.id) {
      state.beginTextEdit(node.id, 'properties')
      state = useEditorStore.getState()
    }
    const current = selectEditingNodes(state).find(
      (item) => item.id === node.id,
    )
    if (current?.type !== 'text') return
    const runs = remapTextRuns(current.text, text, current.runs)
    const draftNode = { ...current, text, runs }
    const rendered = current.style.overflow === 'auto-height'
      ? renderTextNodeCanvas(draftNode, draftNode.width)
      : null
    state.updateTextEditDraft(
      current.id,
      text,
      runs,
      rendered?.height ?? current.height,
      rendered?.width ?? current.width,
    )
  }
  return (
    <TextPropertiesView
      node={node}
      update={update}
      onBeginTextEdit={() => beginTextEdit(node.id, 'properties')}
      onChangeText={updateTextDraft}
      onCommitTextEdit={commitTextEdit}
      onCancelTextEdit={cancelTextEdit}
      onOpenRichText={() => beginTextEdit(node.id, 'canvas')}
    />
  )
}

function ControlledTextProperties({
  node,
  update,
  textContentUnavailableReason,
  richTextUnavailableReason,
}: {
  node: TextNode
  update(patch: DeepPartial<SceneNode>): boolean | void
  textContentUnavailableReason: string
  richTextUnavailableReason: string
}) {
  return (
    <TextPropertiesView
      node={node}
      update={update}
      onBeginTextEdit={() => undefined}
      onChangeText={() => undefined}
      onCommitTextEdit={() => undefined}
      onCancelTextEdit={() => undefined}
      ColorField={ControlledPropertyColorInput}
      textContentUnavailableReason={textContentUnavailableReason}
      richTextUnavailableReason={richTextUnavailableReason}
    />
  )
}

function FormulaProperties({
  node,
  update,
  ColorField = LegacyPropertyColorInput,
}: {
  node: FormulaNode
  update(patch: DeepPartial<SceneNode>): void
  ColorField?: PropertyColorInputComponent
}) {
  const generatedAccessibleText = formulaAstToAccessibleText(node.ast)
  const normalizeAccessibleText = (value: string) => value.replace(/\s+/gu, '')
  const accessibilityAutomatic = normalizeAccessibleText(node.accessibleText) ===
    normalizeAccessibleText(generatedAccessibleText)

  return (
    <section className="property-section" data-testid="formula-properties">
      <h3 className="property-title"><Sigma size={14} />公式</h3>
      <FormulaAuthoringEditor
        node={node}
        onCommit={(ast, accessibleText) => update({
          ast,
          accessibleText,
        } as DeepPartial<SceneNode>)}
      />
      <BufferedInput
        label="无障碍描述"
        value={node.accessibleText}
        onCommit={(accessibleText) => update({ accessibleText } as DeepPartial<SceneNode>)}
      />
      <div className="formula-accessibility-status">
        <span className={accessibilityAutomatic
          ? 'formula-accessibility-status__automatic'
          : 'formula-accessibility-status__custom'}>
          {accessibilityAutomatic ? '随公式自动更新' : '使用自定义描述'}
        </span>
        {!accessibilityAutomatic && (
          <button
            type="button"
            className="text-button"
            onClick={() => update({
              accessibleText: generatedAccessibleText,
            } as DeepPartial<SceneNode>)}
          >
            恢复自动描述
          </button>
        )}
      </div>
      <p className="property-hint">
        {accessibilityAutomatic
          ? '当公式结构改变时，读屏和检索描述会在同一次提交中更新。'
          : '自定义描述不会被覆盖；修改公式后请复核它是否仍然准确。'}
      </p>
      <BufferedInput
        label="公式字号"
        type="number"
        min={12}
        max={200}
        value={node.style.fontSize}
        onCommit={(fontSize) => update({
          style: { fontSize: Number(fontSize) },
        } as DeepPartial<SceneNode>)}
      />
      <ColorField
        id="formula-color"
        label="公式颜色"
        value={node.style.color}
        onChange={(color) => update({ style: { color } } as DeepPartial<SceneNode>)}
      />
      <div className="form-field">
        <label>水平对齐</label>
        <div className="segmented-control">
          {([
            ['left', '左对齐', AlignLeft],
            ['center', '居中', AlignCenter],
            ['right', '右对齐', AlignRight],
          ] as Array<[TextAlign, string, typeof AlignLeft]>).map(([value, label, Icon]) => (
            <button
              type="button"
              key={value}
              aria-label={`公式${label}`}
              title={label}
              className={`segment-button${node.style.align === value ? ' segment-button--active' : ''}`}
              onClick={() => update({ style: { align: value } } as DeepPartial<SceneNode>)}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>
      <p className="property-hint">
        PPTX 会按当前共享渲染结果静态化，公式内容和无障碍描述仍会保留。
      </p>
    </section>
  )
}

function ImageProperties({ node, update, onReplaceImage }: {
  node: Extract<SceneNode, { type: 'image' }>
  update(patch: DeepPartial<SceneNode>): void
  onReplaceImage(): void
}) {
  const replaceSafeArea = (
    index: number,
    patch: Partial<ImageNode['safeAreas'][number]>,
  ) => update({
    safeAreas: node.safeAreas.map((area, areaIndex) => (
      areaIndex === index ? { ...area, ...patch } : area
    )),
  })
  return (
    <section className="property-section">
      <h3 className="property-title"><ImageIcon size={14} />图片</h3>
      <button type="button" className="secondary-button" style={{ width: '100%', marginBottom: 12 }} onClick={onReplaceImage}><ImageIcon size={14} />替换图片</button>
      <SelectField<ImageFit> label="显示方式" value={node.fit} options={[{ value: 'contain', label: '适应（完整显示）' }, { value: 'cover', label: '填充（允许裁剪）' }, { value: 'stretch', label: '拉伸' }]} onChange={(fit) => update({ fit })} />
      <ToggleRow label="保持宽高比" checked={node.preserveAspectRatio} onChange={(preserveAspectRatio) => update({ preserveAspectRatio })} />
      <div className="button-row">
        <button type="button" className={`secondary-button${node.flipX ? ' secondary-button--active' : ''}`} onClick={() => update({ flipX: !node.flipX })}><FlipHorizontal2 size={14} />水平翻转</button>
        <button type="button" className={`secondary-button${node.flipY ? ' secondary-button--active' : ''}`} onClick={() => update({ flipY: !node.flipY })}><FlipVertical2 size={14} />垂直翻转</button>
      </div>
      <p className="property-hint">源图裁剪（从对应边缘裁去）</p>
      <RangeField label="左裁剪" value={node.crop.left * 100} min={0} max={(0.98 - node.crop.right) * 100} suffix="%" onChange={(left) => update({ crop: { left: left / 100 } })} />
      <RangeField label="右裁剪" value={node.crop.right * 100} min={0} max={(0.98 - node.crop.left) * 100} suffix="%" onChange={(right) => update({ crop: { right: right / 100 } })} />
      <RangeField label="上裁剪" value={node.crop.top * 100} min={0} max={(0.98 - node.crop.bottom) * 100} suffix="%" onChange={(top) => update({ crop: { top: top / 100 } })} />
      <RangeField label="下裁剪" value={node.crop.bottom * 100} min={0} max={(0.98 - node.crop.top) * 100} suffix="%" onChange={(bottom) => update({ crop: { bottom: bottom / 100 } })} />
      <button
        type="button"
        className="secondary-button"
        style={{ width: '100%', marginBottom: 8 }}
        disabled={Object.values(node.crop).every((value) => value === 0)}
        onClick={() => update({ crop: { left: 0, top: 0, right: 0, bottom: 0 } })}
      >
        重置裁剪
      </button>
      {node.fit !== 'stretch' && (
        <>
          <RangeField label={node.fit === 'cover' ? '填充焦点 X' : '框内位置 X'} value={node.cropX * 100} min={0} max={100} suffix="%" onChange={(cropX) => update({ cropX: cropX / 100 })} />
          <RangeField label={node.fit === 'cover' ? '填充焦点 Y' : '框内位置 Y'} value={node.cropY * 100} min={0} max={100} suffix="%" onChange={(cropY) => update({ cropY: cropY / 100 })} />
        </>
      )}
      <RangeField label="圆角" value={node.cornerRadius} min={0} max={Math.min(node.width, node.height) / 2} suffix="px" onChange={(cornerRadius) => update({ cornerRadius })} />
      <SelectField<FeatherMode> label="羽化形状" value={node.feather.mode} options={[{ value: 'rectangle', label: '矩形边缘' }, { value: 'ellipse', label: '椭圆/径向' }]} onChange={(mode) => update({ feather: { mode } })} />
      <RangeField label="羽化强度" value={node.feather.amount} min={0} max={100} suffix="%" onChange={(amount) => update({ feather: { amount } })} />
      <div className="property-subsection-header">
        <div>
          <strong>图片安全区</strong>
          <small>只在编辑器中显示，不进入成品画面</small>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={node.safeAreas.length >= 16}
          onClick={() => update({
            safeAreas: [...node.safeAreas, {
              id: `safe_area_${nanoid(10)}`,
              label: `安全区 ${node.safeAreas.length + 1}`,
              x: 0.1,
              y: 0.1,
              width: 0.8,
              height: 0.8,
            }],
          })}
        >
          添加安全区
        </button>
      </div>
      {node.safeAreas.map((area, index) => (
        <div className="safe-area-card" key={area.id}>
          <div className="safe-area-card__header">
            <BufferedInput
              label={`安全区 ${index + 1} 名称`}
              value={area.label}
              onCommit={(label) => replaceSafeArea(index, { label })}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`删除安全区 ${area.label}`}
              onClick={() => update({
                safeAreas: node.safeAreas.filter((_, areaIndex) => areaIndex !== index),
              })}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <RangeField label="左侧位置" value={area.x * 100} min={0} max={(1 - area.width) * 100} suffix="%" onChange={(x) => replaceSafeArea(index, { x: x / 100 })} />
          <RangeField label="顶部位置" value={area.y * 100} min={0} max={(1 - area.height) * 100} suffix="%" onChange={(y) => replaceSafeArea(index, { y: y / 100 })} />
          <RangeField label="安全区宽度" value={area.width * 100} min={1} max={(1 - area.x) * 100} suffix="%" onChange={(width) => replaceSafeArea(index, { width: width / 100 })} />
          <RangeField label="安全区高度" value={area.height * 100} min={1} max={(1 - area.y) * 100} suffix="%" onChange={(height) => replaceSafeArea(index, { height: height / 100 })} />
        </div>
      ))}
    </section>
  )
}

function VideoProperties({
  node,
  update,
  diagnostics = [],
  onOpenAutomation,
}: {
  node: VideoNode
  update(patch: DeepPartial<SceneNode>): void
  diagnostics?: string[]
  onOpenAutomation?(): void
}) {
  return (
    <section className="property-section">
      <h3 className="property-title"><Video size={14} />视频</h3>
      <SelectField<ImageFit>
        label="显示方式"
        value={node.fit}
        options={[
          { value: 'contain', label: '适应（完整显示）' },
          { value: 'cover', label: '填充（允许裁剪）' },
          { value: 'stretch', label: '拉伸' },
        ]}
        onChange={(fit) => update({ fit })}
      />
      <ToggleRow label="进入时自动播放" checked={node.autoplay} onChange={(autoplay) => update({ autoplay })} />
      <ToggleRow label="循环播放" checked={node.loop} onChange={(loop) => update({ loop })} />
      <ToggleRow label="视频自身静音" checked={node.muted} onChange={(muted) => update({ muted })} />
      <ToggleRow label="点击切换播放/暂停" checked={node.clickToToggle} onChange={(clickToToggle) => update({ clickToToggle })} />
      <ToggleRow label="显示画布播放控件" checked={node.showControls} onChange={(showControls) => update({ showControls })} />
      <RangeField label="视频音量" value={node.volume * 100} min={0} max={100} suffix="%" onChange={(volume) => update({ volume: volume / 100 })} />
      <BufferedInput label="播放速度" type="number" min={0.25} max={4} step={0.25} value={node.playbackRate} onCommit={(playbackRate) => update({ playbackRate: Number(playbackRate) })} />
      <BufferedInput label="开始时间（秒）" type="number" min={0} step={0.1} value={node.startTime} onCommit={(startTime) => update({ startTime: Number(startTime) })} />
      <BufferedInput label="结束时间（秒，0 表示结尾）" type="number" min={0} step={0.1} value={node.endTime ?? 0} onCommit={(endTime) => update({ endTime: Number(endTime) > 0 ? Number(endTime) : null })} />
      <SelectField<VideoNode['backgroundAudioMode']>
        label="播放时背景音乐"
        value={node.backgroundAudioMode}
        options={[
          { value: 'none', label: '不处理' },
          { value: 'duck', label: '自动降低' },
          { value: 'pause', label: '暂停并恢复' },
          { value: 'stop', label: '停止' },
        ]}
        onChange={(backgroundAudioMode) => update({ backgroundAudioMode })}
      />
      {diagnostics.map((message) => (
        <p key={message} className="property-hint" role="alert">{message}</p>
      ))}
      {onOpenAutomation && (
        <button
          type="button"
          className="secondary-button"
          onClick={onOpenAutomation}
        >
          <Workflow size={14} />配置视频规则
        </button>
      )}
      <p className="property-hint">编辑画布只显示视频封面；真实播放请使用“当前位置试运行”或“整课预览”。PDF/PPTX 会静态化为封面。</p>
    </section>
  )
}

const TEACHER_CONTROLLER_ACTION_OPTIONS: Array<{
  value: TeacherControllerAction['type']
  label: string
}> = [
  { value: 'scene.previous', label: '上一场景' },
  { value: 'scene.next', label: '下一场景' },
  { value: 'scene.replay', label: '重播当前场景' },
  { value: 'course.restart', label: '重新开始课程' },
  { value: 'scene.open-picker', label: '打开场景目录' },
  { value: 'scene.go', label: '跳转到指定场景（高级）' },
  { value: 'audio.toggle-mute', label: '切换静音' },
  { value: 'player.fullscreen.toggle', label: '切换全屏' },
]

function defaultTeacherControllerAction(
  type: TeacherControllerAction['type'],
  scenes: readonly SceneDocument[],
): TeacherControllerAction {
  return type === 'scene.go'
    ? { type, sceneId: scenes[0]?.id ?? '' }
    : { type } as TeacherControllerAction
}

function TeacherControllerProperties({ node, scenes, update }: {
  node: TeacherControllerNode
  scenes: readonly SceneDocument[]
  update(patch: DeepPartial<SceneNode>): void
}) {
  const replaceButton = (
    index: number,
    patch: Partial<TeacherControllerNode['buttons'][number]>,
  ) => update({
    buttons: node.buttons.map((button, buttonIndex) => (
      buttonIndex === index ? { ...button, ...patch } : button
    )),
  })
  const moveButton = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= node.buttons.length) return
    const buttons = [...node.buttons]
    ;[buttons[index], buttons[target]] = [buttons[target]!, buttons[index]!]
    update({ buttons })
  }
  return (
    <section className="property-section">
      <h3 className="property-title"><SlidersHorizontal size={14} />教师控制器</h3>
      <BufferedInput label="控制器标题" value={node.title} onCommit={(title) => update({ title })} />
      <ToggleRow label="显示场景与状态进度" checked={node.showSceneProgress} onChange={(showSceneProgress) => update({ showSceneProgress })} />
      <ToggleRow label="紧凑布局" checked={node.compact} onChange={(compact) => update({ compact })} />
      <ToggleRow label="允许折叠" checked={node.collapsible} onChange={(collapsible) => update({
        collapsible,
        ...(!collapsible ? { defaultCollapsed: false } : {}),
      })} />
      <ToggleRow
        label="打开课件时默认折叠"
        checked={node.defaultCollapsed}
        disabled={!node.collapsible}
        onChange={(defaultCollapsed) => update({ defaultCollapsed })}
      />
      <ColorInput id="controller-background" label="背景色" value={node.style.backgroundColor} onChange={(backgroundColor) => update({ style: { backgroundColor } })} />
      <RangeField
        label="背景透明度"
        value={opacityToTransparencyPercent(node.style.backgroundOpacity)}
        min={0}
        max={100}
        suffix="%"
        onChange={(value) => update({
          style: { backgroundOpacity: transparencyPercentToOpacity(value) },
        })}
      />
      <ColorInput id="controller-accent" label="强调色" value={node.style.accentColor} onChange={(accentColor) => update({ style: { accentColor } })} />
      <ColorInput id="controller-text" label="文字色" value={node.style.textColor} onChange={(textColor) => update({ style: { textColor } })} />
      <RangeField label="圆角" value={node.style.cornerRadius} min={0} max={40} suffix="px" onChange={(cornerRadius) => update({ style: { cornerRadius } })} />
      <div className="form-field">
        <label>控制按钮</label>
        <div className="controller-button-editor">
          {node.buttons.map((button, index) => {
            const sceneAction = button.action.type === 'scene.go'
              ? button.action
              : undefined
            const targetScene = sceneAction
              ? scenes.find((scene) => scene.id === sceneAction.sceneId)
              : undefined
            return (
            <fieldset
              className="controller-button-row"
              key={button.id}
              style={{ display: 'grid', gap: 8, padding: 8, margin: '0 0 8px' }}
            >
              <legend>{`按钮 ${index + 1}`}</legend>
              <input
                aria-label={`${button.label}显示`}
                type="checkbox"
                checked={button.visible}
                onChange={(event) => replaceButton(index, {
                  visible: event.currentTarget.checked,
                })}
              />
              <BufferedInput
                label="按钮文字"
                value={button.label}
                onCommit={(label) => replaceButton(index, { label: String(label) })}
              />
              <SelectField<TeacherControllerAction['type']>
                label="点击动作"
                value={button.action.type}
                options={TEACHER_CONTROLLER_ACTION_OPTIONS}
                onChange={(type) => replaceButton(index, {
                  action: defaultTeacherControllerAction(type, scenes),
                })}
              />
              {button.action.type === 'scene.open-picker' ? (
                <p className="property-hint">
                  播放时展开全部场景；选择后进入该场景的初始状态，无需绑定目标场景或状态。
                </p>
              ) : null}
              {sceneAction ? (
                <>
                  <SelectField<string>
                    label="目标场景"
                    value={sceneAction.sceneId}
                    options={scenes.map((scene) => ({
                      value: scene.id,
                      label: scene.name,
                    }))}
                    onChange={(sceneId) => replaceButton(index, {
                      action: { type: 'scene.go', sceneId },
                    })}
                  />
                  <SelectField<string>
                    label="进入状态"
                    value={sceneAction.targetStateId ?? ''}
                    options={[
                      { value: '', label: '场景初始状态' },
                      ...(targetScene?.presentation?.states ?? []).map((state) => ({
                        value: state.id,
                        label: state.name,
                      })),
                    ]}
                    onChange={(targetStateId) => replaceButton(index, {
                      action: targetStateId
                        ? { ...sceneAction, targetStateId }
                        : { type: 'scene.go', sceneId: sceneAction.sceneId },
                    })}
                  />
                </>
              ) : null}
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={index === 0}
                  onClick={() => moveButton(index, -1)}
                >上移</button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={index === node.buttons.length - 1}
                  onClick={() => moveButton(index, 1)}
                >下移</button>
                <button
                  type="button"
                  className="secondary-button secondary-button--danger"
                  disabled={node.buttons.length <= 1}
                  onClick={() => update({
                    buttons: node.buttons.filter((_, buttonIndex) => buttonIndex !== index),
                  })}
                >删除</button>
              </div>
            </fieldset>
          )})}
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={node.buttons.length >= 12}
          onClick={() => update({
            buttons: [
              ...node.buttons,
              {
                id: `teacher_button_${nanoid()}`,
                label: '场景目录',
                visible: true,
                action: defaultTeacherControllerAction('scene.open-picker', scenes),
              },
            ],
          })}
        >添加按钮（{node.buttons.length}/12）</button>
      </div>
      <ToggleRow label="包含在 PDF/PPTX" checked={node.includeInStaticExports} onChange={(includeInStaticExports) => update({ includeInStaticExports })} />
      <p className="property-hint">该元素属于画布全局层。开启折叠后，可直接点击画布中的“收/展”按钮临时预览，该临时状态不写入工程。</p>
    </section>
  )
}

const SHAPE_LABELS: Record<ShapeType, string> = {
  rectangle: '矩形', 'rounded-rectangle': '圆角矩形', ellipse: '圆形/椭圆', triangle: '三角形', diamond: '菱形', line: '直线',
  'arrow-left': '左箭头', 'arrow-right': '右箭头', 'arrow-up': '上箭头', 'arrow-down': '下箭头', 'arrow-left-right': '双向箭头', 'elbow-arrow': '折线箭头',
  'brace-left': '左大括号', 'brace-right': '右大括号', 'brace-top': '上大括号', 'brace-bottom': '下大括号', 'brace-pair-horizontal': '横向大括号对', 'brace-pair-vertical': '纵向大括号对',
  'bracket-left': '左方括号', 'bracket-right': '右方括号', 'emphasis-dot': '着重圆点', 'emphasis-triangle': '着重三角',
}

function ShapeProperties({
  node,
  update,
  ColorField = LegacyPropertyColorInput,
}: {
  node: ShapeNode
  update(patch: DeepPartial<SceneNode>): void
  ColorField?: PropertyColorInputComponent
}) {
  const style = node.style
  const strokeOnly = isStrokeOnlyShapeType(node.shapeType)
  const supportsArrowHeads = node.shapeType === 'line' || node.shapeType === 'elbow-arrow'
  return (
    <section className="property-section">
      <h3 className="property-title"><Shapes size={14} />图形</h3>
      <SelectField<ShapeType> label="图形类型" value={node.shapeType} options={SHAPE_TYPES.map((value) => ({ value, label: SHAPE_LABELS[value] }))} onChange={(shapeType) => update({ shapeType })} />
      {!strokeOnly && <>
        <ColorField id="shape-fill" label="填充色" value={style.fillColor} onChange={(fillColor) => update({ style: { fillColor } })} />
        <RangeField
          label="填充透明度"
          value={opacityToTransparencyPercent(style.fillOpacity)}
          min={0}
          max={100}
          suffix="%"
          onChange={(value) => update({
            style: { fillOpacity: transparencyPercentToOpacity(value) },
          })}
        />
      </>}
      <ColorField id="shape-border" label={strokeOnly ? '线条颜色' : '边框颜色'} value={style.borderColor} onChange={(borderColor) => update({ style: { borderColor } })} />
      <RangeField
        label={strokeOnly ? '线条透明度' : '边框透明度'}
        value={opacityToTransparencyPercent(style.borderOpacity)}
        min={0}
        max={100}
        suffix="%"
        onChange={(value) => update({
          style: { borderOpacity: transparencyPercentToOpacity(value) },
        })}
      />
      <BufferedInput label={strokeOnly ? '线条宽度' : '边框宽度'} type="number" min={0} max={100} value={style.borderWidth} onCommit={(borderWidth) => update({ style: { borderWidth: Number(borderWidth) } })} />
      <SelectField<ShapeLineStyle> label="线型" value={style.lineStyle} options={[{ value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' }, { value: 'dotted', label: '点线' }]} onChange={(lineStyle) => update({ style: { lineStyle } })} />
      {(node.shapeType === 'rounded-rectangle' || node.shapeType === 'rectangle') && <RangeField label="圆角" value={style.cornerRadius} min={0} max={Math.min(node.width, node.height) / 2} suffix="px" onChange={(cornerRadius) => update({ style: { cornerRadius }, shapeType: cornerRadius > 0 ? 'rounded-rectangle' : 'rectangle' })} />}
      {supportsArrowHeads && <div className="coordinate-grid">
        <SelectField<ArrowHead> label="起点箭头" value={style.startArrow} options={ARROW_OPTIONS} onChange={(startArrow) => update({ style: { startArrow } })} />
        <SelectField<ArrowHead> label="终点箭头" value={style.endArrow} options={ARROW_OPTIONS} onChange={(endArrow) => update({ style: { endArrow } })} />
      </div>}
    </section>
  )
}

const ARROW_OPTIONS: Array<{ value: ArrowHead; label: string }> = [
  { value: 'none', label: '无' }, { value: 'triangle', label: '三角' }, { value: 'stealth', label: '尖角' }, { value: 'circle', label: '圆点' }, { value: 'diamond', label: '菱形' },
]

const ALIGN_ACTIONS: Array<{
  mode: AlignmentMode
  label: string
  icon: typeof AlignHorizontalJustifyStart
}> = [
  { mode: 'left', label: '左对齐', icon: AlignHorizontalJustifyStart },
  { mode: 'center', label: '水平居中', icon: AlignHorizontalJustifyCenter },
  { mode: 'right', label: '右对齐', icon: AlignHorizontalJustifyEnd },
  { mode: 'top', label: '顶对齐', icon: AlignVerticalJustifyStart },
  { mode: 'middle', label: '垂直居中', icon: AlignVerticalJustifyCenter },
  { mode: 'bottom', label: '底对齐', icon: AlignVerticalJustifyEnd },
]

function MultiSelectionProperties({
  nodes,
  presentationContext,
}: {
  nodes: SceneNode[]
  presentationContext: {
    scene: SceneDocument
    stateId: string | null
  } | null
}) {
  const alignSelection = useEditorStore((state) => state.alignSelection)
  const distributeSelection = useEditorStore((state) => state.distributeSelection)
  const updateNodes = useEditorStore((state) => state.updateNodes)
  const duplicateSelectedNodes = useEditorStore((state) => state.duplicateSelectedNodes)
  const deleteSelectedNodes = useEditorStore((state) => state.deleteSelectedNodes)
  const unlockedCount = nodes.filter((node) => !node.locked).length
  const visibleCount = nodes.filter((node) => node.visible).length
  const applyToAll = (patch: DeepPartial<SceneNode>) => {
    updateNodes(nodes.map((node) => ({ nodeId: node.id, patch })))
  }
  const activeState = presentationContext?.stateId
    ? findPresentationState(
      presentationContext.scene,
      presentationContext.stateId,
    )
    : null
  const overriddenCount = activeState && presentationContext
    ? nodes.filter((node) => isNodeOverriddenInState(
      presentationContext.scene,
      activeState.id,
      node.id,
    )).length
    : 0

  return (
    <div className="properties-scroll" data-testid="properties-tab">
      {presentationContext && (
        <section className={`state-editing-notice${activeState ? ' state-editing-notice--override' : ''}`}>
          <Layers3 size={15} />
          <div>
            <strong>{activeState ? `状态：${activeState.name} · 多选` : '基础场景 · 多选'}</strong>
            <span>{activeState
              ? overriddenCount > 0
                ? `${overriddenCount}/${nodes.length} 个所选元素已有覆盖；批量修改只写入当前状态。`
                : `所选 ${nodes.length} 个元素当前继承基础；批量修改将创建状态覆盖。`
              : '批量修改基础元素会影响所有继承这些值的状态。'}</span>
          </div>
        </section>
      )}
      <section className="property-section multi-selection-summary" data-testid="multi-selection-properties">
        <div className="multi-selection-heading">
          <span className="selection-count">{nodes.length}</span>
          <span>
            <strong>已选择多个图层</strong>
            <small>{visibleCount} 个显示 · {nodes.length - unlockedCount} 个锁定</small>
          </span>
        </div>
        <div className="selection-stat-grid" aria-label="选区尺寸">
          <span><small>左</small>{Math.round(Math.min(...nodes.map((node) => node.x)))}</span>
          <span><small>顶</small>{Math.round(Math.min(...nodes.map((node) => node.y)))}</span>
          <span><small>右</small>{Math.round(Math.max(...nodes.map((node) => node.x + node.width)))}</span>
          <span><small>底</small>{Math.round(Math.max(...nodes.map((node) => node.y + node.height)))}</span>
        </div>
      </section>

      <section className="property-section">
        <h3 className="property-title"><SlidersHorizontal size={14} />对齐与分布</h3>
        <div className="property-action-grid property-action-grid--three">
          {ALIGN_ACTIONS.map(({ mode, label, icon: Icon }) => (
            <button
              type="button"
              className="property-action-button"
              key={mode}
              title={label}
              aria-label={label}
              disabled={unlockedCount < 2}
              onClick={() => alignSelection(mode)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="property-action-grid property-action-grid--two property-action-grid--spaced">
          <button type="button" className="property-action-button" disabled={unlockedCount < 3} onClick={() => distributeSelection('horizontal')}>
            <AlignHorizontalDistributeCenter size={16} /><span>水平等距</span>
          </button>
          <button type="button" className="property-action-button" disabled={unlockedCount < 3} onClick={() => distributeSelection('vertical')}>
            <AlignVerticalDistributeCenter size={16} /><span>垂直等距</span>
          </button>
        </div>
        {unlockedCount !== nodes.length && (
          <p className="property-hint">锁定图层不会参与对齐或分布。</p>
        )}
      </section>

      <section className="property-section">
        <h3 className="property-title"><Layers3 size={14} />批量图层操作</h3>
        <div className="property-action-grid property-action-grid--two">
          <button type="button" className="property-action-button" onClick={() => applyToAll({ visible: true })}><Eye size={16} /><span>全部显示</span></button>
          <button type="button" className="property-action-button" onClick={() => applyToAll({ visible: false })}><EyeOff size={16} /><span>全部隐藏</span></button>
          <button type="button" className="property-action-button" onClick={() => applyToAll({ locked: true })}><Lock size={16} /><span>全部锁定</span></button>
          <button type="button" className="property-action-button" onClick={() => applyToAll({ locked: false })}><Unlock size={16} /><span>全部解锁</span></button>
        </div>
        <div className="button-row property-action-footer">
          <button type="button" className="secondary-button" onClick={duplicateSelectedNodes}><Copy size={14} />复制所选</button>
          <button type="button" className="secondary-button secondary-button--danger" onClick={deleteSelectedNodes}><Trash2 size={14} />删除所选</button>
        </div>
      </section>
    </div>
  )
}

type RuntimeEditorPatch = Partial<
  Pick<RuntimeDocument, 'enabled' | 'renderMode' | 'content'>
>

function runtimeSourceSummary(source: string): string {
  const compact = source.replace(/\s+/g, ' ').trim()
  if (!compact) return '空源码'
  return compact.length > 96 ? `${compact.slice(0, 96)}…` : compact
}

function RuntimeInspector({
  runtime,
  scope,
  onChange,
}: {
  runtime: RuntimeDocument | undefined
  scope: 'scene' | 'global'
  onChange(patch: RuntimeEditorPatch): void
}) {
  const title = scope === 'global' ? '全局自定义运行时' : '场景自定义运行时'
  if (!runtime) {
    return (
      <section className="property-section" data-testid={`${scope}-runtime-empty`}>
        <h3 className="property-title"><Code2 size={14} />{title}</h3>
        <p className="property-empty">
          当前没有自定义运行时。运行时代码由 AI 或生成脚本写入工程，编辑器只负责管理和修改登记文案。
        </p>
      </section>
    )
  }

  const sourceBytes = new TextEncoder().encode(runtime.source).byteLength
  const fallbackAsset = runtime.staticFallback?.assetId
  return (
    <section
      className="property-section runtime-inspector"
      data-testid={`${scope}-runtime-inspector`}
    >
      <h3 className="property-title"><Code2 size={14} />{title}</h3>
      <ToggleRow
        label="启用运行时"
        checked={runtime.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />
      <SelectField<RuntimeRenderMode>
        label="渲染能力声明"
        value={runtime.renderMode}
        options={[
          { value: 'phaser', label: 'Phaser 画布' },
          { value: 'dom', label: 'HTML / DOM' },
          { value: 'hybrid', label: '混合渲染' },
        ]}
        onChange={(renderMode) => onChange({ renderMode })}
      />
      <p className="property-hint">
        Runtime API 2 会按此字段只挂载并暴露声明的能力。修改字段不会转换源码，请确认源码支持新模式。
      </p>
      <div className="runtime-summary-grid" aria-label="运行时摘要">
        <span><small>运行时协议</small>API {runtime.runtimeApiVersion}</span>
        <span><small>源码体积</small>{(sourceBytes / 1024).toFixed(sourceBytes >= 1024 ? 1 : 2)} KiB</span>
        <span><small>素材绑定</small>{Object.keys(runtime.assets).length}</span>
        <span><small>可编辑文案</small>{Object.keys(runtime.content.values).length}</span>
        <span><small>静态后备</small>{fallbackAsset ? '已配置' : '未配置'}</span>
      </div>
      <div className="form-field">
        <label>源码摘要（只读）</label>
        <div className="readonly-value runtime-source-summary">
          {runtimeSourceSummary(runtime.source)}
        </div>
      </div>
      {fallbackAsset && (
        <p className="property-hint">
          静态后备：{runtime.staticFallback!.coverage === 'full-scene' ? '整场景' : '运行时图层'} · {runtime.staticFallback!.layer}
        </p>
      )}
      <div className="runtime-content-heading">
        <strong>可编辑文字</strong>
        <span>修改这里只更新 content.values，不会改写源码。</span>
      </div>
      <RuntimeContentEditor
        runtime={runtime}
        onChange={(nextRuntime) => onChange({ content: nextRuntime.content })}
      />
    </section>
  )
}

function GlobalLayerSettings({ nodeId }: { nodeId: string }) {
  const placement = useEditorStore((state) =>
    state.project.globalLayer.find((item) => item.node.id === nodeId),
  )
  const scenes = useEditorStore((state) => state.project.scenes)
  const updateSettings = useEditorStore(
    (state) => state.updateGlobalLayerSettings,
  )
  const [pendingVisibilityMode, setPendingVisibilityMode] = useState<
    Exclude<GlobalLayerVisibility['mode'], 'all'> | null
  >(null)
  useEffect(() => {
    setPendingVisibilityMode(null)
  }, [nodeId, placement?.visibility.mode])
  if (!placement) return null

  const setVisibility = (visibility: GlobalLayerVisibility) => {
    updateSettings(nodeId, { visibility })
  }
  const effectiveVisibilityMode = pendingVisibilityMode ?? placement.visibility.mode
  const selected = new Set(
    pendingVisibilityMode === null ? placement.visibility.sceneIds : [],
  )

  return (
    <section
      className="property-section global-component-settings"
      data-testid="global-layer-settings"
    >
      <h3 className="property-title"><Globe2 size={14} />全局挂载</h3>
      <SelectField<RuntimeLayer>
        label="图层位置"
        value={placement.layer}
        options={[
          { value: 'underlay', label: 'Underlay · 场景内容下方' },
          { value: 'overlay', label: 'Overlay · 场景内容上方' },
        ]}
        onChange={(layer) => updateSettings(nodeId, { layer })}
      />
      <SelectField<GlobalLayerVisibility['mode']>
        label="场景可见范围"
        value={effectiveVisibilityMode}
        options={[
          { value: 'all', label: '全部场景' },
          { value: 'include', label: '仅所选场景' },
          { value: 'exclude', label: '除所选场景外' },
        ]}
        onChange={(mode) => {
          if (mode === 'all') {
            setPendingVisibilityMode(null)
            setVisibility({ mode, sceneIds: [] })
            return
          }
          const startsEmpty = placement.visibility.mode === 'all' ||
            placement.visibility.sceneIds.length === 0
          if (startsEmpty) {
            // A non-all visibility with no scenes is not a project state. Keep
            // this as local UI intent until the first scene is selected.
            setPendingVisibilityMode(mode)
            return
          }
          setPendingVisibilityMode(null)
          setVisibility({ mode, sceneIds: placement.visibility.sceneIds })
        }}
      />
      {effectiveVisibilityMode !== 'all' && (
        <fieldset className="visibility-scene-list">
          <legend>
            {effectiveVisibilityMode === 'include' ? '显示于' : '隐藏于'}
          </legend>
          {scenes.map((scene) => (
            <label key={scene.id}>
              <input
                type="checkbox"
                checked={selected.has(scene.id)}
                onChange={(event) => {
                  const sceneIds = new Set(
                    pendingVisibilityMode === null
                      ? placement.visibility.sceneIds
                      : [],
                  )
                  if (event.target.checked) sceneIds.add(scene.id)
                  else sceneIds.delete(scene.id)
                  // Do not invent a fallback selection in the Store and do
                  // not persist schema-invalid include/exclude + [].
                  if (sceneIds.size === 0) {
                    if (effectiveVisibilityMode === 'exclude') {
                      setPendingVisibilityMode(null)
                      setVisibility({ mode: 'all', sceneIds: [] })
                    } else {
                      event.currentTarget.checked = true
                    }
                    return
                  }
                  setPendingVisibilityMode(null)
                  setVisibility({
                    mode: effectiveVisibilityMode,
                    sceneIds: [...sceneIds],
                  })
                }}
              />
              <span>{scene.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      {pendingVisibilityMode !== null && (
        <p className="property-hint" role="status">
          选择至少一个场景后，可见范围才会生效。
        </p>
      )}
      <p className="property-hint">
        全局元素只创建一次并跨场景持续存在；切换场景只更新显隐，组件内部状态不会因此重置。
      </p>
    </section>
  )
}

export interface PropertiesTabDocumentControl {
  readonly editingScope: 'scene' | 'surface' | 'global'
  readonly editorMode: 'simple' | 'professional'
  readonly selectedNodes: readonly SceneNode[]
  readonly target: PropertiesTabDocumentTarget | null
  /** Optional author-facing context, for example “基础场景” or “状态：讲解态”. */
  readonly scopeLabel?: string
  readonly scopeDescription?: string
  readonly overrideActive: boolean
  readonly textContentUnavailableReason: string
  readonly richTextUnavailableReason: string
  readonly mediaUnavailableReason: string
  readonly controllerUnavailableReason: string
  /** Optional V9-backed click-rule editor shown below the common properties. */
  readonly interaction?: PropertiesInteractionControl
  onUpdateNode(
    target: PropertiesTabDocumentTarget,
    patch: DeepPartial<SceneNode>,
  ): boolean
  onClearOverride(target: PropertiesTabDocumentTarget): boolean
}

export interface PropertiesInteractionControl {
  /** Read-only V8-shaped scene document consumed by the interaction editor. */
  readonly scene: SceneDocument
  readonly sourceScope: 'scene' | 'global'
  readonly sourceNodes: readonly SceneNode[]
  readonly sourceRules: readonly InteractionRule[]
  readonly activeStateId: string | null
  readonly scenes: ReadonlyArray<Pick<SceneDocument, 'id' | 'name' | 'presentation'>>
  readonly sounds: Readonly<Record<string, SoundDefinition>>
  onAddRule(rule: InteractionRule): void
  onUpdateRule(
    ruleId: string,
    patch: Partial<Omit<InteractionRule, 'id'>>,
  ): void
  onDeleteRule(ruleId: string): void
}

export interface PropertiesTabDocumentTarget {
  readonly sessionId: string
  readonly locationId: string
  readonly stateId: string | null
  readonly editingScope: 'scene' | 'surface' | 'global'
  readonly layerItemId: string
}

interface LegacyPropertiesTabProps {
  documentControl?: undefined
  onReplaceImage(): void
}

interface ControlledPropertiesTabProps {
  documentControl: PropertiesTabDocumentControl
  /** A legacy callback may remain on the shell; the controlled path never invokes it. */
  onReplaceImage?(): void
}

export type PropertiesTabProps =
  | LegacyPropertiesTabProps
  | ControlledPropertiesTabProps

function normalizeNodePatch(
  node: SceneNode,
  patch: DeepPartial<SceneNode>,
): DeepPartial<SceneNode> {
  if (node.type !== 'text') return patch
  const textPatch = patch as DeepPartial<TextNode>
  const nextNode = {
    ...node,
    ...textPatch,
    style: { ...node.style, ...textPatch.style },
  } as TextNode
  if (nextNode.style.overflow !== 'auto-height') return patch
  const rendered = renderTextNodeCanvas(nextNode, nextNode.width)
  return {
    ...patch,
    width: rendered.width,
    height: rendered.height,
  } as DeepPartial<SceneNode>
}

function ControlledPropertiesGate({
  title,
  reason,
  testId,
}: {
  title: string
  reason: string
  testId: string
}) {
  return (
    <section
      className="property-section right-sidebar-capability-gate"
      data-testid={testId}
      aria-disabled="true"
    >
      <h3 className="property-title"><SlidersHorizontal size={14} />{title}</h3>
      <p className="property-hint" role="status">{reason}</p>
      <button type="button" className="secondary-button" disabled>
        {title}暂不可编辑
      </button>
    </section>
  )
}

function ControlledPropertiesTab({
  documentControl,
}: {
  documentControl: PropertiesTabDocumentControl
}) {
  const {
    editingScope,
    editorMode,
    selectedNodes,
    target,
    scopeLabel,
    scopeDescription,
    overrideActive,
    textContentUnavailableReason,
    richTextUnavailableReason,
    mediaUnavailableReason,
    controllerUnavailableReason,
    interaction,
    onUpdateNode,
    onClearOverride,
  } = documentControl
  const [rejectedUpdateKey, setRejectedUpdateKey] = useState(0)
  if (editingScope === 'global') {
    return (
      <div className="properties-scroll" data-testid="properties-tab">
        <ControlledPropertiesGate
          title="全局属性"
          reason="全局元素属性正在完善，当前内容不会改变。"
          testId="controlled-properties-global-gate"
        />
      </div>
    )
  }
  if (selectedNodes.length === 0) {
    return (
      <div className="properties-scroll" data-testid="properties-tab">
        <ControlledPropertiesGate
          title="元素属性"
          reason="请先在画布或图层面板中选择一个元素。"
          testId="controlled-properties-empty-gate"
        />
      </div>
    )
  }
  if (selectedNodes.length > 1) {
    return (
      <div className="properties-scroll" data-testid="properties-tab">
        <ControlledPropertiesGate
          title="多选属性"
          reason="暂不支持批量属性编辑；请只选择一个元素。"
          testId="controlled-properties-multi-gate"
        />
      </div>
    )
  }
  const node = selectedNodes[0]!
  if (
    !target ||
    target.editingScope !== editingScope ||
    target.layerItemId !== node.id
  ) {
    return (
      <div className="properties-scroll" data-testid="properties-tab">
        <ControlledPropertiesGate
          title="元素属性"
          reason="所选元素信息已变化，请重新选择后再编辑。"
          testId="controlled-properties-stale-target-gate"
        />
      </div>
    )
  }
  const update = (patch: DeepPartial<SceneNode>) => {
    const accepted = onUpdateNode(target, normalizeNodePatch(node, patch))
    if (!accepted) setRejectedUpdateKey((current) => current + 1)
    return accepted
  }
  const clearOverride = () => {
    const accepted = onClearOverride(target)
    if (!accepted) setRejectedUpdateKey((current) => current + 1)
  }
  const controlledFieldsKey = JSON.stringify([
    target.sessionId,
    target.locationId,
    target.stateId,
    target.editingScope,
    target.layerItemId,
    rejectedUpdateKey,
  ])
  const unsupported = node.type === 'image' || node.type === 'video'
    ? (
      <ControlledPropertiesGate
        title="媒体属性"
        reason={mediaUnavailableReason}
        testId="controlled-properties-media-gate"
      />
    )
    : node.type === 'teacher-controller'
      ? (
        <ControlledPropertiesGate
          title="教师控制器属性"
          reason={controllerUnavailableReason}
          testId="controlled-properties-controller-gate"
        />
      )
      : node.type === 'external-component'
        ? (
          <ControlledPropertiesGate
            title="组件属性"
            reason="组件的专属设置暂不可用；仍可修改上方通用属性。"
            testId="controlled-properties-component-gate"
          />
        )
        : null

  return (
    <div className="properties-scroll" data-testid="properties-tab">
      <section className="state-editing-notice">
        <Layers3 size={15} />
        <div>
          <strong>{scopeLabel ?? '场景元素'}</strong>
          <span>{scopeDescription ?? '可修改所选元素的布局与外观。'}</span>
          {editingScope === 'scene' && target.stateId !== null && (
            <span>{overrideActive
              ? '此元素已有当前状态设置。'
              : '此元素当前沿用基础设置。'}</span>
          )}
        </div>
        {editingScope === 'scene' && target.stateId !== null && overrideActive && (
          <button
            type="button"
            className="state-editing-notice__clear"
            onClick={clearOverride}
          >
            恢复基础值
          </button>
        )}
      </section>
      <div key={controlledFieldsKey}>
        <CommonNodeProperties
          node={node}
          editorMode={editorMode}
          update={update}
        />
        {node.type === 'text' && (
          <ControlledTextProperties
            node={node}
            update={update}
            textContentUnavailableReason={textContentUnavailableReason}
            richTextUnavailableReason={richTextUnavailableReason}
          />
        )}
        {node.type === 'formula' && (
          <FormulaProperties
            node={node}
            update={update}
            ColorField={ControlledPropertyColorInput}
          />
        )}
        {node.type === 'shape' && (
          <ShapeProperties
            node={node}
            update={update}
            ColorField={ControlledPropertyColorInput}
          />
        )}
        {unsupported}
      </div>
      {interaction && editingScope === 'scene' && (
        <InteractionEditor
          scene={interaction.scene}
          selectedNode={node}
          sourceScope={interaction.sourceScope}
          sourceNodes={interaction.sourceNodes}
          sourceRules={interaction.sourceRules}
          activeStateId={interaction.activeStateId}
          scenes={interaction.scenes}
          sounds={interaction.sounds}
          onAddRule={interaction.onAddRule}
          onUpdateRule={interaction.onUpdateRule}
          onDeleteRule={interaction.onDeleteRule}
        />
      )}
    </div>
  )
}

export function PropertiesTab(props: PropertiesTabProps) {
  if (props.documentControl) {
    return <ControlledPropertiesTab documentControl={props.documentControl} />
  }
  return <LegacyPropertiesTabAdapter onReplaceImage={props.onReplaceImage} />
}

function LegacyPropertiesTabAdapter({ onReplaceImage }: { onReplaceImage(): void }) {
  const scene = useEditorStore(selectActiveScene)
  const editingScope = useEditorStore((state) => state.editingScope)
  const editorMode = useEditorStore((state) => state.editorMode)
  const activePresentationStateId = useEditorStore(
    (state) => state.activePresentationStateId,
  )
  const editingNodes = useEditorStore(selectEditingNodes)
  const node = useEditorStore(selectSelectedNode)
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds)
  const selectedNodes = editingNodes.filter((item) => selectedNodeIds.includes(item.id))
  const components = useEditorStore((state) => state.componentPackages)
  const project = useEditorStore((state) => state.project)
  const projectAssets = project.assets
  const projectDiagnostics = useMemo(
    () => collectProjectDiagnostics(project),
    [project],
  )
  const updateScene = useEditorStore((state) => state.updateScene)
  const updateSceneRuntime = useEditorStore((state) => state.updateSceneRuntime)
  const updateGlobalRuntime = useEditorStore((state) => state.updateGlobalRuntime)
  const updateNode = useEditorStore((state) => state.updateNode)
  const addInteractionRule = useEditorStore((state) => state.addInteractionRule)
  const updateInteractionRule = useEditorStore((state) => state.updateInteractionRule)
  const deleteInteractionRule = useEditorStore((state) => state.deleteInteractionRule)
  const addGlobalInteractionRule = useEditorStore((state) => state.addGlobalInteractionRule)
  const updateGlobalInteractionRule = useEditorStore((state) => state.updateGlobalInteractionRule)
  const deleteGlobalInteractionRule = useEditorStore((state) => state.deleteGlobalInteractionRule)
  const updatePlayback = useEditorStore((state) => state.updatePlayback)
  const updateDesignTokens = useEditorStore((state) => state.updateDesignTokens)
  const ensureTeacherController = useEditorStore((state) => state.ensureTeacherController)
  const setEditorMode = useEditorStore((state) => state.setEditorMode)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const clearNodePresentationOverride = useEditorStore(
    (state) => state.clearNodePresentationOverride,
  )
  const effectiveScene = materializeScene(scene, activePresentationStateId)
  const activePresentationState = activePresentationStateId === null
    ? null
    : findPresentationState(scene, activePresentationStateId)
  if (selectedNodes.length > 1) {
    return (
      <MultiSelectionProperties
        nodes={selectedNodes}
        presentationContext={editingScope === 'scene'
          ? { scene, stateId: activePresentationStateId }
          : null}
      />
    )
  }
  if (!node) {
    return (
      <div className="properties-scroll" data-testid="properties-tab">
        {editingScope === 'global' ? (
          <>
            <section className="property-section global-layer-summary">
              <h3 className="property-title"><Globe2 size={14} />全局层</h3>
              <div className="runtime-summary-grid" aria-label="全局层摘要">
                <span><small>全局元素</small>{project.globalLayer.length}</span>
                <span><small>Underlay</small>{project.globalLayer.filter((item) => item.layer === 'underlay').length}</span>
                <span><small>Overlay</small>{project.globalLayer.filter((item) => item.layer === 'overlay').length}</span>
                <span><small>运行时</small>{project.globalRuntime ? '已配置' : '无'}</span>
              </div>
              <p className="property-hint">
                全局层类似课件母版：文字、图片、图形和组件都可统一布置，并可设置场景可见范围。
              </p>
            </section>
            <section className="property-section">
              <h3 className="property-title"><SlidersHorizontal size={14} />成品控制</h3>
              <SelectField<ProjectDocument['playback']['controls']>
                label="导航控制方式"
                value={project.playback.controls}
                options={[
                  { value: 'canvas', label: '画布内全局控制器（推荐）' },
                  { value: 'none', label: '不显示控制器' },
                ]}
                onChange={(controls) => {
                  if (controls === 'canvas') ensureTeacherController()
                  else updatePlayback({ controls })
                }}
              />
              <p className="property-hint">
                选择“不显示控制器”会保留可编辑节点，但在交付播放时将其初始隐藏。
              </p>
              {project.playback.controls === 'none' &&
                project.globalLayer.some((item) => item.node.type === 'teacher-controller') && (
                <div
                  className="property-hint"
                  data-testid="controller-consistency-notice"
                  role="status"
                >
                  画布教师控制器已从成品中隐藏。如果需要恢复，请使用下方按钮一键修复其可见性与控制模式。
                </div>
              )}
              <ToggleRow label="键盘左右键翻页" checked={project.playback.keyboardNavigation} onChange={(keyboardNavigation) => updatePlayback({ keyboardNavigation })} />
              <PresenterSettingsEditor
                value={project.playback.presenter}
                onChange={(presenter) => updatePlayback({ presenter })}
              />
              <button type="button" className="secondary-button" onClick={ensureTeacherController}>
                <SlidersHorizontal size={14} />{project.playback.controls === 'none'
                  ? '恢复并显示教师控制器'
                  : '添加或定位教师控制器'}
              </button>
            </section>
            {editorMode === 'professional' && (
              <DesignTokensEditor
                value={project.designTokens}
                onChange={updateDesignTokens}
              />
            )}
            {editorMode === 'professional' && (
              <RuntimeInspector
                scope="global"
                runtime={project.globalRuntime}
                onChange={updateGlobalRuntime}
              />
            )}
          </>
        ) : (
          <>
            <section className={`state-editing-notice${activePresentationState ? ' state-editing-notice--override' : ''}`}>
              <Layers3 size={15} />
              <div>
                <strong>{activePresentationState ? `状态：${activePresentationState.name}` : '基础场景'}</strong>
                <span>{activePresentationState
                  ? '背景修改只保存在当前状态；场景名称仍为通用名称。'
                  : '这里的修改会被所有状态继承。'}</span>
              </div>
            </section>
            <section className="property-section">
              <h3 className="property-title"><Palette size={14} />场景</h3>
              <BufferedInput label="场景名称" value={scene.name} onCommit={(name) => updateScene(scene.id, { name })} />
              <ColorInput id="scene-background" label="背景色" value={effectiveScene.backgroundColor} onChange={(backgroundColor) => updateScene(scene.id, { backgroundColor })} />
            </section>
            {editorMode === 'professional' ? (
              <>
                <section className="property-section">
                  <h3 className="property-title"><Workflow size={14} />场景规则</h3>
                  <p className="property-hint">
                    当前场景有 {scene.interactions.length} 条规则。规则按“何时发生 → 是否满足条件 → 做什么”组织。
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setActiveTab('automation')}
                  >
                    <Workflow size={14} />打开规则面板
                  </button>
                </section>
                <RuntimeInspector
                  scope="scene"
                  runtime={scene.runtime}
                  onChange={(patch) => updateSceneRuntime(scene.id, patch)}
                />
              </>
            ) : scene.interactions.length > 0 ? (
              <section className="property-section simple-rule-summary">
                <h3 className="property-title"><Workflow size={14} />专业互动</h3>
                <p className="property-hint">
                  此场景已有 {scene.interactions.length} 条专业规则，播放时会继续生效。
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setEditorMode('professional')
                    setActiveTab('automation')
                  }}
                >
                  切换专业模式查看
                </button>
              </section>
            ) : null}
          </>
        )}
      </div>
    )
  }
  const update = (patch: DeepPartial<SceneNode>) => {
    updateNode(node.id, normalizeNodePatch(node, patch))
  }
  return (
    <div className="properties-scroll" data-testid="properties-tab">
      {editingScope === 'scene' && (
        <section className={`state-editing-notice${activePresentationState ? ' state-editing-notice--override' : ''}`}>
          <Layers3 size={15} />
          <div>
            <strong>{activePresentationState ? `状态：${activePresentationState.name}` : '基础场景'}</strong>
            <span>{activePresentationState
              ? isNodeOverriddenInState(scene, activePresentationState.id, node.id)
                ? '此元素已有当前状态覆盖。'
                : '当前继承基础值；修改后会创建状态覆盖。'
              : '修改基础元素会影响所有继承它的状态。'}</span>
          </div>
          {activePresentationState && isNodeOverriddenInState(
            scene,
            activePresentationState.id,
            node.id,
          ) && (
            <button
              type="button"
              className="state-editing-notice__clear"
              onClick={() => clearNodePresentationOverride(node.id)}
            >
              恢复基础值
            </button>
          )}
        </section>
      )}
      <CommonNodeProperties node={node} editorMode={editorMode} update={update} />
      {editingScope === 'scene' && editorMode === 'simple' && (
        <SimpleEntranceAnimationEditor
          scene={scene}
          node={node}
          activeStateId={activePresentationStateId}
        />
      )}
      {editingScope === 'global' && (
        <GlobalLayerSettings nodeId={node.id} />
      )}
      {node.type === 'text' && <LegacyTextPropertiesAdapter node={node} update={update} />}
      {node.type === 'formula' && (
        <FormulaProperties
          node={node}
          update={update}
        />
      )}
      {node.type === 'image' && <ImageProperties node={node} update={update} onReplaceImage={onReplaceImage} />}
      {node.type === 'video' && (
        <VideoProperties
          node={node}
          update={update}
          diagnostics={projectDiagnostics
            .filter((diagnostic) => (
              editingScope === 'scene' &&
              diagnostic.sceneId === scene.id &&
              diagnostic.nodeId === node.id
            ))
            .map((diagnostic) => diagnostic.message)}
          onOpenAutomation={editorMode === 'professional'
            ? () => setActiveTab('automation')
            : undefined}
        />
      )}
      {editorMode === 'professional' &&
        editingScope === 'global' &&
        node.type !== 'teacher-controller' && (
        <InteractionEditor
          scene={scene}
          selectedNode={node}
          sourceScope="global"
          sourceNodes={project.globalLayer.map((item) => item.node)}
          sourceRules={project.globalInteractions}
          activeStateId={activePresentationStateId}
          scenes={project.scenes}
          sounds={project.media.audio.sounds}
          onAddRule={addGlobalInteractionRule}
          onUpdateRule={(ruleId, patch) => {
            const current = project.globalInteractions.find(
              (rule) => rule.id === ruleId,
            )
            if (current) {
              updateGlobalInteractionRule(ruleId, { ...current, ...patch })
            }
          }}
          onDeleteRule={deleteGlobalInteractionRule}
        />
      )}
      {node.type === 'shape' && <ShapeProperties node={node} update={update} />}
      {node.type === 'teacher-controller' && (
        <TeacherControllerProperties node={node} scenes={project.scenes} update={update} />
      )}
      {node.type === 'external-component' && (
        <>
          <section className="property-section">
            <h3 className="property-title"><Box size={14} />外部组件</h3>
            <div className="form-field"><label>组件名称</label><div className="readonly-value">{components[node.component.packageId]?.manifest.name ?? node.name}</div></div>
            <div className="form-field"><label>组件 ID</label><div className="readonly-value">{node.component.packageId}</div></div>
            <div className="form-field"><label>版本</label><div className="readonly-value">{node.component.version}</div></div>
          </section>
          {components[node.component.packageId] && (
            <ComponentPropertiesEditor
              manifest={components[node.component.packageId]!.manifest}
              node={node}
              assets={projectAssets}
              onChange={(props) => update({ props })}
            />
          )}
        </>
      )}
      {editorMode === 'professional' && editingScope === 'scene' && (
        <InteractionEditor
          scene={scene}
          selectedNode={node}
          activeStateId={activePresentationStateId}
          scenes={project.scenes}
          sounds={project.media.audio.sounds}
          onAddRule={(rule) => addInteractionRule(scene.id, rule)}
          onUpdateRule={(ruleId, patch) => {
            const current = scene.interactions.find((rule) => rule.id === ruleId)
            if (current) updateInteractionRule(scene.id, ruleId, { ...current, ...patch })
          }}
          onDeleteRule={(ruleId) => deleteInteractionRule(scene.id, ruleId)}
        />
      )}
    </div>
  )
}
