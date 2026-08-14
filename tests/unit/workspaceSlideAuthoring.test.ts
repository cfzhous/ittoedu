import { describe, expect, it, vi } from 'vitest'
import {
  resolveWorkspaceSlideAuthoringInput,
  type WorkspaceSlideAuthoringInput,
} from '@/renderer/ui/workspaceSlideAuthoring'
import type { SceneDocument } from '@/shared/projectTypes'

function input(name: string): {
  value: WorkspaceSlideAuthoringInput
  onSelectionChange: ReturnType<typeof vi.fn>
  onMoveEnd: ReturnType<typeof vi.fn>
} {
  const onSelectionChange = vi.fn()
  const onMoveEnd = vi.fn()
  const document: SceneDocument = {
    id: `scene-${name}`,
    name,
    backgroundColor: '#ffffff',
    nodes: [],
    interactions: [],
  }
  const value = Object.freeze({
    document,
    componentPackages: {},
    selectedNodeIds: Object.freeze([`node-${name}`]),
    onSelectionChange,
    onMoveEnd,
  })
  return { value, onSelectionChange, onMoveEnd }
}

describe('Workspace Slide authoring input boundary', () => {
  it('uses the complete V8 fallback when no input is injected', () => {
    const fallback = input('fallback')
    const before = JSON.stringify(fallback.value)
    const resolved = resolveWorkspaceSlideAuthoringInput(fallback.value, undefined)

    expect(resolved).toBe(fallback.value)
    resolved.onSelectionChange({ nodeIds: ['node-a'], additive: true })
    resolved.onMoveEnd({ nodes: [{ nodeId: 'node-a', x: 10, y: 20 }] })
    expect(fallback.onSelectionChange).toHaveBeenCalledWith({
      nodeIds: ['node-a'],
      additive: true,
    })
    expect(fallback.onMoveEnd).toHaveBeenCalledWith({
      nodes: [{ nodeId: 'node-a', x: 10, y: 20 }],
    })
    expect(JSON.stringify(fallback.value)).toBe(before)
  })

  it('selects only the complete injected backend without merging callbacks', () => {
    const fallback = input('fallback')
    const injected = input('injected')
    const fallbackBefore = JSON.stringify(fallback.value)
    const injectedBefore = JSON.stringify(injected.value)
    const resolved = resolveWorkspaceSlideAuthoringInput(fallback.value, injected.value)

    expect(resolved).toBe(injected.value)
    expect(resolved.document).toBe(injected.value.document)
    expect(resolved.componentPackages).toBe(injected.value.componentPackages)
    expect(resolved.selectedNodeIds).toBe(injected.value.selectedNodeIds)

    resolved.onSelectionChange({ nodeIds: ['node-injected'], additive: false })
    resolved.onMoveEnd({ nodes: [{ nodeId: 'node-injected', x: 30, y: 40 }] })
    expect(injected.onSelectionChange).toHaveBeenCalledTimes(1)
    expect(injected.onMoveEnd).toHaveBeenCalledTimes(1)
    expect(fallback.onSelectionChange).not.toHaveBeenCalled()
    expect(fallback.onMoveEnd).not.toHaveBeenCalled()
    expect(JSON.stringify(fallback.value)).toBe(fallbackBefore)
    expect(JSON.stringify(injected.value)).toBe(injectedBefore)
  })
})
