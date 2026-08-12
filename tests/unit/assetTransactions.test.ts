import { beforeEach, describe, expect, it } from 'vitest'
import type { AssetMeta } from '@/shared/projectTypes'
import {
  createExternalComponentNode,
  createImageNode,
  createProject,
} from '@/renderer/project/createProject'
import { useEditorStore } from '@/renderer/store/editorStore'

function meta(
  id: string,
  kind: AssetMeta['kind'] = 'image',
  filename = `${id}.bin`,
): AssetMeta {
  return {
    id,
    filename,
    mimeType: kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/png',
    kind,
    path: `assets/${filename}`,
    byteLength: 3,
    ...(kind === 'image' ? { width: 320, height: 180 } : {}),
  }
}

beforeEach(() => useEditorStore.getState().createNewProject())

describe('single asset history transactions', () => {
  it('undoes and redoes video import, metadata, bytes, and node together', () => {
    const video = meta('video', 'video', 'video.mp4')
    useEditorStore.getState().addVideoNode(video, new Uint8Array([1, 2, 3]))
    expect(useEditorStore.getState().project.scenes[0]!.nodes[0]).toMatchObject({
      type: 'video', assetId: 'video',
    })

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().project.scenes[0]!.nodes).toHaveLength(0)
    expect(useEditorStore.getState().project.assets.video).toBeUndefined()
    expect(useEditorStore.getState().assetFiles.video).toBeUndefined()
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().project.assets.video).toEqual(video)
    expect([...useEditorStore.getState().assetFiles.video!]).toEqual([1, 2, 3])
  })

  it('restores previous metadata and bytes when replacing an image payload', () => {
    const original = meta('image', 'image', 'old.png')
    const replacement = { ...meta('image', 'image', 'new.png'), byteLength: 4 }
    useEditorStore.getState().addImageNode(original, new Uint8Array([1, 2, 3]))
    const nodeId = useEditorStore.getState().project.scenes[0]!.nodes[0]!.id
    useEditorStore.getState().replaceImageAsset(
      nodeId,
      replacement,
      new Uint8Array([4, 5, 6, 7]),
    )
    expect(useEditorStore.getState().project.assets.image).toEqual(replacement)
    expect([...useEditorStore.getState().assetFiles.image!]).toEqual([4, 5, 6, 7])

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().project.assets.image).toEqual(original)
    expect([...useEditorStore.getState().assetFiles.image!]).toEqual([1, 2, 3])
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().project.assets.image).toEqual(replacement)
    expect([...useEditorStore.getState().assetFiles.image!]).toEqual([4, 5, 6, 7])
  })

  it('undoes and redoes a sound definition with its asset bytes', () => {
    const audio = meta('audio', 'audio', 'voice.mp3')
    const soundId = useEditorStore.getState().importSound(
      audio,
      new Uint8Array([7, 8, 9]),
    )
    expect(useEditorStore.getState().project.media.audio.sounds[soundId]).toBeDefined()
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().project.media.audio.sounds[soundId]).toBeUndefined()
    expect(useEditorStore.getState().project.assets.audio).toBeUndefined()
    expect(useEditorStore.getState().assetFiles.audio).toBeUndefined()
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().project.media.audio.sounds[soundId]).toBeDefined()
    expect([...useEditorStore.getState().assetFiles.audio!]).toEqual([7, 8, 9])
  })
})

describe('asset deletion safety', () => {
  it('blocks named-state background and node override references with locations', () => {
    const project = createProject({ includeDefaultController: false })
    const state = project.scenes[0]!.presentation!.states[0]!
    const background = meta('state-bg')
    const override = meta('state-node')
    project.assets[background.id] = background
    project.assets[override.id] = override
    state.backgroundAssetId = background.id
    const node = createImageNode('base')
    project.assets.base = meta('base')
    project.scenes[0]!.nodes.push(node)
    state.nodeOverrides[node.id] = { assetId: override.id }
    useEditorStore.getState().loadProject(project, null, {
      'state-bg': new Uint8Array([1]),
      'state-node': new Uint8Array([2]),
      base: new Uint8Array([3]),
    })

    expect(useEditorStore.getState().deleteAsset('state-bg')).toBe(false)
    expect(useEditorStore.getState().errorMessage).toContain(`状态 ${state.id}`)
    expect(useEditorStore.getState().deleteAsset('state-node')).toBe(false)
    expect(useEditorStore.getState().errorMessage).toContain(`节点 ${node.id}`)
  })

  it('blocks runtime fallback/source and nested component prop references', () => {
    const project = createProject({ includeDefaultController: false })
    ;['fallback', 'source', 'component'].forEach((id) => {
      project.assets[id] = meta(id)
    })
    project.scenes[0]!.runtime = {
      runtimeApiVersion: 2, enabled: true, renderMode: 'dom', assets: {},
      content: { values: {} },
      staticFallback: { assetId: 'fallback', coverage: 'runtime-layer', layer: 'overlay' },
      source: `ctx.projectAssetUrl('source')`,
    }
    const componentNode = createExternalComponentNode({
      component: { packageId: 'com.test.asset', version: '4.0.0' },
      props: { nested: { image: 'component' } },
    })
    project.scenes[0]!.nodes.push(componentNode)
    project.componentPackages['com.test.asset'] = {
      packageId: 'com.test.asset', version: '4.0.0', name: 'Asset component',
      manifestPath: 'components/manifest.json', runtimePath: 'components/runtime.js',
      contentSha256: '0'.repeat(64),
    }
    const packageData = {
      manifest: {
        schemaVersion: 4 as const, runtimeApiVersion: 4 as const,
        id: 'com.test.asset', name: 'Asset component', version: '4.0.0',
        entry: 'runtime.js', defaultSize: { width: 100, height: 100 },
        minSize: { width: 10, height: 10 }, preserveAspectRatio: false,
        assets: {}, defaultProps: {}, supportedScopes: ['scene' as const],
        renderMode: 'dom' as const,
      },
      runtimeSource: '', files: {},
    }
    useEditorStore.getState().loadProject(project, null, {
      fallback: new Uint8Array([1]), source: new Uint8Array([2]), component: new Uint8Array([3]),
    }, { 'com.test.asset': packageData })

    expect(useEditorStore.getState().deleteAsset('fallback')).toBe(false)
    expect(useEditorStore.getState().errorMessage).toContain('staticFallback')
    expect(useEditorStore.getState().deleteAsset('source')).toBe(false)
    expect(useEditorStore.getState().errorMessage).toContain('source')
    expect(useEditorStore.getState().deleteAsset('component')).toBe(false)
    expect(useEditorStore.getState().errorMessage).toContain(`组件 com.test.asset`)
  })

  it('conservatively blocks deletion when component executable context is absent', () => {
    const project = createProject({ includeDefaultController: false })
    project.assets.possible = meta('possible')
    project.scenes[0]!.nodes.push(createExternalComponentNode({
      component: { packageId: 'com.test.missing', version: '4.0.0' },
    }))
    useEditorStore.getState().loadProject(project, null, {
      possible: new Uint8Array([1]),
    })

    expect(useEditorStore.getState().deleteAsset('possible')).toBe(false)
    expect(useEditorStore.getState().errorMessage).toContain('组件 com.test.missing')
  })
})
