import { describe, expect, it } from 'vitest'
import { strToU8 } from 'fflate'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import {
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  activateV9SlidePresentationState,
  addV9SlidePresentationState,
  buildV9SlideWorkspaceSnapshot,
  openV9SlideVerticalSliceState,
  resolveV9SlideRuntimeLayerItemId,
  resolveV9SlideRuntimeTextValue,
  selectV9SlideVerticalSlice,
  setV9SlideEditingScope,
  updateV9SlideComponentProps,
  updateV9SlideLayer,
  updateV9SlideNativeNode,
  updateV9SlideRuntimeAsset,
  updateV9SlideRuntimeContent,
} from '@/renderer/course/v9SlideVerticalSlice'
import { parseComponentPackageFiles } from '@/renderer/components/importComponentPackage'
import type {
  ComponentLayerItem,
  LayerItem,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'
import { makeAuthoringAddress } from '@/shared/authoringAddress'

const NOW = '2026-08-15T09:00:00.000Z'

const CARD_MANIFEST = {
  schemaVersion: 4,
  runtimeApiVersion: 4,
  id: 'example.card',
  name: '卡片组件',
  version: '1.0.0',
  description: '测试组件',
  entry: 'runtime.js',
  defaultSize: { width: 400, height: 260 },
  minSize: { width: 100, height: 60 },
  preserveAspectRatio: false,
  assets: {},
  defaultProps: {},
  supportedScopes: ['scene'],
  renderMode: 'dom',
  editor: {
    properties: [
      { key: 'title', label: '标题', type: 'text' },
      { key: 'image', label: '图片', type: 'image' },
    ],
  },
} as const

function cardComponentFiles(): Record<string, Uint8Array> {
  return {
    'manifest.json': strToU8(JSON.stringify(CARD_MANIFEST)),
    'runtime.js': strToU8(
      'window.CoursewareComponent.define({\n' +
        '  id: "example.card",\n' +
        '  runtimeApiVersion: 4,\n' +
        '  create: function () { return { destroy: function () {} } }\n' +
        '})',
    ),
  }
}

function cardPackageMeta() {
  const parsed = parseComponentPackageFiles(cardComponentFiles(), {
    expectedId: 'example.card',
    expectedVersion: '1.0.0',
  })
  return parsed.metadata
}

function openSession(project: ReturnType<typeof createCourseProject>) {
  return openV9SlideVerticalSliceState({
    project,
    assetFiles: {},
    componentFiles: { 'example.card@1.0.0': cardComponentFiles() },
  }, null)
}

function baseSession() {
  const project = createCourseProject({ id: 'v9-dynamic-authoring', now: NOW })
  const withLayers = addRuntimeAndComponentLayers(project)
  return openSession(withLayers)
}

function addRuntimeAndComponentLayers(
  project: ReturnType<typeof createCourseProject>,
): ReturnType<typeof createCourseProject> {
  const location = project.locations.find(
    (candidate) => candidate.id === project.startLocationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected slide')
  const surface = project.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('expected slide surface')
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)!
  return updateCourseProject(project, (draft) => {
    draft.assets['asset-hero'] = {
      id: 'asset-hero',
      filename: 'hero.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/hero.png',
      byteLength: 3,
    }
    draft.assets['asset-card'] = {
      id: 'asset-card',
      filename: 'card.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/card.png',
      byteLength: 4,
    }
    draft.componentPackages['example.card'] = cardPackageMeta()
    const draftSurface = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!draftSurface || draftSurface.type !== 'slide') throw new Error('expected slide')
    const draftScene = draftSurface.scenes.find(
      (candidate) => candidate.id === scene.id,
    )!
    draftScene.layerItems.push(runtimeLayerItem({
      layerItemId: 'runtime-layer-main',
      label: '动态内容',
      order: 10,
      values: { title: '原标题', hint: '提示' },
      assets: { hero: 'asset-hero' },
    }))
    draftScene.layerItems.push(runtimeLayerItem({
      layerItemId: 'runtime-layer-api3',
      label: 'API3 动态内容',
      order: 20,
      runtimeApiVersion: 3,
      protocol: 'surface-v1',
      values: { title: 'API3' },
    }))
    draftScene.layerItems.push(componentLayerItem({
      layerItemId: 'component-layer-card',
      label: '卡片组件',
      order: 30,
      props: { title: '卡片标题', image: 'asset-card' },
    }))
  }, NOW)
}

function runtimeLayerItem(input: {
  layerItemId: string
  label: string
  order: number
  values: Record<string, string>
  assets?: Record<string, string>
  runtimeApiVersion?: 2 | 3
  protocol?: 'legacy-runtime-v2' | 'surface-v1'
  enabled?: boolean
}): RuntimeLayerItem {
  const {
    layerItemId,
    label,
    order,
    values,
    assets = {},
    runtimeApiVersion = 2,
    protocol = 'legacy-runtime-v2',
    enabled = true,
  } = input
  return {
    layerItemId,
    label,
    kind: 'runtime',
    frame: protocol === 'legacy-runtime-v2'
      ? { mode: 'legacy-whole-canvas', x: 0, y: 0, width: 1280, height: 720 }
      : { mode: 'absolute', x: 0, y: 0, width: 1280, height: 720 },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'surface',
    playbackInitialVisibility: 'inherit',
    runtime: {
      protocol,
      runtimeApiVersion,
      enabled,
      renderMode: 'dom',
      source: 'CoursewareRuntime.define({ runtimeApiVersion: 2, create() { return { destroy() {} } } })',
      content: { values },
      assets: Object.fromEntries(
        Object.entries(assets).map(([key, assetId]) => [key, { assetId }]),
      ),
    },
  }
}

function componentLayerItem(input: {
  layerItemId: string
  label: string
  order: number
  props: Record<string, unknown>
}): ComponentLayerItem {
  const { layerItemId, label, order, props } = input
  return {
    layerItemId,
    label,
    kind: 'component',
    frame: { mode: 'absolute', x: 320, y: 180, width: 400, height: 260 },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: 'example.card', version: '1.0.0' },
    props: structuredClone(props),
  }
}

function sceneLayers(state: ReturnType<typeof baseSession>): LayerItem[] {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected slide')
  const surface = state.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('expected slide')
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)!
  return scene.layerItems
}

function layerTarget(state: ReturnType<typeof baseSession>, layerItemId: string) {
  return {
    sessionId: state.sessionId,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
    editingScope: state.editingScope,
    layerItemId,
  }
}

describe('V9 runtime/component unified-layer projection', () => {
  it('projects component layers into the Phaser proxy and the Player carrier', () => {
    const state = baseSession()
    const snapshot = buildV9SlideWorkspaceSnapshot(state)

    const proxyNode = snapshot.document.nodes.find(
      (node) => node.id === 'component-layer-card',
    )
    expect(proxyNode?.type).toBe('external-component')
    expect(proxyNode).toMatchObject({
      x: 320,
      y: 180,
      width: 400,
      height: 260,
      props: { title: '卡片标题', image: 'asset-card' },
    })

    const carrierNode = snapshot.previewDocument.nodes.find(
      (node) => node.id === 'component-layer-card',
    )
    expect(carrierNode?.type).toBe('external-component')
    expect(snapshot.previewDocument.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['component-layer-card']),
    )
    // Runtime layers are not SceneNodes; only the projected API-2 runtime is
    // carried as the legacy scene runtime.
    expect(snapshot.document.runtime).toBeUndefined()
    expect(snapshot.previewDocument.runtime?.runtimeApiVersion).toBe(2)
    expect(snapshot.previewDocument.runtime?.content.values).toEqual({
      title: '原标题',
      hint: '提示',
    })
    expect(snapshot.sceneRuntimeLayerItemId).toBe('runtime-layer-main')
    expect(snapshot.previewDocument.nodes.some((node) => (
      node.id === 'runtime-layer-main' || node.id === 'runtime-layer-api3'
    ))).toBe(false)
  })

  it('keeps the API-3 runtime out of the legacy carrier and resolves no layer', () => {
    const state = baseSession()
    const snapshot = buildV9SlideWorkspaceSnapshot(state)
    expect(snapshot.previewDocument.runtime?.content.values).not.toHaveProperty('API3')
    expect(resolveV9SlideRuntimeLayerItemId(state, 'scene', snapshot.previewDocument.id))
      .toBe('runtime-layer-main')
    expect(resolveV9SlideRuntimeTextValue(
      state,
      'scene',
      snapshot.previewDocument.id,
      'title',
    )).toBe('原标题')
    expect(resolveV9SlideRuntimeTextValue(
      state,
      'scene',
      snapshot.previewDocument.id,
      'missing',
    )).toBeUndefined()
  })

  it('projects a global runtime and global component layers for the carrier', () => {
    const state = baseSession()
    const withGlobal = (() => {
      const project = updateCourseProject(state.history.present, (draft) => {
        draft.globalLayerItems.push({
          item: runtimeLayerItem({
            layerItemId: 'global-runtime-layer',
            label: '全局动态内容',
            order: 5,
            values: { globalTitle: '全局标题' },
            assets: {},
          }),
          visibility: { mode: 'all', locationIds: [] },
        })
        draft.globalLayerItems.push({
          item: componentLayerItem({
            layerItemId: 'global-component-layer',
            label: '全局组件',
            order: 6,
            props: { title: '全局组件标题' },
          }),
          visibility: { mode: 'all', locationIds: [] },
        })
      }, NOW)
      return openSession(project)
    })()
    const snapshot = buildV9SlideWorkspaceSnapshot(withGlobal)
    expect(snapshot.globalRuntimeLayerItemId).toBe('global-runtime-layer')
    expect(snapshot.globalRuntime?.content.values.globalTitle).toBe('全局标题')
    expect(snapshot.globalCarrierLayerItems?.map((item) => item.node.id)).toEqual([
      'global-component-layer',
    ])
    expect(snapshot.globalCarrierLayerItems?.[0]?.layer).toBe('overlay')
    // Global components mount only in the carrier's global plane; they never
    // duplicate into the flattened carrier scene.
    expect(snapshot.previewDocument.nodes.some((node) => (
      node.id === 'global-component-layer'
    ))).toBe(false)
    // The scope-local Phaser proxy still exposes them for global editing.
    const globalScope = setV9SlideEditingScope(withGlobal, 'global')
    expect(buildV9SlideWorkspaceSnapshot(globalScope).document.nodes
      .map((node) => node.id)).toEqual(expect.arrayContaining(['global-component-layer']))
  })

  it('projects the lowest-order enabled API-2 runtime layer', () => {
    const project = createCourseProject({ id: 'v9-dynamic-order', now: NOW })
    const location = project.locations.find(
      (candidate) => candidate.id === project.startLocationId,
    )
    if (!location || location.kind !== 'slide-scene') throw new Error('expected slide')
    const surface = project.surfaces.find(
      (candidate) => candidate.id === location.surfaceId,
    )
    if (!surface || surface.type !== 'slide') throw new Error('expected slide')
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)!
    const withTwoRuntimes = updateCourseProject(project, (draft) => {
      const draftSurface = draft.surfaces.find((candidate) => candidate.id === surface.id)
      if (!draftSurface || draftSurface.type !== 'slide') throw new Error('expected slide')
      const draftScene = draftSurface.scenes.find(
        (candidate) => candidate.id === scene.id,
      )!
      draftScene.layerItems.push(runtimeLayerItem({
        layerItemId: 'runtime-layer-upper',
        label: '上层动态内容',
        order: 20,
        values: { title: '上层' },
        assets: {},
      }))
      draftScene.layerItems.push(runtimeLayerItem({
        layerItemId: 'runtime-layer-lower',
        label: '下层动态内容',
        order: 10,
        values: { title: '下层' },
        assets: {},
      }))
      draftScene.layerItems.sort((left, right) => left.order - right.order)
    }, NOW)
    const state = openSession(withTwoRuntimes)
    const snapshot = buildV9SlideWorkspaceSnapshot(state)
    expect(snapshot.sceneRuntimeLayerItemId).toBe('runtime-layer-lower')
  })
})

describe('V9 runtime/component write commands', () => {
  it('updates a runtime content value through one history commit', () => {
    const state = baseSession()
    const target = layerTarget(state, 'runtime-layer-main')
    const next = updateV9SlideRuntimeContent(state, target, 'title', '新标题', NOW)

    expect(next.history.present).not.toBe(state.history.present)
    const layer = sceneLayers(next).find(
      (item) => item.layerItemId === 'runtime-layer-main',
    )
    expect(layer?.kind).toBe('runtime')
    if (layer?.kind !== 'runtime') throw new Error('expected runtime layer')
    expect(layer.runtime.content.values.title).toBe('新标题')
    expect(layer.runtime.content.values.hint).toBe('提示')
    expect(courseProjectDocumentSchema.parse(next.history.present)).toEqual(
      next.history.present,
    )
  })

  it('rejects edits to unknown runtime keys and non-runtime layers', () => {
    const state = baseSession()
    expect(() => updateV9SlideRuntimeContent(
      state,
      layerTarget(state, 'runtime-layer-main'),
      'missing',
      'x',
      NOW,
    )).toThrow('没有这个文字字段')
    expect(() => updateV9SlideRuntimeContent(
      state,
      layerTarget(state, 'component-layer-card'),
      'title',
      'x',
      NOW,
    )).toThrow('找不到当前动态内容层')
    expect(sceneLayers(state).length).toBe(3)
  })

  it('updates a runtime asset binding', () => {
    const state = baseSession()
    const withNewAsset = (() => {
      const project = updateCourseProject(state.history.present, (draft) => {
        draft.assets['asset-hero-v2'] = {
          id: 'asset-hero-v2',
          filename: 'hero-v2.png',
          mimeType: 'image/png',
          kind: 'image',
          path: 'assets/hero-v2.png',
          byteLength: 5,
        }
      }, NOW)
      return openSession(project)
    })()
    const next = updateV9SlideRuntimeAsset(
      withNewAsset,
      layerTarget(withNewAsset, 'runtime-layer-main'),
      'hero',
      'asset-hero-v2',
      NOW,
    )
    const layer = sceneLayers(next).find(
      (item) => item.layerItemId === 'runtime-layer-main',
    )
    if (layer?.kind !== 'runtime') throw new Error('expected runtime layer')
    expect(layer.runtime.assets.hero).toEqual({ assetId: 'asset-hero-v2' })
    expect(courseProjectDocumentSchema.parse(next.history.present)).toEqual(
      next.history.present,
    )
  })

  it('writes component props on the base layer in the base scene', () => {
    const state = baseSession()
    const next = updateV9SlideComponentProps(
      state,
      layerTarget(state, 'component-layer-card'),
      { title: '新卡片标题', image: 'asset-card' },
      NOW,
    )
    const layer = sceneLayers(next).find(
      (item) => item.layerItemId === 'component-layer-card',
    )
    if (layer?.kind !== 'component') throw new Error('expected component layer')
    expect(layer.props).toEqual({ title: '新卡片标题', image: 'asset-card' })
  })

  it('rejects props that the manifest does not declare as editable', () => {
    const state = baseSession()
    expect(() => updateV9SlideComponentProps(
      state,
      layerTarget(state, 'component-layer-card'),
      { title: '新标题', image: 'asset-card', internal: true },
      NOW,
    )).toThrow('暂不支持修改')
    const layer = sceneLayers(state).find(
      (item) => item.layerItemId === 'component-layer-card',
    )
    if (layer?.kind !== 'component') throw new Error('expected component layer')
    expect(layer.props).toEqual({ title: '卡片标题', image: 'asset-card' })
  })

  it('stores only the sparse props diff as a named-state override', () => {
    const withState = addV9SlidePresentationState(baseSession(), '讲解态', NOW)
    const named = activateV9SlidePresentationState(
      withState,
      withState.selection.stateId!,
    )
    const next = updateV9SlideComponentProps(
      named,
      layerTarget(named, 'component-layer-card'),
      { title: '状态标题', image: 'asset-card' },
      NOW,
    )
    const location = next.history.present.locations.find(
      (candidate) => candidate.id === next.selection.locationId,
    )
    if (!location || location.kind !== 'slide-scene') throw new Error('expected slide')
    const surface = next.history.present.surfaces.find(
      (candidate) => candidate.id === location.surfaceId,
    )
    if (!surface || surface.type !== 'slide') throw new Error('expected slide')
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)!
    const base = scene.layerItems.find(
      (item) => item.layerItemId === 'component-layer-card',
    )
    if (base?.kind !== 'component') throw new Error('expected component layer')
    expect(base.props).toEqual({ title: '卡片标题', image: 'asset-card' })
    const state = scene.presentation?.states.find(
      (candidate) => candidate.id === named.selection.stateId,
    )
    expect(state?.layerItemOverrides['component-layer-card']?.componentProps)
      .toEqual({ title: '状态标题' })
  })

  it('clears a named-state props override when it matches the base again', () => {
    const withState = addV9SlidePresentationState(baseSession(), '讲解态', NOW)
    const named = activateV9SlidePresentationState(
      withState,
      withState.selection.stateId!,
    )
    const overridden = updateV9SlideComponentProps(
      named,
      layerTarget(named, 'component-layer-card'),
      { title: '状态标题', image: 'asset-card' },
      NOW,
    )
    const restored = updateV9SlideComponentProps(
      overridden,
      layerTarget(overridden, 'component-layer-card'),
      { title: '卡片标题', image: 'asset-card' },
      NOW,
    )
    const location = restored.history.present.locations.find(
      (candidate) => candidate.id === restored.selection.locationId,
    )
    if (!location || location.kind !== 'slide-scene') throw new Error('expected slide')
    const surface = restored.history.present.surfaces.find(
      (candidate) => candidate.id === location.surfaceId,
    )
    if (!surface || surface.type !== 'slide') throw new Error('expected slide')
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)!
    const state = scene.presentation?.states.find(
      (candidate) => candidate.id === named.selection.stateId,
    )
    expect(state?.layerItemOverrides['component-layer-card']).toBeUndefined()
  })

  it('applies generic layer patches to component layers', () => {
    const state = baseSession()
    const renamed = updateV9SlideLayer(
      state,
      'component-layer-card',
      { label: '重命名组件', visible: false, locked: true },
      NOW,
    )
    const layer = sceneLayers(renamed).find(
      (item) => item.layerItemId === 'component-layer-card',
    )
    if (layer?.kind !== 'component') throw new Error('expected component layer')
    expect(layer.label).toBe('重命名组件')
    expect(layer.visible).toBe(false)
    expect(layer.locked).toBe(true)
  })

  it('accepts common property patches on component layers through the native node path', () => {
    const state = baseSession()
    const next = updateV9SlideNativeNode(
      state,
      'component-layer-card',
      { x: 100, y: 200, opacity: 0.5, rotation: 15 },
      NOW,
    )
    const layer = sceneLayers(next).find(
      (item) => item.layerItemId === 'component-layer-card',
    )
    if (layer?.kind !== 'component') throw new Error('expected component layer')
    expect(layer.frame).toMatchObject({ x: 100, y: 200 })
    expect(layer.opacity).toBe(0.5)
    expect(layer.rotation).toBe(15)
  })

  it('selects component layers together with native layers', () => {
    const state = baseSession()
    const selected = selectV9SlideVerticalSlice(state, {
      nodeIds: ['component-layer-card'],
      additive: false,
    })
    expect(selected.selection.selectionIds).toEqual(['component-layer-card'])
    expect(selected.history).toBe(state.history)
  })
})

describe('V9 dynamic authoringAddress stability', () => {
  it('derives a stable address from the layerItemId and data key', () => {
    const state = baseSession()
    const snapshot = buildV9SlideWorkspaceSnapshot(state)
    const sceneId = snapshot.previewDocument.id
    const runtimeAddress = makeAuthoringAddress({
      projectId: state.history.present.id,
      scope: 'scene',
      surfaceId: 'slide:main',
      sceneId,
      carrier: 'runtime',
      layerItemId: 'runtime-layer-main',
      field: 'content.values.title',
    })
    expect(runtimeAddress).toContain('runtime-layer-main')
    expect(runtimeAddress).toContain(encodeURIComponent('content.values.title'))

    const componentAddress = makeAuthoringAddress({
      projectId: state.history.present.id,
      scope: 'scene',
      surfaceId: 'slide:main',
      sceneId,
      carrier: 'component',
      layerItemId: 'component-layer-card',
      field: 'props.title',
    })
    expect(componentAddress).toContain('component-layer-card')
    // The projected proxy node id IS the stable layerItemId, so the address
    // survives save/reopen without any transient hitId.
    const reopened = openSession(state.history.present)
    const reopenedSnapshot = buildV9SlideWorkspaceSnapshot(reopened)
    expect(reopenedSnapshot.previewDocument.nodes.find(
      (node) => node.id === 'component-layer-card',
    )?.id).toBe('component-layer-card')
    expect(reopenedSnapshot.sceneRuntimeLayerItemId).toBe('runtime-layer-main')
  })
})
