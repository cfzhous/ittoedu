import type {
  CourseSurfaceType,
  FlowBlock,
} from '../../shared/courseProjectTypes'
import { useId } from 'react'
import {
  FLOW_BLOCK_TERMS,
  flowBlockTypeLabel,
} from './flow/flowBlockTerminology'

type FlowMediaKind = Extract<FlowBlock, { type: 'media' }>['mediaKind']

export type CourseElementPaletteAction =
  | { kind: 'native'; element: 'text' | 'formula' | 'shape' }
  | { kind: 'teacher-controller' }
  | { kind: 'media'; mediaKind: 'image' | 'video' }
  | {
      kind: 'flow-block'
      blockType: Exclude<FlowBlock['type'], 'media'>
    }
  | {
      kind: 'flow-block'
      blockType: 'media'
      mediaKind: FlowMediaKind
    }
  | { kind: 'component-import' }
  | { kind: 'component'; packageId: string; version: string }

export interface CourseElementPaletteComponent {
  packageId: string
  version: string
  name: string
  description?: string
  disabled?: boolean
  disabledReason?: string
}

export interface CourseElementPaletteProps {
  surfaceType: CourseSurfaceType
  onAction(action: CourseElementPaletteAction): void
  components?: readonly CourseElementPaletteComponent[]
  teacherControllerPresent?: boolean
  disabled?: boolean
  className?: string
}

interface PaletteEntry {
  id: string
  label: string
  description: string
  action: CourseElementPaletteAction
}

interface PaletteGroup {
  id: string
  title: string
  entries: readonly PaletteEntry[]
}

const NATIVE_ENTRIES: readonly PaletteEntry[] = [
  {
    id: 'text',
    label: '文字',
    description: '添加可直接编辑的文字',
    action: { kind: 'native', element: 'text' },
  },
  {
    id: 'formula',
    label: '公式',
    description: '添加可访问的数学公式',
    action: { kind: 'native', element: 'formula' },
  },
  {
    id: 'shape',
    label: '图形',
    description: '添加可调整样式的基础图形',
    action: { kind: 'native', element: 'shape' },
  },
]

const CANVAS_MEDIA_ENTRIES: readonly PaletteEntry[] = [
  {
    id: 'image',
    label: '图片',
    description: '从本机导入一张图片',
    action: { kind: 'media', mediaKind: 'image' },
  },
  {
    id: 'video',
    label: '视频',
    description: '从本机导入一段视频',
    action: { kind: 'media', mediaKind: 'video' },
  },
]

const COURSE_CONTROL_ENTRIES: readonly PaletteEntry[] = [{
  id: 'teacher-controller',
  label: '教师控制器',
  description: '添加全课程共用的翻页、目录、声音和全屏控制',
  action: { kind: 'teacher-controller' },
}]

const FLOW_STRUCTURE_TYPES = [
  'heading',
  'paragraph',
  'quote',
  'list',
  'section',
  'divider',
] as const satisfies readonly FlowBlock['type'][]

const FLOW_TEACHING_TYPES = [
  'callout',
  'table',
  'formula',
  'code',
] as const satisfies readonly FlowBlock['type'][]

function flowEntries(types: readonly Exclude<FlowBlock['type'], 'media'>[]): PaletteEntry[] {
  return types.map((blockType) => ({
    id: blockType,
    label: flowBlockTypeLabel(blockType),
    description: FLOW_BLOCK_TERMS[blockType].description,
    action: { kind: 'flow-block', blockType },
  }))
}

const FLOW_MEDIA_ENTRIES: readonly PaletteEntry[] = [
  {
    id: 'flow-image',
    label: '图片',
    description: '插入一张随正文排列的图片',
    action: { kind: 'flow-block', blockType: 'media', mediaKind: 'image' },
  },
  {
    id: 'flow-audio',
    label: '音频',
    description: '插入可在讲义中播放的音频',
    action: { kind: 'flow-block', blockType: 'media', mediaKind: 'audio' },
  },
  {
    id: 'flow-video',
    label: '视频',
    description: '插入可在讲义中播放的视频',
    action: { kind: 'flow-block', blockType: 'media', mediaKind: 'video' },
  },
]

function groupsForSurface(surfaceType: CourseSurfaceType): readonly PaletteGroup[] {
  if (surfaceType === 'flow') {
    return [
      { id: 'structure', title: '内容结构', entries: flowEntries(FLOW_STRUCTURE_TYPES) },
      { id: 'teaching', title: '教学表达', entries: flowEntries(FLOW_TEACHING_TYPES) },
      { id: 'flow-media', title: '媒体与互动', entries: FLOW_MEDIA_ENTRIES },
      { id: 'course-controls', title: '课程控制', entries: COURSE_CONTROL_ENTRIES },
    ]
  }
  return [
    { id: 'native', title: '基础元素', entries: NATIVE_ENTRIES },
    { id: 'canvas-media', title: '媒体', entries: CANVAS_MEDIA_ENTRIES },
    { id: 'course-controls', title: '课程控制', entries: COURSE_CONTROL_ENTRIES },
  ]
}

function PaletteButton({
  entry,
  disabled,
  alreadyPresent = false,
  onAction,
}: {
  entry: PaletteEntry
  disabled: boolean
  alreadyPresent?: boolean
  onAction(action: CourseElementPaletteAction): void
}) {
  return (
    <button
      type="button"
      className="course-element-palette__item"
      disabled={disabled || alreadyPresent}
      aria-label={alreadyPresent ? `${entry.label}已添加` : `添加${entry.label}`}
      title={alreadyPresent ? '全课程已有教师控制器' : undefined}
      onClick={() => onAction(entry.action)}
    >
      <strong>{entry.label}</strong>
      <small>{alreadyPresent ? '已添加到全课程' : entry.description}</small>
    </button>
  )
}

function ComponentGroup({
  components,
  disabled,
  onAction,
  titleId,
}: {
  components: readonly CourseElementPaletteComponent[]
  disabled: boolean
  onAction(action: CourseElementPaletteAction): void
  titleId: string
}) {
  return (
    <section className="course-element-palette__group" aria-labelledby={titleId}>
      <h3 id={titleId}>已导入的互动组件</h3>
      <div className="course-element-palette__items">
        <button
          type="button"
          className="course-element-palette__item"
          disabled={disabled}
          aria-label="导入互动组件"
          onClick={() => onAction({ kind: 'component-import' })}
        >
          <strong>导入互动组件</strong>
          <small>从本机添加新的教学互动组件</small>
        </button>
        {components.map((component) => (
          <button
            type="button"
            className="course-element-palette__item"
            key={`${component.packageId}@${component.version}`}
            disabled={disabled || component.disabled}
            aria-label={`添加互动组件：${component.name}`}
            title={component.disabledReason}
            onClick={() => onAction({
              kind: 'component',
              packageId: component.packageId,
              version: component.version,
            })}
          >
            <strong>{component.name}</strong>
            <small>{component.description ?? '添加到当前内容'}</small>
          </button>
        ))}
      </div>
      {components.length === 0 && <p>尚未导入互动组件。</p>}
    </section>
  )
}

export function CourseElementPalette({
  surfaceType,
  onAction,
  components = [],
  teacherControllerPresent = false,
  disabled = false,
  className,
}: CourseElementPaletteProps) {
  const idPrefix = useId()
  const classes = ['course-element-palette', className].filter(Boolean).join(' ')
  return (
    <aside className={classes} aria-label="添加元素">
      {groupsForSurface(surfaceType).map((group) => {
        const titleId = `${idPrefix}-${group.id}`
        return (
          <section key={group.id} className="course-element-palette__group" aria-labelledby={titleId}>
            <h3 id={titleId}>{group.title}</h3>
            <div className="course-element-palette__items">
              {group.entries.map((entry) => (
                <PaletteButton
                  key={entry.id}
                  entry={entry}
                  disabled={disabled}
                  alreadyPresent={entry.action.kind === 'teacher-controller' && teacherControllerPresent}
                  onAction={onAction}
                />
              ))}
            </div>
          </section>
        )
      })}
      <ComponentGroup
        components={components}
        disabled={disabled}
        onAction={onAction}
        titleId={`${idPrefix}-components`}
      />
    </aside>
  )
}
