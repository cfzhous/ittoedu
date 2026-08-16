import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/renderer/store/editorStore'

function courseSession() {
  return useEditorStore.getState().courseSession!
}

function flowSurface(session: ReturnType<typeof courseSession>) {
  const surface = session.history.present.surfaces.find(
    (candidate) => candidate.type === 'flow',
  )
  if (!surface || surface.type !== 'flow') throw new Error('missing flow surface')
  return surface
}

beforeEach(() => {
  useEditorStore.getState().createNewCourseProject()
  useEditorStore.getState().addCourseSurface('flow', 'Flow 收口测试')
})

describe('M5/M6 closure store commands', () => {
  it('applies list structural commands as one history entry each', () => {
    const store = useEditorStore.getState()
    store.insertCourseFlowBlock({
      type: 'list',
      ordered: false,
      items: [{ id: 'item-1', text: '一' }],
    })
    let session = courseSession()
    const listId = session.selection.flowBlockId!
    const historyStart = session.history.past.length

    store.applyCourseFlowStructuralCommand({
      blockId: listId,
      kind: 'list.addItem',
      text: '二',
    })
    session = courseSession()
    expect(session.history.past).toHaveLength(historyStart + 1)
    const list = flowSurface(session).blocks.find(
      (block) => block.id === listId,
    )
    expect(list?.type === 'list' && list.items).toHaveLength(2)
    const secondId = list?.type === 'list' ? list.items[1]!.id : ''

    store.applyCourseFlowStructuralCommand({
      blockId: listId,
      kind: 'list.editItem',
      itemId: secondId,
      text: '二改',
    })
    session = courseSession()
    expect(session.history.past).toHaveLength(historyStart + 2)

    store.applyCourseFlowStructuralCommand({
      blockId: listId,
      kind: 'list.reorderItem',
      itemId: secondId,
      toIndex: 0,
    })
    session = courseSession()
    const reordered = flowSurface(session).blocks.find(
      (block) => block.id === listId,
    )
    expect(
      reordered?.type === 'list' ? reordered.items[0]!.text : '',
    ).toBe('二改')

    store.applyCourseFlowStructuralCommand({
      blockId: listId,
      kind: 'list.deleteItem',
      itemId: secondId,
    })
    session = courseSession()
    const deleted = flowSurface(session).blocks.find(
      (block) => block.id === listId,
    )
    expect(deleted?.type === 'list' ? deleted.items : []).toHaveLength(1)
  })

  it('applies table structural commands and preserves schema-valid rows/cells', () => {
    const store = useEditorStore.getState()
    store.insertCourseFlowBlock({
      type: 'table',
      caption: '表',
      columns: [{ id: 'col-1', header: 'A' }],
      rows: [{ id: 'row-1', cells: { 'col-1': '1' } }],
    })
    let session = courseSession()
    const tableId = session.selection.flowBlockId!
    const historyStart = session.history.past.length

    store.applyCourseFlowStructuralCommand({ blockId: tableId, kind: 'table.addColumn' })
    session = courseSession()
    let table = flowSurface(session).blocks.find((block) => block.id === tableId)
    expect(table?.type === 'table' && table.columns).toHaveLength(2)
    const newColumnId = table?.type === 'table' ? table.columns[1]!.id : ''

    store.applyCourseFlowStructuralCommand({ blockId: tableId, kind: 'table.addRow' })
    session = courseSession()
    table = flowSurface(session).blocks.find((block) => block.id === tableId)
    expect(table?.type === 'table' && table.rows).toHaveLength(2)
    expect(
      table?.type === 'table'
        ? table.rows[1]!.cells[newColumnId]
        : undefined,
    ).toBe('')

    store.applyCourseFlowStructuralCommand({
      blockId: tableId,
      kind: 'table.deleteColumn',
      columnId: newColumnId,
    })
    session = courseSession()
    table = flowSurface(session).blocks.find((block) => block.id === tableId)
    expect(table?.type === 'table' && table.columns).toHaveLength(1)
    expect(
      table?.type === 'table' ? table.rows[0]!.cells[newColumnId] : 'present',
    ).toBeUndefined()
    expect(session.history.past).toHaveLength(historyStart + 3)

    store.undoCourseProject()
    session = courseSession()
    table = flowSurface(session).blocks.find((block) => block.id === tableId)
    expect(table?.type === 'table' && table.columns).toHaveLength(2)
  })
})
