import type { FlowListBlock } from './courseProjectTypes'

export type FlowListItem = FlowListBlock['items'][number]

export interface FlowListTreeNode {
  item: FlowListItem
  children: FlowListTreeNode[]
}

/**
 * Converts the protocol's compact, ordered outline into a semantic tree.
 * Course Project validation guarantees that the first item is level 0 and
 * that a following item never skips more than one level.
 */
export function flowListItemsToTree(
  items: readonly FlowListItem[],
): FlowListTreeNode[] {
  const roots: FlowListTreeNode[] = []
  const latestAtLevel: FlowListTreeNode[] = []
  for (const source of items) {
    const node: FlowListTreeNode = {
      item: structuredClone(source),
      children: [],
    }
    if (source.level === 0) {
      roots.push(node)
    } else {
      const parent = latestAtLevel[source.level - 1]
      if (!parent) throw new Error(`列表项“${source.id}”缺少上一级项目。`)
      parent.children.push(node)
    }
    latestAtLevel[source.level] = node
    latestAtLevel.length = source.level + 1
  }
  return roots
}

export function flowListSubtreeEnd(
  items: readonly FlowListItem[],
  startIndex: number,
): number {
  const level = items[startIndex]?.level
  if (level === undefined) return startIndex
  let end = startIndex + 1
  while (end < items.length && items[end]!.level > level) end += 1
  return end
}

export function canIndentFlowListItem(
  items: readonly FlowListItem[],
  index: number,
): boolean {
  const item = items[index]
  const previous = items[index - 1]
  if (!item || !previous || previous.level < item.level) return false
  const subtreeEnd = flowListSubtreeEnd(items, index)
  return items.slice(index, subtreeEnd).every((entry) => entry.level < 5)
}

export function changeFlowListItemIndent(
  items: readonly FlowListItem[],
  index: number,
  direction: 'indent' | 'outdent',
): FlowListItem[] {
  const item = items[index]
  if (!item) return items.map((entry) => ({ ...entry }))
  if (direction === 'indent' && !canIndentFlowListItem(items, index)) return items.map((entry) => ({ ...entry }))
  if (direction === 'outdent' && item.level === 0) return items.map((entry) => ({ ...entry }))

  if (direction === 'outdent') {
    const roots = flowListItemsToTree(items)
    const position = findFlowListTreePositionAtIndex(roots, index)
    const parent = position?.parent
    if (!position || !parent) return items.map((entry) => ({ ...entry }))

    // Outdent is a tree operation, not just a level decrement. Detach the
    // selected subtree from its parent, then place it after that parent. This
    // keeps later siblings attached to their original parent instead of
    // silently making them children of the outdented item.
    position.siblings.splice(position.index, 1)
    parent.siblings.splice(parent.index + 1, 0, position.node)
    return flattenFlowListTree(roots)
  }

  const end = flowListSubtreeEnd(items, index)
  return items.map((entry, entryIndex) => (
    entryIndex >= index && entryIndex < end
      ? { ...entry, level: (entry.level + 1) as FlowListItem['level'] }
      : { ...entry }
  ))
}

interface FlowListTreePosition {
  node: FlowListTreeNode
  siblings: FlowListTreeNode[]
  index: number
  parent?: FlowListTreePosition
}

function findFlowListTreePositionAtIndex(
  siblings: FlowListTreeNode[],
  targetIndex: number,
  parent?: FlowListTreePosition,
  cursor = { value: 0 },
): FlowListTreePosition | undefined {
  for (let index = 0; index < siblings.length; index += 1) {
    const node = siblings[index]!
    const position: FlowListTreePosition = { node, siblings, index, parent }
    if (cursor.value === targetIndex) return position
    cursor.value += 1
    const descendant = findFlowListTreePositionAtIndex(
      node.children,
      targetIndex,
      position,
      cursor,
    )
    if (descendant) return descendant
  }
  return undefined
}

function flattenFlowListTree(
  nodes: readonly FlowListTreeNode[],
  level = 0,
): FlowListItem[] {
  return nodes.flatMap((node) => [
    { ...node.item, level: level as FlowListItem['level'] },
    ...flattenFlowListTree(node.children, level + 1),
  ])
}

function previousSiblingIndex(items: readonly FlowListItem[], index: number): number {
  const item = items[index]
  if (!item) return -1
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = items[cursor]!
    if (candidate.level < item.level) return -1
    if (candidate.level === item.level) return cursor
  }
  return -1
}

function nextSiblingIndex(items: readonly FlowListItem[], index: number): number {
  const item = items[index]
  if (!item) return -1
  for (let cursor = flowListSubtreeEnd(items, index); cursor < items.length; cursor += 1) {
    const candidate = items[cursor]!
    if (candidate.level < item.level) return -1
    if (candidate.level === item.level) return cursor
  }
  return -1
}

export function canMoveFlowListItem(
  items: readonly FlowListItem[],
  index: number,
  direction: 'up' | 'down',
): boolean {
  return (direction === 'up' ? previousSiblingIndex(items, index) : nextSiblingIndex(items, index)) >= 0
}

/** Moves one item together with all of its descendants. */
export function moveFlowListItem(
  items: readonly FlowListItem[],
  index: number,
  direction: 'up' | 'down',
): FlowListItem[] {
  const siblingIndex = direction === 'up'
    ? previousSiblingIndex(items, index)
    : nextSiblingIndex(items, index)
  if (siblingIndex < 0) return items.map((entry) => ({ ...entry }))
  const sourceEnd = flowListSubtreeEnd(items, index)
  const source = items.slice(index, sourceEnd)
  if (direction === 'up') {
    return [
      ...items.slice(0, siblingIndex),
      ...source,
      ...items.slice(siblingIndex, index),
      ...items.slice(sourceEnd),
    ].map((entry) => ({ ...entry }))
  }
  const siblingEnd = flowListSubtreeEnd(items, siblingIndex)
  return [
    ...items.slice(0, index),
    ...items.slice(sourceEnd, siblingEnd),
    ...source,
    ...items.slice(siblingEnd),
  ].map((entry) => ({ ...entry }))
}
