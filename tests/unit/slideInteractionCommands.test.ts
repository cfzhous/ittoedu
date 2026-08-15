import { describe, expect, it } from 'vitest'
import type { InteractionRule } from '@/shared/interactionTypes'
import {
  createCourseProject,
  createCourseHistory,
  type CourseHistoryState,
} from '@/renderer/course/courseStudioModel'
import {
  addSlideInteractionRule,
  deleteSlideInteractionRule,
  duplicateSlideInteractionRule,
  moveSlideInteractionRule,
  type SlideInteractionTarget,
  updateSlideInteractionRule,
} from '@/renderer/course/slideInteractionCommands'

function fixture(): {
  target: SlideInteractionTarget
  history: CourseHistoryState
  sceneRulesOf(project: CourseHistoryState['present']): InteractionRule[]
} {
  const project = createCourseProject({ title: '互动命令测试' })
  const location = project.locations.find((candidate) => candidate.id === project.startLocationId)
  if (!location || location.kind !== 'slide-scene') throw new Error('expected Slide location')
  const target: SlideInteractionTarget = { locationId: location.id, scope: 'scene' }
  const sceneRulesOf = (current: CourseHistoryState['present']): InteractionRule[] => {
    const currentLocation = current.locations.find(
      (candidate) => candidate.id === target.locationId,
    )
    if (!currentLocation || currentLocation.kind !== 'slide-scene') {
      throw new Error('expected Slide location')
    }
    const surface = current.surfaces.find(
      (candidate) => candidate.id === currentLocation.surfaceId,
    )
    if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
    const scene = surface.scenes.find((candidate) => candidate.id === currentLocation.sceneId)
    return scene?.interactions ?? []
  }
  return { target, history: createCourseHistory(project), sceneRulesOf }
}

function rule(id = 'rule_1', actionId = 'action_1'): InteractionRule {
  return {
    id,
    name: '进入场景',
    enabled: true,
    trigger: { type: 'scene.enter' },
    conditions: [],
    actions: [{
      id: actionId,
      start: 'after-previous',
      delayMs: 0,
      action: { type: 'scene.next' },
    }],
  }
}

describe('Slide interaction commands', () => {
  it('adds a scene rule with exactly one history entry and validates the rule', () => {
    const { target, history, sceneRulesOf } = fixture()
    const added = addSlideInteractionRule(history, target, rule())
    expect(added.present.revision).toBe(history.present.revision + 1)
    expect(added.past).toEqual([history.present])
    expect(added.future).toEqual([])
    expect(sceneRulesOf(added.present)).toHaveLength(1)
    expect(sceneRulesOf(added.present)[0]).toMatchObject({ id: 'rule_1', name: '进入场景' })
  })

  it('adds a global rule when the scope is global', () => {
    const { history } = fixture()
    const target: SlideInteractionTarget = {
      locationId: history.present.startLocationId,
      scope: 'global',
    }
    const added = addSlideInteractionRule(history, target, rule('g_rule'))
    expect(added.present.globalInteractions).toHaveLength(1)
    expect(added.present.globalInteractions[0]).toMatchObject({ id: 'g_rule' })
  })

  it('rejects duplicate ids and invalid rules without touching history', () => {
    const { target, history } = fixture()
    const added = addSlideInteractionRule(history, target, rule())
    expect(() => addSlideInteractionRule(added, target, rule())).toThrow(/已存在/)
    expect(() => addSlideInteractionRule(history, target, {
      ...rule(),
      actions: [{ ...rule().actions[0]!, delayMs: -1 }],
    })).toThrow()
    expect(history.present.revision).toBe(0)
  })

  it('updates one rule with one history entry and treats no-op patches as no-ops', () => {
    const { target, history, sceneRulesOf } = fixture()
    const added = addSlideInteractionRule(history, target, rule())
    const updated = updateSlideInteractionRule(added, target, 'rule_1', {
      enabled: false,
    })
    expect(updated.present.revision).toBe(added.present.revision + 1)
    expect(sceneRulesOf(updated.present)[0]).toMatchObject({ id: 'rule_1', enabled: false })
    const same = updateSlideInteractionRule(updated, target, 'rule_1', {
      enabled: false,
    })
    expect(same).toBe(updated)
  })

  it('deletes, duplicates and moves rules with one history entry each', () => {
    const { target, history, sceneRulesOf } = fixture()
    let current = addSlideInteractionRule(history, target, rule('a'))
    current = addSlideInteractionRule(current, target, rule('b', 'action_b'))
    const duplicated = duplicateSlideInteractionRule(current, target, 'a')
    expect(duplicated.present.revision).toBe(current.present.revision + 1)
    expect(sceneRulesOf(duplicated.present)).toHaveLength(3)
    const moved = moveSlideInteractionRule(duplicated, target, 'a', 1)
    expect(moved.present.revision).toBe(duplicated.present.revision + 1)
    const boundary = moveSlideInteractionRule(moved, target, 'b', 1)
    expect(boundary).toBe(moved)
    const deleted = deleteSlideInteractionRule(moved, target, 'a')
    expect(deleted.present.revision).toBe(moved.present.revision + 1)
    expect(sceneRulesOf(deleted.present)).toHaveLength(2)
  })

  it('throws readable errors for missing rules and keeps history stable', () => {
    const { target, history } = fixture()
    expect(() => updateSlideInteractionRule(history, target, 'missing', { enabled: false }))
      .toThrow(/找不到/)
    expect(() => deleteSlideInteractionRule(history, target, 'missing')).toThrow(/找不到/)
    expect(() => moveSlideInteractionRule(history, target, 'missing', 1)).toThrow(/找不到/)
  })

  it('keeps the rule id immutable across updates', () => {
    const { target, history, sceneRulesOf } = fixture()
    const added = addSlideInteractionRule(history, target, rule())
    const updated = updateSlideInteractionRule(added, target, 'rule_1', {
      name: '改名后的规则',
      id: 'other',
    } as unknown as Partial<Omit<InteractionRule, 'id'>>)
    expect(sceneRulesOf(updated.present)[0]!.id).toBe('rule_1')
    expect(sceneRulesOf(updated.present)[0]!.name).toBe('改名后的规则')
  })

  it('rejects a scene target whose location is missing', () => {
    const { history } = fixture()
    expect(() => addSlideInteractionRule(history, {
      locationId: 'not-a-location',
      scope: 'scene',
    }, rule())).toThrow(/失效/)
  })
})
