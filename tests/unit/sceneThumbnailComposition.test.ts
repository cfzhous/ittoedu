import { describe, expect, it } from 'vitest'
import type { RuntimeDocument } from '@/shared/runtimeTypes'
import {
  createProject,
  createTextNode,
} from '@/renderer/project/createProject'
import {
  buildSceneThumbnailComposition,
  hasEnabledRuntime,
  hasUnrepresentedRuntime,
} from '@/renderer/ui/sceneThumbnailComposition'

function runtime(
  assetId: string | null,
  layer: 'underlay' | 'overlay' = 'overlay',
  coverage: 'runtime-layer' | 'full-scene' = 'runtime-layer',
  enabled = true,
): RuntimeDocument {
  return {
    runtimeApiVersion: 2,
    enabled,
    renderMode: 'hybrid',
    source: 'CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})',
    content: { values: {} },
    assets: {},
    ...(assetId
      ? { staticFallback: { assetId, layer, coverage } }
      : {}),
  }
}

function labels(
  entries: ReturnType<typeof buildSceneThumbnailComposition>,
): string[] {
  return entries.map((entry) => entry.kind === 'node'
    ? `${entry.scope}:node:${entry.node.id}`
    : `${entry.scope}:fallback:${entry.fallback.assetId}:${entry.fallback.coverage}`)
}

describe('scene thumbnail runtime composition', () => {
  it('matches Player order for global underlay and scene overlay fallbacks', () => {
    const project = createProject({ includeDefaultController: false })
    const scene = project.scenes[0]!
    scene.nodes = [createTextNode({ id: 'scene-node' })]
    scene.runtime = runtime('scene-overlay', 'overlay', 'runtime-layer')
    project.globalRuntime = runtime('global-underlay', 'underlay', 'full-scene')
    project.globalLayer = [
      {
        node: createTextNode({ id: 'global-underlay-node' }),
        layer: 'underlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
      {
        node: createTextNode({ id: 'global-overlay-node' }),
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
    ]

    expect(labels(buildSceneThumbnailComposition(
      scene,
      project.globalLayer,
      project.globalRuntime,
    ))).toEqual([
      'global:node:global-underlay-node',
      'global:fallback:global-underlay:full-scene',
      'scene:node:scene-node',
      'scene:fallback:scene-overlay:runtime-layer',
      'global:node:global-overlay-node',
    ])
  })

  it('places scene underlay before scene nodes and global overlay last', () => {
    const project = createProject({ includeDefaultController: false })
    const scene = project.scenes[0]!
    scene.nodes = [createTextNode({ id: 'scene-node' })]
    scene.runtime = runtime('scene-underlay', 'underlay')
    project.globalRuntime = runtime('global-overlay', 'overlay')
    project.globalLayer = [
      {
        node: createTextNode({ id: 'excluded-node' }),
        layer: 'overlay',
        visibility: { mode: 'include', sceneIds: ['another-scene'] },
      },
      {
        node: createTextNode({ id: 'global-overlay-node' }),
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
    ]

    expect(labels(buildSceneThumbnailComposition(
      scene,
      project.globalLayer,
      project.globalRuntime,
    ))).toEqual([
      'scene:fallback:scene-underlay:runtime-layer',
      'scene:node:scene-node',
      'global:node:global-overlay-node',
      'global:fallback:global-overlay:runtime-layer',
    ])
  })

  it('only badges enabled runtimes that have no static representation', () => {
    const project = createProject({ includeDefaultController: false })
    const scene = project.scenes[0]!

    scene.runtime = runtime(null)
    expect(hasEnabledRuntime(scene, undefined)).toBe(true)
    expect(hasUnrepresentedRuntime(scene, undefined)).toBe(true)

    scene.runtime = runtime('fallback')
    expect(hasUnrepresentedRuntime(scene, undefined)).toBe(false)

    scene.runtime = runtime(null, 'overlay', 'runtime-layer', false)
    expect(hasEnabledRuntime(scene, undefined)).toBe(false)
    expect(hasUnrepresentedRuntime(scene, undefined)).toBe(false)

    expect(hasUnrepresentedRuntime(scene, runtime(null))).toBe(true)
  })

  it('keeps playback-hidden nodes at their authored stable frame for thumbnail drawing', () => {
    const project = createProject({ includeDefaultController: false })
    const node = createTextNode({
      id: 'animated-title',
      x: 320,
      y: 180,
      width: 480,
      height: 120,
      opacity: 0.72,
      playbackInitialVisibility: 'hidden',
    })
    project.scenes[0]!.nodes = [node]

    const entry = buildSceneThumbnailComposition(
      project.scenes[0]!,
      [],
      undefined,
    )[0]
    expect(entry).toMatchObject({
      kind: 'node',
      node: {
        id: node.id,
        x: 320,
        y: 180,
        width: 480,
        height: 120,
        opacity: 0.72,
        playbackInitialVisibility: 'hidden',
      },
    })
  })
})
