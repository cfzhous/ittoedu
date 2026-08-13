import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { UserFacingError } from '@/shared/errors'
import type { ComponentManifest } from '@/shared/componentTypes'
import type { ProjectDocument } from '@/shared/projectTypes'
import {
  createExternalComponentNode,
  createImageNode,
  createProject,
  createRectangleNode,
  createScene,
  createTextNode,
} from '@/renderer/project/createProject'
import {
  createProjectArchive,
  openProjectArchive,
  type ProjectArchiveData,
} from '@/renderer/project/projectArchive'
import { saveProject } from '@/renderer/project/saveProject'
import { BlobUrlRegistry } from '@/renderer/project/blobUrlRegistry'
import {
  createImageAssetImport,
  createRuntimeAssetMap,
  fitImageSize,
} from '@/renderer/project/assetManager'
import { parseComponentPackageFiles } from '@/renderer/components/importComponentPackage'
import { createProjectV8Fields } from '../helpers/projectV8'

function makeComponentFiles(): Record<string, Uint8Array> {
  const manifest: ComponentManifest = {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    renderMode: 'phaser',
    supportedScopes: ['scene', 'global'],
    id: 'com.example.chart',
    name: '图表组件',
    version: '1.2.3',
    entry: 'runtime.js',
    thumbnail: 'thumbnail.png',
    defaultSize: { width: 480, height: 280 },
    minSize: { width: 160, height: 100 },
    preserveAspectRatio: true,
    assets: { marker: 'assets/marker.bin' },
    defaultProps: { value: 1 },
  }
  return {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'runtime.js': strToU8(
      "window.CoursewareComponent.define({id:'com.example.chart',runtimeApiVersion:4,create:function(){return {destroy:function(){}}}})",
    ),
    'thumbnail.png': new Uint8Array([137, 80, 78, 71]),
    'assets/marker.bin': new Uint8Array([0, 255, 2, 128]),
  }
}

function makeArchiveData(): ProjectArchiveData {
  const project = createProject({
    id: 'project_test',
    now: '2026-07-20T12:00:00.000Z',
    idFactory: () => 'scene_1',
    includeDefaultController: false,
    controls: 'none',
  })
  const imageBytes = new Uint8Array([137, 80, 78, 71, 0, 255, 128])
  project.assets.asset_image = {
    id: 'asset_image',
    filename: '课堂图片.png',
    mimeType: 'image/png',
    kind: 'image',
    path: 'assets/asset_image.png',
    byteLength: imageBytes.byteLength,
    width: 800,
    height: 450,
  }
  project.scenes[0]!.nodes.push(
    createImageNode({
      id: 'image_node',
      assetId: 'asset_image',
      width: 400,
      height: 225,
    }),
  )

  const packageFiles = makeComponentFiles()
  const component = parseComponentPackageFiles(packageFiles)
  project.componentPackages[component.key] = component.metadata
  project.scenes[0]!.nodes.push(
    createExternalComponentNode({
      id: 'component_node',
      name: component.manifest.name,
      component: {
        packageId: component.manifest.id,
        version: component.manifest.version,
      },
      props: component.manifest.defaultProps,
    }),
  )

  return {
    project,
    assetFiles: { asset_image: imageBytes },
    componentFiles: { [component.key]: packageFiles },
  }
}

describe('project factories', () => {
  it('creates the required default project and isolated node values', () => {
    const project = createProject({
      id: 'project_1',
      now: '2026-07-20T00:00:00.000Z',
      idFactory: () => 'fixed',
    })

    expect(project).toMatchObject({
      schemaVersion: 8,
      id: 'project_1',
      title: '未命名课件',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      canvas: { width: 1280, height: 720 },
      scenes: [
        {
          name: '场景 1',
          backgroundColor: '#ffffff',
          backgroundAssetId: null,
          nodes: [],
          interactions: [],
        },
      ],
      assets: {},
      componentPackages: {},
      globalLayer: [{
        node: { type: 'teacher-controller' },
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      }],
      ...createProjectV8Fields('canvas'),
    })

    const text = createTextNode({ id: 'text_1' })
    const rectangle = createRectangleNode({ id: 'rectangle_1' })
    const scene = createScene({ id: 'scene_2' })
    expect(text.style).toEqual({
      fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
      fontSize: 42,
      color: '#1f2937',
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      emphasis: false,
      highlightColor: null,
      align: 'left',
      verticalAlign: 'top',
      writingMode: 'horizontal',
      lineSpacing: 6,
      letterSpacing: 0,
      padding: 0,
      overflow: 'auto-height',
      backgroundColor: '#ffffff',
      backgroundOpacity: 0,
      cornerRadius: 0,
    })
    expect(rectangle).toMatchObject({ type: 'shape', shapeType: 'rectangle' })
    expect(text.playbackInitialVisibility).toBe('inherit')
    expect(rectangle.playbackInitialVisibility).toBe('inherit')
    expect(scene.nodes).toEqual([])
  })
})

describe('project archive', () => {
  it('rejects a missing project asset referenced by a component image property', () => {
    const source = makeArchiveData()
    const packageKey = Object.keys(source.componentFiles)[0]!
    const files = source.componentFiles[packageKey]!
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as ComponentManifest
    manifest.defaultProps = { cover: 'missing-component-image' }
    manifest.editor = {
      properties: [{ key: 'cover', label: '封面', type: 'image' }],
    }
    files['manifest.json'] = strToU8(JSON.stringify(manifest))
    const parsed = parseComponentPackageFiles(files)
    source.project.componentPackages = { [parsed.key]: parsed.metadata }
    const componentNode = source.project.scenes[0]!.nodes.find(
      (node) => node.type === 'external-component',
    )
    if (!componentNode || componentNode.type !== 'external-component') {
      throw new Error('component fixture missing')
    }
    componentNode.props = {}

    expect(() => createProjectArchive(source)).toThrowError(
      expect.objectContaining({
        title: '工程保存失败',
        message: expect.stringContaining('missing-component-image'),
      }),
    )
  })

  it('rejects Project V6 archives before any legacy animation migration', () => {
    const source = makeArchiveData()
    const scene = source.project.scenes[0]!
    const sceneNode = scene.nodes.find((node) => node.id === 'image_node')!
    scene.presentation!.states.push({
      id: 'state_inherited',
      name: '继承基础动画',
      nodeOverrides: {},
    })
    const globalNode = createRectangleNode({ id: 'animated_global' })
    source.project.globalLayer.push({
      node: globalNode,
      layer: 'underlay',
      visibility: { mode: 'all', sceneIds: [] },
    })

    const files = unzipSync(createProjectArchive(source))
    const legacy = structuredClone(source.project) as unknown as {
      schemaVersion: number
      scenes: Array<{
        nodes: Array<Record<string, unknown>>
        presentation: {
          states: Array<{ nodeOverrides: Record<string, Record<string, unknown>> }>
        }
      }>
      globalLayer: Array<{ node: Record<string, unknown> }>
    }
    legacy.schemaVersion = 6
    for (const legacyScene of legacy.scenes) {
      legacyScene.nodes.forEach((node) => delete node.playbackInitialVisibility)
    }
    legacy.globalLayer.forEach((item) => delete item.node.playbackInitialVisibility)
    const legacySceneNode = legacy.scenes[0]!.nodes.find(
      (node) => node.id === sceneNode.id,
    )!
    legacySceneNode.animation = {
      preset: 'slide-left',
      durationMs: 560,
      delayMs: 120,
    }
    legacy.scenes[0]!.presentation.states[0]!.nodeOverrides[sceneNode.id] = {
      animation: { preset: 'scale', durationMs: 320, delayMs: 40 },
    }
    legacy.globalLayer[0]!.node.animation = {
      preset: 'fade',
      durationMs: 240,
      delayMs: 0,
    }
    files['project.json'] = strToU8(JSON.stringify(legacy))

    expect(() => openProjectArchive(zipSync(files))).toThrowError(
      expect.objectContaining({
        title: '旧工程格式不受支持',
        message: expect.stringContaining('Project V6'),
      }),
    )
  })

  it('round-trips scene entry states and rejects stale cross-scene state references', () => {
    const source = makeArchiveData()
    const target = createScene({ id: 'scene_target', name: '目标场景' })
    target.presentation!.states.push({
      id: 'state_detail',
      name: '详情',
      nodeOverrides: {},
    })
    source.project.scenes.push(target)
    source.project.scenes[0]!.interactions.push({
      id: 'go_to_detail',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{
        id: 'go_to_detail_action',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'scene.go',
          sceneId: target.id,
          targetStateId: 'state_detail',
        },
      }],
    })

    const restored = openProjectArchive(createProjectArchive(source))
    expect(restored.project.scenes[0]!.interactions[0]!.actions[0]).toEqual({
      id: 'go_to_detail_action',
      start: 'after-previous',
      delayMs: 0,
      action: {
        type: 'scene.go',
        sceneId: target.id,
        targetStateId: 'state_detail',
      },
    })

    const action = source.project.scenes[0]!.interactions[0]!.actions[0]!.action
    if (action.type !== 'scene.go') throw new Error('测试动作类型错误')
    action.targetStateId = 'state_missing'
    expect(() => createProjectArchive(source)).toThrowError(
      expect.objectContaining({
        title: '工程保存失败',
        message: expect.stringContaining('state_missing'),
      }),
    )
  })

  it('rejects animation.completed references to non-motion action steps', () => {
    const source = makeArchiveData()
    const scene = source.project.scenes[0]!
    scene.interactions.push(
      {
        id: 'ordinary-source',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [],
        actions: [{
          id: 'ordinary-action',
          start: 'after-previous',
          delayMs: 0,
          action: {
            type: 'presentation.set',
            stateId: scene.presentation!.initialStateId,
          },
        }],
      },
      {
        id: 'invalid-completion',
        enabled: true,
        trigger: { type: 'animation.completed', actionId: 'ordinary-action' },
        conditions: [],
        actions: [{
          id: 'valid-motion',
          start: 'after-previous',
          delayMs: 0,
          action: {
            type: 'node.exit',
            nodeId: 'image_node',
            effect: 'fade',
            durationMs: 180,
            easing: 'ease-in',
          },
        }],
      },
    )

    expect(() => createProjectArchive(source)).toThrowError(
      expect.objectContaining({
        title: '工程保存失败',
        message: expect.stringContaining('ordinary-action'),
      }),
    )
  })

  it('round-trips Runtime API 2 scene/global runtimes and unified global-layer placement', () => {
    const source = makeArchiveData()
    const runtime = {
      runtimeApiVersion: 2 as const,
      enabled: true,
      renderMode: 'hybrid' as const,
      source:
        "CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})",
      content: {
        values: {
          title: '可编辑标题',
          action: '开始互动',
        },
      },
      assets: {
        hero: { assetId: 'asset_image' },
      },
      staticFallback: {
        assetId: 'asset_image',
        coverage: 'runtime-layer' as const,
        layer: 'overlay' as const,
      },
    }
    source.project.globalRuntime = structuredClone(runtime)
    source.project.scenes[0]!.runtime = structuredClone(runtime)
    const componentNode = source.project.scenes[0]!.nodes.find(
      (node) => node.type === 'external-component',
    )
    if (!componentNode || componentNode.type !== 'external-component') {
      throw new Error('测试工程缺少组件节点')
    }
    source.project.globalLayer.push({
      node: structuredClone(componentNode),
      layer: 'overlay',
      visibility: { mode: 'all', sceneIds: [] },
    })

    const restored = openProjectArchive(createProjectArchive(source))

    expect(restored.project.globalRuntime).toEqual(runtime)
    expect(restored.project.scenes[0]!.runtime).toEqual(runtime)
    expect(restored.project.globalLayer).toEqual(source.project.globalLayer)
  })

  it('round-trips project JSON, image bytes and every component file byte-for-byte', () => {
    const source = makeArchiveData()
    const bytes = createProjectArchive(source)
    const restored = openProjectArchive(bytes)

    expect(restored.project).toEqual(source.project)
    expect([...restored.assetFiles.asset_image!]).toEqual([
      ...source.assetFiles.asset_image!,
    ])

    const key = 'com.example.chart@1.2.3'
    expect(Object.keys(restored.componentFiles[key]!).sort()).toEqual(
      Object.keys(source.componentFiles[key]!).sort(),
    )
    for (const [path, fileBytes] of Object.entries(source.componentFiles[key]!)) {
      expect([...restored.componentFiles[key]![path]!]).toEqual([...fileBytes])
    }
  })

  it('writes only portable relative archive paths and no local absolute path', () => {
    const bytes = createProjectArchive(makeArchiveData())
    const files = unzipSync(bytes)
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'project.json',
        'assets/asset_image.png',
        'components/com.example.chart@1.2.3/manifest.json',
        'components/com.example.chart@1.2.3/runtime.js',
        'components/com.example.chart@1.2.3/assets/marker.bin',
      ]),
    )
    for (const path of Object.keys(files)) {
      expect(path).not.toMatch(/^(?:[a-zA-Z]:|\/|\\\\)/)
      expect(path.split('/')).not.toContain('..')
    }
    expect(strFromU8(files['project.json']!)).not.toContain('C:\\')
  })

  it.each(['../outside.txt', 'assets/../../outside.txt', 'C:/outside.txt', '\\\\host\\x'])(
    'rejects an unsafe ZIP entry before reading content: %s',
    (unsafePath) => {
      const source = makeArchiveData()
      const validBytes = createProjectArchive(source)
      const files = unzipSync(validBytes)
      files[unsafePath] = new Uint8Array([1])
      const malicious = zipSync(files)

      expect(() => openProjectArchive(malicious)).toThrow(UserFacingError)
      try {
        openProjectArchive(malicious)
      } catch (error) {
        expect(error).toBeInstanceOf(UserFacingError)
        expect((error as UserFacingError).message).toMatch(/不安全|路径穿越|无效路径/)
      }
    },
  )

  it('reports a higher schemaVersion with a dedicated Chinese user error', () => {
    const project = {
      ...makeArchiveData().project,
      schemaVersion: 99,
    }
    const bytes = zipSync({
      'project.json': strToU8(JSON.stringify(project)),
    })

    expect(() => openProjectArchive(bytes)).toThrowError(
      expect.objectContaining({
        title: '工程格式版本不支持',
        message: expect.stringContaining('版本 99'),
      }),
    )
  })

  it.each([1, 2, 3, 4, 5, 6, 7])(
    'rejects Project V%i without invoking the archived migration chain',
    (schemaVersion) => {
      const project = {
        ...makeArchiveData().project,
        schemaVersion,
      }
      const bytes = zipSync({
        'project.json': strToU8(JSON.stringify(project)),
      })

      expect(() => openProjectArchive(bytes)).toThrowError(
        expect.objectContaining({
          title: '旧工程格式不受支持',
          message: expect.stringContaining(`Project V${schemaVersion}`),
        }),
      )
    },
  )

  it('rejects malformed project JSON and missing declared binary files', () => {
    const invalidProject = {
      ...makeArchiveData().project,
      scenes: [],
    }
    expect(() =>
      openProjectArchive(
        zipSync({ 'project.json': strToU8(JSON.stringify(invalidProject)) }),
      ),
    ).toThrowError(expect.objectContaining({ title: '工程文件损坏' }))

    const source = makeArchiveData()
    delete source.assetFiles.asset_image
    expect(() => createProjectArchive(source)).toThrowError(
      expect.objectContaining({
        title: '工程保存失败',
        message: expect.stringContaining('缺少二进制内容'),
      }),
    )
  })

  it('rejects missing assets referenced only by a named presentation state', () => {
    const backgroundSource = makeArchiveData()
    const backgroundScene = backgroundSource.project.scenes[0]!
    backgroundScene.presentation!.states[0]!.backgroundAssetId = 'missing_background'

    expect(() => createProjectArchive(backgroundSource)).toThrowError(
      expect.objectContaining({
        title: '工程保存失败',
        message: expect.stringContaining('状态“初始”'),
      }),
    )
    expect(() => createProjectArchive(backgroundSource)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining('missing_background'),
      }),
    )

    const imageSource = makeArchiveData()
    const imageScene = imageSource.project.scenes[0]!
    imageScene.presentation!.states[0]!.nodeOverrides.image_node = {
      assetId: 'missing_state_image',
    }

    expect(() => createProjectArchive(imageSource)).toThrowError(
      expect.objectContaining({
        title: '工程保存失败',
        message: expect.stringContaining('missing_state_image'),
      }),
    )
  })

  it('updates updatedAt through the explicit save helper without mutating input', () => {
    const source = makeArchiveData()
    const originalTimestamp = source.project.updatedAt
    const saved = saveProject(source, '2026-07-21T01:02:03.000Z')

    expect(source.project.updatedAt).toBe(originalTimestamp)
    expect(saved.project.updatedAt).toBe('2026-07-21T01:02:03.000Z')
    expect(openProjectArchive(saved.bytes).project.updatedAt).toBe(
      '2026-07-21T01:02:03.000Z',
    )
  })
})

describe('asset helpers and BlobUrlRegistry', () => {
  it('sanitises the source name, copies bytes, and derives a portable asset path', () => {
    const sourceBytes = new Uint8Array([1, 2, 3])
    const imported = createImageAssetImport(
      {
        name: 'C:\\Users\\Teacher\\photo.JPEG',
        mimeType: 'image/jpeg',
        bytes: sourceBytes,
      },
      {
        id: 'asset_photo',
        dimensions: { width: 1920, height: 1080 },
      },
    )
    sourceBytes[0] = 99

    expect(imported.meta).toEqual({
      id: 'asset_photo',
      filename: 'photo.JPEG',
      mimeType: 'image/jpeg',
      kind: 'image',
      path: 'assets/asset_photo.jpg',
      byteLength: 3,
      width: 1920,
      height: 1080,
    })
    expect([...imported.bytes]).toEqual([1, 2, 3])
    expect(fitImageSize({ width: 1920, height: 1080 })).toEqual({
      width: 640,
      height: 360,
    })
  })

  it('revokes replaced and disposed Blob URLs exactly once', () => {
    let sequence = 0
    const revokeObjectURL = vi.fn()
    const registry = new BlobUrlRegistry({
      createObjectURL: () => `blob:test-${++sequence}`,
      revokeObjectURL,
    })

    expect(registry.create('asset:a', new Uint8Array([1]), 'image/png')).toBe(
      'blob:test-1',
    )
    expect(registry.create('asset:a', new Uint8Array([2]), 'image/png')).toBe(
      'blob:test-2',
    )
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
    expect(registry.size).toBe(1)
    registry.dispose()
    registry.dispose()
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:test-2')
  })

  it('hydrates runtime assets without sharing mutable binary buffers', () => {
    let sequence = 0
    const registry = new BlobUrlRegistry({
      createObjectURL: () => `blob:asset-${++sequence}`,
      revokeObjectURL: vi.fn(),
    })
    const source = makeArchiveData()
    const runtimeAssets = createRuntimeAssetMap(
      source.project,
      source.assetFiles,
      registry,
    )
    source.assetFiles.asset_image![0] = 0

    expect(runtimeAssets.asset_image?.url).toBe('blob:asset-1')
    expect(runtimeAssets.asset_image?.bytes[0]).toBe(137)
  })

  it('gives a Chinese error for unsupported image types', () => {
    expect(() =>
      createImageAssetImport({
        name: 'lesson.bmp',
        mimeType: 'image/bmp',
        bytes: new Uint8Array([1]),
      }),
    ).toThrowError(expect.objectContaining({ title: '图片类型不支持' }))
  })
})
