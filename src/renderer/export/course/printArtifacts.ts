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
  fitSpatialCamera,
  spatialCameraFromPose,
  spatialFiniteBounds,
  type SpatialCamera,
  type SpatialSurfaceDocument,
} from '../../../player/surfaces/spatial/spatialModel'
import {
  renderSpatialSvgMarkup,
} from '../../../player/surfaces/spatial/SpatialSurfaceHost'
import { isCourseLayerVisibleAtLocation } from '../../../shared/courseProjectModel'
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

export interface FlowPrintOptions {
  pageSize?: 'A4' | 'Letter'
  resolveAsset?: (assetId: string) => string | undefined
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
      warnings.push(`${block.id}: interactive component uses its descriptive print fallback`)
    }
  })
  const pageSize = options.pageSize ?? 'A4'
  let base: string
  if (options.capturedDocument) {
    if (options.capturedDocument.format !== 'html') {
      throw new Error(`Flow print capture must be HTML, received ${options.capturedDocument.format}`)
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
      warnings.push('Flow print has no location context; all authored surface layers were included instead of silently dropping location-scoped layers')
    }
    const fallback = buildFlowStaticLayerFallback(entries, options.resolveAsset)
    warnings.push(...fallback.warnings)
    base = buildFlowStandaloneHtml(flow, {
      expandSections: true,
      resolveAsset: options.resolveAsset,
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
  const size = options.pageSize ?? { widthMm: 297, heightMm: 210, marginMm: 12 }
  const viewport = { width: 1120, height: 760 }
  const overview = fitSpatialCamera(spatialFiniteBounds(spatial), viewport, 36)
  const selected = options.includeBookmarkIds
    ? options.includeBookmarkIds.map((id) => {
        const bookmark = spatial.camera.frames.find((item) => item.id === id)
        if (!bookmark) throw new Error(`Unknown Spatial print bookmark: ${id}`)
        return bookmark
      })
    : spatial.camera.frames
  const resolveAsset = options.resolveAsset ?? (() => undefined)
  const pages = [
    spatialFramePage(spatial, overview, `${spatial.title} — 总览`, resolveAsset),
    ...selected.map((bookmark) => spatialFramePage(
      spatial,
      {
        ...spatialCameraFromPose(bookmark, viewport),
      },
      bookmark.name,
      resolveAsset,
    )),
  ]
  const componentWarnings = spatial.world.layerItems
    .filter((item) => item.kind === 'component' || item.kind === 'runtime')
    .map((item) => `${item.layerItemId}: Spatial ${item.kind} is represented by its deterministic SVG fallback`)
  const css = `@page{size:${size.widthMm}mm ${size.heightMm}mm;margin:${size.marginMm ?? 12}mm}html,body{margin:0;font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#172033}.spatial-print-page{box-sizing:border-box;break-after:page;page-break-after:always}.spatial-print-page:last-child{break-after:auto;page-break-after:auto}.spatial-print-page h1{font-size:16pt;margin:0 0 5mm}.spatial-frame{display:flex;align-items:center;justify-content:center}.spatial-frame svg{display:block;max-width:100%;height:auto;border:1px solid #cbd5e1}`
  return {
    kind: 'print-html',
    html: `<!doctype html><html lang="zh-CN" data-courseware-print-document="paged"><head><meta charset="utf-8"><title>${html(spatial.title)}</title><style>${css}</style></head><body>${pages.join('')}</body></html>`,
    pageCount: pages.length,
    requiresBrowserPrint: true,
    warnings: componentWarnings,
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
    if (depth < 0) throw new Error('Flow fragment CSS has an unbalanced selector')
  }
  if (quote || depth !== 0) throw new Error('Flow fragment CSS has an unbalanced selector')
  selectors.push(value.slice(start).trim())
  if (selectors.some((selector) => !selector)) throw new Error('Flow fragment CSS has an empty selector')
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
    throw new Error('Mixed print fragment styles cannot contain style markup or at-rules')
  }
  const rules: string[] = []
  const pattern = /([^{}]+)\{([^{}]*)\}/gu
  let cursor = 0
  for (const match of source.matchAll(pattern)) {
    if (source.slice(cursor, match.index).trim()) {
      throw new Error('Mixed print fragment styles must contain flat CSS rules')
    }
    const selectors = [...new Set(splitCssSelectorList(match[1] ?? '').map(
      (selector) => scopeFragmentSelector(selector, scope),
    ))]
    rules.push(`${selectors.join(',')}{${match[2] ?? ''}}`)
    cursor = (match.index ?? 0) + match[0].length
  }
  if (source.slice(cursor).trim() || rules.length === 0) {
    throw new Error('Mixed print fragment styles must contain flat CSS rules')
  }
  return rules.join('')
}

export function buildCourseExportDifferenceReport(
  surfaces: readonly { id: string; kind: 'slide' | 'flow' | 'spatial-2d' }[],
): CourseExportDifference[] {
  return surfaces.flatMap((surface): CourseExportDifference[] => {
    const common: CourseExportDifference[] = [
      {
        surfaceId: surface.id,
        surfaceKind: surface.kind,
        target: 'html',
        disposition: 'preserved',
        detail: surface.kind === 'spatial-2d'
          ? 'Native interactive surface host plus authored Spatial paths and relations'
          : 'Native interactive surface host',
      },
      {
        surfaceId: surface.id,
        surfaceKind: surface.kind,
        target: 'pdf',
        disposition: surface.kind === 'flow' ? 'preserved' : 'static',
        detail: surface.kind === 'flow'
          ? 'Semantic paginated Flow plus ordered static unified layers'
          : surface.kind === 'spatial-2d'
            ? 'Authored overview and camera frames with Spatial paths and relations rendered in static SVG'
            : 'Authored stable slide frame',
      },
    ]
    common.push(surface.kind === 'slide'
      ? { surfaceId: surface.id, surfaceKind: surface.kind, target: 'pptx', disposition: 'preserved', detail: 'Slide-compatible export path' }
      : surface.kind === 'spatial-2d'
        ? { surfaceId: surface.id, surfaceKind: surface.kind, target: 'pptx', disposition: 'omitted', detail: 'This surface has no PPTX mapping; Spatial paths and relations are omitted' }
        : { surfaceId: surface.id, surfaceKind: surface.kind, target: 'pptx', disposition: 'omitted', detail: 'This surface has no PPTX mapping' })
    common.push(surface.kind === 'flow'
      ? { surfaceId: surface.id, surfaceKind: surface.kind, target: 'docx', disposition: 'preserved', detail: 'Structured Flow blocks plus explicit ordered layer fallbacks' }
      : surface.kind === 'spatial-2d'
        ? { surfaceId: surface.id, surfaceKind: surface.kind, target: 'docx', disposition: 'omitted', detail: 'This surface has no DOCX mapping; Spatial paths and relations are omitted' }
        : { surfaceId: surface.id, surfaceKind: surface.kind, target: 'docx', disposition: 'omitted', detail: 'This surface has no DOCX mapping' })
    return common
  })
}

/** Build an explicit per-page print plan for a mixed course. */
export function buildMixedPrintPlan(
  input: MixedPrintInput,
  config: MixedPrintConfig,
): MixedPrintPlan {
  if (input.surfaces.length === 0) throw new Error('A mixed print plan needs at least one surface')
  if (config.defaultPageSize.widthMm <= 0 || config.defaultPageSize.heightMm <= 0) {
    throw new Error('Mixed print default page size must be positive')
  }
  const ids = new Set<string>()
  const pages = input.surfaces.flatMap((surface) => surface.pages.map((page) => {
    if (page.surfaceId !== surface.id || page.surfaceKind !== surface.kind) {
      throw new Error(`Mixed print page ${page.id} does not match its surface`)
    }
    if (ids.has(page.id)) throw new Error(`Duplicate mixed print page id: ${page.id}`)
    ids.add(page.id)
    return {
      ...page,
      effectivePageSize: config.pageSizePolicy === 'preserve' && page.pageSize
        ? { ...page.pageSize }
        : { ...config.defaultPageSize },
    }
  }))
  if (pages.length === 0) throw new Error('A mixed print plan needs at least one page')
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
    ? ['Mixed print plan contains multiple page sizes; verify the target PDF viewer and printer.']
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
