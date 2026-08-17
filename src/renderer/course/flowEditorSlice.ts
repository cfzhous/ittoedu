import type {
  CourseProjectDocument,
  FlowBlock,
  FlowSurfaceDocument,
} from '../../shared/courseProjectTypes'

/**
 * Stable editor-only Flow identities. They are never persisted in the project
 * or history; the project locations/blocks remain the single source of truth.
 */
export interface FlowEditorSelection {
  readonly locationId: string
  readonly surfaceId: string
  readonly selectedBlockId: string
  readonly selectedBlockIds: readonly string[]
}

/** A block target whose parent is `null` for top-level blocks or a section id. */
export interface FlowEditorBlockTarget {
  readonly surfaceId: string
  readonly blockId: string
  readonly parentId: string | null
}

interface FlowBlockLocation {
  blocks: FlowBlock[]
  index: number
  block: FlowBlock
  parentId: string | null
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

function countFlowBlockId(
  blocks: FlowBlock[],
  blockId: string,
): number {
  let count = 0
  const visit = (items: FlowBlock[]): void => {
    items.forEach((block) => {
      if (block.id === blockId) count += 1
      if (block.type === 'section') visit(block.blocks)
    })
  }
  visit(blocks)
  return count
}

function validateBlockIdUnique(
  surface: FlowSurfaceDocument,
  blockId: string,
): void {
  const count = countFlowBlockId(surface.blocks, blockId)
  if (count === 0) throw new Error(`找不到 Flow 块：${blockId}`)
  if (count > 1) throw new Error(`Flow 块 ID 重复：${blockId}`)
}

function assertNonEmpty(value: string, message: string): void {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message)
}

function freezeSelection(selection: FlowEditorSelection): FlowEditorSelection {
  const selectedBlockIds = Object.freeze(
    selection.selectedBlockIds.length > 0
      ? [...selection.selectedBlockIds]
      : [selection.selectedBlockId],
  )
  return Object.freeze({
    locationId: selection.locationId,
    surfaceId: selection.surfaceId,
    selectedBlockId: selection.selectedBlockId,
    selectedBlockIds,
  })
}

/**
 * Creates an editor-only Flow selection from explicit fields. Callers that
 * already resolved the project should prefer `selectFlowEditorBlock`.
 */
export function createFlowEditorSelection(
  locationId: string,
  surfaceId: string,
  selectedBlockId: string,
): FlowEditorSelection
export function createFlowEditorSelection(
  project: CourseProjectDocument,
  locationId: string,
  blockId: string,
): FlowEditorSelection
export function createFlowEditorSelection(
  projectOrLocationId: CourseProjectDocument | string,
  locationIdOrSurfaceId: string,
  selectedBlockId: string,
): FlowEditorSelection {
  if (typeof projectOrLocationId === 'string') {
    assertNonEmpty(projectOrLocationId, '课程位置不能为空')
    assertNonEmpty(locationIdOrSurfaceId, 'Flow 表面不能为空')
    assertNonEmpty(selectedBlockId, '所选 Flow 块不能为空')
    return freezeSelection({
      locationId: projectOrLocationId,
      surfaceId: locationIdOrSurfaceId,
      selectedBlockId,
      selectedBlockIds: [selectedBlockId],
    })
  }
  return selectFlowEditorBlock(
    projectOrLocationId,
    locationIdOrSurfaceId,
    selectedBlockId,
  )
}

/**
 * Validates a Flow block selection against the current project. Stale or
 * duplicated location/block ids are rejected with teacher-safe messages.
 */
export function selectFlowEditorBlock(
  project: CourseProjectDocument,
  locationId: string,
  blockId: string,
): FlowEditorSelection {
  assertNonEmpty(locationId, '课程位置不能为空')
  assertNonEmpty(blockId, '所选 Flow 块不能为空')

  const matches = project.locations.filter((candidate) => candidate.id === locationId)
  if (matches.length === 0) throw new Error(`找不到课程位置：${locationId}`)
  if (matches.length > 1) throw new Error(`课程位置 ID 重复：${locationId}`)
  const location = matches[0]!
  if (location.kind !== 'flow-block') {
    throw new Error('当前课程位置不是 Flow 内容块，请重新选择')
  }
  return selectFlowEditorBlocks(project, locationId, [blockId])
}

/**
 * Editor-only multi-select. The course location stays the page/heading anchor;
 * ordinary blocks are selected without becoming course-level nodes.
 */
export function selectFlowEditorBlocks(
  project: CourseProjectDocument,
  locationId: string,
  blockIds: readonly string[],
): FlowEditorSelection {
  assertNonEmpty(locationId, '课程位置不能为空')
  if (blockIds.length === 0) throw new Error('所选 Flow 块不能为空')

  const matches = project.locations.filter((candidate) => candidate.id === locationId)
  if (matches.length === 0) throw new Error(`找不到课程位置：${locationId}`)
  if (matches.length > 1) throw new Error(`课程位置 ID 重复：${locationId}`)
  const location = matches[0]!
  if (location.kind !== 'flow-block') {
    throw new Error('当前课程位置不是 Flow 内容块，请重新选择')
  }
  const surface = flowSurfaceIn(project, location.surfaceId)
  const uniqueIds: string[] = []
  const seen = new Set<string>()
  for (const blockId of blockIds) {
    assertNonEmpty(blockId, '所选 Flow 块不能为空')
    if (seen.has(blockId)) throw new Error(`所选 Flow 块重复：${blockId}`)
    seen.add(blockId)
    validateBlockIdUnique(surface, blockId)
    const found = findFlowBlockRecursive(surface.blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    uniqueIds.push(found.block.id)
  }

  return freezeSelection({
    locationId,
    surfaceId: location.surfaceId,
    selectedBlockId: uniqueIds[uniqueIds.length - 1]!,
    selectedBlockIds: uniqueIds,
  })
}
