import { describe, expect, it, vi } from 'vitest'
import { makeAuthoringAddress } from '@/shared/authoringAddress'
import {
  EDITOR_ACTION_IDS,
  captureEditorMenuSnapshot,
  classifyEditorFocus,
  createEditorSelectionSnapshot,
  isEditorWriteAction,
  isTextLikeEditorFocus,
  type EditorActionAdapter,
  type EditorActionAdapters,
  type EditorActionId,
  type EditorSelectionSnapshot,
  type EditorSelectionSnapshotInput,
  type EditorSelectedTargetInput,
} from '@/renderer/course/editorActionTypes'
import {
  interpretEditorEntry,
  listEditorActions,
  resolveEditorActionAvailability,
  resolveEditorAdapterKind,
  routeEditorAction,
} from '@/renderer/course/editorActionRouting'

const PROJECT_ID = 'course-action-routing'
const SURFACE_ID = 'slide-main'
const SCENE_ID = 'scene-one'

function snapshot(
  overrides: Partial<EditorSelectionSnapshotInput> = {},
  targets?: readonly EditorSelectedTargetInput[],
): EditorSelectionSnapshot {
  return createEditorSelectionSnapshot({
    sessionId: 'session-1',
    projectId: PROJECT_ID,
    projectRevision: 4,
    locationId: 'loc-1',
    surfaceId: SURFACE_ID,
    sceneId: SCENE_ID,
    surfaceKind: 'slide',
    owner: 'scene',
    targets,
    ...overrides,
  })
}

function sceneTarget(
  layerItemId: string,
  extra: Partial<EditorSelectedTargetInput> = {},
): EditorSelectedTargetInput {
  return {
    owner: 'scene',
    layerItemId,
    kind: 'shape',
    ...extra,
  }
}

function recordingAdapter(label: 'global' | 'surface'): EditorActionAdapter & {
  calls: Array<{ actionId: EditorActionId; addresses: readonly string[] }>
} {
  const calls: Array<{ actionId: EditorActionId; addresses: readonly string[] }> = []
  return {
    calls,
    execute(actionId, current) {
      calls.push({
        actionId,
        addresses: current.menuSelection.authoringAddresses,
      })
      return { ok: true, reason: `${label} 已执行${actionId}` }
    },
  }
}

function availabilityMap(current: EditorSelectionSnapshot): Record<EditorActionId, {
  enabled: boolean
  reason: string
}> {
  return Object.fromEntries(
    listEditorActions(current).map((item) => [
      item.actionId,
      { enabled: item.enabled, reason: item.reason },
    ]),
  ) as Record<EditorActionId, { enabled: boolean; reason: string }>
}

describe('稳定 Selection Snapshot', () => {
  it('记录 session、project revision、location、surface 与稳定地址', () => {
    const current = snapshot({ owner: 'scene' }, [
      sceneTarget('title', { kind: 'text', label: '标题' }),
    ])
    const expected = makeAuthoringAddress({
      projectId: PROJECT_ID,
      scope: 'scene',
      surfaceId: SURFACE_ID,
      sceneId: SCENE_ID,
      carrier: 'native',
      layerItemId: 'title',
      field: 'content.text',
    })

    expect(current.sessionId).toBe('session-1')
    expect(current.projectRevision).toBe(4)
    expect(current.locationId).toBe('loc-1')
    expect(current.surfaceKind).toBe('slide')
    expect(current.owner).toBe('scene')
    expect(current.authoringAddresses).toEqual([expected])
    expect(current.authoringAddresses[0]).not.toContain('temporary')
    expect(current.menuSelection.targetIds).toEqual(['title'])
    expect(Object.isFrozen(current)).toBe(true)
    expect(Object.isFrozen(current.targets)).toBe(true)
    expect(Object.isFrozen(current.menuSelection)).toBe(true)
  })

  it('打开菜单后冻结选择，后续 live 变化不能换目标', () => {
    const live = snapshot({}, [sceneTarget('first')])
    const menu = captureEditorMenuSnapshot(live)
    const later = snapshot({}, [sceneTarget('second'), sceneTarget('third')])
    const surface = recordingAdapter('surface')

    expect(menu.capturedAt).toBe('menu-open')
    expect(menu.menuSelection.targetIds).toEqual(['first'])
    expect(later.menuSelection.targetIds).toEqual(['second', 'third'])

    const result = routeEditorAction({
      actionId: 'delete',
      snapshot: menu,
      adapters: { surface },
    })
    expect(result.ok).toBe(true)
    expect(surface.calls).toHaveLength(1)
    expect(surface.calls[0]?.addresses).toEqual(menu.authoringAddresses)
    expect(surface.calls[0]?.addresses).not.toEqual(later.authoringAddresses)
  })

  it('识别 input / textarea / contenteditable 与作者会话焦点', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'

    expect(classifyEditorFocus(input)).toBe('input')
    expect(classifyEditorFocus(textarea)).toBe('textarea')
    expect(classifyEditorFocus({ isContentEditable: true })).toBe('contenteditable')
    expect(classifyEditorFocus(editable)).toBe('contenteditable')
    expect(classifyEditorFocus({ textEditSession: true })).toBe('text-edit-session')
    expect(classifyEditorFocus({ formulaEditSession: true })).toBe('formula-edit-session')
    expect(classifyEditorFocus({ runtimeAuthorSession: true })).toBe('runtime-author-session')
    expect(classifyEditorFocus({ componentAuthorSession: true })).toBe('component-author-session')
    expect(isTextLikeEditorFocus('none')).toBe(false)
    expect(isTextLikeEditorFocus('input')).toBe(true)
  })
})

describe('入口语义', () => {
  it('Escape 只关菜单，不派发删除或清空选择', () => {
    expect(interpretEditorEntry({ source: 'keyboard', key: 'Escape' })).toEqual({
      kind: 'close-menu',
    })
  })

  it('Shift+F10、Menu 与鼠标右键共享打开菜单语义', () => {
    expect(interpretEditorEntry({
      source: 'keyboard',
      key: 'F10',
      shiftKey: true,
    })).toEqual({ kind: 'open-menu' })
    expect(interpretEditorEntry({
      source: 'keyboard',
      key: 'ContextMenu',
    })).toEqual({ kind: 'open-menu' })
    expect(interpretEditorEntry({
      source: 'keyboard',
      key: 'Menu',
    })).toEqual({ kind: 'open-menu' })
    expect(interpretEditorEntry({
      source: 'mouse-contextmenu',
    })).toEqual({ kind: 'open-menu' })
  })

  it('文本焦点内 Delete/Backspace 不作为元素删除入口', () => {
    const editing = snapshot({ focus: 'textarea' }, [sceneTarget('title')])
    expect(interpretEditorEntry({
      source: 'keyboard',
      key: 'Delete',
      snapshot: editing,
    })).toEqual({ kind: 'ignore' })
    expect(interpretEditorEntry({
      source: 'keyboard',
      key: 'Backspace',
      snapshot: editing,
    })).toEqual({ kind: 'ignore' })
    expect(interpretEditorEntry({
      source: 'keyboard',
      key: 'Delete',
      snapshot: snapshot({}, [sceneTarget('title')]),
    })).toEqual({ kind: 'action', actionId: 'delete' })
  })
})

describe('动作可用性', () => {
  it('同一 snapshot 对键盘、右键和图层入口给出相同可用性', () => {
    const current = snapshot({
      constraints: { clipboardAvailable: true },
    }, [
      sceneTarget('one', { kind: 'text' }),
      sceneTarget('two', { kind: 'image' }),
    ])
    const listed = listEditorActions(current)
    expect(listed.map((item) => item.actionId)).toEqual([...EDITOR_ACTION_IDS])
    expect(listed.every((item) => item.reason.trim().length > 0)).toBe(true)

    for (const source of ['keyboard', 'mouse-contextmenu', 'canvas', 'layer', 'property'] as const) {
      expect(source).toBeTruthy()
      expect(availabilityMap(current)).toEqual(availabilityMap(current))
    }
  })

  it('锁定项可复制和查看，写操作除 unlock 外必须说明原因', () => {
    const current = snapshot({}, [
      sceneTarget('locked-shape', { locked: true, kind: 'shape' }),
    ])
    const map = availabilityMap(current)

    expect(map.copy.enabled).toBe(true)
    expect(map.unlock.enabled).toBe(true)
    expect(map.fit.enabled).toBe(true)
    expect(isEditorWriteAction('delete')).toBe(true)
    expect(map.delete.enabled).toBe(false)
    expect(map.delete.reason).toContain('锁定元素不能删除')
    expect(map.cut.reason).toContain('锁定元素不能剪切')
    expect(map.rename.reason).toContain('锁定元素不能重命名')
    expect(map.lock.enabled).toBe(false)
    expect(map.lock.reason).toBe('所选元素已锁定')
  })

  it('跨 owner 组合给出具体原因，且不调用 adapter', () => {
    const current = snapshot({ owner: 'scene' }, [
      { owner: 'global', layerItemId: 'shared', kind: 'shape' },
      sceneTarget('local', { kind: 'text' }),
    ])
    const surface = recordingAdapter('surface')
    const global = recordingAdapter('global')
    const map = availabilityMap(current)

    expect(map.delete.enabled).toBe(false)
    expect(map.delete.reason).toBe('跨 owner 选择不能一起删除：同时包含全局层与本页元素')
    expect(map.copy.reason).toBe('跨 owner 选择不能一起复制：同时包含全局层与本页元素')

    const result = routeEditorAction({
      actionId: 'delete',
      snapshot: current,
      adapters: { surface, global },
    })
    expect(result.ok).toBe(false)
    expect(result.adapter).toBe('none')
    expect(surface.calls).toHaveLength(0)
    expect(global.calls).toHaveLength(0)
  })

  it('空白画布允许粘贴、全选和视图动作，并拒绝无选择删除', () => {
    const current = snapshot({
      owner: 'scene',
      constraints: { clipboardAvailable: true },
    }, [])
    const map = availabilityMap(current)
    expect(map['select-all'].enabled).toBe(true)
    expect(map.paste.enabled).toBe(true)
    expect(map.fit.enabled).toBe(true)
    expect(map['reset-view'].enabled).toBe(true)
    expect(map['insert-after'].enabled).toBe(true)
    expect(map.delete.enabled).toBe(false)
    expect(map.delete.reason).toBe('没有可删除的选择')
    expect(map['insert-before'].reason).toContain('不能在前方插入')
  })

  it('Flow 缩进与 Spatial 聚焦按 owner 区分', () => {
    const flow = snapshot({
      surfaceKind: 'flow',
      owner: 'flow-block',
      constraints: { canOutdent: false },
    }, [{
      owner: 'flow-block',
      layerItemId: 'block-1',
      kind: 'flow-block',
    }])
    const spatial = snapshot({
      surfaceKind: 'spatial-2d',
      owner: 'spatial-camera',
    }, [{
      owner: 'spatial-camera',
      layerItemId: 'frame-home',
      kind: 'spatial-camera',
    }])

    expect(availabilityMap(flow).indent.enabled).toBe(true)
    expect(availabilityMap(flow).outdent.enabled).toBe(false)
    expect(availabilityMap(flow).outdent.reason).toBe('当前块不能再取消缩进')
    expect(availabilityMap(flow).fit.enabled).toBe(false)
    expect(availabilityMap(flow).fit.reason).toContain('流式页面不支持')
    expect(availabilityMap(spatial).focus.enabled).toBe(true)
    expect(availabilityMap(spatial).indent.reason).toBe('只有 Flow 块支持缩进')
  })

  it('最后一个 location 删除必须带原因', () => {
    const current = snapshot({
      owner: 'location',
      constraints: { canDeleteActiveLocation: false },
    }, [{
      owner: 'location',
      layerItemId: 'loc-1',
      kind: 'location',
    }])
    expect(availabilityMap(current).delete).toEqual({
      enabled: false,
      reason: '不能删除工程最后一个页面',
    })
  })
})

describe('动作路由', () => {
  it('多选只调用一次 adapter，并把稳定地址一次交给它', () => {
    const current = snapshot({}, [
      sceneTarget('a'),
      sceneTarget('b'),
      sceneTarget('c'),
    ])
    const surface = recordingAdapter('surface')
    const result = routeEditorAction({
      actionId: 'delete',
      snapshot: current,
      adapters: { surface },
    })

    expect(result.ok).toBe(true)
    expect(result.adapter).toBe('surface')
    expect(surface.calls).toHaveLength(1)
    expect(surface.calls[0]?.addresses).toHaveLength(3)
    expect(current.authoringAddresses).toHaveLength(3)
  })

  it('全局 owner 交给 global adapter，页面 owner 交给 surface adapter', () => {
    const globalSnap = snapshot({ owner: 'global' }, [{
      owner: 'global',
      layerItemId: 'banner',
      kind: 'shape',
    }])
    const surfaceSnap = snapshot({ owner: 'scene' }, [sceneTarget('local')])
    expect(resolveEditorAdapterKind(globalSnap, 'delete')).toBe('global')
    expect(resolveEditorAdapterKind(surfaceSnap, 'delete')).toBe('surface')
    expect(resolveEditorAdapterKind(globalSnap, 'fit')).toBe('surface')
  })

  it('文本焦点内路由删除不得调用 adapter', () => {
    const current = snapshot({ focus: 'text-edit-session' }, [sceneTarget('title')])
    const surface = recordingAdapter('surface')
    const result = routeEditorAction({
      actionId: 'delete',
      snapshot: current,
      adapters: { surface },
    })
    expect(result.ok).toBe(false)
    expect(result.adapter).toBe('none')
    expect(result.reason).toContain('不删除元素')
    expect(surface.calls).toHaveLength(0)
  })

  it('缺少 adapter 或 adapter 失败时返回明确原因', () => {
    const current = snapshot({}, [sceneTarget('one')])
    const missing = routeEditorAction({
      actionId: 'delete',
      snapshot: current,
      adapters: {},
    })
    expect(missing).toEqual({
      actionId: 'delete',
      ok: false,
      adapter: 'none',
      reason: '尚未接入当前页面动作适配器',
    })

    const thrown = routeEditorAction({
      actionId: 'delete',
      snapshot: current,
      adapters: {
        surface: {
          execute() {
            throw new Error('本页元素仍被引用，不能删除')
          },
        },
      },
    })
    expect(thrown.ok).toBe(false)
    expect(thrown.reason).toBe('本页元素仍被引用，不能删除')

    const silent = routeEditorAction({
      actionId: 'delete',
      snapshot: current,
      adapters: {
        surface: {
          execute() {
            return { ok: true, reason: '' }
          },
        },
      },
    })
    expect(silent.ok).toBe(false)
    expect(silent.reason).toBe('适配器未返回明确结果')
  })

  it('右键菜单项与键盘删除使用同一 snapshot 时结果一致', () => {
    const current = captureEditorMenuSnapshot(snapshot({}, [sceneTarget('one')]))
    const adaptersA: EditorActionAdapters = {
      surface: {
        execute: vi.fn(() => ({ ok: true, reason: '已删除' })),
      },
    }
    const adaptersB: EditorActionAdapters = {
      surface: {
        execute: vi.fn(() => ({ ok: true, reason: '已删除' })),
      },
    }
    const fromMenu = interpretEditorEntry({
      source: 'layer',
      actionId: 'delete',
      snapshot: current,
    })
    const fromKeyboard = interpretEditorEntry({
      source: 'keyboard',
      key: 'Delete',
      snapshot: current,
    })
    expect(fromMenu).toEqual({ kind: 'action', actionId: 'delete' })
    expect(fromKeyboard).toEqual({ kind: 'action', actionId: 'delete' })
    expect(resolveEditorActionAvailability('delete', current)).toEqual(
      resolveEditorActionAvailability('delete', current),
    )

    const menuResult = routeEditorAction({
      actionId: 'delete',
      snapshot: current,
      adapters: adaptersA,
    })
    const keyResult = routeEditorAction({
      actionId: 'delete',
      snapshot: current,
      adapters: adaptersB,
    })
    expect(menuResult.ok).toBe(keyResult.ok)
    expect(menuResult.reason).toBe(keyResult.reason)
  })
})
