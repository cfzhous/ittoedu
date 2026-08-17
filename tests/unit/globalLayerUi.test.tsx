import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentPackageData } from '@/shared/componentTypes'
import type { RuntimeDocument } from '@/shared/runtimeTypes'
import { updateCourseProject } from '@/renderer/course/courseStudioModel'
import {
  captureV9SlideVerticalSliceArchive,
  isV9SlideVerticalSliceDirty,
} from '@/renderer/course/v9SlideVerticalSlice'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import { ComponentsTab } from '@/renderer/ui/ComponentsTab'
import { ElementsTab } from '@/renderer/ui/ElementsTab'
import { NodesTab } from '@/renderer/ui/NodesTab'
import { PropertiesTab } from '@/renderer/ui/PropertiesTab'
import { ScenePanel } from '@/renderer/ui/ScenePanel'
import { useEditorStore } from '@/renderer/store/editorStore'

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
    useEditorStore.setState((state) => ({
      project: {
        ...state.project,
        globalRuntime,
        scenes: state.project.scenes.map((scene) =>
          scene.id === firstScene!.id ? { ...scene, runtime: sceneRuntime } : scene,
        ),
      },
    }))
    store.setEditingScope('global')
    useEditorStore.getState().addExternalComponentNode(globalPackage.manifest.id)
    const globalNode = useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.type === 'external-component',
    )!.node

    render(<PropertiesTab onReplaceImage={vi.fn()} />)

    expect(screen.getByTestId('global-layer-settings')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('图层位置'), {
      target: { value: 'underlay' },
    })
    fireEvent.change(screen.getByLabelText('场景可见范围'), {
      target: { value: 'include' },
    })
    expect(useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.id === globalNode.id,
    )?.visibility).toEqual({ mode: 'all', sceneIds: [] })
    expect(screen.getByText('选择至少一个场景后，可见范围才会生效。'))
      .toHaveAttribute('role', 'status')
    fireEvent.click(screen.getByLabelText(secondScene!.name))
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
      layer: 'underlay',
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
})

describe('V9 current-page layer list', () => {
  it('keeps source explicit and locates the one global controller by its stable ID', () => {
    const onSelectEffectiveLayer = vi.fn()
    const onLocateController = vi.fn()
    render(<NodesTab documentControl={{
      editingScope: 'scene',
      contextKey: 'v9-current-page',
      scopeLabel: '当前页面图层',
      nodes: [],
      selectedNodeIds: [],
      effectiveLayers: [
        {
          source: 'scene',
          layerItemId: 'scene-title',
          label: '本页标题',
          kind: 'text',
          order: 10,
          visible: true,
          locked: false,
          effectiveVisible: true,
          selected: false,
        },
        {
          source: 'surface',
          layerItemId: 'shared-note',
          label: '讲义共用说明',
          kind: 'text',
          order: 20,
          visible: true,
          locked: false,
          effectiveVisible: true,
          selected: false,
          viewOnly: true,
          impactLabel: '会在当前内容的多个页面中出现；当前仅可查看影响范围',
        },
        {
          source: 'global',
          layerItemId: 'teacher-controller-stable',
          label: '教师控制器',
          kind: 'teacher-controller',
          order: 30,
          visible: true,
          locked: false,
          effectiveVisible: true,
          selected: false,
          controller: true,
        },
        {
          source: 'global',
          layerItemId: 'hidden-controller-stable',
          label: '隐藏控制器',
          kind: 'teacher-controller',
          order: 40,
          visible: false,
          locked: true,
          effectiveVisible: false,
          selected: false,
          controller: true,
        },
      ],
      onSelectEffectiveLayer,
      onLocateController,
      onSelectNode: vi.fn(),
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onRenameNode: vi.fn(),
      onSetNodeVisible: vi.fn(),
      onSetNodeLocked: vi.fn(),
      onReorderNodes: vi.fn(),
    }} />)

    expect(screen.getByTestId('effective-layer-item-scene-scene-title')).toHaveTextContent('当前页面')
    expect(screen.getByTestId('effective-layer-item-surface-shared-note')).toHaveTextContent('当前内容共用')
    expect(screen.getByTestId('effective-layer-item-surface-shared-note')).toHaveAttribute(
      'data-layer-view-only',
      'true',
    )

    fireEvent.click(screen.getByTestId('locate-controller-global-teacher-controller-stable'))
    expect(onLocateController).toHaveBeenCalledWith(expect.objectContaining({
      source: 'global',
      layerItemId: 'teacher-controller-stable',
    }))
    expect(
      screen.getByTestId('locate-controller-global-hidden-controller-stable'),
    ).toBeDisabled()
    expect(
      screen.getByTestId('locate-controller-global-hidden-controller-stable'),
    ).toHaveAttribute('title', '控制器当前不可见，无法定位到画布')
    fireEvent.click(screen.getByTestId('effective-layer-item-scene-scene-title').querySelector('button')!)
    expect(onSelectEffectiveLayer).toHaveBeenCalledWith(expect.objectContaining({
      source: 'scene',
      layerItemId: 'scene-title',
    }))
  })

  it('marks a shared row with a source-explicit local inspection selection', () => {
    const onSelectEffectiveLayer = vi.fn()
    render(<NodesTab documentControl={{
      editingScope: 'scene',
      contextKey: 'v9-current-page-inspection',
      scopeLabel: '当前页面图层',
      nodes: [],
      selectedNodeIds: [],
      effectiveLayers: [{
        source: 'surface',
        layerItemId: 'shared-note',
        label: '讲义共用说明',
        kind: 'text',
        order: 20,
        visible: true,
        locked: false,
        effectiveVisible: true,
        selected: false,
        viewOnly: true,
        impactLabel: '会在当前内容的多个页面中出现；当前仅可查看影响范围',
      }],
      onSelectEffectiveLayer,
      onSelectNode: vi.fn(),
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onRenameNode: vi.fn(),
      onSetNodeVisible: vi.fn(),
      onSetNodeLocked: vi.fn(),
      onReorderNodes: vi.fn(),
    }} />)
    const item = screen.getByTestId('effective-layer-item-surface-shared-note')
    expect(item).not.toHaveClass('node-item--selected')
    expect(item).toHaveAttribute('data-layer-view-only', 'true')
    expect(item).toHaveTextContent('当前仅可查看影响范围')

    fireEvent.click(item.querySelector('button')!)
    expect(item).toHaveClass('node-item--selected')
    expect(item.querySelector('button')).toHaveAttribute('aria-pressed', 'true')
    expect(onSelectEffectiveLayer).toHaveBeenCalledWith(expect.objectContaining({
      source: 'surface',
      layerItemId: 'shared-note',
    }))
  })
})

describe('V9 hidden shared navigation archive safety', () => {
  it('leaves global and current-content shared layer semantics byte-stable', () => {
    const store = useEditorStore.getState()
    store.createNewCourseProject()
    store.addCourseTextLayer()
    const seed = useEditorStore.getState().courseSession
    if (seed === null) throw new Error('expected V9 course session')
    const seedLocation = seed.history.present.locations.find(
      (location) => location.id === seed.selection.locationId,
    )
    if (!seedLocation || seedLocation.kind !== 'slide-scene') {
      throw new Error('expected active V9 slide scene')
    }
    const seedSurface = seed.history.present.surfaces.find(
      (surface) => surface.id === seedLocation.surfaceId,
    )
    if (!seedSurface || seedSurface.type !== 'slide') {
      throw new Error('expected active V9 slide surface')
    }
    const seedScene = seedSurface.scenes.find((scene) => scene.id === seedLocation.sceneId)
    const seedText = seedScene?.layerItems.find((item) => item.kind === 'native')
    if (!seedScene || !seedText) throw new Error('expected V9 text layer')

    const project = updateCourseProject(seed.history.present, (draft) => {
      const location = draft.locations.find((entry) => entry.id === seedLocation.id)
      if (!location || location.kind !== 'slide-scene') throw new Error('expected draft scene')
      const surface = draft.surfaces.find((entry) => entry.id === location.surfaceId)
      if (!surface || surface.type !== 'slide') throw new Error('expected draft slide surface')
      const globalItem = structuredClone(seedText)
      globalItem.layerItemId = 'archive-safety-global'
      globalItem.label = '全课保留内容'
      globalItem.order = 40
      const surfaceItem = structuredClone(seedText)
      surfaceItem.layerItemId = 'archive-safety-surface'
      surfaceItem.label = '当前内容共用保留内容'
      surfaceItem.order = 50
      draft.globalLayerItems.push({
        item: globalItem,
        visibility: { mode: 'all', locationIds: [] },
      })
      surface.surfaceLayerItems.push({
        item: surfaceItem,
        visibility: { mode: 'all', locationIds: [] },
      })
    })
    store.loadCourseProject({
      project,
      assetFiles: seed.assetFiles,
      componentFiles: seed.componentFiles,
    }, null)
    const before = useEditorStore.getState().courseSession
    if (before === null) throw new Error('expected reopened V9 course session')
    const beforeArchive = captureV9SlideVerticalSliceArchive(before)
    const beforeBytes = createCourseProjectArchive(beforeArchive, {
      mtime: '2026-08-16T00:00:00.000Z',
    })
    const beforeOpened = openCourseProjectArchive(beforeBytes)
    const beforeRevision = before.history.present.revision
    expect(isV9SlideVerticalSliceDirty(before)).toBe(false)

    const callbacks = {
      onActivateGlobal: vi.fn(),
      onActivateSurface: vi.fn(),
      onActivateScene: vi.fn((sceneId: string) => {
        useEditorStore.getState().activateCourseScene(sceneId)
      }),
    }
    render(<ScenePanel documentControl={{
      hideSharedLayerEntries: true,
      editingScope: 'scene',
      globalElementCount: before.history.present.globalLayerItems.length,
      globalHasRuntime: false,
      surfaceLayer: {
        elementCount: 1,
        hasDynamicContent: false,
        onActivate: callbacks.onActivateSurface,
      },
      scenes: [{
        id: seedLocation.sceneId,
        name: seedScene.name,
        active: true,
        showRuntimeBadge: false,
        thumbnailStateName: '基础',
        thumbnail: {
          backgroundColor: '#ffffff',
          entries: [],
          assets: {},
          assetFiles: {},
          components: {},
        },
      }],
      onAddScene: vi.fn(),
      onActivateScene: callbacks.onActivateScene,
      onActivateGlobal: callbacks.onActivateGlobal,
      onRenameScene: vi.fn(),
      onDeleteScene: vi.fn(),
      onDuplicateScene: vi.fn(),
      onReorderScenes: vi.fn(),
    }} />)

    expect(screen.queryByTestId('global-layer-entry')).not.toBeInTheDocument()
    expect(screen.queryByTestId('surface-layer-entry')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId(`scene-item-${seedLocation.sceneId}`))
    expect(callbacks.onActivateScene).toHaveBeenCalledWith(seedLocation.sceneId)
    expect(callbacks.onActivateGlobal).not.toHaveBeenCalled()
    expect(callbacks.onActivateSurface).not.toHaveBeenCalled()

    const after = useEditorStore.getState().courseSession
    if (after === null) throw new Error('expected V9 course session after render')
    const afterArchive = captureV9SlideVerticalSliceArchive(after)
    const afterBytes = createCourseProjectArchive(afterArchive, {
      mtime: '2026-08-16T00:00:00.000Z',
    })
    const afterOpened = openCourseProjectArchive(afterBytes)

    expect(after.history.present.revision).toBe(beforeRevision)
    expect(isV9SlideVerticalSliceDirty(after)).toBe(false)
    expect(afterArchive).toEqual(beforeArchive)
    expect(afterBytes).toEqual(beforeBytes)
    expect(afterOpened.project.globalLayerItems).toEqual(
      beforeOpened.project.globalLayerItems,
    )
    expect(afterOpened.project.surfaces.map((surface) => surface.surfaceLayerItems)).toEqual(
      beforeOpened.project.surfaces.map((surface) => surface.surfaceLayerItems),
    )
  })
})

describe('V9 ComponentsTab locator and scope', () => {
  function activeV9SlideContext() {
    const session = useEditorStore.getState().courseSession
    if (session === null) throw new Error('expected V9 course session')
    const location = session.history.present.locations.find(
      (candidate) => candidate.id === session.selection.locationId,
    )
    if (!location || location.kind !== 'slide-scene') {
      throw new Error('expected active V9 slide scene')
    }
    const surface = session.history.present.surfaces.find(
      (candidate) => candidate.id === location.surfaceId,
    )
    if (!surface || surface.type !== 'slide') {
      throw new Error('expected active V9 slide surface')
    }
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
    if (!scene) throw new Error('expected active V9 scene')
    return { session, location, surface, scene }
  }

  function moveActiveSceneComponentToGlobal(packageId: string): string {
    const { session, location, surface, scene } = activeV9SlideContext()
    const project = structuredClone(session.history.present)
    const projectSurface = project.surfaces.find((candidate) => candidate.id === surface.id)
    if (!projectSurface || projectSurface.type !== 'slide') {
      throw new Error('expected project slide surface')
    }
    const projectScene = projectSurface.scenes.find((candidate) => candidate.id === scene.id)
    const index = projectScene?.layerItems.findIndex((item) => (
      item.kind === 'component' && item.component.packageId === packageId
    )) ?? -1
    if (index < 0 || !projectScene) throw new Error('expected V9 component layer')
    const [item] = projectScene.layerItems.splice(index, 1)
    if (!item) throw new Error('expected V9 component layer')
    project.globalLayerItems.push({
      item,
      visibility: { mode: 'all', locationIds: [] },
    })
    useEditorStore.setState({
      courseSession: {
        ...session,
        history: { ...session.history, present: project },
      },
    })
    return location.id
  }

  it('uses the V9 current-page scope and selects a concrete scene use instead of a preceding global use', () => {
    const sceneOnly = componentPackage('com.example.v9-scene-only', ['scene'])
    const locatable = componentPackage('com.example.v9-locatable', ['scene', 'global'])
    const store = useEditorStore.getState()
    store.createNewCourseProject()
    store.importCourseComponentPackages([sceneOnly, locatable])

    // Create one concrete scene use, then add a global copy. The V9 collector
    // traverses global entries first, so the locator must deliberately skip
    // that shared reference and select the scene use.
    store.setCourseEditingScope('scene')
    store.addCourseComponentLayer(locatable.manifest.id)
    const { session, location, scene } = activeV9SlideContext()
    const targetLayerId = scene.layerItems.find((item) => (
      item.kind === 'component' && item.component.packageId === locatable.manifest.id
    ))?.layerItemId
    if (!targetLayerId) throw new Error('expected V9 component layer')
    const project = structuredClone(session.history.present)
    const globalCopy = structuredClone(scene.layerItems.find((item) => (
      item.layerItemId === targetLayerId
    ))!)
    globalCopy.layerItemId = 'global-locatable-copy'
    project.globalLayerItems.push({
      item: globalCopy,
      visibility: { mode: 'all', locationIds: [] },
    })
    useEditorStore.setState({
      courseSession: {
        ...session,
        history: { ...session.history, present: project },
      },
    })

    // A stale V8 global scope must not make a new V9 scene reject a
    // scene-only package in the Components tab.
    useEditorStore.setState({ editingScope: 'global' })
    render(<ComponentsTab />)
    expect(screen.getByTestId(`component-${sceneOnly.manifest.id}`)).toBeEnabled()

    const manager = screen.getByTestId(`component-package-${locatable.manifest.id}`)
    fireEvent.click(manager.querySelector('summary')!)
    const locate = screen.getByTestId(`locate-component-${locatable.manifest.id}`)
    expect(locate).toBeEnabled()
    fireEvent.click(locate)

    const afterLocate = useEditorStore.getState().courseSession
    expect(afterLocate?.selection.locationId).toBe(location.id)
    expect(afterLocate?.selection.selectionIds).toEqual([targetLayerId])
    expect(useEditorStore.getState().statusMessage).toBe('已定位“场景组件”')
  })

  it('disables the V9 locator when a package is used only in shared layers', () => {
    const sharedOnly = componentPackage('com.example.v9-shared-global', ['scene', 'global'])
    const store = useEditorStore.getState()
    store.createNewCourseProject()
    store.importCourseComponentPackages([sharedOnly])
    store.addCourseComponentLayer(sharedOnly.manifest.id)
    moveActiveSceneComponentToGlobal(sharedOnly.manifest.id)

    render(<ComponentsTab />)
    const manager = screen.getByTestId(`component-package-${sharedOnly.manifest.id}`)
    fireEvent.click(manager.querySelector('summary')!)
    const locate = screen.getByTestId(`locate-component-${sharedOnly.manifest.id}`)
    expect(locate).toBeDisabled()
    expect(locate).toHaveAttribute(
      'title',
      '该组件只用于全课或共用内容；请在当前页面的图层列表查看影响范围。',
    )
  })
})
