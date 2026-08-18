import { describe, expect, it } from 'vitest'
import type { SceneNode } from '@/shared/projectTypes'
import {
  buildSlidePreviewRebuildKey,
  slidePreviewComponentPackageFingerprint,
  type SlidePreviewRebuildKeyInput,
  type SlidePreviewRebuildScene,
} from '@/renderer/ui/workspaceSlidePreviewRebuild'

/**
 * Proves Slide isolated-Player rebuild keys follow scene/global/asset/package
 * structure, not `project` / `componentPackages` / `assetFiles` object identity.
 * Does not prove Workspace, Electron, or a live iframe.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clonePlainObject(value: unknown): unknown {
  return isPlainObject(value) ? { ...value } : value
}

function scene(
  id: string,
  nodeIds: readonly string[] = ['n1'],
): SlidePreviewRebuildScene {
  return {
    id,
    nodes: nodeIds.map((nodeId) => ({
      id: nodeId,
      type: 'text' satisfies SceneNode['type'],
    })),
    presentation: { states: [{ id: `${id}-state` }] },
    runtime: { runtimeApiVersion: 2 as const, source: 'runtime-a' },
  }
}

function input(
  overrides: Partial<SlidePreviewRebuildKeyInput> = {},
): SlidePreviewRebuildKeyInput {
  const current = scene('scene-1')
  return {
    canvasMode: 'edit',
    editingScope: 'scene',
    activePresentationStateId: 'scene-1-state',
    scene: current,
    scenes: [current, scene('scene-2', ['n2'])],
    globalLayer: [{
      node: { id: 'g1', type: 'teacher-controller' satisfies SceneNode['type'] },
      layer: 'overlay',
      visibility: { mode: 'all', sceneIds: [] },
    }],
    globalRuntime: null,
    assets: {
      'asset-photo': {
        id: 'asset-photo',
        kind: 'image',
        byteLength: 8,
        path: 'assets/photo.png',
      },
    },
    candidateGlobals: null,
    candidateAssets: null,
    sidecarFileIds: ['asset-photo'],
    componentPackages: {
      'pkg-clock': {
        manifest: { id: 'pkg-clock', version: '1.0.0' },
      },
    },
    ...overrides,
  }
}

describe('buildSlidePreviewRebuildKey', () => {
  it('stays equal when project, packages, and asset files are new identities of the same structure', () => {
    const left = input()
    const right = input({
      scene: { ...left.scene, nodes: left.scene.nodes.map((node) => ({ ...node })) },
      scenes: left.scenes.map((item) => ({
        ...item,
        nodes: item.nodes.map((node) => ({ ...node })),
      })),
      globalLayer: left.globalLayer.map((item) => ({
        ...item,
        node: { ...item.node },
        visibility: clonePlainObject(item.visibility),
      })),
      assets: { ...left.assets, 'asset-photo': { ...left.assets['asset-photo']! } },
      sidecarFileIds: [...left.sidecarFileIds],
      componentPackages: {
        'pkg-clock': {
          manifest: { id: 'pkg-clock', version: '1.0.0' },
        },
      },
    })

    expect(buildSlidePreviewRebuildKey(left)).toBe(buildSlidePreviewRebuildKey(right))
    expect(JSON.stringify(left.componentPackages)).toBe(JSON.stringify(right.componentPackages))
    expect(left.componentPackages).not.toBe(right.componentPackages)
    expect(left.scene).not.toBe(right.scene)
    expect(left.assets).not.toBe(right.assets)
  })

  it('changes when the scene, node set, runtime, asset set, or package set changes', () => {
    const baseline = buildSlidePreviewRebuildKey(input())

    expect(
      buildSlidePreviewRebuildKey(input({ scene: scene('scene-2', ['n2']) })),
    ).not.toBe(baseline)

    expect(
      buildSlidePreviewRebuildKey(input({
        scene: scene('scene-1', ['n1', 'n-added']),
      })),
    ).not.toBe(baseline)

    expect(
      buildSlidePreviewRebuildKey(input({
        scene: { ...scene('scene-1'), runtime: { runtimeApiVersion: 2, source: 'runtime-b' } },
      })),
    ).not.toBe(baseline)

    expect(
      buildSlidePreviewRebuildKey(input({
        sidecarFileIds: ['asset-photo', 'asset-new'],
        assets: {
          'asset-photo': {
            id: 'asset-photo',
            kind: 'image',
            byteLength: 8,
            path: 'assets/photo.png',
          },
          'asset-new': {
            id: 'asset-new',
            kind: 'image',
            byteLength: 4,
            path: 'assets/new.png',
          },
        },
      })),
    ).not.toBe(baseline)

    expect(
      buildSlidePreviewRebuildKey(input({
        componentPackages: {
          'pkg-clock': { manifest: { id: 'pkg-clock', version: '1.0.0' } },
          'pkg-quiz': { manifest: { id: 'pkg-quiz', version: '2.0.0' } },
        },
      })),
    ).not.toBe(baseline)
  })

  it('does not stringify the whole project in run mode', () => {
    const structured = {
      canvasMode: 'run' as const,
      editingScope: 'scene',
      activePresentationStateId: 'scene-1-state',
    }
    const left = input({ ...structured })
    const right = input({
      ...structured,
      scene: { ...left.scene, nodes: left.scene.nodes.map((node) => ({ ...node })) },
      scenes: left.scenes.map((item) => ({
        ...item,
        nodes: item.nodes.map((node) => ({ ...node })),
      })),
      componentPackages: {
        'pkg-clock': { manifest: { id: 'pkg-clock', version: '1.0.0' } },
      },
    })
    const leftKey = buildSlidePreviewRebuildKey(left)
    const rightKey = buildSlidePreviewRebuildKey(right)

    expect(leftKey).toBe(rightKey)
    expect(leftKey).not.toContain('"title"')
    expect(leftKey).not.toContain('"updatedAt"')
    expect(leftKey).toContain('"mode":"run"')
    expect(leftKey).toContain('"currentSceneId":"scene-1"')
  })
})

describe('slidePreviewComponentPackageFingerprint', () => {
  it('is stable across record identity and sensitive to packageId+version', () => {
    const first = {
      b: { manifest: { id: 'b', version: '1' } },
      a: { manifest: { id: 'a', version: '2' } },
    }
    const second = {
      a: { manifest: { id: 'a', version: '2' } },
      b: { manifest: { id: 'b', version: '1' } },
    }
    expect(slidePreviewComponentPackageFingerprint(first)).toEqual(
      slidePreviewComponentPackageFingerprint(second),
    )
    expect(slidePreviewComponentPackageFingerprint({
      a: { packageId: 'a', version: '3' },
    })).not.toEqual(slidePreviewComponentPackageFingerprint(second))
  })
})
