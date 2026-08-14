import type { InteractionRule } from '../../shared/interactionTypes'
import type {
  CourseNavigationGuard,
  CourseProjectDocument,
  CourseStateDeclaration,
  CourseStateScalar,
} from '../../shared/courseProjectTypes'
import { updateCourseProject } from './courseStudioModel'

function defaultValue(valueType: CourseStateDeclaration['valueType']): CourseStateScalar {
  if (valueType === 'boolean') return false
  if (valueType === 'number') return 0
  if (valueType === 'string') return ''
  return null
}

function declarationWithType(
  key: string,
  valueType: CourseStateDeclaration['valueType'],
  value: CourseStateScalar = defaultValue(valueType),
): CourseStateDeclaration {
  if (valueType === 'boolean') {
    return { key, valueType, defaultValue: typeof value === 'boolean' ? value : false }
  }
  if (valueType === 'number') {
    return { key, valueType, defaultValue: typeof value === 'number' && Number.isFinite(value) ? value : 0 }
  }
  if (valueType === 'string') {
    return { key, valueType, defaultValue: typeof value === 'string' ? value : '' }
  }
  return { key, valueType, defaultValue: null }
}

function normalizeGuardConditionsForDeclaration(
  guard: CourseNavigationGuard,
  previousKey: string,
  declaration: CourseStateDeclaration,
): void {
  guard.conditions = guard.conditions.map((condition) => {
    if (condition.key !== previousKey) return condition
    if (condition.type === 'exists') return { ...condition, key: declaration.key }
    const operator = declaration.valueType === 'number' || condition.operator === 'eq' || condition.operator === 'neq'
      ? condition.operator
      : 'eq'
    return {
      type: 'compare',
      key: declaration.key,
      operator,
      value: declaration.defaultValue,
    }
  })
}

/** Adds one stable course variable as one validated V9 history transaction. */
export function addCourseStateDeclaration(
  project: CourseProjectDocument,
  declaration: CourseStateDeclaration,
  now?: string,
): CourseProjectDocument {
  return updateCourseProject(project, (draft) => {
    const key = declaration.key.trim()
    if (!key) throw new Error('变量名称不能为空。')
    if (draft.courseState.some((candidate) => candidate.key === key)) {
      throw new Error(`变量“${key}”已经存在。`)
    }
    draft.courseState.push(declarationWithType(key, declaration.valueType, declaration.defaultValue))
  }, now)
}

/** Renames or changes one declaration and keeps every guard reference valid. */
export function updateCourseStateDeclaration(
  project: CourseProjectDocument,
  previousKey: string,
  declaration: CourseStateDeclaration,
  now?: string,
): CourseProjectDocument {
  return updateCourseProject(project, (draft) => {
    const index = draft.courseState.findIndex((candidate) => candidate.key === previousKey)
    if (index < 0) throw new Error('要修改的课程变量已不存在。')
    const key = declaration.key.trim()
    if (!key) throw new Error('变量名称不能为空。')
    if (draft.courseState.some((candidate, candidateIndex) => candidateIndex !== index && candidate.key === key)) {
      throw new Error(`变量“${key}”已经存在。`)
    }
    const normalized = declarationWithType(key, declaration.valueType, declaration.defaultValue)
    draft.courseState[index] = normalized
    draft.navigationGuards.forEach((guard) => {
      normalizeGuardConditionsForDeclaration(guard, previousKey, normalized)
    })
  }, now)
}

/** Removes a variable and any now-invalid guard conditions; empty guards go too. */
export function deleteCourseStateDeclaration(
  project: CourseProjectDocument,
  key: string,
  now?: string,
): CourseProjectDocument {
  return updateCourseProject(project, (draft) => {
    draft.courseState = draft.courseState.filter((candidate) => candidate.key !== key)
    draft.navigationGuards = draft.navigationGuards.flatMap((guard) => {
      const conditions = guard.conditions.filter((condition) => condition.key !== key)
      return conditions.length > 0 ? [{ ...guard, conditions }] : []
    })
  }, now)
}

export function replaceCourseNavigationGuards(
  project: CourseProjectDocument,
  guards: readonly CourseNavigationGuard[],
  now?: string,
): CourseProjectDocument {
  return updateCourseProject(project, (draft) => {
    draft.navigationGuards = structuredClone([...guards])
  }, now)
}

export function replaceCourseGlobalInteractions(
  project: CourseProjectDocument,
  rules: readonly InteractionRule[],
  now?: string,
): CourseProjectDocument {
  return updateCourseProject(project, (draft) => {
    draft.globalInteractions = structuredClone([...rules])
  }, now)
}
