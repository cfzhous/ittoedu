import type * as Phaser from 'phaser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentPackageData } from '../../src/shared/componentTypes'
import type { ExternalComponentNode } from '../../src/shared/projectTypes'

const domHostMocks = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('phaser', () => ({
  Geom: {
    Rectangle: class Rectangle {},
  },
  Math: {
    DegToRad: (value: number) => value * Math.PI / 180,
  },
}))

vi.mock('../../src/shared/phaserDomComponentHost', () => ({
  createPhaserDomComponentMount: domHostMocks.create,
}))

import { ExternalComponentNodeAdapter } from '../../src/renderer/phaser/adapters/ExternalComponentNodeAdapter'

interface FakeGameObject {
  active: boolean
  visible: boolean
  alpha: number
  x: number
  y: number
  input?: {
    enabled: boolean
    cursor: string
    hitArea?: unknown
  }
  setVisible(value: boolean): FakeGameObject
  setAlpha(value: number): FakeGameObject
  setAngle(value: number): FakeGameObject
  setPosition(x: number, y: number): FakeGameObject
  setScale(x: number, y?: number): FakeGameObject
  setOrigin(value: number): FakeGameObject
  setInteractive(config?: unknown): FakeGameObject
  setSize(width: number, height: number): FakeGameObject
  setDepth(depth: number): FakeGameObject
  add(children: unknown): FakeGameObject
  destroy(fromScene?: boolean): void
}

function gameObject(x = 0, y = 0): FakeGameObject {
  const target = {
    active: true,
    visible: true,
    alpha: 1,
    x,
    y,
    input: { enabled: true, cursor: 'move' },
  } as FakeGameObject
  target.setVisible = vi.fn((value) => {
    target.visible = value
    return target
  })
  target.setAlpha = vi.fn((value) => {
    target.alpha = value
    return target
  })
  target.setAngle = vi.fn(() => target)
  target.setPosition = vi.fn((nextX, nextY) => {
    target.x = nextX
    target.y = nextY
    return target
  })
  target.setScale = vi.fn(() => target)
  target.setOrigin = vi.fn(() => target)
  target.setInteractive = vi.fn(() => target)
  target.setSize = vi.fn(() => target)
  target.setDepth = vi.fn(() => target)
  target.add = vi.fn(() => target)
  target.destroy = vi.fn(() => {
    target.active = false
  })
  return target
}

function setupScene(): Phaser.Scene {
  const zone = gameObject()
  const scene = {
    add: {
      container: vi.fn((x = 0, y = 0) => gameObject(x, y)),
      zone: vi.fn(() => zone),
      graphics: vi.fn(() => {
        const target = gameObject() as FakeGameObject & {
          clear(): FakeGameObject
          fillStyle(color: number, alpha: number): FakeGameObject
          fillRoundedRect(...args: number[]): FakeGameObject
          lineStyle(...args: number[]): FakeGameObject
          strokeRoundedRect(...args: number[]): FakeGameObject
        }
        target.clear = vi.fn(() => target)
        target.fillStyle = vi.fn(() => target)
        target.fillRoundedRect = vi.fn(() => target)
        target.lineStyle = vi.fn(() => target)
        target.strokeRoundedRect = vi.fn(() => target)
        return target
      }),
      text: vi.fn(() => {
        const target = gameObject() as FakeGameObject & {
          setText(value: string): FakeGameObject
          setWordWrapWidth(value: number): FakeGameObject
        }
        target.setText = vi.fn(() => target)
        target.setWordWrapWidth = vi.fn(() => target)
        return target
      }),
    },
    tweens: {
      killTweensOf: vi.fn(),
      add: vi.fn(),
    },
    time: {
      delayedCall: vi.fn(() => ({ remove: vi.fn() })),
    },
  }
  return scene as unknown as Phaser.Scene
}

function packageData(renderMode: 'phaser' | 'dom' | 'hybrid'): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 4,
      runtimeApiVersion: 4,
      id: `com.example.${renderMode}`,
      name: renderMode,
      version: '4.0.0',
      entry: 'runtime.js',
      defaultSize: { width: 320, height: 180 },
      minSize: { width: 16, height: 16 },
      preserveAspectRatio: false,
      assets: {},
      defaultProps: { title: '默认标题' },
      editor: {
        properties: [{ key: 'title', label: '标题', type: 'text' }],
      },
      supportedScopes: ['scene'],
      renderMode,
    },
    runtimeSource: '',
    files: {},
  }
}

function componentNode(packageId: string): ExternalComponentNode {
  return {
    id: 'component-node',
    name: '组件',
    type: 'external-component',
    x: 10,
    y: 20,
    width: 320,
    height: 180,
    rotation: 0,
    opacity: 1,
    visible: true,
    playbackInitialVisibility: 'inherit',
    locked: false,
    component: { packageId, version: '4.0.0' },
    props: {},
  }
}

describe('ExternalComponentNodeAdapter Component API 4 DOM host', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('为 hybrid 组件创建指针惰性宿主，并同步选中、更新和销毁', () => {
    const domRoot = document.createElement('div')
    const host = document.createElement('div')
    const mount = {
      root: domRoot,
      host,
      gameObject: gameObject(),
      resize: vi.fn(),
      setInteractive: vi.fn(),
      setSelected: vi.fn(),
      sync: vi.fn(),
      destroy: vi.fn(),
    }
    domHostMocks.create.mockReturnValue(mount)

    const lifecycle = {
      resize: vi.fn(),
      updateProps: vi.fn(),
      setEditorState: vi.fn(),
      setVisible: vi.fn(),
      destroy: vi.fn(),
      getFailure: vi.fn(() => null),
      isFailed: vi.fn(() => false),
    }
    const registry = { createInstance: vi.fn(() => lifecycle) }
    const component = packageData('hybrid')
    const node = componentNode(component.manifest.id)
    const scene = setupScene()
    const adapter = new ExternalComponentNodeAdapter(
      scene,
      node,
      component,
      registry as never,
      {},
    )

    expect(domHostMocks.create).toHaveBeenCalledWith(
      scene,
      expect.anything(),
      expect.objectContaining({
        interactive: false,
        instanceId: node.id,
        width: 320,
        height: 180,
      }),
    )
    expect(registry.createInstance.mock.calls[0]?.at(-2)).toBe(domRoot)
    expect(registry.createInstance.mock.calls[0]?.at(-1)).toBeTypeOf('function')
    expect(lifecycle.setVisible).toHaveBeenCalledWith(true)
    expect(mount.resize).toHaveBeenCalledWith(320, 180)

    adapter.setSelected(true)
    expect(mount.setSelected).toHaveBeenCalledWith(true)

    adapter.update({
      ...node,
      width: 480,
      height: 270,
      visible: false,
      props: { title: '更新' },
    })
    expect(mount.resize).toHaveBeenLastCalledWith(480, 270)
    expect(lifecycle.updateProps).toHaveBeenCalledWith({ title: '更新' })
    expect(lifecycle.setVisible).toHaveBeenLastCalledWith(false)
    expect(mount.sync).toHaveBeenCalled()

    adapter.destroy()
    expect(lifecycle.destroy).toHaveBeenCalledTimes(1)
    expect(mount.destroy).toHaveBeenCalledTimes(1)
  })

  it('不为纯 Phaser 组件创建 DOM 宿主', () => {
    const lifecycle = {
      destroy: vi.fn(),
      getFailure: vi.fn(() => null),
      isFailed: vi.fn(() => false),
    }
    const registry = { createInstance: vi.fn(() => lifecycle) }
    const component = packageData('phaser')
    const adapter = new ExternalComponentNodeAdapter(
      setupScene(),
      componentNode(component.manifest.id),
      component,
      registry as never,
      {},
    )

    expect(domHostMocks.create).not.toHaveBeenCalled()
    expect(registry.createInstance.mock.calls[0]?.at(-2)).toBeUndefined()
    expect(registry.createInstance.mock.calls[0]?.at(-1)).toBeTypeOf('function')
    adapter.destroy()
  })

  it('只命中 DOM 组件显式标记且已在 schema 公开的文字区域', () => {
    const domRoot = document.createElement('div')
    const editable = document.createElement('span')
    editable.dataset.coursewareEditKey = 'title'
    editable.dataset.coursewareEditLabel = '组件标题'
    domRoot.append(editable)
    vi.spyOn(domRoot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 180,
      width: 320,
      height: 180,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(editable, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 30,
      left: 20,
      top: 30,
      right: 140,
      bottom: 74,
      width: 120,
      height: 44,
      toJSON: () => ({}),
    } as DOMRect)
    const mount = {
      root: domRoot,
      host: document.createElement('div'),
      gameObject: gameObject(),
      resize: vi.fn(),
      setInteractive: vi.fn(),
      setSelected: vi.fn(),
      sync: vi.fn(),
      destroy: vi.fn(),
    }
    domHostMocks.create.mockReturnValue(mount)
    const lifecycle = {
      destroy: vi.fn(),
      getFailure: vi.fn(() => null),
      isFailed: vi.fn(() => false),
    }
    const component = packageData('dom')
    const adapter = new ExternalComponentNodeAdapter(
      setupScene(),
      componentNode(component.manifest.id),
      component,
      { createInstance: vi.fn(() => lifecycle) } as never,
      {},
    )

    expect(adapter.findEditableTextAt(10 + 60, 20 + 50)).toMatchObject({
      nodeId: 'component-node',
      key: 'title',
      label: '组件标题',
      bounds: { x: 20, y: 30, width: 120, height: 44 },
    })
    expect(adapter.findEditableTextAt(10 + 260, 20 + 120)).toBeNull()
    adapter.destroy()
  })

  it('命中 Phaser 组件通过 editor bridge 登记的文字区域', () => {
    const lifecycle = {
      destroy: vi.fn(),
      getFailure: vi.fn(() => null),
      isFailed: vi.fn(() => false),
    }
    const registry = {
      createInstance: vi.fn((...args: unknown[]) => {
        const register = args.at(-1) as (
          region: {
            key: string
            label: string
            getBounds(): { x: number; y: number; width: number; height: number }
          },
        ) => () => void
        register({
          key: 'title',
          label: 'Phaser 标题',
          getBounds: () => ({ x: 40, y: 50, width: 180, height: 48 }),
        })
        return lifecycle
      }),
    }
    const component = packageData('phaser')
    const adapter = new ExternalComponentNodeAdapter(
      setupScene(),
      componentNode(component.manifest.id),
      component,
      registry as never,
      {},
    )

    expect(adapter.findEditableTextAt(10 + 100, 20 + 70)).toMatchObject({
      key: 'title',
      label: 'Phaser 标题',
      bounds: { x: 40, y: 50, width: 180, height: 48 },
    })
    adapter.destroy()
  })

  it('编辑器组件失败后销毁 DOM 挂载面，后续重绘不会将它复活', () => {
    const mount = {
      root: document.createElement('div'),
      host: document.createElement('div'),
      gameObject: gameObject(),
      resize: vi.fn(),
      setInteractive: vi.fn(),
      setSelected: vi.fn(),
      sync: vi.fn(),
      destroy: vi.fn(),
    }
    domHostMocks.create.mockReturnValue(mount)
    const lifecycle = {
      resize: vi.fn(),
      updateProps: vi.fn(),
      setEditorState: vi.fn(),
      setVisible: vi.fn(),
      destroy: vi.fn(),
      getFailure: vi.fn(() => null),
      isFailed: vi.fn(() => false),
    }
    let reportFailure: ((failure: {
      phase: 'resize'
      error: Error
      message: string
    }) => void) | undefined
    const registry = {
      createInstance: vi.fn((...args: unknown[]) => {
        reportFailure = args[7] as typeof reportFailure
        return lifecycle
      }),
    }
    const component = packageData('dom')
    const node = componentNode(component.manifest.id)
    const adapter = new ExternalComponentNodeAdapter(
      setupScene(),
      node,
      component,
      registry as never,
      {},
    )
    const syncCountBeforeFailure = mount.sync.mock.calls.length

    reportFailure?.({
      phase: 'resize',
      error: new Error('editor resize failed'),
      message: 'editor resize failed',
    })
    expect(mount.destroy).toHaveBeenCalledOnce()

    adapter.update({ ...node, width: 480, height: 270 })
    expect(mount.sync).toHaveBeenCalledTimes(syncCountBeforeFailure)
    expect(mount.destroy).toHaveBeenCalledOnce()
    adapter.destroy()
    expect(mount.destroy).toHaveBeenCalledOnce()
  })
})
