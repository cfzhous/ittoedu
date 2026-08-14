import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  addFlowBlock,
  addNativeVisualLayer,
  addSlideScene,
  addSlideTextLayer,
  addTeacherController,
  applyCourseAuthoringPatch,
  commitCourseHistory,
  CourseRevisionConflictError,
  createCourseHistory,
  createCourseProject,
  deleteCourseSurface,
  deleteLayerItem,
  deleteSlidePresentationState,
  redoCourseHistory,
  renameCourseSurface,
  renameSlidePresentationState,
  reorderLayerItem,
  saveSlidePresentationState,
  setInitialSlidePresentationState,
  undoCourseHistory,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { deriveCourseProjectAuthoringInventorySnapshot } from '@/shared/courseProjectModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-14T00:00:00.000Z'

describe('Course Studio product model', () => {
  it('删除一类课程内容时一并修复作用范围和翻页条件', () => {
    let project = addCourseSurface(
      createCourseProject({ id: 'course-surface-delete', now: NOW }),
      'flow',
      { id: 'flow-delete', now: NOW },
    )
    const flowLocation = project.locations.find((location) => location.surfaceId === 'flow-delete')!
    project = updateCourseProject(project, (draft) => {
      draft.courseState = [{ key: 'ready', valueType: 'boolean', defaultValue: false }]
      draft.globalLayerItems[0]!.visibility = {
        mode: 'include',
        locationIds: [flowLocation.id],
      }
      draft.navigationGuards = [{
        id: 'flow-guard',
        effect: 'block',
        toLocationIds: [flowLocation.id],
        match: 'all',
        conditions: [{ type: 'compare', key: 'ready', operator: 'eq', value: true }],
        message: '先完成当前任务',
      }]
    }, NOW)

    project = deleteCourseSurface(project, 'flow-delete', NOW)
    expect(project.surfaces).toHaveLength(1)
    expect(project.locations.some((location) => location.id === flowLocation.id)).toBe(false)
    expect(project.navigationGuards).toEqual([])
    expect(project.globalLayerItems).toEqual([])
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
  })

  it('删除图层时原子清理命名状态、互动和 Runtime 节点绑定', () => {
    let project = createCourseProject({ id: 'course-layer-reference-delete', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    const sceneId = slide.scenes[0]!.id
    project = addSlideTextLayer(project, slide.id, sceneId, '待删除', {
      id: 'layer-delete-target', now: NOW,
    })
    project = updateCourseProject(project, (draft) => {
      const current = draft.surfaces[0]
      if (current?.type !== 'slide') throw new Error('expected slide')
      const scene = current.scenes[0]!
      scene.presentation!.states[0]!.layerItemOverrides['layer-delete-target'] = { visible: false }
      scene.presentation!.states[0]!.layerItemOrder = ['layer-delete-target']
      scene.layerItems.push({
        layerItemId: 'runtime-observer',
        label: '观察器',
        kind: 'runtime',
        frame: { mode: 'absolute', x: 0, y: 0, width: 320, height: 180 },
        order: 3,
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
          source: 'CoursewareSurfaceRuntime.define({runtimeApiVersion:3,create(){return{destroy(){}}}})',
          content: { values: {} },
          assets: {},
          nodeBindings: { target: 'layer-delete-target' },
        },
      })
      scene.interactions = [{
        id: 'target-trigger',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'layer-delete-target' },
        conditions: [],
        actions: [{
          id: 'restart-after-click',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }, {
        id: 'target-action',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [],
        actions: [{
          id: 'show-deleted',
          start: 'after-previous',
          delayMs: 0,
          action: {
            type: 'node.enter',
            nodeId: 'layer-delete-target',
            durationMs: 120,
            easing: 'ease-out',
            effect: 'fade',
          },
        }, {
          id: 'restart-after-show',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }, {
        id: 'after-deleted-animation',
        enabled: true,
        trigger: { type: 'animation.completed', actionId: 'show-deleted' },
        conditions: [],
        actions: [{
          id: 'restart-after-animation',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }]
      draft.globalInteractions = [{
        id: 'global-target-trigger',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'layer-delete-target' },
        conditions: [{ type: 'scene.in', sceneIds: [sceneId] }],
        actions: [{
          id: 'global-restart',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }]
    }, NOW)

    const revisionBefore = project.revision
    project = deleteLayerItem(project, {
      surfaceId: slide.id,
      sceneId,
      source: 'scene',
      layerItemId: 'layer-delete-target',
    }, NOW)
    expect(project.revision).toBe(revisionBefore + 1)
    const current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    const scene = current.scenes[0]!
    expect(scene.presentation!.states[0]!.layerItemOverrides).toEqual({})
    expect(scene.presentation!.states[0]!.layerItemOrder).toBeUndefined()
    expect(scene.interactions.map((rule) => rule.id)).toEqual(['target-action'])
    expect(scene.interactions[0]!.actions).toEqual([expect.objectContaining({
      id: 'restart-after-show',
      start: 'after-previous',
    })])
    const runtime = scene.layerItems.find((item) => item.layerItemId === 'runtime-observer')
    expect(runtime?.kind === 'runtime' ? runtime.runtime.nodeBindings : null).toBeUndefined()
    expect(project.globalInteractions).toEqual([])
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
  })

  it('删除表面时清理其图层留下的全局互动和 Runtime 绑定', () => {
    let project = createCourseProject({ id: 'course-surface-layer-cleanup', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    project = addSlideTextLayer(project, slide.id, slide.scenes[0]!.id, '局部目标', {
      id: 'removed-surface-layer', now: NOW,
    })
    project = addCourseSurface(project, 'flow', { id: 'remaining-flow', now: NOW })
    project = updateCourseProject(project, (draft) => {
      draft.globalLayerItems.push({
        item: {
          layerItemId: 'global-runtime-binding',
          label: '全局运行时',
          kind: 'runtime',
          frame: { mode: 'absolute', x: 0, y: 0, width: 240, height: 140 },
          order: 3,
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
            source: 'CoursewareSurfaceRuntime.define({runtimeApiVersion:3,create(){return{destroy(){}}}})',
            content: { values: {} },
            assets: {},
            nodeBindings: { target: 'removed-surface-layer' },
          },
        },
        visibility: { mode: 'all', locationIds: [] },
      })
      draft.globalInteractions = [{
        id: 'removed-surface-global-rule',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'removed-surface-layer' },
        conditions: [],
        actions: [{
          id: 'removed-surface-restart',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }]
    }, NOW)

    project = deleteCourseSurface(project, slide.id, NOW)
    expect(project.globalInteractions).toEqual([])
    const runtime = project.globalLayerItems.find(({ item }) => item.layerItemId === 'global-runtime-binding')?.item
    expect(runtime?.kind === 'runtime' ? runtime.runtime.nodeBindings : null).toBeUndefined()
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
  })

  it('删除会清空全部位置的表面时给出中文领域错误而不是 TypeError', () => {
    let project = addCourseSurface(
      createCourseProject({ id: 'course-empty-location-guard', now: NOW }),
      'flow',
      { id: 'empty-flow', now: NOW },
    )
    const slideId = project.surfaces[0]!.id
    project = updateCourseProject(project, (draft) => {
      const flow = draft.surfaces.find((surface) => surface.id === 'empty-flow')
      if (flow?.type !== 'flow') throw new Error('expected flow')
      flow.blocks = []
      draft.locations = draft.locations.filter((location) => location.surfaceId !== 'empty-flow')
    }, NOW)
    expect(() => deleteCourseSurface(project, slideId, NOW))
      .toThrow('删除后课程至少需要一个可进入的位置')
  })

  it('删除后可通过正式 V9 元素入口恢复全课程教师控制器', () => {
    let project = createCourseProject({ id: 'course-controller-recovery', now: NOW })
    const controllerId = project.globalLayerItems.find(({ item }) => (
      item.kind === 'native' && item.content.nativeType === 'teacher-controller'
    ))!.item.layerItemId
    project = deleteLayerItem(project, {
      surfaceId: project.surfaces[0]!.id,
      source: 'global',
      layerItemId: controllerId,
    }, NOW)
    expect(project.globalLayerItems).toHaveLength(0)

    project = addTeacherController(project, { id: 'restored-controller', now: NOW })
    const restored = project.globalLayerItems[0]!
    expect(restored.visibility).toEqual({ mode: 'all', locationIds: [] })
    expect(restored.item).toMatchObject({
      layerItemId: 'restored-controller',
      kind: 'native',
      content: { nativeType: 'teacher-controller' },
    })
    expect(() => addTeacherController(project, { id: 'duplicate-controller', now: NOW })).toThrow(/已经有/u)
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
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

  it('reorders a course-wide controller between current scene layers', () => {
    let project = createCourseProject({ id: 'course-global-order', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    const sceneId = slide.scenes[0]!.id
    project = addSlideTextLayer(project, slide.id, sceneId, 'A', { id: 'layer-a', now: NOW })
    project = addSlideTextLayer(project, slide.id, sceneId, 'B', { id: 'layer-b', now: NOW })
    const controllerId = project.globalLayerItems[0]!.item.layerItemId
    project = reorderLayerItem(project, {
      surfaceId: slide.id,
      sceneId,
      source: 'global',
      layerItemId: controllerId,
      toIndex: 1,
    }, NOW)
    const currentSlide = project.surfaces[0]
    if (currentSlide?.type !== 'slide') throw new Error('expected slide')
    const effective = [
      ...project.globalLayerItems.map((entry) => entry.item),
      ...currentSlide.surfaceLayerItems.map((entry) => entry.item),
      ...currentSlide.scenes[0]!.layerItems,
    ].sort((left, right) => left.order - right.order || left.layerItemId.localeCompare(right.layerItemId))
    expect(effective.map((item) => item.layerItemId)).toEqual(['layer-a', controllerId, 'layer-b'])
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
      item.layerItemId === 'shape-editable' && item.kind === 'native' && item.content.nativeType === 'shape' && item.frame.x === 80
    ))).toBe(true)
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

    project = updateCourseProject(project, (draft) => {
      const currentSlide = draft.surfaces[0]
      if (currentSlide?.type !== 'slide') throw new Error('expected slide')
      draft.locations.push({
        id: 'location-review-clean',
        label: '课堂复核态',
        kind: 'slide-scene',
        surfaceId: currentSlide.id,
        sceneId,
        stateId: 'review-clean',
      })
      currentSlide.scenes[0]!.interactions = [{
        id: 'review-rule',
        enabled: true,
        trigger: { type: 'presentation.enter', stateId: 'review-clean' },
        conditions: [{ type: 'presentation.in', stateIds: ['review-clean'] }],
        actions: [{
          id: 'review-action',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'presentation.set', stateId: 'review-clean' },
        }],
      }]
      const controller = draft.globalLayerItems[0]!.item
      if (controller.kind !== 'native' || controller.content.nativeType !== 'teacher-controller') {
        throw new Error('expected teacher controller')
      }
      controller.content.data.buttons.push({
        id: 'review-button',
        label: '课堂复核态',
        visible: true,
        action: { type: 'scene.go', sceneId, targetStateId: 'review-clean' },
      })
    }, NOW)

    project = deleteSlidePresentationState(
      project, slide.id, sceneId, 'review-clean', NOW,
    )
    current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    expect(current.scenes[0]!.presentation?.initialStateId).toBe('state_initial')
    expect(project.locations.find((location) => location.id === 'location-review-clean')).toMatchObject({
      stateId: 'state_initial',
    })
    expect(current.scenes[0]!.interactions[0]).toMatchObject({
      trigger: { stateId: 'state_initial' },
      conditions: [{ stateIds: ['state_initial'] }],
      actions: [{ action: { stateId: 'state_initial' } }],
    })
    const controller = project.globalLayerItems[0]!.item
    if (controller.kind !== 'native' || controller.content.nativeType !== 'teacher-controller') {
      throw new Error('expected teacher controller')
    }
    expect(controller.content.data.buttons.find((button) => button.id === 'review-button')?.action)
      .toMatchObject({ targetStateId: 'state_initial' })
    project = deleteSlidePresentationState(
      project, slide.id, sceneId, 'review-revealed', NOW,
    )
    current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    project = deleteSlidePresentationState(
      project, slide.id, sceneId, 'state_initial', NOW,
    )
    current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected slide')
    expect(current.scenes[0]!.presentation).toBeUndefined()
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
  })

  it('按场景语义修复重名状态，不误改其他场景的全局互动', () => {
    let project = createCourseProject({ id: 'course-local-state-id', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    const firstSceneId = slide.scenes[0]!.id
    project = addSlideScene(project, slide.id, {
      id: 'second-state-scene',
      name: '第二场景',
      now: NOW,
    })
    project = updateCourseProject(project, (draft) => {
      draft.globalInteractions = [{
        id: 'second-scene-state-rule',
        enabled: true,
        trigger: { type: 'presentation.enter', stateId: 'state_initial' },
        conditions: [{ type: 'scene.in', sceneIds: ['second-state-scene'] }],
        actions: [{
          id: 'second-scene-set-state',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'presentation.set', stateId: 'state_initial' },
        }],
      }, {
        id: 'shared-state-rule',
        enabled: true,
        trigger: { type: 'presentation.enter', stateId: 'state_initial' },
        conditions: [{
          type: 'scene.in',
          sceneIds: [firstSceneId, 'second-state-scene'],
        }],
        actions: [{
          id: 'shared-set-state',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'presentation.set', stateId: 'state_initial' },
        }],
      }]
    }, NOW)

    project = deleteSlidePresentationState(
      project, slide.id, firstSceneId, 'state_initial', NOW,
    )
    expect(project.globalInteractions[0]).toMatchObject({
      trigger: { stateId: 'state_initial' },
      conditions: [{ sceneIds: ['second-state-scene'] }],
      actions: [{ action: { stateId: 'state_initial' } }],
    })
    expect(project.globalInteractions[1]).toMatchObject({
      trigger: { stateId: 'state_initial' },
      conditions: [{ sceneIds: ['second-state-scene'] }],
      actions: [{ action: { stateId: 'state_initial' } }],
    })
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
  })

  it('重命名表面时只改标题派生的位置前缀并保留后缀', () => {
    let project = createCourseProject({ id: 'course-surface-rename', title: '旧标题', now: NOW })
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide')
    project = addSlideScene(project, slide.id, {
      id: 'rename-scene-two',
      name: '课堂练习',
      now: NOW,
    })
    project = updateCourseProject(project, (draft) => {
      const firstLocation = draft.locations.find((location) => (
        location.kind === 'slide-scene' && location.sceneId === slide.scenes[0]!.id
      ))
      if (firstLocation) firstLocation.label = '教师自定义入口'
    }, NOW)

    project = renameCourseSurface(project, slide.id, '新标题', NOW)
    expect(project.surfaces[0]!.title).toBe('新标题')
    expect(project.locations.find((location) => location.id === 'rename-scene-two')?.label)
      .toBe('新标题 · 课堂练习')
    expect(project.locations.find((location) => (
      location.kind === 'slide-scene' && location.sceneId === slide.scenes[0]!.id
    ))?.label)
      .toBe('教师自定义入口')
    expect(() => renameCourseSurface(project, slide.id, '   ', NOW)).toThrow('内容名称不能为空')
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
  })
})
