import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { FlowSurfaceDocument, SpatialSurfaceDocument } from '@/player/surfaces'
import type {
  ComponentLayerItem,
  LayerItemBase,
  NativeLayerItem,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'
import { parseFormulaLinear } from '@/shared/formulaLinear'
import {
  buildCourseExportDifferenceReport,
  buildFlowDocx,
  buildFlowPrintHtml,
  buildMixedPrintPlan,
  buildSpatialPrintHtml,
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
      { id: 'list', type: 'list', ordered: true, items: [{ id: 'domain', text: '定义域', level: 0 }, { id: 'range', text: '值域', level: 1 }] },
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
  const labels: Record<string, string> = {
    'layer-native': '可编辑画布文字',
    'layer-component': '函数图像实验器',
    'layer-runtime': '动态演示',
  }
  return {
    layerItemId: id,
    label: labels[id] ?? '课件内容',
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
      resolveComponentName: () => '函数图像实验器',
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
    const numbering = strFromU8(files['word/numbering.xml']!)
    assertWellFormedXml(documentXml)
    assertWellFormedXml(relationships)
    expect(documentXml).toContain('<w:pStyle w:val="Heading1"/>')
    expect(documentXml).toContain('<w:numId w:val="1"/>')
    expect(documentXml).toContain('<w:ilvl w:val="1"/>')
    expect(numbering).toContain('<w:multiLevelType w:val="multilevel"/>')
    expect(numbering).toContain('<w:lvl w:ilvl="5">')
    expect(documentXml).toContain('<w:tbl>')
    expect(documentXml).toContain('<m:oMathPara>')
    expect(documentXml).toContain('\\sqrt')
    expect(documentXml).toContain('导出过程')
    expect(documentXml).toContain('函数图像实验器')
    expect(documentXml).not.toContain('graph-lab')
    expect(documentXml).not.toContain('1.0.0')
    expect(relationships).toContain('relationships/image')
    expect(relationships).toContain('Target="media/image1.png"')
    expect(result.report).toContainEqual(expect.objectContaining({ blockId: 'image', disposition: 'preserved' }))
    expect(result.report).toContainEqual(expect.objectContaining({ blockId: 'math-root', disposition: 'fallback' }))
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('二次方程求根公式'),
      expect.stringContaining('函数图像实验器'),
    ]))
    expect(result.warnings.join('\n')).not.toMatch(/math-root|graph-lab|1\.0\.0/u)
  })

  it('restarts each independent ordered list instead of continuing the previous list', () => {
    const flow = exportFlow()
    flow.blocks.push({
      id: 'second-list',
      type: 'list',
      ordered: true,
      items: [{ id: 'second-list-item', text: '重新从一开始', level: 0 }],
    })
    const files = unzipSync(buildFlowDocx(flow).bytes)
    const documentXml = strFromU8(files['word/document.xml']!)
    const numbering = strFromU8(files['word/numbering.xml']!)
    const listIds = [...new Set(
      [...documentXml.matchAll(/<w:numId w:val="(\d+)"\/>/gu)].map((match) => match[1]),
    )]
    expect(listIds).toEqual(['1', '2'])
    expect(numbering).toContain('<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>')
    expect(numbering).toContain('<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>')
  })

  it('is deterministic and emits an image fallback when media is unavailable', () => {
    const first = buildFlowDocx(exportFlow())
    const second = buildFlowDocx(exportFlow())
    expect(first.bytes).toEqual(second.bytes)
    const documentXml = strFromU8(unzipSync(first.bytes)['word/document.xml']!)
    expect(documentXml).toContain('[图片说明：函数图像；图 1]')
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
    expect(documentXml.indexOf('可编辑画布文字')).toBeLessThan(documentXml.indexOf('函数图像实验器'))
    expect(documentXml.indexOf('函数图像实验器')).toBeLessThan(documentXml.indexOf('动态演示'))
    expect(documentXml).not.toMatch(/order=|\bglobal\b|\bsurface\b|\bcomponent\b|\bruntime\b/u)
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
      expect.stringContaining('函数图像实验器'),
      expect.stringContaining('动态演示'),
    ]))
    expect(result.warnings.join('\n')).not.toMatch(/layer-component|layer-runtime|\bcomponent\b|\bruntime\b/u)
    expect(result.report.map((item) => item.detail).join('\n')).not.toMatch(/Native|Flow|Spatial|interactive|surface|fallback|mapping|ordered|layer/u)
  })

  it('将自动生成的 SVG 组件预览真实写入 Word 包', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><text x="20" y="50">函数图像实验</text></svg>')
    const result = buildFlowDocx(exportFlow(), {
      resolveComponentName: () => '函数图像实验器',
      resolveAsset: (assetId) => assetId === 'graph-lab-fallback'
        ? { mimeType: 'image/svg+xml', bytes: svg }
        : undefined,
    })
    const files = unzipSync(result.bytes)
    const svgPath = Object.keys(files).find((path) => path.endsWith('.svg'))
    expect(svgPath).toBe('word/media/image1.svg')
    expect(strFromU8(files[svgPath!])).toBe(new TextDecoder().decode(svg))
    expect(strFromU8(files['[Content_Types].xml']!)).toContain('Extension="svg" ContentType="image/svg+xml"')
    expect(strFromU8(files['word/_rels/document.xml.rels']!)).toContain('Target="media/image1.svg"')
    expect(strFromU8(files['word/document.xml']!)).toContain('asvg:svgBlip')
    expect(result.warnings).toContain('“函数图像实验器”已用静态预览导出；Word 中不保留互动。')
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
    relations: [],
    semanticZoom: [],
  }
}

function spatialTeacherController(): NativeLayerItem {
  return {
    ...layerBase('spatial-controller-private', 40),
    label: '空间导航',
    kind: 'native',
    content: {
      nativeType: 'teacher-controller',
      data: {
        title: '教师导航',
        showSceneProgress: true,
        compact: false,
        collapsible: false,
        defaultCollapsed: false,
        buttons: [{ id: 'next', label: '下一页', visible: true, action: { type: 'scene.next' } }],
        style: {
          backgroundColor: '#172033', backgroundOpacity: 1,
          accentColor: '#e7b85c', textColor: '#f8fafc', cornerRadius: 12,
        },
        includeInStaticExports: false,
      },
    },
  }
}

describe('multi-surface print planning', () => {
  it('creates semantic Flow print HTML with expanded content and no PDF claim', () => {
    const artifact = buildFlowPrintHtml(exportFlow(), {
      pageSize: 'A4',
      header: '函数复习',
      resolveComponentName: () => '函数图像实验器',
    })
    expect(artifact.kind).toBe('print-html')
    expect(artifact.requiresBrowserPrint).toBe(true)
    expect(artifact.html).toContain('@page{size:A4')
    expect(artifact.html).toContain('<details open')
    expect(artifact.html).toContain('orphans:3;widows:3')
    expect(artifact.html).toContain('<nav class="print-toc" aria-label="目录">')
    expect(artifact.html).toMatch(/href="#flow-print-outline-1"/u)
    expect(artifact.html).toMatch(/id="flow-print-outline-1" data-flow-block-id=/u)
    expect(artifact.warnings).toEqual(expect.arrayContaining([expect.stringContaining('函数图像实验器')]))
    expect(artifact.warnings.join('\n')).not.toMatch(/interactive|graph-lab|1\.0\.0/u)
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
      expect.stringContaining('函数图像实验器'),
      expect.stringContaining('动态演示'),
    ]))
    expect(artifact.warnings.join('\n')).not.toMatch(/layer-component|layer-runtime|\bcomponent\b|\bruntime\b/u)
  })

  it('prints a Spatial overview plus author-selected camera frames', () => {
    const artifact = buildSpatialPrintHtml(exportSpatial(), { includeBookmarkIds: ['east'] })
    expect(artifact.pageCount).toBe(2)
    expect(artifact.html).toContain('地理空间关系 — 总览')
    expect(artifact.html).toContain('东部细节')
    expect(artifact.html).not.toContain('未发布镜头')
    expect(artifact.html.match(/<svg/g)).toHaveLength(2)
  })

  it('独立空间 PDF 也按教师设置省略控制器', () => {
    const spatial = exportSpatial()
    spatial.world.layerItems.push(spatialTeacherController())
    const artifact = buildSpatialPrintHtml(spatial, { includeBookmarkIds: ['east'] })
    expect(artifact.html).not.toContain('data-layer-item-id="spatial-controller-private"')
    expect(artifact.warnings).toContain('教师控制器“空间导航”已按静态导出设置省略。')
    expect(artifact.warnings.join('\n')).not.toMatch(/spatial-controller-private|includeInStaticExports/u)
  })

  it('does not drop visible shared Spatial layers in standalone print', () => {
    const spatial = exportSpatial()
    spatial.world.layerItems[0]!.order = 10
    const global = structuredClone(spatial.world.layerItems[0]!)
    global.layerItemId = 'print-global'
    global.order = 20
    const surface = structuredClone(spatial.world.layerItems[0]!)
    surface.layerItemId = 'print-surface'
    surface.order = 30
    const hidden = structuredClone(spatial.world.layerItems[0]!)
    hidden.layerItemId = 'print-hidden'
    hidden.order = 40
    spatial.surfaceLayerItems = [
      { item: surface, visibility: { mode: 'include', locationIds: ['east-location'] } },
      { item: hidden, visibility: { mode: 'exclude', locationIds: ['east-location'] } },
    ]
    const artifact = buildSpatialPrintHtml(spatial, {
      includeBookmarkIds: ['east'],
      locationId: 'east-location',
      globalLayerItems: [{
        item: global,
        visibility: { mode: 'include', locationIds: ['east-location'] },
      }],
    })
    const worldIndex = artifact.html.indexOf('data-layer-item-id="lab"')
    const globalIndex = artifact.html.indexOf('data-layer-item-id="print-global"')
    const surfaceIndex = artifact.html.indexOf('data-layer-item-id="print-surface"')
    expect(worldIndex).toBeGreaterThan(-1)
    expect(worldIndex).toBeLessThan(globalIndex)
    expect(globalIndex).toBeLessThan(surfaceIndex)
    expect(artifact.html).not.toContain('data-layer-item-id="print-hidden"')
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
    expect(plan.warnings[0]).toMatch(/多种页面尺寸/u)
    expect(plan.differences).toContainEqual(expect.objectContaining({ surfaceId: 'slide', target: 'docx', disposition: 'omitted' }))
    expect(plan.differences).toContainEqual(expect.objectContaining({ surfaceId: 'flow', target: 'docx', disposition: 'preserved' }))
    expect(buildCourseExportDifferenceReport([{ id: 'space', kind: 'spatial-2d' }])).toContainEqual(
      expect.objectContaining({ target: 'pdf', disposition: 'static' }),
    )
    expect(plan.differences.map((item) => item.detail).join('\n')).not.toMatch(/Native|Flow|Spatial|interactive|surface|fallback|mapping|ordered|layer/u)
  })
})
