import { describe, expect, it } from 'vitest'
import {
  analyzeProjectAssetReferences,
  collectReferencedProjectAssetIds,
  collectUnusedProjectAssetIds,
} from '@/shared/assetReferences'
import type { AssetMeta } from '@/shared/projectTypes'
import {
  createExternalComponentNode,
  createImageNode,
  createProject,
  createVideoNode,
} from '@/renderer/project/createProject'
import { collectProjectHealth } from '@/shared/projectHealth'
import { collectPublishedProjectAssetIds } from '@/renderer/export/buildPublishedLesson'
import { useEditorStore } from '@/renderer/store/editorStore'

function asset(id: string, kind: AssetMeta['kind'] = 'image'): AssetMeta {
  return {
    id,
    filename: `${id}.${kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : 'png'}`,
    mimeType: kind === 'audio' ? 'audio/mpeg' : kind === 'video' ? 'video/mp4' : 'image/png',
    kind,
    path: `assets/${id}`,
    byteLength: 10,
  }
}

describe('project asset reference graph', () => {
  it('covers base/state/global/sound/runtime and reports exact locations', () => {
    const project = createProject({ includeDefaultController: false })
    const scene = project.scenes[0]!
    const ids = [
      'scene-bg', 'state-bg', 'base-image', 'state-image', 'global-video',
      'poster', 'sound', 'runtime-binding', 'runtime-fallback',
      'runtime-content', 'runtime-source', 'unused',
    ]
    ids.forEach((id) => { project.assets[id] = asset(id) })
    project.assets['global-video'] = asset('global-video', 'video')
    project.assets.sound = asset('sound', 'audio')
    scene.backgroundAssetId = 'scene-bg'
    const image = createImageNode('base-image')
    scene.nodes.push(image)
    const state = scene.presentation!.states[0]!
    state.backgroundAssetId = 'state-bg'
    state.nodeOverrides[image.id] = { assetId: 'state-image' }
    const video = createVideoNode({ assetId: 'global-video' })
    video.poster = { mode: 'image', time: 0, assetId: 'poster' }
    project.globalLayer.push({
      node: video,
      layer: 'overlay',
      visibility: { mode: 'all', sceneIds: [] },
    })
    project.media.audio.sounds.sound = {
      id: 'sound', name: 'Sound', assetId: 'sound', channel: 'sfx',
      defaultVolume: 1, defaultLoop: false,
    }
    scene.runtime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      assets: { photo: { assetId: 'runtime-binding' } },
      staticFallback: { assetId: 'runtime-fallback', coverage: 'runtime-layer', layer: 'overlay' },
      content: { values: { nested: 'runtime-content' } },
      source: `ctx.projectAssetUrl('runtime\\u002dsource')`,
    }

    const analysis = analyzeProjectAssetReferences(project)
    const referenced = new Set(analysis.graph.keys())
    expect(referenced).toEqual(new Set(ids.filter((id) => id !== 'unused')))
    expect(analysis.graph.get('state-image')).toContainEqual(expect.objectContaining({
      kind: 'node-image',
      certainty: 'direct',
      sceneId: scene.id,
      stateId: state.id,
      nodeId: image.id,
      path: expect.arrayContaining(['nodeOverrides', image.id, 'assetId']),
    }))
    expect(analysis.graph.get('runtime-source')).toContainEqual(expect.objectContaining({
      kind: 'runtime-source', certainty: 'conservative',
    }))
    expect(collectUnusedProjectAssetIds(project)).toEqual(new Set(['unused']))
  })

  it('covers nested component props, manifest image defaults and runtime source', () => {
    const project = createProject({ includeDefaultController: false })
    ;['prop-image', 'state-prop-image', 'default-image', 'source-image', 'unrelated'].forEach((id) => {
      project.assets[id] = asset(id)
    })
    const node = createExternalComponentNode({
      component: { packageId: 'com.test.media', version: '4.0.0' },
      props: { nested: { image: 'prop-image' } },
    })
    project.scenes[0]!.nodes.push(node)
    const state = project.scenes[0]!.presentation!.states[0]!
    state.nodeOverrides[node.id] = {
      props: { nested: { image: 'state-prop-image' } },
    }
    project.componentPackages['com.test.media'] = {
      packageId: 'com.test.media', version: '4.0.0', name: 'Media',
      manifestPath: 'components/com.test.media/manifest.json',
      runtimePath: 'components/com.test.media/runtime.js',
    }
    const components = {
      'com.test.media': {
        manifest: {
          schemaVersion: 4 as const,
          runtimeApiVersion: 4 as const,
          id: 'com.test.media', name: 'Media', version: '4.0.0',
          entry: 'runtime.js', defaultSize: { width: 100, height: 100 },
          minSize: { width: 10, height: 10 }, preserveAspectRatio: false,
          assets: {}, supportedScopes: ['scene' as const], renderMode: 'dom' as const,
          defaultProps: { cover: 'default-image' },
          editor: { properties: [{ key: 'cover', label: 'Cover', type: 'image' as const }] },
        },
        runtimeSource: `ctx.projectAssetUrl('source-image')`,
      },
    }

    const graph = analyzeProjectAssetReferences(project, { componentPackages: components }).graph
    expect(graph.get('prop-image')).toContainEqual(expect.objectContaining({
      kind: 'component-prop', certainty: 'conservative', nodeId: node.id,
    }))
    expect(graph.get('default-image')).toContainEqual(expect.objectContaining({
      kind: 'component-manifest-default', certainty: 'direct',
    }))
    expect(graph.get('source-image')).toContainEqual(expect.objectContaining({
      kind: 'component-runtime-source', certainty: 'conservative',
    }))
    expect(graph.get('state-prop-image')).toContainEqual(expect.objectContaining({
      kind: 'component-prop', certainty: 'conservative',
      stateId: state.id, nodeId: node.id,
    }))
    expect(collectUnusedProjectAssetIds(project, { componentPackages: components }))
      .toEqual(new Set(['unrelated']))
  })

  it('does not treat missing component context as permission to delete', () => {
    const project = createProject({ includeDefaultController: false })
    project.assets.protected = asset('protected')
    const node = createExternalComponentNode({
      component: { packageId: 'missing', version: '4.0.0' },
    })
    project.scenes[0]!.nodes.push(node)

    const analysis = analyzeProjectAssetReferences(project)
    expect(analysis.missingComponentContexts).toContainEqual(expect.objectContaining({
      packageId: 'missing', nodeId: node.id,
    }))
    expect(collectReferencedProjectAssetIds(project)).toContain('protected')
    expect(analysis.graph.get('protected')).toContainEqual(expect.objectContaining({
      kind: 'component-context-unavailable', certainty: 'conservative',
    }))
  })

  it('keeps explicit manifest image fields direct even when the asset is missing', () => {
    const project = createProject({ includeDefaultController: false })
    const node = createExternalComponentNode({
      component: { packageId: 'com.test.missing-image', version: '4.0.0' },
      props: { cover: 'missing-project-asset' },
    })
    project.scenes[0]!.nodes.push(node)
    const components = {
      recordKey: {
        manifest: {
          schemaVersion: 4 as const, runtimeApiVersion: 4 as const,
          id: 'com.test.missing-image', name: 'Missing image', version: '4.0.0',
          entry: 'runtime.js', defaultSize: { width: 100, height: 100 },
          minSize: { width: 10, height: 10 }, preserveAspectRatio: false,
          assets: {}, defaultProps: {}, supportedScopes: ['scene' as const],
          renderMode: 'dom' as const,
          editor: { properties: [{ key: 'cover', label: 'Cover', type: 'image' as const }] },
        },
        runtimeSource: '',
      },
    }

    expect(analyzeProjectAssetReferences(project, { componentPackages: components })
      .graph.get('missing-project-asset')).toContainEqual(expect.objectContaining({
        kind: 'component-prop', certainty: 'direct', nodeId: node.id,
      }))
  })

  it('keeps graph, deletion, unused diagnostics, and publishing projection aligned', () => {
    const project = createProject({ includeDefaultController: false })
    const referenced = asset('referenced')
    const unused = asset('unused')
    project.assets.referenced = referenced
    project.assets.unused = unused
    project.scenes[0]!.nodes.push(createImageNode('referenced'))
    const components = {}
    const graphIds = collectReferencedProjectAssetIds(project, {
      componentPackages: components,
      includeDisabledRuntimes: false,
    })
    const healthUnused = new Set(collectProjectHealth(project, components)
      .filter(({ code }) => code === 'asset-unused')
      .map(({ assetId }) => assetId))
    const publishedIds = collectPublishedProjectAssetIds({
      project,
      assets: {
        referenced: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
        unused: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
      },
      components,
    })
    useEditorStore.getState().loadProject(project, null, {
      referenced: new Uint8Array([1]),
      unused: new Uint8Array([2]),
    })
    const deleteBlocked = new Set(Object.keys(project.assets).filter((assetId) => (
      !useEditorStore.getState().deleteAsset(assetId)
    )))

    expect(new Set(graphIds)).toEqual(new Set(['referenced']))
    expect(deleteBlocked).toEqual(new Set(graphIds))
    expect(healthUnused).toEqual(new Set(['unused']))
    expect(publishedIds).toEqual(new Set(graphIds))
  })
})
