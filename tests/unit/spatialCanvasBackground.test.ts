import { beforeEach, describe, expect, it } from 'vitest'
import { createBlankSpatialCourseProject } from '@/renderer/project/createSpatialCourseProject'
import { useEditorStore } from '@/renderer/store/editorStore'

/**
 * P5 CSS-first slice: Spatial editor projection defaults to white.
 * Does not prove a persisted V9 surface field (T1 has not landed backgroundColor).
 */
describe('Spatial canvas background default', () => {
  beforeEach(() => {
    useEditorStore.getState().createNewProject()
  })

  it('derives a white V8 scene background without a Spatial surface color field', () => {
    const document = createBlankSpatialCourseProject({ now: '2026-08-18T14:00:00.000Z' })
    const spatial = document.surfaces.find((surface) => surface.type === 'spatial-2d')
    expect(spatial).toBeDefined()
    expect(spatial).not.toHaveProperty('backgroundColor')

    useEditorStore.getState().loadCourseProject(document, null)

    const state = useEditorStore.getState()
    expect(state.spatialSession).not.toBeNull()
    expect(state.project.scenes[0]!.backgroundColor).toBe('#ffffff')
  })
})
