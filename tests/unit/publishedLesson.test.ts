import { strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import type {
  ComponentManifestV4,
  ExportPayload,
} from '../../src/shared/componentTypes'
import type { ProjectDocument } from '../../src/shared/projectTypes'
import type { PublishedLessonPayload } from '../../src/shared/publishedLessonTypes'
import { jsonToBase64 } from '../../src/renderer/export/base64'
import {
  buildPublishedLessonPayload,
} from '../../src/renderer/export/buildPublishedLesson'
import { buildStandaloneHtml } from '../../src/renderer/export/buildStandaloneHtml'
import { buildWebPackageFiles } from '../../src/renderer/export/buildWebPackage'
import {
  createExternalComponentNode,
  createImageNode,
  createVideoNode,
} from '../../src/renderer/project/createProject'
import { ComponentRegistry } from '../../src/player/ComponentRegistry'
import { decodeExportPayload } from '../../src/player/payload'
import { decodePublishedCode } from '../../src/player/publishedLesson'
import { materializeScene } from '../../src/shared/presentation'
import { createProjectV8Fields } from '../helpers/projectV8'

const componentManifest: ComponentManifestV4 = {
  schemaVersion: 4,
  runtimeApiVersion: 4,
  supportedScopes: ['scene'],
  renderMode: 'dom',
  id: 'com.example.published',
  name: '发布测试组件',
  version: '4.0.0',
  description: '作者态组件说明不得发布',
  entry: 'runtime.js',
  thumbnail: 'thumbnail.png',
  defaultSize: { width: 360, height: 200 },
  minSize: { width: 180, height: 100 },
  preserveAspectRatio: false,
  assets: {},
  defaultProps: {
    content: {
      title: '默认标题',
      hint: '默认提示',
    },
    theme: { color: '#1d4ed8' },
  },
  editor: {
    properties: [{
      key: 'content.title',
      label: '标题',
      description: '编辑器字段说明不得发布',
      type: 'text',
    }],
    pages: [{
      id: 'main',
      label: '主页',
      description: '编辑器分页说明不得发布',
      propertyKeys: ['content.title'],
    }],
    defaultPageId: 'main',
  },
  variants: [{
    id: 'blue',
    label: '蓝色',
    description: '变体说明不得发布',
    props: { theme: { color: '#2563eb' } },
  }],
  presets: [{
    id: 'starter',
    label: '起步',
    description: '预设说明不得发布',
    props: { content: { title: '预设标题' } },
  }],
}

const loneHighSurrogate = String.fromCharCode(0xd800)
const componentRuntime =
  "window.CoursewareComponent.define({id:'com.example.published',runtimeApiVersion:4," +
  `create(){const exact="中文🎓${loneHighSurrogate}";void exact;return{destroy(){}}}})`
const sceneRuntime =
  `CoursewareRuntime.define({runtimeApiVersion:2,create(){const exact="场景🌏${loneHighSurrogate}";void exact;return{destroy(){}}}})`

function makePayload(): ExportPayload {
  const node = createExternalComponentNode({
    id: 'component-node',
    name: '作者态图层名称不得发布',
    component: {
      packageId: componentManifest.id,
      version: componentManifest.version,
    },
    width: 360,
    height: 200,
    props: {
      content: { title: '实例标题' },
    },
  })
  node.locked = true
  const project: ProjectDocument = {
    schemaVersion: 8,
    id: 'authoring-project-id',
    title: 'PublishedLesson 测试',
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T01:00:00.000Z',
    canvas: { width: 1280, height: 720 },
    scenes: [{
      id: 'scene-1',
      name: '第一场景',
      backgroundColor: '#ffffff',
      backgroundAssetId: null,
      nodes: [node],
      presentation: {
        initialStateId: 'state-ready',
        thumbnailStateId: 'state-thumb',
        states: [
          {
            id: 'state-ready',
            name: '就绪',
            description: '状态编辑说明不得发布',
            nodeOverrides: {
              [node.id]: {
                props: {
                  content: { hint: '状态提示' },
                },
              },
            },
          },
          {
            id: 'state-thumb',
            name: '缩略图',
            nodeOverrides: {},
          },
        ],
      },
      runtime: {
        runtimeApiVersion: 2,
        enabled: true,
        renderMode: 'dom',
        source: sceneRuntime,
        content: {
          values: { prompt: '运行时公开文案' },
          metadata: {
            prompt: {
              label: '编辑器文案标签不得发布',
              description: '编辑器文案说明不得发布',
            },
          },
        },
        assets: {},
      },
      interactions: [],
    }],
    assets: {},
    componentPackages: {
      'com.example.published@4.0.0': {
        packageId: componentManifest.id,
        version: componentManifest.version,
        name: componentManifest.name,
        manifestPath: 'components/com.example.published@4.0.0/manifest.json',
        runtimePath: 'components/com.example.published@4.0.0/runtime.js',
      },
    },
    globalLayer: [],
    ...createProjectV8Fields(),
  }
  Object.assign(project, {
    history: [{ operation: '作者历史不得发布' }],
    editorMetadata: { selectedNodeId: node.id },
  })
  return {
    project,
    assets: {},
    components: {
      'com.example.published@4.0.0': {
        manifest: componentManifest,
        runtimeSource: componentRuntime,
        assets: {},
      },
    },
  }
}

function addPayloadAsset(
  payload: ExportPayload,
  assetId: string,
  mimeType: string,
  kind: 'image' | 'audio' | 'video',
): void {
  payload.project.assets[assetId] = {
    id: assetId,
    filename: `${assetId}.bin`,
    mimeType,
    kind,
    path: `assets/${assetId}.bin`,
    byteLength: 1,
  }
  payload.assets[assetId] = {
    mimeType,
    dataUrl: `data:${mimeType};base64,AA==`,
  }
}

function decodeStandalone(html: string): PublishedLessonPayload {
  const encoded = html.match(
    /window\.__H5_LESSON_PAYLOAD__=("[A-Za-z0-9+/=]+");/,
  )?.[1]
  if (!encoded) throw new Error('未找到单 HTML 发布数据')
  const binary = atob(JSON.parse(encoded) as string)
  return JSON.parse(new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  )) as PublishedLessonPayload
}

function decodeCourseData(bytes: Uint8Array): PublishedLessonPayload {
  const source = strFromU8(bytes)
  const match = source.match(/^window\.__H5_LESSON_PAYLOAD__=(.*);\s*$/s)
  if (!match?.[1]) throw new Error('course-data.js 格式无效')
  return JSON.parse(match[1]) as PublishedLessonPayload
}

function allObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allObjectKeys)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...allObjectKeys(nested),
  ])
}

describe('PublishedLesson V1', () => {
  it('单向裁剪作者工程和组件编辑定义，并展平实例运行参数', () => {
    const published = buildPublishedLessonPayload(makePayload())
    const keys = new Set(allObjectKeys(published))
    const forbiddenKeys = [
      'project',
      'schemaVersion',
      'createdAt',
      'updatedAt',
      'componentPackages',
      'history',
      'editorMetadata',
      'manifest',
      'runtimeSource',
      'source',
      'defaultProps',
      'editor',
      'properties',
      'pages',
      'presets',
      'variants',
      'description',
      'metadata',
      'locked',
      'thumbnailStateId',
    ]

    expect(published.format).toBe('h5lesson-published')
    expect(published.formatVersion).toBe(1)
    expect(published.playback.presenter).toEqual({
      enabled: true,
      strategy: 'scene-navigation',
      additionalBindings: [],
    })
    for (const key of forbiddenKeys) expect(keys.has(key), key).toBe(false)

    const node = published.scenes[0]!.nodes[0]!
    expect(node).not.toHaveProperty('name')
    expect(node).not.toHaveProperty('locked')
    expect(node).toMatchObject({
      type: 'external-component',
      props: {
        content: {
          title: '实例标题',
          hint: '默认提示',
        },
        theme: { color: '#1d4ed8' },
      },
    })
    expect(published.scenes[0]!.presentation?.states[0]?.nodeOverrides)
      .toEqual({
        'component-node': {
          props: { content: { hint: '状态提示' } },
        },
      })
  })

  it('精确保留任意 Unicode 代码单元并可恢复执行', () => {
    const published = buildPublishedLessonPayload(makePayload())
    const component = published.components['com.example.published@4.0.0']!

    expect(decodePublishedCode(component.code)).toBe(componentRuntime)
    expect(decodePublishedCode(published.scenes[0]!.runtime!.code)).toBe(
      sceneRuntime,
    )

    const loaded = decodeExportPayload(jsonToBase64(published))
    expect(loaded.project.schemaVersion).toBe(8)
    expect(loaded.project.playback.presenter).toEqual(
      published.playback.presenter,
    )

    const legacyPublished = structuredClone(published) as unknown as {
      playback: {
        controls: string
        keyboardNavigation: boolean
        presenter?: unknown
      }
    }
    legacyPublished.playback.controls = 'footer'
    delete legacyPublished.playback.presenter
    const legacyLoaded = decodeExportPayload(jsonToBase64(
      legacyPublished as unknown as PublishedLessonPayload,
    ))
    expect(legacyLoaded.project.playback).toMatchObject({
      controls: 'none',
      keyboardNavigation: true,
      presenter: {
        enabled: true,
        strategy: 'scene-navigation',
        additionalBindings: [],
      },
    })
    expect(loaded.project.scenes[0]!.runtime?.source).toBe(sceneRuntime)
    expect(
      loaded.components['com.example.published@4.0.0']?.runtimeSource,
    ).toBe(componentRuntime)
    expect(loaded.project.scenes[0]!.presentation?.states[0]?.description)
      .toBeUndefined()
    expect(
      (materializeScene(
        loaded.project.scenes[0]!,
        'state-ready',
      ).nodes[0] as { props: Record<string, unknown> }).props,
    ).toMatchObject({
      content: {
        title: '实例标题',
        hint: '状态提示',
      },
      theme: { color: '#1d4ed8' },
    })

    const registry = new ComponentRegistry()
    const definition = registry.executeRuntime(
      loaded.components['com.example.published@4.0.0']!.manifest,
      loaded.components['com.example.published@4.0.0']!.runtimeSource,
    )
    expect(definition.id).toBe(componentManifest.id)
    expect(definition.runtimeApiVersion).toBe(4)
    registry.dispose()
  })

  it('只发布完整运行闭包内的工程素材，排除未使用作者素材', () => {
    const payload = makePayload()
    const componentKey = 'com.example.published@4.0.0'
    const component = payload.components[componentKey]!
    component.manifest = {
      ...componentManifest,
      supportedScopes: ['scene', 'global'],
      defaultProps: {
        ...componentManifest.defaultProps,
        coverAssetId: 'component-default-image',
      },
      editor: {
        ...componentManifest.editor!,
        properties: [
          ...componentManifest.editor!.properties,
          {
            key: 'coverAssetId',
            label: '封面',
            type: 'image',
          },
        ],
      },
    }

    const scene = payload.project.scenes[0]!
    const componentNode = scene.nodes[0]!
    if (componentNode.type !== 'external-component') {
      throw new Error('测试组件节点缺失')
    }
    componentNode.props.legacyAssetId = 'component-legacy-prop'
    const imageNode = createImageNode({
      id: 'scene-image-node',
      assetId: 'scene-image-base',
    })
    const videoNode = createVideoNode({
      id: 'scene-video-node',
      assetId: 'scene-video-base',
      poster: {
        mode: 'image',
        assetId: 'scene-video-poster-base',
      },
    })
    scene.backgroundAssetId = 'scene-background-base'
    scene.nodes.push(imageNode, videoNode)
    scene.presentation!.states[0]!.backgroundAssetId =
      'scene-background-state'
    scene.presentation!.states[0]!.nodeOverrides[imageNode.id] = {
      assetId: 'scene-image-state',
    }
    scene.presentation!.states[0]!.nodeOverrides[videoNode.id] = {
      assetId: 'scene-video-state',
      poster: {
        assetId: 'scene-video-poster-state',
      },
    }
    scene.presentation!.states[0]!.nodeOverrides[componentNode.id] = {
      props: {
        content: { hint: '状态提示' },
        coverAssetId: 'component-state-image',
      },
    }
    scene.runtime!.assets = {
      sceneBinding: { assetId: 'scene-runtime-asset' },
    }
    scene.runtime!.source =
      "CoursewareRuntime.define({runtimeApiVersion:2,create(ctx){void ctx.assets.projectUrl('legacy-direct-runtime');return{destroy(){}}}})"
    scene.runtime!.staticFallback = {
      assetId: 'scene-runtime-fallback',
      coverage: 'runtime-layer',
      layer: 'overlay',
    }

    payload.project.globalRuntime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source:
        'CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})',
      content: { values: {} },
      assets: {
        globalBinding: { assetId: 'global-runtime-asset' },
      },
      staticFallback: {
        assetId: 'global-runtime-fallback',
        coverage: 'runtime-layer',
        layer: 'underlay',
      },
    }
    payload.project.globalLayer.push(
      {
        node: createImageNode({
          id: 'global-image-node',
          assetId: 'global-image',
        }),
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
      {
        node: createVideoNode({
          id: 'global-video-node',
          assetId: 'global-video',
          poster: {
            mode: 'image',
            assetId: 'global-video-poster',
          },
        }),
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
      {
        node: createExternalComponentNode({
          id: 'global-component-node',
          component: {
            packageId: componentManifest.id,
            version: componentManifest.version,
          },
          width: 320,
          height: 180,
          props: { coverAssetId: 'component-global-image' },
        }),
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
    )
    payload.project.media.audio.sounds['lesson-sound'] = {
      id: 'lesson-sound',
      name: '课程声音',
      assetId: 'sound-asset',
      channel: 'sfx',
      defaultVolume: 1,
      defaultLoop: false,
    }

    const expectedAssets = [
      'scene-background-base',
      'scene-background-state',
      'scene-image-base',
      'scene-image-state',
      'scene-video-base',
      'scene-video-state',
      'scene-video-poster-base',
      'scene-video-poster-state',
      'scene-runtime-asset',
      'scene-runtime-fallback',
      'global-runtime-asset',
      'global-runtime-fallback',
      'global-image',
      'global-video',
      'global-video-poster',
      'sound-asset',
      'component-default-image',
      'component-state-image',
      'component-global-image',
      'component-legacy-prop',
      'legacy-direct-runtime',
    ]
    for (const assetId of expectedAssets) {
      const isVideo = assetId === 'scene-video-base' ||
        assetId === 'scene-video-state' ||
        assetId === 'global-video'
      const isAudio = assetId === 'sound-asset'
      addPayloadAsset(
        payload,
        assetId,
        isVideo ? 'video/mp4' : isAudio ? 'audio/mpeg' : 'image/png',
        isVideo ? 'video' : isAudio ? 'audio' : 'image',
      )
    }
    addPayloadAsset(payload, 'unused-author-asset', 'image/png', 'image')

    const published = buildPublishedLessonPayload(payload)
    expect(new Set(Object.keys(published.assets)))
      .toEqual(new Set(expectedAssets))
    expect(published.assets).not.toHaveProperty('unused-author-asset')
  })

  it('单 HTML 和网页包使用同一发布模型，网页包只交付一份数据', () => {
    const payload = makePayload()
    const standalone = decodeStandalone(
      buildStandaloneHtml(payload, 'window.__PLAYER__=true;'),
    )
    const files = buildWebPackageFiles(payload, 'window.__PLAYER__=true;')
    const packaged = decodeCourseData(files['course-data.js']!)
    const paths = Object.keys(files)

    expect(packaged).toEqual(standalone)
    expect(paths.filter((path) => /course.*\.(?:json|js)$/i.test(path)))
      .toEqual(['course-data.js'])
    expect(paths.some((path) => path.endsWith('.map'))).toBe(false)
    expect(paths.some((path) => path.endsWith('/runtime.js'))).toBe(false)
    expect(paths.some((path) => path.endsWith('/manifest.json'))).toBe(false)

    const courseSource = strFromU8(files['course-data.js']!)
    expect(courseSource).not.toContain(componentRuntime)
    expect(courseSource).not.toContain(sceneRuntime)
    expect(courseSource).not.toContain('"project"')
    expect(courseSource).not.toContain('"runtimeSource"')
    expect(courseSource).not.toContain('"componentPackages"')
  })
})
