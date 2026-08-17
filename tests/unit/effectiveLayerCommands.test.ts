import { describe, expect, it } from 'vitest'
import {
  applyEffectiveLayerDelete,
  applyEffectiveLayerDuplicate,
  applyEffectiveLayerRename,
  applyEffectiveLayerReorder,
  applyEffectiveLayerToggleLock,
  applyEffectiveLayerToggleVisibility,
  createEffectiveLayerListHandlers,
  listEffectiveLayerCommandItems,
  toEffectiveLayerListItems,
} from '@/renderer/course/effectiveLayerCommands'
import { findGlobalTeacherController } from '@/renderer/course/globalLayerCommands'
import { createBlankSlideCourse } from '@/renderer/course/courseLocationCommands'
import { updateCourseProject, sortAllLayerLists } from '@/renderer/course/courseStudioModel'
import { sceneNodeToCourseLayerItem } from '@/shared/courseProjectModel'
import { createTextNode } from '@/renderer/project/createProject'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-17T05:10:00.000Z'

function projectWithPageText() {
  const created = createBlankSlideCourse({ id: 't06-layers', title: '图层测试', now: NOW })
  const project = updateCourseProject(created.project, (draft) => {
    const surface = draft.surfaces[0]
    if (surface?.type !== 'slide') throw new Error('expected slide')
    surface.scenes[0]!.layerItems.push(
      sceneNodeToCourseLayerItem(createTextNode({ id: 'page-title', name: '本页标题' }), 2),
    )
    draft.globalLayerItems.push({
      item: sceneNodeToCourseLayerItem(createTextNode({ id: 'course-banner', name: '全课横幅' }), 0),
      visibility: { mode: 'all', locationIds: [] },
    })
    sortAllLayerLists(draft)
  }, NOW)
  return { project, locationId: created.activatedLocationId }
}

describe('effective layer commands', () => {
  it('lists real owners and stable authoring addresses, front-most first', () => {
    const { project, locationId } = projectWithPageText()
    const items = listEffectiveLayerCommandItems({ project, locationId, selectedIds: ['page-title'] })
    expect(items.map((item) => item.id)).toEqual([
      'page-title',
      findGlobalTeacherController(project)!.item.layerItemId,
      'course-banner',
    ])
    const page = items.find((item) => item.id === 'page-title')!
    expect(page).toMatchObject({
      name: '本页标题',
      sourceKind: 'scene',
      owner: 'scene',
      ownerKey: `scene:${project.locations[0] && 'sceneId' in project.locations[0] ? project.locations[0].sceneId : ''}`,
      selected: true,
    })
    expect(page.authoringAddress).toContain('/scene/')
    expect(page.authoringAddress).toContain('page-title')
    const global = items.find((item) => item.id === 'course-banner')!
    expect(global.sourceKind).toBe('global')
    expect(global.ownerKey).toBe('global')
    expect(global.authoringAddress).toContain('/global/')
    const listItems = toEffectiveLayerListItems(items)
    expect(listItems[0]).toMatchObject({
      id: 'page-title',
      sourceKind: 'scene',
      sourceLabel: '本页',
    })
  })

  it('reorders within an owner and refuses a cross-owner drop without scopeMove', () => {
    const { project, locationId } = projectWithPageText()
    const controllerId = findGlobalTeacherController(project)!.item.layerItemId
    const refused = applyEffectiveLayerReorder(project, locationId, {
      fromId: 'course-banner',
      toId: 'page-title',
      fromOwnerKey: 'global',
      toOwnerKey: `scene:${'sceneId' in project.locations[0]! ? project.locations[0].sceneId : ''}`,
      placement: 'before',
    }, NOW)
    expect(refused).toMatchObject({
      ok: false,
      code: 'cross-owner',
    })
    expect(refused.reason).toContain('不能跨来源假排序')

    const reordered = applyEffectiveLayerReorder(project, locationId, {
      fromId: 'course-banner',
      toId: controllerId,
      fromOwnerKey: 'global',
      toOwnerKey: 'global',
      placement: 'before',
    }, NOW)
    expect(reordered.ok).toBe(true)
    if (!reordered.ok) return
    const globalIds = reordered.project.globalLayerItems.map((entry) => entry.item.layerItemId)
    expect(globalIds.indexOf('course-banner')).toBeGreaterThan(globalIds.indexOf(controllerId))
  })

  it('moves across owners only when scopeMove is explicit, and keeps the controller global', () => {
    const { project, locationId } = projectWithPageText()
    const sceneId = 'sceneId' in project.locations[0]! ? project.locations[0].sceneId : ''
    const moved = applyEffectiveLayerReorder(project, locationId, {
      fromId: 'page-title',
      toId: 'course-banner',
      fromOwnerKey: `scene:${sceneId}`,
      toOwnerKey: 'global',
      placement: 'after',
      scopeMove: true,
    }, NOW)
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.project.globalLayerItems.some((entry) => entry.item.layerItemId === 'page-title')).toBe(true)
    const surface = moved.project.surfaces[0]
    if (surface?.type !== 'slide') throw new Error('expected slide')
    expect(surface.scenes[0]!.layerItems.some((item) => item.layerItemId === 'page-title')).toBe(false)

    const controllerId = findGlobalTeacherController(moved.project)!.item.layerItemId
    const blocked = applyEffectiveLayerReorder(moved.project, locationId, {
      fromId: controllerId,
      toId: 'course-banner',
      fromOwnerKey: 'global',
      toOwnerKey: `scene:${sceneId}`,
      placement: 'before',
      scopeMove: true,
    }, NOW)
    expect(blocked).toMatchObject({ ok: false, code: 'cross-owner' })
    expect(blocked.reason).toContain('教师控制器必须留在全局层')
  })

  it('renames, locks, duplicates and state-hides through the unified commands', () => {
    const { project, locationId } = projectWithPageText()
    const renamed = applyEffectiveLayerRename(project, locationId, 'page-title', '讲解标题', NOW)
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    const locked = applyEffectiveLayerToggleLock(renamed.project, 'page-title', NOW)
    expect(locked.ok).toBe(true)
    if (!locked.ok) return
    expect(applyEffectiveLayerRename(locked.project, locationId, 'page-title', '再改名', NOW))
      .toMatchObject({ ok: false, code: 'locked' })
    const unlocked = applyEffectiveLayerToggleLock(locked.project, 'page-title', NOW)
    expect(unlocked.ok).toBe(true)
    if (!unlocked.ok) return
    const duplicated = applyEffectiveLayerDuplicate(unlocked.project, 'page-title', NOW)
    expect(duplicated.ok).toBe(true)
    if (!duplicated.ok) return
    const stateId = (() => {
      const surface = duplicated.project.surfaces[0]
      if (surface?.type !== 'slide') throw new Error('expected slide')
      return surface.scenes[0]!.presentation?.states[0]?.id ?? null
    })()
    const hidden = applyEffectiveLayerDelete(duplicated.project, {
      locationId,
      stateId,
    }, 'page-title', NOW)
    expect(hidden.ok).toBe(true)
    if (!hidden.ok) return
    expect(hidden.reason).toContain('当前状态隐藏')
    const surface = hidden.project.surfaces[0]
    if (surface?.type !== 'slide') throw new Error('expected slide')
    expect(surface.scenes[0]!.layerItems.some((item) => item.layerItemId === 'page-title')).toBe(true)
    expect(surface.scenes[0]!.presentation?.states[0]?.layerItemOverrides['page-title']).toMatchObject({
      visible: false,
    })
    expect(courseProjectDocumentSchema.safeParse(hidden.project).success).toBe(true)
  })

  it('exports T10 binders that call the same commands', () => {
    const { project, locationId } = projectWithPageText()
    let current = project
    const results: string[] = []
    const handlers = createEffectiveLayerListHandlers({
      getProject: () => current,
      locationId,
      apply: (result) => {
        results.push(result.reason)
        if (result.ok) current = result.project
      },
      onSelect: () => undefined,
      now: NOW,
    })
    handlers.onRename('page-title', '绑定标题')
    handlers.onToggleVisibility('course-banner')
    expect(results[0]).toContain('绑定标题')
    expect(current.globalLayerItems.find((entry) => entry.item.layerItemId === 'course-banner')?.item.visible)
      .toBe(false)
    expect(handlers.listItems().some((item) => item.id === 'page-title')).toBe(true)
  })
})
