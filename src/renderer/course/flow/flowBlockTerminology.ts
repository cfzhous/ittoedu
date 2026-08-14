import type { FlowBlock } from '../../../shared/courseProjectTypes'
import {
  FLOW_BLOCK_LABELS,
  flowBlockTeacherLabel,
} from '../courseTeacherLabels'

export { FLOW_BLOCK_LABELS, flowBlockTeacherLabel } from '../courseTeacherLabels'

export interface FlowBlockTerm {
  label: string
  description: string
}

/**
 * Protocol values stay stable and English; this table is the only teacher-facing
 * vocabulary used by the V9 Flow editor.
 */
export const FLOW_BLOCK_TERMS = {
  heading: { label: FLOW_BLOCK_LABELS.heading, description: '建立讲义层级和目录结构' },
  paragraph: { label: FLOW_BLOCK_LABELS.paragraph, description: '连续讲解、说明或题目文字' },
  quote: { label: FLOW_BLOCK_LABELS.quote, description: '突出原文、观点及其出处' },
  list: { label: FLOW_BLOCK_LABELS.list, description: '组织并列或有先后顺序的内容' },
  callout: { label: FLOW_BLOCK_LABELS.callout, description: '标注提示、例子、警告或结论' },
  table: { label: FLOW_BLOCK_LABELS.table, description: '按行列组织对照信息' },
  formula: { label: FLOW_BLOCK_LABELS.formula, description: '编辑可访问、可导出的数学公式' },
  code: { label: FLOW_BLOCK_LABELS.code, description: '展示带语言标记的代码或伪代码' },
  section: { label: FLOW_BLOCK_LABELS.section, description: '组织可折叠的嵌套内容' },
  divider: { label: FLOW_BLOCK_LABELS.divider, description: '分隔相邻内容段落' },
  media: { label: FLOW_BLOCK_LABELS.media, description: '插入图片、音频或视频' },
  component: { label: FLOW_BLOCK_LABELS.component, description: '插入可复用的互动教学组件' },
} as const satisfies Record<FlowBlock['type'], FlowBlockTerm>

export const FLOW_BLOCK_TYPE_ORDER = [
  'heading',
  'paragraph',
  'quote',
  'list',
  'callout',
  'table',
  'formula',
  'code',
  'section',
  'divider',
  'media',
  'component',
] as const satisfies readonly FlowBlock['type'][]

/** Types a section can create without first selecting an asset or package. */
export const FLOW_SECTION_INSERTABLE_TYPES = [
  'heading',
  'paragraph',
  'quote',
  'list',
  'callout',
  'table',
  'formula',
  'code',
  'section',
  'divider',
] as const satisfies readonly FlowBlock['type'][]

export const FLOW_HEADING_LEVEL_LABELS = {
  1: '一级标题',
  2: '二级标题',
  3: '三级标题',
  4: '四级标题',
  5: '五级标题',
  6: '六级标题',
} as const

export const FLOW_CALLOUT_TONE_LABELS = {
  note: '提示',
  example: '例子',
  warning: '注意',
  conclusion: '结论',
} as const satisfies Record<Extract<FlowBlock, { type: 'callout' }>['tone'], string>

export const FLOW_MEDIA_KIND_LABELS = {
  image: '图片',
  audio: '音频',
  video: '视频',
} as const satisfies Record<Extract<FlowBlock, { type: 'media' }>['mediaKind'], string>

export const FLOW_MEDIA_LAYOUT_LABELS = {
  'content-width': '正文宽度',
  wide: '加宽显示',
  'full-width': '通栏显示',
} as const satisfies Record<Extract<FlowBlock, { type: 'media' }>['layout'], string>

export function flowBlockTypeLabel(type: FlowBlock['type']): string {
  return flowBlockTeacherLabel(type)
}
