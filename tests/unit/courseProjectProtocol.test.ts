import { describe, expect, it } from 'vitest'
import {
  courseProjectDocumentSchema,
  courseSurfaceSchema,
} from '@/shared/courseProjectSchema'
import {
  collectCourseProjectReferences,
  deriveCourseProjectAuthoringInventory,
  deriveCourseProjectAuthoringInventorySnapshot,
  getEffectiveLayerOrder,
  isCanonicalLayerOrder,
  reindexLayerItems,
} from '@/shared/courseProjectModel'
import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
  FlowBlock,
  LayerItem,
} from '@/shared/courseProjectTypes'
import { publishedCourseV2Schema } from '@/shared/publishedCourseSchema'
import type { PublishedCourseV2Payload } from '@/shared/publishedCourseTypes'
import {
  addSlideTextLayer,
  createCourseProject,
} from '@/renderer/course/courseStudioModel'

const HASH = 'a'.repeat(64)

function addPortableImage(project: CourseProjectDocument, id: string): void {
  project.assets[id] = {
    id,
    filename: `${id}.png`,
    mimeType: 'image/png',
    kind: 'image',
    path: `assets/${id}.png`,
    byteLength: 10,
    width: 10,
    height: 10,
  }
}

function makeSlideProject(): CourseProjectDocument {
  let project = createCourseProject({
    id: 'course-stable',
    title: '多表面协议',
    now: '2026-08-14T00:00:00.000Z',
  })
  project.globalLayerItems = []
  const surface = project.surfaces[0]
  if (!surface || surface.type !== 'slide') throw new Error('expected slide surface')
  const scene = surface.scenes[0]!
  scene.id = 'scene-stable'
  scene.name = '稳定场景'
  project.locations[0] = {
    id: 'scene-stable',
    label: '稳定场景',
    kind: 'slide-scene',
    surfaceId: surface.id,
    sceneId: 'scene-stable',
  }
  project.startLocationId = 'scene-stable'
  project = addSlideTextLayer(project, surface.id, scene.id, '二次函数', {
    id: 'text-stable',
    now: '2026-08-14T00:00:00.000Z',
  })
  const currentSurface = project.surfaces[0]
  if (!currentSurface || currentSurface.type !== 'slide') throw new Error('expected slide surface')
  const currentScene = currentSurface.scenes[0]!
  const text = currentScene.layerItems[0]!
  text.label = '稳定文字'
  text.frame.x = 100
  text.frame.y = 120
  currentScene.presentation!.states[0]!.layerItemOverrides['text-stable'] = { locked: true }
  addPortableImage(project, 'runtime-fallback')
  currentScene.layerItems.push({
    layerItemId: 'runtime-stable',
    label: '表面运行时',
    kind: 'runtime',
    frame: { mode: 'absolute', x: 0, y: 0, width: 1280, height: 720 },
    order: 1,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'surface',
    playbackInitialVisibility: 'inherit',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: 'CoursewareSurfaceRuntime.define({runtimeApiVersion:3,create(){return{destroy(){}}}})',
      content: { values: { title: '运行时标题' } },
      assets: {},
      nodeBindings: { title: 'text-stable' },
      staticFallback: {
        assetId: 'runtime-fallback',
        coverage: 'surface',
      },
    },
  })
  project.revision = 0
  return courseProjectDocumentSchema.parse(project)
}

function makeComponentPackage(project: CourseProjectDocument): void {
  project.componentPackages['component.quiz'] = {
    packageId: 'component.quiz',
    version: '4.0.0',
    name: 'Quiz',
    manifestPath: 'components/component.quiz/manifest.json',
    runtimePath: 'components/component.quiz/runtime.js',
    contentSha256: HASH,
  }
}

function flowBlocks(): FlowBlock[] {
  return [
    { id: 'heading', type: 'heading', level: 1, text: '标题' },
    { id: 'paragraph', type: 'paragraph', text: '正文' },
    {
      id: 'list',
      type: 'list',
      ordered: true,
      items: [{ id: 'list-item-1', text: '第一项', level: 0 }],
    },
    { id: 'quote', type: 'quote', text: '引用', citation: '出处' },
    { id: 'divider', type: 'divider' },
    {
      id: 'media',
      type: 'media',
      assetId: 'shared-image',
      mediaKind: 'image',
      altText: '示意图',
      layout: 'wide',
    },
    {
      id: 'table',
      type: 'table',
      columns: [{ id: 'c1', header: '列' }],
      rows: [{ id: 'r1', cells: { c1: '值' } }],
    },
    {
      id: 'formula',
      type: 'formula',
      formulaId: 'formula:flow',
      accessibleText: 'x 平方',
      ast: {
        type: 'script',
        base: { type: 'token', value: 'x' },
        superscript: { type: 'token', value: '2' },
      },
    },
    { id: 'code', type: 'code', language: 'ts', code: 'const x = 1' },
    {
      id: 'callout',
      type: 'callout',
      tone: 'conclusion',
      title: '结论',
      body: '开口向上',
    },
    {
      id: 'section',
      type: 'section',
      title: '折叠章节',
      collapsedByDefault: false,
      blocks: [{ id: 'nested-paragraph', type: 'paragraph', text: '章节正文' }],
    },
    {
      id: 'component-block',
      type: 'component',
      component: { packageId: 'component.quiz', version: '4.0.0' },
      props: { prompt: '请选择' },
      staticFallbackAssetId: 'shared-image',
    },
  ]
}

function makeFlowSurface(): CourseSurfaceDocument {
  return {
    id: 'surface-flow',
    title: '流式讲义',
    type: 'flow',
    surfaceLayerItems: [],
    layout: { readingWidth: 760, wideContentWidth: 1120 },
    blocks: flowBlocks(),
  }
}

function makeSpatialSurface(item: LayerItem): CourseSurfaceDocument {
  const worldItem = structuredClone(item)
  worldItem.order = 0
  return {
    id: 'surface-spatial',
    title: '空间探索',
    type: 'spatial-2d',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'finite', x: -1_000, y: -800, width: 2_000, height: 1_600 },
      layerItems: [worldItem],
    },
    camera: {
      home: { x: 0, y: 0, zoom: 1 },
      frames: [{ id: 'camera-overview', name: '总览', x: 0, y: 0, zoom: 0.5 }],
    },
    relations: [],
    semanticZoom: [{
      id: 'zoom-detail',
      layerItemIds: [worldItem.layerItemId],
      minZoom: 0.8,
      maxZoom: 4,
      visible: true,
    }],
  }
}

describe('Course Project V9 multi-surface protocol', () => {
  it('constructs and validates a native V9 project without a migration step', () => {
    const project = makeSlideProject()
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
    expect(project).toMatchObject({
      schemaVersion: 9,
      id: 'course-stable',
      revision: 0,
      startLocationId: 'scene-stable',
      surfaces: [{
        type: 'slide',
        scenes: [{ id: 'scene-stable' }],
      }],
    })

    const slide = project.surfaces[0]
    expect(slide?.type).toBe('slide')
    if (slide?.type !== 'slide') throw new Error('expected slide surface')
    expect(slide.scenes[0]?.layerItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'runtime',
        frame: { mode: 'absolute', x: 0, y: 0, width: 1280, height: 720 },
        runtime: expect.objectContaining({
          protocol: 'surface-v1',
          runtimeApiVersion: 3,
          staticFallback: { assetId: 'runtime-fallback', coverage: 'surface' },
        }),
      }),
      expect.objectContaining({
        kind: 'native',
        layerItemId: 'text-stable',
        content: expect.objectContaining({ nativeType: 'text' }),
      }),
    ]))
    expect(slide.scenes[0]?.layerItems.map((item) => item.order)).toEqual([0, 1])
    expect(
      slide.scenes[0]?.layerItems.find((item) => item.layerItemId === 'text-stable')?.frame,
    ).toMatchObject({ x: 100, y: 120 })
    expect(slide.scenes[0]?.presentation?.states[0]?.layerItemOverrides['text-stable'])
      .toMatchObject({ locked: true })
  })

  it('rejects ambiguous Slide scene ids across different surfaces', () => {
    const project = createCourseProject({
      id: 'course-global-scene-ids',
      title: '全课程场景标识',
      now: '2026-08-14T00:00:00.000Z',
    })
    const first = project.surfaces[0]
    if (!first || first.type !== 'slide') throw new Error('expected slide surface')
    const duplicate = structuredClone(first)
    duplicate.id = 'slide-second'
    duplicate.title = '第二组幻灯片'
    project.surfaces.push(duplicate)
    project.locations.push({
      id: 'location-second-slide',
      label: '第二组幻灯片',
      kind: 'slide-scene',
      surfaceId: duplicate.id,
      sceneId: duplicate.scenes[0]!.id,
    })

    const result = courseProjectDocumentSchema.safeParse(project)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => (
        issue.message === 'Slide scene ids must be unique across the course'
      ))).toBe(true)
    }
  })

  it('rejects V8, legacy whole-canvas frames and Runtime API 2 as unsupported input', () => {
    const project = makeSlideProject()
    expect(courseProjectDocumentSchema.safeParse({ ...project, schemaVersion: 8 }).success).toBe(false)

    const legacyFrame = structuredClone(project) as unknown as {
      surfaces: Array<{ scenes: Array<{ layerItems: Array<{ frame: { mode: string } }> }> }>
    }
    legacyFrame.surfaces[0]!.scenes[0]!.layerItems[0]!.frame.mode = 'legacy-whole-canvas'
    expect(courseProjectDocumentSchema.safeParse(legacyFrame).success).toBe(false)

    const api2 = structuredClone(project) as unknown as {
      surfaces: Array<{ scenes: Array<{ layerItems: Array<{
        kind: string
        runtime?: { protocol: string; runtimeApiVersion: number }
      }> }> }>
    }
    const runtime = api2.surfaces[0]!.scenes[0]!.layerItems.find(
      (item) => item.kind === 'runtime',
    )!.runtime!
    runtime.protocol = 'legacy-runtime-v2'
    runtime.runtimeApiVersion = 2
    expect(courseProjectDocumentSchema.safeParse(api2).success).toBe(false)
  })

  it('uses strict surface, layer and block discriminators and rejects dirty fields', () => {
    const valid = makeSlideProject()
    expect(courseProjectDocumentSchema.safeParse(valid).success).toBe(true)

    expect(courseProjectDocumentSchema.safeParse({ ...valid, staleRoot: true }).success).toBe(false)
    expect(courseSurfaceSchema.safeParse({
      ...valid.surfaces[0],
      type: 'document',
    }).success).toBe(false)

    expect(courseProjectDocumentSchema.safeParse({ ...valid, revision: -1 }).success).toBe(false)
    expect(courseProjectDocumentSchema.safeParse({ ...valid, revision: 0.5 }).success).toBe(false)

    const dirty = structuredClone(valid) as CourseProjectDocument & {
      surfaces: Array<Record<string, unknown>>
    }
    const slide = dirty.surfaces[0] as unknown as {
      scenes: Array<{ layerItems: Array<Record<string, unknown>> }>
    }
    const native = slide.scenes[0]!.layerItems.find((item) => item.kind === 'native') as {
      content: { data: Record<string, unknown> }
    }
    native.content.data.staleNativeField = true
    expect(courseProjectDocumentSchema.safeParse(dirty).success).toBe(false)

    expect(courseSurfaceSchema.safeParse({
      ...makeFlowSurface(),
      blocks: [{ id: 'bad', type: 'paragraph', text: 'x', level: 2 }],
    }).success).toBe(false)
  })

  it('derives a revision-scoped authoring inventory without persisting content copies', () => {
    const project = makeSlideProject()
    const inventory = deriveCourseProjectAuthoringInventory(project)
    const textAddress = Object.keys(inventory).find((address) =>
      address.includes('/scene/slide%3Acourse-stable/scene-stable/native/text-stable') &&
      address.endsWith('?field=content.data.text'),
    )

    expect(textAddress).toBeDefined()
    expect(inventory[textAddress!]).toEqual({
      stablePath: 'surface:slide:course-stable/scene:scene-stable/layer:text-stable/content.data.text',
      jsonPointer: '/surfaces/0/scenes/0/layerItems/0/content/data/text',
      valueKind: 'string',
      label: '文字',
    })
    expect(textAddress).toMatch(/^courseware:\/\/authoring\/course-stable\/scene\//)
    expect(JSON.stringify(inventory)).not.toContain('二次函数')
    expect(deriveCourseProjectAuthoringInventorySnapshot(project)).toMatchObject({
      projectId: 'course-stable',
      revision: 0,
      entries: inventory,
    })

    const changed = structuredClone(project)
    changed.revision = 1
    const slide = changed.surfaces[0]
    if (slide.type !== 'slide') throw new Error('expected slide surface')
    const text = slide.scenes[0]!.layerItems.find((item) => item.layerItemId === 'text-stable')
    if (!text || text.kind !== 'native' || text.content.nativeType !== 'text') {
      throw new Error('expected text layer')
    }
    text.content.data.text = '已修改文字'
    expect(deriveCourseProjectAuthoringInventory(changed)).toEqual(inventory)
  })

  it('defines one canonical layer order and deterministic repair helpers', () => {
    const slide = makeSlideProject().surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide surface')
    const items = slide.scenes[0]!.layerItems
    const shuffled = [
      { ...items[1]!, order: 1 },
      { ...items[0]!, order: 0 },
    ]

    expect(isCanonicalLayerOrder(shuffled)).toBe(false)
    expect(getEffectiveLayerOrder(shuffled).map((item) => item.layerItemId)).toEqual([
      items[0]!.layerItemId,
      items[1]!.layerItemId,
    ])
    const repaired = reindexLayerItems(shuffled)
    expect(repaired.map((item) => item.order)).toEqual([0, 1])
    expect(isCanonicalLayerOrder(repaired)).toBe(true)

    const invalidProject = makeSlideProject()
    const invalidSlide = invalidProject.surfaces[0]
    if (invalidSlide.type !== 'slide') throw new Error('expected slide surface')
    invalidSlide.scenes[0]!.layerItems = shuffled
    expect(courseProjectDocumentSchema.safeParse(invalidProject).success).toBe(false)
  })

  it('accepts the finite Flow block union and traverses its asset/component references', () => {
    const project = makeSlideProject()
    addPortableImage(project, 'shared-image')
    makeComponentPackage(project)
    project.surfaces = [makeFlowSurface()]
    project.locations = [{
      id: 'location-flow',
      label: '讲义开头',
      kind: 'flow-block',
      surfaceId: 'surface-flow',
      blockId: 'heading',
    }]
    project.startLocationId = 'location-flow'

    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
    const references = collectCourseProjectReferences(project)
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'asset', id: 'shared-image' }),
      expect.objectContaining({ kind: 'component', id: 'component.quiz', version: '4.0.0' }),
    ]))
    expect(Object.values(deriveCourseProjectAuthoringInventory(project))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: '列表层级：list-item-1',
        jsonPointer: expect.stringMatching(/\/items\/0\/level$/u),
        valueKind: 'number',
      }),
    ]))
  })

  it('rejects mismatched asset MIME, Flow media kinds and invalid list hierarchy', () => {
    const project = makeSlideProject()
    addPortableImage(project, 'shared-image')
    makeComponentPackage(project)
    project.surfaces = [makeFlowSurface()]
    project.locations = [{
      id: 'location-flow',
      label: '讲义开头',
      kind: 'flow-block',
      surfaceId: 'surface-flow',
      blockId: 'heading',
    }]
    project.startLocationId = 'location-flow'

    const badMime = structuredClone(project)
    badMime.assets['shared-image']!.mimeType = 'audio/mpeg'
    expect(courseProjectDocumentSchema.safeParse(badMime).success).toBe(false)

    const wrongMediaKind = structuredClone(project)
    const wrongMediaSurface = wrongMediaKind.surfaces[0]
    if (wrongMediaSurface?.type !== 'flow') throw new Error('expected flow surface')
    const media = wrongMediaSurface.blocks.find((block) => block.type === 'media')
    if (!media || media.type !== 'media') throw new Error('expected media block')
    media.mediaKind = 'audio'
    expect(courseProjectDocumentSchema.safeParse(wrongMediaKind).success).toBe(false)

    const skippedLevel = structuredClone(makeFlowSurface())
    if (skippedLevel.type !== 'flow') throw new Error('expected flow surface')
    skippedLevel.blocks = [{
      id: 'bad-list',
      type: 'list',
      ordered: false,
      items: [
        { id: 'root', text: '根项目', level: 0 },
        { id: 'skipped', text: '跨级项目', level: 2 },
      ],
    }]
    expect(courseSurfaceSchema.safeParse(skippedLevel).success).toBe(false)

    const missingRoot = structuredClone(skippedLevel)
    if (missingRoot.type !== 'flow' || missingRoot.blocks[0]?.type !== 'list') throw new Error('expected list')
    missingRoot.blocks[0].items = [{ id: 'child-only', text: '没有根项目', level: 1 }]
    expect(courseSurfaceSchema.safeParse(missingRoot).success).toBe(false)
  })

  it('accepts Spatial world coordinates, camera frames and semantic zoom', () => {
    const project = makeSlideProject()
    const slide = project.surfaces[0]
    if (slide.type !== 'slide') throw new Error('expected slide surface')
    const nativeItem = slide.scenes[0]!.layerItems.find((item) => item.kind === 'native')!
    project.surfaces = [makeSpatialSurface(nativeItem)]
    project.locations = [{
      id: 'location-spatial',
      label: '空间总览',
      kind: 'spatial-camera',
      surfaceId: 'surface-spatial',
      cameraFrameId: 'camera-overview',
    }]
    project.startLocationId = 'location-spatial'

    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
    const dirty = structuredClone(project)
    const surface = dirty.surfaces[0]
    if (surface.type !== 'spatial-2d') throw new Error('expected spatial surface')
    surface.semanticZoom[0]!.layerItemIds = ['missing-item']
    expect(courseProjectDocumentSchema.safeParse(dirty).success).toBe(false)
  })

  it('requires an explicit, type-safe print plan for a mixed course', () => {
    const project = makeSlideProject()
    addPortableImage(project, 'shared-image')
    makeComponentPackage(project)
    const slide = project.surfaces[0]
    if (slide.type !== 'slide') throw new Error('expected slide surface')
    const nativeItem = slide.scenes[0]!.layerItems.find((item) => item.kind === 'native')!
    project.surfaces = [slide, makeFlowSurface(), makeSpatialSurface(nativeItem)]
    project.locations.push(
      {
        id: 'location-flow',
        label: '讲义开头',
        kind: 'flow-block',
        surfaceId: 'surface-flow',
        blockId: 'heading',
      },
      {
        id: 'location-spatial',
        label: '空间总览',
        kind: 'spatial-camera',
        surfaceId: 'surface-spatial',
        cameraFrameId: 'camera-overview',
      },
    )
    project.courseState = [{ key: 'ready', valueType: 'boolean', defaultValue: false }]
    project.navigationGuards = [{
      id: 'guard-ready',
      effect: 'block',
      toLocationIds: ['location-spatial'],
      match: 'all',
      conditions: [{ type: 'compare', key: 'ready', operator: 'eq', value: true }],
      message: '请先完成阅读',
    }]

    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(false)
    project.mixedPrintPlan = {
      pageSize: 'surface-native',
      orientation: 'auto',
      entries: [
        {
          id: 'print-slide',
          kind: 'slide-scenes',
          surfaceId: slide.id,
          sceneIds: slide.scenes.map((scene) => scene.id),
        },
        { id: 'print-flow', kind: 'flow-document', surfaceId: 'surface-flow' },
        {
          id: 'print-spatial',
          kind: 'spatial-frames',
          surfaceId: 'surface-spatial',
          cameraFrameIds: ['camera-overview'],
        },
      ],
    }
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)

    const redirecting = structuredClone(project) as unknown as {
      navigationGuards: Array<Record<string, unknown>>
    }
    redirecting.navigationGuards[0]!.redirectLocationId = 'location-flow'
    expect(courseProjectDocumentSchema.safeParse(redirecting).success).toBe(false)
  })

  it('defines a strict one-way Published Course V2 boundary', () => {
    const authoring = makeSlideProject()
    const slide = authoring.surfaces[0]
    if (slide.type !== 'slide') throw new Error('expected slide surface')
    const published: PublishedCourseV2Payload = {
      format: 'h5course-published',
      formatVersion: 2,
      sourceSchemaVersion: 9,
      courseId: authoring.id,
      title: authoring.title,
      assets: {
        'runtime-fallback': { mimeType: 'image/png', url: 'data:image/png;base64,AA==' },
      },
      components: {},
      designTokens: authoring.designTokens,
      media: authoring.media,
      playback: authoring.playback,
      courseState: [],
      navigationGuards: [],
      locations: authoring.locations,
      startLocationId: authoring.startLocationId,
      globalLayerItems: [],
      globalInteractions: [],
      surfaces: [{
        id: slide.id,
        title: slide.title,
        type: 'slide',
        canvas: slide.canvas,
        surfaceLayerItems: [],
        scenes: slide.scenes.map((scene) => ({
          id: scene.id,
          name: scene.name,
          backgroundColor: scene.backgroundColor,
          backgroundAssetId: scene.backgroundAssetId,
          interactions: scene.interactions,
          layerItems: scene.layerItems.map((item) => {
            const { locked: _locked, ...publishedItem } = item
            if (publishedItem.kind !== 'runtime') return publishedItem
            const { source: _source, ...runtime } = publishedItem.runtime
            return {
              ...publishedItem,
              runtime: {
                ...runtime,
                code: { encoding: 'base64-utf16le', data: 'QQA=' },
              },
            }
          }),
          presentation: scene.presentation
            ? {
                initialStateId: scene.presentation.initialStateId,
                states: scene.presentation.states.map((state) => ({
                  id: state.id,
                  name: state.name,
                  backgroundColor: state.backgroundColor,
                  backgroundAssetId: state.backgroundAssetId,
                  layerItemOverrides: state.layerItemOverrides,
                  layerItemOrder: state.layerItemOrder,
                })),
              }
            : undefined,
        })),
      }],
    }

    expect(publishedCourseV2Schema.safeParse(published).success).toBe(true)
    expect(publishedCourseV2Schema.safeParse({ ...published, createdAt: 'author-only' }).success).toBe(false)

    const legacyPublished = structuredClone(published) as unknown as {
      surfaces: Array<{ scenes: Array<{ layerItems: Array<{
        kind: string
        runtime?: { protocol: string; runtimeApiVersion: number }
      }> }> }>
    }
    const legacyRuntime = legacyPublished.surfaces[0]!.scenes[0]!.layerItems.find(
      (item) => item.kind === 'runtime',
    )!.runtime!
    legacyRuntime.protocol = 'legacy-runtime-v2'
    legacyRuntime.runtimeApiVersion = 2
    expect(publishedCourseV2Schema.safeParse(legacyPublished).success).toBe(false)
  })
})
