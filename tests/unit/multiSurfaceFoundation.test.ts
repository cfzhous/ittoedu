import { describe, expect, it, vi } from 'vitest'
import { SPATIAL_MAX_ZOOM } from '@/shared/courseProjectTypes'
import {
  CoursePlayer,
  FlowSurfaceHost,
  buildFlowOutline,
  buildFlowStandaloneHtml,
  buildMixedDeepLink,
  buildSpatialMinimap,
  cameraWorldViewport,
  cullSpatialItems,
  deleteFlowBlock,
  duplicateFlowBlock,
  expandAllFlowSections,
  findFlowBlock,
  fitSpatialSurfaceCamera,
  insertFlowBlock,
  MixedCourseNavigator,
  moveFlowBlock,
  parseMixedDeepLink,
  renderFlowDocument,
  renderSpatialSurface,
  renderSpatialSvgMarkup,
  screenToWorld,
  searchFlowDocument,
  setFlowSectionCollapsed,
  SpatialSurfaceHost,
  SPATIAL_CANONICAL_VIEWPORT,
  spatialCameraFromPose,
  worldToScreen,
  zoomSpatialCameraAt,
  type FlowSurfaceDocument,
  type SpatialSurfaceDocument,
  type SurfaceHost,
  type SurfaceMountContext,
} from '@/player/surfaces'
import type {
  SlideItemHost,
  SlideItemMountContext,
} from '@/player/surfaces/slide/SlideSurfaceHost'
import type {
  ComponentLayerItem,
  LayerItem,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'

const services = {
  navigate: vi.fn(),
  getCourseState: vi.fn(),
  setCourseState: vi.fn(),
  resolveAsset: (assetId: string) => `asset://${assetId}`,
  reportDiagnostic: vi.fn(),
}

function controlMediaPlayback(element: HTMLMediaElement, initiallyPlaying: boolean) {
  let paused = !initiallyPlaying
  Object.defineProperty(element, 'paused', { configurable: true, get: () => paused })
  Object.defineProperty(element, 'ended', { configurable: true, get: () => false })
  const pause = vi.fn(() => { paused = true })
  const play = vi.fn(() => { paused = false; return Promise.resolve() })
  Object.defineProperty(element, 'pause', { configurable: true, value: pause })
  Object.defineProperty(element, 'play', { configurable: true, value: play })
  return { pause, play }
}

function controlRootAnimation(root: HTMLElement) {
  let playState: AnimationPlayState = 'running'
  const animation = {
    get playState() { return playState },
    pending: false,
    pause: vi.fn(() => { playState = 'paused' }),
    play: vi.fn(() => { playState = 'running' }),
  } as unknown as Animation
  Object.defineProperty(root, 'getAnimations', {
    configurable: true,
    value: vi.fn(() => [animation]),
  })
  return animation
}

function flowDocument(): FlowSurfaceDocument {
  return {
    id: 'flow-main',
    type: 'flow',
    title: '二次函数讲义',
    surfaceLayerItems: [],
    layout: { readingWidth: 760, wideContentWidth: 1040 },
    blocks: [
      { id: 'heading', type: 'heading', level: 1, text: '二次函数' },
      { id: 'intro', type: 'paragraph', text: '开口方向与系数 a 有关。' },
      {
        id: 'section',
        type: 'section',
        title: '探究',
        collapsedByDefault: true,
        blocks: [{ id: 'question', type: 'paragraph', text: '对称轴如何变化？' }],
      },
    ],
  }
}

describe('Flow structured authoring foundation', () => {
  it('inserts, duplicates, moves and deletes nested blocks without mutating the source', () => {
    const source = flowDocument()
    const inserted = insertFlowBlock(
      source,
      { id: 'example', type: 'callout', tone: 'example', body: '令 a=1' },
      'section',
      1,
    )
    expect(source.blocks).toHaveLength(3)
    expect(findFlowBlock(inserted, 'example')?.parentId).toBe('section')

    const duplicated = duplicateFlowBlock(inserted, 'section', (id) => `${id}-copy`)
    expect(findFlowBlock(duplicated, 'question-copy')?.parentId).toBe('section-copy')
    const moved = moveFlowBlock(duplicated, 'intro', 'section', 1)
    expect(findFlowBlock(moved, 'intro')).toMatchObject({ parentId: 'section', index: 1 })
    const deleted = deleteFlowBlock(moved, 'section-copy')
    expect(findFlowBlock(deleted, 'question-copy')).toBeUndefined()
    expect(() => moveFlowBlock(source, 'section', 'question', 0)).toThrow(/descendants/)
  })

  it('builds outline/search indices and expands sections for static output', () => {
    const source = flowDocument()
    expect(buildFlowOutline(source)).toEqual([
      { blockId: 'heading', text: '二次函数', level: 1, kind: 'heading' },
      { blockId: 'section', text: '探究', level: 1, kind: 'section' },
    ])
    expect(searchFlowDocument(source, '对称轴')).toMatchObject([
      { blockId: 'question', field: 'text' },
    ])
    expect(findFlowBlock(expandAllFlowSections(source), 'section')?.block).toMatchObject({ collapsedByDefault: false })
    expect(findFlowBlock(setFlowSectionCollapsed(source, 'section', false), 'section')?.block).toMatchObject({ collapsedByDefault: false })
  })

  it('renders semantic DOM with stable authoring ids and escaped standalone HTML', () => {
    const source = insertFlowBlock(
      flowDocument(),
      { id: 'unsafe', type: 'paragraph', text: '<script>bad()</script>' },
      null,
      3,
    )
    source.blocks.push({
      id: 'outline-list',
      type: 'list',
      ordered: false,
      items: [
        { id: 'root-item', text: '一级项目', level: 0 },
        { id: 'child-item', text: '二级项目', level: 1 },
        { id: 'grandchild-item', text: '三级项目', level: 2 },
        { id: 'root-item-2', text: '另一个一级项目', level: 0 },
      ],
    })
    const article = renderFlowDocument(source, { domDocument: document })
    expect(article.querySelector('[data-flow-block-id="question"]')).toHaveTextContent('对称轴')
    expect(article.querySelector('details')).not.toHaveAttribute('open')
    expect(article.querySelector('[data-flow-list-item-id="root-item"] > ul > [data-flow-list-item-id="child-item"]')).not.toBeNull()
    expect(article.querySelector('[data-flow-list-item-id="child-item"] > ul > [data-flow-list-item-id="grandchild-item"]')).not.toBeNull()
    const standalone = buildFlowStandaloneHtml(source, { expandSections: true })
    expect(standalone).toContain('<details open')
    expect(standalone).toContain('&lt;script&gt;bad()&lt;/script&gt;')
    expect(standalone).not.toContain('<script>bad()</script>')
    expect(standalone).toContain('data-flow-list-level="2"')
  })

  it('uses the teacher component name in static Flow fallback instead of package identity', () => {
    const source = flowDocument()
    source.blocks.push({
      id: 'component-fallback',
      type: 'component',
      component: { packageId: 'technical.package', version: '9.4.1' },
      props: {},
      staticFallbackAssetId: 'fallback-image',
    })
    const options = {
      resolveAsset: () => 'asset://fallback-image',
      resolveComponentName: () => '函数实验器',
    }
    const article = renderFlowDocument(source, { domDocument: document, ...options })
    expect(article.querySelector('[data-flow-block-id="component-fallback"]')).toHaveTextContent('函数实验器')
    expect(article.textContent).not.toContain('technical.package')
    expect(article.textContent).not.toContain('9.4.1')
    const standalone = buildFlowStandaloneHtml(source, options)
    expect(standalone).toContain('函数实验器')
    expect(standalone).not.toContain('technical.package')
    expect(standalone).not.toContain('9.4.1')
  })

  it('freezes first-party Flow media and host animations on the same inspection DOM frame', async () => {
    const source = flowDocument()
    source.blocks.push(
      { id: 'video', type: 'media', assetId: 'video-asset', mediaKind: 'video', layout: 'wide' },
      { id: 'audio', type: 'media', assetId: 'audio-asset', mediaKind: 'audio', layout: 'content-width' },
    )
    const host = new FlowSurfaceHost(source)
    const container = document.createElement('div')
    await host.mount({ surfaceId: source.id, container, services, signal: new AbortController().signal })
    await host.activate()
    const root = container.querySelector<HTMLElement>('.flow-surface-stack')!
    const video = root.querySelector<HTMLVideoElement>('[data-flow-block-id="video"] video')!
    const audio = root.querySelector<HTMLAudioElement>('[data-flow-block-id="audio"] audio')!
    video.currentTime = 18
    const videoControl = controlMediaPlayback(video, true)
    const audioControl = controlMediaPlayback(audio, false)
    const animation = controlRootAnimation(root)

    await host.setInspectionMode('inspect')
    expect(videoControl.pause).toHaveBeenCalledOnce()
    expect(audioControl.pause).not.toHaveBeenCalled()
    expect(animation.pause).toHaveBeenCalledOnce()
    expect(root.querySelector('[data-flow-block-id="video"] video')).toBe(video)
    expect(video.currentTime).toBe(18)

    await host.setInspectionMode('playback')
    expect(videoControl.play).toHaveBeenCalledOnce()
    expect(audioControl.play).not.toHaveBeenCalled()
    expect(animation.play).toHaveBeenCalledOnce()
    expect(root.querySelector('[data-flow-block-id="video"] video')).toBe(video)
    expect(video.currentTime).toBe(18)
    await host.destroy()
  })
})

class TestHost implements SurfaceHost {
  readonly kind = 'flow' as const
  readonly calls: string[] = []
  context?: SurfaceMountContext

  constructor(
    readonly id: string,
    private readonly failPhase?: 'activate' | 'capture' | 'destroy',
  ) {}

  mount(context: SurfaceMountContext): void { this.context = context; this.calls.push('mount') }
  activate(): void { this.calls.push('activate'); if (this.failPhase === 'activate') throw new Error('activate boom') }
  suspend(): void { this.calls.push('suspend') }
  resume(): void { this.calls.push('resume') }
  reset(scope: 'surface' | 'course'): void { this.calls.push(`reset:${scope}`) }
  capture(): { format: 'html'; content: string } {
    this.calls.push('capture')
    if (this.failPhase === 'capture') throw new Error('capture boom')
    return { format: 'html', content: '<main>capture</main>' }
  }
  destroy(): void { this.calls.push('destroy'); if (this.failPhase === 'destroy') throw new Error('destroy boom') }
}

describe('CoursePlayer surface isolation', () => {
  it('serializes lifecycle work and keeps another surface usable after a local failure', async () => {
    const broken = new TestHost('broken', 'activate')
    const healthy = new TestHost('healthy')
    const failures = vi.fn()
    const player = new CoursePlayer([broken, healthy], { services, onFailure: failures })
    await player.mountSurface('broken', document.createElement('div'))
    await player.mountSurface('healthy', document.createElement('div'))
    expect(await player.activateSurface('broken')).toMatchObject({ ok: false })
    expect(player.statusOf('broken')).toBe('failed')
    expect(await player.activateSurface('healthy')).toEqual({ ok: true })
    expect(player.activeSurfaceId).toBe('healthy')
    expect(await player.captureSurface('healthy', { purpose: 'thumbnail' })).toMatchObject({
      ok: true,
      value: { format: 'html', content: '<main>capture</main>' },
    })
    expect(failures).toHaveBeenCalledWith(expect.objectContaining({ surfaceId: 'broken', phase: 'activate' }))
  })

  it('attempts every destroy even when one host cleanup fails', async () => {
    const broken = new TestHost('broken', 'destroy')
    const healthy = new TestHost('healthy')
    const player = new CoursePlayer([broken, healthy], { services })
    await player.mountSurface('broken', document.createElement('div'))
    await player.mountSurface('healthy', document.createElement('div'))
    const results = await player.destroy()
    expect(results.map((result) => result.ok)).toEqual([false, true])
    expect(healthy.calls).toContain('destroy')
    expect(player.listSurfaces().map((surface) => surface.status)).toEqual(['destroyed', 'destroyed'])
  })

  it('treats an unmounted lazy surface as already reset during a course restart', async () => {
    const mounted = new TestHost('mounted')
    const lazy = new TestHost('lazy')
    const player = new CoursePlayer([mounted, lazy], { services })
    await player.mountSurface('mounted', document.createElement('div'))
    expect((await player.resetCourse()).map((result) => result.ok)).toEqual([true, true])
    expect(mounted.calls).toContain('reset:course')
    expect(lazy.calls).not.toContain('reset:course')
    expect(player.statusOf('lazy')).toBe('idle')
  })
})

function spatialDocument(): SpatialSurfaceDocument {
  return {
    id: 'map',
    type: 'spatial-2d',
    title: '知识地图',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'finite', x: -500, y: -300, width: 1000, height: 600 },
      layerItems: [
        {
          layerItemId: 'center', label: '总览', kind: 'native',
          frame: { mode: 'absolute', x: -20, y: -10, width: 40, height: 20 },
          order: 0, visible: true, locked: false, rotation: 0, opacity: 1,
          hitPolicy: 'auto', playbackInitialVisibility: 'inherit',
          content: {
            nativeType: 'text',
            data: {
              text: '总览', runs: [],
              style: {
                fontFamily: 'sans-serif', fontSize: 18, color: '#172033', bold: false,
                italic: false, underline: false, strike: false, emphasis: false,
                highlightColor: null, align: 'left', verticalAlign: 'top',
                writingMode: 'horizontal', lineSpacing: 1.2, letterSpacing: 0,
                padding: 0, overflow: 'fixed', backgroundColor: '#ffffff',
                backgroundOpacity: 0, cornerRadius: 0,
              },
            },
          },
        },
        {
          layerItemId: 'far', label: '远处', kind: 'native',
          frame: { mode: 'absolute', x: 800, y: 800, width: 50, height: 50 },
          order: 1, visible: true, locked: false, rotation: 0, opacity: 1,
          hitPolicy: 'auto', playbackInitialVisibility: 'inherit',
          content: {
            nativeType: 'shape',
            data: {
              shapeType: 'rectangle',
              style: {
                fillColor: '#e2e8f0', fillOpacity: 1, borderColor: '#64748b',
                borderOpacity: 1, borderWidth: 1, lineStyle: 'solid', cornerRadius: 0,
                startArrow: 'none', endArrow: 'none',
              },
            },
          },
        },
      ],
    },
    camera: { home: { x: 0, y: 0, zoom: 1 }, frames: [] },
    relations: [],
    semanticZoom: [{ id: 'detail-only', layerItemIds: ['center'], minZoom: 0, maxZoom: 1.5, visible: false }],
  }
}

describe('Spatial 2D foundation', () => {
  it('keeps world/screen transforms invertible and zooms around the pointer', () => {
    const camera = { ...spatialDocument().camera.home, viewportWidth: 400, viewportHeight: 240 }
    const point = { x: 40, y: -20 }
    expect(screenToWorld(camera, worldToScreen(camera, point))).toEqual(point)
    const anchor = { x: 300, y: 100 }
    const before = screenToWorld(camera, anchor)
    const zoomed = zoomSpatialCameraAt(camera, 2, anchor)
    expect(screenToWorld(zoomed, anchor).x).toBeCloseTo(before.x)
    expect(screenToWorld(zoomed, anchor).y).toBeCloseTo(before.y)
  })

  it('fits and reloads saved cameras against the shared edit, play and print viewport', () => {
    const spatial = spatialDocument()
    const pose = fitSpatialSurfaceCamera(spatial)
    const first = spatialCameraFromPose(pose, SPATIAL_CANONICAL_VIEWPORT)
    const reloadedPose = JSON.parse(JSON.stringify(pose))
    const reloaded = spatialCameraFromPose(reloadedPose, SPATIAL_CANONICAL_VIEWPORT)
    expect(cameraWorldViewport(reloaded)).toEqual(cameraWorldViewport(first))
    expect(first).toMatchObject({
      viewportWidth: 1120,
      viewportHeight: 760,
    })
    expect(Number.isFinite(first.x) && Number.isFinite(first.y)).toBe(true)
    expect(first.zoom).toBeGreaterThan(0)
    const visible = cameraWorldViewport(first)
    expect(visible.x).toBeLessThanOrEqual(-500)
    expect(visible.y).toBeLessThanOrEqual(-300)
    expect(visible.x + visible.width).toBeGreaterThanOrEqual(500)
    expect(visible.y + visible.height).toBeGreaterThanOrEqual(300)
    expect(renderSpatialSvgMarkup(spatial, first)).toContain('viewBox="0 0 1120 760"')
  })

  it('culls outside nodes, selects semantic variants and builds minimap geometry', () => {
    const spatial = spatialDocument()
    const homeCamera = { ...spatial.camera.home, viewportWidth: 400, viewportHeight: 240 }
    expect(cullSpatialItems(spatial.world.layerItems, homeCamera, [], 0).map(({ item }) => item.layerItemId)).toEqual(['center'])
    expect(cullSpatialItems(spatial.world.layerItems, homeCamera, spatial.semanticZoom, 0)).toEqual([])
    const detailed = cullSpatialItems(spatial.world.layerItems, { ...homeCamera, zoom: 2 }, spatial.semanticZoom, 0)
    expect(detailed[0]?.item.layerItemId).toBe('center')
    const minimap = buildSpatialMinimap(spatial, homeCamera, { width: 200, height: 120 })
    expect(minimap.viewport).toMatchObject({ x: 60, y: 36, width: 80, height: 48 })
    const rendered = renderSpatialSurface(spatial, { ...homeCamera, zoom: 2 }, { domDocument: document })
    const viewport = rendered.querySelector('svg:not(.spatial-minimap)')!
    expect(viewport.querySelector('[data-layer-item-id="center"]')).toHaveTextContent('总览')
    expect(viewport.querySelector('[data-layer-item-id="far"]')).toBeNull()
  })

  it('exposes keyboard zoom, named camera frames and an accessible minimap through the real host', async () => {
    const spatial = spatialDocument()
    spatial.semanticZoom = []
    spatial.camera.frames.push({ id: 'detail', name: '细节镜头', x: 120, y: 40, zoom: 2 })
    const container = document.createElement('div')
    const controller = new AbortController()
    const hits = vi.fn()
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, { onLayerHit: hits })
    await host.mount({ surfaceId: spatial.id, container, services, signal: controller.signal })
    await host.activate()

    const root = container.querySelector<HTMLElement>('.spatial-surface')!
    expect(root).toHaveAttribute('tabindex', '0')
    expect(root.querySelector('[role="toolbar"]')).toHaveAttribute('aria-label', '空间视图控制')
    expect(root.querySelector('.spatial-minimap')).toHaveAttribute('aria-label', '空间内容小地图')
    await host.setInspectionMode('inspect')
    root.querySelector('[data-spatial-layer-record][data-layer-item-id="center"]')!.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
    }))
    expect(hits).toHaveBeenLastCalledWith(expect.objectContaining({
      layerItemId: 'center', source: 'world', field: 'content.data.text',
    }))
    root.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
    await Promise.resolve()
    expect(host.camera.zoom).toBeGreaterThan(1)
    await host.setCamera({ ...host.camera, zoom: SPATIAL_MAX_ZOOM * 2 })
    expect(host.camera.zoom).toBe(SPATIAL_MAX_ZOOM)
    container.querySelector<HTMLButtonElement>('[data-camera-frame-id="detail"]')!.click()
    await Promise.resolve()
    expect(host.camera).toMatchObject({ x: 120, y: 40, zoom: 2 })

    controller.abort()
    await host.destroy()
    expect(container).toBeEmptyDOMElement()
  })

  it('freezes a Spatial Native video and world animation without remounting its current frame', async () => {
    const spatial = spatialDocument()
    const video: LayerItem = {
      layerItemId: 'spatial-video', label: '空间视频', kind: 'native',
      frame: { mode: 'absolute', x: -100, y: -60, width: 200, height: 120 },
      order: 0, visible: true, locked: false, rotation: 0, opacity: 1,
      hitPolicy: 'auto', playbackInitialVisibility: 'inherit',
      content: {
        nativeType: 'video',
        data: {
          assetId: 'video-asset', fit: 'cover', autoplay: false, loop: false,
          muted: true, volume: 1, playbackRate: 1, showControls: true,
          clickToToggle: false, startTime: 0, endTime: null,
          poster: { mode: 'video-frame', time: 0 },
          backgroundAudioMode: 'none',
        },
      },
    }
    spatial.world.layerItems = [video]
    spatial.semanticZoom = []
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, {
      showControls: false,
      showMinimap: false,
    })
    const container = document.createElement('div')
    await host.mount({ surfaceId: spatial.id, container, services, signal: new AbortController().signal })
    await host.activate()
    const root = container.querySelector<HTMLElement>('.spatial-surface')!
    const element = root.querySelector<HTMLVideoElement>('.spatial-native-video video')!
    element.currentTime = 7.25
    const media = controlMediaPlayback(element, true)
    const animation = controlRootAnimation(root)

    await host.setInspectionMode('inspect')
    expect(media.pause).toHaveBeenCalledOnce()
    expect(animation.pause).toHaveBeenCalledOnce()
    expect(root.querySelector('.spatial-native-video video')).toBe(element)
    expect(element.currentTime).toBe(7.25)

    await host.setInspectionMode('playback')
    expect(media.play).toHaveBeenCalledOnce()
    expect(animation.play).toHaveBeenCalledOnce()
    expect(root.querySelector('.spatial-native-video video')).toBe(element)
    expect(element.currentTime).toBe(7.25)
    await host.destroy()
  })

  it('renders authored text layout and real shape geometry consistently in DOM and SVG markup', () => {
    const spatial = spatialDocument()
    const text = spatial.world.layerItems[0]!
    if (text.kind !== 'native' || text.content.nativeType !== 'text') throw new Error('text fixture missing')
    text.frame = { mode: 'absolute', x: -100, y: -60, width: 120, height: 90 }
    text.content.data.text = '第一行需要自动换行\n第二行'
    Object.assign(text.content.data.style, {
      bold: true,
      align: 'center',
      verticalAlign: 'middle',
      padding: 8,
      backgroundColor: '#ffeeaa',
      backgroundOpacity: 0.8,
      cornerRadius: 6,
    })
    const ellipse = structuredClone(spatial.world.layerItems[1]!)
    if (ellipse.kind !== 'native' || ellipse.content.nativeType !== 'shape') throw new Error('shape fixture missing')
    ellipse.layerItemId = 'ellipse'
    ellipse.frame = { mode: 'absolute', x: 20, y: -50, width: 100, height: 80 }
    ellipse.content.data.shapeType = 'ellipse'
    ellipse.content.data.style.lineStyle = 'dashed'
    ellipse.content.data.style.borderWidth = 3
    ellipse.order = 1
    const arrow = structuredClone(ellipse) as typeof ellipse
    if (arrow.kind !== 'native' || arrow.content.nativeType !== 'shape') throw new Error('shape clone missing')
    arrow.layerItemId = 'arrow'
    arrow.content.data.shapeType = 'line'
    arrow.content.data.style.startArrow = 'circle'
    arrow.content.data.style.endArrow = 'triangle'
    arrow.frame = { mode: 'absolute', x: -60, y: 40, width: 160, height: 40 }
    arrow.order = 2
    const formula: LayerItem = {
      ...structuredClone(text),
      layerItemId: 'formula',
      label: '分数公式',
      frame: { mode: 'absolute', x: 130, y: -50, width: 180, height: 100 },
      order: 3,
      content: {
        nativeType: 'formula',
        data: {
          formulaId: 'formula.spatial',
          accessibleText: '二分之一',
          ast: {
            type: 'fraction',
            numerator: { type: 'token', value: '1' },
            denominator: { type: 'token', value: '2' },
          },
          style: { fontSize: 30, color: '#172033', align: 'center' },
        },
      },
    }
    const component: ComponentLayerItem = {
      layerItemId: 'teacher-component',
      label: '课堂小测',
      kind: 'component',
      frame: { mode: 'absolute', x: -75, y: 75, width: 150, height: 40 },
      order: 4,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      component: { packageId: 'component.internal.quiz', version: '4.0.0' },
      props: {},
    }
    spatial.world.layerItems = [text, ellipse, arrow, formula, component]
    spatial.semanticZoom = []
    const camera = { ...spatial.camera.home, viewportWidth: 400, viewportHeight: 240 }
    const rendered = renderSpatialSurface(spatial, camera, { domDocument: document })
    const textGroup = rendered.querySelector('[data-layer-item-id="center"]')!
    expect(textGroup.querySelector('rect')).toHaveAttribute('fill', '#ffeeaa')
    expect(textGroup.querySelector('text')).toHaveAttribute('font-weight', '700')
    expect(textGroup.querySelectorAll('tspan').length).toBeGreaterThan(2)
    expect(rendered.querySelector('[data-layer-item-id="ellipse"] ellipse')).not.toBeNull()
    expect(rendered.querySelector('[data-layer-item-id="ellipse"] ellipse')).toHaveAttribute('stroke-dasharray')
    expect(rendered.querySelector('[data-layer-item-id="arrow"] line')).toHaveAttribute('marker-end', 'url(#spatial-arrow-end)')
    expect(rendered.querySelector('svg[data-layer-item-id="formula"][aria-label="二分之一"]')).not.toBeNull()
    expect(rendered.querySelector('[data-layer-item-id="formula"] line')).not.toBeNull()
    const markup = renderSpatialSvgMarkup(spatial, camera)
    expect(markup).toContain('<ellipse')
    expect(markup).toContain('font-weight="700"')
    expect(markup).toContain('<tspan')
    expect(markup).toContain('marker-end="url(#spatial-arrow-end)"')
    expect(markup).toContain('aria-label="二分之一"')
    expect(markup).toContain('互动组件：课堂小测')
    expect(markup).not.toContain('component.internal.quiz')
  })

  it('mounts live Runtime and Component foreignObjects in exact layer order without remounting on camera changes', async () => {
    const spatial = spatialDocument()
    spatial.semanticZoom = []
    const component: ComponentLayerItem = {
      layerItemId: 'component', label: 'live component', kind: 'component',
      frame: { mode: 'absolute', x: -90, y: -80, width: 90, height: 70 },
      order: 1, visible: true, locked: false, rotation: 0, opacity: 1,
      hitPolicy: 'auto', playbackInitialVisibility: 'inherit',
      component: { packageId: 'component.test', version: '1.0.0' }, props: {},
    }
    const runtime: RuntimeLayerItem = {
      layerItemId: 'runtime', label: 'live runtime', kind: 'runtime',
      frame: { mode: 'absolute', x: 20, y: -80, width: 90, height: 70 },
      order: 3, visible: true, locked: false, rotation: 0, opacity: 1,
      hitPolicy: 'auto', playbackInitialVisibility: 'inherit',
      runtime: {
        protocol: 'surface-v1', runtimeApiVersion: 3, enabled: true, renderMode: 'dom',
        source: '', content: { values: {} }, assets: {},
      },
    }
    const front = structuredClone(spatial.world.layerItems[0]!)
    front.layerItemId = 'front-native'
    front.order = 4
    spatial.world.layerItems[0]!.order = 0
    spatial.world.layerItems = [spatial.world.layerItems[0]!, component, runtime, front]

    class ProbeHost implements SlideItemHost<ComponentLayerItem | RuntimeLayerItem> {
      readonly calls: string[] = []
      element: HTMLButtonElement | null = null
      mount(context: SlideItemMountContext<ComponentLayerItem | RuntimeLayerItem>): void {
        this.calls.push('mount')
        this.element = context.container.ownerDocument.createElement('button')
        this.element.textContent = context.item.label
        this.element.addEventListener('pointerdown', () => context.reportHit({ field: 'props/title', hitId: 'stable-hit' }))
        context.container.appendChild(this.element)
      }
      update(): void { this.calls.push('update') }
      activate(): void { this.calls.push('activate') }
      suspend(): void { this.calls.push('suspend') }
      resume(): void { this.calls.push('resume') }
      reset(): void { this.calls.push('reset') }
      destroy(): void { this.calls.push('destroy') }
    }
    const componentProbe = new ProbeHost()
    const runtimeProbe = new ProbeHost()
    const hits = vi.fn()
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, {
      showControls: false,
      showMinimap: false,
      componentHostFactory: () => componentProbe as SlideItemHost<ComponentLayerItem>,
      runtimeHostFactory: () => runtimeProbe as SlideItemHost<RuntimeLayerItem>,
      onLayerHit: hits,
    })
    const container = document.createElement('div')
    await host.mount({ surfaceId: spatial.id, container, services, signal: new AbortController().signal })
    await host.activate()
    const ids = [...container.querySelectorAll<SVGGElement>('[data-spatial-layer-record]')]
      .map((element) => element.dataset.layerItemId)
    expect(ids).toEqual(['center', 'component', 'runtime', 'front-native'])
    expect(componentProbe.element).not.toBeNull()
    expect(runtimeProbe.element).not.toBeNull()
    const componentElement = componentProbe.element
    componentElement!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(hits).toHaveBeenCalledWith(expect.objectContaining({
      layerItemId: 'component', field: 'props/title', hitId: 'stable-hit', source: 'world',
    }))
    await host.setCamera({ ...host.camera, zoom: 1.4 })
    expect(componentProbe.element).toBe(componentElement)
    expect(componentProbe.calls.filter((call) => call === 'mount')).toHaveLength(1)
    await host.setCamera({ ...host.camera, x: 2_000 })
    expect(componentProbe.calls).toContain('suspend')
    await host.setCamera({ ...host.camera, x: 0 })
    expect(componentProbe.element).toBe(componentElement)
    expect(componentProbe.calls).toContain('resume')
    expect(componentProbe.calls.filter((call) => call === 'mount')).toHaveLength(1)
    await host.reset('surface')
    expect(componentProbe.calls).toContain('reset')
    await host.destroy()
    expect(componentProbe.calls).toContain('destroy')
    expect(runtimeProbe.calls).toContain('destroy')
  })

  it('isolates a failing dynamic item and composes scoped global items in the same Spatial order', async () => {
    const spatial = spatialDocument()
    spatial.semanticZoom = []
    spatial.world.layerItems[0]!.order = 5
    const runtime: RuntimeLayerItem = {
      layerItemId: 'broken-runtime', label: 'broken runtime', kind: 'runtime',
      frame: { mode: 'absolute', x: -40, y: -40, width: 80, height: 60 },
      order: 2, visible: true, locked: false, rotation: 0, opacity: 1,
      hitPolicy: 'auto', playbackInitialVisibility: 'inherit',
      runtime: {
        protocol: 'surface-v1', runtimeApiVersion: 3, enabled: true, renderMode: 'dom',
        source: '', content: { values: {} }, assets: {},
      },
    }
    spatial.world.layerItems.push(runtime)
    const globalItem = structuredClone(spatial.world.layerItems[0]!) as LayerItem
    globalItem.layerItemId = 'global-controller'
    globalItem.order = 9
    const diagnostic = vi.fn()
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, {
      showControls: false,
      showMinimap: false,
      initialLocationId: 'map-home',
      globalLayerItems: [{ item: globalItem, visibility: { mode: 'include', locationIds: ['map-home'] } }],
      runtimeHostFactory: () => ({ mount: () => { throw new Error('boom') } }),
    })
    const container = document.createElement('div')
    await host.mount({
      surfaceId: spatial.id,
      container,
      services: { ...services, reportDiagnostic: diagnostic },
      signal: new AbortController().signal,
    })
    await host.activate()
    expect(container.querySelector('[data-layer-item-id="broken-runtime"] [data-host-error="true"]')).not.toBeNull()
    expect(container.querySelector('[data-layer-item-id="center"]')).toHaveTextContent('总览')
    const ids = [...container.querySelectorAll<SVGGElement>('[data-spatial-layer-record]')]
      .map((element) => element.dataset.layerItemId)
    expect(ids).toEqual(['broken-runtime', 'center', 'global-controller'])
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ surfaceId: 'map', phase: 'mount' }))
    await host.setLocationId('other-location')
    expect(container.querySelector('[data-layer-item-id="global-controller"]')).toBeNull()
    await host.destroy()
  })
})

describe('Mixed course navigation', () => {
  it('round-trips stable deep links and coordinates ordered navigation/reset', async () => {
    expect(parseMixedDeepLink(buildMixedDeepLink({ surfaceId: 'flow-1', targetId: 'block:3' }))).toEqual({
      surfaceId: 'flow-1',
      targetId: 'block:3',
    })
    expect(parseMixedDeepLink('#surface=%2Fbad')).toBeNull()
    const player = {
      activeSurfaceId: null,
      activateSurface: vi.fn().mockResolvedValue({ ok: true }),
      resetSurface: vi.fn().mockResolvedValue({ ok: true }),
      resetCourse: vi.fn().mockResolvedValue([{ ok: true }]),
    }
    const targets: string[] = []
    const navigator = new MixedCourseNavigator({
      id: 'course',
      title: '混合课程',
      surfaces: [
        { id: 'slide-1', kind: 'slide', title: '导入', initialTargetId: 'scene-1' },
        { id: 'flow-1', kind: 'flow', title: '阅读', initialTargetId: 'heading-1' },
      ],
    }, player, {
      onTarget: (surfaceId, targetId) => { targets.push(`${surfaceId}/${targetId}`) },
    })
    expect(await navigator.start()).toMatchObject({ surfaceId: 'slide-1', targetId: 'scene-1', index: 0 })
    expect(await navigator.next()).toMatchObject({ surfaceId: 'flow-1', targetId: 'heading-1', index: 1 })
    expect(navigator.canGoBack).toBe(true)
    expect(await navigator.back()).toMatchObject({ surfaceId: 'slide-1' })
    await navigator.resetCurrentSurface()
    expect(player.resetSurface).toHaveBeenCalledWith('slide-1', 'surface')
    await navigator.resetCourse()
    expect(player.resetCourse).toHaveBeenCalledOnce()
    expect(targets).toContain('flow-1/heading-1')
  })
})
