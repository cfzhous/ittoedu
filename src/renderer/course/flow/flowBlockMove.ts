import type { FlowBlock } from '../../../shared/courseProjectTypes'

/**
 * A semantic Flow move address. `targetIndex` is the final index in the
 * destination list after the moving block has been removed from its source.
 */
export interface FlowBlockMoveRequest {
  blockId: string
  targetParentId: string | null
  targetIndex: number
}

interface FlowBlockLocation {
  block: FlowBlock
  blocks: FlowBlock[]
  parentId: string | null
  index: number
}

interface InspectedFlowBlockMove {
  source: FlowBlockLocation
  destination: FlowBlock[]
  noOp: boolean
}

function findFlowBlockLocation(
  blocks: FlowBlock[],
  blockId: string,
  parentId: string | null = null,
): FlowBlockLocation | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!
    if (block.id === blockId) return { block, blocks, parentId, index }
    if (block.type === 'section') {
      const nested = findFlowBlockLocation(block.blocks, blockId, block.id)
      if (nested) return nested
    }
  }
  return null
}

function descendantContains(block: FlowBlock, blockId: string): boolean {
  if (block.type !== 'section') return false
  return block.blocks.some((child) => (
    child.id === blockId || descendantContains(child, blockId)
  ))
}

function destinationBlocks(
  blocks: FlowBlock[],
  targetParentId: string | null,
): FlowBlock[] {
  if (targetParentId === null) return blocks
  const parent = findFlowBlockLocation(blocks, targetParentId)
  if (!parent || parent.block.type !== 'section') {
    throw new Error(`找不到 Flow 目标分节：${targetParentId}`)
  }
  return parent.block.blocks
}

function inspectFlowBlockMove(
  blocks: FlowBlock[],
  request: FlowBlockMoveRequest,
): InspectedFlowBlockMove {
  const source = findFlowBlockLocation(blocks, request.blockId)
  if (!source) throw new Error(`找不到 Flow 块：${request.blockId}`)
  if (
    request.targetParentId === source.block.id ||
    (request.targetParentId !== null && descendantContains(source.block, request.targetParentId))
  ) {
    throw new Error('不能把分节移入自身或它的子分节')
  }
  const destination = destinationBlocks(blocks, request.targetParentId)
  const destinationLengthAfterRemoval = destination.length - (destination === source.blocks ? 1 : 0)
  if (
    !Number.isInteger(request.targetIndex) ||
    request.targetIndex < 0 ||
    request.targetIndex > destinationLengthAfterRemoval
  ) {
    throw new Error(`Flow 目标位置无效：${request.targetIndex}`)
  }
  return {
    source,
    destination,
    noOp: destination === source.blocks && request.targetIndex === source.index,
  }
}

/**
 * Converts a visual slot (the gap before item N in the pre-move list) into a
 * stable move request whose index is unambiguous after source removal.
 */
export function createFlowBlockMoveRequest(
  blocks: FlowBlock[],
  blockId: string,
  targetParentId: string | null,
  targetSlotIndex: number,
): FlowBlockMoveRequest | null {
  const source = findFlowBlockLocation(blocks, blockId)
  if (!source) throw new Error(`找不到 Flow 块：${blockId}`)
  if (
    targetParentId === source.block.id ||
    (targetParentId !== null && descendantContains(source.block, targetParentId))
  ) {
    throw new Error('不能把分节移入自身或它的子分节')
  }
  const destination = destinationBlocks(blocks, targetParentId)
  if (!Number.isInteger(targetSlotIndex) || targetSlotIndex < 0 || targetSlotIndex > destination.length) {
    throw new Error(`Flow 放置槽位无效：${targetSlotIndex}`)
  }
  const targetIndex = destination === source.blocks && source.index < targetSlotIndex
    ? targetSlotIndex - 1
    : targetSlotIndex
  const request = { blockId, targetParentId, targetIndex }
  return inspectFlowBlockMove(blocks, request).noOp ? null : request
}

export function isFlowBlockMoveNoOp(
  blocks: FlowBlock[],
  request: FlowBlockMoveRequest,
): boolean {
  return inspectFlowBlockMove(blocks, request).noOp
}

/** Mutates one already-cloned V9 Flow tree and preserves every block id. */
export function moveFlowBlockInPlace(
  blocks: FlowBlock[],
  request: FlowBlockMoveRequest,
): void {
  const inspected = inspectFlowBlockMove(blocks, request)
  if (inspected.noOp) return
  const [block] = inspected.source.blocks.splice(inspected.source.index, 1)
  inspected.destination.splice(request.targetIndex, 0, block!)
}

export function flowBlockIdsInDocumentOrder(blocks: readonly FlowBlock[]): string[] {
  return blocks.flatMap((block) => [
    block.id,
    ...(block.type === 'section' ? flowBlockIdsInDocumentOrder(block.blocks) : []),
  ])
}
