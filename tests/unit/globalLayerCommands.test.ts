import { describe, expect, it } from 'vitest'
import { selectGlobalAuthoringOwner } from '@/renderer/course/globalLayerCommands'
import {
  captureGlobalControllerTarget,
  commitGlobalControllerTransform,
  deleteGlobalLayerItem,
  describeGlobalLayerDeleteImpact,
  duplicateGlobalLayerItem,
  pasteGlobalLayerItems,
  findGlobalTeacherController,
  isTeacherControllerLayerItem,
  previewGlobalControllerTransform,
  renameGlobalLayerItem,
  reorderGlobalLayerItems,
  restoreDefaultTeacherController,
  setGlobalLayerLocked,
  setGlobalLayerVisible,
  updateGlobalControllerContent,
} from '@/renderer/course/globalLayerCommands'
import { createBlankSlideCourse } from '@/renderer/course/courseLocationCommands'
import { updateCourseProject, sortAllLayerLists } from '@/renderer/course/courseStudioModel'
import { sceneNodeToCourseLayerItem } from '@/shared/courseProjectModel'
import { createTextNode } from '@/renderer/project/createProject'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-17T05:00:00.000Z'

function slideProject() {
  return createBlankSlideCourse({ id: 't06-global', title: '全局层测试', now: NOW }).project
}

function addGlobalText(project: ReturnType<typeof slideProject>, id: string, name: string, order: number) {
  return updateCourseProject(project, (draft) => {
    draft.globalLayerItems.push({
      item: sceneNodeToCourseLayerItem(createTextNode({ id, name }), order),
      visibility: { mode: 'all', locationIds: [] },
    })
    sortAllLayerLists(draft)
  }, NOW)
}

describe('global layer commands', () => {
  it('selects the global owner without changing the preview location or revision', () => {
    const project = slideProject()
    const revision = project.revision
    const selected = selectGlobalAuthoringOwner(project, project.startLocationId)
    expect(selected.activatedLocationId).toBe(project.startLocationId)
    expect(selected.authoringScope).toBe('global-layer')
    expect(selected.layout.layout).toBe('slide')
    expect(project.revision).toBe(revision)
  })

  it('renames, hides and reorders within the global owner', () => {
    let project = addGlobalText(slideProject(), 'global-title', '全课标题', 0)
    const controller = findGlobalTeacherController(project)!
    const renamed = renameGlobalLayerItem(project, 'global-title', '跨页标题', NOW)
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    project = renamed.project
    const hidden = setGlobalLayerVisible(project, 'global-title', false, NOW)
    expect(hidden.ok).toBe(true)
    if (!hidden.ok) return
    project = hidden.project
    const reordered = reorderGlobalLayerItems(
      project,
      [controller.item.layerItemId, 'global-title'],
      NOW,
    )
    expect(reordered.ok).toBe(true)
    if (!reordered.ok) return
    expect(reordered.project.globalLayerItems.map((entry) => entry.item.layerItemId))
      .toEqual([controller.item.layerItemId, 'global-title'])
    expect(courseProjectDocumentSchema.safeParse(reordered.project).success).toBe(true)
  })

  it('refuses to duplicate the teacher controller without writing', () => {
    const project = slideProject()
    const controller = findGlobalTeacherController(project)!
    const duplicated = duplicateGlobalLayerItem(project, controller.item.layerItemId, NOW)
    expect(duplicated.ok).toBe(true)
    if (!duplicated.ok) return
    expect(duplicated.project).toBe(project)
    expect(duplicated.reason).toContain('教师控制器不能重复')
  })

  it('pastes copied global items with new ids in one command chain', () => {
    const project = addGlobalText(slideProject(), 'global-title', '全课标题', 0)
    const before = project.globalLayerItems.map((entry) => entry.item.layerItemId)
    const pasted = pasteGlobalLayerItems(project, ['global-title'], NOW)
    expect(pasted.ok).toBe(true)
    if (!pasted.ok) return
    const after = pasted.project.globalLayerItems.map((entry) => entry.item.layerItemId)
    expect(after).toEqual(expect.arrayContaining(before))
    expect(after.length).toBe(before.length + 1)
    expect(pasted.layerItemId).toBeTruthy()
    expect(pasted.layerItemId).not.toBe('global-title')
    expect(courseProjectDocumentSchema.safeParse(pasted.project).success).toBe(true)
  })

  it('refuses writes on a locked global item except unlock', () => {
    let project = addGlobalText(slideProject(), 'locked-title', '锁定标题', 0)
    const locked = setGlobalLayerLocked(project, 'locked-title', true, NOW)
    expect(locked.ok).toBe(true)
    if (!locked.ok) return
    project = locked.project
    expect(renameGlobalLayerItem(project, 'locked-title', '新名称', NOW)).toMatchObject({
      ok: false,
      code: 'locked',
      reason: '图层已锁定，除解锁外不能修改。',
    })
    expect(deleteGlobalLayerItem(project, 'locked-title', NOW).ok).toBe(false)
    const unlocked = setGlobalLayerLocked(project, 'locked-title', false, NOW)
    expect(unlocked.ok).toBe(true)
  })

  it('describes global delete impact and restores the default teacher controller', () => {
    const project = slideProject()
    const controller = findGlobalTeacherController(project)!
    expect(isTeacherControllerLayerItem(controller.item)).toBe(true)
    const impact = describeGlobalLayerDeleteImpact(project, controller.item.layerItemId)
    expect(impact?.isTeacherController).toBe(true)
    expect(impact?.message).toContain('全部页面')
    expect(impact?.message).toContain('恢复教师控制器')
    const deleted = deleteGlobalLayerItem(project, controller.item.layerItemId, NOW)
    expect(deleted.ok).toBe(true)
    if (!deleted.ok) return
    expect(findGlobalTeacherController(deleted.project)).toBeUndefined()
    const restored = restoreDefaultTeacherController(deleted.project, NOW)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(findGlobalTeacherController(restored.project)).toBeDefined()
    expect(restored.project.playback.controls).toBe('canvas')
    expect(courseProjectDocumentSchema.safeParse(restored.project).success).toBe(true)
  })

  it('duplicates a global item and captures a stable controller target', () => {
    const project = addGlobalText(slideProject(), 'banner', '横幅', 0)
    const duplicated = duplicateGlobalLayerItem(project, 'banner', NOW)
    expect(duplicated.ok).toBe(true)
    if (!duplicated.ok) return
    expect(duplicated.project.globalLayerItems.some((entry) => entry.item.label === '横幅 副本')).toBe(true)
    const target = captureGlobalControllerTarget({
      project,
      sessionId: 'session-1',
      locationId: project.startLocationId,
    })
    expect(target).toMatchObject({
      source: 'global',
      locationId: project.startLocationId,
      projectRevision: project.revision,
    })
    expect(target?.authoringAddress).toContain('courseware://authoring/')
  })

  it('previews controller geometry without writing and commits once', () => {
    const project = slideProject()
    const target = captureGlobalControllerTarget({
      project,
      sessionId: 'session-1',
      locationId: project.startLocationId,
    })
    expect(target).not.toBeNull()
    const item = findGlobalTeacherController(project)!.item
    const start = {
      x: item.frame.x,
      y: item.frame.y,
      width: item.frame.width,
      height: item.frame.height,
    }
    const preview = previewGlobalControllerTransform(start, {
      kind: 'move',
      viewDelta: { x: 20, y: -10 },
      transform: { scale: 2, offsetX: 0, offsetY: 0 },
    })
    expect(preview).toEqual({
      x: start.x + 10,
      y: start.y - 5,
      width: start.width,
      height: start.height,
    })
    expect(project.revision).toBe(0)
    const committed = commitGlobalControllerTransform(project, target!, {
      ...preview,
      rotation: item.rotation,
    }, NOW)
    expect(committed.ok).toBe(true)
    if (!committed.ok) return
    const unchanged = commitGlobalControllerTransform(project, target!, {
      ...start,
      rotation: item.rotation,
    }, NOW)
    expect(unchanged.ok).toBe(true)
    if (unchanged.ok) expect(unchanged.project).toBe(project)
    expect(committed.project.revision).toBe(1)
    const next = findGlobalTeacherController(committed.project)!.item
    expect(next.frame).toMatchObject(preview)
  })

  it('refuses a stale controller target and locked content writes', () => {
    const project = slideProject()
    const target = captureGlobalControllerTarget({
      project,
      sessionId: 'session-1',
      locationId: project.startLocationId,
    })!
    const stale = commitGlobalControllerTransform(project, {
      ...target,
      projectRevision: project.revision + 3,
    }, {
      x: 10, y: 10, width: 100, height: 40, rotation: 0,
    }, NOW)
    expect(stale).toMatchObject({ ok: false, code: 'stale-target' })
    const locked = setGlobalLayerLocked(project, target.layerItemId, true, NOW)
    expect(locked.ok).toBe(true)
    if (!locked.ok) return
    const patched = updateGlobalControllerContent(locked.project, {
      ...target,
      projectRevision: locked.project.revision,
    }, { title: '新标题' }, NOW)
    expect(patched).toMatchObject({ ok: false, code: 'locked' })
    const unlocked = updateGlobalControllerContent(locked.project, {
      ...target,
      projectRevision: locked.project.revision,
    }, { locked: false }, NOW)
    expect(unlocked.ok).toBe(true)
  })
})
