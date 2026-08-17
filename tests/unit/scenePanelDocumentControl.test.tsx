import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ComponentLayerItem,
  LayerItemBase,
  NativeLayerItem,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'

const legacyV8Sentinels = vi.hoisted(() => ({
  ensurePresentation: vi.fn(() => {
    throw new Error('V9 ScenePanel leaked into ensureScenePresentation')
  }),
  useStore: vi.fn(() => {
    throw new Error('V9 ScenePanel leaked into useEditorStore')
  }),
}))

vi.mock('@/shared/presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/presentation')>()
  return {
    ...actual,
    ensureScenePresentation: legacyV8Sentinels.ensurePresentation,
  }
})

vi.mock('@/renderer/store/editorStore', () => ({
  useEditorStore: legacyV8Sentinels.useStore,
}))

import {
  ScenePanel,
  type ScenePanelDocumentControl,
} from '@/renderer/ui/ScenePanel'
import {
  buildCourseSceneThumbnailRenderModel,
  type SceneThumbnailRenderModel,
} from '@/renderer/ui/SceneThumbnail'

function emptyThumbnail(backgroundColor: string): SceneThumbnailRenderModel {
  return {
    backgroundColor,
    entries: [],
    assets: {},
    assetFiles: {},
    components: {},
  }
}

function layerBase(
  layerItemId: string,
  order: number,
  frame = { mode: 'absolute' as const, x: 40, y: 60, width: 320, height: 80 },
): LayerItemBase {
  return {
    layerItemId,
    label: layerItemId,
    frame,
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
  }
}

function textItem(id: string, order: number): NativeLayerItem {
  return {
    ...layerBase(id, order),
    kind: 'native',
    content: {
      nativeType: 'text',
      data: {
        text: '正文',
        runs: [],
        style: {
          fontFamily: 'sans-serif',
          fontSize: 42,
          color: '#111111',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          emphasis: false,
          highlightColor: null,
          align: 'left',
          verticalAlign: 'top',
          writingMode: 'horizontal',
          lineSpacing: 0,
          letterSpacing: 0,
          padding: 0,
          overflow: 'auto-height',
          backgroundColor: '#ffffff',
          backgroundOpacity: 0,
          cornerRadius: 0,
        },
      },
    },
  }
}

function componentItem(
  id: string,
  order: number,
  staticFallbackAssetId?: string,
): ComponentLayerItem {
  return {
    ...layerBase(id, order, {
      mode: 'absolute',
      x: order,
      y: order + 1,
      width: 400,
      height: 220,
    }),
    kind: 'component',
    component: { packageId: `package-${id}`, version: '1.0.0' },
    props: {},
    ...(staticFallbackAssetId ? { staticFallbackAssetId } : {}),
  }
}

function runtimeItem(
  id: string,
  order: number,
  staticFallbackAssetId?: string,
): RuntimeLayerItem {
  return {
    ...layerBase(id, order),
    kind: 'runtime',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: '',
      content: { values: {} },
      assets: {},
      ...(staticFallbackAssetId
        ? {
            staticFallback: {
              assetId: staticFallbackAssetId,
              coverage: 'scene' as const,
            },
          }
        : {}),
    },
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ScenePanel document control port', () => {
  it('gates an unavailable course location without mounting legacy scene controls', () => {
    const callbacks = {
      onAddScene: vi.fn(),
      onActivateScene: vi.fn(),
      onActivateGlobal: vi.fn(),
      onRenameScene: vi.fn(),
      onDeleteScene: vi.fn(),
      onDuplicateScene: vi.fn(),
      onReorderScenes: vi.fn(),
    }

    render(<ScenePanel documentControl={{
      unavailableReason: '此类内容的场景编辑功能尚未开放。',
      editingScope: 'scene',
      globalElementCount: 2,
      globalHasRuntime: false,
      scenes: [],
      ...callbacks,
    }} />)

    expect(screen.getByTestId('scene-panel-course-location-gate')).toHaveTextContent(
      '此类内容的场景编辑功能尚未开放。',
    )
    expect(screen.queryByTestId('add-scene')).not.toBeInTheDocument()
    expect(screen.queryByTestId('global-layer-entry')).not.toBeInTheDocument()
    expect(screen.queryByTestId(/^scene-item-/)).not.toBeInTheDocument()
    expect(Object.values(callbacks).every((callback) => callback.mock.calls.length === 0))
      .toBe(true)
    expect(legacyV8Sentinels.useStore).not.toHaveBeenCalled()
    expect(legacyV8Sentinels.ensurePresentation).not.toHaveBeenCalled()
  })

  it('renders and dispatches only the supplied V9 port without reading legacy helpers', () => {
    const callbacks = {
      onAddScene: vi.fn(),
      onActivateScene: vi.fn(),
      onActivateGlobal: vi.fn(),
      onRenameScene: vi.fn(),
      onDeleteScene: vi.fn(),
      onDuplicateScene: vi.fn(),
      onReorderScenes: vi.fn(),
    }
    const documentControl: ScenePanelDocumentControl = {
      editingScope: 'scene',
      globalElementCount: 7,
      globalHasRuntime: true,
      scenes: [
        {
          id: 'v9-scene-one',
          name: 'V9 端口场景一',
          active: true,
          showRuntimeBadge: true,
          thumbnailStateName: '证据态',
          thumbnail: emptyThumbnail('#123456'),
        },
        {
          id: 'v9-scene-two',
          name: 'V9 端口场景二',
          active: false,
          showRuntimeBadge: false,
          thumbnailStateName: '初始',
          thumbnail: emptyThumbnail('#ffffff'),
        },
      ],
      ...callbacks,
    }

    render(<ScenePanel documentControl={documentControl} />)

    expect(screen.getByText('V9 端口场景一')).toBeInTheDocument()
    expect(screen.getByText('V9 端口场景二')).toBeInTheDocument()
    expect(screen.getByText('7 个元素 · 自定义动态内容')).toBeInTheDocument()
    expect(screen.getByText('缩略图 · 证据态')).toBeInTheDocument()
    expect(screen.getByText('动态内容')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('add-scene'))
    fireEvent.click(screen.getByTestId('global-layer-entry'))
    fireEvent.click(screen.getByTestId('scene-item-v9-scene-two'))
    fireEvent.click(screen.getByRole('button', { name: '复制“V9 端口场景一”' }))

    fireEvent.doubleClick(screen.getByRole('button', {
      name: '重命名场景“V9 端口场景一”',
    }))
    const nameInput = screen.getByDisplayValue('V9 端口场景一')
    fireEvent.change(nameInput, { target: { value: 'V9 改名后场景' } })
    fireEvent.blur(nameInput)

    fireEvent.click(screen.getByRole('button', { name: '删除“V9 端口场景二”' }))
    fireEvent.click(screen.getByRole('button', { name: '删除场景' }))

    expect(callbacks.onAddScene).toHaveBeenCalledOnce()
    expect(callbacks.onActivateGlobal).toHaveBeenCalledOnce()
    expect(callbacks.onActivateScene).toHaveBeenCalledWith('v9-scene-two')
    expect(callbacks.onDuplicateScene).toHaveBeenCalledWith('v9-scene-one')
    expect(callbacks.onRenameScene).toHaveBeenCalledWith('v9-scene-one', 'V9 改名后场景')
    expect(callbacks.onDeleteScene).toHaveBeenCalledWith('v9-scene-two')
    expect(legacyV8Sentinels.useStore).not.toHaveBeenCalled()
    expect(legacyV8Sentinels.ensurePresentation).not.toHaveBeenCalled()
  })

  it('keeps an unavailable global layer visible without dispatching a false authoring route', () => {
    const onActivateGlobal = vi.fn()
    render(<ScenePanel documentControl={{
      editingScope: 'scene',
      globalElementCount: 1,
      globalHasRuntime: false,
      globalEditingDisabled: true,
      globalEditingUnavailableReason: '全局作者能力尚未接入',
      scenes: [],
      onAddScene: vi.fn(),
      onActivateScene: vi.fn(),
      onActivateGlobal,
      onRenameScene: vi.fn(),
      onDeleteScene: vi.fn(),
      onDuplicateScene: vi.fn(),
      onReorderScenes: vi.fn(),
    }} />)

    const globalEntry = screen.getByTestId('global-layer-entry')
    expect(globalEntry).toBeDisabled()
    expect(globalEntry).toHaveAttribute('title', '全局作者能力尚未接入')
    expect(screen.getByText('1 个元素 · 暂不可编辑')).toBeInTheDocument()
    fireEvent.click(globalEntry)
    expect(onActivateGlobal).not.toHaveBeenCalled()
  })

  it('shows current-content shared authoring only when the controlled owner supplies it', () => {
    const onActivateSurface = vi.fn()
    const base: ScenePanelDocumentControl = {
      editingScope: 'scene',
      globalElementCount: 1,
      globalHasRuntime: false,
      scenes: [],
      onAddScene: vi.fn(),
      onActivateScene: vi.fn(),
      onActivateGlobal: vi.fn(),
      onRenameScene: vi.fn(),
      onDeleteScene: vi.fn(),
      onDuplicateScene: vi.fn(),
      onReorderScenes: vi.fn(),
    }
    const { rerender } = render(<ScenePanel documentControl={base} />)

    expect(screen.queryByTestId('surface-layer-entry')).not.toBeInTheDocument()
    rerender(<ScenePanel documentControl={{
      ...base,
      editingScope: 'surface',
      surfaceLayer: {
        elementCount: 3,
        hasDynamicContent: true,
        onActivate: onActivateSurface,
      },
    }} />)

    const entry = screen.getByTestId('surface-layer-entry')
    expect(entry).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('当前内容共用')).toBeInTheDocument()
    expect(screen.getByText('3 个元素 · 场景间共享 · 含动态内容')).toBeInTheDocument()
    fireEvent.click(entry)
    expect(onActivateSurface).toHaveBeenCalledOnce()
    expect(legacyV8Sentinels.useStore).not.toHaveBeenCalled()
  })

  it('hides separate shared-layer pages when the V9 owner supplies current-page controls', () => {
    const onActivateGlobal = vi.fn()
    const onActivateSurface = vi.fn()
    render(<ScenePanel documentControl={{
      hideSharedLayerEntries: true,
      editingScope: 'scene',
      globalElementCount: 2,
      globalHasRuntime: false,
      surfaceLayer: {
        elementCount: 1,
        hasDynamicContent: false,
        onActivate: onActivateSurface,
      },
      scenes: [],
      onAddScene: vi.fn(),
      onActivateScene: vi.fn(),
      onActivateGlobal,
      onRenameScene: vi.fn(),
      onDeleteScene: vi.fn(),
      onDuplicateScene: vi.fn(),
      onReorderScenes: vi.fn(),
    }} />)

    expect(screen.queryByTestId('global-layer-entry')).not.toBeInTheDocument()
    expect(screen.queryByTestId('surface-layer-entry')).not.toBeInTheDocument()
    expect(onActivateGlobal).not.toHaveBeenCalled()
    expect(onActivateSurface).not.toHaveBeenCalled()
    expect(legacyV8Sentinels.useStore).not.toHaveBeenCalled()
    expect(legacyV8Sentinels.ensurePresentation).not.toHaveBeenCalled()
  })

  it('builds one ordered V9 composition with visibility and fallback semantics intact', () => {
    const componentFallback = componentItem('component-fallback', 10, 'asset-component')
    const runtimeFallback = runtimeItem('runtime-fallback', 15, 'asset-runtime')
    const nativeText = textItem('native-text', 20)
    const componentPackage = componentItem('component-package', 30)
    const hiddenByScope = componentItem('hidden-by-scope', 1, 'asset-hidden-scope')
    const hiddenByItem = componentItem('hidden-by-item', 2, 'asset-hidden-item')
    hiddenByItem.visible = false
    const runtimeWithoutFallback = runtimeItem('runtime-without-fallback', 5)

    const model = buildCourseSceneThumbnailRenderModel({
      backgroundColor: '#fafafa',
      layers: [
        { effectiveVisible: true, item: componentPackage },
        { effectiveVisible: true, item: runtimeWithoutFallback },
        { effectiveVisible: true, item: nativeText },
        { effectiveVisible: false, item: hiddenByScope },
        { effectiveVisible: true, item: runtimeFallback },
        { effectiveVisible: true, item: hiddenByItem },
        { effectiveVisible: true, item: componentFallback },
      ],
      assets: {},
      assetFiles: {},
      componentPackages: {
        'package-component-package': {
          manifest: { name: '包缩略图' },
          thumbnailUrl: 'data:image/png;base64,AA==',
        } as never,
      },
    })

    expect(model.entries.map((entry) => {
      if (entry.kind === 'node') return `${entry.kind}:${entry.node.id}`
      if (entry.kind === 'course-component') return `${entry.kind}:${entry.label}`
      if (entry.kind === 'course-runtime-fallback') return `${entry.kind}:${entry.assetId}`
      return entry.kind
    })).toEqual([
      'course-component:component-fallback',
      'course-runtime-fallback:asset-runtime',
      'node:native-text',
      'course-component:component-package',
    ])

    expect(model.entries[0]).toMatchObject({
      kind: 'course-component',
      packageId: 'package-component-fallback',
      staticFallbackAssetId: 'asset-component',
      frame: {
        x: 10,
        y: 11,
        width: 400,
        height: 220,
      },
    })
    expect(model.entries[1]).toMatchObject({
      kind: 'course-runtime-fallback',
      assetId: 'asset-runtime',
      frame: { x: 40, y: 60, width: 320, height: 80 },
    })
    expect(model.entries[3]).toMatchObject({
      kind: 'course-component',
      packageId: 'package-component-package',
    })
    expect(model.entries[3]).not.toHaveProperty('staticFallbackAssetId')
    expect(model.components['package-component-package']).toEqual({
      name: '包缩略图',
      thumbnailUrl: 'data:image/png;base64,AA==',
    })
  })
})
