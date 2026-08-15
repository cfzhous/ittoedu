import { nanoid } from 'nanoid'
import type {
  CourseProjectDocument,
  FlowBlock,
  FlowSurfaceDocument,
} from '../../shared/courseProjectTypes'
import {
  commitCourseHistory,
  type CourseHistoryState,
  deleteFlowBlock,
  deleteNestedFlowBlock,
  duplicateFlowBlock,
  duplicateNestedFlowBlock,
  reorderFlowBlock,
  reorderNestedFlowBlock,
  updateCourseProject,
  updateFlowBlock,
  updateNestedFlowBlock,
} from './courseStudioModel'
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
  const source = resolveFlowBlock(history.present, target)
  const project = history.present
  const deletedIds = new Set(flowBlockIds(source.block))
  if (project.locations.length > 0 && project.locations.every((location) => deletedIds.has(location.id))) {
    throw new Error('课程至少需要一个位置')
  }
  const next = target.parentId === null
    ? deleteFlowBlock(project, target.surfaceId, target.blockId, now)
    : deleteNestedFlowBlock(project, target.surfaceId, target.blockId, now)
  return commitCourseHistory(history, next)
}

/** Duplicates a Flow block after its source; block and list-item ids are regenerated. */
export function duplicateFlowEditorBlock(
  history: CourseHistoryState,
  target: FlowEditorBlockTarget,
  now?: string,
): CourseHistoryState {
  resolveFlowBlock(history.present, target)
  const project = history.present
  const next = target.parentId === null
    ? duplicateFlowBlock(project, target.surfaceId, target.blockId, now)
    : duplicateNestedFlowBlock(project, target.surfaceId, target.blockId, now)
  return commitCourseHistory(history, next)
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
