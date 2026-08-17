import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { FlowSurfaceDocument, SpatialSurfaceDocument } from '@/player/surfaces'
import type {
  ComponentLayerItem,
  CourseProjectDocument,
  LayerItemBase,
  NativeLayerItem,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'
import { getEffectiveCourseLayerOrder } from '@/shared/courseProjectModel'
import { parseFormulaLinear } from '@/shared/formulaLinear'
import { openCourseProjectArchive } from '@/renderer/project/courseProjectArchive'
import { bytesToDataUrl } from '@/renderer/export/base64'
import { buildCoursePptx } from '@/renderer/export/course/buildCoursePptx'
import { buildCoursePrintArtifacts } from '@/renderer/export/course/buildCoursePrintArtifacts'
import {
  buildCourseExportDifferenceReport,
  buildFlowDocx,
  buildFlowPrintHtml,
  buildMixedPrintPlan,
  buildSpatialPrintHtml,
  type FlowDocxAsset,
  type FlowDocxLayerEntry,
} from '@/renderer/export/course'

function exportFlow(): FlowSurfaceDocument {
  return {
    id: 'flow-export',
    type: 'flow',
    title: '函数复习',
    surfaceLayerItems: [],
    layout: { readingWidth: 760, wideContentWidth: 1040 },
    blocks: [
      { id: 'h1', type: 'heading', level: 1, text: '函数概念' },
      { id: 'p1', type: 'paragraph', text: '自变量与因变量。' },
      { id: 'list', type: 'list', ordered: true, items: [{ id: 'domain', text: '定义域' }, { id: 'range', text: '值域' }] },
      {
        id: 'table',
        type: 'table',
        caption: '对照表',
        columns: [{ id: 'type', header: '类型' }, { id: 'feature', header: '特征' }],
        rows: [{ id: 'linear', cells: { type: '一次', feature: '直线' } }],
      },
      {
        id: 'image',
        type: 'media',
        assetId: 'plot',
        mediaKind: 'image',
        altText: '函数图像',
        caption: '图 1',
        layout: 'content-width',
      },
      {
        id: 'math-root',
        type: 'formula',
        formulaId: 'quadratic-root',
        accessibleText: '二次方程求根公式',
        ast: parseFormulaLinear('(-b \\pm \\sqrt{b^2-4*a*c})/(2*a)'),
      },
      {
        id: 'fold',
        type: 'section',
        title: '折叠结论',
        collapsedByDefault: true,
        blocks: [{ id: 'inside', type: 'paragraph', text: '导出过程' }],
      },
      {
        id: 'interactive',
        type: 'component',
        component: { packageId: 'graph-lab', version: '1.0.0' },
        props: {},
        staticFallbackAssetId: 'graph-lab-fallback',
      },
    ],
  }
}

function layerBase(id: string, order: number): LayerItemBase {
  return {
    layerItemId: id,
    label: id,
    frame: { mode: 'absolute', x: 20 + order, y: 30, width: 220, height: 100 },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
  }
}

function flowNative(order: number): NativeLayerItem {
  return {
    ...layerBase('layer-native', order),
    kind: 'native',
    content: {
      nativeType: 'text',
      data: {
        text: '可编辑画布文字', runs: [],
        style: {
          fontFamily: 'sans-serif', fontSize: 24, color: '#172033', bold: false,
          italic: false, underline: false, strike: false, emphasis: false,
          highlightColor: null, align: 'left', verticalAlign: 'top',
          writingMode: 'horizontal', lineSpacing: 1.3, letterSpacing: 0,
          padding: 4, overflow: 'fixed', backgroundColor: '#ffffff',
          backgroundOpacity: 0, cornerRadius: 0,
        },
      },
    },
  }
}

function flowComponent(order: number): ComponentLayerItem {
  return {
    ...layerBase('layer-component', order),
    kind: 'component',
    component: { packageId: 'component.layer', version: '1.0.0' },
    props: {},
    staticFallbackAssetId: 'component-layer-fallback',
  }
}

function flowRuntime(order: number): RuntimeLayerItem {
  return {
    ...layerBase('layer-runtime', order),
    kind: 'runtime',
    runtime: {
      protocol: 'surface-v1', runtimeApiVersion: 3, enabled: true, renderMode: 'dom',
      source: '', content: { values: {} }, assets: {},
      staticFallback: { assetId: 'runtime-layer-fallback', coverage: 'surface' },
    },
  }
}

function flowLayerEntries() {
  return [
    { item: flowRuntime(30), source: 'surface' as const },
    { item: flowNative(10), source: 'surface' as const },
    { item: flowComponent(20), source: 'global' as const },
  ]
}

function assertWellFormedXml(source: string): void {
  const parsed = new DOMParser().parseFromString(source, 'application/xml')
  expect(parsed.querySelector('parsererror'), source).toBeNull()
}

describe('Flow DOCX OOXML export', () => {
  it('writes native headings, lists, tables, image relationships and explicit fallbacks', () => {
    const result = buildFlowDocx(exportFlow(), {
      author: '教师',
      resolveAsset: (assetId) => assetId === 'plot'
        ? { mimeType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) }
        : undefined,
    })
    const files = unzipSync(result.bytes)
    expect(Object.keys(files).sort()).toEqual(expect.arrayContaining([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/numbering.xml',
      'word/_rels/document.xml.rels',
      'word/media/image1.png',
    ]))
    const documentXml = strFromU8(files['word/document.xml']!)
    const relationships = strFromU8(files['word/_rels/document.xml.rels']!)
    assertWellFormedXml(documentXml)
    assertWellFormedXml(relationships)
    expect(documentXml).toContain('<w:pStyle w:val="Heading1"/>')
    expect(documentXml).toContain('<w:numId w:val="2"/>')
    expect(documentXml).toContain('<w:tbl>')
    expect(documentXml).toContain('<m:oMathPara>')
    expect(documentXml).toContain('\\sqrt')
    expect(documentXml).toContain('导出过程')
    expect(documentXml).toContain('互动组件：graph-lab')
    expect(relationships).toContain('relationships/image')
    expect(relationships).toContain('Target="media/image1.png"')
    expect(result.report).toContainEqual(expect.objectContaining({ blockId: 'image', disposition: 'preserved' }))
    expect(result.report).toContainEqual(expect.objectContaining({ blockId: 'math-root', disposition: 'fallback' }))
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('math-root'),
      expect.stringContaining('interactive'),
    ]))
  })

  it('is deterministic and emits an image fallback when media is unavailable', () => {
    const first = buildFlowDocx(exportFlow())
    const second = buildFlowDocx(exportFlow())
    expect(first.bytes).toEqual(second.bytes)
    const documentXml = strFromU8(unzipSync(first.bytes)['word/document.xml']!)
    expect(documentXml).toContain('[图片后备：函数图像；图 1]')
  })

  it('writes the ordered Flow canvas layer section and reports every dynamic fallback', () => {
    const result = buildFlowDocx(exportFlow(), {
      effectiveLayerItems: flowLayerEntries(),
      resolveAsset: (assetId) => assetId.endsWith('-fallback')
        ? { mimeType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) }
        : undefined,
    })
    const documentXml = strFromU8(unzipSync(result.bytes)['word/document.xml']!)
    expect(documentXml).toContain('画布图层（按后→前层级）')
    expect(documentXml.indexOf('layer-native')).toBeLessThan(documentXml.indexOf('layer-component'))
    expect(documentXml.indexOf('layer-component')).toBeLessThan(documentXml.indexOf('layer-runtime'))
    expect(result.report.filter((item) => item.layerItemId).map((item) => item.layerItemId)).toEqual([
      'layer-native',
      'layer-component',
      'layer-runtime',
    ])
    expect(result.report).toEqual(expect.arrayContaining([
      expect.objectContaining({ layerItemId: 'layer-component', disposition: 'fallback' }),
      expect.objectContaining({ layerItemId: 'layer-runtime', disposition: 'fallback' }),
    ]))
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('layer-component'),
      expect.stringContaining('layer-runtime'),
    ]))
  })
})

function exportSpatial(): SpatialSurfaceDocument {
  return {
    id: 'spatial-export',
    type: 'spatial-2d',
    title: '地理空间关系',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'finite', x: 0, y: 0, width: 1000, height: 600 },
      layerItems: [
        {
          layerItemId: 'lab', label: '气候模拟', kind: 'component',
          frame: { mode: 'absolute', x: 100, y: 100, width: 180, height: 100 },
          order: 0, visible: true, locked: false, rotation: 0, opacity: 1,
          hitPolicy: 'auto', playbackInitialVisibility: 'inherit',
          component: { packageId: 'climate-lab', version: '1.0.0' }, props: {},
          staticFallbackAssetId: 'climate-fallback',
        },
      ],
    },
    camera: {
      home: { x: 500, y: 300, zoom: 1 },
      frames: [
      {
        id: 'east',
        name: '东部细节',
        x: 750, y: 300, zoom: 1.5,
      },
      {
        id: 'draft',
        name: '未发布镜头',
        x: 200, y: 200, zoom: 2,
      },
      ],
    },
    semanticZoom: [],
  }
}

describe('multi-surface print planning', () => {
  it('creates semantic Flow print HTML with expanded content and no PDF claim', () => {
    const artifact = buildFlowPrintHtml(exportFlow(), { pageSize: 'A4', header: '函数复习' })
    expect(artifact.kind).toBe('print-html')
    expect(artifact.requiresBrowserPrint).toBe(true)
    expect(artifact.html).toContain('@page{size:A4')
    expect(artifact.html).toContain('<details open')
    expect(artifact.html).toContain('orphans:3;widows:3')
    expect(artifact.html).toContain('<nav class="print-toc" aria-label="目录">')
    expect(artifact.html).toMatch(/href="#flow-print-outline-1"/u)
    expect(artifact.html).toMatch(/id="flow-print-outline-1" data-flow-block-id=/u)
    expect(artifact.warnings).toEqual(expect.arrayContaining([expect.stringContaining('interactive')]))
  })

  it('statically composes Flow Native, Component and Runtime in unified layer order', () => {
    const artifact = buildFlowPrintHtml(exportFlow(), {
      effectiveLayerItems: flowLayerEntries(),
      resolveAsset: (assetId) => assetId.endsWith('-fallback')
        ? `data:image/png;base64,${assetId}`
        : undefined,
    })
    const nativeIndex = artifact.html.indexOf('data-layer-item-id="layer-native"')
    const componentIndex = artifact.html.indexOf('data-layer-item-id="layer-component"')
    const runtimeIndex = artifact.html.indexOf('data-layer-item-id="layer-runtime"')
    expect(nativeIndex).toBeGreaterThan(-1)
    expect(nativeIndex).toBeLessThan(componentIndex)
    expect(componentIndex).toBeLessThan(runtimeIndex)
    expect(artifact.html).toContain('data-flow-layer-composition="ordered"')
    expect(artifact.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('layer-component'),
      expect.stringContaining('layer-runtime'),
    ]))
  })

  it('prints a Spatial overview plus author-selected camera frames', () => {
    const artifact = buildSpatialPrintHtml(exportSpatial(), { includeBookmarkIds: ['east'] })
    expect(artifact.pageCount).toBe(2)
    expect(artifact.html).toContain('地理空间关系 — 总览')
    expect(artifact.html).toContain('东部细节')
    expect(artifact.html).not.toContain('未发布镜头')
    expect(artifact.html.match(/<svg/g)).toHaveLength(2)
  })

  it('makes mixed page sizing explicit and reports target-by-target differences', () => {
    const plan = buildMixedPrintPlan({
      id: 'mixed',
      title: '混合课程',
      surfaces: [
        {
          id: 'slide',
          kind: 'slide',
          title: '导入',
          pages: [{ id: 'slide-1', surfaceId: 'slide', surfaceKind: 'slide', title: '导入', bodyHtml: '<svg></svg>', pageSize: { widthMm: 297, heightMm: 167 } }],
        },
        {
          id: 'flow',
          kind: 'flow',
          title: '阅读',
          pages: [{ id: 'flow-1', surfaceId: 'flow', surfaceKind: 'flow', title: '阅读', bodyHtml: '<article></article>', pageSize: { widthMm: 210, heightMm: 297 } }],
        },
      ],
    }, {
      pageSizePolicy: 'preserve',
      defaultPageSize: { widthMm: 210, heightMm: 297, marginMm: 0 },
    })
    expect(plan.pageCount).toBe(2)
    expect(plan.html).toContain('@page mixed-0{size:297mm 167mm')
    expect(plan.html).toContain('@page mixed-1{size:210mm 297mm')
    expect(plan.warnings).toHaveLength(1)
    expect(plan.differences).toContainEqual(expect.objectContaining({ surfaceId: 'slide', target: 'docx', disposition: 'omitted' }))
    expect(plan.differences).toContainEqual(expect.objectContaining({ surfaceId: 'flow', target: 'docx', disposition: 'preserved' }))
    expect(buildCourseExportDifferenceReport([{ id: 'space', kind: 'spatial-2d' }])).toContainEqual(
      expect.objectContaining({ target: 'pdf', disposition: 'static' }),
    )
  })
})

const ECOSYSTEM_MIXED_ARCHIVE_PATH = resolve(
  process.cwd(),
  'examples/course-project-v9/ecosystem-mixed/project.h5lesson',
)

/**
 * E1 代表 Mixed fixture：读取共享的 ecosystem-mixed 工程（Slide + Flow +
 * 非 1× Spatial + global teacher-controller），与编辑器打开路径一致。
 */
function ecosystemMixedArchive() {
  const archive = openCourseProjectArchive(readFileSync(ECOSYSTEM_MIXED_ARCHIVE_PATH))
  return {
    project: archive.project,
    assetFiles: archive.assetFiles,
    resolveAsset(assetId: string): string | undefined {
      const meta = archive.project.assets[assetId]
      const bytes = archive.assetFiles[assetId]
      return meta && bytes ? bytesToDataUrl(bytes, meta.mimeType) : undefined
    },
    resolveDocxAsset(assetId: string): FlowDocxAsset | undefined {
      const meta = archive.project.assets[assetId]
      const bytes = archive.assetFiles[assetId]
      return meta && bytes ? { bytes, mimeType: meta.mimeType, filename: meta.filename } : undefined
    },
  }
}

describe('E1 — Mixed 代表工程：静态导出读取同一 Course V9 真相（ecosystem-mixed）', () => {
  it('PDF 打印计划覆盖 Slide/Flow/Spatial 页面并显式报告每页差异', async () => {
    const { project, resolveAsset } = ecosystemMixedArchive()
    const result = await buildCoursePrintArtifacts(project, {
      resolveAsset,
      captureSlide: async ({ scene }) => `<section data-slide-capture="${scene.id}"></section>`,
    })
    expect(result.failures).toEqual([])
    const artifact = result.artifact
    if (!artifact) throw new Error('mixed print artifact missing')
    expect(artifact.pages.map((page) => page.surfaceKind)).toEqual([
      'slide', 'flow', 'spatial-2d', 'spatial-2d', 'spatial-2d', 'slide',
    ])
    const flowPage = artifact.pages.find((page) => page.surfaceKind === 'flow')!
    expect(flowPage.bodyHtml).toContain('箭头究竟指向谁？')
    expect(flowPage.bodyHtml).toContain('教师控制器已按静态导出设置省略')
    const spatialPages = artifact.pages.filter((page) => page.surfaceKind === 'spatial-2d')
    expect(spatialPages.map((page) => page.title)).toEqual(['全池塘', '蜻蜓幼虫邻域', '两条间接路径'])
    expect(spatialPages.every((page) => page.bodyHtml.includes('<svg'))).toBe(true)
    const slidePages = artifact.pages.filter((page) => page.surfaceKind === 'slide')
    expect(slidePages.map((page) => page.title)).toEqual(['提出预测', '修正预测'])
    expect(slidePages.every((page) => page.bodyHtml.includes('data-slide-capture'))).toBe(true)
    expect(result.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'html', surfaceKind: 'flow', disposition: 'preserved' }),
      expect.objectContaining({ target: 'pdf', surfaceKind: 'flow', disposition: 'preserved' }),
      expect.objectContaining({ target: 'pdf', surfaceKind: 'slide', disposition: 'static' }),
      expect.objectContaining({ target: 'pdf', surfaceKind: 'spatial-2d', disposition: 'static' }),
      expect.objectContaining({ target: 'pptx', surfaceKind: 'flow', disposition: 'omitted' }),
      expect.objectContaining({ target: 'pptx', surfaceKind: 'spatial-2d', disposition: 'omitted' }),
      expect.objectContaining({ target: 'docx', surfaceKind: 'slide', disposition: 'omitted' }),
      expect.objectContaining({ target: 'docx', surfaceKind: 'spatial-2d', disposition: 'omitted' }),
      expect.objectContaining({ target: 'docx', surfaceKind: 'flow', disposition: 'preserved' }),
    ]))
    const warningText = artifact.warnings.join('\n')
    expect(warningText).toContain('multiple page sizes')
    expect(warningText).toContain('teacher controller is omitted because includeInStaticExports is false')
    expect(warningText).toContain('ecosystem-path-sort')
  })

  it('PPTX 只承诺 Slide 可编辑/静态后备，Flow/Spatial 与控制器显式省略', async () => {
    const { project, assetFiles } = ecosystemMixedArchive()
    const result = await buildCoursePptx(project, assetFiles)
    expect(result.slideCount).toBe(2)
    const warnings = result.warnings.join('\n')
    expect(warnings).toContain('箭头含义短讲义')
    expect(warnings).toContain('池塘食物网')
    expect(result.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'pptx', surfaceKind: 'slide', disposition: 'preserved' }),
      expect.objectContaining({ target: 'pptx', surfaceKind: 'flow', disposition: 'omitted' }),
      expect.objectContaining({ target: 'pptx', surfaceKind: 'spatial-2d', disposition: 'omitted' }),
    ]))
    const slide1Xml = strFromU8(unzipSync(result.bytes)['ppt/slides/slide1.xml']!)
    expect(slide1Xml).toContain('蜻蜓幼虫减少，池塘里会发生什么？')
    expect(slide1Xml).not.toContain('教师控制台')

    const included = structuredClone(project)
    const controller = included.globalLayerItems.find((entry) => (
      entry.item.kind === 'native' && entry.item.content.nativeType === 'teacher-controller'
    ))
    if (!controller || controller.item.kind !== 'native') throw new Error('teacher controller missing')
    ;(controller.item.content.data as { includeInStaticExports: boolean }).includeInStaticExports = true
    const includedResult = await buildCoursePptx(included, assetFiles)
    const includedXml = strFromU8(unzipSync(includedResult.bytes)['ppt/slides/slide1.xml']!)
    expect(includedXml).toContain('教师控制台')
  })

  it('DOCX 读取最新 Flow 语义块并把控制器按 includeInStaticExports 显式省略/展开', () => {
    const { project, resolveDocxAsset } = ecosystemMixedArchive()
    const flow = project.surfaces.find((surface) => surface.type === 'flow')
    if (!flow || flow.type !== 'flow') throw new Error('flow surface missing')
    const effectiveLayerItems = getEffectiveCourseLayerOrder({
      project,
      surfaceId: flow.id,
      locationId: 'ecosystem:reading',
    }).filter((entry): entry is FlowDocxLayerEntry => (
      entry.source === 'global' || entry.source === 'surface'
    ))
    const result = buildFlowDocx(flow, {
      locationId: 'ecosystem:reading',
      effectiveLayerItems,
      resolveAsset: resolveDocxAsset,
    })
    const documentXml = strFromU8(unzipSync(result.bytes)['word/document.xml']!)
    expect(documentXml).toContain('箭头究竟指向谁？')
    expect(documentXml).toContain('食物网中，箭头由食物指向取食者')
    expect(documentXml).toContain('藻类')
    expect(documentXml).toContain('浮游动物摄取藻类')
    expect(documentXml).toContain('互动组件：ittoedu.evidence-sort')
    expect(documentXml).toContain('已按静态导出设置省略')
    expect(result.report).toContainEqual(expect.objectContaining({
      layerItemId: 'teacher-controller',
      disposition: 'omitted',
      sourceScope: 'global',
    }))

    const controllerItem = project.globalLayerItems.find((entry) => (
      entry.item.kind === 'native' && entry.item.content.nativeType === 'teacher-controller'
    ))!.item
    const includedLayer = structuredClone(controllerItem) as NativeLayerItem
    ;(includedLayer.content.data as { includeInStaticExports: boolean }).includeInStaticExports = true
    const included = buildFlowDocx(flow, {
      effectiveLayerItems: [{ item: includedLayer, source: 'global' }],
      resolveAsset: resolveDocxAsset,
    })
    const includedXml = strFromU8(unzipSync(included.bytes)['word/document.xml']!)
    expect(includedXml).toContain('教师控制台')
    expect(includedXml).toContain('上一场景')
    expect(included.report).toContainEqual(expect.objectContaining({
      layerItemId: 'teacher-controller',
      disposition: 'fallback',
    }))
  })

  it('格式矩阵差异报告覆盖每个 surface × 每个目标，不静默丢弃“不适用”', () => {
    const { project } = ecosystemMixedArchive()
    const surfaces = project.surfaces.map((surface) => ({ id: surface.id, kind: surface.type }))
    const differences = buildCourseExportDifferenceReport(surfaces)
    for (const surface of surfaces) {
      for (const target of ['html', 'pdf', 'pptx', 'docx'] as const) {
        const entry = differences.find((difference) => (
          difference.surfaceId === surface.id && difference.target === target
        ))
        expect(entry, `${surface.id} × ${target} 缺差异报告`).toBeDefined()
        expect(entry!.detail.length).toBeGreaterThan(0)
      }
    }
    const omitted = differences.filter((difference) => difference.disposition === 'omitted')
    expect(omitted.length).toBeGreaterThan(0)
    for (const entry of omitted) {
      expect(entry.detail.trim().length).toBeGreaterThan(0)
    }
  })
})
