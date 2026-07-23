import type * as Phaser from 'phaser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComponentRegistry } from '../../src/renderer/phaser/ComponentRegistry'
import type {
  ComponentCreateContext,
  ComponentCreateContextV4,
  ComponentDefinition,
  ComponentPackageData,
} from '../../src/shared/componentTypes'
import type {
  ExternalComponentNode,
  RuntimeAssetMap,
} from '../../src/shared/projectTypes'

vi.mock('phaser', () => ({}))

function componentPackage(id: string): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 1,
      runtimeApiVersion: 1,
      id,
      name: id,
      version: '1.0.0',
      entry: 'runtime.js',
      defaultSize: { width: 320, height: 180 },
      minSize: { width: 16, height: 16 },
      preserveAspectRatio: true,
      assets: {},
      defaultProps: { fromDefault: true, precedence: 'default' },
    },
    runtimeSource: `runtime:${id}`,
    files: {},
  }
}

function componentNode(packageId: string): ExternalComponentNode {
  return {
    id: 'node-1',
    name: '组件',
    type: 'external-component',
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    rotation: 0,
    opacity: 1,
    visible: true,
    playbackInitialVisibility: 'inherit',
    locked: false,
    component: { packageId, version: '1.0.0' },
    props: { precedence: 'node' },
  }
}

describe('编辑器 ComponentRegistry', () => {
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:test-${Math.random()}`),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectUrl,
    })
    delete window.CoursewareComponent
  })

  it('坏组件不会阻断后续组件，并在工程切换时清理定义', async () => {
    const badId = 'com.example.bad'
    const validId = 'com.example.valid'
    let attempt = 0
    let receivedProps: Record<string, unknown> | undefined
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      const node = nodes[0]
      if (!(node instanceof HTMLScriptElement)) return
      attempt += 1
      queueMicrotask(() => {
        if (attempt === 1) {
          node.onerror?.call(node, new Event('error'))
          return
        }
        const definition: ComponentDefinition = {
          id: validId,
          runtimeApiVersion: 1,
          create: (context) => {
            receivedProps = context.props
            return { destroy() {} }
          },
        }
        window.CoursewareComponent?.define(definition)
        node.onload?.call(node, new Event('load'))
      })
    })

    const registry = new ComponentRegistry()
    const bad = componentPackage(badId)
    const valid = componentPackage(validId)
    await expect(
      registry.loadPackages({ [badId]: bad, [validId]: valid }),
    ).resolves.toBeUndefined()
    expect(registry.getLoadError(badId)?.message).toContain('执行失败')
    expect(registry.getLoadError(validId)).toBeUndefined()

    const lifecycle = registry.createInstance(
      valid,
      componentNode(validId),
      {} as Phaser.Scene,
      {} as Phaser.GameObjects.Container,
      'edit',
    )
    expect(lifecycle.destroy).toBeTypeOf('function')
    expect(receivedProps).toEqual({
      fromDefault: true,
      precedence: 'node',
    })

    await registry.loadPackages({})
    expect(() =>
      registry.createInstance(
        valid,
        componentNode(validId),
        {} as Phaser.Scene,
        {} as Phaser.GameObjects.Container,
        'edit',
      ),
    ).toThrow('尚未完成注册')
    registry.dispose()
  })

  it('V2 实例获得编辑状态、稳定宿主动作和工程图片解析能力', async () => {
    const id = 'com.example.v2'
    let context: ComponentCreateContext | undefined
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      const node = nodes[0]
      if (!(node instanceof HTMLScriptElement)) return
      queueMicrotask(() => {
        const definition: ComponentDefinition = {
          id,
          runtimeApiVersion: 2,
          create: (received) => {
            context = received
            return { destroy() {} }
          },
        }
        window.CoursewareComponent?.define(definition)
        node.onload?.call(node, new Event('load'))
      })
    })

    const data: ComponentPackageData = {
      manifest: {
        schemaVersion: 2,
        runtimeApiVersion: 2,
        id,
        name: 'V2 组件',
        version: '2.0.0',
        entry: 'runtime.js',
        defaultSize: { width: 320, height: 180 },
        minSize: { width: 16, height: 16 },
        preserveAspectRatio: true,
        assets: {},
        defaultProps: { title: '默认', layout: 'story' },
        editor: {
          properties: [{ key: 'title', label: '标题', type: 'text' }],
          pages: [{ id: 'intro', label: '导入', propertyKeys: ['title'] }],
          defaultPageId: 'intro',
          previewPageProp: 'editor.previewPageId',
        },
        variants: [{ id: 'quiz', label: '测验', props: { layout: 'quiz' } }],
      },
      runtimeSource: 'runtime:v2',
      files: {},
    }
    const node: ExternalComponentNode = {
      ...componentNode(id),
      component: { packageId: id, version: '2.0.0' },
      props: {
        title: '实例',
        layout: 'quiz',
        editor: { previewPageId: 'intro' },
      },
    }
    const projectAssets: RuntimeAssetMap = {
      cover: {
        meta: {
          id: 'cover',
          filename: 'cover.png',
          mimeType: 'image/png',
          kind: 'image',
          path: 'assets/cover.png',
          byteLength: 1,
        },
        bytes: new Uint8Array([1]),
        url: 'blob:project-cover',
      },
    }

    const registry = new ComponentRegistry()
    await registry.loadPackages({ [id]: data })
    registry.createInstance(
      data,
      node,
      {} as Phaser.Scene,
      {} as Phaser.GameObjects.Container,
      'edit',
      projectAssets,
    )

    expect(context?.props).toMatchObject({ title: '实例', layout: 'quiz' })
    expect(context?.editorState).toEqual({ pageId: 'intro', variantId: 'quiz' })
    expect(context?.projectAssetUrl('cover')).toBe('blob:project-cover')
    expect(() => context?.projectAssetUrl('missing')).toThrow('工程图片素材缺失')
    expect(context?.actions.nextScene()).toBe(false)
    expect(context?.emit).toBeTypeOf('function')
    registry.dispose()
  })

  it('隔离单个实例的更新和销毁错误，并向编辑画布报告阶段', async () => {
    const id = 'com.example.unstable'
    const updateProps = vi.fn()
    const destroy = vi.fn(() => { throw new Error('destroy boom') })
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      const script = nodes[0]
      if (!(script instanceof HTMLScriptElement)) return
      queueMicrotask(() => {
        window.CoursewareComponent?.define({
          id,
          runtimeApiVersion: 1,
          create: () => ({
            resize() {
              throw new Error('resize boom')
            },
            updateProps,
            destroy,
          }),
        })
        script.onload?.call(script, new Event('load'))
      })
    })

    const registry = new ComponentRegistry()
    const data = componentPackage(id)
    await registry.loadPackages({ [id]: data })
    const onLifecycleError = vi.fn()
    const lifecycle = registry.createInstance(
      data,
      componentNode(id),
      {} as Phaser.Scene,
      {} as Phaser.GameObjects.Container,
      'edit',
      {},
      'scene',
      onLifecycleError,
    )

    expect(() => lifecycle.resize?.(640, 360)).not.toThrow()
    lifecycle.updateProps?.({ ignored: true })
    expect(updateProps).not.toHaveBeenCalled()
    expect(lifecycle.getFailure()).toMatchObject({
      phase: 'resize',
      componentId: id,
      instanceId: 'node-1',
    })
    expect(() => lifecycle.destroy()).not.toThrow()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(onLifecycleError.mock.calls.map(([failure]) => failure.phase))
      .toEqual(['resize', 'destroy'])
    registry.dispose()
  })

  it('V4 只暴露 manifest 声明的渲染面，并转发完整生命周期与捕获等待', async () => {
    const id = 'com.example.v4-hybrid'
    let context: ComponentCreateContextV4 | undefined
    const lifecycleCalls: string[] = []
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      const script = nodes[0]
      if (!(script instanceof HTMLScriptElement)) return
      queueMicrotask(() => {
        window.CoursewareComponent?.define({
          id,
          runtimeApiVersion: 4,
          create(received) {
            context = received
            received.capture.waitUntil(Promise.resolve().then(() => {
              lifecycleCalls.push('initial-ready')
              received.capture.waitUntil(Promise.resolve().then(() => {
                lifecycleCalls.push('nested-ready')
              }))
            }))
            return {
              setVisible(visible) {
                lifecycleCalls.push(`visible:${visible}`)
              },
              suspend() {
                lifecycleCalls.push('suspend')
              },
              resume() {
                lifecycleCalls.push('resume')
              },
              prepareCapture() {
                lifecycleCalls.push('prepare')
              },
              destroy() {
                lifecycleCalls.push('destroy')
              },
            }
          },
        })
        script.onload?.call(script, new Event('load'))
      })
    })

    const data: ComponentPackageData = {
      manifest: {
        schemaVersion: 4,
        runtimeApiVersion: 4,
        id,
        name: 'V4 混合组件',
        version: '4.0.0',
        entry: 'runtime.js',
        defaultSize: { width: 320, height: 180 },
        minSize: { width: 16, height: 16 },
        preserveAspectRatio: true,
        assets: {},
        defaultProps: {},
        supportedScopes: ['scene'],
        renderMode: 'hybrid',
      },
      runtimeSource: 'runtime:v4',
      files: {},
    }
    const root = {} as Phaser.GameObjects.Container
    const domRoot = document.createElement('div')
    const registry = new ComponentRegistry()
    await registry.loadPackages({ [id]: data })
    const lifecycle = registry.createInstance(
      data,
      {
        ...componentNode(id),
        component: { packageId: id, version: '4.0.0' },
      },
      { events: { emit: vi.fn() } } as unknown as Phaser.Scene,
      root,
      'edit',
      {},
      'scene',
      undefined,
      domRoot,
    )

    expect(context).toMatchObject({
      runtimeApiVersion: 4,
      renderMode: 'hybrid',
      mode: 'edit',
      scope: 'scene',
      phaser: { root },
      dom: { root: domRoot },
    })
    expect(context && 'root' in context).toBe(false)
    expect(context && 'Phaser' in context).toBe(false)

    lifecycle.setVisible?.(false)
    lifecycle.suspend?.()
    lifecycle.resume?.()
    await lifecycle.prepareCapture?.()
    expect(lifecycleCalls).toEqual([
      'visible:false',
      'suspend',
      'resume',
      'prepare',
      'initial-ready',
      'nested-ready',
    ])
    lifecycle.destroy()
    expect(lifecycleCalls.at(-1)).toBe('destroy')

    expect(() => registry.createInstance(
      data,
      componentNode(id),
      {} as Phaser.Scene,
      root,
      'edit',
      {},
      'global',
      undefined,
      domRoot,
    )).toThrow('未声明支持全局挂载')
    registry.dispose()
  })
})
