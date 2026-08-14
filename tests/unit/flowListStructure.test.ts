import { describe, expect, it } from 'vitest'
import {
  canIndentFlowListItem,
  changeFlowListItemIndent,
  flowListItemsToTree,
} from '@/shared/flowListStructure'

describe('Flow list tree structure', () => {
  it('disables indent when any descendant already uses the deepest level', () => {
    const items = [
      { id: 'A', text: 'A', level: 0 },
      { id: 'B', text: 'B', level: 1 },
      { id: 'C', text: 'C', level: 2 },
      { id: 'D', text: 'D', level: 3 },
      { id: 'E', text: 'E', level: 4 },
      { id: 'F', text: 'F', level: 5 },
      { id: 'G', text: 'G', level: 1 },
      { id: 'H', text: 'H', level: 2 },
      { id: 'I', text: 'I', level: 3 },
      { id: 'J', text: 'J', level: 4 },
      { id: 'K', text: 'K', level: 5 },
    ] as const
    expect(canIndentFlowListItem(items, 6)).toBe(false)
    expect(changeFlowListItemIndent(items, 6, 'indent')).toEqual(items)
  })

  it('keeps later siblings with their original parent when outdenting a subtree', () => {
    const result = changeFlowListItemIndent([
      { id: 'A', text: 'A', level: 0 },
      { id: 'B', text: 'B', level: 1 },
      { id: 'C', text: 'C', level: 2 },
      { id: 'D', text: 'D', level: 1 },
    ], 1, 'outdent')

    expect(result.map(({ id, level }) => `${id}${level}`)).toEqual([
      'A0',
      'D1',
      'B0',
      'C1',
    ])
    const tree = flowListItemsToTree(result)
    expect(tree.map((node) => node.item.id)).toEqual(['A', 'B'])
    expect(tree[0]!.children.map((node) => node.item.id)).toEqual(['D'])
    expect(tree[1]!.children.map((node) => node.item.id)).toEqual(['C'])
  })
})
