import { beforeEach, describe, expect, it } from 'vitest'
import { createBlankSpatialCourseProject } from '@/renderer/project/createSpatialCourseProject'
import { resolveCourseSurfaceBackgroundColor } from '@/shared/courseProjectModel'
import { useEditorStore } from '@/renderer/store/editorStore'

/**
 * P5 CSS-first slice: Spatial editor projection defaults to white.
 * T1 may persist optional `backgroundColor`; absent and `#ffffff` both resolve to white.
 */
describe('Spatial canvas background default', () => {
  beforeEach(() => {
    useEditorStore.getState().createNewProject()
  })

  it('derives a white V8 scene background for a blank Spatial project', () => {
    const document = createBlankSpatialCourseProject({ now: '2026-08-18T14:00:00.000Z' })
    const spatial = document.surfaces.find((surface) => surface.type === 'spatial-2d')
    expect(spatial?.type).toBe('spatial-2d')
    expect(resolveCourseSurfaceBackgroundColor(
      spatial?.type === 'spatial-2d' ? spatial.backgroundColor : undefined,
    )).toBe('#ffffff')

    useEditorStore.getState().loadCourseProject(document, null)

    const state = useEditorStore.getState()
    expect(state.spatialSession).not.toBeNull()
    expect(state.project.scenes[0]!.backgroundColor).toBe('#ffffff')
  })
})
