import { describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceSlidePreviewProject,
  resolveWorkspaceSlideAuthoringInput,
  type WorkspaceSlideAuthoringInput,
} from '@/renderer/ui/workspaceSlideAuthoring'
import { createProject, createTextNode } from '@/renderer/project/createProject'
import type { SceneDocument } from '@/shared/projectTypes'

function input(
  name: string,
  nodes: SceneDocument['nodes'] = [],
): {
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
    nodes,
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

  it('projects the injected scene into a read-only Player payload', () => {
    const project = createProject({
      id: 'v8-shell-project',
      now: '2026-08-15T03:00:00.000Z',
      includeDefaultController: false,
      controls: 'none',
    })
    const sceneId = project.scenes[0]!.id
    const text = createTextNode({
      id: 'v9-text',
      text: 'V9 可见文字',
      x: 440,
      y: 320,
    })
    const injected = input('injected', [text])
    const before = structuredClone(project)

    const preview = createWorkspaceSlidePreviewProject(
      project,
      sceneId,
      injected.value,
    )

    expect(preview).not.toBe(project)
    expect(preview.scenes[0]).toMatchObject({
      id: sceneId,
      nodes: [{ id: 'v9-text', text: 'V9 可见文字', x: 440, y: 320 }],
    })
    expect(preview.scenes[0]!.nodes[0]).not.toBe(text)
    expect(preview.globalLayer).toBe(project.globalLayer)
    expect(project).toEqual(before)
    expect(createWorkspaceSlidePreviewProject(project, sceneId, undefined)).toBe(project)
    expect(() => createWorkspaceSlidePreviewProject(
      project,
      'missing-scene',
      injected.value,
    )).toThrow('Player 预览场景不存在')
  })
})
