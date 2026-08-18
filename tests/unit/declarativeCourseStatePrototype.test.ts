import { describe, expect, it } from 'vitest'
import {
  FORCED_PROTOTYPE_NAVIGATION_ORIGINS,
  GUARDED_PROTOTYPE_NAVIGATION_ORIGINS,
  applyPrototypeCourseStateAction,
  evaluatePrototypeCourseStateCondition,
  initializePrototypeCourseState,
  resolvePrototypeNavigation,
  restartPrototypeCourseState,
  type PrototypeCourseStateDeclaration,
  type PrototypeNavigationGuard,
} from '../prototypes/declarativeCourseStatePrototype'

const declarations = [
  { key: 'attempts', type: 'number', defaultValue: 0 },
  { key: 'checkpointPassed', type: 'boolean', defaultValue: false },
] as const satisfies readonly PrototypeCourseStateDeclaration[]

describe('声明式 courseState 评审原型', () => {
  it('原子递增尝试次数，普通过程保留，restart 恢复默认值', () => {
    const initial = initializePrototypeCourseState(declarations)
    const afterFirst = applyPrototypeCourseStateAction(initial, declarations, {
      type: 'course-state.increment', key: 'attempts', by: 1,
    })
    const afterSecond = applyPrototypeCourseStateAction(afterFirst, declarations, {
      type: 'course-state.increment', key: 'attempts', by: 1,
    })
    const enoughAttempts = {
      type: 'course-state.compare', key: 'attempts', operator: 'gte', value: 2,
    } as const

    expect(initial).toEqual({ attempts: 0, checkpointPassed: false })
    expect(evaluatePrototypeCourseStateCondition(afterFirst, declarations, enoughAttempts))
      .toBe(false)
    expect(evaluatePrototypeCourseStateCondition(afterSecond, declarations, enoughAttempts))
      .toBe(true)
    expect(restartPrototypeCourseState(declarations)).toEqual(initial)
  })

  it('所有普通跨场景入口使用同一守卫，强制路径按 RFC 明确豁免', () => {
    const state = initializePrototypeCourseState(declarations)
    const guard: PrototypeNavigationGuard = {
      id: 'guard_checkpoint',
      toSceneIds: ['scene_summary'],
      conditions: [{
        type: 'course-state.compare',
        key: 'checkpointPassed',
        operator: 'eq',
        value: true,
      }],
      reason: '请先完成本页检查点',
    }
    for (const origin of GUARDED_PROTOTYPE_NAVIGATION_ORIGINS) {
      expect(resolvePrototypeNavigation({
        origin,
        fromSceneId: 'scene_task',
        toSceneId: 'scene_summary',
        state,
        declarations,
        guards: [guard],
      })).toEqual({
        accepted: false,
        guardId: 'guard_checkpoint',
        reason: '请先完成本页检查点',
      })
    }
    for (const origin of FORCED_PROTOTYPE_NAVIGATION_ORIGINS) {
      expect(resolvePrototypeNavigation({
        origin,
        fromSceneId: 'scene_task',
        toSceneId: 'scene_summary',
        state,
        declarations,
        guards: [guard],
      })).toEqual({ accepted: true })
    }

    const passed = applyPrototypeCourseStateAction(state, declarations, {
      type: 'course-state.set', key: 'checkpointPassed', value: true,
    })
    expect(resolvePrototypeNavigation({
      origin: 'teacher-controller',
      fromSceneId: 'scene_task',
      toSceneId: 'scene_summary',
      state: passed,
      declarations,
      guards: [guard],
    })).toEqual({ accepted: true })
  })

  it('authoring/capture 冻结写入，严格拒绝未知 key、隐式转换与非有限数', () => {
    const initial = initializePrototypeCourseState(declarations)
    const action = {
      type: 'course-state.increment', key: 'attempts', by: 1,
    } as const
    expect(applyPrototypeCourseStateAction(initial, declarations, action, 'authoring'))
      .toEqual(initial)
    expect(applyPrototypeCourseStateAction(initial, declarations, action, 'capture'))
      .toEqual(initial)
    expect(() => applyPrototypeCourseStateAction(initial, declarations, {
      type: 'course-state.set', key: 'attempts', value: '1',
    })).toThrow('赋值类型不匹配')
    expect(() => applyPrototypeCourseStateAction(initial, declarations, {
      type: 'course-state.increment', key: 'unknown', by: 1,
    })).toThrow('未声明')
    expect(() => applyPrototypeCourseStateAction(initial, declarations, {
      type: 'course-state.increment', key: 'attempts', by: Number.POSITIVE_INFINITY,
    })).toThrow('必须是有限数')
  })
})
