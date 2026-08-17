import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  commitCourseHistory,
  createCourseHistory,
  createCourseProject,
  redoCourseHistory,
  undoCourseHistory,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { createEditorSelectionSnapshot } from '@/renderer/course/editorActionTypes'
import {
  deleteFlowEditorBlock,
  deleteFlowEditorBlocks,
  duplicateFlowEditorBlock,
  executeFlowEditorAction,
  indentFlowEditorBlock,
  insertFlowEditorBlock,
  moveFlowEditorBlock,
  outdentFlowEditorBlock,
  reorderFlowEditorBlock,
  updateFlowEditorBlock,
} from '@/renderer/course/flowEditorCommands'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  CourseLocation,
  FlowBlock,
} from '@/shared/courseProjectTypes'

const NOW = '2026-08-15T08:00:00.000Z'

function flowLocation(block: FlowBlock, surfaceId: string): CourseLocation[] {
  const locations: CourseLocation[] = [{
    id: block.id,
    label: block.type === 'section'
      ? block.title.trim() || '分节'
      : block.type,
    kind: 'flow-block',
    surfaceId,
    blockId: block.id,
  }]
  if (block.type === 'section') {
    block.blocks.forEach((child) => {
      locations.push(...flowLocation(child, surfaceId))
    })
  }
  return locations
}

function createFlowProject(): CourseProjectDocument {
  let project = createCourseProject({ id: 'flow-commands', title: 'Flow 命令', now: NOW })
  project = addCourseSurface(project, 'flow', { id: 'flow', now: NOW })
  const blocks: FlowBlock[] = [
    { id: 'top-a', type: 'paragraph', text: '顶部段落 A' },
    {
      id: 'top-list',
      type: 'list',
      ordered: false,
      items: [{ id: 'item-1', text: '第一项' }],
    },
    {
      id: 'sec-1',
      type: 'section',
      title: '第一节',
      collapsedByDefault: false,
      blocks: [
        { id: 'nested-a', type: 'paragraph', text: '嵌套段落 A' },
        {
          id: 'nested-list',
          type: 'list',
          ordered: true,
          items: [{ id: 'nested-item-1', text: '嵌套项一' }],
        },
      ],
    },
    {
      id: 'sec-2',
      type: 'section',
      title: '第二节',
      collapsedByDefault: false,
      blocks: [{ id: 'nested-b', type: 'paragraph', text: '嵌套段落 B' }],
    },
  ]
  project = updateCourseProject(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === 'flow')
    if (!surface || surface.type !== 'flow') throw new Error('expected flow surface')
    surface.blocks = blocks
    const slideLocations = draft.locations.filter((location) => location.kind === 'slide-scene')
    draft.locations = [
      ...slideLocations,
      ...blocks.flatMap((block) => flowLocation(block, 'flow')),
    ]
    draft.startLocationId = 'top-a'
  }, NOW)
  return project
}

function expectOneHistory(
  previous: ReturnType<typeof createCourseHistory>,
  next: ReturnType<typeof createCourseHistory>,
): void {
  expect(next.past).toHaveLength(previous.past.length + 1)
  expect(next.present.revision).toBe(previous.present.revision + 1)
  expect(next.future).toEqual([])
  expect(courseProjectDocumentSchema.parse(next.present)).toEqual(next.present)
}

function target(surfaceId: string, blockId: string, parentId: string | null) {
  return { surfaceId, blockId, parentId }
}

describe('Flow editor commands', () => {
  it('inserts top-level and nested blocks at an exact index with one history each', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)

    history = insertFlowEditorBlock(history, {
      surfaceId: 'flow',
      parentId: null,
      index: 1,
      block: { type: 'heading', level: 2, text: '插入的标题' },
    }, NOW)
    expectOneHistory(createCourseHistory(project), history)

    history = insertFlowEditorBlock(
      history,
      'flow',
      'sec-1',
      1,
      { id: 'nested-insert', type: 'paragraph', text: '插入的嵌套段落' },
      NOW,
    )
    expectOneHistory(
      { present: history.past[history.past.length - 1]!, past: history.past.slice(0, -1), future: [] },
      history,
    )

    const flow = history.present.surfaces.find((surface) => surface.id === 'flow')
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    expect(flow.blocks.map((block) => block.id)).toEqual([
      'top-a', flow.blocks[1]!.id, 'top-list', 'sec-1', 'sec-2',
    ])
    const insertedHeading = flow.blocks[1]
    expect(insertedHeading?.type).toBe('heading')
    expect(insertedHeading?.id).toMatch(/^block-/u)

    const sec1 = flow.blocks.find((block) => block.id === 'sec-1')
    if (!sec1 || sec1.type !== 'section') throw new Error('expected sec-1 section')
    expect(sec1.blocks.map((block) => block.id)).toEqual([
      'nested-a', 'nested-insert', 'nested-list',
    ])
    expect(history.present.locations.some((location) =>
      location.kind === 'flow-block' && location.blockId === insertedHeading!.id,
    )).toBe(true)
    expect(history.present.locations.some((location) =>
      location.kind === 'flow-block' && location.blockId === 'nested-insert',
    )).toBe(false)
  })

  it('updates top-level and nested blocks with one history each and refreshes labels', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)

    history = updateFlowEditorBlock(history, target('flow', 'top-a', null), (block) => {
      if (block.type !== 'paragraph') throw new Error('expected paragraph')
      block.text = '顶部段落 A 已更新'
    }, NOW)
    expectOneHistory(createCourseHistory(project), history)

    history = updateFlowEditorBlock(history, target('flow', 'nested-a', 'sec-1'), {
      text: '嵌套段落 A 已更新',
    }, NOW)
    expect(history.past).toHaveLength(2)
    expect(history.present.revision).toBe(project.revision + 2)

    const flow = history.present.surfaces.find((surface) => surface.id === 'flow')
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    const top = flow.blocks.find((block) => block.id === 'top-a')
    expect(top?.type === 'paragraph' ? top.text : '').toBe('顶部段落 A 已更新')
    const sec1 = flow.blocks.find((block) => block.id === 'sec-1')
    const nested = sec1?.type === 'section'
      ? sec1.blocks.find((block) => block.id === 'nested-a')
      : undefined
    expect(nested?.type === 'paragraph' ? nested.text : '').toBe('嵌套段落 A 已更新')
    expect(history.present.locations.find((location) =>
      location.kind === 'flow-block' && location.blockId === 'top-a',
    )?.label).toBe('顶部段落 A 已更新')
    expect(courseProjectDocumentSchema.parse(history.present)).toEqual(history.present)
  })

  it('deletes nested and top-level blocks, repairing locations and startLocationId', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)

    history = deleteFlowEditorBlock(history, target('flow', 'nested-list', 'sec-1'), NOW)
    expectOneHistory(createCourseHistory(project), history)

    history = deleteFlowEditorBlock(history, target('flow', 'top-a', null), NOW)
    expect(history.past).toHaveLength(2)
    expect(history.present.revision).toBe(project.revision + 2)
    expect(history.present.locations.some((location) => location.id === 'nested-list')).toBe(false)
    expect(history.present.locations.some((location) => location.id === 'top-a')).toBe(false)
    expect(history.present.startLocationId).not.toBe('top-a')
    expect(history.present.locations.some((location) => location.id === history.present.startLocationId)).toBe(true)
    expect(courseProjectDocumentSchema.parse(history.present)).toEqual(history.present)
  })

  it('duplicates top-level and nested blocks with regenerated block and list-item ids', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)

    history = duplicateFlowEditorBlock(history, target('flow', 'top-list', null), NOW)
    expectOneHistory(createCourseHistory(project), history)

    const afterTop = history.present.surfaces.find((surface) => surface.id === 'flow')
    if (!afterTop || afterTop.type !== 'flow') throw new Error('expected flow surface')
    const topCopy = afterTop.blocks[afterTop.blocks.findIndex((block) => block.id === 'top-list') + 1]
    expect(topCopy?.id).not.toBe('top-list')
    expect(topCopy?.type === 'list' ? topCopy.items.map((item) => item.id) : []).not.toContain('item-1')
    expect(topCopy?.type === 'list' ? new Set(topCopy.items.map((item) => item.id)).size : 0).toBe(
      topCopy?.type === 'list' ? topCopy.items.length : 0,
    )

    history = duplicateFlowEditorBlock(history, target('flow', 'nested-list', 'sec-1'), NOW)
    expect(history.past).toHaveLength(2)

    const afterNested = history.present.surfaces.find((surface) => surface.id === 'flow')
    if (!afterNested || afterNested.type !== 'flow') throw new Error('expected flow surface')
    const sec1 = afterNested.blocks.find((block) => block.id === 'sec-1')
    if (!sec1 || sec1.type !== 'section') throw new Error('expected sec-1 section')
    const nestedCopy = sec1.blocks[sec1.blocks.findIndex((block) => block.id === 'nested-list') + 1]
    expect(nestedCopy?.id).not.toBe('nested-list')
    expect(nestedCopy?.type === 'list' ? nestedCopy.items.map((item) => item.id) : []).not.toContain('nested-item-1')
    expect(courseProjectDocumentSchema.parse(history.present)).toEqual(history.present)
  })

  it('reorders top-level and nested blocks in one history per gesture', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)

    history = reorderFlowEditorBlock(history, target('flow', 'top-list', null), 0, NOW)
    expectOneHistory(createCourseHistory(project), history)

    history = reorderFlowEditorBlock(history, target('flow', 'nested-list', 'sec-1'), 0, NOW)
    expect(history.past).toHaveLength(2)

    const flow = history.present.surfaces.find((surface) => surface.id === 'flow')
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    expect(flow.blocks[0]?.id).toBe('top-list')
    const sec1 = flow.blocks.find((block) => block.id === 'sec-1')
    if (!sec1 || sec1.type !== 'section') throw new Error('expected sec-1 section')
    expect(sec1.blocks[0]?.id).toBe('nested-list')
    expect(courseProjectDocumentSchema.parse(history.present)).toEqual(history.present)
  })

  it('moves blocks into, out of and across sections with one history each', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)

    // top-a moves into sec-2 at index 0
    history = moveFlowEditorBlock(history, target('flow', 'top-a', null), { parentId: 'sec-2', index: 0 }, NOW)
    expectOneHistory(createCourseHistory(project), history)

    let flow = history.present.surfaces.find((surface) => surface.id === 'flow')
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    expect(flow.blocks.map((block) => block.id)).toEqual(['top-list', 'sec-1', 'sec-2'])
    let sec2 = flow.blocks.find((block) => block.id === 'sec-2')
    expect(sec2?.type === 'section' ? sec2.blocks[0]?.id : undefined).toBe('top-a')

    // nested-a moves out of sec-1 to the top level at index 0
    history = moveFlowEditorBlock(history, target('flow', 'nested-a', 'sec-1'), { parentId: null, index: 0 }, NOW)
    expect(history.past).toHaveLength(2)

    flow = history.present.surfaces.find((surface) => surface.id === 'flow')
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    expect(flow.blocks[0]?.id).toBe('nested-a')

    // nested-b moves across from sec-2 into sec-1 at the end
    history = moveFlowEditorBlock(history, target('flow', 'nested-b', 'sec-2'), 'sec-1', 99, NOW)
    expect(history.past).toHaveLength(3)

    flow = history.present.surfaces.find((surface) => surface.id === 'flow')
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    const sec1 = flow.blocks.find((block) => block.id === 'sec-1')
    sec2 = flow.blocks.find((block) => block.id === 'sec-2')
    expect(sec1?.type === 'section' ? sec1.blocks.map((block) => block.id) : []).toEqual([
      'nested-list', 'nested-b',
    ])
    expect(sec2?.type === 'section' ? sec2.blocks.map((block) => block.id) : []).toEqual([
      'top-a',
    ])
    expect(history.present.startLocationId).toBe('top-a')
    expect(history.present.locations.some((location) => location.id === 'top-a')).toBe(true)
    expect(courseProjectDocumentSchema.parse(history.present)).toEqual(history.present)
  })

  it('rejects stale targets and keeps history untouched', () => {
    const project = createFlowProject()
    const history = createCourseHistory(project)
    const staleTarget = target('flow', 'nested-a', null)

    expect(() => deleteFlowEditorBlock(history, staleTarget, NOW))
      .toThrow('所选 Flow 块位置已变化，请重新选择')
    expect(() => deleteFlowEditorBlock(history, target('flow', 'ghost', null), NOW))
      .toThrow('找不到 Flow 块')
    expect(() => deleteFlowEditorBlock(history, target('missing-surface', 'top-a', null), NOW))
      .toThrow('找不到 Flow 表面')
    expect(history.past).toEqual([])
    expect(history.present.revision).toBe(project.revision)
  })

  it('supports undo/redo and keeps ids stable across a simulated save and reopen', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)

    history = insertFlowEditorBlock(history, {
      surfaceId: 'flow',
      parentId: null,
      index: 0,
      block: { id: 'stable-block', type: 'paragraph', text: '稳定块' },
    }, NOW)
    const inserted = history.present.surfaces.find((surface) => surface.id === 'flow')
    const insertedBlock = inserted?.type === 'flow'
      ? inserted.blocks.find((block) => block.id === 'stable-block')
      : undefined
    expect(insertedBlock?.id).toBe('stable-block')

    // Simulate save/reopen through the real V9 schema.
    const reopened = courseProjectDocumentSchema.parse(JSON.parse(JSON.stringify(history.present)))
    expect(reopened).toEqual(history.present)
    const reopenedFlow = reopened.surfaces.find((surface) => surface.id === 'flow')
    expect(reopenedFlow?.type === 'flow'
      ? reopenedFlow.blocks.find((block) => block.id === 'stable-block')?.id
      : undefined).toBe('stable-block')

    const beforeUndo = history
    history = undoCourseHistory(history)
    expect(history.present.revision).toBe(project.revision)
    const undoneFlow = history.present.surfaces.find((surface) => surface.id === 'flow')
    expect(undoneFlow?.type === 'flow' ? undoneFlow.blocks.some((block) => block.id === 'stable-block') : false).toBe(false)
    expect(courseProjectDocumentSchema.parse(history.present)).toEqual(history.present)

    history = redoCourseHistory(history)
    expect(history.present.revision).toBe(beforeUndo.present.revision)
    const redoneFlow = history.present.surfaces.find((surface) => surface.id === 'flow')
    expect(redoneFlow?.type === 'flow' ? redoneFlow.blocks.some((block) => block.id === 'stable-block') : false).toBe(true)
    expect(courseProjectDocumentSchema.parse(history.present)).toEqual(history.present)
  })

  it('commits exactly one history entry per command across the whole command set', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)
    const commands: Array<(state: ReturnType<typeof createCourseHistory>) => ReturnType<typeof createCourseHistory>> = [
      (state) => insertFlowEditorBlock(state, {
        surfaceId: 'flow',
        parentId: null,
        index: 0,
        block: { type: 'heading', level: 1, text: '一次' },
      }, NOW),
      (state) => updateFlowEditorBlock(state, target('flow', 'top-a', null), {
        text: '一次更新',
      }, NOW),
      (state) => duplicateFlowEditorBlock(state, target('flow', 'top-list', null), NOW),
      (state) => moveFlowEditorBlock(state, target('flow', 'top-a', null), {
        parentId: 'sec-1',
        index: 0,
      }, NOW),
      (state) => reorderFlowEditorBlock(state, target('flow', 'top-list', null), 2, NOW),
      (state) => deleteFlowEditorBlock(state, target('flow', 'top-list', null), NOW),
    ]

    for (const run of commands) {
      const previous = history
      history = run(history)
      expect(history.past).toHaveLength(previous.past.length + 1)
      expect(history.present.revision).toBe(previous.present.revision + 1)
      expect(history.future).toEqual([])
      expect(courseProjectDocumentSchema.parse(history.present)).toEqual(history.present)
    }
    expect(history.past).toHaveLength(commands.length)
    expect(history.present.revision).toBe(project.revision + commands.length)
  })

  it('does not promote ordinary blocks to course locations and keeps heading anchors', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)
    history = insertFlowEditorBlock(history, {
      surfaceId: 'flow',
      parentId: null,
      index: 0,
      block: { id: 'plain-p', type: 'paragraph', text: '普通段落' },
    }, NOW)
    expect(history.present.locations.some((location) =>
      location.kind === 'flow-block' && location.blockId === 'plain-p',
    )).toBe(false)
    history = insertFlowEditorBlock(history, {
      surfaceId: 'flow',
      parentId: null,
      index: 0,
      block: { id: 'anchor-h', type: 'heading', level: 2, text: '目录标题' },
    }, NOW)
    expect(history.present.locations.some((location) =>
      location.kind === 'flow-block' && location.blockId === 'anchor-h',
    )).toBe(true)
  })

  it('indents into the previous section and outdents back with one history each', () => {
    const project = createFlowProject()
    let history = createCourseHistory(project)
    history = indentFlowEditorBlock(history, target('flow', 'sec-2', null), NOW)
    expectOneHistory(createCourseHistory(project), history)
    let flow = history.present.surfaces.find((surface) => surface.id === 'flow')
    const sec1 = flow?.type === 'flow' ? flow.blocks.find((block) => block.id === 'sec-1') : undefined
    expect(sec1?.type === 'section' ? sec1.blocks.map((block) => block.id) : []).toContain('sec-2')
    history = outdentFlowEditorBlock(history, target('flow', 'sec-2', 'sec-1'), NOW)
    flow = history.present.surfaces.find((surface) => surface.id === 'flow')
    expect(flow?.type === 'flow' ? flow.blocks.map((block) => block.id) : []).toContain('sec-2')
  })

  it('deletes a multi-selection in one history and repairs interaction refs', () => {
    const project = createFlowProject()
    const prepared = updateCourseProject(project, (draft) => {
      draft.courseState.push({ key: 'flowUnlocked', valueType: 'boolean', defaultValue: false })
      draft.navigationGuards.push({
        id: 'guard-top',
        effect: 'block',
        toLocationIds: ['top-a'],
        match: 'all',
        conditions: [{ type: 'exists', key: 'flowUnlocked', exists: true }],
        message: '先完成',
      })
      draft.globalInteractions.push({
        id: 'go-top',
        enabled: true,
        trigger: { type: 'presenter.command', command: 'next' },
        conditions: [],
        actions: [{
          id: 'step-go',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.go', sceneId: 'top-a' },
        }],
      })
    }, NOW)
    let history = createCourseHistory(prepared)
    history = deleteFlowEditorBlocks(history, [
      target('flow', 'top-a', null),
      target('flow', 'top-list', null),
    ], NOW)
    expect(history.past).toHaveLength(1)
    expect(history.present.revision).toBe(prepared.revision + 1)
    expect(history.present.locations.some((location) => location.id === 'top-a')).toBe(false)
    expect(history.present.navigationGuards).toEqual([])
    expect(history.present.globalInteractions).toEqual([])
  })

  it('executes T02 actionIds and returns ok/reason for the T10 adapter', () => {
    const project = createFlowProject()
    const history = createCourseHistory(project)
    const snapshot = createEditorSelectionSnapshot({
      sessionId: 'session-flow',
      projectId: project.id,
      projectRevision: project.revision,
      locationId: 'top-a',
      surfaceId: 'flow',
      surfaceKind: 'flow',
      owner: 'flow-block',
      targets: [{
        owner: 'flow-block',
        layerItemId: 'top-a',
        kind: 'flow-block',
        label: '顶部段落 A',
      }],
    })
    const copied = executeFlowEditorAction('copy', snapshot, history, { now: NOW })
    expect(copied).toMatchObject({ ok: true, reason: '已复制当前选择' })
    expect(copied.history).toBe(history)
    expect(copied.clipboard?.[0]).toMatchObject({ id: 'top-a', type: 'paragraph' })

    const pasted = executeFlowEditorAction('paste', snapshot, history, {
      now: NOW,
      clipboard: copied.clipboard,
    })
    expect(pasted.ok).toBe(true)
    expect(pasted.history.past).toHaveLength(1)
    const flow = pasted.history.present.surfaces.find((surface) => surface.id === 'flow')
    const knownIds = new Set(['top-a', 'top-list', 'sec-1', 'sec-2'])
    const created = flow?.type === 'flow'
      ? flow.blocks.filter((block) => !knownIds.has(block.id))
      : []
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ type: 'paragraph', text: '顶部段落 A' })
    expect(pasted.history.present.locations.some((location) =>
      location.kind === 'flow-block' && location.blockId === created[0]!.id,
    )).toBe(false)

    const cut = executeFlowEditorAction('cut', snapshot, history, { now: NOW })
    expect(cut.ok).toBe(true)
    expect(cut.clipboard?.[0]).toMatchObject({ id: 'top-a', type: 'paragraph' })
    expect(cut.history.present.locations.some((location) => location.id === 'top-a')).toBe(false)

    const deleted = executeFlowEditorAction('delete', snapshot, history, { now: NOW })
    expect(deleted.ok).toBe(true)
    expect(deleted.history.past).toHaveLength(1)
    expect(deleted.history.present.revision).toBe(project.revision + 1)

    const globalSnapshot = createEditorSelectionSnapshot({
      sessionId: 'session-flow',
      projectId: project.id,
      projectRevision: project.revision,
      locationId: 'top-a',
      surfaceId: 'flow',
      surfaceKind: 'flow',
      owner: 'global',
      targets: [{
        owner: 'global',
        layerItemId: 'global-1',
        kind: 'shape',
      }],
    })
    const blocked = executeFlowEditorAction('delete', globalSnapshot, history, { now: NOW })
    expect(blocked).toMatchObject({
      ok: false,
      reason: '全局层选择不能改动 Flow 页面目录',
    })
    expect(blocked.history).toBe(history)
  })
})
