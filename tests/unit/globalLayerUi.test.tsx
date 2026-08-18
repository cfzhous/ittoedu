import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentPackageData } from '@/shared/componentTypes'
import type { RuntimeDocument } from '@/shared/runtimeTypes'
import { ComponentsTab } from '@/renderer/ui/ComponentsTab'
import { ElementsTab } from '@/renderer/ui/ElementsTab'
import { PropertiesTab } from '@/renderer/ui/PropertiesTab'
import { ScenePanel } from '@/renderer/ui/ScenePanel'
import {
  selectSlideAuthoringDocument,
  useEditorStore,
} from '@/renderer/store/editorStore'

function componentPackage(
  id: string,
  scopes: Array<'scene' | 'global'>,
): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 4,
      runtimeApiVersion: 4,
      supportedScopes: scopes,
      renderMode: 'phaser',
      id,
      name: id.endsWith('global') ? '全局导航' : '场景组件',
      version: '4.0.0',
      entry: 'runtime.js',
      defaultSize: { width: 600, height: 100 },
      minSize: { width: 200, height: 60 },
      preserveAspectRatio: false,
      assets: {},
      defaultProps: {
        content: {
          title: '课程导航',
          buttons: { replay: '重播本页', next: '进入下一页' },
        },
      },
      editor: {
        properties: [
          { key: 'content.title', label: '导航标题', type: 'text' },
          { key: 'content.buttons.next', label: '下一页按钮', type: 'text' },
        ],
      },
    },
    runtimeSource: '',
    files: {},
  }
}

function runtime(label: string, value: string): RuntimeDocument {
  return {
    runtimeApiVersion: 2,
    enabled: true,
    renderMode: 'dom',
    source: `CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})/*${value}*/`,
    content: {
      values: {
        title: value,
        action: '开始',
      },
      metadata: {
        title: { label },
        action: { label: `${label}操作` },
      },
    },
    assets: {},
  }
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
  useEditorStore.setState({ editorMode: 'professional' })
})

afterEach(() => cleanup())

describe('Project V8 global-layer editor UI', () => {
  it('switches explicitly between the fixed global entry and a scene', () => {
    const sceneId = useEditorStore.getState().activeSceneId
    render(<ScenePanel />)

    fireEvent.click(screen.getByTestId('global-layer-entry'))
    expect(useEditorStore.getState().editingScope).toBe('global')
    expect(screen.getByTestId('global-layer-entry')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByTestId(`scene-item-${sceneId}`))
    expect(useEditorStore.getState().editingScope).toBe('scene')
  })

  it('shows native elements and only enables global-compatible component packages', () => {
    const globalPackage = componentPackage('com.example.global', ['scene', 'global'])
    const scenePackage = componentPackage('com.example.scene', ['scene'])
    const store = useEditorStore.getState()
    store.importComponentPackage(globalPackage)
    store.importComponentPackage(scenePackage)
    store.setEditingScope('global')

    render(<ElementsTab onAddImage={vi.fn()} />)

    expect(screen.getByTestId('add-text')).toBeInTheDocument()
    expect(screen.getByTestId('global-elements-notice')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('add-text'))
    cleanup()

    render(<ComponentsTab />)
    expect(
      screen.getByTestId(`component-${globalPackage.manifest.id}`),
    ).toBeEnabled()
    expect(
      screen.getByTestId(`component-${scenePackage.manifest.id}`),
    ).toBeDisabled()

    fireEvent.click(
      screen.getByTestId(`component-${globalPackage.manifest.id}`),
    )
    expect(useEditorStore.getState().project.globalLayer).toHaveLength(3)
    expect(
      useEditorStore.getState().project.globalLayer.map((item) => item.node.type),
    ).toEqual(['teacher-controller', 'text', 'external-component'])
  })

  it('edits global placement, every component copy field, and both runtime content tables', () => {
    const globalPackage = componentPackage('com.example.global', ['global'])
    const store = useEditorStore.getState()
    store.importComponentPackage(globalPackage)
    store.addScene()
    const [firstScene, secondScene] = useEditorStore.getState().project.scenes
    const sceneRuntime = runtime('场景运行时标题', '场景原文')
    const globalRuntime = runtime('全局运行时标题', '全局原文')
    store.setSceneRuntime(firstScene!.id, sceneRuntime)
    store.setGlobalRuntime(globalRuntime)
    store.setEditingScope('global')
    useEditorStore.getState().addExternalComponentNode(globalPackage.manifest.id)
    const globalNode = useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.type === 'external-component',
    )!.node

    render(<PropertiesTab onReplaceImage={vi.fn()} />)

    expect(screen.getByTestId('global-layer-settings')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('场景可见范围'), {
      target: { value: 'include' },
    })
    expect(useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.id === globalNode.id,
    )?.visibility).toEqual({ mode: 'all', sceneIds: [] })
    expect(screen.getByText('选择至少一个场景后，可见范围才会生效。'))
      .toHaveAttribute('role', 'status')
    fireEvent.click(screen.getByLabelText(new RegExp(secondScene!.name)))
    fireEvent.change(screen.getByLabelText('导航标题'), {
      target: { value: '教师全局导航' },
    })
    fireEvent.change(screen.getByLabelText('下一页按钮'), {
      target: { value: '继续课程' },
    })
    fireEvent.change(screen.getByLabelText('buttons / replay'), {
      target: { value: '重新讲解' },
    })

    const placement = useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.id === globalNode.id,
    )!
    expect(placement).toMatchObject({
      layer: 'overlay',
      visibility: { mode: 'include', sceneIds: [secondScene!.id] },
      node: {
        id: globalNode.id,
        props: {
          content: {
            title: '教师全局导航',
            buttons: { replay: '重新讲解', next: '继续课程' },
          },
        },
      },
    })

    act(() => useEditorStore.getState().selectNode(null))
    expect(screen.getByTestId('global-runtime-inspector')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('全局运行时标题'), {
      target: { value: '全局新标题' },
    })
    fireEvent.change(screen.getByLabelText('全局运行时标题操作'), {
      target: { value: '统一开始' },
    })
    expect(useEditorStore.getState().project.globalRuntime?.content.values).toEqual({
      title: '全局新标题',
      action: '统一开始',
    })
    expect(useEditorStore.getState().project.globalRuntime?.source).toBe(
      globalRuntime.source,
    )

    act(() => useEditorStore.getState().setActiveScene(firstScene!.id))
    expect(screen.getByTestId('scene-runtime-inspector')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('场景运行时标题'), {
      target: { value: '场景新标题' },
    })
    fireEvent.change(screen.getByLabelText('场景运行时标题操作'), {
      target: { value: '进入互动' },
    })
    const updatedSceneRuntime = useEditorStore
      .getState()
      .project.scenes.find((scene) => scene.id === firstScene!.id)!.runtime!
    expect(updatedSceneRuntime.content.values).toEqual({
      title: '场景新标题',
      action: '进入互动',
    })
    expect(updatedSceneRuntime.source).toBe(sceneRuntime.source)
  })

  it('offers a state-free scene directory and keeps fixed scene targets as an advanced action', () => {
    const store = useEditorStore.getState()
    store.addScene()
    const targetSceneId = useEditorStore.getState().activeSceneId
    store.addPresentationState('反馈')
    const targetStateId = useEditorStore.getState().activePresentationStateId!
    store.setEditingScope('global')
    const controller = useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.type === 'teacher-controller',
    )!.node
    store.selectNode(controller.id)

    render(<PropertiesTab onReplaceImage={vi.fn()} />)

    const actionSelects = screen.getAllByLabelText<HTMLSelectElement>('点击动作')
    expect(actionSelects.some((select) => select.value === 'scene.open-picker')).toBe(true)
    expect(screen.queryByLabelText('目标场景')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: '打开场景目录' }).length)
      .toBeGreaterThan(0)
    expect(screen.getAllByRole('option', {
      name: '跳转到指定场景（高级）',
    }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('打开课件时默认折叠'))
    fireEvent.change(screen.getAllByLabelText('点击动作')[0]!, {
      target: { value: 'scene.go' },
    })
    fireEvent.change(screen.getByLabelText('目标场景'), {
      target: { value: targetSceneId },
    })
    fireEvent.change(screen.getByLabelText('进入状态'), {
      target: { value: targetStateId },
    })
    fireEvent.click(screen.getByRole('button', { name: /添加按钮/ }))

    const updated = useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.id === controller.id,
    )!.node
    if (updated.type !== 'teacher-controller') throw new Error('缺少教师控制器')
    expect(updated).toMatchObject({
      collapsible: true,
      defaultCollapsed: true,
    })
    expect(updated.buttons[0]?.action).toEqual({
      type: 'scene.go',
      sceneId: targetSceneId,
      targetStateId,
    })
    expect(updated.buttons.at(-1)?.action).toEqual({
      type: 'scene.open-picker',
    })
    expect(updated.buttons).toHaveLength(8)
    expect(new Set(updated.buttons.map((button) => button.id)).size).toBe(8)
  })

  it('maps 图层位置 onto global order without leaving the global owner', () => {
    const store = useEditorStore.getState()
    store.setEditingScope('global')
    store.addTextNode()
    const before = selectSlideAuthoringDocument(useEditorStore.getState())!
    const text = before.globalLayerItems.find(
      (entry) => entry.item.kind === 'native' && entry.item.content.nativeType === 'text',
    )
    if (!text) throw new Error('missing global text')
    store.selectNode(text.item.layerItemId)

    render(<PropertiesTab onReplaceImage={vi.fn()} />)
    expect(screen.getByTestId('global-layer-settings')).toBeInTheDocument()
    expect(screen.getByLabelText('图层位置')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('图层位置'), {
      target: { value: 'underlay' },
    })

    const after = selectSlideAuthoringDocument(useEditorStore.getState())!
    const sceneOrders = after.surfaces.flatMap((surface) => (
      surface.type === 'slide'
        ? surface.scenes.flatMap((scene) => scene.layerItems.map((item) => item.order))
        : []
    ))
    const updated = after.globalLayerItems.find(
      (entry) => entry.item.layerItemId === text.item.layerItemId,
    )
    expect(updated).toBeTruthy()
    expect(after.surfaces.some((surface) => (
      surface.type === 'slide'
      && surface.scenes.some((scene) => (
        scene.layerItems.some((item) => item.layerItemId === text.item.layerItemId)
      ))
    ))).toBe(false)
    if (sceneOrders.length > 0) {
      expect(updated!.item.order).toBeLessThan(Math.min(...sceneOrders))
    } else {
      const others = after.globalLayerItems
        .filter((entry) => entry.item.layerItemId !== text.item.layerItemId)
        .map((entry) => entry.item.order)
      expect(updated!.item.order).toBeLessThan(Math.min(...others))
    }
    expect(useEditorStore.getState().errorMessage).toBeNull()
  })
})
