import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  addSlideTextLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  buildSlideEditorView,
  type DeepReadonly,
} from '@/renderer/course/slideEditorView'
import type { CourseProjectDocument, NativeLayerItem } from '@/shared/courseProjectTypes'

const NOW = '2026-08-15T00:00:00.000Z'

function slideFixture(): {
  project: CourseProjectDocument
  locationId: string
  surfaceId: string
  sceneId: string
  controllerId: string
} {
  let project = createCourseProject({ id: 'course-slide-view', title: '投影测试', now: NOW })
  const initialSurface = project.surfaces[0]
  if (initialSurface?.type !== 'slide') throw new Error('expected initial Slide surface')
  const surfaceId = initialSurface.id
  const sceneId = initialSurface.scenes[0]!.id
  const locationId = project.startLocationId

  project = addSlideTextLayer(project, surfaceId, sceneId, '基础文字 A', {
    id: 'scene-a',
    now: NOW,
  })
  project = addSlideTextLayer(project, surfaceId, sceneId, '基础文字 B', {
    id: 'scene-b',
    now: NOW,
  })
  const controllerId = project.globalLayerItems[0]!.item.layerItemId

  project = updateCourseProject(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
    const scene = surface.scenes.find((candidate) => candidate.id === sceneId)!
    const sceneA = scene.layerItems.find((item) => item.layerItemId === 'scene-a')!
    const sceneB = scene.layerItems.find((item) => item.layerItemId === 'scene-b')!
    if (sceneB.kind !== 'native' || sceneB.content.nativeType !== 'text') {
      throw new Error('expected native text layer')
    }

    draft.globalLayerItems[0]!.item.order = 50
    sceneA.order = 20
    sceneB.order = 30

    const hiddenGlobal = structuredClone(sceneA)
    hiddenGlobal.layerItemId = 'global-hidden'
    hiddenGlobal.label = '作用域外全局文字'
    hiddenGlobal.order = 10
    draft.globalLayerItems.unshift({
      item: hiddenGlobal,
      visibility: { mode: 'exclude', locationIds: [locationId] },
    })

    const sharedSurface = structuredClone(sceneA)
    sharedSurface.layerItemId = 'surface-shared'
    sharedSurface.label = '表面共享文字'
    sharedSurface.order = 25
    surface.surfaceLayerItems.push({
      item: sharedSurface,
      visibility: { mode: 'include', locationIds: [locationId] },
    })

    const initialState = scene.presentation!.states[0]!
    initialState.name = '讲评态'
    initialState.description = '命名状态投影'
    initialState.backgroundColor = '#112233'
    initialState.layerItemOverrides = {
      'scene-b': {
        label: '状态文字 B',
        frame: { x: 444 },
        visible: false,
        nativeData: {
          text: '状态文字内容',
          style: {
            ...sceneB.content.data.style,
            fontSize: 64,
            bold: true,
          },
        },
      },
    }
    initialState.layerItemOrder = ['scene-b', 'scene-a']
    const location = draft.locations.find((candidate) => candidate.id === locationId)
    if (!location || location.kind !== 'slide-scene') throw new Error('expected Slide location')
    location.stateId = initialState.id
  }, NOW)

  return { project, locationId, surfaceId, sceneId, controllerId }
}

type ReadonlyTextContent = Extract<
  DeepReadonly<NativeLayerItem>['content'],
  { readonly nativeType: 'text' }
>

function nativeText(item: DeepReadonly<NativeLayerItem>): ReadonlyTextContent['data'] {
  if (item.content.nativeType !== 'text') throw new Error('expected text content')
  return item.content.data
}

describe('Slide editor read projection', () => {
  it('materializes a named state while retaining every scope in one sparse order', () => {
    const fixture = slideFixture()
    const before = structuredClone(fixture.project)
    const view = buildSlideEditorView({
      project: fixture.project,
      locationId: fixture.locationId,
    })

    expect(view).toMatchObject({
      projectId: 'course-slide-view',
      revision: fixture.project.revision,
      locationId: fixture.locationId,
      surfaceId: fixture.surfaceId,
      surfaceTitle: '投影测试',
      sceneId: fixture.sceneId,
      sceneName: '场景 1',
      canvas: { width: 1280, height: 720 },
      backgroundColor: '#112233',
      backgroundAssetId: null,
    })
    expect(view.presentation).toEqual({
      activeStateId: 'state_initial',
      initialStateId: 'state_initial',
      thumbnailStateId: 'state_initial',
      states: [{
        id: 'state_initial',
        name: '讲评态',
        description: '命名状态投影',
        initial: true,
        thumbnail: true,
        active: true,
      }],
    })
    expect(view.layers.map(({ selectionId, item }) => [selectionId, item.order])).toEqual([
      ['global-hidden', 10],
      ['scene-b', 20],
      ['surface-shared', 25],
      ['scene-a', 30],
      [fixture.controllerId, 50],
    ])
    expect(view.layers.map(({ source }) => source)).toEqual([
      'global', 'scene', 'surface', 'scene', 'global',
    ])
    expect(view.layers.every(({ selectionId, item }) => selectionId === item.layerItemId)).toBe(true)
    expect(view.layers.find(({ selectionId }) => selectionId === 'global-hidden')).toMatchObject({
      scopedVisible: false,
      effectiveVisible: false,
    })
    expect(view.layers.find(({ selectionId }) => selectionId === 'surface-shared')).toMatchObject({
      scopedVisible: true,
      effectiveVisible: true,
    })

    const stateLayer = view.layers.find(({ selectionId }) => selectionId === 'scene-b')!
    expect(stateLayer).toMatchObject({
      scopedVisible: true,
      effectiveVisible: false,
      item: { label: '状态文字 B', frame: { x: 444 }, visible: false },
    })
    if (stateLayer.item.kind !== 'native') throw new Error('expected native layer')
    expect(nativeText(stateLayer.item)).toMatchObject({
      text: '状态文字内容',
      style: { fontSize: 64, bold: true, color: '#1f2937' },
    })

    expect(fixture.project).toEqual(before)
    expect(stateLayer.item).not.toBe(
      (fixture.project.surfaces[0] as { scenes: Array<{ layerItems: unknown[] }> })
        .scenes[0]!.layerItems[1],
    )
    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.isFrozen(view.layers)).toBe(true)
    expect(Object.isFrozen(stateLayer.item)).toBe(true)
    expect(Object.isFrozen(nativeText(stateLayer.item).style)).toBe(true)
    expect(() => {
      ;(view.layers as unknown[]).push({})
    }).toThrow()
  })

  it('keeps explicit base state distinct from the location named state', () => {
    const fixture = slideFixture()
    const view = buildSlideEditorView({
      project: fixture.project,
      locationId: fixture.locationId,
      stateId: null,
    })

    expect(view.backgroundColor).toBe('#ffffff')
    expect(view.presentation?.activeStateId).toBeNull()
    expect(view.presentation?.states[0]?.active).toBe(false)
    expect(view.layers.map(({ selectionId, item }) => [selectionId, item.order])).toEqual([
      ['global-hidden', 10],
      ['scene-a', 20],
      ['surface-shared', 25],
      ['scene-b', 30],
      [fixture.controllerId, 50],
    ])
    const baseLayer = view.layers.find(({ selectionId }) => selectionId === 'scene-b')!
    expect(baseLayer.effectiveVisible).toBe(true)
    expect(baseLayer.item).toMatchObject({ label: '基础文字 B', frame: { x: 120 }, visible: true })
    if (baseLayer.item.kind !== 'native') throw new Error('expected native layer')
    expect(nativeText(baseLayer.item).text).toBe('基础文字 B')
  })

  it('rejects unknown locations, unknown states and non-Slide locations', () => {
    const fixture = slideFixture()
    expect(() => buildSlideEditorView({
      project: fixture.project,
      locationId: 'missing-location',
    })).toThrow('找不到课程位置：missing-location')
    expect(() => buildSlideEditorView({
      project: fixture.project,
      locationId: fixture.locationId,
      stateId: 'missing-state',
    })).toThrow('找不到 Slide 状态：missing-state')

    const mixed = addCourseSurface(fixture.project, 'flow', { id: 'flow-not-slide', now: NOW })
    const flowLocation = mixed.locations.find((location) => location.kind === 'flow-block')!
    expect(() => buildSlideEditorView({
      project: mixed,
      locationId: flowLocation.id,
    })).toThrow(`SlideEditorView 只接受 Slide 场景位置：${flowLocation.id}`)
  })
})
