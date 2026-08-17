import { nanoid } from 'nanoid'
import {
  MAX_INTERACTION_ACTIONS,
  MAX_INTERACTION_CONDITIONS,
  MAX_SCENE_INTERACTIONS,
  type InteractionRule,
} from '../../shared/interactionTypes'
import { interactionRuleSchema } from '../../shared/interactionSchema'
import type {
  CourseProjectDocument,
  LayerItem,
} from '../../shared/courseProjectTypes'
import {
  commitCourseHistory,
  type CourseHistoryState,
  updateCourseProject,
} from './courseStudioModel'

/** Interaction rules live on the scene (scene scope) or the project (global scope). */
export type SlideInteractionScope = 'scene' | 'global'

export interface SlideInteractionTarget {
  readonly locationId: string
  readonly scope: SlideInteractionScope
}

export const LOCKED_INTERACTION_WRITE_REASON =
  '锁定元素不能新增、修改或删除相关互动规则；请先解锁'

export function interactionRuleNodeIds(rule: InteractionRule): string[] {
  const ids: string[] = []
  if ('nodeId' in rule.trigger) ids.push(rule.trigger.nodeId)
  for (const step of rule.actions) {
    if ('nodeId' in step.action) ids.push(step.action.nodeId)
  }
  return ids
}

function lockedLayerItemIds(project: CourseProjectDocument): ReadonlySet<string> {
  const ids = new Set<string>()
  const visit = (item: LayerItem): void => {
    if (item.locked) ids.add(item.layerItemId)
  }
  for (const entry of project.globalLayerItems) visit(entry.item)
  for (const surface of project.surfaces) {
    for (const entry of surface.surfaceLayerItems) visit(entry.item)
    if (surface.type === 'slide') {
      for (const scene of surface.scenes) {
        for (const item of scene.layerItems) visit(item)
      }
    } else if (surface.type === 'spatial-2d') {
      for (const item of surface.world.layerItems) visit(item)
    }
  }
  return ids
}

function assertRuleTargetsUnlocked(
  project: CourseProjectDocument,
  rule: InteractionRule,
): void {
  const locked = lockedLayerItemIds(project)
  if (interactionRuleNodeIds(rule).some((id) => locked.has(id))) {
    throw new Error(LOCKED_INTERACTION_WRITE_REASON)
  }
}

function locateSceneInteractions(
  project: CourseProjectDocument,
  locationId: string,
): InteractionRule[] {
  const location = project.locations.find((candidate) => candidate.id === locationId)
  if (!location || location.kind !== 'slide-scene') {
    throw new Error('当前幻灯片位置已失效')
  }
  const surface = project.surfaces.find((candidate) => candidate.id === location.surfaceId)
  if (!surface || surface.type !== 'slide') {
    throw new Error('当前幻灯片已失效')
  }
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  if (!scene) throw new Error('当前幻灯片已失效')
  return scene.interactions
}

function locateRule(
  project: CourseProjectDocument,
  target: SlideInteractionTarget,
  ruleId: string,
): InteractionRule | undefined {
  const rules = target.scope === 'global'
    ? project.globalInteractions
    : locateSceneInteractions(project, target.locationId)
  return rules.find((rule) => rule.id === ruleId)
}

function validateRule(rule: InteractionRule): void {
  const parsed = interactionRuleSchema.safeParse(rule)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? '规则数据无效')
  }
  if (parsed.data.conditions.length > MAX_INTERACTION_CONDITIONS) {
    throw new Error(`单条规则最多 ${MAX_INTERACTION_CONDITIONS} 个条件`)
  }
  if (parsed.data.actions.length > MAX_INTERACTION_ACTIONS) {
    throw new Error(`单条规则最多 ${MAX_INTERACTION_ACTIONS} 个动作`)
  }
}

function emptyRuleScopeMessage(scope: SlideInteractionScope): string {
  return scope === 'global'
    ? '找不到全局互动规则，请刷新后重试'
    : '找不到当前幻灯片的互动规则，请刷新后重试'
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
  }
  if (
    left === null || right === null ||
    typeof left !== 'object' || typeof right !== 'object'
  ) return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  return leftKeys.length === Object.keys(rightRecord).length &&
    leftKeys.every((key) => (
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      valuesEqual(leftRecord[key], rightRecord[key])
    ))
}

/**
 * Adds one interaction rule to the scene or global scope. Exactly one Project
 * revision and one history entry are created per invocation.
 */
export function addSlideInteractionRule(
  history: CourseHistoryState,
  target: SlideInteractionTarget,
  rule: InteractionRule,
  now?: string,
): CourseHistoryState {
  const id = rule.id.trim()
  if (!id) throw new Error('规则 ID 不能为空')
  const project = history.present
  const currentRules = target.scope === 'global'
    ? project.globalInteractions
    : locateSceneInteractions(project, target.locationId)
  if (currentRules.some((candidate) => candidate.id === id)) {
    throw new Error('规则 ID 已存在，请重新生成后重试')
  }
  if (currentRules.length >= MAX_SCENE_INTERACTIONS) {
    throw new Error(`当前范围最多 ${MAX_SCENE_INTERACTIONS} 条规则`)
  }
  validateRule({ ...rule, id })
  assertRuleTargetsUnlocked(project, { ...rule, id })
  const next = updateCourseProject(project, (draft) => {
    const rules = target.scope === 'global'
      ? draft.globalInteractions
      : locateSceneInteractions(draft, target.locationId)
    rules.push({ ...structuredClone(rule), id })
  }, now)
  return commitCourseHistory(history, next)
}

/**
 * Applies one patch to an existing rule. `ruleId` is immutable; the merged
 * result is validated before one history entry is committed.
 */
export function updateSlideInteractionRule(
  history: CourseHistoryState,
  target: SlideInteractionTarget,
  ruleId: string,
  patch: Partial<Omit<InteractionRule, 'id'>>,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const current = locateRule(project, target, ruleId)
  if (!current) throw new Error(emptyRuleScopeMessage(target.scope))
  const nextRule = { ...current, ...structuredClone(patch), id: ruleId }
  validateRule(nextRule)
  assertRuleTargetsUnlocked(project, current)
  assertRuleTargetsUnlocked(project, nextRule)
  const changed = (Object.keys(patch) as Array<keyof Omit<InteractionRule, 'id'>>)
    .some((key) => !valuesEqual(current[key], nextRule[key]))
  if (!changed) return history
  const next = updateCourseProject(project, (draft) => {
    const rules = target.scope === 'global'
      ? draft.globalInteractions
      : locateSceneInteractions(draft, target.locationId)
    const index = rules.findIndex((candidate) => candidate.id === ruleId)
    if (index < 0) throw new Error(emptyRuleScopeMessage(target.scope))
    rules[index] = nextRule
  }, now)
  return commitCourseHistory(history, next)
}

export function deleteSlideInteractionRule(
  history: CourseHistoryState,
  target: SlideInteractionTarget,
  ruleId: string,
  now?: string,
): CourseHistoryState {
  const current = locateRule(history.present, target, ruleId)
  if (!current) {
    throw new Error(emptyRuleScopeMessage(target.scope))
  }
  assertRuleTargetsUnlocked(history.present, current)
  const next = updateCourseProject(history.present, (draft) => {
    const rules = target.scope === 'global'
      ? draft.globalInteractions
      : locateSceneInteractions(draft, target.locationId)
    const index = rules.findIndex((candidate) => candidate.id === ruleId)
    if (index >= 0) rules.splice(index, 1)
  }, now)
  return commitCourseHistory(history, next)
}

export function duplicateSlideInteractionRule(
  history: CourseHistoryState,
  target: SlideInteractionTarget,
  ruleId: string,
  now?: string,
): CourseHistoryState {
  const current = locateRule(history.present, target, ruleId)
  if (!current) throw new Error(emptyRuleScopeMessage(target.scope))
  assertRuleTargetsUnlocked(history.present, current)
  const next = updateCourseProject(history.present, (draft) => {
    const rules = target.scope === 'global'
      ? draft.globalInteractions
      : locateSceneInteractions(draft, target.locationId)
    const index = rules.findIndex((candidate) => candidate.id === ruleId)
    if (index < 0) throw new Error(emptyRuleScopeMessage(target.scope))
    const copy = structuredClone(current) as InteractionRule
    copy.id = `interaction_${nanoid()}`
    copy.name = current.name ? `${current.name} 副本` : undefined
    copy.actions = copy.actions.map((step) => ({
      ...step,
      id: `action_${nanoid()}`,
    }))
    rules.splice(index + 1, 0, copy)
  }, now)
  return commitCourseHistory(history, next)
}

export function moveSlideInteractionRule(
  history: CourseHistoryState,
  target: SlideInteractionTarget,
  ruleId: string,
  direction: -1 | 1,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const rules = target.scope === 'global'
    ? project.globalInteractions
    : locateSceneInteractions(project, target.locationId)
  const index = rules.findIndex((candidate) => candidate.id === ruleId)
  if (index < 0) throw new Error(emptyRuleScopeMessage(target.scope))
  const current = rules[index]
  if (current) assertRuleTargetsUnlocked(project, current)
  const swapIndex = index + direction
  if (swapIndex < 0 || swapIndex >= rules.length) return history
  const next = updateCourseProject(project, (draft) => {
    const draftRules = target.scope === 'global'
      ? draft.globalInteractions
      : locateSceneInteractions(draft, target.locationId)
    const from = draftRules.findIndex((candidate) => candidate.id === ruleId)
    if (from < 0) throw new Error(emptyRuleScopeMessage(target.scope))
    ;[draftRules[from], draftRules[swapIndex]] = [
      draftRules[swapIndex]!,
      draftRules[from]!,
    ]
  }, now)
  return commitCourseHistory(history, next)
}
