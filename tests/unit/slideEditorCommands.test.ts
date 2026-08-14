import { describe, expect, it } from 'vitest'
import {
  addNativeVisualLayer,
  addSlideTextLayer,
  createCourseHistory,
  createCourseProject,
  redoCourseHistory,
  undoCourseHistory,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  moveSelectedSlideText,
  selectSlideEditorLayer,
  type SlideEditorSelection,
} from '@/renderer/course/slideEditorCommands'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'

const NOW = '2026-08-15T01:00:00.000Z'

function fixture(): {
  project: CourseProjectDocument
  locationId: string
  surfaceId: string
  sceneId: string
  controllerId: string
} {
  let project = createCourseProject({ id: 'course-slide-command', now: NOW })
  const surface = project.surfaces[0]
  if (surface?.type !== 'slide') throw new Error('expected initial Slide surface')
  const sceneId = surface.scenes[0]!.id
  const locationId = project.startLocationId
  project = addSlideTextLayer(project, surface.id, sceneId, '可移动文字', {
    id: 'scene-text', now: NOW,
  })
  project = updateCourseProject(project, (draft) => {
    const slide = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
    const scene = slide.scenes.find((candidate) => candidate.id === sceneId)!
    const text = scene.layerItems.find((candidate) => candidate.layerItemId === 'scene-text')!
    const state = scene.presentation!.states[0]!
    state.layerItemOverrides['scene-text'] = {
      label: '命名状态文字',
      visible: false,
      frame: { x: 320, width: 555 },
    }
    const hiddenGlobal = structuredClone(text)
    hiddenGlobal.layerItemId = 'hidden-global-text'
    hiddenGlobal.order = 3
    draft.globalLayerItems.push({
      item: hiddenGlobal,
      visibility: { mode: 'exclude', locationIds: [locationId] },
    })
    const sharedSurface = structuredClone(text)
    sharedSurface.layerItemId = 'surface-text'
    sharedSurface.order = 4
    slide.surfaceLayerItems.push({
      item: sharedSurface,
      visibility: { mode: 'include', locationIds: [locationId] },
    })
    const location = draft.locations.find((candidate) => candidate.id === locationId)
    if (!location || location.kind !== 'slide-scene') throw new Error('expected Slide location')
    location.stateId = state.id
  }, NOW)
  return {
    project,
    locationId,
    surfaceId: surface.id,
    sceneId,
    controllerId: project.globalLayerItems[0]!.item.layerItemId,
  }
}

function selection(
  project: CourseProjectDocument,
  locationId: string,
  selectionId: string | null,
  stateId: string | null | undefined = null,
): SlideEditorSelection {
  return selectSlideEditorLayer({ project, locationId, stateId, selectionId })
}

describe('Slide editor text move command', () => {
  it('freezes exact selection IDs while retaining location state and unfiltered layers', () => {
    const current = fixture()
    const followed = selectSlideEditorLayer({
      project: current.project,
      locationId: current.locationId,
      stateId: undefined,
      selectionId: 'hidden-global-text',
    })
    const base = selection(current.project, current.locationId, 'scene-text')
    const cleared = selection(current.project, current.locationId, null)

    expect(followed).toEqual({
      locationId: current.locationId,
      stateId: 'state_initial',
      selectionId: 'hidden-global-text',
    })
    expect(base).toEqual({
      locationId: current.locationId,
      stateId: null,
      selectionId: 'scene-text',
    })
    expect(cleared.selectionId).toBeNull()
    expect(Object.isFrozen(followed)).toBe(true)
    expect(() => selection(current.project, current.locationId, 'missing-layer')).toThrow(
      '找不到 Slide 编辑图层：missing-layer',
    )
  })

  it('moves base scene text with one revision and history entry without mutating inputs', () => {
    const current = fixture()
    const history = createCourseHistory(current.project)
    const selected = selection(current.project, current.locationId, 'scene-text')
    const beforeHistory = structuredClone(history)
    const beforeSelection = structuredClone(selected)
    const delta = { x: 5, y: -7 }
    const next = moveSelectedSlideText(history, selected, delta, NOW)

    expect(next).not.toBe(history)
    expect(next.present.revision).toBe(history.present.revision + 1)
    expect(next.past).toEqual([history.present])
    expect(next.future).toEqual([])
    expect(history).toEqual(beforeHistory)
    expect(selected).toEqual(beforeSelection)
    expect(delta).toEqual({ x: 5, y: -7 })

    const slide = next.present.surfaces.find((candidate) => candidate.id === current.surfaceId)
    if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
    const scene = slide.scenes.find((candidate) => candidate.id === current.sceneId)!
    const text = scene.layerItems.find((candidate) => candidate.layerItemId === 'scene-text')!
    expect(text.frame).toMatchObject({ x: 125, y: 113 })
    expect(scene.presentation!.states[0]!.layerItemOverrides['scene-text']).toMatchObject({
      frame: { x: 320, width: 555 },
    })

    const undone = undoCourseHistory(next)
    const redone = redoCourseHistory(undone)
    expect(selection(undone.present, current.locationId, selected.selectionId).selectionId)
      .toBe(selected.selectionId)
    expect(selection(redone.present, current.locationId, selected.selectionId).selectionId)
      .toBe(selected.selectionId)
  })

  it('moves named-state text by writing only a merged frame override', () => {
    const current = fixture()
    const history = createCourseHistory(current.project)
    const selected = selection(current.project, current.locationId, 'scene-text', 'state_initial')
    const next = moveSelectedSlideText(history, selected, { x: 10, y: -20 }, NOW)
    const slide = next.present.surfaces.find((candidate) => candidate.id === current.surfaceId)
    if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
    const scene = slide.scenes.find((candidate) => candidate.id === current.sceneId)!
    const text = scene.layerItems.find((candidate) => candidate.layerItemId === 'scene-text')!
    const override = scene.presentation!.states[0]!.layerItemOverrides['scene-text']!

    expect(text.frame).toMatchObject({ x: 120, y: 120 })
    expect(override).toEqual({
      label: '命名状态文字',
      visible: false,
      frame: { x: 330, y: 100, width: 555 },
    })
    expect(next.present.revision).toBe(history.present.revision + 1)
    expect(next.past).toEqual([history.present])
  })

  it('returns the same history for a zero delta', () => {
    const current = fixture()
    const history = createCourseHistory(current.project)
    const selected = selection(current.project, current.locationId, 'scene-text')

    expect(moveSelectedSlideText(history, selected, { x: 0, y: 0 }, NOW)).toBe(history)
  })

  it('rejects missing, stale, non-scene, locked and non-text selections', () => {
    const current = fixture()
    const history = createCourseHistory(current.project)
    const noSelection = selection(current.project, current.locationId, null)
    const controller = selection(current.project, current.locationId, current.controllerId)
    const surfaceText = selection(current.project, current.locationId, 'surface-text')
    const stale = Object.freeze({
      locationId: current.locationId,
      stateId: null,
      selectionId: 'stale-layer',
    }) as SlideEditorSelection
    expect(() => moveSelectedSlideText(history, noSelection, { x: 1, y: 0 }, NOW)).toThrow()
    expect(() => moveSelectedSlideText(history, stale, { x: 1, y: 0 }, NOW)).toThrow()
    expect(() => moveSelectedSlideText(history, controller, { x: 1, y: 0 }, NOW)).toThrow()
    expect(() => moveSelectedSlideText(history, surfaceText, { x: 1, y: 0 }, NOW)).toThrow()

    const locked = updateCourseProject(current.project, (draft) => {
      const slide = draft.surfaces.find((candidate) => candidate.id === current.surfaceId)
      if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
      slide.scenes[0]!.layerItems.find((item) => item.layerItemId === 'scene-text')!.locked = true
    }, NOW)
    expect(() => moveSelectedSlideText(
      createCourseHistory(locked), selection(locked, current.locationId, 'scene-text'), { x: 1, y: 0 }, NOW,
    )).toThrow('当前 Slide 文字已锁定')

    const withFormula = addNativeVisualLayer(current.project, {
      surfaceId: current.surfaceId,
      sceneId: current.sceneId,
      nativeType: 'formula',
      id: 'scene-formula',
      now: NOW,
    })
    expect(() => moveSelectedSlideText(
      createCourseHistory(withFormula), selection(withFormula, current.locationId, 'scene-formula'), { x: 1, y: 0 }, NOW,
    )).toThrow('当前选择不是可移动的 Slide 文字')
  })

  it('rejects non-finite deltas without changing history', () => {
    const current = fixture()
    const history = createCourseHistory(current.project)
    const selected = selection(current.project, current.locationId, 'scene-text')

    expect(() => moveSelectedSlideText(history, selected, { x: Number.NaN, y: 0 }, NOW)).toThrow(
      'Slide 文字移动距离必须是有限数字',
    )
    expect(() => moveSelectedSlideText(history, selected, { x: 0, y: Number.POSITIVE_INFINITY }, NOW)).toThrow(
      'Slide 文字移动距离必须是有限数字',
    )
    expect(history.past).toEqual([])
    expect(history.present).toBe(current.project)
  })
})
