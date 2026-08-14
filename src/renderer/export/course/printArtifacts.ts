import {
  buildFlowStaticLayerFallback,
  buildFlowStandaloneHtml,
  type FlowStaticLayerEntry,
} from '../../../player/surfaces/flow/FlowSurfaceHost'
import {
  walkFlowBlocks,
  type FlowSurfaceDocument,
} from '../../../player/surfaces/flow/flowModel'
import {
  SPATIAL_CANONICAL_VIEWPORT,
  fitSpatialCamera,
  spatialCameraFromPose,
  spatialFiniteBounds,
  type SpatialCamera,
  type SpatialSurfaceDocument,
} from '../../../player/surfaces/spatial/spatialModel'
import {
  renderSpatialSvgMarkup,
} from '../../../player/surfaces/spatial/SpatialSurfaceHost'
import {
  getEffectiveLayerOrder,
  isCourseLayerVisibleAtLocation,
} from '../../../shared/courseProjectModel'
import type {
  CourseProjectDocument,
  ScopedLayerItem,
  SlideSceneDocument,
  SlideSurfaceDocument,
} from '../../../shared/courseProjectTypes'
import type { SurfaceCapture } from '../../../player/surfaces/SurfaceHost'

export interface PrintPageSize {
  widthMm: number
  heightMm: number
  marginMm?: number
}

export interface PrintArtifact {
  kind: 'print-html'
  html: string
  pageCount: number
  /** The artifact still needs a standards-compliant browser print engine. */
  requiresBrowserPrint: true
  warnings: string[]
}

/** Resolve the exact authored course location used by a Slide's initial state. */
export function resolveSlideExportLocationId(
  project: CourseProjectDocument,
  surface: SlideSurfaceDocument,
  scene: SlideSceneDocument,
): string {
  const locations = project.locations.filter((location): location is Extract<
    CourseProjectDocument['locations'][number],
    { kind: 'slide-scene' }
  > => (
    location.kind === 'slide-scene' &&
    location.surfaceId === surface.id &&
    location.sceneId === scene.id
  ))
  const stateId = scene.presentation?.initialStateId
  const location = stateId
    ? locations.find((candidate) => candidate.stateId === stateId)
      ?? locations.find((candidate) => !candidate.stateId)
    : locations.find((candidate) => !candidate.stateId)
  if (!location) {
    throw new Error(`幻灯片“${scene.name}”缺少与当前初始画面对应的课程位置。`)
  }
  return location.id
}

export interface FlowPrintOptions {
  pageSize?: 'A4' | 'Letter'
  resolveAsset?: (assetId: string) => string | undefined
  resolveComponentName?: (packageId: string, version: string) => string | undefined
  header?: string
  footer?: string
  /** Actual Flow host capture, including the ordered surface/global compositor. */
  capturedDocument?: SurfaceCapture
  /** Ordered visible layer fact used when a real host capture is unavailable. */
  effectiveLayerItems?: readonly FlowStaticLayerEntry[]
  locationId?: string
}

function html(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Produce semantic print HTML. This deliberately does not claim to be a PDF;
 * Electron/Chromium printToPDF remains the final pagination engine.
 */
export function buildFlowPrintHtml(
  flow: FlowSurfaceDocument,
  options: FlowPrintOptions = {},
): PrintArtifact {
  const warnings: string[] = []
  walkFlowBlocks(flow, ({ block }) => {
    if (block.type === 'component') {
      const name = options.resolveComponentName?.(
        block.component.packageId,
        block.component.version,
      ) ?? '互动组件'
      warnings.push(`“${name}”在 PDF 中使用静态预览，不保留互动。`)
    }
  })
  const pageSize = options.pageSize ?? 'A4'
  let base: string
  if (options.capturedDocument) {
    if (options.capturedDocument.format !== 'html') {
      throw new Error('流式讲义的打印画面格式不正确，无法继续导出。')
    }
    base = options.capturedDocument.content
    warnings.push(...(options.capturedDocument.warnings ?? []))
  } else {
    const entries = options.effectiveLayerItems ?? flow.surfaceLayerItems
      .filter((entry) => options.locationId
        ? isCourseLayerVisibleAtLocation(entry, options.locationId)
        : true)
      .map((entry): FlowStaticLayerEntry => ({ item: entry.item, source: 'surface' }))
    if (!options.locationId && !options.effectiveLayerItems && flow.surfaceLayerItems.some((entry) => entry.visibility.mode !== 'all')) {
      warnings.push('未指定讲义的当前课程位置；已保留全部共享图层，请在导出后复核。')
    }
    const fallback = buildFlowStaticLayerFallback(entries, options.resolveAsset)
    warnings.push(...fallback.warnings)
    base = buildFlowStandaloneHtml(flow, {
      expandSections: true,
      resolveAsset: options.resolveAsset,
      resolveComponentName: options.resolveComponentName,
      ...(entries.length > 0 ? { layerHtml: fallback.content } : {}),
    })
  }
  const outline: Array<{ blockId: string; label: string; level: number; anchor: string }> = []
  walkFlowBlocks(flow, ({ block, depth }) => {
    if (block.type !== 'heading' && block.type !== 'section') return
    outline.push({
      blockId: block.id,
      label: block.type === 'heading' ? block.text : block.title,
      level: block.type === 'heading' ? block.level : Math.min(6, depth + 2),
      anchor: `flow-print-outline-${outline.length + 1}`,
    })
  })
  for (const entry of outline) {
    const attribute = `data-flow-block-id="${html(entry.blockId)}"`
    base = base.replace(attribute, `id="${entry.anchor}" ${attribute}`)
  }
  const tableOfContents = outline.length === 0 ? '' : `<nav class="print-toc" aria-label="目录"><h1>目录</h1><ol>${outline.map((entry) => `<li data-outline-level="${entry.level}" style="margin-left:${Math.max(0, entry.level - 1) * 1.2}em"><a href="#${entry.anchor}">${html(entry.label)}</a></li>`).join('')}</ol></nav>`
  const printStyles = `<style data-courseware-print>@page{size:${pageSize};margin:18mm 17mm 20mm}html,body{background:#fff!important}.flow-surface{max-width:none;padding:0;line-height:1.65}.flow-static-layer-mount{break-inside:avoid-page;page-break-inside:avoid}h1,h2,h3,h4,h5,h6,summary{break-after:avoid-page;page-break-after:avoid}p,li,blockquote{orphans:3;widows:3}figure,table,aside,.flow-formula{break-inside:avoid-page;page-break-inside:avoid}thead{display:table-header-group}tfoot{display:table-footer-group}details:not([open])>*:not(summary){display:block}details>summary{list-style:none}.print-toc{break-after:page;page-break-after:always}.print-toc ol{padding:0;list-style:none}.print-toc li{margin:.35em 0}.print-toc a{color:inherit;text-decoration:none}.print-header,.print-footer{position:fixed;left:0;right:0;color:#64748b;font-size:9pt}.print-header{top:-12mm}.print-footer{bottom:-13mm;text-align:center}</style>`
  const decorations = `${options.header ? `<div class="print-header">${html(options.header)}</div>` : ''}${options.footer ? `<div class="print-footer">${html(options.footer)}</div>` : ''}`
  return {
    kind: 'print-html',
    html: base
      .replace('<html ', '<html data-courseware-print-document="semantic" ')
      .replace('</head>', `${printStyles}</head>`)
      .replace('<body>', `<body>${decorations}${tableOfContents}`),
    pageCount: 0,
    requiresBrowserPrint: true,
    warnings,
  }
}

export interface SpatialPrintOptions {
  pageSize?: PrintPageSize
  includeBookmarkIds?: readonly string[]
  resolveAsset?: (assetId: string) => string | undefined
  /** Location used to resolve include/exclude visibility for shared layers. */
  locationId?: string
  /** Course-scoped layers, when this standalone helper is used outside the full project builder. */
  globalLayerItems?: readonly ScopedLayerItem[]
}

function spatialPrintDocument(
  spatial: SpatialSurfaceDocument,
  options: SpatialPrintOptions,
): { document: SpatialSurfaceDocument; warnings: string[] } {
  const scoped = [
    ...(options.globalLayerItems ?? []),
    ...spatial.surfaceLayerItems,
  ]
  const visibleScoped = options.locationId
    ? scoped.filter((entry) => isCourseLayerVisibleAtLocation(entry, options.locationId!))
    : scoped
  const document = structuredClone(spatial)
  document.surfaceLayerItems = []
  const allItems = getEffectiveLayerOrder([
    ...spatial.world.layerItems.map((item) => structuredClone(item)),
    ...visibleScoped.map(({ item }) => structuredClone(item)),
  ])
  const omittedControllers = allItems.filter((item) => (
    item.kind === 'native' &&
    item.content.nativeType === 'teacher-controller' &&
    !item.content.data.includeInStaticExports
  ))
  document.world.layerItems = allItems.filter((item) => !omittedControllers.includes(item))
  const warnings = [
    ...(!options.locationId && scoped.some((entry) => entry.visibility.mode !== 'all')
      ? ['未指定空间画布的当前课程位置；已保留全部共享图层，请在导出后复核。']
      : []),
    ...omittedControllers.map((item) => `教师控制器“${item.label}”已按静态导出设置省略。`),
  ]
  return { document, warnings }
}

function spatialFramePage(
  spatial: SpatialSurfaceDocument,
  camera: SpatialCamera,
  title: string,
  resolveAsset: (assetId: string) => string | undefined,
): string {
  return `<section class="spatial-print-page"><h1>${html(title)}</h1><div class="spatial-frame">${renderSpatialSvgMarkup(spatial, camera, resolveAsset)}</div></section>`
}

export function buildSpatialPrintHtml(
  spatial: SpatialSurfaceDocument,
  options: SpatialPrintOptions = {},
): PrintArtifact {
  const printable = spatialPrintDocument(spatial, options)
  const size = options.pageSize ?? { widthMm: 297, heightMm: 210, marginMm: 12 }
  const viewport = SPATIAL_CANONICAL_VIEWPORT
  const overview = fitSpatialCamera(spatialFiniteBounds(printable.document), viewport, 36)
  const selected = options.includeBookmarkIds
    ? options.includeBookmarkIds.map((id) => {
        const bookmark = spatial.camera.frames.find((item) => item.id === id)
        if (!bookmark) throw new Error('找不到所选的空间镜头，无法继续导出。')
        return bookmark
      })
    : spatial.camera.frames
  const resolveAsset = options.resolveAsset ?? (() => undefined)
  const pages = [
    spatialFramePage(printable.document, overview, `${spatial.title} — 总览`, resolveAsset),
    ...selected.map((bookmark) => spatialFramePage(
      printable.document,
      {
        ...spatialCameraFromPose(bookmark, viewport),
      },
      bookmark.name,
      resolveAsset,
    )),
  ]
  const componentWarnings = printable.document.world.layerItems
    .filter((item) => item.kind === 'component' || item.kind === 'runtime')
    .map((item) => `“${item.label}”在 PDF 中使用静态预览，不保留互动。`)
  const css = `@page{size:${size.widthMm}mm ${size.heightMm}mm;margin:${size.marginMm ?? 12}mm}html,body{margin:0;font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#172033}.spatial-print-page{box-sizing:border-box;break-after:page;page-break-after:always}.spatial-print-page:last-child{break-after:auto;page-break-after:auto}.spatial-print-page h1{font-size:16pt;margin:0 0 5mm}.spatial-frame{display:flex;align-items:center;justify-content:center}.spatial-frame svg{display:block;max-width:100%;height:auto;border:1px solid #cbd5e1}`
  return {
    kind: 'print-html',
    html: `<!doctype html><html lang="zh-CN" data-courseware-print-document="paged"><head><meta charset="utf-8"><title>${html(spatial.title)}</title><style>${css}</style></head><body>${pages.join('')}</body></html>`,
    pageCount: pages.length,
    requiresBrowserPrint: true,
    warnings: [...printable.warnings, ...componentWarnings],
  }
}

export type ExportTarget = 'html' | 'pdf' | 'pptx' | 'docx'
export type ExportDisposition = 'preserved' | 'static' | 'fallback' | 'omitted'

export interface CourseExportDifference {
  surfaceId: string
  surfaceKind: 'slide' | 'flow' | 'spatial-2d'
  target: ExportTarget
  disposition: ExportDisposition
  detail: string
}

export interface MixedPrintPage {
  id: string
  surfaceId: string
  surfaceKind: 'slide' | 'flow' | 'spatial-2d'
  title: string
  bodyHtml: string
  /** Flat CSS copied from this page's standalone document head. */
  fragmentStyles?: string
  pageSize?: PrintPageSize
  sourceFrameId?: string
}

export interface MixedPrintInput {
  id: string
  title: string
  surfaces: Array<{
    id: string
    kind: 'slide' | 'flow' | 'spatial-2d'
    title: string
    pages: MixedPrintPage[]
  }>
}

export interface MixedPrintConfig {
  pageSizePolicy: 'preserve' | 'normalize'
  defaultPageSize: PrintPageSize
}

export interface MixedPrintPlan extends PrintArtifact {
  pages: Array<MixedPrintPage & { effectivePageSize: PrintPageSize }>
  differences: CourseExportDifference[]
}

function splitCssSelectorList(value: string): string[] {
  const selectors: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? ''
    if (quote) {
      if (character === quote && value[index - 1] !== '\\') quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '(' || character === '[') depth += 1
    else if (character === ')' || character === ']') depth -= 1
    else if (character === ',' && depth === 0) {
      selectors.push(value.slice(start, index).trim())
      start = index + 1
    }
    if (depth < 0) throw new Error('讲义打印样式格式有误，无法继续导出。')
  }
  if (quote || depth !== 0) throw new Error('讲义打印样式格式有误，无法继续导出。')
  selectors.push(value.slice(start).trim())
  if (selectors.some((selector) => !selector)) throw new Error('讲义打印样式格式有误，无法继续导出。')
  return selectors
}

function scopeFragmentSelector(selector: string, scope: string): string {
  if (selector === 'html' || selector === 'body' || selector === ':root') return scope
  const rootWithQualifier = selector.match(/^(?:html|body|:root)([.#[:].*)$/u)
  if (rootWithQualifier) return `${scope}${rootWithQualifier[1]}`
  const rootWithDescendant = selector.match(/^(?:html|body|:root)\s+(.+)$/u)
  return rootWithDescendant ? `${scope} ${rootWithDescendant[1]}` : `${scope} ${selector}`
}

function scopeFragmentStyles(styleText: string, scope: string): string {
  const source = styleText.replace(/\/\*[\s\S]*?\*\//gu, '').trim()
  if (!source) return ''
  if (/<\/style|@[a-z-]+\b/iu.test(source)) {
    throw new Error('页面打印样式格式有误，无法继续导出。')
  }
  const rules: string[] = []
  const pattern = /([^{}]+)\{([^{}]*)\}/gu
  let cursor = 0
  for (const match of source.matchAll(pattern)) {
    if (source.slice(cursor, match.index).trim()) {
      throw new Error('页面打印样式格式有误，无法继续导出。')
    }
    const selectors = [...new Set(splitCssSelectorList(match[1] ?? '').map(
      (selector) => scopeFragmentSelector(selector, scope),
    ))]
    rules.push(`${selectors.join(',')}{${match[2] ?? ''}}`)
    cursor = (match.index ?? 0) + match[0].length
  }
  if (source.slice(cursor).trim() || rules.length === 0) {
    throw new Error('页面打印样式格式有误，无法继续导出。')
  }
  return rules.join('')
}

export function buildCourseExportDifferenceReport(
  surfaces: readonly { id: string; kind: 'slide' | 'flow' | 'spatial-2d' }[],
): CourseExportDifference[] {
  return surfaces.flatMap((surface): CourseExportDifference[] => {
    const common: CourseExportDifference[] = [
      { surfaceId: surface.id, surfaceKind: surface.kind, target: 'html', disposition: 'preserved', detail: '保留原有互动与页面结构' },
      {
        surfaceId: surface.id,
        surfaceKind: surface.kind,
        target: 'pdf',
        disposition: surface.kind === 'flow' ? 'preserved' : 'static',
        detail: surface.kind === 'flow'
          ? '按阅读结构分页，并按画布层级保留静态内容'
          : surface.kind === 'spatial-2d'
            ? '导出总览及教师设置的镜头'
            : '导出教师设置的稳定画面',
      },
    ]
    common.push(surface.kind === 'slide'
      ? { surfaceId: surface.id, surfaceKind: surface.kind, target: 'pptx', disposition: 'preserved', detail: '转换为可继续编辑的幻灯片内容' }
      : { surfaceId: surface.id, surfaceKind: surface.kind, target: 'pptx', disposition: 'omitted', detail: '此类内容不转换为 PPTX 页面' })
    common.push(surface.kind === 'flow'
      ? { surfaceId: surface.id, surfaceKind: surface.kind, target: 'docx', disposition: 'preserved', detail: '保留讲义结构，并按画布层级加入静态内容' }
      : { surfaceId: surface.id, surfaceKind: surface.kind, target: 'docx', disposition: 'omitted', detail: '此类内容不转换为 Word 页面' })
    return common
  })
}

/** Build an explicit per-page print plan for a mixed course. */
export function buildMixedPrintPlan(
  input: MixedPrintInput,
  config: MixedPrintConfig,
): MixedPrintPlan {
  if (input.surfaces.length === 0) throw new Error('当前课程没有可导出的内容。')
  if (config.defaultPageSize.widthMm <= 0 || config.defaultPageSize.heightMm <= 0) {
    throw new Error('打印页面尺寸必须大于零。')
  }
  const ids = new Set<string>()
  const pages = input.surfaces.flatMap((surface) => surface.pages.map((page) => {
    if (page.surfaceId !== surface.id || page.surfaceKind !== surface.kind) {
      throw new Error('有一页打印内容与所属课程部分不匹配。')
    }
    if (ids.has(page.id)) throw new Error('打印内容中出现了重复页，无法继续导出。')
    ids.add(page.id)
    return {
      ...page,
      effectivePageSize: config.pageSizePolicy === 'preserve' && page.pageSize
        ? { ...page.pageSize }
        : { ...config.defaultPageSize },
    }
  }))
  if (pages.length === 0) throw new Error('当前课程没有可导出的页面。')
  const pageCss = pages.map((page, index) => {
    const size = page.effectivePageSize
    return `@page mixed-${index}{size:${size.widthMm}mm ${size.heightMm}mm;margin:${size.marginMm ?? 0}mm}.mixed-page-${index}{page:mixed-${index}}`
  }).join('')
  const fragmentCss = pages.map((page, index) => page.fragmentStyles
    ? scopeFragmentStyles(
        page.fragmentStyles,
        `.mixed-page-${index} .course-flow-print-fragment`,
      )
    : '').join('')
  const body = pages.map((page, index) => `<section class="mixed-page mixed-page-${index}" data-page-id="${html(page.id)}" data-surface-id="${html(page.surfaceId)}" data-surface-kind="${page.surfaceKind}"><h1 class="mixed-page-title">${html(page.title)}</h1>${page.bodyHtml}</section>`).join('')
  const warnings = config.pageSizePolicy === 'preserve' && new Set(
    pages.map((page) => `${page.effectivePageSize.widthMm}x${page.effectivePageSize.heightMm}`),
  ).size > 1
    ? ['当前 PDF 包含多种页面尺寸，请在打印前复核纸张与缩放设置。']
    : []
  return {
    kind: 'print-html',
    html: `<!doctype html><html lang="zh-CN" data-courseware-print-document="paged"><head><meta charset="utf-8"><title>${html(input.title)}</title><style>${pageCss}html,body{margin:0}.mixed-page{box-sizing:border-box;break-after:page;page-break-after:always}.mixed-page:last-child{break-after:auto;page-break-after:auto}.mixed-page-title{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}${fragmentCss}</style></head><body>${body}</body></html>`,
    pageCount: pages.length,
    requiresBrowserPrint: true,
    warnings,
    pages,
    differences: buildCourseExportDifferenceReport(input.surfaces),
  }
}
