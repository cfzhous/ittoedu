import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeAuthoringAddress } from '@/shared/authoringAddress'
import { SurfaceRuntimeAuthoringBridge } from '@/player/SurfaceRuntimeAuthoring'

afterEach(() => {
  document.body.replaceChildren()
})

function createBridge(
  overrides: {
    contentKeys?: string[]
    assetKeys?: string[]
    mode?: 'inspect' | 'playback'
  } = {},
) {
  const root = document.createElement('div')
  document.body.append(root)
  const reportHit = vi.fn()
  const contentKeys = overrides.contentKeys ?? ['title/a~b']
  const assetKeys = overrides.assetKeys ?? ['hero/x~y']
  const bridge = new SurfaceRuntimeAuthoringBridge({
    root,
    contentKeys: () => contentKeys,
    assetKeys: () => assetKeys,
    reportHit,
  }, overrides.mode ?? 'inspect')
  return { root, bridge, reportHit, contentKeys, assetKeys }
}

describe('SurfaceRuntimeAuthoringBridge', () => {
  it('声明式 DOM 命中：field 稳定、hitId 仅限当前会话', () => {
    const { root, bridge, reportHit } = createBridge()
    const text = document.createElement('p')
    text.dataset.coursewareContentKey = 'title/a~b'
    root.appendChild(text)

    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).toHaveBeenCalledOnce()
    const detail = reportHit.mock.calls[0]![0]
    expect(detail.field).toBe('runtime/content/values/title~1a~0b')
    expect(detail.hitId).toMatch(/^surface-runtime:text:/)
    expect(detail.targetKind).toBe('text')

    const address = makeAuthoringAddress({
      projectId: 'proj',
      scope: 'scene',
      surfaceId: 'surface',
      sceneId: 'scene',
      carrier: 'runtime',
      layerItemId: 'runtime-item',
      field: detail.field,
    })
    expect(address).toContain('field=runtime%2Fcontent%2Fvalues%2Ftitle~1a~0b')
    expect(address).not.toMatch(/hitId/i)

    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).toHaveBeenCalledTimes(2)
    expect(reportHit.mock.calls[1]![0].hitId).toBe(detail.hitId)
    expect(reportHit.mock.calls[1]![0].field).toBe(detail.field)

    bridge.destroy()
  })

  it('registerAsset 显式 bounds 与 registerText 元素目标可命中', () => {
    const { root, bridge, reportHit } = createBridge()
    const disposeAsset = bridge.registerAsset({
      key: 'hero/x~y',
      label: '主图',
      bounds: { x: 8, y: 9, width: 40, height: 30 },
    })
    bridge.invalidate()
    const textEl = document.createElement('span')
    textEl.dataset.coursewareContentKey = 'title/a~b'
    root.appendChild(textEl)
    const disposeText = bridge.registerText({ key: 'title/a~b', element: textEl })

    const bounds = root.querySelector<HTMLElement>('[data-surface-runtime-target-key="hero/x~y"]')!
    expect(bounds.style.left).toBe('8px')
    expect(bounds.style.top).toBe('9px')
    bounds.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    textEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

    expect(reportHit).toHaveBeenCalledWith(expect.objectContaining({
      field: 'runtime/assets/hero~1x~0y/assetId',
      hitId: expect.stringMatching(/^surface-runtime:asset:/),
      targetKind: 'asset',
    }))
    expect(reportHit).toHaveBeenCalledWith(expect.objectContaining({
      field: 'runtime/content/values/title~1a~0b',
      targetKind: 'text',
    }))

    disposeAsset()
    disposeText()
    bridge.destroy()
  })

  it('拒绝未知 key、空 key 与 dom.root 外元素', () => {
    const { root, bridge } = createBridge()
    expect(() => bridge.registerText({ key: 'missing', element: document.createElement('span') }))
      .toThrow(/Unknown Surface Runtime content\.values key missing/)
    expect(() => bridge.registerAsset({ key: '  ', bounds: { x: 0, y: 0, width: 1, height: 1 } }))
      .toThrow(/keys cannot be empty/)

    const outside = document.createElement('div')
    document.body.append(outside)
    expect(() => bridge.registerText({ key: 'title/a~b', element: outside }))
      .toThrow(/outside dom\.root/)
    bridge.destroy()
  })

  it('destroy 与会话隔离：清理监听且后续命中不再上报', () => {
    const { root, bridge, reportHit } = createBridge()
    const text = document.createElement('p')
    text.dataset.coursewareContentKey = 'title/a~b'
    root.appendChild(text)

    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).toHaveBeenCalledOnce()
    bridge.destroy()
    expect(root.querySelector('.surface-runtime-authoring-targets')).toBeNull()

    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).toHaveBeenCalledOnce()
    expect(() => bridge.registerText({ key: 'title/a~b', element: text }))
      .toThrow(/destroyed/)
  })

  it('不同桥实例为同一 key 分配不同 hitId', () => {
    const reportHitA = vi.fn()
    const reportHitB = vi.fn()
    const rootA = document.createElement('div')
    const rootB = document.createElement('div')
    document.body.append(rootA, rootB)
    const bridgeA = new SurfaceRuntimeAuthoringBridge({
      root: rootA,
      contentKeys: () => ['title/a~b'],
      assetKeys: () => [],
      reportHit: reportHitA,
    }, 'inspect')
    const bridgeB = new SurfaceRuntimeAuthoringBridge({
      root: rootB,
      contentKeys: () => ['title/a~b'],
      assetKeys: () => [],
      reportHit: reportHitB,
    }, 'inspect')

    const textA = document.createElement('p')
    textA.dataset.coursewareContentKey = 'title/a~b'
    rootA.appendChild(textA)
    const textB = document.createElement('p')
    textB.dataset.coursewareContentKey = 'title/a~b'
    rootB.appendChild(textB)
    textA.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    textB.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

    const hitIdA = reportHitA.mock.calls[0]![0].hitId
    const hitIdB = reportHitB.mock.calls[0]![0].hitId
    expect(hitIdA).not.toBe(hitIdB)
    expect(reportHitA.mock.calls[0]![0].field).toBe(reportHitB.mock.calls[0]![0].field)

    bridgeA.destroy()
    bridgeB.destroy()
  })

  it('playback 模式不命中；setMode 切换 inspect 后恢复', () => {
    const { root, bridge, reportHit } = createBridge({ mode: 'playback' })
    const text = document.createElement('p')
    text.dataset.coursewareContentKey = 'title/a~b'
    root.appendChild(text)
    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).not.toHaveBeenCalled()

    bridge.setMode('inspect')
    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).toHaveBeenCalledOnce()

    bridge.setMode('playback')
    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).toHaveBeenCalledOnce()
    bridge.destroy()
  })

  it('invalidate 重新挂载 bounds 层并更新动态 bounds', () => {
    const { root, bridge } = createBridge()
    let width = 20
    bridge.registerAsset({
      key: 'hero/x~y',
      bounds: () => ({ x: 1, y: 2, width: width, height: 10 }),
    })
    bridge.invalidate()
    const bounds = root.querySelector<HTMLElement>('[data-surface-runtime-target-key="hero/x~y"]')!
    expect(bounds.style.width).toBe('20px')

    root.replaceChildren(document.createElement('span'))
    width = 44
    bridge.invalidate()
    const restored = root.querySelector<HTMLElement>('[data-surface-runtime-target-key="hero/x~y"]')!
    expect(restored).not.toBeNull()
    expect(restored.style.width).toBe('44px')
    bridge.destroy()
  })
})
