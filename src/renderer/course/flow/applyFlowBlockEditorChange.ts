import type {
  CourseProjectDocument,
  FlowBlock,
} from '../../../shared/courseProjectTypes'
import {
  deleteNestedFlowBlock,
  insertNestedFlowBlock,
  reorderNestedFlowBlock,
  updateNestedFlowBlock,
} from '../courseStudioModel'

function sameFlowBlock(left: FlowBlock, right: FlowBlock): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Applies one editor result through the existing V9 model operations. The
 * calling UI can record the returned project as one history entry, while
 * nested section insert/delete/reorder operations maintain course locations.
 */
export function applyFlowBlockEditorChange(
  project: CourseProjectDocument,
  surfaceId: string,
  previous: FlowBlock,
  next: FlowBlock,
): CourseProjectDocument {
  if (previous.id !== next.id || previous.type !== next.type) {
    throw new Error('Flow 编辑器不能改变内容块的稳定 ID 或类型。')
  }
  if (sameFlowBlock(previous, next)) return project
  if (previous.type !== 'section' || next.type !== 'section') {
    return updateNestedFlowBlock(project, surfaceId, previous.id, (draft) => {
      if (draft.id !== next.id || draft.type !== next.type) {
        throw new Error('Flow 内容块已变化，请重新选择后再编辑。')
      }
      Object.assign(draft, structuredClone(next))
    })
  }

  let current = project
  if (
    previous.title !== next.title ||
    previous.collapsedByDefault !== next.collapsedByDefault
  ) {
    current = updateNestedFlowBlock(current, surfaceId, previous.id, (draft) => {
      if (draft.type !== 'section') throw new Error('所选 Flow 分节已失效。')
      draft.title = next.title
      draft.collapsedByDefault = next.collapsedByDefault
    })
  }

  const nextIds = new Set(next.blocks.map((block) => block.id))
  const previousById = new Map(previous.blocks.map((block) => [block.id, block]))
  let currentOrder = previous.blocks.map((block) => block.id)
  for (const child of previous.blocks) {
    if (nextIds.has(child.id)) continue
    current = deleteNestedFlowBlock(current, surfaceId, child.id)
    currentOrder = currentOrder.filter((id) => id !== child.id)
  }

  for (const child of next.blocks) {
    const previousChild = previousById.get(child.id)
    if (previousChild) {
      current = applyFlowBlockEditorChange(current, surfaceId, previousChild, child)
    } else {
      current = insertNestedFlowBlock(current, surfaceId, previous.id, child)
      currentOrder.push(child.id)
    }
  }

  next.blocks.forEach((child, targetIndex) => {
    const currentIndex = currentOrder.indexOf(child.id)
    if (currentIndex === targetIndex) return
    current = reorderNestedFlowBlock(current, surfaceId, child.id, targetIndex)
    currentOrder = currentOrder.filter((id) => id !== child.id)
    currentOrder.splice(targetIndex, 0, child.id)
  })
  return current
}
