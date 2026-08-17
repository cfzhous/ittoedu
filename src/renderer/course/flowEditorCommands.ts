import { nanoid } from 'nanoid'
import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
  FlowBlock,
  FlowSurfaceDocument,
  LayerItem,
  ScopedLayerItem,
} from '../../shared/courseProjectTypes'
import type { InteractionRule } from '../../shared/interactionTypes'
import {
  commitCourseHistory,
  type CourseHistoryState,
  reorderFlowBlock,
  reorderNestedFlowBlock,
  updateCourseProject,
  updateFlowBlock,
  updateNestedFlowBlock,
} from './courseStudioModel'
import type {
  EditorActionAdapter,
  EditorActionAdapterResult,
  EditorActionId,
  EditorSelectionConstraints,
  EditorSelectionSnapshot,
} from './editorActionTypes'
import type { FlowEditorBlockTarget } from './flowEditorSlice'

export type FlowEditorBlockInput = FlowBlock extends infer Block
  ? Block extends FlowBlock
    ? Omit<Block, 'id'> & { id?: string }
    : never
  : never

export interface InsertFlowEditorBlockInput {
  readonly surfaceId: string
  readonly parentId: string | null
  readonly index: number
  readonly block: FlowEditorBlockInput
  readonly now?: string
}

export interface MoveFlowEditorBlockDestination {
  readonly parentId: string | null
  readonly index: number
  /** Optional; Flow moves are surface-local. A different surface is rejected. */
  readonly surfaceId?: string
  readonly now?: string
}

interface FlowBlockLocation {
  blocks: FlowBlock[]
  index: number
  block: FlowBlock
  parentId: string | null
}

function stableId(prefix: string, preferred?: string): string {
  return preferred ?? `${prefix}-${nanoid(10)}`
}

function flowSurfaceIn(
  project: CourseProjectDocument,
  surfaceId: string,
): FlowSurfaceDocument {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'flow') {
    throw new Error(`找不到 Flow 表面：${surfaceId}`)
  }
  return surface
}

function findFlowBlockRecursive(
  blocks: FlowBlock[],
  blockId: string,
  parentId: string | null = null,
): FlowBlockLocation | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!
    if (block.id === blockId) return { blocks, index, block, parentId }
    if (block.type === 'section') {
      const nested = findFlowBlockRecursive(block.blocks, blockId, block.id)
      if (nested) return nested
    }
  }
  return null
}

function walkFlowBlocks(blocks: FlowBlock[], visit: (block: FlowBlock) => void): void {
  blocks.forEach((block) => {
    visit(block)
    if (block.type === 'section') walkFlowBlocks(block.blocks, visit)
  })
}

function flowBlockIds(block: FlowBlock): string[] {
  return [block.id, ...(block.type === 'section' ? block.blocks.flatMap(flowBlockIds) : [])]
}

function assertUniqueBlockId(
  surface: FlowSurfaceDocument,
  blockId: string,
): void {
  let count = 0
  walkFlowBlocks(surface.blocks, (block) => {
    if (block.id === blockId) count += 1
  })
  if (count > 1) throw new Error(`Flow 块 ID 重复：${blockId}`)
}

function resolveFlowBlock(
  project: CourseProjectDocument,
  target: FlowEditorBlockTarget,
): FlowBlockLocation {
  if (typeof target.surfaceId !== 'string' || target.surfaceId.trim() === '') {
    throw new Error('Flow 表面不能为空')
  }
  if (typeof target.blockId !== 'string' || target.blockId.trim() === '') {
    throw new Error('所选 Flow 块不能为空')
  }
  const surface = flowSurfaceIn(project, target.surfaceId)
  assertUniqueBlockId(surface, target.blockId)
  const found = findFlowBlockRecursive(surface.blocks, target.blockId)
  if (!found) throw new Error(`找不到 Flow 块：${target.blockId}`)
  if ((found.parentId ?? null) !== (target.parentId ?? null)) {
    throw new Error('所选 Flow 块位置已变化，请重新选择')
  }
  return found
}

function validateIndex(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index > length) {
    throw new Error('插入位置无效')
  }
}

function validateMoveIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('移动位置无效')
  }
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

function isFlowCourseAnchor(
  block: FlowBlock,
): block is Extract<FlowBlock, { type: 'heading' | 'section' }> {
  return block.type === 'heading' || block.type === 'section'
}

function appendFlowLocations(
  project: CourseProjectDocument,
  surfaceId: string,
  block: FlowBlock,
): void {
  if (isFlowCourseAnchor(block)) {
    if (!project.locations.some((location) => location.id === block.id)) {
      project.locations.push({
        id: block.id,
        label: flowBlockLabel(block),
        kind: 'flow-block',
        surfaceId,
        blockId: block.id,
      })
    }
  }
  if (block.type === 'section') {
    block.blocks.forEach((child) => appendFlowLocations(project, surfaceId, child))
  }
}

function applyBlockUpdate(block: FlowBlock, update: ((block: FlowBlock) => void) | object): void {
  if (typeof update === 'function') {
    update(block)
    return
  }
  const patch = structuredClone(update) as Record<string, unknown>
  delete patch.id
  Object.assign(block, patch)
}

interface InsertArgs {
  surfaceId: string
  parentId: string | null
  index: number
  block: FlowEditorBlockInput
  now?: string
}

function normalizeInsertArgs(
  inputOrSurfaceId: InsertFlowEditorBlockInput | string,
  parentIdOrNow?: string | null,
  indexOrBlock?: number | FlowEditorBlockInput,
  maybeBlock?: FlowEditorBlockInput,
  maybeNow?: string,
): InsertArgs {
  if (typeof inputOrSurfaceId === 'object') {
    return {
      surfaceId: inputOrSurfaceId.surfaceId,
      parentId: inputOrSurfaceId.parentId,
      index: inputOrSurfaceId.index,
      block: inputOrSurfaceId.block,
      now: inputOrSurfaceId.now,
    }
  }
  return {
    surfaceId: inputOrSurfaceId,
    parentId: (parentIdOrNow ?? null) as string | null,
    index: indexOrBlock as number,
    block: maybeBlock as FlowEditorBlockInput,
    now: maybeNow,
  }
}

/** Inserts one new Flow block at `parentId` (root or section) and `index`. */
export function insertFlowEditorBlock(
  history: CourseHistoryState,
  input: InsertFlowEditorBlockInput,
  now?: string,
): CourseHistoryState
export function insertFlowEditorBlock(
  history: CourseHistoryState,
  surfaceId: string,
  parentId: string | null,
  index: number,
  block: FlowEditorBlockInput,
  now?: string,
): CourseHistoryState
export function insertFlowEditorBlock(
  history: CourseHistoryState,
  inputOrSurfaceId: InsertFlowEditorBlockInput | string,
  parentIdOrNow?: string | null,
  indexOrBlock?: number | FlowEditorBlockInput,
  maybeBlock?: FlowEditorBlockInput,
  maybeNow?: string,
): CourseHistoryState {
  const args = normalizeInsertArgs(
    inputOrSurfaceId,
    parentIdOrNow,
    indexOrBlock,
    maybeBlock,
    maybeNow,
  )
  const nextBlock = { ...args.block, id: stableId('block', args.block.id) } as FlowBlock
  if (typeof nextBlock.id !== 'string' || nextBlock.id.trim() === '') {
    throw new Error('Flow 块 ID 不能为空')
  }
  const project = history.present
  const surface = flowSurfaceIn(project, args.surfaceId)
  walkFlowBlocks(surface.blocks, (block) => {
    if (block.id === nextBlock.id) throw new Error(`Flow 块 ID 已存在：${nextBlock.id}`)
  })
  if (args.parentId === null) {
    validateIndex(args.index, surface.blocks.length)
  } else {
    const section = findFlowBlockRecursive(surface.blocks, args.parentId)
    if (!section || section.block.type !== 'section') {
      throw new Error(`找不到 Flow 分节：${args.parentId}`)
    }
    validateIndex(args.index, section.block.blocks.length)
  }

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = flowSurfaceIn(draft, args.surfaceId)
    let targetBlocks: FlowBlock[]
    if (args.parentId === null) {
      targetBlocks = draftSurface.blocks
    } else {
      const section = findFlowBlockRecursive(draftSurface.blocks, args.parentId)
      if (!section || section.block.type !== 'section') {
        throw new Error(`找不到 Flow 分节：${args.parentId}`)
      }
      targetBlocks = section.block.blocks
    }
    targetBlocks.splice(args.index, 0, nextBlock)
    appendFlowLocations(draft, args.surfaceId, nextBlock)
  }, args.now ?? maybeNow)

  return commitCourseHistory(history, next)
}

/** Updates an existing top-level or nested Flow block. */
export function updateFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  update: (block: FlowBlock) => void,
  now?: string,
): CourseHistoryState
export function updateFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  patch: object,
  now?: string,
): CourseHistoryState
export function updateFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  update: ((block: FlowBlock) => void) | object,
  now?: string,
): CourseHistoryState {
  resolveFlowBlock(history.present, target)
  const project = history.present
  const apply = (block: FlowBlock): void => applyBlockUpdate(block, update)
  const next = target.parentId === null
    ? updateFlowBlock(project, target.surfaceId, target.blockId, apply, now)
    : updateNestedFlowBlock(project, target.surfaceId, target.blockId, apply, now)
  return commitCourseHistory(history, next)
}

/** Deletes a top-level or nested Flow block and repairs location references. */
export function deleteFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  now?: string,
): CourseHistoryState {
  return deleteFlowEditorBlocks(history, [target], now)
}

/** Duplicates a Flow block after its source; block and list-item ids are regenerated. */
export function duplicateFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  now?: string,
): CourseHistoryState {
  return duplicateFlowEditorBlocks(history, [target], now)
}

/** Reorders a Flow block inside its current parent. */
export function reorderFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  toIndex: number,
  now?: string,
): CourseHistoryState {
  resolveFlowBlock(history.present, target)
  const project = history.present
  const next = target.parentId === null
    ? reorderFlowBlock(project, target.surfaceId, target.blockId, toIndex, now)
    : reorderNestedFlowBlock(project, target.surfaceId, target.blockId, toIndex, now)
  return commitCourseHistory(history, next)
}

/** Moves a Flow block into/out of/between sections in the same Flow surface. */
export function moveFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  destination: MoveFlowEditorBlockDestination,
  now?: string,
): CourseHistoryState
export function moveFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  parentId: string | null,
  index: number,
  now?: string,
): CourseHistoryState
export function moveFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  destinationOrParentId: MoveFlowEditorBlockDestination | string | null,
  indexOrNow?: number | string,
  maybeNow?: string,
): CourseHistoryState {
  const destination: MoveFlowEditorBlockDestination = typeof destinationOrParentId === 'object' && destinationOrParentId !== null
    ? destinationOrParentId
    : { parentId: destinationOrParentId as string | null, index: indexOrNow as number }
  const now = typeof destinationOrParentId === 'object' && destinationOrParentId !== null
    ? ((indexOrNow as string | undefined) ?? destinationOrParentId.now)
    : maybeNow

  if (destination.surfaceId !== undefined && destination.surfaceId !== target.surfaceId) {
    throw new Error('暂不支持跨表面移动 Flow 块')
  }

  const project = history.present
  const source = resolveFlowBlock(project, target)
  const surface = flowSurfaceIn(project, target.surfaceId)

  validateMoveIndex(destination.index)
  if (destination.parentId !== null) {
    const destinationSection = findFlowBlockRecursive(surface.blocks, destination.parentId)
    if (!destinationSection || destinationSection.block.type !== 'section') {
      throw new Error(`找不到 Flow 分节：${destination.parentId}`)
    }
  }

  if (source.parentId === destination.parentId) {
    return reorderFlowEditorBlock(history, target, destination.index, now)
  }

  if (source.block.type === 'section') {
    const destinationParentId = destination.parentId
    if (destinationParentId !== null) {
      let cursor: string | null = destinationParentId
      while (cursor !== null) {
        if (cursor === source.block.id) {
          throw new Error('不能将分节移动到自身内部')
        }
        const cursorFound = findFlowBlockRecursive(surface.blocks, cursor)
        cursor = cursorFound?.parentId ?? null
      }
    }
  }

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = flowSurfaceIn(draft, target.surfaceId)
    const from = findFlowBlockRecursive(draftSurface.blocks, target.blockId)
    if (!from || (from.parentId ?? null) !== (target.parentId ?? null)) {
      throw new Error('所选 Flow 块位置已变化，请重新选择')
    }
    let destinationBlocks: FlowBlock[]
    if (destination.parentId === null) {
      destinationBlocks = draftSurface.blocks
    } else {
      const destinationSection = findFlowBlockRecursive(draftSurface.blocks, destination.parentId)
      if (!destinationSection || destinationSection.block.type !== 'section') {
        throw new Error(`找不到 Flow 分节：${destination.parentId}`)
      }
      if (source.block.type === 'section') {
        let cursor: string | null = destinationSection.block.id
        while (cursor !== null) {
          if (cursor === source.block.id) {
            throw new Error('不能将分节移动到自身内部')
          }
          const cursorFound = findFlowBlockRecursive(draftSurface.blocks, cursor)
          cursor = cursorFound?.parentId ?? null
        }
      }
      destinationBlocks = destinationSection.block.blocks
    }
    const [moved] = from.blocks.splice(from.index, 1)
    const clampedIndex = Math.max(0, Math.min(destination.index, destinationBlocks.length))
    destinationBlocks.splice(clampedIndex, 0, moved!)
  }, now)

  return commitCourseHistory(history, next)
}

function regenerateFlowIdentities(block: FlowBlock): FlowBlock {
  const next = structuredClone(block)
  next.id = stableId('block')
  if (next.type === 'list') {
    next.items = next.items.map((item) => ({ ...item, id: stableId('list-item') }))
  } else if (next.type === 'table') {
    next.columns = next.columns.map((column) => ({ ...column, id: stableId('column') }))
    next.rows = next.rows.map((row) => ({
      ...row,
      id: stableId('row'),
      cells: Object.fromEntries(
        next.columns.map((column, index) => {
          const previousId = block.type === 'table' ? block.columns[index]?.id : undefined
          return [column.id, previousId ? row.cells[previousId] ?? '' : '']
        }),
      ),
    }))
  } else if (next.type === 'formula') {
    next.formulaId = stableId('formula')
  } else if (next.type === 'section') {
    next.blocks = next.blocks.map(regenerateFlowIdentities)
  }
  return next
}

function defaultInsertBlock(): FlowEditorBlockInput {
  return { type: 'paragraph', text: '在这里编辑正文……' }
}

function removeBlocksById(blocks: FlowBlock[], deletedIds: ReadonlySet<string>): FlowBlock[] {
  return blocks.flatMap((block): FlowBlock[] => {
    if (deletedIds.has(block.id)) return []
    if (block.type !== 'section') return [block]
    return [{ ...block, blocks: removeBlocksById(block.blocks, deletedIds) }]
  })
}

function removeDeletedLocationVisibility(
  entries: ScopedLayerItem[],
  deletedLocationIds: ReadonlySet<string>,
): void {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!
    if (entry.visibility.mode === 'all') continue
    entry.visibility.locationIds = entry.visibility.locationIds.filter(
      (locationId) => !deletedLocationIds.has(locationId),
    )
    if (entry.visibility.locationIds.length > 0) continue
    if (entry.visibility.mode === 'include') entries.splice(index, 1)
    else entry.visibility = { mode: 'all', locationIds: [] }
  }
}

function removeSceneGoFromController(item: LayerItem, deletedIds: ReadonlySet<string>): void {
  if (item.kind !== 'native' || item.content.nativeType !== 'teacher-controller') return
  const remaining = item.content.data.buttons.filter((button) =>
    button.action.type !== 'scene.go' || !deletedIds.has(button.action.sceneId),
  )
  item.content.data.buttons = remaining.length > 0
    ? remaining
    : [{
        id: stableId('teacher-button'),
        action: { type: 'scene.next' },
        label: '下一场景',
        visible: true,
      }]
}

function repairInteractionRules(
  rules: InteractionRule[],
  deletedIds: ReadonlySet<string>,
): InteractionRule[] {
  return rules.flatMap((rule) => {
    if (rule.trigger.type === 'node.click' && deletedIds.has(rule.trigger.nodeId)) return []
    if (rule.trigger.type === 'node.activated' && deletedIds.has(rule.trigger.nodeId)) return []
    let impossible = false
    rule.conditions.forEach((condition) => {
      if (condition.type !== 'scene.in') return
      condition.sceneIds = condition.sceneIds.filter((id) => !deletedIds.has(id))
      if (condition.sceneIds.length === 0) impossible = true
    })
    const keptActions = rule.actions.filter((step) =>
      !(step.action.type === 'scene.go' && deletedIds.has(step.action.sceneId)),
    )
    if (impossible || keptActions.length === 0) return []
    keptActions[0]!.start = 'after-previous'
    return [{ ...rule, actions: keptActions }]
  })
}

function repairFlowReferences(
  project: CourseProjectDocument,
  deletedIds: ReadonlySet<string>,
): void {
  project.navigationGuards = project.navigationGuards.flatMap((guard) => {
    const toLocationIds = guard.toLocationIds.filter((id) => !deletedIds.has(id))
    if (toLocationIds.length === 0) return []
    return [{
      ...guard,
      toLocationIds,
      fromLocationIds: guard.fromLocationIds?.filter((id) => !deletedIds.has(id)),
    }]
  })
  project.globalInteractions = repairInteractionRules(project.globalInteractions, deletedIds)
  removeDeletedLocationVisibility(project.globalLayerItems, deletedIds)
  project.globalLayerItems.forEach((entry) => removeSceneGoFromController(entry.item, deletedIds))
  project.surfaces.forEach((surface) => {
    removeDeletedLocationVisibility(surface.surfaceLayerItems, deletedIds)
    surface.surfaceLayerItems.forEach((entry) => removeSceneGoFromController(entry.item, deletedIds))
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene) => {
        scene.interactions = repairInteractionRules(scene.interactions, deletedIds)
        scene.layerItems.forEach((item) => removeSceneGoFromController(item, deletedIds))
      })
    }
  })
}

function firstRemainingBlockId(blocks: readonly FlowBlock[]): string | null {
  for (const block of blocks) {
    if (block.type === 'heading') return block.id
    if (block.type === 'section') {
      const nested = firstRemainingBlockId(block.blocks)
      if (nested) return nested
    }
  }
  return blocks[0]?.id ?? null
}

function ensureSurfaceLocation(
  project: CourseProjectDocument,
  surface: Extract<CourseSurfaceDocument, { type: 'flow' }>,
): void {
  const hasLocation = project.locations.some(
    (location) => location.kind === 'flow-block' && location.surfaceId === surface.id,
  )
  if (hasLocation) return
  const blockId = firstRemainingBlockId(surface.blocks)
  if (!blockId) return
  const found = findFlowBlockRecursive(surface.blocks, blockId)
  if (!found) return
  project.locations.push({
    id: found.block.id,
    label: flowBlockLabel(found.block),
    kind: 'flow-block',
    surfaceId: surface.id,
    blockId: found.block.id,
  })
}

/** Atomically deletes one or more Flow blocks and repairs anchors / interaction refs. */
export function deleteFlowEditorBlocks(
  history: CourseHistoryState,
  targets: readonly FlowEditorBlockTarget[],
  now?: string,
): CourseHistoryState {
  if (targets.length === 0) throw new Error('没有可删除的选择')
  const deletedIds = new Set<string>()
  for (const target of targets) {
    const source = resolveFlowBlock(history.present, target)
    flowBlockIds(source.block).forEach((id) => deletedIds.add(id))
  }
  const locationIdsToRemove = new Set(
    history.present.locations
      .filter((location) => location.kind === 'flow-block' && deletedIds.has(location.blockId))
      .map((location) => location.id),
  )
  if (
    history.present.locations.length > 0 &&
    history.present.locations.every((location) => locationIdsToRemove.has(location.id))
  ) {
    const surfaceId = targets[0]!.surfaceId
    const surface = flowSurfaceIn(history.present, surfaceId)
    const remaining = removeBlocksById(surface.blocks, deletedIds)
    if (remaining.length === 0) throw new Error('课程至少需要一个位置')
  }

  const next = updateCourseProject(history.present, (draft) => {
    const bySurface = new Map<string, FlowEditorBlockTarget[]>()
    for (const target of targets) {
      const list = bySurface.get(target.surfaceId) ?? []
      list.push(target)
      bySurface.set(target.surfaceId, list)
    }
    for (const [surfaceId, surfaceTargets] of bySurface) {
      const draftSurface = flowSurfaceIn(draft, surfaceId)
      const ids = new Set<string>()
      for (const target of surfaceTargets) {
        const found = findFlowBlockRecursive(draftSurface.blocks, target.blockId)
        if (!found || (found.parentId ?? null) !== (target.parentId ?? null)) {
          throw new Error('所选 Flow 块位置已变化，请重新选择')
        }
        flowBlockIds(found.block).forEach((id) => ids.add(id))
      }
      draftSurface.blocks = removeBlocksById(draftSurface.blocks, ids)
      draft.locations = draft.locations.filter((location) => !(
        location.kind === 'flow-block' &&
        location.surfaceId === surfaceId &&
        ids.has(location.blockId)
      ))
      ensureSurfaceLocation(draft, draftSurface)
    }
    if (draft.locations.length === 0) throw new Error('课程至少需要一个位置')
    if (!draft.locations.some((location) => location.id === draft.startLocationId)) {
      draft.startLocationId = draft.locations[0]!.id
    }
    repairFlowReferences(draft, new Set([
      ...deletedIds,
      ...locationIdsToRemove,
    ]))
  }, now)
  return commitCourseHistory(history, next)
}

export function indentFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  now?: string,
): CourseHistoryState {
  const source = resolveFlowBlock(history.present, target)
  if (source.index === 0) throw new Error('当前块不能再缩进')
  const previous = source.blocks[source.index - 1]
  if (!previous || previous.type !== 'section') throw new Error('当前块不能再缩进')
  return moveFlowEditorBlock(history, target, {
    parentId: previous.id,
    index: previous.blocks.length,
    surfaceId: target.surfaceId,
  }, now)
}

export function outdentFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  now?: string,
): CourseHistoryState {
  const source = resolveFlowBlock(history.present, target)
  if (source.parentId === null) throw new Error('当前块不能再取消缩进')
  const surface = flowSurfaceIn(history.present, target.surfaceId)
  const parent = findFlowBlockRecursive(surface.blocks, source.parentId)
  if (!parent) throw new Error(`找不到 Flow 分节：${source.parentId}`)
  return moveFlowEditorBlock(history, target, {
    parentId: parent.parentId,
    index: parent.index + 1,
    surfaceId: target.surfaceId,
  }, now)
}

export function describeFlowEditorConstraints(
  project: CourseProjectDocument,
  surfaceId: string,
  blockIds: readonly string[],
): EditorSelectionConstraints {
  const unique = [...new Set(blockIds)]
  if (unique.length === 0) {
    return {
      clipboardAvailable: false,
      canDeleteActiveLocation: project.locations.length > 1,
      canIndent: false,
      canOutdent: false,
      canInsertBefore: false,
      canInsertAfter: true,
      canMoveForward: false,
      canMoveBackward: false,
      canBringFront: false,
      canSendBack: false,
    }
  }
  const locations = unique.map((blockId) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(project, surfaceId).blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    return found
  })
  const sameParent = locations.every((item) => item.parentId === locations[0]!.parentId)
  const minIndex = Math.min(...locations.map((item) => item.index))
  const maxIndex = Math.max(...locations.map((item) => item.index))
  const siblingCount = locations[0]!.blocks.length
  const single = locations[0]!
  const canIndent = unique.length === 1 &&
    single.index > 0 &&
    single.blocks[single.index - 1]?.type === 'section'
  const canOutdent = unique.length === 1 && single.parentId !== null
  return {
    clipboardAvailable: false,
    canDeleteActiveLocation: project.locations.length > 1,
    canIndent,
    canOutdent,
    canInsertBefore: unique.length === 1,
    canInsertAfter: unique.length <= 1,
    canMoveForward: sameParent && minIndex > 0,
    canMoveBackward: sameParent && maxIndex < siblingCount - 1,
    canBringFront: false,
    canSendBack: false,
  }
}

export interface FlowEditorActionOptions {
  readonly now?: string
  readonly insertBlock?: FlowEditorBlockInput
  readonly clipboard?: readonly FlowBlock[]
}

export interface FlowEditorActionResult extends EditorActionAdapterResult {
  readonly history: CourseHistoryState
  readonly clipboard?: readonly FlowBlock[]
}

function failAction(
  history: CourseHistoryState,
  reason: string,
): FlowEditorActionResult {
  return { ok: false, reason, history }
}

function succeedAction(
  history: CourseHistoryState,
  reason: string,
  clipboard?: readonly FlowBlock[],
): FlowEditorActionResult {
  return clipboard
    ? { ok: true, reason, history, clipboard }
    : { ok: true, reason, history }
}

function flowTargetsFromSnapshot(
  project: CourseProjectDocument,
  snapshot: EditorSelectionSnapshot,
): FlowEditorBlockTarget[] | string {
  if (snapshot.surfaceKind !== 'flow') return '当前页面不是 Flow 讲义'
  if (snapshot.owner === 'global') return '全局层选择不能改动 Flow 页面目录'
  const blockIds = snapshot.targets
    .filter((target) => target.owner === 'flow-block')
    .map((target) => target.layerItemId)
  if (blockIds.length === 0) return '没有可操作的 Flow 块'
  try {
    return blockIds.map((blockId) => {
      const found = findFlowBlockRecursive(
        flowSurfaceIn(project, snapshot.surfaceId).blocks,
        blockId,
      )
      if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
      return {
        surfaceId: snapshot.surfaceId,
        blockId: found.block.id,
        parentId: found.parentId,
      }
    })
  } catch (error) {
    return error instanceof Error ? error.message : '找不到 Flow 块'
  }
}

function runChecked(
  history: CourseHistoryState,
  run: () => CourseHistoryState,
  successReason: string,
): FlowEditorActionResult {
  try {
    return succeedAction(run(), successReason)
  } catch (error) {
    return failAction(
      history,
      error instanceof Error && error.message.trim() ? error.message : successReason.replace(/成功.*/, '失败'),
    )
  }
}

/**
 * T02 actionId adapter for Flow. Returns `{ok, reason}` plus the next history
 * for T10. Multi-select writes are one history step.
 */
export function executeFlowEditorAction(
  actionId: EditorActionId,
  snapshot: EditorSelectionSnapshot,
  history: CourseHistoryState,
  options: FlowEditorActionOptions = {},
): FlowEditorActionResult {
  if (snapshot.projectId !== history.present.id) {
    return failAction(history, '选择快照与当前工程不一致')
  }
  const resolved = flowTargetsFromSnapshot(history.present, snapshot)
  if (typeof resolved === 'string') {
    if (actionId === 'insert-after' && snapshot.surfaceKind === 'flow' && snapshot.owner !== 'global') {
      const surface = flowSurfaceIn(history.present, snapshot.surfaceId)
      return runChecked(history, () => insertFlowEditorBlock(history, {
        surfaceId: snapshot.surfaceId,
        parentId: null,
        index: surface.blocks.length,
        block: options.insertBlock ?? defaultInsertBlock(),
        now: options.now,
      }, options.now), '已在后方插入')
    }
    if (actionId === 'paste' && snapshot.surfaceKind === 'flow' && snapshot.owner !== 'global') {
      return pasteFromClipboard(history, {
        surfaceId: snapshot.surfaceId,
        parentId: null,
        index: flowSurfaceIn(history.present, snapshot.surfaceId).blocks.length,
        clipboard: options.clipboard,
        now: options.now,
      })
    }
    return failAction(history, resolved)
  }

  const primary = resolved[0]!
  const now = options.now

  switch (actionId) {
    case 'insert-before':
      if (resolved.length !== 1) return failAction(history, '请一次选择一项后插入')
      return runChecked(history, () => insertFlowEditorBlock(history, {
        surfaceId: primary.surfaceId,
        parentId: primary.parentId,
        index: resolveFlowBlock(history.present, primary).index,
        block: options.insertBlock ?? defaultInsertBlock(),
        now,
      }, now), '已在前方插入')
    case 'insert-after':
      if (resolved.length !== 1) return failAction(history, '请一次选择一项后插入')
      return runChecked(history, () => insertFlowEditorBlock(history, {
        surfaceId: primary.surfaceId,
        parentId: primary.parentId,
        index: resolveFlowBlock(history.present, primary).index + 1,
        block: options.insertBlock ?? defaultInsertBlock(),
        now,
      }, now), '已在后方插入')
    case 'copy': {
      const clipboard = resolved.map((target) =>
        structuredClone(resolveFlowBlock(history.present, target).block),
      )
      return succeedAction(history, '已复制当前选择', clipboard)
    }
    case 'cut': {
      const clipboard = resolved.map((target) =>
        structuredClone(resolveFlowBlock(history.present, target).block),
      )
      const deleted = runChecked(
        history,
        () => deleteFlowEditorBlocks(history, resolved, now),
        '已剪切当前选择',
      )
      return deleted.ok ? { ...deleted, clipboard } : deleted
    }
    case 'paste': {
      const last = resolved[resolved.length - 1]!
      const location = resolveFlowBlock(history.present, last)
      return pasteFromClipboard(history, {
        surfaceId: last.surfaceId,
        parentId: last.parentId,
        index: location.index + 1,
        clipboard: options.clipboard,
        now,
      })
    }
    case 'duplicate':
      return runChecked(
        history,
        () => duplicateFlowEditorBlocks(history, resolved, now),
        '已重复当前选择',
      )
    case 'delete':
      return runChecked(
        history,
        () => deleteFlowEditorBlocks(history, resolved, now),
        '已删除当前选择',
      )
    case 'move-forward':
      return runChecked(history, () => moveResolvedBlocks(history, resolved, -1, now), '已上移')
    case 'move-backward':
      return runChecked(history, () => moveResolvedBlocks(history, resolved, 1, now), '已下移')
    case 'indent':
      if (resolved.length !== 1) return failAction(history, '只有 Flow 块支持缩进')
      return runChecked(history, () => indentFlowEditorBlock(history, primary, now), '已缩进')
    case 'outdent':
      if (resolved.length !== 1) return failAction(history, '只有 Flow 块支持缩进')
      return runChecked(history, () => outdentFlowEditorBlock(history, primary, now), '已取消缩进')
    default:
      return failAction(history, `Flow 不支持该动作：${actionId}`)
  }
}

export function duplicateFlowEditorBlocks(
  history: CourseHistoryState,
  targets: readonly FlowEditorBlockTarget[],
  now?: string,
): CourseHistoryState {
  if (targets.length === 0) throw new Error('没有可重复的选择')
  for (const target of targets) resolveFlowBlock(history.present, target)
  const next = updateCourseProject(history.present, (draft) => {
    const ordered = [...targets]
      .map((target) => ({
        target,
        location: findFlowBlockRecursive(flowSurfaceIn(draft, target.surfaceId).blocks, target.blockId),
      }))
      .sort((left, right) => (right.location?.index ?? 0) - (left.location?.index ?? 0))
    for (const item of ordered) {
      const found = item.location
      if (!found || (found.parentId ?? null) !== (item.target.parentId ?? null)) {
        throw new Error('所选 Flow 块位置已变化，请重新选择')
      }
      const duplicate = regenerateFlowIdentities(found.block)
      found.blocks.splice(found.index + 1, 0, duplicate)
      appendFlowLocations(draft, item.target.surfaceId, duplicate)
    }
  }, now)
  return commitCourseHistory(history, next)
}

function moveResolvedBlocks(
  history: CourseHistoryState,
  targets: readonly FlowEditorBlockTarget[],
  delta: -1 | 1,
  now?: string,
): CourseHistoryState {
  const locations = targets.map((target) => ({
    target,
    location: resolveFlowBlock(history.present, target),
  }))
  const parentId = locations[0]!.location.parentId
  if (locations.some((item) => item.location.parentId !== parentId)) {
    throw new Error('请选择同一层级的内容块后再移动')
  }
  const ordered = [...locations].sort((left, right) => left.location.index - right.location.index)
  if (delta < 0 && ordered[0]!.location.index === 0) {
    throw new Error('已经位于最前，不能再前移')
  }
  const last = ordered[ordered.length - 1]!
  if (delta > 0 && last.location.index >= last.location.blocks.length - 1) {
    throw new Error('已经位于最后，不能再后移')
  }
  const selectedIds = new Set(targets.map((target) => target.blockId))
  const next = updateCourseProject(history.present, (draft) => {
    const draftSurface = flowSurfaceIn(draft, targets[0]!.surfaceId)
    const first = findFlowBlockRecursive(draftSurface.blocks, ordered[0]!.target.blockId)
    if (!first) throw new Error('所选 Flow 块位置已变化，请重新选择')
    const siblings = first.blocks
    const selected = siblings.filter((block) => selectedIds.has(block.id))
    const rest = siblings.filter((block) => !selectedIds.has(block.id))
    const insertAt = Math.max(0, Math.min(ordered[0]!.location.index + delta, rest.length))
    siblings.splice(0, siblings.length, ...rest.slice(0, insertAt), ...selected, ...rest.slice(insertAt))
  }, now)
  return commitCourseHistory(history, next)
}

function pasteFromClipboard(
  history: CourseHistoryState,
  input: {
    readonly surfaceId: string
    readonly parentId: string | null
    readonly index: number
    readonly clipboard: readonly FlowBlock[] | undefined
    readonly now?: string
  },
): FlowEditorActionResult {
  if (!input.clipboard || input.clipboard.length === 0) {
    return failAction(history, '剪贴板为空，无法粘贴')
  }
  return runChecked(
    history,
    () => pasteFlowEditorBlocks(history, {
      surfaceId: input.surfaceId,
      parentId: input.parentId,
      index: input.index,
      blocks: input.clipboard!,
      now: input.now,
    }),
    `已粘贴 ${input.clipboard.length} 项`,
  )
}

export function pasteFlowEditorBlocks(
  history: CourseHistoryState,
  input: {
    readonly surfaceId: string
    readonly parentId: string | null
    readonly index: number
    readonly blocks: readonly FlowBlock[]
    readonly now?: string
  },
): CourseHistoryState {
  if (input.blocks.length === 0) throw new Error('剪贴板为空，无法粘贴')
  const next = updateCourseProject(history.present, (draft) => {
    const draftSurface = flowSurfaceIn(draft, input.surfaceId)
    let targetBlocks: FlowBlock[]
    if (input.parentId === null) {
      targetBlocks = draftSurface.blocks
    } else {
      const section = findFlowBlockRecursive(draftSurface.blocks, input.parentId)
      if (!section || section.block.type !== 'section') {
        throw new Error(`找不到 Flow 分节：${input.parentId}`)
      }
      targetBlocks = section.block.blocks
    }
    const clones = input.blocks.map(regenerateFlowIdentities)
    const insertAt = Math.max(0, Math.min(input.index, targetBlocks.length))
    targetBlocks.splice(insertAt, 0, ...clones)
    clones.forEach((block) => appendFlowLocations(draft, input.surfaceId, block))
  }, input.now)
  return commitCourseHistory(history, next)
}

export function createFlowEditorActionAdapter(options: {
  getHistory(): CourseHistoryState
  setHistory(history: CourseHistoryState): void
  now?: () => string
  insertBlock?: () => FlowEditorBlockInput
  getClipboard?: () => readonly FlowBlock[] | undefined
  setClipboard?: (clipboard: readonly FlowBlock[]) => void
}): EditorActionAdapter {
  return {
    execute(actionId, snapshot) {
      const result = executeFlowEditorAction(actionId, snapshot, options.getHistory(), {
        now: options.now?.(),
        insertBlock: options.insertBlock?.(),
        clipboard: options.getClipboard?.(),
      })
      if (result.clipboard) options.setClipboard?.(result.clipboard)
      if (result.ok && result.history !== options.getHistory()) {
        options.setHistory(result.history)
      }
      return { ok: result.ok, reason: result.reason }
    },
  }
}
