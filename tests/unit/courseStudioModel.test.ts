import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  addFlowBlock,
  addNativeVisualLayer,
  addSlideTextLayer,
  applyCourseAuthoringPatch,
  commitCourseHistory,
  CourseRevisionConflictError,
  createBlankFlowCourseProject,
  createBlankSlideCourseProject,
  createBlankSpatialCourseProject,
  createCourseHistory,
  createCourseProject,
  deleteSlidePresentationState,
  redoCourseHistory,
  renameSlidePresentationState,
  reorderLayerItem,
  saveSlidePresentationState,
  setInitialSlidePresentationState,
  undoCourseHistory,
} from '@/renderer/course/courseStudioModel'
import { deriveCourseProjectAuthoringInventorySnapshot } from '@/shared/courseProjectModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-14T00:00:00.000Z'

describe('Course Studio product model', () => {
  it('creates a schema-valid V9 project directly with its initial state and global controller', () => {
    const factorySource = createCourseProject.toString()
    expect(factorySource).not.toMatch(/\bcreateProject\s*\(/u)
    expect(factorySource).not.toContain('migrateProjectV8ToCourseProjectV9')

    const project = createCourseProject({ id: 'course-direct-v9', title: '直接 V9', now: NOW })
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
    expect(project).toMatchObject({
      schemaVersion: 9,
      id: 'course-direct-v9',
      revision: 0,
      title: '直接 V9',
      createdAt: NOW,
      updatedAt: NOW,
      startLocationId: expect.stringMatching(/^scene-/u),
      playback: {
        controls: 'canvas',
        keyboardNavigation: true,
        presenter: { enabled: true, strategy: 'scene-navigation', additionalBindings: [] },
      },
    })

    expect(project.surfaces).toHaveLength(1)
    const surface = project.surfaces[0]
    if (surface?.type !== 'slide') throw new Error('expected initial Slide surface')
    expect(surface).toMatchObject({
      id: 'slide:course-direct-v9',
      title: '直接 V9',
      canvas: { width: 1280, height: 720 },
      surfaceLayerItems: [],
    })
    expect(surface.scenes).toHaveLength(1)
    const scene = surface.scenes[0]!
    expect(scene).toMatchObject({
      id: project.startLocationId,
      name: '场景 1',
      backgroundColor: '#ffffff',
      backgroundAssetId: null,
      layerItems: [],
      presentation: {
        initialStateId: 'state_initial',
        thumbnailStateId: 'state_initial',
        states: [{ id: 'state_initial', name: '初始', layerItemOverrides: {} }],
      },
      interactions: [],
    })
    expect(project.locations).toEqual([{
      id: scene.id,
      label: '场景 1',
      kind: 'slide-scene',
      surfaceId: surface.id,
      sceneId: scene.id,
    }])

    expect(project.globalLayerItems).toHaveLength(1)
    const controllerEntry = project.globalLayerItems[0]!
    expect(controllerEntry.visibility).toEqual({ mode: 'all', locationIds: [] })
    expect(controllerEntry.item).toMatchObject({
      layerItemId: expect.stringMatching(/^teacher-controller-/u),
      label: '教师控制器',
      frame: { mode: 'absolute', x: 190, y: 638, width: 900, height: 64 },
      order: 1,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      kind: 'native',
      content: { nativeType: 'teacher-controller' },
    })
    if (controllerEntry.item.kind !== 'native' ||
      controllerEntry.item.content.nativeType !== 'teacher-controller') {
      throw new Error('expected global teacher controller')
    }
    const controller = controllerEntry.item.content.data
    expect(controller).toMatchObject({
      title: '教师控制台',
      showSceneProgress: true,
      compact: false,
      collapsible: true,
      defaultCollapsed: false,
      style: {
        backgroundColor: '#172033',
        backgroundOpacity: 0.94,
        accentColor: '#e7b85c',
        textColor: '#f8fafc',
        cornerRadius: 16,
      },
      includeInStaticExports: false,
    })
    expect(controller.buttons.map(({ action, label, visible }) => ({ action, label, visible }))).toEqual([
      { action: { type: 'scene.previous' }, label: '上一场景', visible: true },
      { action: { type: 'scene.next' }, label: '下一场景', visible: true },
      { action: { type: 'scene.open-picker' }, label: '场景目录', visible: true },
      { action: { type: 'scene.replay' }, label: '重播', visible: true },
      { action: { type: 'course.restart' }, label: '重新开始', visible: false },
      { action: { type: 'audio.toggle-mute' }, label: '声音', visible: true },
      { action: { type: 'player.fullscreen.toggle' }, label: '全屏', visible: true },
    ])
    expect(new Set(controller.buttons.map((button) => button.id)).size).toBe(controller.buttons.length)
  })

  it('creates and incrementally edits Slide, Flow and Spatial surfaces', () => {
    let project = createCourseProject({ id: 'course-ui', title: '多表面课程', now: NOW })
    const slide = project.surfaces[0]
    expect(slide?.type).toBe('slide')
    if (slide?.type !== 'slide') throw new Error('expected slide')
    project = addSlideTextLayer(project, slide.id, slide.scenes[0]!.id, '二次函数', {
      id: 'layer-title',
      now: NOW,
    })
    project = addCourseSurface(project, 'flow', { id: 'flow', now: NOW })
    project = addFlowBlock(project, 'flow', {
      type: 'paragraph',
      id: 'flow-body',
      text: '这是可编辑的流式正文。',
    }, NOW)
    project = addCourseSurface(project, 'spatial-2d', { id: 'spatial', now: NOW })

    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
    expect(project.surfaces.map((surface) => surface.type)).toEqual([
      'slide',
      'flow',
      'spatial-2d',
    ])
    expect(project.revision).toBe(4)
    expect(project.mixedPrintPlan).toBeDefined()
  })

  it('uses one canonical interleaved layer order', () => {
    let project = createCourseProject({ id: 'course-order', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    const scene = slide.scenes[0]!
    const initialIds = scene.layerItems.map((item) => item.layerItemId)
    project = addSlideTextLayer(project, slide.id, scene.id, '中间文字', {
      id: 'text-middle',
      now: NOW,
    })
    project = reorderLayerItem(project, {
      surfaceId: slide.id,
      sceneId: scene.id,
      layerItemId: 'text-middle',
      toIndex: 0,
    }, NOW)
    const reordered = project.surfaces[0]
    if (reordered?.type !== 'slide') throw new Error('expected slide')
    expect(reordered.scenes[0]?.layerItems.map((item) => item.layerItemId)).toEqual([
      'text-middle',
      ...initialIds,
    ])
    const orders = reordered.scenes[0]?.layerItems.map((item) => item.order) ?? []
    expect(orders.every((order, index) => index === 0 || order > orders[index - 1]!)).toBe(true)
  })

  it('adds editable formula and shape Native layers to Slide and Spatial', () => {
    let project = createCourseProject({ id: 'course-native-visuals', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    project = addNativeVisualLayer(project, {
      surfaceId: slide.id,
      sceneId: slide.scenes[0]!.id,
      nativeType: 'formula',
      id: 'formula-editable',
      now: NOW,
    })
    project = addCourseSurface(project, 'spatial-2d', { id: 'spatial-visuals', now: NOW })
    project = addNativeVisualLayer(project, {
      surfaceId: 'spatial-visuals',
      nativeType: 'shape',
      shapeType: 'diamond',
      id: 'shape-editable',
      x: 80,
      y: 120,
      now: NOW,
    })
    const currentSlide = project.surfaces[0]
    const spatial = project.surfaces.find((surface) => surface.id === 'spatial-visuals')
    expect(currentSlide?.type === 'slide' && currentSlide.scenes[0]?.layerItems.some((item) => (
      item.layerItemId === 'formula-editable' && item.kind === 'native' && item.content.nativeType === 'formula'
    ))).toBe(true)
    expect(spatial?.type === 'spatial-2d' && spatial.world.layerItems.some((item) => (
      item.layerItemId === 'shape-editable' &&
      item.kind === 'native' &&
      item.content.nativeType === 'shape' &&
      item.content.data.shapeType === 'diamond' &&
      item.frame.x === 80
    ))).toBe(true)
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
  })

  it('adds a new native layer to one named state without leaking into the base frame', () => {
    let project = createCourseProject({ id: 'course-state-insert', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    const sceneId = slide.scenes[0]!.id
    project = saveSlidePresentationState(project, slide.id, sceneId, {
      id: 'state-reveal',
      name: '揭示答案',
      layerItemOverrides: {},
    }, NOW)
    project = addSlideTextLayer(project, slide.id, sceneId, '只在答案态出现', {
      id: 'state-only-text',
      stateId: 'state-reveal',
      x: 320,
      y: 240,
      now: NOW,
    })

    const current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    const scene = current.scenes[0]!
    expect(scene.layerItems.find((item) => item.layerItemId === 'state-only-text')).toMatchObject({
      frame: { x: 320, y: 240 },
      visible: false,
    })
    expect(scene.presentation?.states.find((state) => state.id === 'state-reveal')
      ?.layerItemOverrides['state-only-text']).toEqual({ visible: true })
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
  })

  it('patches exactly one stable authoring address with revision protection', () => {
    let project = createCourseProject({ id: 'course-patch', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    project = addSlideTextLayer(project, slide.id, slide.scenes[0]!.id, '原文', {
      id: 'text-target',
      now: NOW,
    })
    const inventory = deriveCourseProjectAuthoringInventorySnapshot(project)
    const address = Object.keys(inventory.entries).find((candidate) =>
      candidate.includes('text-target') && candidate.endsWith('field=content.data.text'),
    )
    expect(address).toBeTruthy()
    const next = applyCourseAuthoringPatch(project, {
      op: 'replace',
      expectedRevision: project.revision,
      authoringAddress: address!,
      expectedValue: '原文',
      value: '仅修改目标',
    }, NOW)
    const nextSlide = next.surfaces[0]
    if (nextSlide?.type !== 'slide') throw new Error('expected slide')
    const target = nextSlide.scenes[0]?.layerItems.find((item) => item.layerItemId === 'text-target')
    expect(target?.kind === 'native' && target.content.nativeType === 'text'
      ? target.content.data.text
      : null).toBe('仅修改目标')
    expect(() => applyCourseAuthoringPatch(next, {
      op: 'replace',
      expectedRevision: project.revision,
      authoringAddress: address!,
      value: '过期修改',
    }, NOW)).toThrow(CourseRevisionConflictError)
  })

  it('provides bounded undo and redo over complete valid projects', () => {
    const first = createCourseProject({ id: 'course-history', now: NOW })
    const second = addCourseSurface(first, 'flow', { id: 'flow', now: NOW })
    let history = commitCourseHistory(createCourseHistory(first), second)
    history = undoCourseHistory(history)
    expect(history.present.surfaces).toHaveLength(1)
    history = redoCourseHistory(history)
    expect(history.present.surfaces).toHaveLength(2)
    expect(courseProjectDocumentSchema.safeParse(history.present).success).toBe(true)
  })

  it('persists, renames, selects and deletes an explicit Slide review state', () => {
    let project = createCourseProject({ id: 'course-named-state', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    const sceneId = slide.scenes[0]!.id
    project = addSlideTextLayer(project, slide.id, sceneId, '可见文字', {
      id: 'review-text',
      now: NOW,
    })
    project = saveSlidePresentationState(project, slide.id, sceneId, {
      id: 'review-revealed',
      name: '讲评画面',
      description: '仅保存可结构化的作者画面',
      backgroundColor: '#f8fafc',
      layerItemOverrides: {
        'review-text': { visible: true },
      },
    }, NOW)
    let current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    expect(current.scenes[0]!.presentation).toMatchObject({
      initialStateId: 'state_initial',
      thumbnailStateId: 'state_initial',
      states: [
        { id: 'state_initial', name: '初始' },
        { id: 'review-revealed', name: '讲评画面' },
      ],
    })

    project = saveSlidePresentationState(project, slide.id, sceneId, {
      id: 'review-clean',
      name: '清爽画面',
      layerItemOverrides: {},
    }, NOW)
    project = renameSlidePresentationState(
      project, slide.id, sceneId, 'review-clean', '课堂复核态', NOW,
    )
    project = setInitialSlidePresentationState(
      project, slide.id, sceneId, 'review-clean', NOW,
    )
    current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    expect(current.scenes[0]!.presentation).toMatchObject({
      initialStateId: 'review-clean',
      states: [
        { id: 'state_initial' },
        { id: 'review-revealed' },
        { id: 'review-clean', name: '课堂复核态' },
      ],
    })

    project = deleteSlidePresentationState(
      project, slide.id, sceneId, 'review-clean', NOW,
    )
    current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    expect(current.scenes[0]!.presentation?.initialStateId).toBe('state_initial')
    project = deleteSlidePresentationState(
      project, slide.id, sceneId, 'review-revealed', NOW,
    )
    current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    expect(() => deleteSlidePresentationState(
      project, slide.id, sceneId, 'state_initial', NOW,
    )).toThrow('至少需要一个命名状态')
    current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    expect(current.scenes[0]!.presentation?.states).toEqual([
      { id: 'state_initial', name: '初始', layerItemOverrides: {} },
    ])
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
  })

  it('creates blank Flow and Spatial documents from the same project shell', () => {
    const slide = createBlankSlideCourseProject({ id: 'blank-model-slide', title: '直接 V9', now: NOW })
    expect(courseProjectDocumentSchema.parse(slide)).toEqual(slide)
    expect(slide.surfaces.map((surface) => surface.type)).toEqual(['slide'])
    expect(slide.locations[0]?.kind).toBe('slide-scene')

    const flow = createBlankFlowCourseProject({ id: 'blank-model-flow', title: '空白讲义', now: NOW })
    expect(courseProjectDocumentSchema.parse(flow)).toEqual(flow)
    expect(flow.revision).toBe(0)
    expect(flow.surfaces.map((surface) => surface.type)).toEqual(['flow'])
    expect(flow.locations).toHaveLength(1)
    const flowSurface = flow.surfaces[0]
    if (flowSurface?.type !== 'flow') throw new Error('expected flow')
    expect(flowSurface.blocks.map((block) => block.type)).toEqual(['heading', 'paragraph'])

    const spatial = createBlankSpatialCourseProject({ id: 'blank-model-spatial', title: '空白画布', now: NOW })
    expect(courseProjectDocumentSchema.parse(spatial)).toEqual(spatial)
    expect(spatial.surfaces.map((surface) => surface.type)).toEqual(['spatial-2d'])
    expect(spatial.locations[0]?.kind).toBe('spatial-camera')
  })
})
