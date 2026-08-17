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
  LegacyComponentPackageMigrationConflictError,
  migrateProjectV8ToCourseProjectV9,
  ProjectV8MigrationCompatibilityError,
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
import type { ProjectDocument } from '@/shared/projectTypes'
import {
  createBlankFlowCourse,
  createBlankSlideCourse,
  createBlankSpatialCourse,
} from '@/renderer/course/courseLocationCommands'
import {
  importProjectV8ArchiveAsCourseProject,
  inspectCourseProjectArchiveIdentity,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import { shouldOfferCourseProjectRecovery } from '@/renderer/project/courseProjectLifecycle'
import {
  createProject,
  createTextNode,
} from '@/renderer/project/createProject'
import { createProjectArchive } from '@/renderer/project/projectArchive'
import { saveCourseProject } from '@/renderer/project/saveProject'

const HASH = 'a'.repeat(64)

function addPortableImage(project: ProjectDocument, id: string): void {
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

function makeV8ProjectWithStableIds(): ProjectDocument {
  const project = createProject({
    id: 'course-stable',
    title: '多表面协议',
    now: '2026-08-14T00:00:00.000Z',
    includeDefaultController: false,
    controls: 'none',
  })
  const scene = project.scenes[0]!
  scene.id = 'scene-stable'
  scene.name = '稳定场景'
  scene.nodes.push(createTextNode({
    id: 'text-stable',
    name: '稳定文字',
    text: '二次函数',
    x: 100,
    y: 120,
  }))
  addPortableImage(project, 'runtime-fallback')
  scene.runtime = {
    runtimeApiVersion: 2,
    enabled: true,
    renderMode: 'hybrid',
    source: 'CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})',
    content: { values: { title: '运行时标题' } },
    assets: {},
    nodeBindings: { title: 'text-stable' },
    staticFallback: {
      assetId: 'runtime-fallback',
      coverage: 'runtime-layer',
      layer: 'overlay',
    },
  }
  return project
}

function makeSlideProject(): CourseProjectDocument {
  return migrateProjectV8ToCourseProjectV9(makeV8ProjectWithStableIds())
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
      items: [{ id: 'list-item-1', text: '第一项' }],
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
  it('migrates V8 purely into one slide surface while retaining existing ids', () => {
    const source = makeV8ProjectWithStableIds()
    source.scenes[0]!.presentation = {
      initialStateId: 'state-locked',
      states: [{
        id: 'state-locked',
        name: '锁定复核态',
        nodeOverrides: { 'text-stable': { locked: true } },
      }],
    }
    const before = structuredClone(source)
    const migrated = migrateProjectV8ToCourseProjectV9(source)

    expect(source).toEqual(before)
    expect(courseProjectDocumentSchema.parse(migrated)).toEqual(migrated)
    expect(migrated).toMatchObject({
      schemaVersion: 9,
      id: 'course-stable',
      revision: 0,
      startLocationId: 'scene-stable',
      surfaces: [{
        type: 'slide',
        scenes: [{ id: 'scene-stable' }],
      }],
    })

    const slide = migrated.surfaces[0]
    expect(slide?.type).toBe('slide')
    if (slide?.type !== 'slide') throw new Error('expected slide surface')
    expect(slide.scenes[0]?.layerItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'runtime',
        frame: { mode: 'legacy-whole-canvas', x: 0, y: 0, width: 1280, height: 720 },
        runtime: expect.objectContaining({
          protocol: 'legacy-runtime-v2',
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

  it('normalizes one embedded component version and rejects ambiguous versions without mutating input', () => {
    const packageId = 'com.example.legacy-widget'
    const metadata = (version: string) => ({
      packageId,
      version,
      name: `Legacy widget ${version}`,
      manifestPath: `components/${packageId}@${version}/manifest.json`,
      runtimePath: `components/${packageId}@${version}/runtime.js`,
      contentSha256: HASH,
    })
    const singleVersion = makeV8ProjectWithStableIds()
    singleVersion.componentPackages[`${packageId}@4.0.0`] = metadata('4.0.0')
    const before = structuredClone(singleVersion)

    const migrated = migrateProjectV8ToCourseProjectV9(singleVersion)

    expect(Object.keys(migrated.componentPackages)).toEqual([packageId])
    expect(migrated.componentPackages[packageId]).toEqual(metadata('4.0.0'))
    expect(singleVersion).toEqual(before)

    const multipleVersions = makeV8ProjectWithStableIds()
    multipleVersions.componentPackages[`${packageId}@4.0.0`] = metadata('4.0.0')
    multipleVersions.componentPackages[`${packageId}@5.0.0`] = metadata('5.0.0')
    const conflictingBefore = structuredClone(multipleVersions)

    let migrationError: unknown
    try {
      migrateProjectV8ToCourseProjectV9(multipleVersions)
    } catch (error) {
      migrationError = error
    }
    expect(migrationError).toBeInstanceOf(LegacyComponentPackageMigrationConflictError)
    expect(migrationError).toMatchObject({
      packageId,
      versions: ['4.0.0', '5.0.0'],
    })
    expect((migrationError as Error).message).toMatch(/旧工程.*多个版本/)
    expect((migrationError as Error).message).not.toMatch(/\bV[89]\b/)
    expect(multipleVersions).toEqual(conflictingBefore)
  })

  it('preserves a single legacy Runtime plane and rejects ambiguous dual-plane migration', () => {
    const underlay = makeV8ProjectWithStableIds()
    underlay.scenes[0]!.runtime!.source = `CoursewareRuntime.define({runtimeApiVersion:2,create(ctx){
      ctx.dom.underlay.appendChild(ctx.dom.underlay.ownerDocument.createElement('div'));
      return {destroy(){}};
    }})`
    // Source usage is authoritative; a stale fallback label must not move the
    // executable underlay above authored native content.
    underlay.scenes[0]!.runtime!.staticFallback!.layer = 'overlay'
    const migrated = migrateProjectV8ToCourseProjectV9(underlay)
    const surface = migrated.surfaces[0]
    if (surface?.type !== 'slide') throw new Error('expected slide')
    expect(surface.scenes[0]!.layerItems.map((item) => item.kind)).toEqual([
      'runtime',
      'native',
    ])

    for (const rootExpression of ['ctx.domRoot', 'ctx.dom.root', 'ctx.phaser.root']) {
      const rootAlias = makeV8ProjectWithStableIds()
      rootAlias.scenes[0]!.runtime!.source = `CoursewareRuntime.define({runtimeApiVersion:2,create(ctx){
        ${rootExpression}; return {destroy(){}};
      }})`
      rootAlias.scenes[0]!.runtime!.staticFallback!.layer = 'underlay'
      const aliasSurface = migrateProjectV8ToCourseProjectV9(rootAlias).surfaces[0]
      if (aliasSurface?.type !== 'slide') throw new Error('expected alias slide')
      expect(aliasSurface.scenes[0]!.layerItems.map((item) => item.kind)).toEqual([
        'native',
        'runtime',
      ])
    }

    const ambiguous = makeV8ProjectWithStableIds()
    ambiguous.scenes[0]!.runtime!.source = `CoursewareRuntime.define({runtimeApiVersion:2,create(ctx){
      ctx.phaser.underlay.add(ctx.phaser.scene.add.rectangle(0,0,10,10));
      ctx.dom.overlay.appendChild(ctx.dom.overlay.ownerDocument.createElement('div'));
      return {destroy(){}};
    }})`
    expect(() => migrateProjectV8ToCourseProjectV9(ambiguous)).toThrow(
      ProjectV8MigrationCompatibilityError,
    )
    expect(() => migrateProjectV8ToCourseProjectV9(ambiguous)).toThrow(
      /无法在不改变显示层级/,
    )
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
    addPortableImage(project as unknown as ProjectDocument, 'shared-image')
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
    addPortableImage(project as unknown as ProjectDocument, 'shared-image')
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
            const { label: _label, locked: _locked, ...publishedItem } = item
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
  })

  it('saves T03 blank courses as schema 9 and keeps V8 behind an explicit import report', () => {
    for (const created of [
      createBlankSlideCourse({ id: 'proto-slide', now: '2026-08-17T11:00:00.000Z' }),
      createBlankFlowCourse({ id: 'proto-flow', now: '2026-08-17T11:00:00.000Z' }),
      createBlankSpatialCourse({ id: 'proto-spatial', now: '2026-08-17T11:00:00.000Z' }),
    ]) {
      expect(created.project.schemaVersion).toBe(9)
      expect(created.project).not.toHaveProperty('projectMode')
      const saved = saveCourseProject({
        project: created.project,
        assetFiles: {},
        componentFiles: {},
      }, '2026-08-17T11:00:00.000Z')
      const reopened = openCourseProjectArchive(saved.bytes)
      expect(reopened.project.schemaVersion).toBe(9)
      expect(reopened.project.id).toBe(created.project.id)
    }

    const v8 = createProject({
      id: 'course-stable',
      title: '多表面协议',
      now: '2026-08-14T00:00:00.000Z',
      includeDefaultController: false,
      controls: 'none',
    })
    const v8Bytes = createProjectArchive({
      project: v8,
      assetFiles: {},
      componentFiles: {},
    })
    expect(() => openCourseProjectArchive(v8Bytes)).toThrow(/显式迁移/)
    const imported = importProjectV8ArchiveAsCourseProject(v8Bytes)
    expect(imported.report).toMatchObject({
      sourceFormat: 'legacy-course',
      targetFormat: 'current-course',
      projectId: 'course-stable',
      surfaceCount: 1,
      locationCount: 1,
    })
    expect(imported.report.notes.some((note) => note.includes('另存为新文件'))).toBe(true)
    expect(inspectCourseProjectArchiveIdentity(saveCourseProject(imported).bytes).schemaVersion)
      .toBe(9)
    expect(shouldOfferCourseProjectRecovery({
      recovery: { schemaVersion: 8, projectId: 'course-stable', revision: 0, updatedAt: null, title: null },
      official: null,
    })).toBe('ignore-legacy-default')
    expect(shouldOfferCourseProjectRecovery({
      recovery: {
        schemaVersion: 9,
        projectId: 'course-stable',
        revision: 0,
        updatedAt: '2026-08-17T11:00:00.000Z',
        title: null,
      },
      official: {
        schemaVersion: 9,
        projectId: 'course-stable',
        revision: 2,
        updatedAt: '2026-08-17T12:00:00.000Z',
        title: null,
      },
    })).toBe('ignore-stale-official')
  })
})
