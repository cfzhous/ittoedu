import type {
  CourseSurfaceType,
  FlowBlock,
  LayerItem,
  NativeElementContent,
} from '../../shared/courseProjectTypes'

/**
 * Teacher-facing vocabulary for the V9 editor. Protocol identifiers remain
 * stable in persisted documents and are never used as ordinary UI copy.
 */
export const COURSE_SURFACE_LABELS: Record<CourseSurfaceType, string> = {
  slide: '幻灯片',
  flow: '流式讲义',
  'spatial-2d': '空间画布',
}

export const FLOW_BLOCK_LABELS: Record<FlowBlock['type'], string> = {
  heading: '标题',
  paragraph: '正文',
  quote: '引用',
  list: '列表',
  callout: '提示',
  table: '表格',
  formula: '公式',
  code: '代码',
  section: '分节',
  divider: '分隔线',
  media: '媒体',
  component: '互动组件',
}

export const LAYER_SCOPE_LABELS = {
  scene: '当前场景',
  world: '空间内容',
  surface: '当前内容共用',
  global: '全课程',
} as const

export const LAYER_KIND_LABELS: Record<LayerItem['kind'], string> = {
  native: '可编辑元素',
  runtime: '互动内容',
  component: '互动组件',
}

export const NATIVE_ELEMENT_LABELS: Record<NativeElementContent['nativeType'], string> = {
  text: '文字',
  formula: '公式',
  image: '图片',
  video: '视频',
  shape: '图形',
  'teacher-controller': '教师控制器',
}

export function surfaceTeacherLabel(type: CourseSurfaceType): string {
  return COURSE_SURFACE_LABELS[type]
}

export function flowBlockTeacherLabel(type: FlowBlock['type']): string {
  return FLOW_BLOCK_LABELS[type]
}

export function layerTeacherLabel(item: LayerItem): string {
  if (item.kind !== 'native') return LAYER_KIND_LABELS[item.kind]
  return NATIVE_ELEMENT_LABELS[item.content.nativeType]
}
