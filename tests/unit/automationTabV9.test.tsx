import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AutomationTab } from '@/renderer/ui/AutomationTab'
import { useEditorStore } from '@/renderer/store/editorStore'

afterEach(() => {
  cleanup()
  useEditorStore.getState().createNewProject()
})

describe('AutomationTab with the V9 backend', () => {
  it('writes interaction rules to the V9 session, never the legacy V8 store', () => {
    useEditorStore.getState().activateV9SlideFixture()
    const v8ProjectBefore = structuredClone(useEditorStore.getState().project)
    const sessionBefore = useEditorStore.getState().courseSession
    if (sessionBefore === null) throw new Error('expected V9 session')
    const revisionBefore = sessionBefore.history.present.revision

    render(<AutomationTab />)
    fireEvent.click(screen.getByRole('button', { name: '使用模板' }))

    const sessionAfter = useEditorStore.getState().courseSession
    if (sessionAfter === null) throw new Error('expected V9 session')
    const rules = v9SceneRulesOf(sessionAfter)
    expect(rules.some((rule) => rule.trigger.type === 'scene.enter')).toBe(true)
    expect(sessionAfter.history.present.revision).toBeGreaterThan(revisionBefore)
    expect(sessionAfter.history.future).toEqual([])
    expect(useEditorStore.getState().project).toEqual(v8ProjectBefore)
  })
})

function v9SceneRulesOf(session: NonNullable<ReturnType<typeof useEditorStore.getState>['courseSession']>) {
  const location = session.history.present.locations.find(
    (candidate) => candidate.id === session.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') return []
  const surface = session.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') return []
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  return scene?.interactions ?? []
}
