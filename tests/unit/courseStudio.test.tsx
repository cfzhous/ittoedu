import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import { DeclarativeCourseState } from '@/player/DeclarativeCourseState'
import type { SlideSurfaceHost } from '@/player/surfaces/slide/SlideSurfaceHost'
import type { ComponentPackageData } from '@/shared/componentTypes'
import { deriveCourseProjectAuthoringInventorySnapshot } from '@/shared/courseProjectModel'
import type {
  ComponentLayerItem,
  FlowSurfaceDocument,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'
import {
  FlowCourseCanvas,
  SlideCourseCanvas,
  SpatialCourseCanvas,
} from '@/renderer/course/CourseSurfaceCanvas'
import { applyFlowBlockEditorChange } from '@/renderer/course/flow/applyFlowBlockEditorChange'
import {
  CourseEditorDynamicHostRegistry,
  componentPropKeyToInventoryField,
} from '@/renderer/course/courseEditorDynamicHosts'
import { CourseStudioPlaybackSession } from '@/renderer/course/courseStudioSession'
import { buildCoursePptx } from '@/renderer/export/course/buildCoursePptx'
import {
  addCourseSurface,
  addComponentLayer,
  addFlowBlock,
  addSlideScene,
  addSlideTextLayer,
  addSpatialCameraFrame,
  addSpatialSemanticZoomRule,
  addSpatialTextLayer,
  commitCourseHistory,
  createCourseHistory,
  createCourseProject,
  deleteFlowBlock,
  deleteNestedFlowBlock,
  duplicateFlowBlock,
  insertNestedFlowBlock,
  redoCourseHistory,
  reorderFlowBlock,
  undoCourseHistory,
  updateFlowBlock,
  updateNestedFlowBlock,
  updateLayerItem,
  updateLayerItems,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  currentPptxDynamicCapture,
} from '@/renderer/course/coursePptxCurrentCapture'

afterEach(cleanup)

function flowProject() {
  const base = createCourseProject({ id: 'course-studio-test', now: '2026-08-14T00:00:00.000Z' })
  return addCourseSurface(base, 'flow', { id: 'flow-main', now: '2026-08-14T00:00:01.000Z' })
}

function componentItem(version = '1.0.0'): ComponentLayerItem {
  return {
    layerItemId: 'component-layer',
    label: '精确组件',
    kind: 'component',
    frame: { mode: 'absolute', x: 40, y: 30, width: 320, height: 180 },
    order: 10,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: 'component.precise', version },
    props: {
      content: { left: '左侧', 'weird/key~part': '右侧' },
      media: { hero: 'asset-hero' },
    },
  }
}

function componentPackage(version: string, runtimeSource: string): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 4,
      runtimeApiVersion: 4,
      id: 'component.precise',
      name: `精确组件 ${version}`,
      version,
      entry: 'runtime.js',
      defaultSize: { width: 320, height: 180 },
      minSize: { width: 80, height: 60 },
      preserveAspectRatio: false,
      assets: {},
      defaultProps: {
        content: { left: '左侧', 'weird/key~part': '右侧' },
        media: { hero: 'asset-hero' },
      },
      supportedScopes: ['scene'],
      renderMode: 'dom',
      editor: {
        properties: [
          { key: 'content.left', label: '左侧', type: 'text' },
          { key: 'content.weird/key~part', label: '右侧', type: 'text' },
          { key: 'media.hero', label: '主图', type: 'image' },
        ],
      },
    },
    runtimeSource,
    files: { 'runtime.js': new TextEncoder().encode(runtimeSource) },
    contentSha256: version === '1.0.0' ? '1'.repeat(64) : '2'.repeat(64),
  }
}

function runtimeItem(source: string, title = '初始文字'): RuntimeLayerItem {
  return {
    layerItemId: 'runtime-layer',
    label: 'Surface Runtime',
    kind: 'runtime',
    frame: { mode: 'absolute', x: 0, y: 0, width: 400, height: 240 },
    order: 20,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source,
      content: { values: { title } },
      assets: {},
    },
  }
}

function dynamicRegistry(packages: Record<string, ComponentPackageData> = {}) {
  const project = createCourseProject({ id: 'dynamic-course' })
  const events = new CourseEventBus()
  const registry = new CourseEditorDynamicHostRegistry({
    courseState: new DeclarativeCourseState(project),
    events,
    navigation: {
      goToScene: () => true,
      next: () => true,
      previous: () => true,
      replay: () => true,
      restart: () => true,
      setPresentationState: () => true,
      presentationState: () => ({ current: null, states: [] }),
    },
    resolveProjectAsset: () => undefined,
    resolveComponent: (_id, version) => packages[version],
  })
  return { registry, events }
}

function itemMountContext<T extends ComponentLayerItem | RuntimeLayerItem>(
  item: T,
  container: HTMLElement,
  reportHit = vi.fn(),
) {
  return {
    surfaceId: 'surface-main',
    sceneId: 'scene-main',
    item,
    container,
    services: {
      navigate: () => undefined,
      getCourseState: () => undefined,
      setCourseState: () => undefined,
      resolveAsset: () => undefined,
    },
    signal: new AbortController().signal,
    mode: 'inspect' as const,
    reportHit,
  }
}

describe('Course Studio concentrated authoring flow', () => {
  it('edits, reorders, duplicates and deletes Flow blocks as revisioned transactions', () => {
    let project = flowProject()
    project = addFlowBlock(project, 'flow-main', { id: 'paragraph-a', type: 'paragraph', text: 'Alpha' })
    project = addFlowBlock(project, 'flow-main', { id: 'paragraph-b', type: 'paragraph', text: 'Beta' })
    project = updateFlowBlock(project, 'flow-main', 'paragraph-a', (block) => {
      if (block.type === 'paragraph') block.text = 'Edited alpha'
    })
    project = reorderFlowBlock(project, 'flow-main', 'paragraph-b', 0)
    project = duplicateFlowBlock(project, 'flow-main', 'paragraph-a')
    const flow = project.surfaces.find((surface): surface is FlowSurfaceDocument => surface.id === 'flow-main' && surface.type === 'flow')!
    expect(flow.blocks[0]?.id).toBe('paragraph-b')
    expect(flow.blocks.filter((block) => block.type === 'paragraph')).toHaveLength(3)
    const duplicate = flow.blocks.find((block) => block.type === 'paragraph' && block.id !== 'paragraph-a' && block.id !== 'paragraph-b')!
    expect(project.locations.some((location) => location.kind === 'flow-block' && location.blockId === duplicate.id)).toBe(true)
    const documentOrder = flow.blocks.map((block) => block.id)
    expect(project.locations.flatMap((location) => (
      location.kind === 'flow-block' && location.surfaceId === 'flow-main' ? [location.blockId] : []
    ))).toEqual(documentOrder)
    project = deleteFlowBlock(project, 'flow-main', duplicate.id)
    expect(project.locations.some((location) => location.kind === 'flow-block' && location.blockId === duplicate.id)).toBe(false)
  })

  it('records a structured section edit as one history action and keeps nested locations valid', () => {
    let project = flowProject()
    project = addFlowBlock(project, 'flow-main', {
      id: 'section-main',
      type: 'section',
      title: '原分节',
      collapsedByDefault: false,
      blocks: [
        { id: 'paragraph-a', type: 'paragraph', text: '甲' },
        { id: 'paragraph-b', type: 'paragraph', text: '乙' },
      ],
    })
    const surface = project.surfaces.find((entry): entry is FlowSurfaceDocument => entry.id === 'flow-main' && entry.type === 'flow')!
    const previous = surface.blocks.find((block) => block.id === 'section-main')
    if (!previous || previous.type !== 'section') throw new Error('missing section')
    const next = structuredClone(previous)
    next.title = '新分节'
    next.collapsedByDefault = true
    next.blocks = [
      { id: 'list-new', type: 'list', ordered: true, items: [{ id: 'item-new', text: '新项目', level: 0 }] },
      { id: 'paragraph-b', type: 'paragraph', text: '乙已修改' },
    ]

    const changed = applyFlowBlockEditorChange(project, 'flow-main', previous, next)
    const committed = commitCourseHistory(createCourseHistory(project), changed)
    expect(committed.past).toHaveLength(1)
    const changedSurface = changed.surfaces.find((entry): entry is FlowSurfaceDocument => entry.id === 'flow-main' && entry.type === 'flow')!
    expect(changedSurface.blocks.find((block) => block.id === 'section-main')).toEqual(next)
    expect(changed.locations.some((location) => location.kind === 'flow-block' && location.blockId === 'paragraph-a')).toBe(false)
    expect(changed.locations.some((location) => location.kind === 'flow-block' && location.blockId === 'list-new')).toBe(true)
    expect(changed.locations.find((location) => location.kind === 'flow-block' && location.blockId === 'paragraph-b')?.label).toBe('乙已修改')
    expect(undoCourseHistory(committed).present).toEqual(project)
  })

  it('keeps undo and redo around complete Course Project revisions', () => {
    const original = createCourseProject({ id: 'history-test', now: '2026-08-14T00:00:00.000Z' })
    const slide = original.surfaces[0]
    expect(slide?.type).toBe('slide')
    if (!slide || slide.type !== 'slide') throw new Error('missing slide')
    const changed = addSlideTextLayer(original, slide.id, slide.scenes[0]!.id, '保留当前帧')
    const committed = commitCourseHistory(createCourseHistory(original), changed)
    expect(undoCourseHistory(committed).present.revision).toBe(original.revision)
    expect(redoCourseHistory(undoCourseHistory(committed)).present.revision).toBe(changed.revision)
  })

  it('commits a multi-layer transform as one V9 revision', () => {
    let project = createCourseProject({ id: 'batch-transform', now: '2026-08-14T00:00:00.000Z' })
    const slide = project.surfaces[0]
    if (!slide || slide.type !== 'slide') throw new Error('missing slide')
    const sceneId = slide.scenes[0]!.id
    project = addSlideTextLayer(project, slide.id, sceneId, 'A', { id: 'layer-a' })
    project = addSlideTextLayer(project, slide.id, sceneId, 'B', { id: 'layer-b' })
    const revisionBeforeGesture = project.revision
    const next = updateLayerItems(project, [
      {
        surfaceId: slide.id,
        sceneId,
        source: 'scene',
        layerItemId: 'layer-a',
        update: (item) => { item.frame.x += 30; item.frame.y += 10 },
      },
      {
        surfaceId: slide.id,
        sceneId,
        source: 'scene',
        layerItemId: 'layer-b',
        update: (item) => { item.frame.x += 30; item.frame.y += 10 },
      },
    ], '2026-08-14T00:00:03.000Z')
    expect(next.revision).toBe(revisionBeforeGesture + 1)
    const nextSlide = next.surfaces[0]
    if (!nextSlide || nextSlide.type !== 'slide') throw new Error('missing slide')
    const items = new Map(nextSlide.scenes[0]!.layerItems.map((item) => [item.layerItemId, item]))
    expect(items.get('layer-a')?.frame).toMatchObject({ x: 150, y: 130 })
    expect(items.get('layer-b')?.frame).toMatchObject({ x: 150, y: 130 })
  })

  it('updates Spatial world items and adds navigable camera frames', () => {
    let project = addCourseSurface(createCourseProject(), 'spatial-2d', { id: 'space-main' })
    project = addSpatialTextLayer(project, 'space-main', '可拖动节点', { id: 'world-text', x: 20, y: 30 })
    project = updateLayerItem(project, { surfaceId: 'space-main', layerItemId: 'world-text' }, (item) => {
      item.frame.x += 80
      item.frame.y += 40
    })
    project = addSpatialCameraFrame(project, 'space-main', { x: 100, y: 70, zoom: 1.8 }, { id: 'camera-detail' })
    const spatial = project.surfaces.find((surface) => surface.id === 'space-main')
    expect(spatial?.type).toBe('spatial-2d')
    if (!spatial || spatial.type !== 'spatial-2d') throw new Error('missing spatial')
    expect(spatial.world.layerItems[0]?.frame).toMatchObject({ x: 100, y: 70 })
    expect(spatial.camera.frames.at(-1)).toMatchObject({ id: 'camera-detail', zoom: 1.8 })
    expect(project.locations.some((location) => location.kind === 'spatial-camera' && location.cameraFrameId === 'camera-detail')).toBe(true)
  })

  it('renders Flow blocks as directly editable controls and commits on blur', () => {
    const surface: FlowSurfaceDocument = {
      id: 'flow-ui',
      type: 'flow',
      title: '讲义',
      surfaceLayerItems: [],
      layout: { readingWidth: 760, wideContentWidth: 1000 },
      blocks: [
        { id: 'heading', type: 'heading', level: 1, text: '二次函数' },
        { id: 'paragraph', type: 'paragraph', text: '原始正文' },
      ],
    }
    const onEdit = vi.fn()
    render(
      <FlowCourseCanvas
        surface={surface}
        mode="inspect"
        selectedBlockId="paragraph"
        search=""
        resolveAsset={() => undefined}
        onSelect={() => undefined}
        onEdit={onEdit}
      />,
    )
    const editor = screen.getByRole('textbox', { name: '编辑正文' })
    fireEvent.change(editor, { target: { value: '修改后正文' } })
    fireEvent.blur(editor)
    expect(onEdit).toHaveBeenCalledWith('paragraph', '修改后正文')
  })

  it('runs real Flow audio/video in Studio and freezes the same current frame for inspection', async () => {
    const surface: FlowSurfaceDocument = {
      id: 'flow-media-ui',
      type: 'flow',
      title: '媒体讲义',
      surfaceLayerItems: [],
      layout: { readingWidth: 760, wideContentWidth: 1000 },
      blocks: [
        { id: 'video', type: 'media', assetId: 'video-asset', mediaKind: 'video', layout: 'wide', caption: '观察过程' },
        { id: 'audio', type: 'media', assetId: 'audio-asset', mediaKind: 'audio', layout: 'content-width', caption: '教师讲解' },
      ],
    }
    const props = {
      surface,
      selectedBlockId: null,
      search: '',
      resolveAsset: (assetId: string) => `asset://${assetId}`,
      onSelect: () => undefined,
      onEdit: () => undefined,
    }
    const view = render(<FlowCourseCanvas {...props} mode="playback" />)
    const video = view.container.querySelector<HTMLVideoElement>('[data-flow-block-id="video"] video')!
    const audio = view.container.querySelector<HTMLAudioElement>('[data-flow-block-id="audio"] audio')!
    expect(video).toHaveAttribute('src', 'asset://video-asset')
    expect(audio).toHaveAttribute('src', 'asset://audio-asset')
    video.currentTime = 14.25

    let videoPaused = false
    let audioPaused = true
    Object.defineProperty(video, 'paused', { configurable: true, get: () => videoPaused })
    Object.defineProperty(audio, 'paused', { configurable: true, get: () => audioPaused })
    Object.defineProperty(video, 'ended', { configurable: true, get: () => false })
    Object.defineProperty(audio, 'ended', { configurable: true, get: () => false })
    const videoPause = vi.fn(() => { videoPaused = true })
    const videoPlay = vi.fn(() => { videoPaused = false; return Promise.resolve() })
    const audioPause = vi.fn(() => { audioPaused = true })
    const audioPlay = vi.fn(() => { audioPaused = false; return Promise.resolve() })
    Object.defineProperty(video, 'pause', { configurable: true, value: videoPause })
    Object.defineProperty(video, 'play', { configurable: true, value: videoPlay })
    Object.defineProperty(audio, 'pause', { configurable: true, value: audioPause })
    Object.defineProperty(audio, 'play', { configurable: true, value: audioPlay })

    view.rerender(<FlowCourseCanvas {...props} mode="inspect" />)
    await waitFor(() => expect(videoPause).toHaveBeenCalledOnce())
    expect(audioPause).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-flow-block-id="video"] video')).toBe(video)
    expect(video.currentTime).toBe(14.25)
    expect(view.container.querySelector('[data-flow-block-id="video"] textarea')).not.toHaveAttribute('readonly')

    view.rerender(<FlowCourseCanvas {...props} mode="playback" />)
    await waitFor(() => expect(videoPlay).toHaveBeenCalledOnce())
    expect(audioPlay).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-flow-block-id="video"] video')).toBe(video)
    expect(video.currentTime).toBe(14.25)
  })

  it('filters Flow content and renders a Spatial surface without replacing the document model', () => {
    const flow = flowProject().surfaces.find((surface): surface is FlowSurfaceDocument => surface.id === 'flow-main' && surface.type === 'flow')!
    const { rerender } = render(
      <FlowCourseCanvas surface={flow} mode="playback" selectedBlockId={null} search="missing" resolveAsset={() => undefined} onSelect={() => undefined} onEdit={() => undefined} />,
    )
    expect(screen.getByText('没有匹配的内容块。')).toBeInTheDocument()

    const project = addCourseSurface(createCourseProject(), 'spatial-2d', { id: 'spatial-ui' })
    const spatial = project.surfaces.find((surface) => surface.id === 'spatial-ui')
    if (!spatial || spatial.type !== 'spatial-2d') throw new Error('missing spatial')
    rerender(
      <SpatialCourseCanvas
        surface={spatial}
        mode="inspect"
        camera={spatial.camera.home}
        selectedLayerItemId={null}
        resolveAsset={() => undefined}
        onCameraChange={() => undefined}
        onSelect={() => undefined}
        onMove={() => undefined}
      />,
    )
    expect(screen.getByTestId('course-spatial-canvas').querySelector('svg')).not.toBeNull()
  })

  it('edits nested Flow blocks and persists Spatial semantic zoom rules', () => {
    let project = flowProject()
    project = addFlowBlock(project, 'flow-main', {
      id: 'section-main', type: 'section', title: '探究', collapsedByDefault: false, blocks: [],
    })
    project = insertNestedFlowBlock(project, 'flow-main', 'section-main', {
      id: 'nested-text', type: 'paragraph', text: '嵌套内容',
    })
    project = updateNestedFlowBlock(project, 'flow-main', 'nested-text', (block) => {
      if (block.type === 'paragraph') block.text = '嵌套内容已修改'
    })
    const flow = project.surfaces.find((surface) => surface.id === 'flow-main')
    expect(flow?.type).toBe('flow')
    if (!flow || flow.type !== 'flow') throw new Error('missing flow')
    expect(flow.blocks.find((block) => block.id === 'section-main')).toMatchObject({
      blocks: [{ id: 'nested-text', text: '嵌套内容已修改' }],
    })

    project = addCourseSurface(project, 'spatial-2d', { id: 'semantic-space' })
    project = addSpatialTextLayer(project, 'semantic-space', '缩放节点', { id: 'semantic-node' })
    project = addSpatialSemanticZoomRule(project, 'semantic-space', {
      id: 'semantic-rule', layerItemIds: ['semantic-node'], minZoom: 0.5, maxZoom: 2,
    })
    const spatial = project.surfaces.find((surface) => surface.id === 'semantic-space')
    expect(spatial?.type).toBe('spatial-2d')
    if (!spatial || spatial.type !== 'spatial-2d') throw new Error('missing spatial')
    expect(spatial.semanticZoom).toEqual([expect.objectContaining({ id: 'semantic-rule', minZoom: 0.5, maxZoom: 2 })])
  })

  it('maps two component hits to two exact V9 fields including pointer escaping', async () => {
    const source = `window.CoursewareComponent.define({
      id:'component.precise',runtimeApiVersion:4,
      create(ctx){
        ctx.editor.registerTextRegion({key:'content.left',label:'左侧',getBounds:()=>({x:10,y:10,width:100,height:30})});
        ctx.editor.registerTextRegion({key:'content.weird/key~part',label:'右侧',getBounds:()=>({x:140,y:10,width:100,height:30})});
        ctx.editor.registerAssetRegion({key:'media.hero',label:'主图',getBounds:()=>({x:250,y:10,width:60,height:60})});
        return {destroy(){}};
      }
    })`
    const pkg = componentPackage('1.0.0', source)
    const { registry, events } = dynamicRegistry({ '1.0.0': pkg })
    const item = componentItem()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const reportHit = vi.fn()
    const host = registry.componentHost(item)
    host.mount(itemMountContext(item, container, reportHit))

    await waitFor(() => expect(container.querySelectorAll('[data-dynamic-field]')).toHaveLength(3))
    const targets = [...container.querySelectorAll<HTMLElement>('[data-dynamic-field]')]
    expect(componentPropKeyToInventoryField('content.weird/key~part')).toBe('props/content/weird~1key~0part')
    fireEvent.pointerDown(targets[0]!)
    fireEvent.pointerDown(targets[1]!)
    fireEvent.pointerDown(targets[2]!)
    const hits = reportHit.mock.calls.map(([hit]) => hit)
    expect(hits.map((hit) => hit.field)).toEqual([
      'props/content/left',
      'props/content/weird~1key~0part',
      'props/media/hero',
    ])
    expect(hits[0].hitId).not.toBe(hits[1].hitId)
    expect(hits.map((hit) => hit.targetKind)).toEqual(['text', 'text', 'asset'])

    let project = updateCourseProject(createCourseProject({ id: 'inventory-course' }), (draft) => {
      draft.componentPackages['component.precise'] = {
        packageId: 'component.precise', version: '1.0.0', name: '精确组件',
        manifestPath: 'components/component.precise/1.0.0/manifest.json',
        runtimePath: 'components/component.precise/1.0.0/runtime.js',
        contentSha256: '1'.repeat(64),
      }
    })
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('missing slide')
    project = addComponentLayer(project, {
      surfaceId: slide.id, sceneId: slide.scenes[0]!.id,
      packageId: 'component.precise', version: '1.0.0', label: '精确组件',
      props: item.props, id: item.layerItemId, width: 320, height: 180,
    })
    const addresses = Object.keys(deriveCourseProjectAuthoringInventorySnapshot(project).entries)
    expect(addresses.some((address) => new URL(address).searchParams.get('field') === hits[0].field)).toBe(true)
    expect(addresses.some((address) => new URL(address).searchParams.get('field') === hits[1].field)).toBe(true)
    expect(addresses.some((address) => new URL(address).searchParams.get('field') === hits[2].field)).toBe(true)

    host.destroy?.()
    registry.dispose()
    events.dispose()
  })

  it('hot-updates Surface Runtime content without recreating its interaction state', () => {
    const source = `CoursewareSurfaceRuntime.define({runtimeApiVersion:3,create(ctx){
      let interactionState=7;
      ctx.dom.root.dataset.createCount=String(Number(ctx.dom.root.dataset.createCount||0)+1);
      ctx.dom.root.dataset.state=String(interactionState);
      return {
        updateContent(values){ctx.dom.root.dataset.title=values.title;ctx.dom.root.dataset.state=String(interactionState)},
        destroy(){}
      }
    }})`
    const { registry, events } = dynamicRegistry()
    const item = runtimeItem(source)
    const container = document.createElement('div')
    const context = itemMountContext(item, container)
    const host = registry.runtimeHost(item)
    host.mount(context)
    host.update?.(runtimeItem(source, '热更新文字'), { ...context, item: runtimeItem(source, '热更新文字') })
    expect(container.dataset).toMatchObject({ createCount: '1', state: '7', title: '热更新文字' })
    host.destroy?.()
    registry.dispose()
    events.dispose()
  })

  it('waits for the mounted Component capture contract before snapshotting its current frame', async () => {
    const source = `window.CoursewareComponent.define({
      id:'component.precise',runtimeApiVersion:4,
      create(ctx){
        let finish;
        ctx.capture.waitUntil(new Promise(resolve => { finish = resolve }));
        return {
          prepareCapture(){
            setTimeout(() => { ctx.dom.root.dataset.captureReady='yes'; finish() }, 5);
          },
          destroy(){}
        };
      }
    })`
    const pkg = componentPackage('1.0.0', source)
    const { registry, events } = dynamicRegistry({ '1.0.0': pkg })
    const item = componentItem()
    const container = document.createElement('div')
    const host = registry.componentHost(item)
    await host.mount(itemMountContext(item, container))

    await host.capture?.({ purpose: 'export' })
    expect(container.dataset.captureReady).toBe('yes')

    host.destroy?.()
    registry.dispose()
    events.dispose()
  })

  it('restores Component authoring checkpoint across a required executable remount', () => {
    const sourceV1 = `window.CoursewareComponent.define({id:'component.precise',runtimeApiVersion:4,create(){
      let internal=9;return{exportAuthoringCheckpoint(){return{internal}},destroy(){}}
    }})`
    const sourceV2 = `window.CoursewareComponent.define({id:'component.precise',runtimeApiVersion:4,create(ctx){
      return{restoreAuthoringCheckpoint(value){ctx.dom.root.dataset.restored=String(value.internal)},destroy(){}}
    }})`
    const packages = {
      '1.0.0': componentPackage('1.0.0', sourceV1),
      '2.0.0': componentPackage('2.0.0', sourceV2),
    }
    const { registry, events } = dynamicRegistry(packages)
    const item = componentItem('1.0.0')
    const container = document.createElement('div')
    const context = itemMountContext(item, container)
    const host = registry.componentHost(item)
    host.mount(context)
    const next = componentItem('2.0.0')
    host.update?.(next, { ...context, item: next })
    expect(container.dataset.restored).toBe('9')
    host.destroy?.()
    registry.dispose()
    events.dispose()
  })

  it('keeps the same Slide dynamic host across run/inspect and global-layer reconciliation', async () => {
    const project = createCourseProject({ id: 'same-instance-course' })
    const slide = structuredClone(project.surfaces[0]!)
    if (slide.type !== 'slide') throw new Error('missing slide')
    slide.scenes[0]!.layerItems.push(componentItem())
    const lifecycle = {
      mount: vi.fn(), update: vi.fn(), setInspectionMode: vi.fn(), activate: vi.fn(), destroy: vi.fn(),
    }
    const factory = vi.fn(() => lifecycle)
    const onHostReady = vi.fn()
    const props = {
      surface: slide,
      sceneId: slide.scenes[0]!.id,
      selectedLayerItemId: null,
      resolveAsset: () => undefined,
      onLayerHit: () => undefined,
      componentHostFactory: factory,
      onHostReady,
      onError: (message: string) => { throw new Error(message) },
    }
    const { rerender } = render(<SlideCourseCanvas {...props} mode="playback" globalLayerItems={[]} />)
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1))
    const mountedHost = onHostReady.mock.calls[0]?.[0]
    rerender(<SlideCourseCanvas {...props} mode="inspect" globalLayerItems={project.globalLayerItems} />)
    await waitFor(() => expect(lifecycle.setInspectionMode).toHaveBeenCalledWith('inspect'))
    expect(factory).toHaveBeenCalledTimes(1)
    expect(onHostReady.mock.calls.filter(([host]) => host !== null).map(([host]) => host)).toEqual([mountedHost])
  })

  it('uses CourseLocation ids for Slide scoped layers in the editor host', async () => {
    let project = createCourseProject({ id: 'slide-location-scope' })
    const originalLocationId = project.locations[0]!.id
    project = updateCourseProject(project, (draft) => {
      draft.locations[0]!.id = 'location-visible'
      draft.startLocationId = 'location-visible'
      draft.globalLayerItems[0]!.visibility = {
        mode: 'include',
        locationIds: ['location-visible'],
      }
      draft.navigationGuards.forEach((guard) => {
        guard.fromLocationIds = guard.fromLocationIds?.map((id) => id === originalLocationId ? 'location-visible' : id)
        guard.toLocationIds = guard.toLocationIds?.map((id) => id === originalLocationId ? 'location-visible' : id)
      })
    })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('missing slide')
    const controllerId = project.globalLayerItems[0]!.item.layerItemId
    const props = {
      surface: slide,
      sceneId: slide.scenes[0]!.id,
      selectedLayerItemId: null,
      resolveAsset: () => undefined,
      onLayerHit: () => undefined,
      onError: (message: string) => { throw new Error(message) },
      mode: 'inspect' as const,
      globalLayerItems: project.globalLayerItems,
    }
    const { container, rerender } = render(
      <SlideCourseCanvas {...props} locationId="location-visible" />,
    )
    await waitFor(() => expect(
      container.querySelector(`[data-layer-item-id="${controllerId}"]`),
    ).not.toBeNull())
    rerender(<SlideCourseCanvas {...props} locationId="another-location" />)
    await waitFor(() => expect(
      container.querySelector(`[data-layer-item-id="${controllerId}"]`),
    ).toHaveAttribute('hidden'))
  })

  it('uses one declarative guard chain, freezes inspect state and restarts playback defaults', () => {
    let project = createCourseProject({ id: 'session-course' })
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('missing slide')
    project = addSlideScene(project, slide.id, { id: 'scene-second', name: '第二幕' })
    const firstLocation = project.locations.find((location) => location.kind === 'slide-scene' && location.sceneId === slide.scenes[0]!.id)!
    const secondLocation = project.locations.find((location) => location.kind === 'slide-scene' && location.sceneId === 'scene-second')!
    project = updateCourseProject(project, (draft) => {
      draft.courseState = [{ key: 'unlocked', valueType: 'boolean', defaultValue: false }]
      draft.navigationGuards = [{
        id: 'unlock-second', effect: 'block', toLocationIds: [secondLocation.id], match: 'all',
        conditions: [{ type: 'compare', key: 'unlocked', operator: 'eq', value: true }],
        message: '先完成当前任务',
      }]
    })
    const activateLocation = vi.fn()
    const onBlocked = vi.fn()
    const session = new CourseStudioPlaybackSession(project, {
      getActiveSurfaceId: () => slide.id,
      getActiveSceneId: () => slide.scenes[0]!.id,
      activateLocation,
      setPresentationState: () => true,
      presentationState: () => ({ current: null, states: [] }),
      onBlocked,
    })
    session.setInspectionMode(false)
    expect(session.goToScene('scene-second', undefined, 'component')).toBe(false)
    expect(onBlocked).toHaveBeenCalledWith('先完成当前任务')
    session.authorActivate(secondLocation)
    expect(session.currentLocationId).toBe(secondLocation.id)
    session.authorActivate(firstLocation)
    session.state.set('unlocked', true)
    expect(session.goToScene('scene-second', undefined, 'runtime')).toBe(true)
    session.setInspectionMode(true)
    expect(() => session.state.set('unlocked', false)).toThrow(/冻结/)
    session.setInspectionMode(false)
    expect(session.restart()).toBe(true)
    expect(session.currentLocationId).toBe(project.startLocationId)
    expect(session.state.get('unlocked')).toBe(false)
  })

  it('删除 Flow 内容时原子修复作用范围与翻页条件引用', () => {
    let project = flowProject()
    project = addFlowBlock(project, 'flow-main', {
      id: 'later-block',
      type: 'section',
      title: '后续探究',
      collapsedByDefault: false,
      blocks: [{ id: 'nested-later', type: 'paragraph', text: '子内容' }],
    }, '2026-08-14T00:00:02.000Z')
    const laterLocation = project.locations.find((location) => (
      location.kind === 'flow-block' && location.blockId === 'later-block'
    ))!
    const nestedLocation = project.locations.find((location) => (
      location.kind === 'flow-block' && location.blockId === 'nested-later'
    ))!
    project = updateCourseProject(project, (draft) => {
      draft.courseState = [{ key: 'missing', valueType: 'boolean', defaultValue: false }]
      draft.globalLayerItems[0]!.visibility = {
        mode: 'include',
        locationIds: [laterLocation.id, nestedLocation.id],
      }
      draft.navigationGuards = [{
        id: 'later-guard',
        effect: 'block',
        toLocationIds: [laterLocation.id, nestedLocation.id],
        match: 'all',
        conditions: [{ type: 'exists', key: 'missing', exists: true }],
        message: '先完成当前任务',
      }]
    })

    project = deleteNestedFlowBlock(project, 'flow-main', 'nested-later')
    expect(project.globalLayerItems[0]!.visibility.locationIds).toEqual([laterLocation.id])
    expect(project.navigationGuards[0]!.toLocationIds).toEqual([laterLocation.id])

    project = deleteFlowBlock(project, 'flow-main', 'later-block')
    expect(project.globalLayerItems[0]!.visibility.locationIds).not.toContain(laterLocation.id)
    expect(project.navigationGuards).toEqual([])
  })

  it('uses the exact course location for a named scene state in Studio playback', () => {
    let project = createCourseProject({ id: 'session-named-state' })
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('missing slide')
    const scene = slide.scenes[0]!
    project = updateCourseProject(project, (draft) => {
      const currentSlide = draft.surfaces[0]
      if (currentSlide?.type !== 'slide') throw new Error('missing slide')
      currentSlide.scenes[0]!.presentation!.states.push({
        id: 'state-b',
        name: '讲解结果',
        layerItemOverrides: {},
      })
      draft.locations.push({
        id: 'location-state-b',
        label: '讲解结果',
        kind: 'slide-scene',
        surfaceId: currentSlide.id,
        sceneId: currentSlide.scenes[0]!.id,
        stateId: 'state-b',
      })
    })
    const activateLocation = vi.fn()
    const session = new CourseStudioPlaybackSession(project, {
      getActiveSurfaceId: () => slide.id,
      getActiveSceneId: () => scene.id,
      activateLocation,
      setPresentationState: () => true,
      presentationState: () => ({ current: null, states: [] }),
      onBlocked: vi.fn(),
    })
    expect(session.goToScene(scene.id, 'state-b')).toBe(true)
    expect(session.currentLocationId).toBe('location-state-b')
    expect(activateLocation).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'location-state-b',
      stateId: 'state-b',
    }))

    session.authorActivate(project.locations.find((location) => location.id === project.startLocationId)!)
    expect(session.setPresentationState(slide.id, 'state-b')).toBe(true)
    expect(session.currentLocationId).toBe('location-state-b')
  })

  it('opens the authored initial review frame and supports a saved frame without a dedicated location', () => {
    let project = createCourseProject({ id: 'session-base-location-state' })
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('missing slide')
    const scene = slide.scenes[0]!
    const baseLocation = project.locations.find((location) => (
      location.kind === 'slide-scene' && location.sceneId === scene.id
    ))!
    project = updateCourseProject(project, (draft) => {
      const currentSlide = draft.surfaces[0]
      if (currentSlide?.type !== 'slide') throw new Error('missing slide')
      currentSlide.scenes[0]!.presentation = {
        initialStateId: 'state-b',
        states: [
          { id: 'state-a', name: '画面 A', layerItemOverrides: {} },
          { id: 'state-b', name: '画面 B', layerItemOverrides: {} },
        ],
      }
    })
    const activateLocation = vi.fn()
    const setPresentationState = vi.fn(() => true)
    const session = new CourseStudioPlaybackSession(project, {
      getActiveSurfaceId: () => slide.id,
      getActiveSceneId: () => scene.id,
      activateLocation,
      setPresentationState,
      presentationState: () => ({ current: null, states: [] }),
      onBlocked: vi.fn(),
    })

    expect(session.goToScene(scene.id)).toBe(true)
    expect(session.currentLocationId).toBe(baseLocation.id)
    expect(activateLocation).toHaveBeenLastCalledWith(expect.objectContaining({ id: baseLocation.id }))

    expect(session.goToScene(scene.id, 'state-a')).toBe(true)
    expect(session.currentLocationId).toBe(baseLocation.id)
    expect(setPresentationState).toHaveBeenCalledWith(slide.id, 'state-a')
  })

  it('exports real editable Slide PPTX bytes and reports non-Slide omissions', async () => {
    let project = createCourseProject({ id: 'pptx-course', title: '多表面导出' })
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('missing slide')
    project = addSlideTextLayer(project, slide.id, slide.scenes[0]!.id, 'PPTX 可编辑文字')
    project = addCourseSurface(project, 'flow', { id: 'pptx-flow' })
    project = addCourseSurface(project, 'spatial-2d', { id: 'pptx-space' })
    const built = await buildCoursePptx(project, {})
    expect([...built.bytes.slice(0, 2)]).toEqual([0x50, 0x4b])
    expect(built.slideCount).toBe(1)
    expect(built.warnings.join('\n')).toMatch(/流式讲义|空间画布/u)
    expect(built.warnings.join('\n')).not.toMatch(/\bflow\b|spatial-2d|\bsurface\b/u)
    expect(built.differences.some((difference) => (
      difference.target === 'pptx' && difference.disposition === 'omitted'
    ))).toBe(true)
  })

  it('PPTX 按幻灯片初始画面的精确课程位置筛选共享图层', async () => {
    const project = createCourseProject({ id: 'pptx-state-location' })
    const surface = project.surfaces[0]!
    if (surface.type !== 'slide') throw new Error('missing slide')
    const scene = surface.scenes[0]!
    scene.presentation = {
      initialStateId: 'state-b',
      states: [
        { id: 'state-a', name: '画面 A', layerItemOverrides: {} },
        { id: 'state-b', name: '画面 B', layerItemOverrides: {} },
      ],
    }
    project.locations = [
      { id: 'location-a', label: '画面 A', kind: 'slide-scene', surfaceId: surface.id, sceneId: scene.id, stateId: 'state-a' },
      { id: 'location-b', label: '画面 B', kind: 'slide-scene', surfaceId: surface.id, sceneId: scene.id, stateId: 'state-b' },
    ]
    project.startLocationId = 'location-b'
    const stateOnly = runtimeItem('')
    stateOnly.layerItemId = 'state-only-internal'
    stateOnly.label = '状态专属互动内容'
    project.globalLayerItems = [{
      item: stateOnly,
      visibility: { mode: 'include', locationIds: ['location-b'] },
    }]
    const built = await buildCoursePptx(project, {})
    expect(built.warnings.join('\n')).toContain('状态专属互动内容')
    expect(built.warnings.join('\n')).not.toMatch(/state-only-internal|\bruntime\b|surface-v1/u)

    project.locations = [
      project.locations[0]!,
      { id: 'location-generic', label: '进入初始画面', kind: 'slide-scene', surfaceId: surface.id, sceneId: scene.id },
    ]
    const genericBuilt = await buildCoursePptx(project, {})
    expect(genericBuilt.warnings.join('\n')).not.toContain('状态专属互动内容')

    project.locations = [project.locations[0]!]
    await expect(buildCoursePptx(project, {})).rejects.toThrow(/初始画面对应的课程位置/u)
  })

  it('wires PPTX dynamic export to the currently mounted Slide instance', async () => {
    const project = createCourseProject({ id: 'current-pptx-capture' })
    const surface = project.surfaces[0]!
    if (surface.type !== 'slide') throw new Error('missing slide')
    const scene = surface.scenes[0]!
    const dynamic = runtimeItem('CoursewareSurfaceRuntime.define({runtimeApiVersion:3,create(){return{destroy(){}}}})')
    const host = {
      sceneId: scene.id,
      stateId: scene.presentation?.initialStateId,
    } as unknown as SlideSurfaceHost
    const captureItem = vi.fn().mockResolvedValue('data:image/png;base64,Q1VSUkVOVA==')
    const capture = currentPptxDynamicCapture(() => host, () => surface.id, captureItem)

    await expect(capture({ project, surface, scene, item: dynamic })).resolves.toBe(
      'data:image/png;base64,Q1VSUkVOVA==',
    )
    expect(captureItem).toHaveBeenCalledWith(host, dynamic)

    const closedSceneCapture = currentPptxDynamicCapture(() => host, () => 'another-surface')
    await expect(closedSceneCapture({ project, surface, scene, item: dynamic })).rejects.toThrow(
      /未在画布上打开/,
    )
  })
})
