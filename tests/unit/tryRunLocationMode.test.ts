import { beforeEach, describe, expect, it } from 'vitest'
import {
  selectActiveCourseLocationId,
  selectActiveCourseProjectDocument,
  useEditorStore,
} from '@/renderer/store/editorStore'

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

describe('Mixed try-run location mode', () => {
  it('keeps canvasMode run when activating another surface location', () => {
    const store = useEditorStore.getState()
    store.addCourseContent('flow-page')
    store.addCourseContent('spatial-page')
    const project = selectActiveCourseProjectDocument(useEditorStore.getState())
    if (!project) throw new Error('expected course document')
    const slide = project.locations.find((location) => location.kind === 'slide-scene')
    const flow = project.locations.find((location) => location.kind === 'flow-block')
    const spatial = project.locations.find((location) => location.kind === 'spatial-camera')
    if (!slide || !flow || !spatial) throw new Error('expected mixed locations')

    useEditorStore.getState().activateCourseLocation(slide.id)
    expect(useEditorStore.getState().canvasMode).toBe('edit')

    useEditorStore.getState().setCanvasMode('run')
    expect(useEditorStore.getState().canvasMode).toBe('run')

    useEditorStore.getState().activateCourseLocation(flow.id)
    expect(useEditorStore.getState().canvasMode).toBe('run')
    expect(selectActiveCourseLocationId(useEditorStore.getState())).toBe(flow.id)

    useEditorStore.getState().activateCourseLocation(spatial.id)
    expect(useEditorStore.getState().canvasMode).toBe('run')
    expect(selectActiveCourseLocationId(useEditorStore.getState())).toBe(spatial.id)

    useEditorStore.getState().activateCourseLocation(slide.id)
    expect(useEditorStore.getState().canvasMode).toBe('run')
    expect(selectActiveCourseLocationId(useEditorStore.getState())).toBe(slide.id)

    useEditorStore.getState().setCanvasMode('edit')
    useEditorStore.getState().activateCourseLocation(flow.id)
    expect(useEditorStore.getState().canvasMode).toBe('edit')
  })

  it('does not drop try-run when clearing the presentation state', () => {
    useEditorStore.getState().setCanvasMode('run')
    useEditorStore.getState().setActivePresentationState(null)
    expect(useEditorStore.getState().canvasMode).toBe('run')
  })
})
