import { strFromU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentPackageData } from '@/shared/componentTypes'
import { componentContentSha256 } from '@/shared/componentContentIntegrity'
import { migrateProjectV8ToCourseProjectV9 } from '@/shared/courseProjectModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  FlowSurfaceDocument,
  LayerItem,
  ScopedLayerItem,
  SpatialSurfaceDocument,
} from '@/shared/courseProjectTypes'
import { publishedCourseV2Schema } from '@/shared/publishedCourseSchema'
import type { AssetMeta, ProjectDocument } from '@/shared/projectTypes'
import {
  createCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  createProject,
  createTextNode,
} from '@/renderer/project/createProject'
import {
  buildPublishedCourseV2Payload,
  collectPublishedCourseAssetIds,
} from '@/renderer/export/course/buildPublishedCourse'
import {
  buildPublishedCourseStandaloneHtml,
  buildPublishedCourseWebPackageFiles,
} from '@/renderer/export/course/buildCoursePackages'
import { buildCoursePrintArtifacts } from '@/renderer/export/course/buildCoursePrintArtifacts'
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
  const v8 = createProject({
    id: 'published-course',
    title: '多表面发布课件',
    now: '2026-08-14T00:00:00.000Z',
    includeDefaultController: false,
    controls: 'none',
  })
  v8.scenes[0]!.id = 'slide-scene'
  v8.scenes[0]!.name = 'Slide'
  v8.scenes[0]!.nodes.push(createTextNode({ id: 'slide-text', text: '可编辑标题' }))
  v8.assets['runtime-fallback'] = asset('runtime-fallback')
  v8.scenes[0]!.runtime = {
    runtimeApiVersion: 2,
    enabled: true,
    renderMode: 'dom',
    source: `CoursewareRuntime.define({runtimeApiVersion:2,create(ctx){const p=document.createElement('p');p.textContent=ctx.content.get('label');ctx.dom.root.appendChild(p);return{destroy(){p.remove()}}}})`,
    content: { values: { label: 'Runtime' } },
    assets: {},
    staticFallback: {
      assetId: 'runtime-fallback',
      coverage: 'runtime-layer',
      layer: 'overlay',
    },
  }
  const project = migrateProjectV8ToCourseProjectV9(v8)
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

function teacherControllerLayer(): ScopedLayerItem {
  return {
    item: {
      layerItemId: 'course-teacher-controller',
      label: '教师控制器',
      frame: { mode: 'absolute', x: 190, y: 638, width: 900, height: 64 },
      order: 50,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      kind: 'native',
      content: {
        nativeType: 'teacher-controller',
        data: {
          title: '教师控制台',
          showSceneProgress: true,
          compact: false,
          collapsible: true,
          defaultCollapsed: false,
          buttons: [
            { id: 'previous', action: { type: 'scene.previous' }, label: '上一页', visible: true },
            { id: 'next', action: { type: 'scene.next' }, label: '下一页', visible: true },
            { id: 'replay', action: { type: 'scene.replay' }, label: '重播', visible: true },
            { id: 'restart', action: { type: 'course.restart' }, label: '重新开始', visible: true },
            { id: 'picker', action: { type: 'scene.open-picker' }, label: '场景目录', visible: true },
            { id: 'sound', action: { type: 'audio.toggle-mute' }, label: '声音', visible: true },
          ],
          style: {
            backgroundColor: '#172033',
            backgroundOpacity: 0.94,
            accentColor: '#e7b85c',
            textColor: '#f8fafc',
            cornerRadius: 16,
          },
          includeInStaticExports: false,
        },
      },
    },
    visibility: { mode: 'all', locationIds: [] },
  }
}

function videoLayerItem(id: string): LayerItem {
  return {
    layerItemId: id,
    label: id,
    frame: { mode: 'absolute', x: 60, y: 80, width: 320, height: 180 },
    order: 3,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    kind: 'native',
    content: {
      nativeType: 'video',
      data: {
        assetId: 'unused',
        fit: 'cover',
        autoplay: false,
        loop: false,
        muted: false,
        volume: 0.5,
        playbackRate: 1,
        showControls: true,
        clickToToggle: false,
        startTime: 0,
        endTime: null,
        poster: { mode: 'image', time: 0, assetId: 'unused' },
        backgroundAudioMode: 'none',
      },
    },
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
    expect(published.sourceSchemaVersion).toBe(9)
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
    expect(runtime?.kind === 'runtime' ? runtime.runtime.source : '').toContain('CoursewareRuntime.define')
  })

  it('rejects a raw V8 project as the default publish input', () => {
    const v8 = createProject({
      id: 'v8-raw',
      title: 'V8 工程',
      includeDefaultController: false,
      controls: 'none',
    })
    expect(() => buildPublishedCourseV2Payload({
      project: v8 as unknown as CourseProjectDocument,
      assetFiles: {},
      components: {},
    })).toThrow()
  })

  it('builds a genuinely self-contained single HTML and file-relative web package', () => {
    const sources = fixture()
    const html = buildPublishedCourseStandaloneHtml(sources, 'window.CoursePlayerBundle=true;')
    expect(html).toContain('window.__H5_COURSE_PAYLOAD__=')
    expect(html).toContain('data:image/png;base64,')
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toContain('.course-nav')

    const files = buildPublishedCourseWebPackageFiles(sources, 'window.CoursePlayerBundle=true;')
    const courseData = strFromU8(files['course-data.js']!)
    expect(courseData).toContain('window.__H5_COURSE_PAYLOAD__=')
    expect(courseData).toContain('./assets/')
    expect(courseData).toContain('./component-assets/')
    expect(courseData).not.toContain('data:image/png;base64,')
    expect(files['index.html']).toBeDefined()
    expect(files['player/player.iife.js']).toBeDefined()
    const playerCss = strFromU8(files['player/player.css']!)
    expect(playerCss).not.toContain('.course-nav')
    expect(playerCss).not.toContain('grid-template-rows')
    expect(playerCss).toContain('.course-stage{position:relative;width:100%;height:100%')
    expect(Object.keys(files).some((path) => path.includes('unused'))).toBe(false)
    // Files can be zipped/unzipped without changing the offline path graph.
    const archiveFiles = unzipSync(zipSync(files))
    expect(Object.keys(archiveFiles).sort()).toEqual(Object.keys(files).sort())
  })

  it('keeps print failures local and reports export differences explicitly', async () => {
    const sources = fixture()
    const result = await buildCoursePrintArtifacts(sources.project, {
      resolveAsset: (id) => `data:image/png;base64,${id}`,
      captureSlide: async () => { throw new Error('isolated Slide capture failure') },
    })
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toMatchObject({ surfaceId: expect.any(String), target: 'pdf' })
    expect(result.artifact?.pages.map((page) => page.surfaceKind)).toEqual(['flow', 'spatial-2d'])
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
    expect(result.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ surfaceKind: 'flow', target: 'docx', disposition: 'preserved' }),
      expect.objectContaining({ surfaceKind: 'spatial-2d', target: 'pptx', disposition: 'omitted' }),
    ]))
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
      warnings: ['flow runtime capture warning'],
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
    expect(result.artifact?.warnings).toContain('flow runtime capture warning')
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
    expect(root.querySelector('.course-nav')).toBeNull()
    expect(root.querySelector('[data-course-location-label]')).toBeNull()
    await app.destroy()
    expect(root.childElementCount).toBe(0)
    root.remove()
  })

  it('executes a published Slide click interaction through the real Course Player', async () => {
    const sources = fixture()
    // Same single-Slide focus as the boot smoke: this test is about the
    // interaction contract, not about multi-surface navigation.
    sources.project.surfaces = [sources.project.surfaces[0]!]
    sources.project.locations = [sources.project.locations[0]!]
    sources.project.startLocationId = sources.project.locations[0]!.id
    delete sources.project.mixedPrintPlan
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    const textItemId = slide.scenes[0]!.layerItems.find((item) => item.kind === 'native')!.layerItemId
    slide.scenes[0]!.interactions = [{
      id: 'reveal-on-click',
      enabled: true,
      trigger: { type: 'node.click', nodeId: textItemId },
      conditions: [{ type: 'presentation.in', stateIds: ['slide-base'] }],
      actions: [{
        id: 'reveal-step',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'presentation.set', stateId: 'slide-state-cover' },
      }],
    }]
    const published = buildPublishedCourseV2Payload(sources)
    const publishedSlide = published.surfaces[0]!
    if (publishedSlide.type !== 'slide') throw new Error('expected Slide')
    expect(publishedSlide.scenes[0]!.interactions).toHaveLength(1)

    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)
    expect(root.querySelector('.slide-surface')).toHaveAttribute('data-state-id', 'slide-base')
    const target = root.querySelector<HTMLElement>(`[data-layer-item-id="${textItemId}"]`)
    expect(target).not.toBeNull()
    target!.dispatchEvent(new Event('pointerup', { bubbles: true }))
    await vi.waitFor(() => {
      expect(root.querySelector('.slide-surface')).toHaveAttribute('data-state-id', 'slide-state-cover')
    })
    expect(app.presentationState(publishedSlide.id).current).toBe('slide-state-cover')
    expect(app.diagnostics).toEqual([])
    await app.destroy()
    expect(root.childElementCount).toBe(0)
    root.remove()
  })

  it('starts the published course at the hash-provided presentation state', async () => {
    const sources = fixture()
    // Same single-Slide focus as the other player smokes: this test is about
    // the deep-linked start state used by the editor trial run overlay.
    sources.project.surfaces = [sources.project.surfaces[0]!]
    sources.project.locations = [sources.project.locations[0]!]
    sources.project.startLocationId = sources.project.locations[0]!.id
    delete sources.project.mixedPrintPlan
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    history.replaceState(null, '', '#location=location-slide&state=slide-state-cover')
    const app = await startPublishedCourse(published, root)
    expect(app.currentLocationId).toBe('location-slide')
    expect(root.querySelector('.slide-surface')).toHaveAttribute('data-state-id', 'slide-state-cover')
    expect(app.presentationState(published.surfaces[0]!.id).current).toBe('slide-state-cover')
    expect(app.diagnostics).toEqual([])
    await app.destroy()
    root.remove()
    history.replaceState(null, '', '#')
  })

  it.each(['none', 'canvas'] as const)(
    'never mounts the removed outer navigation when playback controls are %s',
    async (controls) => {
      const sources = controls === 'canvas'
        ? {
            project: createCourseProject({ id: 'published-canvas-controls' }),
            assetFiles: {},
            components: {},
          }
        : fixture()
      sources.project.playback.controls = controls
      const published = buildPublishedCourseV2Payload(sources)
      const root = document.createElement('div')
      document.body.appendChild(root)
      const app = await startPublishedCourse(published, root)

      expect(root.querySelector('.course-nav')).toBeNull()
      expect(root.querySelector('[data-course-location-label]')).toBeNull()
      if (controls === 'canvas') {
        expect(root.querySelector('[data-controller-button-id]')).not.toBeNull()
      }
      expect(await app.navigate(sources.project.startLocationId)).toBe(true)
      expect(app.currentLocationId).toBe(sources.project.startLocationId)

      await app.destroy()
      root.remove()
    },
  )

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

  it('stops the interaction chain with a teacher error when navigation is blocked', async () => {
    const sources = fixture()
    sources.project.surfaces = [sources.project.surfaces[0]!]
    sources.project.locations = [sources.project.locations[0]!]
    sources.project.startLocationId = sources.project.locations[0]!.id
    delete sources.project.mixedPrintPlan
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    const textItemId = slide.scenes[0]!.layerItems.find((item) => item.kind === 'native')!.layerItemId
    slide.scenes[0]!.interactions = [{
      id: 'reveal-then-next',
      enabled: true,
      trigger: { type: 'node.click', nodeId: textItemId },
      conditions: [],
      actions: [
        {
          id: 'reveal-step',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'presentation.set', stateId: 'slide-state-cover' },
        },
        {
          id: 'next-step',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.next' },
        },
      ],
    }]
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)
    const target = root.querySelector<HTMLElement>(`[data-layer-item-id="${textItemId}"]`)!
    target.dispatchEvent(new Event('pointerup', { bubbles: true }))
    await vi.waitFor(() => {
      expect(root.querySelector('.slide-surface')).toHaveAttribute('data-state-id', 'slide-state-cover')
    })
    // The single-location course cannot advance: the chain stops and the
    // failure is a teacher-understandable diagnostic, not an internal id.
    await vi.waitFor(() => {
      expect(app.diagnostics.length).toBeGreaterThan(0)
    })
    expect(app.currentLocationId).toBe('location-slide')
    expect(app.diagnostics.some((entry) => (
      entry.phase === 'execute' && entry.message.includes('已停止后续动作')
    ))).toBe(true)
    expect(app.diagnostics.some((entry) => (
      entry.message.includes('location') || entry.message.includes('slide')
    ))).toBe(false)
    await app.destroy()
    root.remove()
  })

  it('stops the chain when a presentation switch fails instead of navigating on', async () => {
    const sources = fixture()
    sources.project.surfaces = [sources.project.surfaces[0]!]
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    const sceneTwo = structuredClone(slide.scenes[0]!)
    sceneTwo.id = 'slide-scene-2'
    sceneTwo.name = 'Slide 2'
    sceneTwo.interactions = []
    slide.scenes.push(sceneTwo)
    sources.project.locations = [
      sources.project.locations[0]!,
      {
        id: 'location-slide-2',
        label: 'Slide 2',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: sceneTwo.id,
      },
    ]
    sources.project.startLocationId = sources.project.locations[0]!.id
    delete sources.project.mixedPrintPlan
    const textItemId = slide.scenes[0]!.layerItems.find((item) => item.kind === 'native')!.layerItemId
    slide.scenes[0]!.interactions = [{
      id: 'bad-state-then-next',
      enabled: true,
      trigger: { type: 'node.click', nodeId: textItemId },
      conditions: [],
      actions: [
        {
          id: 'bad-state-step',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'presentation.set', stateId: 'missing-state' },
        },
        {
          id: 'next-step',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.next' },
        },
      ],
    }]
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)
    const target = root.querySelector<HTMLElement>(`[data-layer-item-id="${textItemId}"]`)!
    target.dispatchEvent(new Event('pointerup', { bubbles: true }))
    await vi.waitFor(() => {
      expect(app.diagnostics.length).toBeGreaterThan(0)
    })
    // The state switch failed, so the dependent navigation must not run.
    expect(app.currentLocationId).toBe('location-slide')
    expect(root.querySelector('.slide-surface')).toHaveAttribute('data-state-id', 'slide-base')
    expect(app.diagnostics.some((entry) => (
      entry.phase === 'execute' && entry.message.includes('状态切换未执行')
    ))).toBe(true)
    await app.destroy()
    root.remove()
  })

  it('navigates the whole course location order from a canvas teacher controller', async () => {
    const sources = fixture()
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'canvas'
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)
    expect(app.currentLocationId).toBe('location-slide')
    const slideSurfaceId = sources.project.surfaces[0]!.id

    const slideNext = root.querySelector<HTMLButtonElement>(
      `[data-surface-id="${slideSurfaceId}"] [data-controller-button-id="next"]`,
    )!
    slideNext.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-flow'))
    expect(root.querySelector('[data-surface-id="flow-surface"]')).toBeVisible()

    // The Flow overlay reuses the same controller contract and single owner:
    // its previous button moves the whole course back to the Slide location.
    const flowPrevious = root.querySelector<HTMLButtonElement>(
      '[data-surface-id="flow-surface"] [data-controller-button-id="previous"]',
    )!
    flowPrevious.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-slide'))
    expect(root.querySelector('.slide-surface')).toBeVisible()

    await app.destroy()
    root.remove()
  })

  it('keeps the controller session on replay and restores project defaults on restart', async () => {
    const sources = fixture()
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    const sceneTwo = structuredClone(slide.scenes[0]!)
    sceneTwo.id = 'slide-scene-2'
    sceneTwo.name = 'Slide 2'
    sceneTwo.interactions = []
    slide.scenes.push(sceneTwo)
    sources.project.surfaces = [slide]
    sources.project.locations = [
      {
        id: 'location-slide',
        label: 'Slide 1',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: slide.scenes[0]!.id,
      },
      {
        id: 'location-slide-2',
        label: 'Slide 2',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: sceneTwo.id,
      },
    ]
    sources.project.startLocationId = 'location-slide'
    delete sources.project.mixedPrintPlan
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'canvas'
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)
    const slideSurfaceId = sources.project.surfaces[0]!.id

    root.querySelector<HTMLButtonElement>(
      `[data-surface-id="${slideSurfaceId}"] [data-controller-button-id="next"]`,
    )!.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-slide-2'))
    // Collapse the controller; the session belongs to the course run.
    root.querySelector<HTMLButtonElement>('[data-teacher-controller-collapse]')!.click()
    expect(root.querySelector('[data-controller-button-id]')).toBeNull()

    // Replay only replays the current semantic unit: the collapse persists.
    await app.replay()
    await vi.waitFor(() => {
      expect(root.querySelector('.slide-surface')).toHaveAttribute('data-scene-id', 'slide-scene-2')
    })
    expect(app.currentLocationId).toBe('location-slide-2')
    expect(root.querySelector('[data-controller-button-id]')).toBeNull()
    expect(root.querySelector<HTMLButtonElement>('[data-teacher-controller-collapse]'))
      .toHaveTextContent('展')

    // Expand, then restart: the course restart restores the project defaults.
    root.querySelector<HTMLButtonElement>('[data-teacher-controller-collapse]')!.click()
    root.querySelector<HTMLButtonElement>('[data-controller-button-id="restart"]')!.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-slide'))
    expect(root.querySelector('.slide-surface')).toHaveAttribute('data-scene-id', slide.scenes[0]!.id)
    expect(root.querySelector<HTMLButtonElement>('[data-teacher-controller-collapse]'))
      .toHaveTextContent('收')
    expect(root.querySelector<HTMLButtonElement>('[data-controller-button-id="sound"]'))
      .toHaveTextContent('声音 · 开')

    await app.destroy()
    root.remove()
  })

  it('opens the scene directory from the teacher controller and jumps guarded', async () => {
    const sources = fixture()
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    const sceneTwo = structuredClone(slide.scenes[0]!)
    sceneTwo.id = 'slide-scene-2'
    sceneTwo.name = 'Slide 2'
    sceneTwo.interactions = []
    slide.scenes.push(sceneTwo)
    sources.project.surfaces = [slide]
    sources.project.locations = [
      {
        id: 'location-slide',
        label: 'Slide 1',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: slide.scenes[0]!.id,
      },
      {
        id: 'location-slide-2',
        label: 'Slide 2',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: sceneTwo.id,
      },
    ]
    sources.project.startLocationId = 'location-slide'
    delete sources.project.mixedPrintPlan
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'canvas'
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)
    const slideSurfaceId = sources.project.surfaces[0]!.id

    root.querySelector<HTMLButtonElement>(
      `[data-surface-id="${slideSurfaceId}"] [data-controller-button-id="picker"]`,
    )!.click()
    await vi.waitFor(() => {
      expect(root.querySelector('[data-scene-id="slide-scene-2"]')).not.toBeNull()
    })
    ;(root.querySelector<HTMLButtonElement>('[data-scene-id="slide-scene-2"]')!).click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-slide-2'))
    expect(root.querySelector('.lesson-scene-picker-layer')).not.toBeVisible()

    await app.destroy()
    root.remove()
  })

  it('lists Slide, Flow and Spatial locations in the published scene directory', async () => {
    const sources = fixture()
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'canvas'
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)

    root.querySelector<HTMLButtonElement>('[data-controller-button-id="picker"]')!.click()
    await vi.waitFor(() => {
      expect(root.querySelector('[data-location-id="location-flow"]')).not.toBeNull()
    })
    const items = [...root.querySelectorAll<HTMLButtonElement>('.lesson-scene-picker__item')]
    expect(items.map((button) => button.dataset.locationId)).toEqual([
      'location-slide',
      'location-flow',
      'location-spatial',
    ])
    expect(items.map((button) => button.dataset.kind)).toEqual([
      'slide-scene',
      'flow-block',
      'spatial-camera',
    ])
    items[2]!.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-spatial'))
    expect(root.querySelector('[data-surface-id="spatial-surface"]')).toBeVisible()

    await app.destroy()
    root.remove()
  })

  it('toggles course session mute across all media and refreshes the controller label', async () => {
    const sources = fixture()
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    slide.scenes[0]!.layerItems.push(videoLayerItem('slide-video'))
    sources.project.surfaces = [slide]
    sources.project.locations = [sources.project.locations[0]!]
    sources.project.startLocationId = sources.project.locations[0]!.id
    delete sources.project.mixedPrintPlan
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'canvas'
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)

    const video = root.querySelector<HTMLVideoElement>('[data-asset-id="unused"]')!
    expect(video.muted).toBe(false)
    const sound = root.querySelector<HTMLButtonElement>('[data-controller-button-id="sound"]')!
    expect(sound).toHaveTextContent('声音 · 开')

    sound.click()
    await vi.waitFor(() => expect(video.muted).toBe(true))
    expect(root.querySelector<HTMLButtonElement>('[data-controller-button-id="sound"]'))
      .toHaveTextContent('声音 · 关')

    root.querySelector<HTMLButtonElement>('[data-controller-button-id="sound"]')!.click()
    await vi.waitFor(() => expect(video.muted).toBe(false))
    expect(root.querySelector<HTMLButtonElement>('[data-controller-button-id="sound"]'))
      .toHaveTextContent('声音 · 开')

    await app.destroy()
    root.remove()
  })

  it('delivers no authorable controller when playback controls are none', async () => {
    const sources = fixture()
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'none'
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)
    const wrapper = root.querySelector<HTMLElement>(
      '[data-layer-item-id="course-teacher-controller"]',
    )!
    // The authored controller is not delivered: its compositor wrapper is
    // hidden, so neither the canvas nor the hit test exposes it.
    expect(wrapper.hidden).toBe(true)
    expect(root.querySelector('.slide-native-teacher-controller')).not.toBeVisible()
    await app.destroy()
    root.remove()
  })

  it('replays only the current semantic unit: one fresh entry, session and course state kept', async () => {
    history.replaceState(null, '', '#')
    const sources = fixture()
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    const sceneTwo = structuredClone(slide.scenes[0]!)
    sceneTwo.id = 'slide-scene-2'
    sceneTwo.name = 'Slide 2'
    sceneTwo.interactions = []
    slide.scenes.push(sceneTwo)
    sources.project.surfaces = [slide]
    sources.project.locations = [
      {
        id: 'location-slide',
        label: 'Slide 1',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: slide.scenes[0]!.id,
      },
      {
        id: 'location-slide-2',
        label: 'Slide 2',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: sceneTwo.id,
      },
    ]
    sources.project.startLocationId = 'location-slide'
    delete sources.project.mixedPrintPlan
    sources.project.courseState = [{ key: 'attempts', valueType: 'number', defaultValue: 0 }]
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'canvas'
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)

    root.querySelector<HTMLButtonElement>('[data-controller-button-id="next"]')!.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-slide-2'))
    // Mutate session + course state before the replay.
    app.courseState.increment('attempts', 3)
    root.querySelector<HTMLButtonElement>('[data-teacher-controller-collapse]')!.click()

    const enters: Array<{ sceneId?: string }> = []
    const exits: Array<{ sceneId?: string }> = []
    app.events.on('scene:enter', (detail) => { enters.push(detail as { sceneId?: string }) })
    app.events.on('scene:exit', (detail) => { exits.push(detail as { sceneId?: string }) })

    await app.replay()

    // Replay replays the current scene exactly once: no exit, one fresh entry.
    expect(enters.map((entry) => entry.sceneId)).toEqual(['slide-scene-2'])
    expect(exits).toEqual([])
    expect(app.currentLocationId).toBe('location-slide-2')
    expect(root.querySelector('.slide-surface')).toHaveAttribute('data-scene-id', 'slide-scene-2')
    // Session state (collapse) and course state survive a replay.
    expect(root.querySelector('[data-controller-button-id]')).toBeNull()
    expect(app.courseState.get('attempts')).toBe(3)

    await app.destroy()
    root.remove()
    history.replaceState(null, '', '#')
  })

  it('restarts the whole course session to project defaults with a single fresh entry', async () => {
    history.replaceState(null, '', '#')
    const sources = fixture()
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    slide.scenes[0]!.layerItems.push(videoLayerItem('slide-video'))
    const sceneTwo = structuredClone(slide.scenes[0]!)
    sceneTwo.id = 'slide-scene-2'
    sceneTwo.name = 'Slide 2'
    sceneTwo.interactions = []
    slide.scenes.push(sceneTwo)
    sources.project.surfaces = [slide]
    sources.project.locations = [
      {
        id: 'location-slide',
        label: 'Slide 1',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: slide.scenes[0]!.id,
      },
      {
        id: 'location-slide-2',
        label: 'Slide 2',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: sceneTwo.id,
      },
    ]
    sources.project.startLocationId = 'location-slide'
    delete sources.project.mixedPrintPlan
    sources.project.courseState = [{ key: 'attempts', valueType: 'number', defaultValue: 0 }]
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'canvas'
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)

    root.querySelector<HTMLButtonElement>('[data-controller-button-id="next"]')!.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-slide-2'))
    app.courseState.increment('attempts', 3)
    root.querySelector<HTMLButtonElement>('[data-controller-button-id="sound"]')!.click()
    await vi.waitFor(() => expect(
      root.querySelector<HTMLVideoElement>('[data-asset-id="unused"]')!.muted,
    ).toBe(true))
    root.querySelector<HTMLButtonElement>('[data-teacher-controller-collapse]')!.click()

    const enters: Array<{ sceneId?: string }> = []
    app.events.on('scene:enter', (detail) => { enters.push(detail as { sceneId?: string }) })
    // Expand again so the restart button is reachable.
    root.querySelector<HTMLButtonElement>('[data-teacher-controller-collapse]')!.click()
    root.querySelector<HTMLButtonElement>('[data-controller-button-id="restart"]')!.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-slide'))

    // The start scene is entered exactly once and every session state resets
    // to the project defaults: location, course state, mute, controller.
    expect(enters.map((entry) => entry.sceneId)).toEqual(['slide-scene'])
    expect(root.querySelector('.slide-surface')).toHaveAttribute('data-scene-id', slide.scenes[0]!.id)
    expect(app.courseState.get('attempts')).toBe(0)
    expect(root.querySelector<HTMLVideoElement>('[data-asset-id="unused"]')!.muted).toBe(false)
    expect(root.querySelector<HTMLButtonElement>('[data-teacher-controller-collapse]'))
      .toHaveTextContent('收')
    expect(root.querySelector<HTMLButtonElement>('[data-controller-button-id="sound"]'))
      .toHaveTextContent('声音 · 开')

    await app.destroy()
    root.remove()
    history.replaceState(null, '', '#')
  })

  it('routes controller navigation through guards evaluated on the same course state', async () => {
    history.replaceState(null, '', '#')
    const sources = fixture()
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    const sceneTwo = structuredClone(slide.scenes[0]!)
    sceneTwo.id = 'slide-scene-2'
    sceneTwo.name = 'Slide 2'
    sceneTwo.interactions = []
    slide.scenes.push(sceneTwo)
    sources.project.surfaces = [slide]
    sources.project.locations = [
      {
        id: 'location-slide',
        label: 'Slide 1',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: slide.scenes[0]!.id,
      },
      {
        id: 'location-slide-2',
        label: 'Slide 2',
        kind: 'slide-scene',
        surfaceId: slide.id,
        sceneId: sceneTwo.id,
      },
    ]
    sources.project.startLocationId = 'location-slide'
    delete sources.project.mixedPrintPlan
    sources.project.courseState = [{ key: 'attempts', valueType: 'number', defaultValue: 0 }]
    sources.project.navigationGuards = [{
      id: 'attempts-before-scene-2',
      effect: 'block',
      toLocationIds: ['location-slide-2'],
      match: 'all',
      conditions: [{ type: 'compare', key: 'attempts', operator: 'gte', value: 1 }],
      message: '请先完成一次尝试',
    }]
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'canvas'
    const published = buildPublishedCourseV2Payload(sources)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)
    const next = root.querySelector<HTMLButtonElement>('[data-controller-button-id="next"]')!

    // The runtime-facing course state gates the controller action: no state
    // change yet, so the guarded navigation is blocked with a teacher notice.
    next.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-slide'))
    expect(root.querySelector('[data-course-player-notice]')).toHaveTextContent('请先完成一次尝试')
    expect(root.querySelector('.slide-surface')).toHaveAttribute('data-scene-id', 'slide-scene')

    // Mutating the same course state (as a Runtime/Component session does)
    // unblocks the identical controller action.
    app.courseState.increment('attempts', 1)
    next.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('location-slide-2'))
    expect(root.querySelector('.slide-surface')).toHaveAttribute('data-scene-id', 'slide-scene-2')
    expect(app.diagnostics).toEqual([])

    await app.destroy()
    root.remove()
    history.replaceState(null, '', '#')
  })

  it('never mutates the project or published payload across session operations', async () => {
    history.replaceState(null, '', '#')
    const sources = fixture()
    sources.project.courseState = [{ key: 'attempts', valueType: 'number', defaultValue: 0 }]
    const published = buildPublishedCourseV2Payload(sources)
    const projectBefore = JSON.stringify(sources.project)
    const payloadBefore = JSON.stringify(published)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(published, root)

    // Exercise every session operation: navigation, replay, checkpoint
    // restore, mute and restart. None of them may touch the authoring project
    // or the published payload (the player owns no editor history/dirty).
    await app.navigate('location-flow', 'presenter')
    await app.navigate('location-spatial', 'presenter')
    await app.navigate('location-slide', 'presenter')
    await app.replay()
    app.courseState.increment('attempts', 2)
    const checkpoint = app.courseState.checkpoint()
    app.courseState.set('attempts', 9)
    app.courseState.restore(checkpoint)
    expect(app.courseState.get('attempts')).toBe(2)
    await app.restart()
    expect(app.courseState.get('attempts')).toBe(0)

    await app.destroy()
    expect(JSON.stringify(sources.project)).toBe(projectBefore)
    expect(JSON.stringify(published)).toBe(payloadBefore)
    root.remove()
    history.replaceState(null, '', '#')
  })

  it('full-destroys the session without subscriptions, media or DOM leaks and keeps sessions isolated', async () => {
    history.replaceState(null, '', '#')
    const sources = fixture()
    const slide = sources.project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected Slide')
    slide.scenes[0]!.layerItems.push(videoLayerItem('slide-video'))
    sources.project.surfaces = [slide]
    sources.project.locations = [sources.project.locations[0]!]
    sources.project.startLocationId = sources.project.locations[0]!.id
    delete sources.project.mixedPrintPlan
    sources.project.globalLayerItems.push(teacherControllerLayer())
    sources.project.playback.controls = 'canvas'
    const published = buildPublishedCourseV2Payload(sources)
    const rootA = document.createElement('div')
    const rootB = document.createElement('div')
    document.body.appendChild(rootA)
    document.body.appendChild(rootB)
    const appA = await startPublishedCourse(published, rootA)
    const appB = await startPublishedCourse(published, rootB)

    // Two sessions over the same payload are independent: mutate A only.
    expect(appA.events.listenerCount()).toBeGreaterThan(0)
    rootA.querySelector<HTMLButtonElement>('[data-controller-button-id="picker"]')!.click()
    await vi.waitFor(() => {
      expect(rootA.querySelector('.lesson-scene-picker-layer')).toBeVisible()
    })
    rootA.querySelector<HTMLButtonElement>('[data-controller-button-id="sound"]')!.click()
    await vi.waitFor(() => expect(
      rootA.querySelector<HTMLVideoElement>('[data-asset-id="unused"]')!.muted,
    ).toBe(true))

    await appA.destroy()
    // Destroy releases every subscription, audio element, picker and the DOM.
    expect(rootA.childElementCount).toBe(0)
    expect(appA.events.listenerCount()).toBe(0)
    expect(rootA.querySelector('.lesson-scene-picker-layer')).toBeNull()
    expect(rootA.querySelector('.slide-native-teacher-controller')).toBeNull()
    expect(rootA.querySelector('audio, video')).toBeNull()
    expect(rootA.querySelector('[data-course-player-notice]')).toBeNull()

    // Session B is untouched and still fully functional.
    expect(rootB.querySelector('.slide-surface')).not.toBeNull()
    expect(rootB.querySelector<HTMLVideoElement>('[data-asset-id="unused"]')!.muted).toBe(false)
    expect(appB.events.listenerCount()).toBeGreaterThan(0)
    await appB.destroy()
    expect(rootB.childElementCount).toBe(0)
    expect(appB.events.listenerCount()).toBe(0)
    rootA.remove()
    rootB.remove()
    history.replaceState(null, '', '#')
  })
})
