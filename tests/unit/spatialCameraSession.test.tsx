import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { zoomSpatialSessionCamera } from '@/renderer/course/spatialEditorCommands'
import {
  selectActiveCourseProjectDocument,
  useEditorStore,
} from '@/renderer/store/editorStore'
import { mountSpatialLocationTryRun } from '@/renderer/ui/spatialLocationTryRun'

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

afterEach(() => {
  useEditorStore.getState().createNewProject()
  document.body.replaceChildren()
})

describe('Spatial camera session and try-run host', () => {
  it('changes sessionCamera without writing revision', () => {
    useEditorStore.getState().createNewSpatialProject()
    const before = selectActiveCourseProjectDocument(useEditorStore.getState())
    expect(before).toBeTruthy()
    const revision = before!.revision
    const zoomed = useEditorStore.getState().runSpatialCommand((session) => (
      zoomSpatialSessionCamera(session, 1.6)
    ))
    expect(zoomed.ok).toBe(true)
    expect(zoomed.historyEntry).toBe(false)
    expect(useEditorStore.getState().spatialSession?.sessionCamera.zoom).toBe(1.6)
    expect(selectActiveCourseProjectDocument(useEditorStore.getState())?.revision).toBe(revision)
  })

  it('mounts SpatialSurfaceHost for location try-run and resumes without editor sessionCamera', async () => {
    useEditorStore.getState().createNewSpatialProject()
    useEditorStore.getState().runSpatialCommand((session) => zoomSpatialSessionCamera(session, 2.4))
    expect(useEditorStore.getState().spatialSession?.sessionCamera.zoom).toBe(2.4)

    const container = document.createElement('div')
    container.style.width = '640px'
    container.style.height = '360px'
    document.body.append(container)
    const session = useEditorStore.getState().spatialSession
    expect(session).toBeTruthy()
    const host = await mountSpatialLocationTryRun({
      container,
      project: session!.history.present,
      locationId: session!.selection.locationId,
      width: 640,
      height: 360,
    })
    expect(host.rootElement?.classList.contains('spatial-surface')).toBe(true)
    expect(host.rootElement?.dataset.worldBoundsMode).toBe('infinite')
    expect(host.camera?.zoom).toBe(session!.history.present.surfaces.find((surface) => (
      surface.type === 'spatial-2d'
    ))?.camera.home.zoom)
    expect(host.camera?.zoom).not.toBe(2.4)

    await host.suspend()
    expect(host.camera).toBeNull()
    await host.resume()
    expect(host.camera?.zoom).toBe(session!.history.present.surfaces.find((surface) => (
      surface.type === 'spatial-2d'
    ))?.camera.home.zoom)
    expect(host.camera?.zoom).not.toBe(2.4)
    await host.destroy()
  })
})
