import type * as Phaser from 'phaser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ComponentCreateContextV4,
  ComponentDefinitionV4,
  ComponentPackageData,
  ComponentRenderMode,
  ExportPayload,
} from '../../src/shared/componentTypes'
import type { ExternalComponentNode } from '../../src/shared/projectTypes'

const domHostMocks = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('phaser', () => ({
  Geom: {
    Rectangle: class Rectangle {},
  },
}))

vi.mock('../../src/shared/phaserDomComponentHost', () => ({
  createPhaserDomComponentMount: domHostMocks.create,
}))

import {
  renderNode,
  type RenderNodeContext,
} from '../../src/player/renderNode'

type Listener = (...args: unknown[]) => void

class FakeGameObject {
  active = true
  visible = true
  alpha = 1
  depth = 0
  x = 0
  y = 0
  width = 0
  height = 0
  parentContainer: FakeContainer | null = null
  readonly emit = vi.fn()

  setName(): this { return this }
  setDepth(value: number): this { this.depth = value; return this }
  setAngle(): this { return this }
  setAlpha(value: number): this { this.alpha = value; return this }
  setVisible(value: boolean): this { this.visible = value; return this }
  setOrigin(): this { return this }
  setPosition(x: number, y: number): this { this.x = x; this.y = y; return this }
  setSize(width: number, height: number): this {
    this.width = width
    this.height = height
    return this
  }
  destroy(): void { this.active = false }
}

class FakeContainer extends FakeGameObject {
  readonly list: FakeGameObject[] = []

  add(children: FakeGameObject | FakeGameObject[]): this {
    for (const child of Array.isArray(children) ? children : [children]) {
      if (!this.list.includes(child)) this.list.push(child)
      child.parentContainer = this
    }
    return this
  }

  override destroy(): void {
    super.destroy()
    for (const child of this.list) child.destroy()
  }
}

class FakeGraphics extends FakeGameObject {
  clear(): this { return this }
  fillStyle(): this { return this }
  fillRoundedRect(): this { return this }
  lineStyle(): this { return this }
  strokeRoundedRect(): this { return this }
}

class FakeText extends FakeGameObject {
  setText(): this { return this }
  setWordWrapWidth(): this { return this }
}

function sceneHarness(): Phaser.Scene {
  const children: FakeGameObject[] = []
  const addToDisplayList = <T extends FakeGameObject>(object: T): T => {
    children.push(object)
    return object
  }
  return {
    add: {
      container: (x = 0, y = 0) => addToDisplayList(
        new FakeContainer().setPosition(x, y),
      ),
      graphics: () => addToDisplayList(new FakeGraphics()),
      text: () => addToDisplayList(new FakeText()),
    },
    children: { list: children },
    tweens: {
      killTweensOf: vi.fn(),
      add: vi.fn(),
    },
  } as unknown as Phaser.Scene
}

function packageData(renderMode: ComponentRenderMode): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 4,
      runtimeApiVersion: 4,
      id: `com.example.${renderMode}`,
      name: `${renderMode} component`,
      version: '4.0.0',
      entry: 'runtime.js',
      defaultSize: { width: 320, height: 180 },
      minSize: { width: 16, height: 16 },
      preserveAspectRatio: false,
      assets: {},
      defaultProps: {
        title: '可编辑标题',
        previewPageId: 'intro',
      },
      editor: {
        properties: [{ key: 'title', label: '标题', type: 'text' }],
        pages: [
          { id: 'intro', label: '导入页', propertyKeys: ['title'] },
          { id: 'detail', label: '讲解页', propertyKeys: ['title'] },
        ],
        defaultPageId: 'intro',
        previewPageProp: 'previewPageId',
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
    id: `node-${packageId}`,
    name: '测试组件',
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

function mountHarness() {
  const host = document.createElement('div')
  const root = document.createElement('div')
  host.append(root)
  document.body.append(host)
  const gameObject = new FakeGameObject()
  return {
    root,
    host,
    gameObject,
    resize: vi.fn(),
    setInteractive: vi.fn(),
    setSelected: vi.fn(),
    sync: vi.fn(),
    destroy: vi.fn(() => {
      gameObject.destroy()
      host.remove()
    }),
  }
}

function renderComponent(
  renderMode: ComponentRenderMode,
  create: ComponentDefinitionV4['create'],
  contextOverrides: Partial<RenderNodeContext> = {},
  nodeOverrides: Partial<ExternalComponentNode> = {},
) {
  const component = packageData(renderMode)
  const definition: ComponentDefinitionV4 = {
    id: component.manifest.id,
    runtimeApiVersion: 4,
    create,
  }
  const registry = {
    get: vi.fn(() => definition),
    getLoadError: vi.fn(() => undefined),
  }
  const payload = {
    project: {
      canvas: { width: 1280, height: 720 },
    },
    assets: {},
    components: { [component.manifest.id]: component },
  } as unknown as ExportPayload
  const context: RenderNodeContext = {
    payload,
    registry: registry as never,
    actions: {
      goToScene: () => false,
      nextScene: () => false,
      previousScene: () => false,
      replayScene: () => false,
      restartCourse: () => false,
    },
    scope: 'scene',
    mode: 'preview',
    sceneId: 'scene-1',
    textureKey: (assetId) => assetId,
    ...contextOverrides,
  }
  const scene = sceneHarness()
  const node = {
    ...componentNode(component.manifest.id),
    ...nodeOverrides,
  }
  const handle = renderNode(scene, node, 1, context)
  return { component, context, definition, handle, node, registry, scene }
}

async function flushAuthoringTargets(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('Player Component API 4 renderer capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.replaceChildren()
    domHostMocks.create.mockImplementation(() => mountHarness())
  })

  it.each([
    ['phaser', true, false],
    ['dom', false, true],
    ['hybrid', true, true],
  ] as const)(
    '%s 组件只获得 manifest 声明的渲染面',
    (renderMode, hasPhaser, hasDom) => {
      let received: ComponentCreateContextV4 | undefined
      const { handle } = renderComponent(renderMode, (context) => {
        received = context
        return { destroy() {} }
      })

      expect(received?.renderMode).toBe(renderMode)
      expect(received && 'phaser' in received).toBe(hasPhaser)
      expect(received && 'dom' in received).toBe(hasDom)
      expect(received && 'Phaser' in received).toBe(false)
      expect(received && 'root' in received).toBe(false)
      expect(domHostMocks.create).toHaveBeenCalledTimes(hasDom ? 1 : 0)

      handle.destroy()
      expect(document.body).toBeEmptyDOMElement()
    },
  )

  it('只在 authoring Player 注入 editor，并把组件完整切到 edit 模式', async () => {
    let received: ComponentCreateContextV4 | undefined
    const setMode = vi.fn()
    const onTargetsChanged = vi.fn()
    const { handle } = renderComponent('phaser', (context) => {
      received = context
      context.editor?.registerTextRegion({
        key: 'title',
        getBounds: () => ({ x: 20, y: 12, width: 180, height: 36 }),
      })
      return { setMode, destroy() {} }
    }, {
      authoring: true,
      onComponentAuthoringTargetsChanged: onTargetsChanged,
    })

    await flushAuthoringTargets()
    expect(received?.mode).toBe('edit')
    expect(received?.editor).toBeDefined()
    expect(setMode).toHaveBeenCalledWith('edit')
    expect(onTargetsChanged).toHaveBeenLastCalledWith(expect.objectContaining({
      scope: 'scene',
      sceneId: 'scene-1',
      targets: [expect.objectContaining({
        kind: 'component-text',
        key: 'title',
      })],
    }))

    handle.destroy()
    expect(onTargetsChanged).toHaveBeenLastCalledWith(expect.objectContaining({
      targets: [],
    }))
  })

  it('按 previewPageProp 初始化多页 editorState，并在 props 更新时同步', () => {
    let received: ComponentCreateContextV4 | undefined
    const updateProps = vi.fn()
    const setEditorState = vi.fn()
    const { handle, node } = renderComponent('phaser', (context) => {
      received = context
      return { updateProps, setEditorState, destroy() {} }
    }, {
      authoring: true,
    }, {
      props: { previewPageId: 'detail' },
    })

    expect(received?.editorState).toEqual({ pageId: 'detail' })

    const introNode = {
      ...node,
      props: { previewPageId: 'intro' },
    }
    handle.update(introNode)
    expect(updateProps).toHaveBeenLastCalledWith(expect.objectContaining({
      previewPageId: 'intro',
    }))
    expect(setEditorState).toHaveBeenCalledOnce()
    expect(setEditorState).toHaveBeenLastCalledWith({ pageId: 'intro' })

    handle.update(introNode)
    expect(setEditorState).toHaveBeenCalledOnce()
    handle.destroy()
  })

  it.each([
    ['preview', 'preview'],
    ['capture', 'capture'],
  ] as const)(
    '%s Player 即使收到回调也不创建组件 editor',
    async (mode, expectedMode) => {
      let received: ComponentCreateContextV4 | undefined
      const onTargetsChanged = vi.fn()
      const { handle } = renderComponent('phaser', (context) => {
        received = context
        return { destroy() {} }
      }, {
        mode,
        onComponentAuthoringTargetsChanged: onTargetsChanged,
      })

      await flushAuthoringTargets()
      expect(received?.mode).toBe(expectedMode)
      expect(received?.editor).toBeUndefined()
      expect(onTargetsChanged).not.toHaveBeenCalled()
      handle.destroy()
    },
  )

  it('生命周期失败时立即撤销已发布目标，销毁不会重复发布', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onTargetsChanged = vi.fn()
    const { handle, node } = renderComponent('phaser', (context) => {
      context.editor?.registerTextRegion({
        key: 'title',
        getBounds: () => ({ x: 20, y: 12, width: 180, height: 36 }),
      })
      return {
        resize(width) {
          if (width !== 320) throw new Error('authoring resize failed')
        },
        destroy() {},
      }
    }, {
      authoring: true,
      onComponentAuthoringTargetsChanged: onTargetsChanged,
    })

    await flushAuthoringTargets()
    expect(onTargetsChanged).toHaveBeenCalledTimes(1)
    handle.update({ ...node, width: 360 })
    expect(onTargetsChanged).toHaveBeenCalledTimes(2)
    expect(onTargetsChanged).toHaveBeenLastCalledWith(expect.objectContaining({
      targets: [],
    }))

    handle.destroy()
    expect(onTargetsChanged).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })

  it('销毁 DOM 组件时同时销毁宿主，不遗留页面节点', () => {
    const mount = mountHarness()
    mount.host.setAttribute('data-test-component-host', '')
    domHostMocks.create.mockReturnValueOnce(mount)
    const destroy = vi.fn()
    const { handle } = renderComponent('dom', () => ({ destroy }))

    expect(document.body.contains(mount.host)).toBe(true)
    handle.destroy()

    expect(destroy).toHaveBeenCalledOnce()
    expect(mount.destroy).toHaveBeenCalledOnce()
    expect(mount.gameObject.active).toBe(false)
    expect(document.body.contains(mount.host)).toBe(false)
  })

  it('合成作者、全局、页面与入退场可见性，tab 恢复不会复活已退场组件', () => {
    const setVisible = vi.fn()
    const { handle } = renderComponent('dom', () => ({
      setVisible,
      destroy() {},
    }))
    const root = handle.root as unknown as FakeGameObject

    handle.setMotionVisible?.(false)
    expect(root.visible).toBe(false)
    expect(setVisible).toHaveBeenLastCalledWith(false)

    handle.setPageVisible?.(false)
    handle.setPageVisible?.(true)
    expect(root.visible).toBe(false)
    expect(setVisible).toHaveBeenLastCalledWith(false)

    handle.setMotionVisible?.(true)
    expect(root.visible).toBe(true)
    expect(setVisible).toHaveBeenLastCalledWith(true)

    handle.setHostVisible?.(false)
    handle.setPageVisible?.(false)
    handle.setPageVisible?.(true)
    expect(root.visible).toBe(false)
    expect(setVisible).toHaveBeenLastCalledWith(false)
    handle.destroy()
  })

  it('运行期失败后销毁 DOM 挂载面，且捕获就绪传播既有失败', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mount = mountHarness()
    domHostMocks.create.mockReturnValueOnce(mount)
    const { handle } = renderComponent('dom', () => ({
      resize() { throw new Error('resize failed before capture') },
      destroy() {},
    }))

    expect(mount.destroy).toHaveBeenCalledOnce()
    expect(mount.gameObject.active).toBe(false)
    handle.setPageVisible?.(false)
    handle.setPageVisible?.(true)
    expect(mount.destroy).toHaveBeenCalledOnce()
    await expect(handle.prepareCapture?.()).rejects.toThrow(
      'resize failed before capture',
    )

    handle.destroy()
    expect(mount.destroy).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })

  it('组件 create 失败占位在捕获屏障上拒绝，不会把红框当成成功快照', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mount = mountHarness()
    domHostMocks.create.mockReturnValueOnce(mount)
    const { handle } = renderComponent('dom', () => {
      throw new Error('create failed for capture')
    })

    expect(mount.destroy).toHaveBeenCalledOnce()
    await expect(handle.prepareCapture?.()).rejects.toThrow(
      'create failed for capture',
    )
    handle.destroy()
    consoleError.mockRestore()
  })

  it.each([
    ['missing', '工程中找不到对应的组件包'],
    ['scope', '未声明支持全局层'],
    ['registration', '组件没有完成注册'],
  ] as const)('%s 预检失败占位也会拒绝捕获', async (failure, message) => {
    const component = packageData('dom')
    const node = componentNode(component.manifest.id)
    const definition: ComponentDefinitionV4 = {
      id: component.manifest.id,
      runtimeApiVersion: 4,
      create: () => ({ destroy() {} }),
    }
    const context: RenderNodeContext = {
      payload: {
        project: { canvas: { width: 1280, height: 720 } },
        assets: {},
        components: failure === 'missing'
          ? {}
          : { [component.manifest.id]: component },
      } as unknown as ExportPayload,
      registry: {
        get: vi.fn(() => failure === 'registration' ? undefined : definition),
        getLoadError: vi.fn(() => undefined),
      } as never,
      actions: {
        goToScene: () => false,
        nextScene: () => false,
        previousScene: () => false,
        replayScene: () => false,
        restartCourse: () => false,
      },
      scope: failure === 'scope' ? 'global' : 'scene',
      mode: 'capture',
      textureKey: (assetId) => assetId,
    }
    const handle = renderNode(sceneHarness(), node, 1, context)

    await expect(handle.prepareCapture?.()).rejects.toThrow(message)
    expect(domHostMocks.create).not.toHaveBeenCalled()
    handle.destroy()
  })

  it('先执行 prepareCapture，再等待 create/prepare 阶段递归登记的任务', async () => {
    const order: string[] = []
    let resolveInitial: (() => void) | undefined
    let received: ComponentCreateContextV4 | undefined
    const mount = mountHarness()
    domHostMocks.create.mockReturnValueOnce(mount)
    const { handle } = renderComponent('dom', (context) => {
      received = context
      context.capture.waitUntil(new Promise<void>((resolve) => {
        resolveInitial = () => {
          order.push('initial')
          resolve()
        }
      }).then(() => {
        context.capture.waitUntil(Promise.resolve().then(() => {
          order.push('nested')
        }))
      }))
      return {
        prepareCapture() {
          order.push('prepare')
          context.capture.waitUntil(Promise.resolve().then(() => {
            order.push('prepare-task')
          }))
        },
        destroy() {},
      }
    })

    expect(received).toBeDefined()
    const snapshotSurfaces = vi.fn()
    const pending = handle.prepareCapture?.(snapshotSurfaces)
    await Promise.resolve()
    expect(order).toEqual([])
    resolveInitial?.()
    await expect(pending).resolves.toBeUndefined()
    expect(order).toEqual(['initial', 'nested', 'prepare', 'prepare-task'])
    expect(snapshotSurfaces).toHaveBeenCalledOnce()
    expect(snapshotSurfaces).toHaveBeenCalledWith([mount.host])
    handle.destroy()
  })

  it('capture.waitUntil 失败会持久阻断后续捕获', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mount = mountHarness()
    domHostMocks.create.mockReturnValueOnce(mount)
    const { handle } = renderComponent('dom', (context) => {
      context.capture.waitUntil(Promise.reject(new Error('texture decode failed')))
      return { destroy() {} }
    })

    await expect(handle.prepareCapture?.()).rejects.toThrow(
      'texture decode failed',
    )
    expect(mount.destroy).toHaveBeenCalledOnce()
    await expect(handle.prepareCapture?.()).rejects.toThrow(
      'texture decode failed',
    )

    handle.destroy()
    consoleError.mockRestore()
  })

  it('prepareCapture 失败会向导出链路传播', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handle } = renderComponent('phaser', () => ({
      async prepareCapture() {
        throw new Error('component capture failed')
      },
      destroy() {},
    }))

    await expect(handle.prepareCapture?.()).rejects.toThrow(
      'component capture failed',
    )
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('prepareCapture失败'),
      expect.any(Error),
    )
    handle.destroy()
    consoleError.mockRestore()
  })
})
