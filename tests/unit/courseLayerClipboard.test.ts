import { describe, expect, it } from 'vitest'
import {
  copyCourseLayerItems,
  CourseLayerClipboardError,
  cutCourseLayerItems,
  duplicateCourseLayerItems,
  pasteCourseLayerItems,
} from '@/renderer/course/courseLayerClipboard'
import {
  addCourseSurface,
  addImageLayer,
  addSlideTextLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type {
  ComponentLayerItem,
  CourseProjectDocument,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'

const NOW = '2026-08-14T08:00:00.000Z'

function componentItem(): ComponentLayerItem {
  return {
    layerItemId: 'component-source',
    label: '坐标探究组件',
    kind: 'component',
    frame: { mode: 'absolute', x: 410, y: 70, width: 300, height: 180 },
    order: 4,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: 'component.graph', version: '1.0.0' },
    props: { axis: 'x' },
  }
}

function runtimeItem(): RuntimeLayerItem {
  return {
    layerItemId: 'runtime-source',
    label: '动态演示',
    kind: 'runtime',
    frame: { mode: 'absolute', x: 160, y: 230, width: 460, height: 260 },
    order: 3,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: 'export default function mount() {}',
      content: { values: { title: '演示' } },
      assets: {},
      nodeBindings: {
        internalText: 'text-source',
        externalShape: 'external-shape',
      },
    },
  }
}

function sourceProject(): {
  project: CourseProjectDocument
  surfaceId: string
  sceneId: string
  controllerId: string
} {
  let project = createCourseProject({ id: 'clipboard-source', now: NOW })
  const slide = project.surfaces[0]
  if (slide?.type !== 'slide') throw new Error('expected slide')
  const surfaceId = slide.id
  const sceneId = slide.scenes[0]!.id
  project = addSlideTextLayer(project, surfaceId, sceneId, '可编辑文字', {
    id: 'text-source',
    now: NOW,
  })
  project = updateCourseProject(project, (draft) => {
    draft.componentPackages['component.graph'] = {
      packageId: 'component.graph',
      version: '1.0.0',
      name: '坐标探究组件',
      manifestPath: 'components/component.graph/manifest.json',
      runtimePath: 'components/component.graph/runtime.js',
      contentSha256: 'a'.repeat(64),
    }
    const currentSlide = draft.surfaces.find((surface) => surface.id === surfaceId)
    if (currentSlide?.type !== 'slide') throw new Error('expected slide')
    const text = currentSlide.scenes[0]!.layerItems[0]!
    text.locked = true
    currentSlide.scenes[0]!.layerItems.push(runtimeItem())
    currentSlide.surfaceLayerItems.push({
      item: componentItem(),
      visibility: { mode: 'all', locationIds: [] },
    })
    const externalShape = structuredClone(text)
    externalShape.layerItemId = 'external-shape'
    externalShape.label = '外部图层'
    externalShape.order = 5
    currentSlide.scenes[0]!.layerItems.push(externalShape)
  }, NOW)
  return {
    project,
    surfaceId,
    sceneId,
    controllerId: project.globalLayerItems[0]!.item.layerItemId,
  }
}

describe('Course Project V9 layer clipboard', () => {
  it('copies every unified LayerItem carrier with source scope and no live references', () => {
    const source = sourceProject()
    const snapshot = copyCourseLayerItems(source.project, [
      {
        surfaceId: source.surfaceId,
        sceneId: source.sceneId,
        source: 'scene',
        layerItemId: 'runtime-source',
      },
      {
        surfaceId: source.surfaceId,
        source: 'global',
        layerItemId: source.controllerId,
      },
      {
        surfaceId: source.surfaceId,
        source: 'surface',
        layerItemId: 'component-source',
      },
      {
        surfaceId: source.surfaceId,
        sceneId: source.sceneId,
        source: 'scene',
        layerItemId: 'text-source',
      },
    ])

    expect(snapshot.entries.map((entry) => entry.item.layerItemId)).toEqual([
      'text-source',
      source.controllerId,
      'runtime-source',
      'component-source',
    ])
    expect(snapshot.entries.map((entry) => entry.item.kind)).toEqual([
      'native',
      'native',
      'runtime',
      'component',
    ])
    expect(snapshot.entries.map((entry) => entry.source.scope)).toEqual([
      'scene',
      'global',
      'scene',
      'surface',
    ])
    expect(snapshot.entries[1]!.source.visibility).toEqual({ mode: 'all', locationIds: [] })
    expect(snapshot.entries[3]!.source.visibility).toEqual({ mode: 'all', locationIds: [] })

    snapshot.entries[0]!.item.label = '只修改剪贴板'
    const originalText = source.project.surfaces[0]
    expect(originalText.type === 'slide'
      ? originalText.scenes[0]!.layerItems[0]!.label
      : '').not.toBe('只修改剪贴板')
  })

  it('pastes a mixed selection to Spatial in one revision with new ids, offset and remapped internal bindings', () => {
    const source = sourceProject()
    const snapshot = copyCourseLayerItems(source.project, [
      { surfaceId: source.surfaceId, sceneId: source.sceneId, source: 'scene', layerItemId: 'text-source' },
      { surfaceId: source.surfaceId, source: 'global', layerItemId: source.controllerId },
      { surfaceId: source.surfaceId, sceneId: source.sceneId, source: 'scene', layerItemId: 'runtime-source' },
      { surfaceId: source.surfaceId, source: 'surface', layerItemId: 'component-source' },
    ])
    const withSpatial = addCourseSurface(source.project, 'spatial-2d', {
      id: 'clipboard-spatial',
      now: NOW,
    })
    const sourceSlideBefore = withSpatial.surfaces.find((surface) => surface.id === source.surfaceId)
    if (sourceSlideBefore?.type !== 'slide') throw new Error('expected source slide')
    const unrelatedOrders = {
      scene: sourceSlideBefore.scenes[0]!.layerItems.map((item) => [item.layerItemId, item.order]),
      surface: sourceSlideBefore.surfaceLayerItems.map(({ item }) => [item.layerItemId, item.order]),
    }
    const revision = withSpatial.revision
    const result = pasteCourseLayerItems(withSpatial, snapshot, {
      surfaceId: 'clipboard-spatial',
      scopedVisibility: { mode: 'reset-for-target' },
    }, {
      now: NOW,
      createLayerItemId: ({ index }) => `pasted-${index}`,
    })

    expect(result.project.revision).toBe(revision + 1)
    expect(result.pastedIds).toEqual(['pasted-0', 'pasted-1', 'pasted-2', 'pasted-3'])
    const spatial = result.project.surfaces.find((surface) => surface.id === 'clipboard-spatial')
    if (spatial?.type !== 'spatial-2d') throw new Error('expected spatial')
    const pasted = spatial.world.layerItems
    expect(pasted.map((item) => item.layerItemId)).toEqual(result.pastedIds)
    const pastedOrders = pasted.map((item) => item.order)
    expect(pastedOrders.slice(1).map((order, index) => order - pastedOrders[index]!)).toEqual([1, 1, 1])
    expect(pasted[0]).toMatchObject({
      kind: 'native',
      locked: true,
      frame: { x: 144, y: 144 },
    })
    const runtime = pasted.find((item) => item.layerItemId === 'pasted-2')
    if (runtime?.kind !== 'runtime') throw new Error('expected runtime')
    expect(runtime.runtime.nodeBindings).toEqual({
      internalText: 'pasted-0',
      externalShape: 'external-shape',
    })
    expect(result.project.globalLayerItems).toHaveLength(1)
    expect(result.project.globalLayerItems[0]!.item.layerItemId).toBe(source.controllerId)
    expect(result.project.globalLayerItems[0]!.item.order).toBeGreaterThan(Math.max(...pastedOrders))
    const sourceSlideAfter = result.project.surfaces.find((surface) => surface.id === source.surfaceId)
    if (sourceSlideAfter?.type !== 'slide') throw new Error('expected source slide')
    expect(sourceSlideAfter.surfaceLayerItems).toHaveLength(1)
    expect({
      scene: sourceSlideAfter.scenes[0]!.layerItems.map((item) => [item.layerItemId, item.order]),
      surface: sourceSlideAfter.surfaceLayerItems.map(({ item }) => [item.layerItemId, item.order]),
    }).toEqual(unrelatedOrders)
    expect(() => courseProjectDocumentSchema.parse(result.project)).not.toThrow()
  })

  it('duplicates a mixed selection in place without flattening global or shared scopes', () => {
    const source = sourceProject()
    const revision = source.project.revision
    const result = duplicateCourseLayerItems(source.project, [
      { surfaceId: source.surfaceId, sceneId: source.sceneId, source: 'scene', layerItemId: 'text-source' },
      { surfaceId: source.surfaceId, source: 'global', layerItemId: source.controllerId },
      { surfaceId: source.surfaceId, sceneId: source.sceneId, source: 'scene', layerItemId: 'runtime-source' },
      { surfaceId: source.surfaceId, source: 'surface', layerItemId: 'component-source' },
    ], {
      now: NOW,
      createLayerItemId: ({ index }) => `duplicate-${index}`,
    })

    expect(result.project.revision).toBe(revision + 1)
    expect(result.duplicatedIds).toEqual(['duplicate-0', 'duplicate-1', 'duplicate-2', 'duplicate-3'])
    expect(result.sources.map((entry) => entry.scope)).toEqual(['scene', 'global', 'scene', 'surface'])
    const slide = result.project.surfaces.find((surface) => surface.id === source.surfaceId)
    if (slide?.type !== 'slide') throw new Error('expected slide')
    expect(result.project.globalLayerItems.some(({ item }) => item.layerItemId === 'duplicate-1')).toBe(true)
    expect(slide.surfaceLayerItems.some(({ item }) => item.layerItemId === 'duplicate-3')).toBe(true)
    expect(slide.scenes[0]!.layerItems.some((item) => item.layerItemId === 'duplicate-0')).toBe(true)
    const runtime = slide.scenes[0]!.layerItems.find((item) => item.layerItemId === 'duplicate-2')
    if (runtime?.kind !== 'runtime') throw new Error('expected runtime')
    expect(runtime.runtime.nodeBindings).toEqual({
      internalText: 'duplicate-0',
      externalShape: 'external-shape',
    })
    expect(() => courseProjectDocumentSchema.parse(result.project)).not.toThrow()
  })

  it('uses an explicit visibility policy when the current free container is a Flow surface', () => {
    const source = sourceProject()
    const snapshot = copyCourseLayerItems(source.project, [{
      surfaceId: source.surfaceId,
      sceneId: source.sceneId,
      source: 'scene',
      layerItemId: 'text-source',
    }])
    const withFlow = addCourseSurface(source.project, 'flow', { id: 'clipboard-flow', now: NOW })
    const flowLocationId = withFlow.locations.find((location) => (
      location.kind === 'flow-block' && location.surfaceId === 'clipboard-flow'
    ))!.id
    const result = pasteCourseLayerItems(withFlow, snapshot, {
      surfaceId: 'clipboard-flow',
      scopedVisibility: { mode: 'current-location', locationId: flowLocationId },
    }, {
      now: NOW,
      createLayerItemId: () => 'flow-pasted',
    })
    const flow = result.project.surfaces.find((surface) => surface.id === 'clipboard-flow')
    if (flow?.type !== 'flow') throw new Error('expected flow')
    expect(flow.surfaceLayerItems).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({ layerItemId: 'flow-pasted' }),
        visibility: { mode: 'include', locationIds: [flowLocationId] },
      }),
    ])
    expect(() => pasteCourseLayerItems(withFlow, snapshot, {
      surfaceId: 'clipboard-flow',
      scopedVisibility: { mode: 'preserve-source' },
    })).toThrow(/Scoped visibility/)
  })

  it('cuts an unlocked multi-scope selection in one revision and keeps the captured payload pasteable', () => {
    const source = sourceProject()
    const revision = source.project.revision
    const cut = cutCourseLayerItems(source.project, [
      {
        surfaceId: source.surfaceId,
        sceneId: source.sceneId,
        source: 'scene',
        layerItemId: 'runtime-source',
      },
      {
        surfaceId: source.surfaceId,
        source: 'surface',
        layerItemId: 'component-source',
      },
    ], NOW)
    expect(cut.project.revision).toBe(revision + 1)
    expect(cut.cutIds).toEqual(['runtime-source', 'component-source'])
    const slide = cut.project.surfaces[0]
    if (slide.type !== 'slide') throw new Error('expected slide')
    expect(slide.scenes[0]!.layerItems.some((item) => item.layerItemId === 'runtime-source')).toBe(false)
    expect(slide.surfaceLayerItems).toHaveLength(0)
    expect(cut.clipboard.entries.map((entry) => entry.item.layerItemId)).toEqual([
      'runtime-source',
      'component-source',
    ])
    expect(() => courseProjectDocumentSchema.parse(cut.project)).not.toThrow()
  })

  it('allows copying a locked layer, preserves the lock on paste, and rejects cutting it', () => {
    const source = sourceProject()
    const selection = [{
      surfaceId: source.surfaceId,
      sceneId: source.sceneId,
      source: 'scene' as const,
      layerItemId: 'text-source',
    }]
    const snapshot = copyCourseLayerItems(source.project, selection)
    const pasted = pasteCourseLayerItems(source.project, snapshot, {
      surfaceId: source.surfaceId,
      sceneId: source.sceneId,
      scopedVisibility: { mode: 'reset-for-target' },
    }, {
      createLayerItemId: () => 'locked-copy',
    })
    const slide = pasted.project.surfaces[0]
    if (slide.type !== 'slide') throw new Error('expected slide')
    expect(slide.scenes[0]!.layerItems.find((item) => item.layerItemId === 'locked-copy')?.locked).toBe(true)
    expect(() => cutCourseLayerItems(source.project, selection)).toThrow(/已锁定/)
  })

  it('flattens a scoped source into the target Slide scene and rejects an inapplicable policy', () => {
    const source = sourceProject()
    const snapshot = copyCourseLayerItems(source.project, [{
      surfaceId: source.surfaceId,
      source: 'surface',
      layerItemId: 'component-source',
    }])
    const result = pasteCourseLayerItems(source.project, snapshot, {
      surfaceId: source.surfaceId,
      sceneId: source.sceneId,
      scopedVisibility: { mode: 'reset-for-target' },
    }, {
      createLayerItemId: () => 'scene-component-copy',
    })
    const slide = result.project.surfaces[0]
    if (slide.type !== 'slide') throw new Error('expected slide')
    expect(slide.scenes[0]!.layerItems.some((item) => item.layerItemId === 'scene-component-copy')).toBe(true)
    expect(slide.surfaceLayerItems).toHaveLength(1)
    expect(() => pasteCourseLayerItems(source.project, snapshot, {
      surfaceId: source.surfaceId,
      sceneId: source.sceneId,
      scopedVisibility: { mode: 'preserve-source' },
    })).toThrow(/Slide/)
  })

  it('does not create a paste with missing media or component dependencies', () => {
    let source = createCourseProject({ id: 'asset-source', now: NOW })
    const slide = source.surfaces[0]
    if (slide.type !== 'slide') throw new Error('expected slide')
    source = updateCourseProject(source, (draft) => {
      draft.assets['source-image'] = {
        id: 'source-image',
        filename: 'source.png',
        mimeType: 'image/png',
        kind: 'image',
        path: 'assets/source.png',
        byteLength: 100,
        width: 320,
        height: 180,
      }
    }, NOW)
    source = addImageLayer(source, {
      surfaceId: slide.id,
      sceneId: slide.scenes[0]!.id,
      assetId: 'source-image',
      id: 'source-image-layer',
      now: NOW,
    })
    const snapshot = copyCourseLayerItems(source, [{
      surfaceId: slide.id,
      sceneId: slide.scenes[0]!.id,
      source: 'scene',
      layerItemId: 'source-image-layer',
    }])
    const target = createCourseProject({ id: 'asset-target', now: NOW })
    const targetSlide = target.surfaces[0]
    if (targetSlide.type !== 'slide') throw new Error('expected slide')
    expect(() => pasteCourseLayerItems(target, snapshot, {
      surfaceId: targetSlide.id,
      sceneId: targetSlide.scenes[0]!.id,
      scopedVisibility: { mode: 'reset-for-target' },
    })).toThrow(/素材不存在/)
  })

  it('reports stale source selection and id collisions in Chinese instead of silently skipping', () => {
    const source = sourceProject()
    expect(() => copyCourseLayerItems(source.project, [{
      surfaceId: source.surfaceId,
      sceneId: source.sceneId,
      source: 'scene',
      layerItemId: 'missing-layer',
    }])).toThrowError(CourseLayerClipboardError)

    const snapshot = copyCourseLayerItems(source.project, [{
      surfaceId: source.surfaceId,
      sceneId: source.sceneId,
      source: 'scene',
      layerItemId: 'text-source',
    }])
    expect(() => pasteCourseLayerItems(source.project, snapshot, {
      surfaceId: source.surfaceId,
      sceneId: source.sceneId,
      scopedVisibility: { mode: 'reset-for-target' },
    }, {
      createLayerItemId: () => 'text-source',
    })).toThrow(/新图层 ID 已存在/)
  })
})
