import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addSpatialCameraFrameFromSession,
  reorderSpatialCameraFramesInSession,
} from '@/renderer/course/spatialCameraCommands'
import { buildCourseTreeView } from '@/renderer/course/courseTreeView'
import {
  selectActiveCourseProjectDocument,
  useEditorStore,
} from '@/renderer/store/editorStore'
import { planCourseTreeReorder, ScenePanel } from '@/renderer/ui/ScenePanel'

function courseDocument() {
  const document = selectActiveCourseProjectDocument(useEditorStore.getState())
  if (!document) throw new Error('expected course document')
  return document
}

function slideSurfaceId() {
  const surface = courseDocument().surfaces.find((candidate) => candidate.type === 'slide')
  if (!surface) throw new Error('expected slide surface')
  return surface.id
}

function firstSlideLocationId() {
  const location = courseDocument().locations.find((candidate) => candidate.kind === 'slide-scene')
  if (!location) throw new Error('expected slide location')
  return location.id
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

afterEach(() => {
  cleanup()
  useEditorStore.getState().createNewProject()
})

describe('ScenePanel course tree reorder', () => {
  it('keeps existing tree testids, page/scene/camera grips, and leaves flow headings unsortable', () => {
    const store = useEditorStore.getState()
    store.addCourseContent('flow-page')
    store.addCourseContent('spatial-page')
    store.runSpatialCommand((session) => addSpatialCameraFrameFromSession(session, { name: '远景' }))
    store.activateCourseLocation(firstSlideLocationId())
    store.addCourseContent('scene', { surfaceId: slideSurfaceId() })

    render(<ScenePanel />)
    expect(screen.getByTestId('course-page-tree')).toBeTruthy()
    expect(screen.getByTestId('add-content-primary')).toBeTruthy()
    expect(screen.getByTestId('global-layer-entry')).toBeTruthy()
    expect(screen.getByText('本页镜头')).toBeTruthy()

    const document = courseDocument()
    const tree = buildCourseTreeView(document)
    for (const page of tree.pages) {
      expect(screen.getByTestId(`course-page-node-${page.id}`)).toBeTruthy()
      expect(screen.getByLabelText(`拖动“${page.label}”`)).toBeTruthy()
      if (page.kind === 'slide-page') {
        for (const scene of page.children) {
          expect(screen.getByTestId(`scene-item-${scene.id}`)).toBeTruthy()
          expect(screen.getByLabelText(`拖动“${scene.label}”`)).toBeTruthy()
        }
      }
      if (page.kind === 'flow-page') {
        expect(screen.getByTestId(`flow-page-${page.surfaceId}`)).toBeTruthy()
        for (const heading of page.children) {
          expect(screen.getByTestId(`flow-heading-${heading.locationId}`)).toBeTruthy()
          expect(screen.queryByLabelText(`拖动“${heading.label}”`)).toBeNull()
        }
      }
      if (page.kind === 'spatial-page') {
        const cameras = page.children.flatMap((group) => group.children)
        for (const camera of cameras) {
          expect(screen.getByTestId(`spatial-camera-${camera.id}`)).toBeTruthy()
          expect(screen.getByLabelText(`拖动“${camera.label}”`)).toBeTruthy()
        }
      }
    }

    const heading = tree.pages.find((page) => page.kind === 'flow-page')?.children[0]
    expect(heading).toBeTruthy()
    expect(planCourseTreeReorder(
      document,
      tree.pages,
      heading!.id,
      tree.pages[0]!.id,
    )).toBeNull()
  })

  it('rejects cross-parent drops and writes same-parent page/scene reorder into V9 history that undo restores', () => {
    const store = useEditorStore.getState()
    store.addCourseContent('flow-page')
    store.addCourseContent('spatial-page')
    store.activateCourseLocation(firstSlideLocationId())
    store.addCourseContent('scene', { surfaceId: slideSurfaceId() })

    const before = courseDocument()
    const tree = buildCourseTreeView(before)
    const slidePage = tree.pages.find((page) => page.kind === 'slide-page')
    const flowPage = tree.pages.find((page) => page.kind === 'flow-page')
    expect(slidePage?.children.length).toBeGreaterThan(1)
    expect(flowPage).toBeTruthy()

    expect(planCourseTreeReorder(
      before,
      tree.pages,
      slidePage!.children[0]!.id,
      flowPage!.id,
    )).toBeNull()

    const surfacePlan = planCourseTreeReorder(
      before,
      tree.pages,
      tree.pages[0]!.id,
      tree.pages[tree.pages.length - 1]!.id,
    )
    expect(surfacePlan?.kind).toBe('surfaces')
    if (surfacePlan?.kind !== 'surfaces') throw new Error('expected surface plan')
    const surfaceOrderBefore = before.surfaces.map((surface) => surface.id)
    store.reorderCourseSurfaces(surfacePlan.surfaceIds)
    expect(courseDocument().surfaces.map((surface) => surface.id)).toEqual(surfacePlan.surfaceIds)
    expect(courseDocument().revision).toBe(before.revision + 1)
    store.undo()
    expect(courseDocument().surfaces.map((surface) => surface.id)).toEqual(surfaceOrderBefore)

    const afterUndo = courseDocument()
    const sceneTree = buildCourseTreeView(afterUndo)
    const scenes = sceneTree.pages.find((page) => page.kind === 'slide-page')?.children ?? []
    const scenePlan = planCourseTreeReorder(
      afterUndo,
      sceneTree.pages,
      scenes[0]!.id,
      scenes[1]!.id,
    )
    expect(scenePlan?.kind).toBe('scenes')
    if (scenePlan?.kind !== 'scenes') throw new Error('expected scene plan')
    const slide = afterUndo.surfaces.find((surface) => surface.type === 'slide')
    if (!slide || slide.type !== 'slide') throw new Error('expected slide surface')
    expect(scenePlan.sceneIds).toHaveLength(slide.scenes.length)
    expect(new Set(scenePlan.sceneIds)).toEqual(new Set(slide.scenes.map((scene) => scene.id)))
    store.reorderScenes(scenePlan.sceneIds)
    const reorderedSlide = courseDocument().surfaces.find((surface) => surface.type === 'slide')
    if (!reorderedSlide || reorderedSlide.type !== 'slide') throw new Error('expected slide surface')
    expect(reorderedSlide.scenes.map((scene) => scene.id)).toEqual(scenePlan.sceneIds)
    store.undo()
    const restoredSlide = courseDocument().surfaces.find((surface) => surface.type === 'slide')
    if (!restoredSlide || restoredSlide.type !== 'slide') throw new Error('expected slide surface')
    expect(restoredSlide.scenes.map((scene) => scene.id)).toEqual(slide.scenes.map((scene) => scene.id))
  })

  it('deletes a same-page slide scene from the danger button after confirm, and disables the last remaining scene', () => {
    const store = useEditorStore.getState()
    store.addCourseContent('scene', { surfaceId: slideSurfaceId() })
    render(<ScenePanel />)

    const dangerButtons = screen.getAllByRole('button', { name: /删除“/ })
    expect(dangerButtons).toHaveLength(2)
    expect(dangerButtons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true)

    fireEvent.click(dangerButtons[1]!)
    fireEvent.click(screen.getByRole('button', { name: '删除场景' }))

    const slide = courseDocument().surfaces.find((surface) => surface.type === 'slide')
    if (!slide || slide.type !== 'slide') throw new Error('expected slide surface')
    expect(slide.scenes).toHaveLength(1)

    const remaining = screen.getByRole('button', { name: /删除“/ })
    expect((remaining as HTMLButtonElement).disabled).toBe(true)
    expect(remaining.getAttribute('title')).toBe('至少保留一个场景')
  })

  it('maps same-group camera drops onto the existing spatial reorder command and keeps label clicks activating', () => {
    const store = useEditorStore.getState()
    store.createNewSpatialProject()
    store.runSpatialCommand((session) => addSpatialCameraFrameFromSession(session, { name: '远景' }))
    const document = courseDocument()
    const tree = buildCourseTreeView(document)
    const cameras = tree.pages[0]?.children[0]?.children ?? []
    expect(cameras.length).toBeGreaterThan(1)
    const plan = planCourseTreeReorder(document, tree.pages, cameras[1]!.id, cameras[0]!.id)
    expect(plan?.kind).toBe('cameras')
    if (plan?.kind !== 'cameras') throw new Error('expected camera plan')
    expect(plan.toIndex).toBe(0)

    const revisionBefore = document.revision
    store.runSpatialCommand((session) =>
      reorderSpatialCameraFramesInSession(session, plan.frameId, plan.toIndex),
    )
    const reordered = courseDocument()
    const spatial = reordered.surfaces.find((surface) => surface.type === 'spatial-2d')
    if (!spatial || spatial.type !== 'spatial-2d') throw new Error('expected spatial surface')
    expect(spatial.camera.frames[0]?.id).toBe(plan.frameId)
    expect(reordered.revision).toBeGreaterThan(revisionBefore)
    store.undo()
    expect(courseDocument().revision).toBe(revisionBefore)

    render(<ScenePanel />)
    fireEvent.click(screen.getByTestId(`spatial-camera-${cameras[1]!.id}`))
    expect(useEditorStore.getState().spatialSession?.selection.locationId).toBe(cameras[1]!.locationId)
  })
})
