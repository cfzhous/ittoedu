import { strFromU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentPackageData } from '@/shared/componentTypes'
import { componentContentSha256 } from '@/shared/componentContentIntegrity'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  FlowSurfaceDocument,
  LayerItem,
  NativeLayerItem,
  SpatialSurfaceDocument,
} from '@/shared/courseProjectTypes'
import { publishedCourseV2Schema } from '@/shared/publishedCourseSchema'
import type { AssetMeta } from '@/shared/projectTypes'
import {
  addSlideTextLayer,
  createCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  buildPublishedCourseV2Payload,
  collectPublishedCourseAssetIds,
} from '@/renderer/export/course/buildPublishedCourse'
import {
  buildPublishedCourseStandaloneHtml,
  buildPublishedCourseWebPackageFiles,
} from '@/renderer/export/course/buildCoursePackages'
import {
  buildCoursePrintArtifacts,
  buildFlowStaticExportLayerPlan,
} from '@/renderer/export/course/buildCoursePrintArtifacts'
import { buildFlowDocx } from '@/renderer/export/course/flowDocx'
import {
  publishedCourseToPlayerDocument,
} from '@/player/publishedCourse'
import { startPublishedCourse } from '@/player/PublishedCourseApp'

function asset(id: string, kind: AssetMeta['kind'] = 'image'): AssetMeta {
  const mimeType = kind === 'audio' ? 'audio/mpeg' : kind === 'video' ? 'video/mp4' : 'image/png'
  return {
    id,
    filename: `${id}.${kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : 'png'}`,
    mimeType,
    kind,
    path: `assets/${id}`,
    byteLength: 3,
  }
}

function staticExcludedTeacherController(): NativeLayerItem {
  return {
    layerItemId: 'spatial-controller-internal',
    label: '授课导航',
    kind: 'native',
    frame: { mode: 'absolute', x: 20, y: 680, width: 600, height: 64 },
    order: 50,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    content: {
      nativeType: 'teacher-controller',
      data: {
        title: '教师导航',
        showSceneProgress: true,
        compact: false,
        collapsible: false,
        defaultCollapsed: false,
        buttons: [{ id: 'next', label: '下一页', visible: true, action: { type: 'scene.next' } }],
        style: {
          backgroundColor: '#172033', backgroundOpacity: 1,
          accentColor: '#e7b85c', textColor: '#f8fafc', cornerRadius: 12,
        },
        includeInStaticExports: false,
      },
    },
  }
}

function componentPackage(): ComponentPackageData {
  const manifest: ComponentPackageData['manifest'] = {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    id: 'component.quiz',
    name: 'Quiz',
    version: '4.0.0',
    entry: 'runtime.js',
    defaultSize: { width: 400, height: 240 },
    minSize: { width: 200, height: 120 },
    preserveAspectRatio: false,
    assets: { icon: 'assets/icon.png' },
    defaultProps: { cover: 'default-cover', prompt: 'default prompt' },
    supportedScopes: ['scene'],
    renderMode: 'dom',
    editor: {
      properties: [{ key: 'cover', label: 'Cover', type: 'image' }],
    },
  }
  const runtimeSource = `window.CoursewareComponent.define({id:'component.quiz',runtimeApiVersion:4,create(ctx){const button=document.createElement('button');button.textContent=String(ctx.props.prompt);button.addEventListener('click',()=>{button.dataset.clickCount=String(Number(button.dataset.clickCount||0)+1)});ctx.dom.root.appendChild(button);return{suspend(){ctx.dom.root.dataset.lifecycle='suspended'},resume(){ctx.dom.root.dataset.lifecycle='resumed'},destroy(){button.remove()}}}})`
  const files = {
    'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
    'runtime.js': new TextEncoder().encode(runtimeSource),
    'assets/icon.png': new Uint8Array([9, 8, 7]),
  }
  return { manifest, runtimeSource, files, contentSha256: componentContentSha256(files) }
}

function fixture(): {
  project: CourseProjectDocument
  assetFiles: Record<string, Uint8Array>
  components: Record<string, ComponentPackageData>
} {
  let project = createCourseProject({
    id: 'published-course',
    title: '多表面发布课件',
    now: '2026-08-14T00:00:00.000Z',
  })
  project.globalLayerItems = []
  const initialSlide = project.surfaces[0]
  if (!initialSlide || initialSlide.type !== 'slide') throw new Error('expected Slide')
  initialSlide.scenes[0]!.id = 'slide-scene'
  initialSlide.scenes[0]!.name = 'Slide'
  project.locations[0] = {
    id: 'location-slide',
    label: 'Slide',
    kind: 'slide-scene',
    surfaceId: initialSlide.id,
    sceneId: 'slide-scene',
  }
  project.startLocationId = 'location-slide'
  project = addSlideTextLayer(project, initialSlide.id, 'slide-scene', '可编辑标题', {
    id: 'slide-text',
    now: '2026-08-14T00:00:00.000Z',
  })
  project.assets['runtime-fallback'] = asset('runtime-fallback')
  const currentSlide = project.surfaces[0]
  if (!currentSlide || currentSlide.type !== 'slide') throw new Error('expected Slide')
  currentSlide.scenes[0]!.layerItems.push({
    layerItemId: 'slide-runtime',
    label: 'Runtime',
    frame: { mode: 'absolute', x: 0, y: 0, width: 640, height: 360 },
    order: 1,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'surface',
    playbackInitialVisibility: 'inherit',
    kind: 'runtime',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: `CoursewareSurfaceRuntime.define({runtimeApiVersion:3,create(ctx){const p=document.createElement('p');p.textContent=ctx.content.get('label');ctx.dom.root.appendChild(p);return{destroy(){p.remove()}}}})`,
      content: { values: { label: 'Runtime' } },
      assets: {},
      staticFallback: { assetId: 'runtime-fallback', coverage: 'surface' },
    },
  })
  const quiz = componentPackage()
  project.componentPackages['component.quiz'] = {
    packageId: 'component.quiz',
    version: '4.0.0',
    name: 'Quiz',
    manifestPath: 'components/component.quiz/manifest.json',
    runtimePath: 'components/component.quiz/runtime.js',
    contentSha256: quiz.contentSha256!,
  }
  for (const id of ['flow-image', 'component-fallback', 'instance-cover', 'state-cover', 'unused']) {
    project.assets[id] = asset(id)
  }

  const flow: FlowSurfaceDocument = {
    id: 'flow-surface',
    title: 'Flow',
    type: 'flow',
    surfaceLayerItems: [],
    layout: { readingWidth: 760, wideContentWidth: 1120 },
    blocks: [
      { id: 'flow-heading', type: 'heading', level: 1, text: '长文标题' },
      {
        id: 'flow-list',
        type: 'list',
        ordered: true,
        items: [
          { id: 'flow-list-root', text: '观察图像', level: 0 },
          { id: 'flow-list-child', text: '记录顶点', level: 1 },
        ],
      },
      {
        id: 'flow-media', type: 'media', assetId: 'flow-image', mediaKind: 'image',
        altText: '图像', layout: 'content-width',
      },
      {
        id: 'flow-component',
        type: 'component',
        component: { packageId: 'component.quiz', version: '4.0.0' },
        props: { prompt: '本题', cover: 'instance-cover' },
        staticFallbackAssetId: 'component-fallback',
      },
    ],
  }
  const slide = project.surfaces[0]!
  if (slide.type !== 'slide') throw new Error('expected Slide')
  slide.scenes[0]!.layerItems.push({
    layerItemId: 'slide-component',
    label: 'Slide quiz',
    frame: { mode: 'absolute', x: 700, y: 120, width: 400, height: 240 },
    order: 2,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    kind: 'component',
    component: { packageId: 'component.quiz', version: '4.0.0' },
    props: { prompt: '幻灯片题', cover: 'instance-cover' },
    staticFallbackAssetId: 'component-fallback',
  })
  slide.scenes[0]!.presentation = {
    initialStateId: 'slide-base',
    states: [
      { id: 'slide-base', name: '基础', layerItemOverrides: {} },
      {
        id: 'slide-state-cover',
        name: '换图',
        layerItemOverrides: {
          'slide-component': { componentProps: { cover: 'state-cover' } },
        },
      },
    ],
  }
  const sourceText = slide.scenes[0]!.layerItems.find((item) => item.kind === 'native')!
  const spatialItem = structuredClone(sourceText) as LayerItem
  spatialItem.layerItemId = 'spatial-text'
  spatialItem.label = 'Spatial text'
  spatialItem.order = 0
  const spatial: SpatialSurfaceDocument = {
    id: 'spatial-surface',
    title: 'Spatial',
    type: 'spatial-2d',
    surfaceLayerItems: [],
    world: { bounds: { mode: 'finite', x: -500, y: -400, width: 1000, height: 800 }, layerItems: [spatialItem] },
    camera: { home: { x: 0, y: 0, zoom: 1 }, frames: [{ id: 'spatial-home', name: 'Home', x: 0, y: 0, zoom: 1 }] },
    relations: [],
    semanticZoom: [],
  }
  project.surfaces = [slide, flow, spatial]
  project.locations = [
    { id: 'location-slide', label: 'Slide', kind: 'slide-scene', surfaceId: slide.id, sceneId: slide.scenes[0]!.id },
    { id: 'location-flow', label: 'Flow', kind: 'flow-block', surfaceId: flow.id, blockId: 'flow-heading' },
    { id: 'location-spatial', label: 'Spatial', kind: 'spatial-camera', surfaceId: spatial.id, cameraFrameId: 'spatial-home' },
  ]
  project.startLocationId = 'location-slide'
  project.mixedPrintPlan = {
    pageSize: 'surface-native',
    orientation: 'auto',
    entries: [
      { id: 'print-slide', kind: 'slide-scenes', surfaceId: slide.id, sceneIds: [slide.scenes[0]!.id] },
      { id: 'print-flow', kind: 'flow-document', surfaceId: flow.id },
      { id: 'print-spatial', kind: 'spatial-frames', surfaceId: spatial.id, cameraFrameIds: ['spatial-home'] },
    ],
  }
  courseProjectDocumentSchema.parse(project)
  return {
    project,
    assetFiles: Object.fromEntries(Object.keys(project.assets).map((id) => [id, new Uint8Array([1, 2, 3])])),
    components: { 'component.quiz': quiz },
  }
}

describe('Published Course V2 product pipeline', () => {
  it('publishes Slide, Flow, Spatial and exact asset/component closure', () => {
    const sources = fixture()
    expect([...collectPublishedCourseAssetIds(sources)].sort()).toEqual([
      'component-fallback',
      'flow-image',
      'instance-cover',
      'runtime-fallback',
      'state-cover',
    ])
    const published = buildPublishedCourseV2Payload(sources)
    expect(publishedCourseV2Schema.parse(published)).toEqual(published)
    expect(published.surfaces.map((surface) => surface.type)).toEqual(['slide', 'flow', 'spatial-2d'])
    expect(Object.keys(published.assets).sort()).toEqual([
      'component-fallback', 'flow-image', 'instance-cover', 'runtime-fallback', 'state-cover',
    ])
    expect(Object.keys(published.components)).toEqual(['component.quiz@4.0.0'])
    expect(published.components['component.quiz@4.0.0']?.assets.icon.url).toMatch(/^data:image\/png;base64,/)
    const hydrated = publishedCourseToPlayerDocument(published)
    expect(hydrated.surfaces.map((surface) => surface.type)).toEqual(['slide', 'flow', 'spatial-2d'])
    const publishedSlide = hydrated.surfaces[0]
    if (publishedSlide.type !== 'slide') throw new Error('expected Slide')
    const runtime = publishedSlide.scenes[0]!.layerItems.find((item) => item.kind === 'runtime')
    const wireRuntime = published.surfaces[0]?.type === 'slide'
      ? published.surfaces[0].scenes[0]?.layerItems.find((item) => item.kind === 'runtime')
      : undefined
    expect(wireRuntime?.label).toBe('Runtime')
    expect(runtime?.label).toBe('Runtime')
    expect(runtime?.label).not.toBe(runtime?.layerItemId)
    expect(runtime?.kind === 'runtime' ? runtime.runtime.source : '').toContain('CoursewareSurfaceRuntime.define')
    const publishedFlow = published.surfaces.find((surface) => surface.type === 'flow')
    const publishedList = publishedFlow?.type === 'flow'
      ? publishedFlow.blocks.find((block) => block.type === 'list')
      : undefined
    expect(publishedList?.type === 'list' ? publishedList.items : []).toEqual([
      { id: 'flow-list-root', text: '观察图像', level: 0 },
      { id: 'flow-list-child', text: '记录顶点', level: 1 },
    ])
  })

  it('builds a genuinely self-contained single HTML and file-relative web package', () => {
    const sources = fixture()
    const html = buildPublishedCourseStandaloneHtml(sources, 'window.CoursePlayerBundle=true;')
    expect(html).toContain('window.__H5_COURSE_PAYLOAD__=')
    expect(html).toContain('data:image/png;base64,')
    expect(html).not.toMatch(/https?:\/\//)

    const files = buildPublishedCourseWebPackageFiles(sources, 'window.CoursePlayerBundle=true;')
    const courseData = strFromU8(files['course-data.js']!)
    expect(courseData).toContain('window.__H5_COURSE_PAYLOAD__=')
    expect(courseData).toContain('./assets/')
    expect(courseData).toContain('./component-assets/')
    expect(courseData).not.toContain('data:image/png;base64,')
    expect(files['index.html']).toBeDefined()
    expect(files['player/player.iife.js']).toBeDefined()
    expect(Object.keys(files).some((path) => path.includes('unused'))).toBe(false)
    // Files can be zipped/unzipped without changing the offline path graph.
    const archiveFiles = unzipSync(zipSync(files))
    expect(Object.keys(archiveFiles).sort()).toEqual(Object.keys(files).sort())
  })

  it('keeps print failures local and reports export differences explicitly', async () => {
    const sources = fixture()
    const captureSlide = vi.fn(async (context: { locationId: string }) => {
      expect(context.locationId).toBe('location-slide')
      throw new Error('幻灯片画面生成失败')
    })
    const result = await buildCoursePrintArtifacts(sources.project, {
      resolveAsset: (id) => `data:image/png;base64,${id}`,
      captureSlide,
    })
    expect(captureSlide).toHaveBeenCalledOnce()
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toMatchObject({ surfaceId: expect.any(String), target: 'pdf' })
    expect(result.artifact?.pages.map((page) => page.surfaceKind)).toEqual([
      'flow',
      'spatial-2d',
      'spatial-2d',
    ])
    const spatialPages = result.artifact?.pages.filter((page) => page.surfaceKind === 'spatial-2d') ?? []
    expect(spatialPages.map((page) => page.title)).toEqual(['Spatial — 首页', 'Home'])
    expect(spatialPages.map((page) => page.sourceFrameId)).toEqual([undefined, 'spatial-home'])
    const spatialPage = result.artifact?.pages.find((page) => page.surfaceKind === 'spatial-2d')
    expect(spatialPage?.bodyHtml).toContain('viewBox="0 0 1120 760"')
    const artifact = result.artifact
    if (!artifact) throw new Error('mixed print artifact missing')
    const flowPageIndex = artifact.pages.findIndex((page) => page.surfaceKind === 'flow')
    const flowScope = `.mixed-page-${flowPageIndex} .course-flow-print-fragment`
    expect(artifact.html).toContain(`<div class="course-flow-print-fragment" style="box-sizing:border-box;min-height:100%;padding:18mm 17mm 20mm">`)
    expect(artifact.html).toContain(`${flowScope} table{border-collapse:collapse;width:100%}`)
    expect(artifact.html).toContain(`${flowScope} .flow-surface{max-width:none;padding:0;line-height:1.65}`)
    expect(artifact.html).not.toContain('@page{size:A4')
    expect(artifact.html.match(/@page\b/gu)).toHaveLength(artifact.pages.length)
    expect(artifact.pages.filter((page) => page.surfaceKind !== 'flow').every(
      (page) => !page.bodyHtml.includes('course-flow-print-fragment'),
    )).toBe(true)
    const flowPage = artifact.pages.find((page) => page.surfaceKind === 'flow')
    expect(flowPage?.bodyHtml).toContain('Quiz')
    expect(artifact.warnings.join('\n')).toContain('“Quiz”在 PDF 中使用静态预览')
    expect(artifact.warnings.join('\n')).not.toMatch(/component\.quiz|flow-component/u)
    expect(result.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ surfaceKind: 'flow', target: 'docx', disposition: 'preserved' }),
      expect.objectContaining({ surfaceKind: 'spatial-2d', target: 'pptx', disposition: 'omitted' }),
    ]))
  })

  it('prints Spatial world, surface and global layers in Player order for the camera location', async () => {
    const sources = fixture()
    const spatial = sources.project.surfaces.find((surface) => surface.type === 'spatial-2d')
    if (!spatial || spatial.type !== 'spatial-2d') throw new Error('Spatial fixture missing')
    const world = spatial.world.layerItems[0]!
    world.order = 10
    const global = structuredClone(world)
    global.layerItemId = 'spatial-global-visible'
    global.label = '全课程图层'
    global.order = 20
    const surface = structuredClone(world)
    surface.layerItemId = 'spatial-surface-visible'
    surface.label = '当前空间图层'
    surface.order = 30
    const hidden = structuredClone(world)
    hidden.layerItemId = 'spatial-surface-hidden'
    hidden.label = '其他位置图层'
    hidden.order = 40
    sources.project.globalLayerItems = [{
      item: global,
      visibility: { mode: 'include', locationIds: ['location-spatial'] },
    }]
    spatial.surfaceLayerItems = [
      { item: surface, visibility: { mode: 'include', locationIds: ['location-spatial'] } },
      { item: hidden, visibility: { mode: 'exclude', locationIds: ['location-spatial'] } },
    ]

    const result = await buildCoursePrintArtifacts(sources.project, {
      captureSlide: async () => '<section>slide capture</section>',
    })
    expect(result.failures).toEqual([])
    const body = result.artifact?.pages.find((page) => page.surfaceKind === 'spatial-2d')?.bodyHtml ?? ''
    const worldIndex = body.indexOf('data-layer-item-id="spatial-text"')
    const globalIndex = body.indexOf('data-layer-item-id="spatial-global-visible"')
    const surfaceIndex = body.indexOf('data-layer-item-id="spatial-surface-visible"')
    expect(worldIndex).toBeGreaterThan(-1)
    expect(worldIndex).toBeLessThan(globalIndex)
    expect(globalIndex).toBeLessThan(surfaceIndex)
    expect(body).not.toContain('data-layer-item-id="spatial-surface-hidden"')
  })

  it('空间 PDF 按教师设置省略控制器并给出可读说明', async () => {
    const sources = fixture()
    const spatial = sources.project.surfaces.find((surface) => surface.type === 'spatial-2d')
    if (!spatial || spatial.type !== 'spatial-2d') throw new Error('Spatial fixture missing')
    spatial.world.layerItems.push(staticExcludedTeacherController())
    const result = await buildCoursePrintArtifacts(sources.project, {
      captureSlide: async () => '<section>幻灯片画面</section>',
    })
    const body = result.artifact?.pages.find((page) => page.surfaceKind === 'spatial-2d')?.bodyHtml ?? ''
    expect(body).not.toContain('data-layer-item-id="spatial-controller-internal"')
    expect(result.artifact?.warnings).toContain('教师控制器“授课导航”已按静态导出设置省略。')
    expect(result.artifact?.warnings.join('\n')).not.toMatch(/spatial-controller-internal|includeInStaticExports/u)
  })

  it('流式 PDF 与 Word 合并各课程位置的可见图层而不静默丢失', async () => {
    const sources = fixture()
    const flow = sources.project.surfaces.find((surface) => surface.type === 'flow')
    const slide = sources.project.surfaces.find((surface) => surface.type === 'slide')
    if (!flow || flow.type !== 'flow' || !slide || slide.type !== 'slide') throw new Error('fixture surfaces missing')
    sources.project.locations.push({
      id: 'location-flow-details',
      label: '进阶练习',
      kind: 'flow-block',
      surfaceId: flow.id,
      blockId: 'flow-component',
    })
    const lateLayer = structuredClone(slide.scenes[0]!.layerItems.find((item) => item.kind === 'native')!)
    lateLayer.layerItemId = 'flow-late-internal'
    lateLayer.label = '进阶提示'
    lateLayer.order = 30
    if (lateLayer.kind !== 'native' || lateLayer.content.nativeType !== 'text') {
      throw new Error('expected text layer')
    }
    lateLayer.content.data.text = '进阶提示'
    flow.surfaceLayerItems.push({
      item: lateLayer,
      visibility: { mode: 'include', locationIds: ['location-flow-details'] },
    })
    const captureFlow = vi.fn(async () => ({
      format: 'html' as const,
      content: '<!doctype html><html><head><style>body{margin:0}</style></head><body></body></html>',
      width: 1280,
      height: 720,
    }))
    const result = await buildCoursePrintArtifacts(sources.project, {
      captureSlide: async () => '<section>幻灯片画面</section>',
      captureFlow,
    })
    expect(captureFlow).not.toHaveBeenCalled()
    const flowPage = result.artifact?.pages.find((page) => page.surfaceKind === 'flow')
    expect(flowPage?.bodyHtml).toContain('进阶提示')
    expect(result.artifact?.warnings.join('\n')).toContain('已将各位置可见的内容合并到本次静态导出中')
    expect(result.artifact?.warnings.join('\n')).not.toContain('flow-late-internal')

    const layerPlan = buildFlowStaticExportLayerPlan(sources.project, flow)
    expect(layerPlan.effectiveLayerItems.map((entry) => entry.item.layerItemId)).toContain('flow-late-internal')
    const docx = buildFlowDocx(flow, {
      locationId: layerPlan.primaryLocationId,
      effectiveLayerItems: layerPlan.effectiveLayerItems,
    })
    const documentXml = strFromU8(unzipSync(docx.bytes)['word/document.xml']!)
    expect(documentXml).toContain('进阶提示')
  })

  it('uses the real Flow capture for PDF whenever unified Flow layers exist', async () => {
    const sources = fixture()
    const flow = sources.project.surfaces.find((surface) => surface.type === 'flow')
    const slide = sources.project.surfaces.find((surface) => surface.type === 'slide')
    if (!flow || flow.type !== 'flow' || !slide || slide.type !== 'slide') throw new Error('fixture surfaces missing')
    const native = structuredClone(slide.scenes[0]!.layerItems.find((item) => item.kind === 'native')!)
    native.layerItemId = 'flow-print-native'
    native.order = 3
    flow.surfaceLayerItems.push({ item: native, visibility: { mode: 'all', locationIds: [] } })
    const captureFlow = vi.fn(async () => ({
      format: 'html' as const,
      content: '<!doctype html><html><head></head><body><main data-real-flow-capture="true">ordered layers</main></body></html>',
      warnings: ['动态内容已使用当前画面导出。'],
    }))
    const result = await buildCoursePrintArtifacts(sources.project, {
      resolveAsset: (id) => `data:image/png;base64,${id}`,
      captureSlide: async () => '<section>slide capture</section>',
      captureFlow,
    })
    expect(captureFlow).toHaveBeenCalledWith(expect.objectContaining({
      surface: expect.objectContaining({ id: 'flow-surface' }),
      locationId: 'location-flow',
    }))
    const flowPage = result.artifact?.pages.find((page) => page.surfaceKind === 'flow')
    expect(flowPage?.bodyHtml).toContain('data-real-flow-capture="true"')
    expect(result.artifact?.warnings).toContain('动态内容已使用当前画面导出。')
    expect(result.failures).toEqual([])
  })

  it('boots the published payload through the real Course Player surface host', async () => {
    const sources = fixture()
    // Keep this player smoke focused on one native Slide; dynamic-host behavior
    // is exercised independently and missing backends fall back per item.
    sources.project.surfaces = [sources.project.surfaces[0]!]
    sources.project.locations = [sources.project.locations[0]!]
    sources.project.startLocationId = sources.project.locations[0]!.id
    delete sources.project.mixedPrintPlan
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)
    expect(app.currentLocationId).toBe('location-slide')
    expect(root.querySelector('.slide-surface')).toBeVisible()
    expect(root.textContent).toContain('可编辑标题')
    expect(root.querySelector('[data-course-location-label]')?.textContent).toContain('Slide')
    await app.destroy()
    expect(root.childElementCount).toBe(0)
    root.remove()
  })

  it('runs a live Flow component and navigates the full mixed-surface payload', async () => {
    history.replaceState(null, '', '#')
    const sources = fixture()
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)

    expect(await app.navigate('location-flow')).toBe(true)
    expect(app.currentLocationId).toBe('location-flow')
    expect(root.querySelector('[data-surface-id="flow-surface"]')).toBeVisible()
    await vi.waitFor(() => {
      expect(root.querySelector('[data-flow-component-id="component.quiz"] button'))
        .toHaveTextContent('本题')
    })
    const flowButton = root.querySelector<HTMLButtonElement>(
      '[data-flow-component-id="component.quiz"] button',
    )!
    flowButton.click()
    expect(flowButton.dataset.clickCount).toBe('1')
    expect(root.querySelector('[data-flow-component-id="component.quiz"]'))
      .not.toHaveAttribute('data-host-error')

    expect(await app.navigate('location-spatial')).toBe(true)
    expect(app.currentLocationId).toBe('location-spatial')
    expect(root.querySelector<HTMLElement>('[data-flow-component-id="component.quiz"]')?.dataset.lifecycle)
      .toBe('suspended')
    expect(root.querySelector('[data-surface-id="spatial-surface"]')).toBeVisible()
    const spatialViewport = root.querySelector<SVGElement>(
      '.spatial-surface[data-surface-id="spatial-surface"] > svg:not(.spatial-minimap)',
    )
    expect(spatialViewport).toHaveAttribute('viewBox', '0 0 1120 760')
    expect(await app.navigate('location-flow')).toBe(true)
    expect(root.querySelector<HTMLElement>('[data-flow-component-id="component.quiz"]')?.dataset.lifecycle)
      .toBe('resumed')
    expect(flowButton.dataset.clickCount).toBe('1')
    expect(await app.navigate('location-slide')).toBe(true)
    expect(root.querySelector('.slide-surface')).toBeVisible()
    expect(app.diagnostics).toEqual([])

    await app.destroy()
    expect(root.childElementCount).toBe(0)
    root.remove()
    history.replaceState(null, '', '#')
  })
})
