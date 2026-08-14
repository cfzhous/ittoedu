import { nanoid } from 'nanoid'
import { courseProjectDocumentSchema } from '../../shared/courseProjectSchema'
import {
  deriveCourseProjectAuthoringInventorySnapshot,
  migrateProjectV8ToCourseProjectV9,
} from '../../shared/courseProjectModel'
import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
  FlowBlock,
  LayerItem,
  MixedPrintEntry,
  ScopedLayerItem,
  SlideSceneDocument,
  SlidePresentationState,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import type { SceneNode } from '../../shared/projectTypes'
import {
  createFormulaNode,
  createImageNode,
  createProject,
  createShapeNode,
  createTextNode,
} from '../project/createProject'

export interface CourseAuthoringPatch {
  op: 'replace'
  expectedRevision: number
  authoringAddress: string
  value: unknown
  expectedValue?: unknown
}

export class CourseRevisionConflictError extends Error {
  readonly expectedRevision: number
  readonly actualRevision: number

  constructor(expectedRevision: number, actualRevision: number) {
    super(`课件已被修改：期望 revision ${expectedRevision}，当前为 ${actualRevision}`)
    this.name = 'CourseRevisionConflictError'
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

function stableId(prefix: string, preferred?: string): string {
  return preferred ?? `${prefix}-${nanoid(10)}`
}

export function createCourseProject(input: {
  id?: string
  title?: string
  now?: string
} = {}): CourseProjectDocument {
  const now = input.now ?? new Date().toISOString()
  const legacy = createProject({
    id: input.id ?? stableId('course'),
    title: input.title ?? '未命名课程',
    now,
    includeDefaultController: true,
  })
  const project = migrateProjectV8ToCourseProjectV9(legacy)
  project.updatedAt = now
  return courseProjectDocumentSchema.parse(project)
}

function cloneAndCommit(
  project: CourseProjectDocument,
  mutate: (draft: CourseProjectDocument) => void,
  now = new Date().toISOString(),
): CourseProjectDocument {
  const draft = structuredClone(project)
  mutate(draft)
  draft.revision = project.revision + 1
  draft.updatedAt = now
  return courseProjectDocumentSchema.parse(draft)
}

export function updateCourseProject(
  project: CourseProjectDocument,
  mutate: (draft: CourseProjectDocument) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, mutate, now)
}

function findMutableSlideScene(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
): SlideSceneDocument {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'slide') throw new Error(`找不到 Slide 表面：${surfaceId}`)
  const scene = surface.scenes.find((candidate) => candidate.id === sceneId)
  if (!scene) throw new Error(`找不到 Slide 场景：${sceneId}`)
  return scene
}

/** Persists only the structured, author-expressible part of the inspected frame. */
export function saveSlidePresentationState(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  state: SlidePresentationState,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const scene = findMutableSlideScene(draft, surfaceId, sceneId)
    if (scene.presentation?.states.some((candidate) => candidate.id === state.id)) {
      throw new Error(`命名状态 ID 已存在：${state.id}`)
    }
    const saved = structuredClone(state)
    if (scene.presentation) scene.presentation.states.push(saved)
    else {
      scene.presentation = {
        initialStateId: saved.id,
        thumbnailStateId: saved.id,
        states: [saved],
      }
    }
  }, now)
}

export function renameSlidePresentationState(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  stateId: string,
  name: string,
  now?: string,
): CourseProjectDocument {
  const normalized = name.trim()
  if (!normalized) throw new Error('命名状态名称不能为空')
  return cloneAndCommit(project, (draft) => {
    const scene = findMutableSlideScene(draft, surfaceId, sceneId)
    const state = scene.presentation?.states.find((candidate) => candidate.id === stateId)
    if (!state) throw new Error(`找不到命名状态：${stateId}`)
    state.name = normalized
  }, now)
}

export function setInitialSlidePresentationState(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  stateId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const scene = findMutableSlideScene(draft, surfaceId, sceneId)
    if (!scene.presentation?.states.some((candidate) => candidate.id === stateId)) {
      throw new Error(`找不到命名状态：${stateId}`)
    }
    scene.presentation.initialStateId = stateId
  }, now)
}

export function deleteSlidePresentationState(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  stateId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const scene = findMutableSlideScene(draft, surfaceId, sceneId)
    const presentation = scene.presentation
    if (!presentation) throw new Error(`找不到命名状态：${stateId}`)
    const index = presentation.states.findIndex((candidate) => candidate.id === stateId)
    if (index < 0) throw new Error(`找不到命名状态：${stateId}`)
    presentation.states.splice(index, 1)
    if (presentation.states.length === 0) {
      delete scene.presentation
      return
    }
    if (presentation.initialStateId === stateId) {
      presentation.initialStateId = presentation.states[0]!.id
    }
    if (presentation.thumbnailStateId === stateId) {
      presentation.thumbnailStateId = presentation.initialStateId
    }
  }, now)
}

export function addCourseSurface(
  project: CourseProjectDocument,
  type: CourseSurfaceDocument['type'],
  options: { id?: string; title?: string; now?: string } = {},
): CourseProjectDocument {
  const id = stableId('surface', options.id)
  return cloneAndCommit(project, (draft) => {
    if (draft.surfaces.some((surface) => surface.id === id)) {
      throw new Error(`表面 ID 已存在：${id}`)
    }
    const ordinal = draft.surfaces.length + 1
    let surface: CourseSurfaceDocument
    if (type === 'slide') {
      const sceneId = stableId('scene')
      surface = {
        id,
        type,
        title: options.title ?? `演示表面 ${ordinal}`,
        canvas: { width: 1280, height: 720 },
        surfaceLayerItems: [],
        scenes: [{
          id: sceneId,
          name: '第 1 幕',
          backgroundColor: '#ffffff',
          layerItems: [],
          interactions: [],
        }],
      }
      draft.locations.push({
        id: sceneId,
        label: `${surface.title} · 第 1 幕`,
        kind: 'slide-scene',
        surfaceId: id,
        sceneId,
      })
    } else if (type === 'flow') {
      const headingId = stableId('block')
      surface = {
        id,
        type,
        title: options.title ?? `流式讲义 ${ordinal}`,
        surfaceLayerItems: [],
        layout: { readingWidth: 760, wideContentWidth: 1120 },
        blocks: [{ id: headingId, type: 'heading', level: 1, text: '新讲义' }],
      }
      draft.locations.push({
        id: headingId,
        label: surface.title,
        kind: 'flow-block',
        surfaceId: id,
        blockId: headingId,
      })
    } else {
      const cameraId = stableId('camera')
      surface = {
        id,
        type,
        title: options.title ?? `空间探索 ${ordinal}`,
        surfaceLayerItems: [],
        world: { bounds: { mode: 'infinite' }, layerItems: [] },
        camera: {
          home: { x: 0, y: 0, zoom: 1 },
          frames: [{ id: cameraId, name: '总览', x: 0, y: 0, zoom: 1 }],
        },
        semanticZoom: [],
      }
      draft.locations.push({
        id: cameraId,
        label: `${surface.title} · 总览`,
        kind: 'spatial-camera',
        surfaceId: id,
        cameraFrameId: cameraId,
      })
    }
    draft.surfaces.push(surface)
    if (draft.surfaces.length > 1) {
      draft.mixedPrintPlan = {
        pageSize: 'A4',
        orientation: 'auto',
        entries: draft.surfaces.map(defaultMixedPrintEntry),
      }
    }
  }, options.now)
}

export function deleteCourseSurface(
  project: CourseProjectDocument,
  surfaceId: string,
  now?: string,
): CourseProjectDocument {
  if (project.surfaces.length <= 1) throw new Error('课程至少需要一个表面')
  return cloneAndCommit(project, (draft) => {
    const index = draft.surfaces.findIndex((surface) => surface.id === surfaceId)
    if (index < 0) throw new Error(`找不到表面：${surfaceId}`)
    draft.surfaces.splice(index, 1)
    draft.locations = draft.locations.filter((location) => location.surfaceId !== surfaceId)
    if (!draft.locations.some((location) => location.id === draft.startLocationId)) {
      draft.startLocationId = draft.locations[0]?.id ?? ''
    }
    if (draft.surfaces.length === 1) delete draft.mixedPrintPlan
    else if (draft.mixedPrintPlan) {
      draft.mixedPrintPlan.entries = draft.surfaces.map(defaultMixedPrintEntry)
    }
  }, now)
}

function migrateSingleNativeNode(node: SceneNode): LayerItem {
  const legacy = createProject({
    id: stableId('scratch'),
    includeDefaultController: false,
    controls: 'none',
  })
  legacy.scenes[0]!.nodes = [node]
  const migrated = migrateProjectV8ToCourseProjectV9(legacy)
  const surface = migrated.surfaces[0]
  if (surface?.type !== 'slide') throw new Error('无法创建文字图层')
  const item = surface.scenes[0]?.layerItems[0]
  if (!item) throw new Error('无法创建文字图层')
  return item
}

function createNativeTextLayer(id: string, text: string): LayerItem {
  return migrateSingleNativeNode(createTextNode({
    id,
    name: text || '文字',
    text,
    x: 120,
    y: 120,
  }))
}

export function addSlideScene(
  project: CourseProjectDocument,
  surfaceId: string,
  options: { id?: string; name?: string; now?: string } = {},
): CourseProjectDocument {
  const sceneId = stableId('scene', options.id)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('目标不是 Slide 表面')
    if (surface.scenes.some((scene) => scene.id === sceneId)) throw new Error(`场景 ID 已存在：${sceneId}`)
    const scene: SlideSceneDocument = {
      id: sceneId,
      name: options.name ?? `第 ${surface.scenes.length + 1} 幕`,
      backgroundColor: '#ffffff',
      layerItems: [],
      interactions: [],
    }
    surface.scenes.push(scene)
    const printEntry = draft.mixedPrintPlan?.entries.find(
      (entry): entry is Extract<MixedPrintEntry, { kind: 'slide-scenes' }> =>
        entry.kind === 'slide-scenes' && entry.surfaceId === surfaceId,
    )
    printEntry?.sceneIds.push(sceneId)
    draft.locations.push({
      id: sceneId,
      label: `${surface.title} · ${scene.name}`,
      kind: 'slide-scene',
      surfaceId,
      sceneId,
    })
  }, options.now)
}

export function addSlideTextLayer(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  text = '双击编辑文字',
  options: { id?: string; now?: string } = {},
): CourseProjectDocument {
  const item = createNativeTextLayer(stableId('text', options.id), text)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('目标不是 Slide 表面')
    const scene = surface.scenes.find((candidate) => candidate.id === sceneId)
    if (!scene) throw new Error(`找不到场景：${sceneId}`)
    item.order = reserveTopAuthoringOrder(draft, surface.id, scene.id)
    scene.layerItems.push(item)
    sortAllLayerLists(draft)
  }, options.now)
}

export function addSpatialTextLayer(
  project: CourseProjectDocument,
  surfaceId: string,
  text = '双击编辑文字',
  options: { id?: string; x?: number; y?: number; now?: string } = {},
): CourseProjectDocument {
  const item = createNativeTextLayer(stableId('text', options.id), text)
  item.frame.x = options.x ?? 0
  item.frame.y = options.y ?? 0
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    item.order = reserveTopAuthoringOrder(draft, surface.id)
    surface.world.layerItems.push(item)
    sortAllLayerLists(draft)
  }, options.now)
}

export function addNativeVisualLayer(
  project: CourseProjectDocument,
  input: {
    surfaceId: string
    sceneId?: string
    nativeType: 'formula' | 'shape'
    id?: string
    x?: number
    y?: number
    now?: string
  },
): CourseProjectDocument {
  const id = stableId(input.nativeType, input.id)
  const node = input.nativeType === 'formula'
    ? createFormulaNode({ id, x: input.x, y: input.y, accessibleText: 'x 的平方加二分之一' })
    : createShapeNode('rounded-rectangle', { id, x: input.x, y: input.y })
  const item = migrateSingleNativeNode(node)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === input.surfaceId)
    if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
    let items: LayerItem[]
    if (surface.type === 'slide') {
      const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
      if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
      items = scene.layerItems
    } else if (surface.type === 'spatial-2d') {
      items = surface.world.layerItems
    } else {
      throw new Error('Flow 公式应使用公式块，图形应使用图层表面。')
    }
    item.order = reserveTopAuthoringOrder(draft, surface.id, input.sceneId)
    items.push(item)
    sortAllLayerLists(draft)
  }, input.now)
}

export function addImageLayer(
  project: CourseProjectDocument,
  input: {
    surfaceId: string
    sceneId?: string
    assetId: string
    id?: string
    width?: number
    height?: number
    x?: number
    y?: number
    now?: string
  },
): CourseProjectDocument {
  if (!project.assets[input.assetId]) throw new Error(`找不到素材：${input.assetId}`)
  const item = migrateSingleNativeNode(createImageNode({
    id: stableId('image', input.id),
    name: '图片',
    assetId: input.assetId,
    width: input.width,
    height: input.height,
    x: input.x,
    y: input.y,
  }))
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === input.surfaceId)
    if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
    let items: LayerItem[]
    if (surface.type === 'slide') {
      const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
      if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
      items = scene.layerItems
    } else if (surface.type === 'spatial-2d') {
      items = surface.world.layerItems
    } else {
      throw new Error('Flow 图片应使用媒体块')
    }
    item.order = reserveTopAuthoringOrder(draft, surface.id, input.sceneId)
    items.push(item)
    sortAllLayerLists(draft)
  }, input.now)
}

export function addComponentLayer(
  project: CourseProjectDocument,
  input: {
    surfaceId: string
    sceneId?: string
    packageId: string
    version: string
    label: string
    props: Record<string, unknown>
    id?: string
    width: number
    height: number
    x?: number
    y?: number
    now?: string
  },
): CourseProjectDocument {
  const item: LayerItem = {
    layerItemId: stableId('component', input.id),
    label: input.label,
    kind: 'component',
    frame: {
      mode: 'absolute',
      x: input.x ?? 160,
      y: input.y ?? 120,
      width: input.width,
      height: input.height,
    },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: input.packageId, version: input.version },
    props: structuredClone(input.props),
  }
  return cloneAndCommit(project, (draft) => {
    const meta = Object.values(draft.componentPackages).find((candidate) => (
      candidate.packageId === input.packageId && candidate.version === input.version
    ))
    if (!meta) throw new Error(`组件包未嵌入工程：${input.packageId}@${input.version}`)
    const items = layerItemsIn(draft, input)
    item.order = reserveTopAuthoringOrder(draft, input.surfaceId, input.sceneId)
    items.push(item)
    sortAllLayerLists(draft)
  }, input.now)
}

type NewFlowBlock = FlowBlock extends infer Block
  ? Block extends FlowBlock
    ? Omit<Block, 'id'> & { id?: string }
    : never
  : never

export function addFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  block: NewFlowBlock,
  now?: string,
): CourseProjectDocument {
  const next = { ...block, id: stableId('block', block.id) } as FlowBlock
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'flow') throw new Error('目标不是 Flow 表面')
    if (surface.blocks.some((candidate) => candidate.id === next.id)) {
      throw new Error(`块 ID 已存在：${next.id}`)
    }
    surface.blocks.push(next)
    appendFlowLocations(draft, surfaceId, next)
  }, now)
}

function flowBlockLabel(block: FlowBlock): string {
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') {
    return block.text.trim().slice(0, 48) || block.type
  }
  if (block.type === 'callout') return block.title?.trim() || block.body.trim().slice(0, 48) || '提示'
  if (block.type === 'section') return block.title.trim() || '分节'
  if (block.type === 'media') return block.caption?.trim() || block.altText?.trim() || '媒体'
  if (block.type === 'code') return block.language ? `代码·${block.language}` : '代码'
  if (block.type === 'formula') return block.accessibleText.trim() || '公式'
  if (block.type === 'component') return `组件·${block.component.packageId}`
  if (block.type === 'list') return block.items[0]?.text.trim().slice(0, 48) || '列表'
  if (block.type === 'table') return block.caption?.trim() || '表格'
  return '分隔线'
}

function appendFlowLocations(
  project: CourseProjectDocument,
  surfaceId: string,
  block: FlowBlock,
): void {
  project.locations.push({
    id: block.id,
    label: flowBlockLabel(block),
    kind: 'flow-block',
    surfaceId,
    blockId: block.id,
  })
  if (block.type === 'section') {
    block.blocks.forEach((child) => appendFlowLocations(project, surfaceId, child))
  }
}

function flowBlockIds(block: FlowBlock): string[] {
  return [block.id, ...(block.type === 'section' ? block.blocks.flatMap(flowBlockIds) : [])]
}

function flowSurfaceIn(
  project: CourseProjectDocument,
  surfaceId: string,
): Extract<CourseSurfaceDocument, { type: 'flow' }> {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'flow') throw new Error('目标不是 Flow 表面')
  return surface
}

export function updateFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  update: (block: FlowBlock) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = flowSurfaceIn(draft, surfaceId)
    const block = surface.blocks.find((candidate) => candidate.id === blockId)
    if (!block) throw new Error(`找不到 Flow 块：${blockId}`)
    update(block)
    const location = draft.locations.find(
      (candidate) => candidate.kind === 'flow-block' && candidate.surfaceId === surfaceId && candidate.blockId === blockId,
    )
    if (location) location.label = flowBlockLabel(block)
  }, now)
}

interface FlowBlockLocation {
  blocks: FlowBlock[]
  index: number
  block: FlowBlock
}

function findFlowBlockRecursive(blocks: FlowBlock[], blockId: string): FlowBlockLocation | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!
    if (block.id === blockId) return { blocks, index, block }
    if (block.type === 'section') {
      const nested = findFlowBlockRecursive(block.blocks, blockId)
      if (nested) return nested
    }
  }
  return null
}

export function updateNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  update: (block: FlowBlock) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    update(found.block)
    const location = draft.locations.find((candidate) => (
      candidate.kind === 'flow-block' && candidate.surfaceId === surfaceId && candidate.blockId === blockId
    ))
    if (location) location.label = flowBlockLabel(found.block)
  }, now)
}

export function insertNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  sectionId: string,
  block: NewFlowBlock,
  now?: string,
): CourseProjectDocument {
  const next = { ...block, id: stableId('block', block.id) } as FlowBlock
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, sectionId)
    if (!found || found.block.type !== 'section') throw new Error(`找不到 Flow 分节：${sectionId}`)
    if (findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, next.id)) throw new Error(`Flow 块 ID 已存在：${next.id}`)
    found.block.blocks.push(next)
    appendFlowLocations(draft, surfaceId, next)
  }, now)
}

export function deleteNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    const deletedIds = new Set(flowBlockIds(found.block))
    found.blocks.splice(found.index, 1)
    draft.locations = draft.locations.filter((location) => !(
      location.kind === 'flow-block' && location.surfaceId === surfaceId && deletedIds.has(location.blockId)
    ))
    if (!draft.locations.some((location) => location.id === draft.startLocationId)) {
      draft.startLocationId = draft.locations[0]?.id ?? ''
    }
  }, now)
}

export function reorderNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  toIndex: number,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    const [block] = found.blocks.splice(found.index, 1)
    found.blocks.splice(Math.max(0, Math.min(toIndex, found.blocks.length)), 0, block!)
  }, now)
}

export function duplicateNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    const duplicate = regenerateFlowIdentities(found.block)
    found.blocks.splice(found.index + 1, 0, duplicate)
    appendFlowLocations(draft, surfaceId, duplicate)
  }, now)
}

export function addSpatialSemanticZoomRule(
  project: CourseProjectDocument,
  surfaceId: string,
  input: {
    id?: string
    layerItemIds: string[]
    minZoom: number
    maxZoom: number
    visible?: boolean
    now?: string
  },
): CourseProjectDocument {
  const id = stableId('semantic-zoom', input.id)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    if (input.minZoom < 0 || input.maxZoom <= input.minZoom) throw new Error('语义缩放范围无效')
    const worldIds = new Set(surface.world.layerItems.map((item) => item.layerItemId))
    if (input.layerItemIds.length === 0 || input.layerItemIds.some((itemId) => !worldIds.has(itemId))) {
      throw new Error('语义缩放规则必须引用已存在的世界图层')
    }
    surface.semanticZoom.push({
      id,
      layerItemIds: [...new Set(input.layerItemIds)],
      minZoom: input.minZoom,
      maxZoom: input.maxZoom,
      visible: input.visible ?? true,
    })
  }, input.now)
}

export function updateSpatialSemanticZoomRule(
  project: CourseProjectDocument,
  surfaceId: string,
  ruleId: string,
  update: (rule: SpatialSurfaceDocument['semanticZoom'][number]) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    const rule = surface.semanticZoom.find((candidate) => candidate.id === ruleId)
    if (!rule) throw new Error(`找不到语义缩放规则：${ruleId}`)
    update(rule)
  }, now)
}

export function deleteSpatialSemanticZoomRule(
  project: CourseProjectDocument,
  surfaceId: string,
  ruleId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    const index = surface.semanticZoom.findIndex((candidate) => candidate.id === ruleId)
    if (index < 0) throw new Error(`找不到语义缩放规则：${ruleId}`)
    surface.semanticZoom.splice(index, 1)
  }, now)
}

export function reorderFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  toIndex: number,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const blocks = flowSurfaceIn(draft, surfaceId).blocks
    const index = blocks.findIndex((candidate) => candidate.id === blockId)
    if (index < 0) throw new Error(`找不到 Flow 块：${blockId}`)
    const [block] = blocks.splice(index, 1)
    blocks.splice(Math.max(0, Math.min(toIndex, blocks.length)), 0, block!)
  }, now)
}

function regenerateFlowIdentities(block: FlowBlock): FlowBlock {
  const next = structuredClone(block)
  next.id = stableId('block')
  if (next.type === 'list') {
    next.items = next.items.map((item) => ({ ...item, id: stableId('list-item') }))
  } else if (next.type === 'section') {
    next.blocks = next.blocks.map(regenerateFlowIdentities)
  }
  return next
}

export function duplicateFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const blocks = flowSurfaceIn(draft, surfaceId).blocks
    const index = blocks.findIndex((candidate) => candidate.id === blockId)
    if (index < 0) throw new Error(`找不到 Flow 块：${blockId}`)
    const duplicate = regenerateFlowIdentities(blocks[index]!)
    blocks.splice(index + 1, 0, duplicate)
    appendFlowLocations(draft, surfaceId, duplicate)
  }, now)
}

export function deleteFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const blocks = flowSurfaceIn(draft, surfaceId).blocks
    const index = blocks.findIndex((candidate) => candidate.id === blockId)
    if (index < 0) throw new Error(`找不到 Flow 块：${blockId}`)
    const deletedIds = new Set(flowBlockIds(blocks[index]!))
    blocks.splice(index, 1)
    draft.locations = draft.locations.filter((location) => !(
      location.kind === 'flow-block' && location.surfaceId === surfaceId && deletedIds.has(location.blockId)
    ))
    if (!draft.locations.some((location) => location.id === draft.startLocationId)) {
      draft.startLocationId = draft.locations[0]?.id ?? ''
    }
  }, now)
}

function layerItemsIn(
  project: CourseProjectDocument,
  input: { surfaceId: string; sceneId?: string },
): LayerItem[] {
  const surface = project.surfaces.find((candidate) => candidate.id === input.surfaceId)
  if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
  if (surface.type === 'slide') {
    const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
    if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
    return scene.layerItems
  }
  if (surface.type === 'spatial-2d') return surface.world.layerItems
  throw new Error('Flow 语义内容请使用内容块；绝对图层必须明确使用 surface 或 global scope')
}

export type CourseLayerSource = 'scene' | 'world' | 'surface' | 'global'

export interface CourseLayerItemLocation {
  surfaceId: string
  sceneId?: string
  layerItemId: string
  source?: CourseLayerSource
}

interface MutableLayerCollection {
  scoped: boolean
  entries: LayerItem[] | ScopedLayerItem[]
}

function mutableLayerCollectionIn(
  project: CourseProjectDocument,
  input: Pick<CourseLayerItemLocation, 'surfaceId' | 'sceneId' | 'source'>,
): MutableLayerCollection {
  if (input.source === 'global') {
    return { scoped: true, entries: project.globalLayerItems }
  }
  const surface = project.surfaces.find((candidate) => candidate.id === input.surfaceId)
  if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
  if (input.source === 'surface') {
    return { scoped: true, entries: surface.surfaceLayerItems }
  }
  if (surface.type === 'slide') {
    const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
    if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
    return { scoped: false, entries: scene.layerItems }
  }
  if (surface.type === 'spatial-2d' && (input.source === undefined || input.source === 'world')) {
    return { scoped: false, entries: surface.world.layerItems }
  }
  throw new Error('Flow 绝对图层必须明确使用 surface 或 global scope')
}

function collectionItems(collection: MutableLayerCollection): LayerItem[] {
  return collection.scoped
    ? (collection.entries as ScopedLayerItem[]).map((entry) => entry.item)
    : collection.entries as LayerItem[]
}

function collectionDelete(collection: MutableLayerCollection, index: number): void {
  collection.entries.splice(index, 1)
}

function collectionInsert(
  collection: MutableLayerCollection,
  index: number,
  item: LayerItem,
  visibility?: ScopedLayerItem['visibility'],
): void {
  if (collection.scoped) {
    ;(collection.entries as ScopedLayerItem[]).splice(index, 0, {
      item,
      visibility: visibility ?? { mode: 'all', locationIds: [] },
    })
  } else {
    ;(collection.entries as LayerItem[]).splice(index, 0, item)
  }
}

export function updateLayerItem(
  project: CourseProjectDocument,
  input: CourseLayerItemLocation,
  update: (item: LayerItem) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const item = collectionItems(mutableLayerCollectionIn(draft, input))
      .find((candidate) => candidate.layerItemId === input.layerItemId)
    if (!item) throw new Error(`找不到图层：${input.layerItemId}`)
    update(item)
  }, now)
}

export function deleteLayerItem(
  project: CourseProjectDocument,
  input: CourseLayerItemLocation,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const collection = mutableLayerCollectionIn(draft, input)
    const items = collectionItems(collection)
    const index = items.findIndex((candidate) => candidate.layerItemId === input.layerItemId)
    if (index < 0) throw new Error(`找不到图层：${input.layerItemId}`)
    collectionDelete(collection, index)
    sortAllLayerLists(draft)
  }, now)
}

export function duplicateLayerItem(
  project: CourseProjectDocument,
  input: CourseLayerItemLocation,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const collection = mutableLayerCollectionIn(draft, input)
    const items = collectionItems(collection)
    const index = items.findIndex((candidate) => candidate.layerItemId === input.layerItemId)
    if (index < 0) throw new Error(`找不到图层：${input.layerItemId}`)
    const duplicate = structuredClone(items[index]!)
    duplicate.layerItemId = stableId(duplicate.kind)
    duplicate.label = `${duplicate.label} 副本`
    duplicate.frame.x += 24
    duplicate.frame.y += 24
    const desiredOrder = items[index]!.order + 1
    shiftProjectLayerOrders(draft, desiredOrder, 1)
    duplicate.order = desiredOrder
    const originalVisibility = collection.scoped
      ? (collection.entries as ScopedLayerItem[])[index]?.visibility
      : undefined
    collectionInsert(collection, index + 1, duplicate, originalVisibility && structuredClone(originalVisibility))
    sortAllLayerLists(draft)
  }, now)
}

export function addSpatialCameraFrame(
  project: CourseProjectDocument,
  surfaceId: string,
  pose: { x: number; y: number; zoom: number },
  options: { id?: string; name?: string; now?: string } = {},
): CourseProjectDocument {
  const frameId = stableId('camera', options.id)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    const frame = {
      id: frameId,
      name: options.name ?? `镜头 ${surface.camera.frames.length + 1}`,
      x: pose.x,
      y: pose.y,
      zoom: pose.zoom,
    }
    surface.camera.frames.push(frame)
    draft.locations.push({
      id: frameId,
      label: `${surface.title} · ${frame.name}`,
      kind: 'spatial-camera',
      surfaceId,
      cameraFrameId: frameId,
    })
    const printEntry = draft.mixedPrintPlan?.entries.find(
      (entry): entry is Extract<MixedPrintEntry, { kind: 'spatial-frames' }> =>
        entry.kind === 'spatial-frames' && entry.surfaceId === surfaceId,
    )
    printEntry?.cameraFrameIds.push(frameId)
  }, options.now)
}

function defaultMixedPrintEntry(surface: CourseSurfaceDocument): MixedPrintEntry {
  if (surface.type === 'slide') {
    return {
      id: `print:${surface.id}`,
      kind: 'slide-scenes',
      surfaceId: surface.id,
      sceneIds: surface.scenes.map((scene) => scene.id),
    }
  }
  if (surface.type === 'flow') {
    return { id: `print:${surface.id}`, kind: 'flow-document', surfaceId: surface.id }
  }
  return {
    id: `print:${surface.id}`,
    kind: 'spatial-frames',
    surfaceId: surface.id,
    cameraFrameIds: surface.camera.frames.map((frame) => frame.id),
  }
}

export function reorderLayerItem(
  project: CourseProjectDocument,
  input: CourseLayerItemLocation & { toIndex: number },
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === input.surfaceId)
    if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
    const items = collectionItems(mutableLayerCollectionIn(draft, input))
    const item = items.find((candidate) => candidate.layerItemId === input.layerItemId)
    if (!item) throw new Error(`找不到图层：${input.layerItemId}`)
    const common = [
      ...draft.globalLayerItems.map((entry) => entry.item),
      ...surface.surfaceLayerItems.map((entry) => entry.item),
    ]
    const effective = [...common, ...items]
      .filter((candidate) => candidate.layerItemId !== item.layerItemId)
      .sort((left, right) => left.order - right.order || left.layerItemId.localeCompare(right.layerItemId))
    const destination = Math.max(0, Math.min(input.toIndex, effective.length))
    const desiredOrder = effective[destination]?.order ?? (maximumProjectLayerOrder(draft) + 1)
    shiftProjectLayerOrders(draft, desiredOrder, 1, item.layerItemId)
    item.order = desiredOrder
    sortAllLayerLists(draft)
  }, now)
}

function allProjectLayerItems(project: CourseProjectDocument): LayerItem[] {
  const items = [
    ...project.globalLayerItems.map((entry) => entry.item),
  ]
  project.surfaces.forEach((surface) => {
    items.push(...surface.surfaceLayerItems.map((entry) => entry.item))
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene) => items.push(...scene.layerItems))
    } else if (surface.type === 'spatial-2d') {
      items.push(...surface.world.layerItems)
    }
  })
  return items
}

function maximumProjectLayerOrder(project: CourseProjectDocument): number {
  return Math.max(-1, ...allProjectLayerItems(project).map((item) => item.order))
}

function shiftProjectLayerOrders(
  project: CourseProjectDocument,
  fromInclusive: number,
  delta: number,
  exceptLayerItemId?: string,
): void {
  allProjectLayerItems(project).forEach((item) => {
    if (item.layerItemId !== exceptLayerItemId && item.order >= fromInclusive) {
      item.order += delta
    }
  })
}

function sortAllLayerLists(project: CourseProjectDocument): void {
  const sort = <T extends LayerItem>(items: T[]) => items.sort((left, right) =>
    left.order - right.order || left.layerItemId.localeCompare(right.layerItemId),
  )
  project.globalLayerItems.sort((left, right) =>
    left.item.order - right.item.order || left.item.layerItemId.localeCompare(right.item.layerItemId),
  )
  project.surfaces.forEach((surface) => {
    surface.surfaceLayerItems.sort((left, right) =>
      left.item.order - right.item.order || left.item.layerItemId.localeCompare(right.item.layerItemId),
    )
    if (surface.type === 'slide') surface.scenes.forEach((scene) => sort(scene.layerItems))
    else if (surface.type === 'spatial-2d') sort(surface.world.layerItems)
  })
}

function reserveTopAuthoringOrder(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId?: string,
): number {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface) throw new Error(`找不到表面：${surfaceId}`)
  const localItems = surface.type === 'slide'
    ? surface.scenes.find((scene) => scene.id === sceneId)?.layerItems ?? []
    : surface.type === 'spatial-2d'
      ? surface.world.layerItems
      : []
  const effective = [
    ...project.globalLayerItems.map((entry) => entry.item),
    ...surface.surfaceLayerItems.map((entry) => entry.item),
    ...localItems,
  ]
  const controllerOrder = Math.min(
    Number.POSITIVE_INFINITY,
    ...effective
      .filter((item) => item.kind === 'native' && item.content.nativeType === 'teacher-controller')
      .map((item) => item.order),
  )
  const order = Number.isFinite(controllerOrder)
    ? controllerOrder
    : Math.max(-1, ...effective.map((item) => item.order)) + 1
  shiftProjectLayerOrders(project, order, 1)
  return order
}

function decodePointerSegment(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}

function resolvePointer(document: unknown, pointer: string): { parent: Record<string, unknown> | unknown[]; key: string } {
  if (!pointer.startsWith('/') || pointer === '/') throw new Error('无效的作者路径')
  const segments = pointer.slice(1).split('/').map(decodePointerSegment)
  if (segments.some((segment) => ['__proto__', 'prototype', 'constructor'].includes(segment))) {
    throw new Error('作者路径包含不允许的字段')
  }
  let current = document as Record<string, unknown> | unknown[]
  for (const segment of segments.slice(0, -1)) {
    if (current === null || typeof current !== 'object' || !(segment in current)) {
      throw new Error('作者目标已失效')
    }
    current = (current as Record<string, unknown>)[segment] as Record<string, unknown> | unknown[]
  }
  const key = segments.at(-1)!
  if (current === null || typeof current !== 'object' || !(key in current)) {
    throw new Error('作者字段已失效')
  }
  return { parent: current, key }
}

function canonical(value: unknown): string {
  return JSON.stringify(value)
}

/** Revision-protected Project transaction used by both the editor and AI bridge. */
export function applyCourseAuthoringPatch(
  project: CourseProjectDocument,
  patch: CourseAuthoringPatch,
  now?: string,
): CourseProjectDocument {
  if (patch.op !== 'replace') throw new Error('仅支持 replace Patch')
  if (patch.expectedRevision !== project.revision) {
    throw new CourseRevisionConflictError(patch.expectedRevision, project.revision)
  }
  const inventory = deriveCourseProjectAuthoringInventorySnapshot(project)
  const entry = inventory.entries[patch.authoringAddress]
  if (!entry) throw new Error('作者地址不属于当前工程或已失效')
  return cloneAndCommit(project, (draft) => {
    const { parent, key } = resolvePointer(draft, entry.jsonPointer)
    const record = parent as Record<string, unknown>
    if ('expectedValue' in patch && canonical(record[key]) !== canonical(patch.expectedValue)) {
      throw new Error('目标字段在点选后已被修改')
    }
    record[key] = structuredClone(patch.value)
  }, now)
}

export interface CourseHistoryState {
  present: CourseProjectDocument
  past: CourseProjectDocument[]
  future: CourseProjectDocument[]
}

export function createCourseHistory(project: CourseProjectDocument): CourseHistoryState {
  return { present: project, past: [], future: [] }
}

export function commitCourseHistory(
  history: CourseHistoryState,
  next: CourseProjectDocument,
  limit = 100,
): CourseHistoryState {
  return {
    present: next,
    past: [...history.past, history.present].slice(-limit),
    future: [],
  }
}

export function undoCourseHistory(history: CourseHistoryState): CourseHistoryState {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    present: previous,
    past: history.past.slice(0, -1),
    future: [history.present, ...history.future],
  }
}

export function redoCourseHistory(history: CourseHistoryState): CourseHistoryState {
  const next = history.future[0]
  if (!next) return history
  return {
    present: next,
    past: [...history.past, history.present],
    future: history.future.slice(1),
  }
}
