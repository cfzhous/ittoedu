import { isCourseLayerVisibleAtLocation } from '../../shared/courseProjectModel'
import { compareStableStrings } from '../../shared/stableOrder'
import type {
  CourseProjectDocument,
  FlowBlock,
  FlowSurfaceDocument,
  LayerItem,
  ScopedLayerItem,
} from '../../shared/courseProjectTypes'

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T :
    T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[] :
      T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } :
        T

export interface FlowBlockView {
  readonly blockId: string
  readonly parentId: string | null
  readonly depth: number
  readonly index: number
  readonly stableAddress: string
  readonly label: string
  readonly block: DeepReadonly<FlowBlock>
}

export type FlowOutlineKind = 'heading' | 'section'

export interface FlowOutlineEntry {
  readonly blockId: string
  readonly title: string
  readonly level: number
  readonly depth: number
  readonly kind: FlowOutlineKind
  readonly path: readonly (string | number)[]
}

export type FlowEditorLayerScope = 'global' | 'surface'

export type FlowEffectiveLayerSource = 'global' | 'surface' | 'flow-block'

export interface FlowEditorLayerView {
  readonly source: FlowEditorLayerScope
  readonly scopedVisible: boolean
  readonly effectiveVisible: boolean
  readonly selectionId: string
  readonly item: DeepReadonly<LayerItem>
}

/** Unified effective-layer row for T10. Flow blocks are document items, not overlay LayerItems. */
export interface FlowEffectiveLayerView {
  readonly source: FlowEffectiveLayerSource
  readonly id: string
  readonly name: string
  readonly ownerKey: string
  readonly locked: boolean
  readonly hidden: boolean
  readonly canLock: boolean
  readonly canHide: boolean
  readonly canReorder: boolean
  readonly authoringAddress: string
}

export interface FlowEditorView {
  readonly projectId: string
  readonly revision: number
  readonly locationId: string
  readonly surfaceId: string
  readonly surfaceTitle: string
  readonly activeBlockId: string
  readonly layout: DeepReadonly<FlowSurfaceDocument['layout']>
  readonly blocks: readonly FlowBlockView[]
  readonly outline: readonly FlowOutlineEntry[]
  readonly globalLayerItems: readonly FlowEditorLayerView[]
  readonly surfaceLayerItems: readonly FlowEditorLayerView[]
  readonly effectiveLayers: readonly FlowEffectiveLayerView[]
}

export interface BuildFlowEditorViewInput {
  readonly project: CourseProjectDocument
  readonly locationId: string
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as DeepReadonly<T>
  }
  if (!ArrayBuffer.isView(value)) {
    Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry))
    Object.freeze(value)
  }
  return value as DeepReadonly<T>
}

function flowBlockLabel(block: FlowBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
      return block.text
    case 'list':
      return block.items[0]?.text || (block.ordered ? '有序列表' : '项目符号列表')
    case 'divider':
      return '分割线'
    case 'media':
      return block.caption || block.altText || (
        block.mediaKind === 'image' ? '图片' : block.mediaKind === 'audio' ? '音频' : '视频'
      )
    case 'table':
      return block.caption || `表格（${block.columns.length} 列）`
    case 'formula':
      return block.accessibleText
    case 'code':
      return block.language ? `${block.language} 代码块` : '代码块'
    case 'callout':
      return block.title || block.body
    case 'section':
      return block.title
    case 'component':
      return `互动组件：${block.component.packageId}`
  }
}

function resolveFlowLocation(
  project: CourseProjectDocument,
  locationId: string,
): {
    location: Extract<CourseProjectDocument['locations'][number], { kind: 'flow-block' }>
    surface: FlowSurfaceDocument
    surfaceIndex: number
  } {
  const location = project.locations.find((candidate) => candidate.id === locationId)
  if (!location) throw new Error(`找不到课程位置：${locationId}`)
  if (location.kind !== 'flow-block') {
    throw new Error(`FlowEditorView 只接受 Flow 块位置：${locationId}`)
  }
  const surfaceIndex = project.surfaces.findIndex((candidate) => candidate.id === location.surfaceId)
  if (surfaceIndex < 0) throw new Error(`找不到 Flow 表面：${location.surfaceId}`)
  const surface = project.surfaces[surfaceIndex]!
  if (surface.type !== 'flow') throw new Error(`找不到 Flow 表面：${location.surfaceId}`)
  return { location, surface, surfaceIndex }
}

function walkFlowBlocks(
  surface: FlowSurfaceDocument,
  surfaceIndex: number,
  visit: (block: FlowBlock, location: {
    parentId: string | null
    index: number
    depth: number
    path: readonly (string | number)[]
  }) => void,
): void {
  const walk = (
    blocks: readonly FlowBlock[],
    parentId: string | null,
    depth: number,
    parentPath: readonly (string | number)[],
  ) => {
    blocks.forEach((block, index) => {
      const path = [...parentPath, 'blocks', index]
      visit(block, { parentId, index, depth, path })
      if (block.type === 'section') walk(block.blocks, block.id, depth + 1, path)
    })
  }
  walk(surface.blocks, null, 0, ['surfaces', surfaceIndex])
}

function flowLayerView(
  entry: ScopedLayerItem,
  source: FlowEditorLayerScope,
  locationId: string,
): FlowEditorLayerView {
  const item = deepFreeze(structuredClone(entry.item))
  const scopedVisible = isCourseLayerVisibleAtLocation(entry, locationId)
  return {
    source,
    scopedVisible,
    effectiveVisible: scopedVisible && item.visible,
    selectionId: item.layerItemId,
    item,
  }
}

function sortLayerViews<T extends FlowEditorLayerView>(views: readonly T[]): T[] {
  return [...views].sort((left, right) =>
    left.item.order - right.item.order ||
    compareStableStrings(left.selectionId, right.selectionId),
  )
}

function overlayEffectiveLayer(
  layer: FlowEditorLayerView,
  surfaceId: string,
): FlowEffectiveLayerView {
  const canManage = true
  return {
    source: layer.source,
    id: layer.selectionId,
    name: layer.item.label || (layer.source === 'global' ? '全局图层' : '讲义图层'),
    ownerKey: layer.source === 'global' ? 'global' : `surface:${surfaceId}`,
    locked: layer.item.locked,
    hidden: !layer.item.visible,
    canLock: canManage,
    canHide: canManage,
    canReorder: canManage,
    authoringAddress: layer.source === 'global'
      ? `global/layer:${layer.selectionId}`
      : `surface:${surfaceId}/layer:${layer.selectionId}`,
  }
}

function flowBlockEffectiveLayer(
  blockView: FlowBlockView,
  surfaceId: string,
): FlowEffectiveLayerView {
  return {
    source: 'flow-block',
    id: blockView.blockId,
    name: blockView.label.trim() || blockView.block.type,
    ownerKey: `flow-block:${surfaceId}`,
    locked: false,
    hidden: false,
    canLock: false,
    canHide: false,
    canReorder: true,
    authoringAddress: blockView.stableAddress,
  }
}

export function buildFlowEffectiveLayers(input: {
  readonly surfaceId: string
  readonly blocks: readonly FlowBlockView[]
  readonly globalLayerItems: readonly FlowEditorLayerView[]
  readonly surfaceLayerItems: readonly FlowEditorLayerView[]
}): FlowEffectiveLayerView[] {
  return [
    ...input.blocks.map((blockView) => flowBlockEffectiveLayer(blockView, input.surfaceId)),
    ...input.surfaceLayerItems.map((layer) => overlayEffectiveLayer(layer, input.surfaceId)),
    ...input.globalLayerItems.map((layer) => overlayEffectiveLayer(layer, input.surfaceId)),
  ]
}

export function buildFlowEditorView(input: BuildFlowEditorViewInput): FlowEditorView {
  const { project, locationId } = input
  const { location, surface, surfaceIndex } = resolveFlowLocation(project, locationId)

  const blocks: FlowBlockView[] = []
  const outline: FlowOutlineEntry[] = []
  walkFlowBlocks(surface, surfaceIndex, (block, walkLocation) => {
    const blockView: FlowBlockView = {
      blockId: block.id,
      parentId: walkLocation.parentId,
      depth: walkLocation.depth,
      index: walkLocation.index,
      stableAddress: `surface:${surface.id}/block:${block.id}`,
      label: flowBlockLabel(block),
      block: deepFreeze(structuredClone(block)),
    }
    blocks.push(blockView)
    if (block.type === 'heading') {
      outline.push({
        blockId: block.id,
        title: block.text,
        level: block.level + walkLocation.depth,
        depth: walkLocation.depth,
        kind: 'heading',
        path: walkLocation.path,
      })
    } else if (block.type === 'section') {
      outline.push({
        blockId: block.id,
        title: block.title,
        level: walkLocation.depth + 1,
        depth: walkLocation.depth,
        kind: 'section',
        path: walkLocation.path,
      })
    }
  })

  if (!blocks.some((block) => block.blockId === location.blockId)) {
    throw new Error(`找不到 Flow 块：${location.blockId}`)
  }

  const globalLayerItems = sortLayerViews(
    project.globalLayerItems.map((entry) => flowLayerView(entry, 'global', locationId)),
  )
  const surfaceLayerItems = sortLayerViews(
    surface.surfaceLayerItems.map((entry) => flowLayerView(entry, 'surface', locationId)),
  )

  const effectiveLayers = buildFlowEffectiveLayers({
    surfaceId: surface.id,
    blocks,
    globalLayerItems,
    surfaceLayerItems,
  })

  return deepFreeze({
    projectId: project.id,
    revision: project.revision,
    locationId,
    surfaceId: surface.id,
    surfaceTitle: surface.title,
    activeBlockId: location.blockId,
    layout: { ...surface.layout },
    blocks,
    outline,
    globalLayerItems,
    surfaceLayerItems,
    effectiveLayers,
  })
}
