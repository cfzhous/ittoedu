import type {
  SurfaceCapture,
  SurfaceCaptureRequest,
  SurfaceHost,
  SurfaceMountContext,
  SurfaceResetScope,
} from '../SurfaceHost'
import { serializeFormulaAst } from '../../../shared/formulaLinear'
import {
  flowListItemsToTree,
  type FlowListTreeNode,
} from '../../../shared/flowListStructure'
import { compareStableStrings } from '../../../shared/stableOrder'
import type {
  LayerItem,
  NativeLayerItem,
  ScopedLayerItem,
  SlideSurfaceDocument,
} from '../../../shared/courseProjectTypes'
import type { TeacherControllerAction } from '../../../shared/projectTypes'
import {
  SlideSurfaceHost,
  type ComponentSlideItemHostFactory,
  type RuntimeSlideItemHostFactory,
  type SlideInspectionMode,
  type SlideLayerHit,
} from '../slide/SlideSurfaceHost'
import {
  cloneFlowDocument,
  type FlowBlock,
  type FlowSurfaceDocument,
} from './flowModel'
import { DomPlaybackFreeze } from '../domPlaybackFreeze'

export interface FlowRenderOptions {
  domDocument?: Document
  resolveAsset?: (assetId: string) => string | undefined
  renderComponent?: (
    block: Extract<FlowBlock, { type: 'component' }>,
  ) => Node | FlowRenderedComponent | undefined
  resolveComponentName?: (packageId: string, version: string) => string | undefined
  expandSections?: boolean
}

export interface FlowRenderedComponent {
  node: Node
  activate?(): void | Promise<void>
  suspend?(): void | Promise<void>
  resume?(): void | Promise<void>
  reset?(): void | Promise<void>
  setInspectionMode?(mode: SlideInspectionMode): void | Promise<void>
  destroy?(): void | Promise<void>
}

export interface FlowLayerHit {
  surfaceId: string
  layerItemId: string
  kind: SlideLayerHit['kind']
  order: number
  source: 'surface' | 'global'
  field?: string
  hitId?: string
  targetKind?: 'text' | 'asset'
}

export interface FlowScopedLayerHostOptions {
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  globalLayerItems?: readonly ScopedLayerItem[]
  locationId?: string
  inspectionMode?: SlideInspectionMode
  beforeTeacherControllerAction?(
    action: TeacherControllerAction,
    item: NativeLayerItem,
  ): boolean | Promise<boolean>
  teacherControllerProgressText?(): string
  onTeacherControllerAction?(action: TeacherControllerAction, item: NativeLayerItem): void
  onLayerHit?(hit: FlowLayerHit): void
}

export interface FlowStaticLayerEntry {
  item: LayerItem
  source: 'global' | 'surface'
}

export interface FlowStaticLayerFallback {
  content: string
  warnings: string[]
}

function flowOverlaySceneId(surfaceId: string): string {
  return `flow-overlay-${surfaceId}`
}

function flowOverlayDocument(flow: FlowSurfaceDocument): SlideSurfaceDocument {
  return {
    id: flow.id,
    type: 'slide',
    title: `${flow.title} · 图层`,
    canvas: { width: 1280, height: 720 },
    surfaceLayerItems: structuredClone(flow.surfaceLayerItems),
    scenes: [{
      id: flowOverlaySceneId(flow.id),
      name: '语义长文覆盖图层',
      backgroundColor: 'transparent',
      layerItems: [],
      interactions: [],
    }],
  }
}

/**
 * Flow blocks remain semantic document content. Authored surface/course layers
 * share one absolute stacking context above that document and reuse the exact
 * Slide compositor, dynamic adapters and teacher-controller action contract.
 */
export class FlowScopedLayerHost {
  readonly id: string
  #options: FlowScopedLayerHostOptions
  #locationId: string
  #host: SlideSurfaceHost

  constructor(flow: FlowSurfaceDocument, options: FlowScopedLayerHostOptions = {}) {
    this.id = flow.id
    this.#options = { ...options, globalLayerItems: structuredClone(options.globalLayerItems ?? []) }
    this.#locationId = options.locationId ?? flow.id
    this.#host = new SlideSurfaceHost(flowOverlayDocument(flow), {
      componentHostFactory: options.componentHostFactory,
      runtimeHostFactory: options.runtimeHostFactory,
      globalLayerItems: structuredClone(options.globalLayerItems ?? []),
      resolveLocationId: () => this.#locationId,
      beforeTeacherControllerAction: options.beforeTeacherControllerAction,
      teacherControllerProgressText: options.teacherControllerProgressText,
      onTeacherControllerAction: options.onTeacherControllerAction,
      onLayerHit: (hit) => {
        if (hit.source === 'scene') return
        options.onLayerHit?.({
          surfaceId: this.id,
          layerItemId: hit.layerItemId,
          kind: hit.kind,
          order: hit.order,
          source: hit.source,
          ...(hit.field ? { field: hit.field } : {}),
          ...(hit.hitId ? { hitId: hit.hitId } : {}),
          ...(hit.targetKind ? { targetKind: hit.targetKind } : {}),
        })
      },
    })
  }

  get rootElement(): HTMLElement | null { return this.#host.rootElement }

  async mount(context: SurfaceMountContext): Promise<void> {
    await this.#host.mount(context)
    const root = this.#host.rootElement
    if (root) {
      root.classList.add('flow-scoped-layer-surface')
      root.style.position = 'absolute'
      root.style.inset = '0 auto auto 0'
      root.style.margin = '0'
      root.style.pointerEvents = 'none'
      root.style.backgroundColor = 'transparent'
      root.style.backgroundImage = 'none'
    }
    await this.#host.setInspectionMode(this.#options.inspectionMode ?? 'playback')
  }

  async updateDocument(flow: FlowSurfaceDocument): Promise<void> {
    if (flow.id !== this.id) throw new Error('Flow surface identity cannot change')
    await this.#host.updateDocument(flowOverlayDocument(flow))
  }

  async updateGlobalLayerItems(items: readonly ScopedLayerItem[]): Promise<void> {
    this.#options.globalLayerItems = structuredClone(items)
    await this.#host.updateGlobalLayerItems(items)
  }

  async setLocationId(locationId: string): Promise<void> {
    if (this.#locationId === locationId) return
    this.#locationId = locationId
    // Reconcile visibility without remounting any stable Runtime/Component item.
    await this.#host.updateGlobalLayerItems(this.#options.globalLayerItems ?? [])
  }

  setInspectionMode(mode: SlideInspectionMode): Promise<void> {
    this.#options.inspectionMode = mode
    return this.#host.setInspectionMode(mode)
  }

  refreshTeacherControllers(): void {
    this.#host.refreshTeacherControllers()
  }

  activate(): Promise<void> { return this.#host.activate() }
  suspend(): Promise<void> { return this.#host.suspend() }
  resume(): Promise<void> { return this.#host.resume() }
  reset(scope: SurfaceResetScope): Promise<void> { return this.#host.reset(scope) }
  capture(request: SurfaceCaptureRequest): Promise<SurfaceCapture> { return this.#host.capture(request) }
  destroy(): Promise<void> { return this.#host.destroy() }
}

function flowComponentNode(rendered: Node | FlowRenderedComponent): Node {
  return 'node' in rendered ? rendered.node : rendered
}

function appendTextElement(
  dom: Document,
  parent: Node,
  tag: string,
  text: string,
): HTMLElement {
  const element = dom.createElement(tag)
  element.textContent = text
  parent.appendChild(element)
  return element
}

function appendListTreeDom(
  dom: Document,
  parent: HTMLElement,
  nodes: readonly FlowListTreeNode[],
  ordered: boolean,
): void {
  for (const node of nodes) {
    const listItem = appendTextElement(dom, parent, 'li', node.item.text)
    listItem.dataset.flowListItemId = node.item.id
    listItem.dataset.flowListLevel = String(node.item.level)
    if (node.children.length > 0) {
      const nested = dom.createElement(ordered ? 'ol' : 'ul')
      appendListTreeDom(dom, nested, node.children, ordered)
      listItem.appendChild(nested)
    }
  }
}

function renderBlockDom(
  block: FlowBlock,
  parent: HTMLElement,
  options: FlowRenderOptions,
): void {
  const dom = options.domDocument ?? document
  let element: HTMLElement
  switch (block.type) {
    case 'heading':
      element = appendTextElement(dom, parent, `h${block.level}`, block.text)
      break
    case 'paragraph':
      element = appendTextElement(dom, parent, 'p', block.text)
      break
    case 'quote': {
      element = dom.createElement('blockquote')
      appendTextElement(dom, element, 'p', block.text)
      if (block.citation) appendTextElement(dom, element, 'cite', block.citation)
      parent.appendChild(element)
      break
    }
    case 'list': {
      element = dom.createElement(block.ordered ? 'ol' : 'ul')
      appendListTreeDom(dom, element, flowListItemsToTree(block.items), block.ordered)
      parent.appendChild(element)
      break
    }
    case 'divider':
      element = dom.createElement('hr')
      parent.appendChild(element)
      break
    case 'media': {
      element = dom.createElement('figure')
      const source = options.resolveAsset?.(block.assetId) ?? ''
      if (block.mediaKind === 'image') {
        const image = dom.createElement('img')
        image.alt = block.altText ?? ''
        image.src = source
        image.dataset.assetId = block.assetId
        element.appendChild(image)
      } else {
        const media = dom.createElement(block.mediaKind)
        media.controls = true
        media.src = source
        media.dataset.assetId = block.assetId
        media.setAttribute('aria-label', block.altText ?? block.caption ?? block.mediaKind)
        element.appendChild(media)
      }
      element.dataset.layout = block.layout
      if (block.caption) appendTextElement(dom, element, 'figcaption', block.caption)
      parent.appendChild(element)
      break
    }
    case 'table': {
      element = dom.createElement('table')
      if (block.caption) appendTextElement(dom, element, 'caption', block.caption)
      const head = dom.createElement('thead')
      const header = dom.createElement('tr')
      block.columns.forEach((column) => {
        const cell = appendTextElement(dom, header, 'th', column.header)
        cell.dataset.flowColumnId = column.id
      })
      head.appendChild(header)
      element.appendChild(head)
      const body = dom.createElement('tbody')
      block.rows.forEach((row) => {
        const tr = dom.createElement('tr')
        tr.dataset.flowRowId = row.id
        block.columns.forEach((column) => appendTextElement(dom, tr, 'td', row.cells[column.id] ?? ''))
        body.appendChild(tr)
      })
      element.appendChild(body)
      parent.appendChild(element)
      break
    }
    case 'formula':
      element = appendTextElement(dom, parent, 'div', serializeFormulaAst(block.ast))
      element.className = 'flow-formula'
      element.dataset.formulaId = block.formulaId
      element.setAttribute('role', 'math')
      element.setAttribute('aria-label', block.accessibleText)
      break
    case 'code': {
      element = dom.createElement('pre')
      const code = dom.createElement('code')
      code.textContent = block.code
      if (block.language) code.dataset.language = block.language
      element.appendChild(code)
      parent.appendChild(element)
      break
    }
    case 'callout':
      element = dom.createElement('aside')
      element.dataset.tone = block.tone
      if (block.title) appendTextElement(dom, element, 'strong', block.title)
      appendTextElement(dom, element, 'p', block.body)
      parent.appendChild(element)
      break
    case 'section': {
      const details = dom.createElement('details')
      details.open = options.expandSections === true || !block.collapsedByDefault
      appendTextElement(dom, details, 'summary', block.title)
      const content = dom.createElement('div')
      content.className = 'flow-section-content'
      for (const child of block.blocks) renderBlockDom(child, content, options)
      details.appendChild(content)
      parent.appendChild(details)
      element = details
      break
    }
    case 'component': {
      const rendered = options.renderComponent?.(block)
      if (rendered) {
        element = dom.createElement('div')
        element.appendChild(flowComponentNode(rendered))
        parent.appendChild(element)
      } else {
        const componentName = options.resolveComponentName?.(
          block.component.packageId,
          block.component.version,
        ) ?? '互动组件'
        element = dom.createElement('aside')
        element.className = 'flow-component-fallback'
        const source = options.resolveAsset?.(block.staticFallbackAssetId)
        if (source) {
          const image = dom.createElement('img')
          image.src = source
          image.alt = `${componentName}的静态预览`
          image.dataset.assetId = block.staticFallbackAssetId
          element.appendChild(image)
        }
        appendTextElement(dom, element, 'strong', componentName)
        appendTextElement(dom, element, 'p', '当前显示静态预览')
        parent.appendChild(element)
      }
      element.dataset.componentId = block.component.packageId
      break
    }
  }
  element.dataset.flowBlockId = block.id
  element.classList.add('flow-block', `flow-block-${block.type}`)
}

export function renderFlowDocument(
  flow: FlowSurfaceDocument,
  options: FlowRenderOptions = {},
): HTMLElement {
  const dom = options.domDocument ?? document
  const article = dom.createElement('article')
  article.className = 'flow-surface'
  article.dataset.surfaceId = flow.id
  article.lang = 'zh-CN'
  article.style.setProperty('--flow-reading-width', `${flow.layout.readingWidth}px`)
  for (const block of flow.blocks) renderBlockDom(block, article, options)
  return article
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function layerFrameStyle(item: LayerItem): string {
  const { frame } = item
  return [
    'position:absolute',
    `left:${frame.x}px`,
    `top:${frame.y}px`,
    `width:${frame.width}px`,
    `height:${frame.height}px`,
    'box-sizing:border-box',
    'overflow:hidden',
    `opacity:${item.opacity}`,
    `transform:rotate(${item.rotation}deg)`,
    'transform-origin:center center',
  ].join(';')
}

function nativeStaticMarkup(
  item: NativeLayerItem,
  resolveAsset: (assetId: string) => string | undefined,
): string {
  const { content } = item
  if (content.nativeType === 'text') {
    const { style } = content.data
    return `<div data-native-type="text" style="box-sizing:border-box;width:100%;height:100%;padding:${style.padding}px;white-space:pre-wrap;overflow-wrap:anywhere;font-family:${escapeHtml(style.fontFamily)};font-size:${style.fontSize}px;line-height:${style.lineSpacing};letter-spacing:${style.letterSpacing}px;color:${escapeHtml(style.color)};font-weight:${style.bold ? 700 : 400};font-style:${style.italic ? 'italic' : 'normal'};text-align:${style.align};background:${escapeHtml(style.backgroundColor)}">${escapeHtml(content.data.text)}</div>`
  }
  if (content.nativeType === 'formula') {
    return `<div data-native-type="formula" role="math" aria-label="${escapeHtml(content.data.accessibleText)}" style="box-sizing:border-box;width:100%;height:100%;display:grid;place-items:center;font-size:${content.data.style.fontSize}px;color:${escapeHtml(content.data.style.color)}">${escapeHtml(serializeFormulaAst(content.data.ast))}</div>`
  }
  if (content.nativeType === 'image') {
    const source = resolveAsset(content.data.assetId) ?? ''
    return `<img data-native-type="image" data-asset-id="${escapeHtml(content.data.assetId)}" src="${escapeHtml(source)}" alt="${escapeHtml(item.label)}" style="width:100%;height:100%;object-fit:${content.data.fit}">`
  }
  if (content.nativeType === 'video') {
    const posterId = content.data.poster.mode === 'image' ? content.data.poster.assetId : undefined
    const poster = posterId ? resolveAsset(posterId) : undefined
    return poster
      ? `<img data-native-type="video" data-asset-id="${escapeHtml(posterId!)}" src="${escapeHtml(poster)}" alt="${escapeHtml(item.label)}的视频封面" style="width:100%;height:100%;object-fit:${content.data.fit}">`
      : `<div data-native-type="video" class="flow-static-descriptive-fallback">视频：${escapeHtml(item.label)}</div>`
  }
  if (content.nativeType === 'shape') {
    const { style } = content.data
    const radius = content.data.shapeType === 'ellipse' ? '50%' : `${style.cornerRadius}px`
    return `<div data-native-type="shape" aria-label="${escapeHtml(item.label)}" style="box-sizing:border-box;width:100%;height:100%;border:${style.borderWidth}px solid ${escapeHtml(style.borderColor)};border-radius:${radius};background:${escapeHtml(style.fillColor)}"></div>`
  }
  const buttons = content.data.buttons
    .filter((button) => button.visible)
    .map((button) => `<span>${escapeHtml(button.label)}</span>`)
    .join('')
  return `<div data-native-type="teacher-controller" style="box-sizing:border-box;width:100%;height:100%;padding:8px 12px;border-radius:${content.data.style.cornerRadius}px;background:${escapeHtml(content.data.style.backgroundColor)};color:${escapeHtml(content.data.style.textColor)}"><strong>${escapeHtml(content.data.title)}</strong>${buttons}</div>`
}

/**
 * Deterministic non-interactive fallback for Flow print paths that cannot mount
 * the real Runtime/Component hosts. Entries are always normalized by the same
 * sparse order + stable-id rule used by the live compositor.
 */
export function buildFlowStaticLayerFallback(
  entries: readonly FlowStaticLayerEntry[],
  resolveAsset: (assetId: string) => string | undefined = () => undefined,
): FlowStaticLayerFallback {
  const warnings: string[] = []
  const ordered = [...entries].sort((left, right) =>
    left.item.order - right.item.order ||
    compareStableStrings(left.item.layerItemId, right.item.layerItemId),
  )
  const layers = ordered.map(({ item, source }) => {
    let content: string
    let disposition = 'preserved'
    if (item.kind === 'native') {
      if (item.content.nativeType === 'teacher-controller' && !item.content.data.includeInStaticExports) {
        warnings.push(`教师控制器“${item.label}”已按静态导出设置省略。`)
        content = '<div class="flow-static-descriptive-fallback">教师控制器已按静态导出设置省略</div>'
        disposition = 'omitted'
      } else {
        content = nativeStaticMarkup(item, resolveAsset)
      }
    } else {
      const assetId = item.kind === 'component'
        ? item.staticFallbackAssetId
        : item.runtime.staticFallback?.assetId
      const sourceUrl = assetId ? resolveAsset(assetId) : undefined
      disposition = 'fallback'
      if (sourceUrl && assetId) {
        content = `<img src="${escapeHtml(sourceUrl)}" data-asset-id="${escapeHtml(assetId)}" alt="${escapeHtml(item.label)}的静态预览" style="width:100%;height:100%;object-fit:contain">`
        warnings.push(`“${item.label}”已使用作者设置的静态预览；导出文件中不保留互动。`)
      } else {
        content = `<div class="flow-static-descriptive-fallback">${item.kind === 'component' ? '互动组件' : '互动内容'}：${escapeHtml(item.label)}（无可用静态预览）</div>`
        warnings.push(`“${item.label}”没有可用的静态预览，已用说明文字代替。`)
      }
    }
    return `<div class="slide-layer-item flow-static-layer-item" data-layer-item-id="${escapeHtml(item.layerItemId)}" data-layer-kind="${item.kind}" data-layer-source="${source}" data-layer-order="${item.order}" data-static-disposition="${disposition}"${item.visible && disposition !== 'omitted' ? '' : ' hidden'} style="${layerFrameStyle(item)}"><div class="slide-layer-content" style="width:100%;height:100%">${content}</div></div>`
  }).join('')
  return {
    content: `<section class="slide-surface flow-static-layer-surface" data-static-layer-count="${ordered.length}" style="position:relative;width:1280px;height:720px;background:transparent">${layers}</section>`,
    warnings,
  }
}

function serializeListTree(
  nodes: readonly FlowListTreeNode[],
  ordered: boolean,
): string {
  const tag = ordered ? 'ol' : 'ul'
  return `<${tag}>${nodes.map((node) => (
    `<li data-flow-list-item-id="${escapeHtml(node.item.id)}" data-flow-list-level="${node.item.level}">${escapeHtml(node.item.text)}${node.children.length > 0 ? serializeListTree(node.children, ordered) : ''}</li>`
  )).join('')}</${tag}>`
}

function serializeBlock(
  block: FlowBlock,
  resolveAsset: (assetId: string) => string | undefined,
  resolveComponentName: NonNullable<FlowRenderOptions['resolveComponentName']>,
): string {
  const id = escapeHtml(block.id)
  const wrap = (content: string, tag = 'div') => `<${tag} class="flow-block flow-block-${block.type}" data-flow-block-id="${id}">${content}</${tag}>`
  switch (block.type) {
    case 'heading': return wrap(escapeHtml(block.text), `h${block.level}`)
    case 'paragraph': return wrap(escapeHtml(block.text), 'p')
    case 'quote': return wrap(`<p>${escapeHtml(block.text)}</p>${block.citation ? `<cite>${escapeHtml(block.citation)}</cite>` : ''}`, 'blockquote')
    case 'list': {
      const tree = serializeListTree(flowListItemsToTree(block.items), block.ordered)
      return `<div class="flow-block flow-block-list" data-flow-block-id="${id}">${tree}</div>`
    }
    case 'divider': return `<hr class="flow-block flow-block-divider" data-flow-block-id="${id}">`
    case 'media': {
      const src = escapeHtml(resolveAsset(block.assetId) ?? '')
      const media = block.mediaKind === 'image'
        ? `<img src="${src}" alt="${escapeHtml(block.altText ?? '')}" data-asset-id="${escapeHtml(block.assetId)}">`
        : `<${block.mediaKind} src="${src}" controls data-asset-id="${escapeHtml(block.assetId)}" aria-label="${escapeHtml(block.altText ?? block.caption ?? block.mediaKind)}"></${block.mediaKind}>`
      return wrap(`${media}${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}`, 'figure')
    }
    case 'table': return wrap(`${block.caption ? `<caption>${escapeHtml(block.caption)}</caption>` : ''}<thead><tr>${block.columns.map((column) => `<th data-flow-column-id="${escapeHtml(column.id)}">${escapeHtml(column.header)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr data-flow-row-id="${escapeHtml(row.id)}">${block.columns.map((column) => `<td>${escapeHtml(row.cells[column.id] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>`, 'table')
    case 'formula': return wrap(`<span role="math" aria-label="${escapeHtml(block.accessibleText)}" data-formula-id="${escapeHtml(block.formulaId)}">${escapeHtml(serializeFormulaAst(block.ast))}</span>`)
    case 'code': return wrap(`<code${block.language ? ` data-language="${escapeHtml(block.language)}"` : ''}>${escapeHtml(block.code)}</code>`, 'pre')
    case 'callout': return wrap(`${block.title ? `<strong>${escapeHtml(block.title)}</strong>` : ''}<p>${escapeHtml(block.body)}</p>`, 'aside')
    case 'section': return `<details class="flow-block flow-block-section" data-flow-block-id="${id}"${block.collapsedByDefault ? '' : ' open'}><summary>${escapeHtml(block.title)}</summary>${block.blocks.map((child) => serializeBlock(child, resolveAsset, resolveComponentName)).join('')}</details>`
    case 'component': {
      const fallback = resolveAsset(block.staticFallbackAssetId)
      const componentName = resolveComponentName(block.component.packageId, block.component.version) ?? '互动组件'
      return wrap(`${fallback ? `<img src="${escapeHtml(fallback)}" alt="${escapeHtml(componentName)}的静态预览" data-asset-id="${escapeHtml(block.staticFallbackAssetId)}">` : ''}<strong>${escapeHtml(componentName)}</strong><p>当前显示静态预览</p>`, 'aside')
    }
  }
}

export function buildFlowStandaloneHtml(
  flow: FlowSurfaceDocument,
  options: Pick<FlowRenderOptions, 'resolveAsset' | 'resolveComponentName' | 'expandSections'> & {
    /** Already ordered/captured surface+global layer composition. */
    layerHtml?: string
  } = {},
): string {
  const resolveAsset = options.resolveAsset ?? (() => undefined)
  const resolveComponentName = options.resolveComponentName ?? (() => undefined)
  const blocks = flow.blocks.map((block) => serializeBlock(block, resolveAsset, resolveComponentName)).join('\n')
  const layerHtml = options.layerHtml?.trim() ?? ''
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(flow.title)}</title><style>html{color-scheme:light}body{margin:0;font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#172033;background:#fff}.flow-static-stack{position:relative;min-height:100%;isolation:isolate}.flow-surface{box-sizing:border-box;max-width:${flow.layout.readingWidth}px;margin:0 auto;padding:48px 32px;line-height:1.75}.flow-static-layer-mount{position:absolute;inset:0 auto auto 0;width:1280px;height:720px;pointer-events:none}.flow-static-layer-mount>.slide-surface{margin:0!important;background:transparent!important;pointer-events:none}.flow-static-descriptive-fallback{box-sizing:border-box;width:100%;height:100%;display:grid;place-items:center;padding:8px;border:1px dashed #64748b;background:#f8fafc;color:#334155}.flow-block{overflow-wrap:anywhere}img,video{max-width:100%;height:auto}audio{max-width:100%}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:.5rem;text-align:left}aside{border-left:4px solid #3b82f6;padding:.75rem 1rem;background:#eff6ff}summary{cursor:pointer;font-weight:700}</style></head><body><main class="flow-static-stack"><article class="flow-surface" data-surface-id="${escapeHtml(flow.id)}">${options.expandSections ? blocks.replace(/<details(?![^>]* open)/g, '<details open') : blocks}</article>${layerHtml ? `<div class="flow-static-layer-mount" data-flow-layer-composition="ordered">${layerHtml}</div>` : ''}</main></body></html>`
}

export class FlowSurfaceHost implements SurfaceHost {
  readonly kind = 'flow' as const
  readonly id: string
  #initial: FlowSurfaceDocument
  #current: FlowSurfaceDocument
  #context: SurfaceMountContext | null = null
  #root: HTMLElement | null = null
  #article: HTMLElement | null = null
  #overlayMount: HTMLElement | null = null
  #scopedLayers: FlowScopedLayerHost
  #active = false
  #renderComponent?: FlowRenderOptions['renderComponent']
  #resolveComponentName?: FlowRenderOptions['resolveComponentName']
  #renderedComponents: FlowRenderedComponent[] = []
  #mode: SlideInspectionMode = 'playback'
  #domPlayback = new DomPlaybackFreeze()

  constructor(
    flow: FlowSurfaceDocument,
    options: Pick<FlowRenderOptions, 'renderComponent' | 'resolveComponentName'> & FlowScopedLayerHostOptions = {},
  ) {
    this.id = flow.id
    this.#initial = cloneFlowDocument(flow)
    this.#current = cloneFlowDocument(flow)
    this.#renderComponent = options.renderComponent
    this.#resolveComponentName = options.resolveComponentName
    this.#mode = options.inspectionMode ?? 'playback'
    this.#scopedLayers = new FlowScopedLayerHost(flow, options)
  }

  get document(): FlowSurfaceDocument {
    return cloneFlowDocument(this.#current)
  }

  updateDocument(flow: FlowSurfaceDocument): void {
    if (flow.id !== this.id) throw new Error('Flow surface identity cannot change')
    this.#current = cloneFlowDocument(flow)
    this.#render()
    void this.#scopedLayers.updateDocument(flow)
  }

  async mount(context: SurfaceMountContext): Promise<void> {
    if (this.#context) throw new Error('Flow surface is already mounted')
    this.#context = context
    const dom = context.container.ownerDocument
    const root = dom.createElement('section')
    root.className = 'flow-surface-stack'
    root.dataset.surfaceId = this.id
    root.style.position = 'relative'
    root.style.isolation = 'isolate'
    root.style.minHeight = '100%'
    root.hidden = !this.#active
    const overlayMount = dom.createElement('div')
    overlayMount.className = 'flow-scoped-layer-mount'
    overlayMount.style.position = 'absolute'
    overlayMount.style.inset = '0 auto auto 0'
    overlayMount.style.width = '1280px'
    overlayMount.style.height = '720px'
    overlayMount.style.pointerEvents = 'none'
    root.appendChild(overlayMount)
    context.container.appendChild(root)
    this.#root = root
    this.#overlayMount = overlayMount
    this.#render()
    await this.#scopedLayers.mount({ ...context, container: overlayMount })
  }

  async activate(): Promise<void> {
    this.#active = true
    if (this.#root) this.#root.hidden = false
    await Promise.all(this.#renderedComponents.map((component) => component.activate?.()))
    await this.#scopedLayers.activate()
    this.#syncDomPlayback()
  }

  async suspend(): Promise<void> {
    this.#active = false
    if (this.#root) this.#root.hidden = true
    await Promise.all(this.#renderedComponents.map((component) => component.suspend?.()))
    await this.#scopedLayers.suspend()
    this.#syncDomPlayback()
  }

  async resume(): Promise<void> {
    this.#active = true
    if (this.#root) this.#root.hidden = false
    await Promise.all(this.#renderedComponents.map((component) => component.resume?.()))
    await this.#scopedLayers.resume()
    this.#syncDomPlayback()
  }

  async reset(scope: SurfaceResetScope): Promise<void> {
    this.#current = cloneFlowDocument(this.#initial)
    this.#render()
    await this.#scopedLayers.updateDocument(this.#current)
    await this.#scopedLayers.reset(scope)
  }

  updateGlobalLayerItems(items: readonly ScopedLayerItem[]): Promise<void> {
    return this.#scopedLayers.updateGlobalLayerItems(items)
  }

  setLocationId(locationId: string): Promise<void> {
    return this.#scopedLayers.setLocationId(locationId)
  }

  refreshTeacherControllers(): void {
    this.#scopedLayers.refreshTeacherControllers()
  }

  async setInspectionMode(mode: SlideInspectionMode): Promise<void> {
    this.#mode = mode
    await Promise.all(this.#renderedComponents.map((component) => component.setInspectionMode?.(mode)))
    await this.#scopedLayers.setInspectionMode(mode)
    this.#syncDomPlayback()
  }

  async capture(request: SurfaceCaptureRequest): Promise<SurfaceCapture> {
    const layers = await this.#scopedLayers.capture(request)
    return {
      format: 'html',
      content: buildFlowStandaloneHtml(this.#current, {
        expandSections: true,
        resolveAsset: (assetId) => this.#context?.services.resolveAsset(assetId),
        resolveComponentName: this.#resolveComponentName,
        layerHtml: layers.content,
      }),
      width: layers.width,
      height: layers.height,
      warnings: layers.warnings,
    }
  }

  async destroy(): Promise<void> {
    const components = this.#renderedComponents
    this.#renderedComponents = []
    await Promise.all(components.map((component) => component.destroy?.()))
    await this.#scopedLayers.destroy()
    this.#root?.remove()
    this.#root = null
    this.#article = null
    this.#overlayMount = null
    this.#context = null
    this.#active = false
    this.#domPlayback.discard()
  }

  #render(): void {
    const root = this.#root
    if (!this.#context || !root) return
    this.#destroyRenderedComponents()
    const next = renderFlowDocument(this.#current, {
      domDocument: this.#context.container.ownerDocument,
      resolveAsset: (assetId) => this.#context?.services.resolveAsset(assetId),
      resolveComponentName: this.#resolveComponentName,
      renderComponent: (block) => {
        const rendered = this.#renderComponent?.(block)
        if (rendered && 'node' in rendered) this.#renderedComponents.push(rendered)
        return rendered
      },
    })
    next.hidden = false
    this.#article?.remove()
    root.insertBefore(next, this.#overlayMount)
    this.#article = next
    for (const component of this.#renderedComponents) {
      void component.setInspectionMode?.(this.#mode)
      if (this.#active) void component.activate?.()
      else void component.suspend?.()
    }
    this.#syncDomPlayback()
  }

  #syncDomPlayback(): void {
    if (!this.#active || this.#mode === 'inspect') {
      this.#domPlayback.freeze(this.#root, this.#article, '.flow-block-media audio, .flow-block-media video')
    } else {
      this.#domPlayback.release()
    }
  }

  #destroyRenderedComponents(): void {
    for (const component of this.#renderedComponents) void component.destroy?.()
    this.#renderedComponents = []
  }
}
