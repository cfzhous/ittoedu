import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { buildFlowEditorView } from '@/renderer/course/flowEditorView'
import type {
  CourseProjectDocument,
  FlowBlock,
} from '@/shared/courseProjectTypes'
import type { FormulaAstNode } from '@/shared/projectTypes'

const NOW = '2026-08-15T00:00:00.000Z'

function flowBlocksFixture(): FlowBlock[] {
  const formulaAst: FormulaAstNode = {
    type: 'row',
    children: [
      { type: 'token', value: 'a' },
      { type: 'operator', value: '+' },
      { type: 'token', value: 'b' },
    ],
  }
  return [
    { id: 'block-h1', type: 'heading', level: 1, text: '第一章 开始' },
    { id: 'block-paragraph', type: 'paragraph', text: '正文段落' },
    {
      id: 'block-list',
      type: 'list',
      ordered: true,
      items: [
        { id: 'list-item-1', text: '项目一' },
        { id: 'list-item-2', text: '项目二' },
      ],
    },
    { id: 'block-quote', type: 'quote', text: '引用文字', citation: '出处' },
    { id: 'block-divider', type: 'divider' },
    {
      id: 'block-media',
      type: 'media',
      assetId: 'asset-image',
      mediaKind: 'image',
      altText: '示意图',
      caption: '封面图',
      layout: 'content-width',
    },
    {
      id: 'block-table',
      type: 'table',
      caption: '表格标题',
      columns: [
        { id: 'column-a', header: '列 A' },
        { id: 'column-b', header: '列 B' },
      ],
      rows: [
        { id: 'row-1', cells: { 'column-a': 'A1', 'column-b': 'B1' } },
      ],
    },
    {
      id: 'block-formula',
      type: 'formula',
      formulaId: 'formula-1',
      accessibleText: 'a 加 b',
      ast: formulaAst,
    },
    { id: 'block-code', type: 'code', language: 'javascript', code: 'const a = 1;' },
    {
      id: 'block-callout',
      type: 'callout',
      tone: 'note',
      title: '提示',
      body: '这是提示内容',
    },
    {
      id: 'block-section',
      type: 'section',
      title: '章节 A',
      collapsedByDefault: true,
      blocks: [
        { id: 'block-h2', type: 'heading', level: 2, text: '小节 1' },
        { id: 'block-section-p', type: 'paragraph', text: '节内正文' },
      ],
    },
    {
      id: 'block-component',
      type: 'component',
      component: { packageId: 'demo-component', version: '1.0.0' },
      props: {},
      staticFallbackAssetId: 'asset-component-fallback',
    },
  ]
}

function flowFixture(): {
  project: CourseProjectDocument
  locationId: string
  surfaceId: string
  flowSurfaceIndex: number
  controllerId: string
} {
  let project = createCourseProject({
    id: 'course-flow-view',
    title: 'Flow 投影测试',
    now: NOW,
  })
  project = addCourseSurface(project, 'flow', {
    id: 'flow-surface',
    title: '流式讲义',
    now: NOW,
  })
  const flowSurfaceIndex = project.surfaces.findIndex((surface) => surface.id === 'flow-surface')
  const flowSurface = project.surfaces[flowSurfaceIndex]
  if (!flowSurface || flowSurface.type !== 'flow') throw new Error('expected flow surface')
  const location = project.locations.find(
    (candidate) => candidate.kind === 'flow-block' && candidate.surfaceId === 'flow-surface',
  )
  if (!location || location.kind !== 'flow-block') throw new Error('expected flow location')
  const locationId = location.id
  const controllerId = project.globalLayerItems[0]!.item.layerItemId

  project = updateCourseProject(project, (draft) => {
    const flow = draft.surfaces.find(
      (candidate) => candidate.id === 'flow-surface',
    )
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    flow.blocks = flowBlocksFixture()

    const flowLocation = draft.locations.find(
      (candidate) => candidate.id === locationId,
    )
    if (!flowLocation || flowLocation.kind !== 'flow-block') {
      throw new Error('expected flow location')
    }
    flowLocation.blockId = 'block-h1'
    flowLocation.label = '流式讲义 · 第一章'

    draft.assets['asset-image'] = {
      id: 'asset-image',
      filename: 'cover.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'media/cover.png',
      byteLength: 1024,
      width: 640,
      height: 360,
    }
    draft.assets['asset-component-fallback'] = {
      id: 'asset-component-fallback',
      filename: 'component.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'media/component.png',
      byteLength: 2048,
      width: 320,
      height: 180,
    }
    draft.componentPackages['demo-component'] = {
      packageId: 'demo-component',
      version: '1.0.0',
      name: '演示组件',
      manifestPath: 'components/demo-component/manifest.json',
      runtimePath: 'components/demo-component/runtime.js',
      contentSha256: 'a'.repeat(64),
    }

    const controller = draft.globalLayerItems[0]!.item
    controller.order = 50
    const hiddenGlobal = structuredClone(controller)
    hiddenGlobal.layerItemId = 'global-hidden'
    hiddenGlobal.label = '作用域外全局层'
    hiddenGlobal.order = 10
    draft.globalLayerItems.unshift({
      item: hiddenGlobal,
      visibility: { mode: 'exclude', locationIds: [locationId] },
    })

    const sharedSurface = structuredClone(controller)
    sharedSurface.layerItemId = 'surface-shared'
    sharedSurface.label = '表面共享层'
    sharedSurface.order = 20
    const hiddenSurface = structuredClone(controller)
    hiddenSurface.layerItemId = 'surface-hidden'
    hiddenSurface.label = '表面隐藏层'
    hiddenSurface.order = 30
    hiddenSurface.visible = false
    flow.surfaceLayerItems.push(
      {
        item: sharedSurface,
        visibility: { mode: 'include', locationIds: [locationId] },
      },
      {
        item: hiddenSurface,
        visibility: { mode: 'all', locationIds: [] },
      },
    )
  }, NOW)

  return {
    project,
    locationId,
    surfaceId: 'flow-surface',
    flowSurfaceIndex,
    controllerId,
  }
}

describe('Flow editor read projection', () => {
  it('builds a deep-frozen projection with stable block addresses and does not mutate the project', () => {
    const fixture = flowFixture()
    const before = structuredClone(fixture.project)
    const view = buildFlowEditorView({
      project: fixture.project,
      locationId: fixture.locationId,
    })

    expect(view).toMatchObject({
      projectId: 'course-flow-view',
      revision: fixture.project.revision,
      locationId: fixture.locationId,
      surfaceId: 'flow-surface',
      surfaceTitle: '流式讲义',
      activeBlockId: 'block-h1',
      layout: { readingWidth: 760, wideContentWidth: 1120 },
    })
    expect(view.blocks).toHaveLength(14)
    expect(view.blocks[0]).toMatchObject({
      blockId: 'block-h1',
      parentId: null,
      depth: 0,
      index: 0,
      stableAddress: 'surface:flow-surface/block:block-h1',
      label: '第一章 开始',
    })
    expect(view.blocks.find((block) => block.blockId === 'block-section')).toMatchObject({
      parentId: null,
      depth: 0,
      index: 10,
      stableAddress: 'surface:flow-surface/block:block-section',
      label: '章节 A',
    })
    expect(
      view.blocks
        .filter((block) => block.parentId === 'block-section')
        .map((block) => [block.blockId, block.depth, block.index]),
    ).toEqual([
      ['block-h2', 1, 0],
      ['block-section-p', 1, 1],
    ])

    expect(fixture.project).toEqual(before)
    expect(view.blocks[0]?.block).not.toBe(
      (fixture.project.surfaces[fixture.flowSurfaceIndex] as { blocks: unknown[] }).blocks[0],
    )
    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.isFrozen(view.blocks)).toBe(true)
    expect(Object.isFrozen(view.blocks[0]?.block)).toBe(true)
    expect(() => {
      ;(view.blocks as unknown as unknown[]).push({})
    }).toThrow()
  })

  it('traverses nested sections and builds a nested outline with depth, level and stable path', () => {
    const fixture = flowFixture()
    const view = buildFlowEditorView({
      project: fixture.project,
      locationId: fixture.locationId,
    })

    expect(view.outline.map((entry) => [entry.blockId, entry.kind, entry.depth, entry.level])).toEqual([
      ['block-h1', 'heading', 0, 1],
      ['block-section', 'section', 0, 1],
      ['block-h2', 'heading', 1, 3],
    ])
    expect(view.outline[0]?.path).toEqual([
      'surfaces', fixture.flowSurfaceIndex, 'blocks', 0,
    ])
    expect(view.outline[1]?.path).toEqual([
      'surfaces', fixture.flowSurfaceIndex, 'blocks', 10,
    ])
    expect(view.outline[2]?.path).toEqual([
      'surfaces', fixture.flowSurfaceIndex, 'blocks', 10, 'blocks', 0,
    ])
  })

  it('derives the active block from the selected flow-block location', () => {
    const fixture = flowFixture()
    const view = buildFlowEditorView({
      project: fixture.project,
      locationId: fixture.locationId,
    })
    expect(view.activeBlockId).toBe('block-h1')

    const relocated = updateCourseProject(fixture.project, (draft) => {
      draft.locations.push({
        id: 'location-h2',
        label: '流式讲义 · 小节 1',
        kind: 'flow-block',
        surfaceId: 'flow-surface',
        blockId: 'block-h2',
      })
    }, NOW)
    const nestedView = buildFlowEditorView({
      project: relocated,
      locationId: 'location-h2',
    })
    expect(nestedView.activeBlockId).toBe('block-h2')
    expect(nestedView.revision).toBe(relocated.revision)
  })

  it('rejects unknown locations and non-Flow locations', () => {
    const fixture = flowFixture()
    expect(() => buildFlowEditorView({
      project: fixture.project,
      locationId: 'missing-location',
    })).toThrow('找不到课程位置：missing-location')

    const slideLocation = fixture.project.locations.find(
      (candidate) => candidate.kind === 'slide-scene',
    )
    if (!slideLocation) throw new Error('expected slide location')
    expect(() => buildFlowEditorView({
      project: fixture.project,
      locationId: slideLocation.id,
    })).toThrow(`FlowEditorView 只接受 Flow 块位置：${slideLocation.id}`)
  })

  it('materializes unified global and surface layer items sorted by sparse order and stable id', () => {
    const fixture = flowFixture()
    const view = buildFlowEditorView({
      project: fixture.project,
      locationId: fixture.locationId,
    })

    expect(view.globalLayerItems.map(({ selectionId, item }) => [selectionId, item.order])).toEqual([
      ['global-hidden', 10],
      [fixture.controllerId, 50],
    ])
    expect(view.globalLayerItems[0]).toMatchObject({
      source: 'global',
      scopedVisible: false,
      effectiveVisible: false,
      selectionId: 'global-hidden',
      item: {
        layerItemId: 'global-hidden',
        label: '作用域外全局层',
        order: 10,
        visible: true,
      },
    })
    expect(view.globalLayerItems[1]).toMatchObject({
      source: 'global',
      scopedVisible: true,
      effectiveVisible: true,
      selectionId: fixture.controllerId,
    })

    expect(view.surfaceLayerItems.map(({ selectionId, item }) => [selectionId, item.order])).toEqual([
      ['surface-shared', 20],
      ['surface-hidden', 30],
    ])
    expect(view.surfaceLayerItems[0]).toMatchObject({
      source: 'surface',
      scopedVisible: true,
      effectiveVisible: true,
      selectionId: 'surface-shared',
    })
    expect(view.surfaceLayerItems[1]).toMatchObject({
      source: 'surface',
      scopedVisible: true,
      effectiveVisible: false,
      selectionId: 'surface-hidden',
      item: { visible: false },
    })

    expect(view.effectiveLayers.map((layer) => [layer.source, layer.id])).toEqual([
      ...view.blocks.map((block) => ['flow-block', block.blockId]),
      ['surface', 'surface-shared'],
      ['surface', 'surface-hidden'],
      ['global', 'global-hidden'],
      ['global', fixture.controllerId],
    ])
    expect(view.effectiveLayers.find((layer) => layer.id === 'block-paragraph')).toMatchObject({
      source: 'flow-block',
      canLock: false,
      canHide: false,
      canReorder: true,
      authoringAddress: 'surface:flow-surface/block:block-paragraph',
    })
    expect(view.effectiveLayers.find((layer) => layer.id === 'surface-shared')).toMatchObject({
      source: 'surface',
      canLock: true,
      ownerKey: 'surface:flow-surface',
    })
    expect(Object.isFrozen(view.globalLayerItems[0]?.item)).toBe(true)
    expect(Object.isFrozen(view.surfaceLayerItems[0]?.item)).toBe(true)
    expect(view.globalLayerItems[1]?.item).not.toBe(
      fixture.project.globalLayerItems[1]?.item,
    )
    expect(view.surfaceLayerItems[0]?.item).not.toBe(
      (fixture.project.surfaces[fixture.flowSurfaceIndex] as {
        surfaceLayerItems: Array<{ item: unknown }>
      }).surfaceLayerItems[0]?.item,
    )
  })
})
