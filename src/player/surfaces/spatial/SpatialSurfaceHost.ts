import type {
  ComponentLayerItem,
  LayerItem,
  NativeLayerItem,
  RuntimeLayerItem,
  ScopedLayerItem,
} from '../../../shared/courseProjectTypes'
import { renderFormulaNodeSvg } from '../../../shared/formulaRenderer'
import type { FormulaNode } from '../../../shared/projectTypes'
import type { TeacherControllerAction } from '../../../shared/projectTypes'
import type {
  SurfaceCapture,
  SurfaceCaptureRequest,
  SurfaceHost,
  SurfaceLifecyclePhase,
  SurfaceMountContext,
  SurfaceResetScope,
} from '../SurfaceHost'
import type {
  ComponentSlideItemHostFactory,
  RuntimeSlideItemHostFactory,
  SlideInspectionMode,
  SlideItemHost,
  SlideItemMountContext,
} from '../slide/SlideSurfaceHost'
import { DomPlaybackFreeze } from '../domPlaybackFreeze'
import {
  buildSpatialMinimap,
  cloneSpatialDocument,
  cullSpatialItems,
  panSpatialCamera,
  spatialCameraFromPose,
  type SpatialCamera,
  type SpatialRenderableItem,
  type SpatialSurfaceDocument,
  validateSpatialCamera,
  zoomSpatialCameraAt,
} from './spatialModel'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface SpatialRenderOptions {
  domDocument?: Document
  resolveAsset?: (assetId: string) => string | undefined
  showControls?: boolean
  showMinimap?: boolean
  onCameraChange?: (camera: SpatialCamera) => void
}

export interface SpatialSurfaceHostOptions {
  minZoom?: number
  maxZoom?: number
  showControls?: boolean
  showMinimap?: boolean
  /** Disable the built-in camera gestures when an authoring shell owns them. */
  interactiveCamera?: boolean
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  /** Course-scoped items share the world list and its sparse order. */
  globalLayerItems?: readonly ScopedLayerItem[]
  /** Drives include/exclude visibility for course- and surface-scoped items. */
  initialLocationId?: string
  onLayerHit?(hit: SpatialLayerHit): void
  onTeacherControllerAction?(action: TeacherControllerAction, item: NativeLayerItem): void | Promise<void>
}

export interface SpatialLayerHit {
  surfaceId: string
  layerItemId: string
  kind: LayerItem['kind']
  /** Current canonical back-to-front position among visible world items. */
  order: number
  source: 'world' | 'surface' | 'global'
  field?: string
  hitId?: string
  targetKind?: 'text' | 'asset'
}

type DynamicSpatialItem = ComponentLayerItem | RuntimeLayerItem

interface SpatialItemRecord {
  item: LayerItem
  source: SpatialLayerHit['source']
  wrapper: SVGGElement
  content: HTMLElement | SVGElement
  host: SlideItemHost<DynamicSpatialItem> | null
  abortController: AbortController
  mounted: boolean
  active: boolean
  activatedOnce: boolean
  failed: boolean
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(value)
    ? value
    : fallback
}

function colorWithOpacity(color: string, opacity: number): string {
  const alpha = Math.max(0, Math.min(1, opacity))
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  const longHex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  const match = longHex ?? (shortHex
    ? [shortHex[0], `${shortHex[1]}${shortHex[1]}`, `${shortHex[2]}${shortHex[2]}`, `${shortHex[3]}${shortHex[3]}`]
    : null)
  if (!match) return color
  return `rgba(${Number.parseInt(match[1]!, 16)}, ${Number.parseInt(match[2]!, 16)}, ${Number.parseInt(match[3]!, 16)}, ${alpha})`
}

function nativeDescription(item: Extract<LayerItem, { kind: 'native' }>): string {
  switch (item.content.nativeType) {
    case 'text': return item.content.data.text
    case 'formula': return item.content.data.accessibleText
    case 'image': return item.label
    case 'video': return item.label
    case 'shape': return item.label
    case 'teacher-controller': return item.label
  }
}

function nativePrimaryAuthoringField(item: NativeLayerItem): string | undefined {
  switch (item.content.nativeType) {
    case 'text': return 'content.data.text'
    case 'image':
    case 'video': return 'content.data.assetId'
    case 'formula': return 'content.data.ast'
    case 'teacher-controller': return 'content.data.title'
    case 'shape': return undefined
  }
}

function formulaNodeForItem(item: NativeLayerItem): FormulaNode {
  if (item.content.nativeType !== 'formula') throw new TypeError('Expected formula item')
  return {
    id: item.layerItemId,
    name: item.label,
    type: 'formula',
    x: 0,
    y: 0,
    width: item.frame.width,
    height: item.frame.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: item.locked,
    playbackInitialVisibility: item.playbackInitialVisibility,
    ...structuredClone(item.content.data),
  }
}

function itemDescription(item: LayerItem): string {
  if (item.kind === 'native') return nativeDescription(item)
  if (item.kind === 'component') return `互动组件：${item.component.packageId}`
  return `互动运行时：${item.label}`
}

function imageAssetId(item: LayerItem): string | undefined {
  if (item.kind === 'native' && item.content.nativeType === 'image') return item.content.data.assetId
  if (item.kind === 'native' && item.content.nativeType === 'video') return item.content.data.poster.assetId
  if (item.kind === 'component') return item.staticFallbackAssetId
  if (item.kind === 'runtime') return item.runtime.staticFallback?.assetId
  return undefined
}

function itemFill(item: LayerItem): string {
  if (item.kind !== 'native') return item.kind === 'component' ? '#eff6ff' : '#f5f3ff'
  if (item.content.nativeType === 'shape') return safeColor(item.content.data.style.fillColor, '#e2e8f0')
  return '#ffffff'
}

type SvgSpec = {
  tag: 'g' | 'defs' | 'marker' | 'rect' | 'ellipse' | 'line' | 'path' | 'polygon' | 'circle' | 'text' | 'tspan'
  attributes?: Record<string, string | number>
  text?: string
  children?: SvgSpec[]
}

function svgSpecElement(dom: Document, spec: SvgSpec): SVGElement {
  const element = dom.createElementNS(SVG_NS, spec.tag)
  for (const [name, value] of Object.entries(spec.attributes ?? {})) {
    element.setAttribute(name, String(value))
  }
  if (spec.text !== undefined) element.textContent = spec.text
  for (const child of spec.children ?? []) element.appendChild(svgSpecElement(dom, child))
  return element
}

function svgSpecMarkup(spec: SvgSpec): string {
  const attributes = Object.entries(spec.attributes ?? {})
    .map(([name, value]) => ` ${name}="${escapeXml(String(value))}"`)
    .join('')
  const children = (spec.children ?? []).map(svgSpecMarkup).join('')
  if (spec.text === undefined && children.length === 0) return `<${spec.tag}${attributes}/>`
  return `<${spec.tag}${attributes}>${spec.text === undefined ? '' : escapeXml(spec.text)}${children}</${spec.tag}>`
}

function textAdvance(character: string, fontSize: number, letterSpacing: number): number {
  const base = /\s/u.test(character)
    ? 0.35
    : /[\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60]/u.test(character)
      ? 1
      : /[A-Z0-9]/u.test(character)
        ? 0.62
        : 0.54
  return fontSize * base + letterSpacing
}

function wrapSpatialText(
  text: string,
  maxWidth: number,
  fontSize: number,
  letterSpacing: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (paragraph.length === 0) {
      lines.push('')
      continue
    }
    let line = ''
    let width = 0
    for (const character of Array.from(paragraph)) {
      const advance = textAdvance(character, fontSize, letterSpacing)
      if (line && width + advance > maxWidth) {
        lines.push(line)
        line = character
        width = advance
      } else {
        line += character
        width += advance
      }
    }
    lines.push(line)
  }
  return lines.length > 0 ? lines : ['']
}

function textSpec(item: Extract<LayerItem, { kind: 'native' }>): SvgSpec | null {
  if (item.content.nativeType !== 'text') return null
  const { frame } = item
  const data = item.content.data
  const style = data.style
  const padding = Math.max(0, style.padding)
  const fontSize = Math.max(1, style.fontSize)
  // Keep the same authored spacing semantics as the shared Slide text layout:
  // lineSpacing is an additive point/pixel value, not a multiplier.
  const lineHeight = Math.max(fontSize, fontSize * 1.22 + style.lineSpacing)
  const usableWidth = Math.max(1, frame.width - padding * 2)
  const usableHeight = Math.max(1, frame.height - padding * 2)
  let lines = wrapSpatialText(data.text, usableWidth, fontSize, style.letterSpacing)
  if (style.overflow === 'fixed') {
    lines = lines.slice(0, Math.max(1, Math.floor(usableHeight / lineHeight)))
  }
  const totalHeight = lines.length * lineHeight
  const top = frame.y + padding + (
    style.verticalAlign === 'middle'
      ? Math.max(0, (usableHeight - totalHeight) / 2)
      : style.verticalAlign === 'bottom'
        ? Math.max(0, usableHeight - totalHeight)
        : 0
  )
  const x = style.align === 'center'
    ? frame.x + frame.width / 2
    : style.align === 'right'
      ? frame.x + frame.width - padding
      : frame.x + padding
  const anchor = style.align === 'center' ? 'middle' : style.align === 'right' ? 'end' : 'start'
  const decoration = [style.underline ? 'underline' : '', style.strike ? 'line-through' : '']
    .filter(Boolean).join(' ') || 'none'
  const children: SvgSpec[] = []
  if (style.backgroundOpacity > 0) {
    children.push({
      tag: 'rect',
      attributes: {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        rx: Math.max(0, style.cornerRadius),
        fill: safeColor(style.backgroundColor, '#ffffff'),
        'fill-opacity': Math.max(0, Math.min(1, style.backgroundOpacity)),
      },
    })
  }
  children.push({
    tag: 'text',
    attributes: {
      x,
      y: top,
      fill: safeColor(style.color, '#172033'),
      'font-family': style.fontFamily,
      'font-size': fontSize,
      'font-weight': style.bold ? 700 : 400,
      'font-style': style.italic ? 'italic' : 'normal',
      'text-decoration': decoration,
      'letter-spacing': style.letterSpacing,
      'text-anchor': anchor,
      'dominant-baseline': 'hanging',
      'writing-mode': style.writingMode,
    },
    children: lines.map((line, index) => ({
      tag: 'tspan',
      attributes: { x, dy: index === 0 ? 0 : lineHeight },
      text: line,
    })),
  })
  return { tag: 'g', children }
}

function markerSpec(id: string, arrow: string, color: string): SvgSpec | null {
  if (arrow === 'none') return null
  const shape: SvgSpec = arrow === 'circle'
    ? { tag: 'circle', attributes: { cx: 5, cy: 5, r: 3.3, fill: color } }
    : arrow === 'diamond'
      ? { tag: 'polygon', attributes: { points: '1,5 5,1 9,5 5,9', fill: color } }
      : arrow === 'stealth'
        ? { tag: 'polygon', attributes: { points: '0,1 10,5 0,9 3,5', fill: color } }
        : { tag: 'path', attributes: { d: 'M 0 0 L 10 5 L 0 10 z', fill: color } }
  return {
    tag: 'marker',
    attributes: {
      id,
      markerWidth: 10,
      markerHeight: 10,
      refX: 9,
      refY: 5,
      orient: 'auto-start-reverse',
      markerUnits: 'strokeWidth',
    },
    children: [shape],
  }
}

function shapeSpec(item: Extract<LayerItem, { kind: 'native' }>): SvgSpec | null {
  if (item.content.nativeType !== 'shape') return null
  const { frame } = item
  const { shapeType, style } = item.content.data
  const stroke = safeColor(style.borderColor, '#64748b')
  const fill = safeColor(style.fillColor, '#e2e8f0')
  const dash = style.lineStyle === 'dashed'
    ? `${Math.max(1, style.borderWidth * 4)} ${Math.max(1, style.borderWidth * 3)}`
    : style.lineStyle === 'dotted'
      ? `${Math.max(1, style.borderWidth)} ${Math.max(1, style.borderWidth * 2)}`
      : undefined
  const common: Record<string, string | number> = {
    fill,
    'fill-opacity': Math.max(0, Math.min(1, style.fillOpacity)),
    stroke,
    'stroke-opacity': Math.max(0, Math.min(1, style.borderOpacity)),
    'stroke-width': Math.max(0, style.borderWidth),
    ...(dash ? { 'stroke-dasharray': dash } : {}),
  }
  const markerBase = `spatial-${item.layerItemId.replace(/[^A-Za-z0-9_-]/g, '-')}`
  let startArrow = style.startArrow
  let endArrow = style.endArrow
  if (shapeType === 'arrow-left' || shapeType === 'arrow-left-right') startArrow = startArrow === 'none' ? 'triangle' : startArrow
  if (shapeType === 'arrow-right' || shapeType === 'arrow-up' || shapeType === 'arrow-down' || shapeType === 'arrow-left-right' || shapeType === 'elbow-arrow') endArrow = endArrow === 'none' ? 'triangle' : endArrow
  const startId = `${markerBase}-start`
  const endId = `${markerBase}-end`
  const startMarker = markerSpec(startId, startArrow, stroke)
  const endMarker = markerSpec(endId, endArrow, stroke)
  const lineAttributes = {
    ...common,
    fill: 'none',
    ...(startMarker ? { 'marker-start': `url(#${startId})` } : {}),
    ...(endMarker ? { 'marker-end': `url(#${endId})` } : {}),
  }
  let body: SvgSpec
  if (shapeType === 'ellipse') {
    body = { tag: 'ellipse', attributes: { ...common, cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2, rx: frame.width / 2, ry: frame.height / 2 } }
  } else if (shapeType === 'triangle') {
    body = { tag: 'polygon', attributes: { ...common, points: `${frame.x + frame.width / 2},${frame.y} ${frame.x + frame.width},${frame.y + frame.height} ${frame.x},${frame.y + frame.height}` } }
  } else if (shapeType === 'diamond') {
    body = { tag: 'polygon', attributes: { ...common, points: `${frame.x + frame.width / 2},${frame.y} ${frame.x + frame.width},${frame.y + frame.height / 2} ${frame.x + frame.width / 2},${frame.y + frame.height} ${frame.x},${frame.y + frame.height / 2}` } }
  } else if (shapeType === 'line' || shapeType.startsWith('arrow-')) {
    const vertical = shapeType === 'arrow-up' || shapeType === 'arrow-down'
    body = vertical
      ? { tag: 'line', attributes: shapeType === 'arrow-down'
        ? { ...lineAttributes, x1: frame.x + frame.width / 2, y1: frame.y, x2: frame.x + frame.width / 2, y2: frame.y + frame.height }
        : { ...lineAttributes, x1: frame.x + frame.width / 2, y1: frame.y + frame.height, x2: frame.x + frame.width / 2, y2: frame.y } }
      : { tag: 'line', attributes: { ...lineAttributes, x1: frame.x, y1: frame.y + frame.height / 2, x2: frame.x + frame.width, y2: frame.y + frame.height / 2 } }
  } else if (shapeType === 'elbow-arrow') {
    body = { tag: 'path', attributes: { ...lineAttributes, d: `M ${frame.x} ${frame.y + frame.height} L ${frame.x + frame.width / 2} ${frame.y + frame.height} L ${frame.x + frame.width / 2} ${frame.y} L ${frame.x + frame.width} ${frame.y}` } }
  } else if (shapeType.startsWith('brace-') || shapeType.startsWith('bracket-')) {
    body = { tag: 'path', attributes: { ...lineAttributes, d: `M ${frame.x + frame.width} ${frame.y} L ${frame.x} ${frame.y} L ${frame.x} ${frame.y + frame.height} L ${frame.x + frame.width} ${frame.y + frame.height}` } }
  } else if (shapeType === 'emphasis-dot') {
    body = { tag: 'circle', attributes: { ...common, cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2, r: Math.min(frame.width, frame.height) / 2 } }
  } else if (shapeType === 'emphasis-triangle') {
    body = { tag: 'polygon', attributes: { ...common, points: `${frame.x + frame.width / 2},${frame.y} ${frame.x + frame.width},${frame.y + frame.height} ${frame.x},${frame.y + frame.height}` } }
  } else {
    body = {
      tag: 'rect',
      attributes: {
        ...common,
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        rx: shapeType === 'rounded-rectangle' ? Math.max(1, style.cornerRadius) : 0,
      },
    }
  }
  const markers = [startMarker, endMarker].filter((entry): entry is SvgSpec => entry !== null)
  return markers.length > 0 ? { tag: 'g', children: [{ tag: 'defs', children: markers }, body] } : body
}

function createSvgItem(
  dom: Document,
  renderable: SpatialRenderableItem,
  resolveAsset: (assetId: string) => string | undefined,
): SVGElement {
  const { item } = renderable
  const { frame } = item
  const assetId = imageAssetId(item)
  let element: SVGElement
  if (assetId) {
    element = dom.createElementNS(SVG_NS, 'image')
    element.setAttribute('href', resolveAsset(assetId) ?? '')
    element.setAttribute('x', String(frame.x))
    element.setAttribute('y', String(frame.y))
    element.setAttribute('width', String(frame.width))
    element.setAttribute('height', String(frame.height))
    element.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  } else if (item.kind === 'native' && item.content.nativeType === 'text') {
    element = svgSpecElement(dom, textSpec(item)!)
  } else if (item.kind === 'native' && item.content.nativeType === 'formula') {
    const rendered = renderFormulaNodeSvg(formulaNodeForItem(item))
    const parser = new dom.defaultView!.DOMParser()
    const parsed = parser.parseFromString(rendered.svg, 'image/svg+xml').documentElement
    element = dom.importNode(parsed, true) as unknown as SVGSVGElement
    element.setAttribute('x', String(frame.x))
    element.setAttribute('y', String(frame.y))
  } else if (item.kind === 'native' && item.content.nativeType === 'shape') {
    // Keep one stable wrapper for every shape regardless of its primitive or
    // whether arrow markers require their own nested group.
    element = svgSpecElement(dom, { tag: 'g', children: [shapeSpec(item)!] })
  } else {
    const group = dom.createElementNS(SVG_NS, 'g')
    const rect = dom.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(frame.x))
    rect.setAttribute('y', String(frame.y))
    rect.setAttribute('width', String(frame.width))
    rect.setAttribute('height', String(frame.height))
    rect.setAttribute('rx', item.kind === 'native' ? '0' : '8')
    rect.setAttribute('fill', itemFill(item))
    rect.setAttribute('stroke', '#64748b')
    group.appendChild(rect)
    const text = dom.createElementNS(SVG_NS, 'text')
    text.textContent = itemDescription(item)
    text.setAttribute('x', String(frame.x + frame.width / 2))
    text.setAttribute('y', String(frame.y + frame.height / 2))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'middle')
    text.setAttribute('fill', '#172033')
    group.appendChild(text)
    element = group
  }
  element.setAttribute('data-layer-item-id', item.layerItemId)
  element.setAttribute('data-layer-kind', item.kind)
  element.setAttribute('opacity', String(item.opacity))
  if (item.rotation !== 0) {
    element.setAttribute('transform', `rotate(${item.rotation} ${frame.x + frame.width / 2} ${frame.y + frame.height / 2})`)
  }
  return element
}

export function renderSpatialSurface(
  spatial: SpatialSurfaceDocument,
  camera: SpatialCamera,
  options: SpatialRenderOptions = {},
): HTMLElement {
  validateSpatialCamera(camera)
  const dom = options.domDocument ?? document
  const root = dom.createElement('div')
  root.className = 'spatial-surface'
  root.dataset.surfaceId = spatial.id
  root.tabIndex = 0
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', `${spatial.title} 空间探索`)
  const svg = dom.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(camera.viewportWidth))
  svg.setAttribute('height', String(camera.viewportHeight))
  svg.setAttribute('viewBox', `0 0 ${camera.viewportWidth} ${camera.viewportHeight}`)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', spatial.title)
  const world = dom.createElementNS(SVG_NS, 'g')
  world.setAttribute(
    'transform',
    `translate(${camera.viewportWidth / 2} ${camera.viewportHeight / 2}) scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`,
  )
  const resolveAsset = options.resolveAsset ?? (() => undefined)
  for (const item of cullSpatialItems(
    spatial.world.layerItems,
    camera,
    spatial.semanticZoom,
  )) {
    world.appendChild(createSvgItem(dom, item, resolveAsset))
  }
  svg.appendChild(world)
  root.appendChild(svg)

  if (options.showControls !== false) {
    const controls = dom.createElement('div')
    controls.className = 'spatial-controls'
    controls.setAttribute('role', 'toolbar')
    controls.setAttribute('aria-label', '空间视图控制')
    const addButton = (label: string, action: () => void, frameId?: string) => {
      const button = dom.createElement('button')
      button.type = 'button'
      button.textContent = label
      if (frameId) button.dataset.cameraFrameId = frameId
      button.addEventListener('click', action)
      controls.appendChild(button)
    }
    addButton('总览', () => options.onCameraChange?.(spatialCameraFromPose(
      spatial.camera.home,
      { width: camera.viewportWidth, height: camera.viewportHeight },
    )), 'home')
    for (const frame of spatial.camera.frames) {
      addButton(frame.name, () => options.onCameraChange?.(spatialCameraFromPose(
        frame,
        { width: camera.viewportWidth, height: camera.viewportHeight },
      )), frame.id)
    }
    addButton('缩小', () => options.onCameraChange?.(zoomSpatialCameraAt(
      camera,
      camera.zoom / 1.25,
      { x: camera.viewportWidth / 2, y: camera.viewportHeight / 2 },
    )))
    addButton('放大', () => options.onCameraChange?.(zoomSpatialCameraAt(
      camera,
      camera.zoom * 1.25,
      { x: camera.viewportWidth / 2, y: camera.viewportHeight / 2 },
    )))
    root.appendChild(controls)
  }

  if (options.showMinimap !== false) {
    const minimap = buildSpatialMinimap(spatial, camera, { width: 180, height: 112 })
    const map = dom.createElementNS(SVG_NS, 'svg')
    map.classList.add('spatial-minimap')
    map.setAttribute('width', String(minimap.width))
    map.setAttribute('height', String(minimap.height))
    map.setAttribute('viewBox', `0 0 ${minimap.width} ${minimap.height}`)
    map.setAttribute('role', 'img')
    map.setAttribute('aria-label', '空间内容小地图')
    for (const node of minimap.nodes) {
      const rect = dom.createElementNS(SVG_NS, 'rect')
      rect.dataset.layerItemId = node.id
      rect.setAttribute('x', String(node.x))
      rect.setAttribute('y', String(node.y))
      rect.setAttribute('width', String(Math.max(1, node.width)))
      rect.setAttribute('height', String(Math.max(1, node.height)))
      rect.setAttribute('fill', '#94a3b8')
      rect.setAttribute('opacity', '.72')
      map.appendChild(rect)
    }
    const viewport = dom.createElementNS(SVG_NS, 'rect')
    viewport.classList.add('spatial-minimap-viewport')
    viewport.setAttribute('x', String(minimap.viewport.x))
    viewport.setAttribute('y', String(minimap.viewport.y))
    viewport.setAttribute('width', String(Math.max(1, minimap.viewport.width)))
    viewport.setAttribute('height', String(Math.max(1, minimap.viewport.height)))
    viewport.setAttribute('fill', 'none')
    viewport.setAttribute('stroke', '#2563eb')
    viewport.setAttribute('stroke-width', '2')
    map.appendChild(viewport)
    root.appendChild(map)
  }
  return root
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function markupForItem(
  renderable: SpatialRenderableItem,
  resolveAsset: (assetId: string) => string | undefined,
): string {
  const { item } = renderable
  const { frame } = item
  const attributes = `data-layer-item-id="${escapeXml(item.layerItemId)}" data-layer-kind="${item.kind}" opacity="${item.opacity}"${item.rotation !== 0 ? ` transform="rotate(${item.rotation} ${frame.x + frame.width / 2} ${frame.y + frame.height / 2})"` : ''}`
  const assetId = imageAssetId(item)
  if (assetId) {
    return `<image ${attributes} href="${escapeXml(resolveAsset(assetId) ?? '')}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" preserveAspectRatio="xMidYMid meet"/>`
  }
  if (item.kind === 'native' && item.content.nativeType === 'text') {
    return `<g ${attributes}>${svgSpecMarkup(textSpec(item)!)}</g>`
  }
  if (item.kind === 'native' && item.content.nativeType === 'formula') {
    const rendered = renderFormulaNodeSvg(formulaNodeForItem(item))
    return rendered.svg.replace(
      '<svg ',
      `<svg ${attributes} x="${frame.x}" y="${frame.y}" `,
    )
  }
  if (item.kind === 'native' && item.content.nativeType === 'shape') {
    return `<g ${attributes}>${svgSpecMarkup(shapeSpec(item)!)}</g>`
  }
  return `<g ${attributes}><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}"${item.kind === 'native' ? '' : ' rx="8"'} fill="${itemFill(item)}" stroke="#64748b"/><text x="${frame.x + frame.width / 2}" y="${frame.y + frame.height / 2}" text-anchor="middle" dominant-baseline="middle" fill="#172033">${escapeXml(itemDescription(item))}</text></g>`
}

export function renderSpatialSvgMarkup(
  spatial: SpatialSurfaceDocument,
  camera: SpatialCamera,
  resolveAsset: (assetId: string) => string | undefined = () => undefined,
): string {
  validateSpatialCamera(camera)
  const items = cullSpatialItems(spatial.world.layerItems, camera, spatial.semanticZoom)
    .map((item) => markupForItem(item, resolveAsset))
    .join('')
  const transform = `translate(${camera.viewportWidth / 2} ${camera.viewportHeight / 2}) scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`
  return `<svg xmlns="${SVG_NS}" width="${camera.viewportWidth}" height="${camera.viewportHeight}" viewBox="0 0 ${camera.viewportWidth} ${camera.viewportHeight}" role="img" aria-label="${escapeXml(spatial.title)}"><g transform="${transform}">${items}</g></svg>`
}

class SpatialStaticFallbackHost<T extends DynamicSpatialItem> implements SlideItemHost<T> {
  #item: T
  #container: HTMLElement | null = null
  #services: SurfaceMountContext['services'] | null = null

  constructor(item: T, private readonly error: Error | null = null) {
    this.#item = item
  }

  mount(context: SlideItemMountContext<T>): void {
    this.#container = context.container
    this.#services = context.services
    this.#render()
  }

  update(item: T): void {
    this.#item = item
    this.#render()
  }

  destroy(): void {
    this.#container?.replaceChildren()
    this.#container = null
    this.#services = null
  }

  #render(): void {
    if (!this.#container || !this.#services) return
    const dom = this.#container.ownerDocument
    const root = dom.createElement('div')
    root.className = 'spatial-item-static-fallback'
    root.dataset.fallbackKind = this.#item.kind
    if (this.error) root.dataset.hostError = 'true'
    Object.assign(root.style, {
      boxSizing: 'border-box', width: '100%', height: '100%', overflow: 'hidden',
      display: 'grid', placeItems: 'center', color: '#172033',
      background: this.#item.kind === 'component' ? '#eff6ff' : '#f5f3ff',
      border: `1px ${this.error ? 'solid #dc2626' : 'dashed #64748b'}`,
    })
    const assetId = this.#item.kind === 'component'
      ? this.#item.staticFallbackAssetId
      : this.#item.runtime.staticFallback?.assetId
    if (assetId) {
      const image = dom.createElement('img')
      image.src = this.#services.resolveAsset(assetId) ?? ''
      image.alt = this.#item.label
      image.dataset.assetId = assetId
      Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'contain' })
      root.appendChild(image)
    }
    const label = dom.createElement('span')
    label.textContent = this.error
      ? `${this.#item.label}加载失败，已使用安全后备`
      : this.#item.kind === 'component'
        ? `互动组件：${this.#item.label}`
        : `互动运行时：${this.#item.label}`
    root.appendChild(label)
    this.#container.replaceChildren(root)
  }
}

function createSpatialRecord(
  dom: Document,
  item: LayerItem,
  source: SpatialLayerHit['source'],
  resolveAsset: (assetId: string) => string | undefined,
  onTeacherControllerAction: (
    action: TeacherControllerAction,
    item: NativeLayerItem,
  ) => void | Promise<void>,
): SpatialItemRecord {
  const wrapper = dom.createElementNS(SVG_NS, 'g')
  wrapper.dataset.spatialLayerRecord = 'true'
  wrapper.dataset.layerItemId = item.layerItemId
  wrapper.dataset.layerKind = item.kind
  wrapper.dataset.layerSource = source
  let content: HTMLElement | SVGElement
  if (item.kind === 'component' || item.kind === 'runtime' || (
    item.kind === 'native' && (
      item.content.nativeType === 'video' || item.content.nativeType === 'teacher-controller'
    )
  )) {
    const foreignObject = dom.createElementNS(SVG_NS, 'foreignObject')
    const html = dom.createElement('div')
    html.className = item.kind === 'native' ? 'spatial-native-video' : 'spatial-dynamic-content'
    Object.assign(html.style, {
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden', boxSizing: 'border-box',
    })
    foreignObject.appendChild(html)
    wrapper.appendChild(foreignObject)
    content = html
    if (item.kind === 'native' && item.content.nativeType === 'video') {
      const video = dom.createElement('video')
      const data = item.content.data
      video.src = resolveAsset(data.assetId) ?? ''
      video.autoplay = data.autoplay
      video.loop = data.loop
      video.muted = data.muted
      video.volume = data.volume
      video.playbackRate = data.playbackRate
      video.controls = data.showControls
      if (data.poster.assetId) video.poster = resolveAsset(data.poster.assetId) ?? ''
      Object.assign(video.style, { width: '100%', height: '100%', objectFit: data.fit })
      html.appendChild(video)
    } else if (item.kind === 'native' && item.content.nativeType === 'teacher-controller') {
      const { data } = item.content
      const nav = dom.createElement('nav')
      nav.className = 'spatial-native-teacher-controller'
      nav.setAttribute('aria-label', data.title || item.label)
      Object.assign(nav.style, {
        boxSizing: 'border-box', width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', gap: data.compact ? '4px' : '8px',
        padding: data.compact ? '4px 6px' : '8px 12px',
        backgroundColor: colorWithOpacity(data.style.backgroundColor, data.style.backgroundOpacity),
        color: data.style.textColor,
        borderRadius: `${data.style.cornerRadius}px`,
      })
      const title = dom.createElement('strong')
      title.textContent = data.title
      nav.appendChild(title)
      for (const button of data.buttons) {
        if (!button.visible) continue
        const element = dom.createElement('button')
        element.type = 'button'
        element.dataset.controllerButtonId = button.id
        element.textContent = button.label
        Object.assign(element.style, {
          color: data.style.textColor, borderColor: data.style.accentColor, background: 'transparent',
        })
        element.addEventListener('click', (event) => {
          event.stopPropagation()
          void onTeacherControllerAction(button.action, item)
        })
        nav.appendChild(element)
      }
      html.appendChild(nav)
    }
  } else {
    content = createSvgItem(dom, { item, semanticVisible: true }, resolveAsset)
    content.removeAttribute('transform')
    content.removeAttribute('opacity')
    wrapper.appendChild(content)
  }
  return {
    item,
    source,
    wrapper,
    content,
    host: null,
    abortController: new AbortController(),
    mounted: false,
    active: false,
    activatedOnce: false,
    failed: false,
  }
}

function applySpatialRecordLayout(record: SpatialItemRecord): void {
  const { item, wrapper } = record
  const { frame } = item
  wrapper.dataset.layerItemId = item.layerItemId
  wrapper.dataset.layerKind = item.kind
  wrapper.dataset.layerSource = record.source
  wrapper.dataset.layerOrder = String(item.order)
  wrapper.dataset.hitPolicy = item.hitPolicy
  wrapper.setAttribute('opacity', String(Math.max(0, Math.min(1, item.opacity))))
  wrapper.style.pointerEvents = item.hitPolicy === 'pass-through' ? 'none' : 'auto'
  wrapper.setAttribute(
    'transform',
    item.rotation === 0
      ? ''
      : `rotate(${item.rotation} ${frame.x + frame.width / 2} ${frame.y + frame.height / 2})`,
  )
  const foreignObject = record.wrapper.querySelector('foreignObject')
  if (foreignObject) {
    foreignObject.setAttribute('x', String(frame.x))
    foreignObject.setAttribute('y', String(frame.y))
    foreignObject.setAttribute('width', String(frame.width))
    foreignObject.setAttribute('height', String(frame.height))
  }
}

/**
 * Production Spatial compositor. Native SVG nodes and live DOM Runtime /
 * Component instances are direct siblings in one SVG world group, so sparse
 * `order` remains the single paint and hit-test fact. Camera changes only move
 * that group and reconcile visibility; a mounted backend is never recreated by
 * pan, zoom or semantic-zoom changes.
 */
export class SpatialSurfaceHost implements SurfaceHost {
  readonly kind = 'spatial-2d' as const
  readonly id: string
  #document: SpatialSurfaceDocument
  #camera: SpatialCamera
  #context: SurfaceMountContext | null = null
  #root: HTMLElement | null = null
  #svg: SVGSVGElement | null = null
  #world: SVGGElement | null = null
  #records = new Map<string, SpatialItemRecord>()
  #visibleRecords: SpatialItemRecord[] = []
  #active = false
  #destroyed = false
  #mode: SlideInspectionMode = 'playback'
  #locationId: string | undefined
  #options: Required<Pick<SpatialSurfaceHostOptions, 'minZoom' | 'maxZoom' | 'showControls' | 'showMinimap' | 'interactiveCamera'>> & SpatialSurfaceHostOptions
  #drag: { pointerId: number; x: number; y: number } | null = null
  #surfaceAbortController: AbortController | null = null
  #queue: Promise<void> = Promise.resolve()
  #domPlayback = new DomPlaybackFreeze()

  constructor(
    spatial: SpatialSurfaceDocument,
    viewport: { width: number; height: number },
    options: SpatialSurfaceHostOptions = {},
  ) {
    this.id = spatial.id
    this.#document = cloneSpatialDocument(spatial)
    this.#camera = spatialCameraFromPose(spatial.camera.home, viewport)
    this.#locationId = options.initialLocationId
    this.#options = {
      ...options,
      minZoom: options.minZoom ?? 0.05,
      maxZoom: options.maxZoom ?? 32,
      showControls: options.showControls ?? true,
      showMinimap: options.showMinimap ?? true,
      interactiveCamera: options.interactiveCamera ?? true,
    }
    if (this.#options.minZoom <= 0 || this.#options.maxZoom < this.#options.minZoom) {
      throw new Error('Invalid Spatial zoom limits')
    }
  }

  get camera(): SpatialCamera { return { ...this.#camera } }
  get inspectionMode(): SlideInspectionMode { return this.#mode }
  get rootElement(): HTMLElement | null { return this.#root }

  setCamera(camera: SpatialCamera): Promise<void> {
    this.#camera = validateSpatialCamera({
      ...camera,
      zoom: Math.min(this.#options.maxZoom, Math.max(this.#options.minZoom, camera.zoom)),
    })
    this.#updateCameraTransform()
    this.#renderChrome()
    return this.#run(() => this.#reconcileVisibility())
  }

  setCameraFrame(frameId: string): Promise<void> {
    const frame = frameId === 'home'
      ? this.#document.camera.home
      : this.#document.camera.frames.find((candidate) => candidate.id === frameId)
    if (!frame) return Promise.reject(new Error(`Unknown Spatial camera frame: ${frameId}`))
    return this.setCamera(spatialCameraFromPose(frame, {
      width: this.#camera.viewportWidth,
      height: this.#camera.viewportHeight,
    }))
  }

  updateDocument(spatial: SpatialSurfaceDocument): Promise<void> {
    return this.#run(async () => {
      if (spatial.id !== this.id) throw new Error('Spatial surface identity cannot change')
      this.#document = cloneSpatialDocument(spatial)
      await this.#reconcileDocument()
      this.#renderChrome()
    })
  }

  updateGlobalLayerItems(items: readonly ScopedLayerItem[]): Promise<void> {
    return this.#run(async () => {
      this.#options.globalLayerItems = structuredClone(items)
      await this.#reconcileDocument()
      this.#renderChrome()
    })
  }

  setLocationId(locationId: string): Promise<void> {
    return this.#run(async () => {
      if (this.#locationId === locationId) return
      this.#locationId = locationId
      await this.#reconcileDocument()
      this.#renderChrome()
    })
  }

  setInspectionMode(mode: SlideInspectionMode): Promise<void> {
    return this.#run(async () => {
      if (this.#mode === mode) {
        this.#syncDomPlayback()
        return
      }
      this.#mode = mode
      if (this.#root) this.#root.dataset.inspectionMode = mode
      for (const record of this.#records.values()) {
        if (!record.mounted) continue
        await this.#invoke(record, 'activate', () => record.host?.setInspectionMode?.(mode))
      }
      this.#syncDomPlayback()
    })
  }

  mount(context: SurfaceMountContext): Promise<void> {
    if (this.#destroyed) return Promise.reject(new Error('Cannot mount a destroyed Spatial surface'))
    if (this.#context) return Promise.reject(new Error('Spatial surface is already mounted'))
    this.#context = context
    const dom = context.container.ownerDocument
    const root = dom.createElement('section')
    root.className = 'spatial-surface'
    root.dataset.surfaceId = this.id
    root.dataset.inspectionMode = this.#mode
    root.tabIndex = 0
    root.setAttribute('role', 'region')
    root.setAttribute('aria-label', `${this.#document.title} 空间探索`)
    root.style.position = 'relative'
    root.style.width = `${this.#camera.viewportWidth}px`
    root.style.height = `${this.#camera.viewportHeight}px`
    root.style.overflow = 'hidden'
    root.style.isolation = 'isolate'
    root.hidden = !this.#active
    const svg = dom.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('width', String(this.#camera.viewportWidth))
    svg.setAttribute('height', String(this.#camera.viewportHeight))
    svg.setAttribute('viewBox', `0 0 ${this.#camera.viewportWidth} ${this.#camera.viewportHeight}`)
    svg.setAttribute('aria-label', this.#document.title)
    const world = dom.createElementNS(SVG_NS, 'g')
    world.dataset.spatialWorld = 'true'
    svg.appendChild(world)
    root.appendChild(svg)
    context.container.appendChild(root)
    this.#root = root
    this.#svg = svg
    this.#world = world
    this.#surfaceAbortController = new AbortController()
    if (context.signal.aborted) this.#surfaceAbortController.abort(context.signal.reason)
    else context.signal.addEventListener('abort', () => {
      this.#surfaceAbortController?.abort(context.signal.reason)
    }, { once: true })
    root.addEventListener('pointerdown', this.#handlePointerDown)
    root.addEventListener('dblclick', this.#handleDoubleClick)
    dom.addEventListener('pointermove', this.#handlePointerMove)
    dom.addEventListener('pointerup', this.#handlePointerUp)
    root.addEventListener('wheel', this.#handleWheel, { passive: false })
    root.addEventListener('keydown', this.#handleKeyDown)
    this.#updateCameraTransform()
    this.#renderChrome()
    return this.#run(() => this.#reconcileDocument())
  }

  activate(): Promise<void> {
    return this.#run(async () => {
      this.#active = true
      if (this.#root) this.#root.hidden = false
      for (const record of this.#visibleRecords) await this.#activateRecord(record, 'activate')
      this.#syncDomPlayback()
    })
  }

  suspend(): Promise<void> {
    return this.#run(async () => {
      this.#active = false
      for (const record of this.#visibleRecords) await this.#suspendRecord(record)
      this.#syncDomPlayback()
      if (this.#root) this.#root.hidden = true
    })
  }

  resume(): Promise<void> {
    return this.#run(async () => {
      this.#active = true
      if (this.#root) this.#root.hidden = false
      for (const record of this.#visibleRecords) await this.#activateRecord(record, 'resume')
      this.#syncDomPlayback()
    })
  }

  reset(scope: SurfaceResetScope): Promise<void> {
    return this.#run(async () => {
      this.#camera = spatialCameraFromPose(this.#document.camera.home, {
        width: this.#camera.viewportWidth,
        height: this.#camera.viewportHeight,
      })
      this.#updateCameraTransform()
      this.#renderChrome()
      await this.#reconcileVisibility()
      for (const record of this.#records.values()) {
        if (record.mounted) await this.#invoke(record, 'reset', () => record.host?.reset?.(scope))
      }
    })
  }

  capture(request: SurfaceCaptureRequest): SurfaceCapture {
    let camera = this.#camera
    if (request.frameId) {
      const frame = this.#document.camera.frames.find((item) => item.id === request.frameId)
      if (!frame) throw new Error(`Unknown Spatial camera frame: ${request.frameId}`)
      camera = spatialCameraFromPose(frame, {
        width: request.width ?? this.#camera.viewportWidth,
        height: request.height ?? this.#camera.viewportHeight,
      })
    } else if (request.width || request.height) {
      camera = {
        ...camera,
        viewportWidth: request.width ?? camera.viewportWidth,
        viewportHeight: request.height ?? camera.viewportHeight,
      }
    }
    return {
      format: 'svg',
      content: renderSpatialSvgMarkup(
        this.#effectiveDocument(),
        camera,
        (assetId) => this.#context?.services.resolveAsset(assetId),
      ),
      width: camera.viewportWidth,
      height: camera.viewportHeight,
      warnings: [...this.#records.values()].filter((record) => record.failed)
        .map((record) => `${record.item.label} uses its static Spatial fallback`),
    }
  }

  destroy(): Promise<void> {
    return this.#run(async () => {
      if (this.#destroyed) return
      this.#destroyed = true
      this.#surfaceAbortController?.abort('spatial-surface-destroyed')
      const dom = this.#root?.ownerDocument
      this.#root?.removeEventListener('pointerdown', this.#handlePointerDown)
      this.#root?.removeEventListener('dblclick', this.#handleDoubleClick)
      this.#root?.removeEventListener('wheel', this.#handleWheel)
      this.#root?.removeEventListener('keydown', this.#handleKeyDown)
      dom?.removeEventListener('pointermove', this.#handlePointerMove)
      dom?.removeEventListener('pointerup', this.#handlePointerUp)
      for (const record of [...this.#records.values()].reverse()) await this.#destroyRecord(record)
      this.#records.clear()
      this.#visibleRecords = []
      this.#root?.remove()
      this.#root = null
      this.#svg = null
      this.#world = null
      this.#context = null
      this.#surfaceAbortController = null
      this.#active = false
      this.#drag = null
      this.#domPlayback.discard()
    })
  }

  #run<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation)
    this.#queue = result.then(() => undefined, () => undefined)
    return result
  }

  #scopedVisible(entry: ScopedLayerItem): boolean {
    if (entry.visibility.mode === 'all') return true
    if (!this.#locationId) return false
    const listed = entry.visibility.locationIds.includes(this.#locationId)
    return entry.visibility.mode === 'include' ? listed : !listed
  }

  #effectiveEntries(): Array<{
    item: LayerItem
    source: SpatialLayerHit['source']
  }> {
    return [
      ...(this.#options.globalLayerItems ?? [])
        .filter((entry) => this.#scopedVisible(entry))
        .map((entry) => ({ item: entry.item, source: 'global' as const })),
      ...this.#document.surfaceLayerItems
        .filter((entry) => this.#scopedVisible(entry))
        .map((entry) => ({ item: entry.item, source: 'surface' as const })),
      ...this.#document.world.layerItems
        .map((item) => ({ item, source: 'world' as const })),
    ].sort((left, right) => (
      left.item.order - right.item.order ||
      left.item.layerItemId.localeCompare(right.item.layerItemId)
    ))
  }

  #effectiveDocument(): SpatialSurfaceDocument {
    const spatial = cloneSpatialDocument(this.#document)
    spatial.surfaceLayerItems = []
    spatial.world.layerItems = this.#effectiveEntries().map(({ item }) => structuredClone(item))
    return spatial
  }

  async #reconcileDocument(): Promise<void> {
    if (!this.#world || !this.#context) return
    const entries = this.#effectiveEntries()
    const nextIds = new Set(entries.map(({ item }) => item.layerItemId))
    for (const record of this.#records.values()) {
      if (!nextIds.has(record.item.layerItemId)) await this.#destroyRecord(record)
    }
    const resolveAsset = (assetId: string) => this.#context?.services.resolveAsset(assetId)
    for (const entry of entries) {
      const { item } = entry
      let record = this.#records.get(item.layerItemId)
      if (record && record.item.kind !== item.kind) {
        await this.#destroyRecord(record)
        record = undefined
      }
      if (!record) {
        record = createSpatialRecord(
          this.#world.ownerDocument,
          structuredClone(item),
          entry.source,
          resolveAsset,
          (action, controller) => this.#options.onTeacherControllerAction?.(action, controller),
        )
        const surfaceSignal = this.#surfaceAbortController?.signal
        if (surfaceSignal?.aborted) record.abortController.abort(surfaceSignal.reason)
        else surfaceSignal?.addEventListener('abort', () => record?.abortController.abort(surfaceSignal.reason), { once: true })
        this.#records.set(item.layerItemId, record)
      } else if (record.item.kind === 'native') {
        const wasVisible = record.wrapper.parentNode === this.#world
        const replacement = createSpatialRecord(
          this.#world.ownerDocument,
          structuredClone(item),
          entry.source,
          resolveAsset,
          (action, controller) => this.#options.onTeacherControllerAction?.(action, controller),
        )
        record.abortController.abort('spatial-native-item-updated')
        if (wasVisible) record.wrapper.replaceWith(replacement.wrapper)
        this.#records.set(item.layerItemId, replacement)
        record = replacement
      } else {
        record.item = structuredClone(item)
        record.source = entry.source
        if (record.mounted && record.host?.update) {
          await this.#invoke(record, 'mount', () => record!.host!.update!(
            record!.item as DynamicSpatialItem,
            this.#itemContext(record!),
          ))
        }
      }
      applySpatialRecordLayout(record)
    }
    await this.#reconcileVisibility()
  }

  async #reconcileVisibility(): Promise<void> {
    if (!this.#world) return
    const visible = cullSpatialItems(
      this.#effectiveEntries().map(({ item }) => item),
      this.#camera,
      this.#document.semanticZoom,
    )
    const visibleIds = new Set(visible.map(({ item }) => item.layerItemId))
    for (const previous of this.#visibleRecords) {
      if (!visibleIds.has(previous.item.layerItemId)) {
        previous.wrapper.remove()
        await this.#suspendRecord(previous)
      }
    }
    const nextRecords: SpatialItemRecord[] = []
    for (const { item } of visible) {
      const record = this.#records.get(item.layerItemId)
      if (!record) continue
      await this.#ensureMounted(record)
      applySpatialRecordLayout(record)
      // appendChild moves existing SVG/foreignObject nodes without remounting hosts.
      this.#world.appendChild(record.wrapper)
      if (this.#active) await this.#activateRecord(record, record.active ? 'activate' : 'resume')
      nextRecords.push(record)
    }
    this.#visibleRecords = nextRecords
    this.#syncDomPlayback()
  }

  #syncDomPlayback(): void {
    if (!this.#active || this.#mode === 'inspect') {
      this.#domPlayback.freeze(this.#root, this.#root, '.spatial-native-video video')
    } else {
      this.#domPlayback.release()
    }
  }

  async #ensureMounted(record: SpatialItemRecord): Promise<void> {
    if (record.item.kind === 'native' || record.mounted) return
    let host: SlideItemHost<DynamicSpatialItem>
    try {
      host = record.item.kind === 'component'
        ? (this.#options.componentHostFactory?.(record.item) ?? new SpatialStaticFallbackHost(record.item)) as SlideItemHost<DynamicSpatialItem>
        : (this.#options.runtimeHostFactory?.(record.item) ?? new SpatialStaticFallbackHost(record.item)) as SlideItemHost<DynamicSpatialItem>
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      this.#report('mount', error, record.item.layerItemId)
      host = new SpatialStaticFallbackHost(record.item, error)
      record.failed = true
    }
    record.host = host
    try {
      await host.mount(this.#itemContext(record))
      record.mounted = true
    } catch (cause) {
      await this.#replaceWithFailureFallback(record, 'mount', cause)
    }
  }

  #itemContext(record: SpatialItemRecord): SlideItemMountContext<DynamicSpatialItem> {
    return {
      surfaceId: this.id,
      // The shared adapter context historically calls this `sceneId`. Spatial
      // has no scene; its stable surface id is the deterministic scope token.
      sceneId: this.id,
      item: record.item as DynamicSpatialItem,
      container: record.content as HTMLElement,
      services: this.#context!.services,
      signal: record.abortController.signal,
      mode: this.#mode,
      reportHit: (detail) => {
        const order = this.#visibleRecords.indexOf(record)
        this.#options.onLayerHit?.({
          surfaceId: this.id,
          layerItemId: record.item.layerItemId,
          kind: record.item.kind,
          order: Math.max(0, order),
          source: record.source,
          ...detail,
        })
      },
    }
  }

  async #activateRecord(record: SpatialItemRecord, phase: 'activate' | 'resume'): Promise<void> {
    if (!record.mounted || record.item.kind === 'native') return
    if (record.active) return
    const effectivePhase = record.activatedOnce ? phase : 'activate'
    await this.#invoke(record, effectivePhase, async () => {
      if (effectivePhase === 'resume' && record.host?.resume) await record.host.resume()
      else await record.host?.activate?.()
      record.active = true
      record.activatedOnce = true
    })
  }

  async #suspendRecord(record: SpatialItemRecord): Promise<void> {
    if (!record.mounted || !record.active || record.item.kind === 'native') return
    await this.#invoke(record, 'suspend', async () => {
      await record.host?.suspend?.()
      record.active = false
    })
  }

  async #invoke(
    record: SpatialItemRecord,
    phase: SurfaceLifecyclePhase,
    operation: () => void | Promise<void>,
  ): Promise<void> {
    try {
      await operation()
    } catch (cause) {
      await this.#replaceWithFailureFallback(record, phase, cause)
    }
  }

  async #replaceWithFailureFallback(
    record: SpatialItemRecord,
    phase: SurfaceLifecyclePhase,
    cause: unknown,
  ): Promise<void> {
    if (record.item.kind === 'native') return
    const error = cause instanceof Error ? cause : new Error(String(cause))
    this.#report(phase, error, record.item.layerItemId)
    try { await record.host?.destroy?.() } catch { /* already isolated */ }
    ;(record.content as HTMLElement).replaceChildren()
    const fallback = new SpatialStaticFallbackHost(record.item, error) as SlideItemHost<DynamicSpatialItem>
    record.host = fallback
    record.failed = true
    record.active = false
    record.wrapper.dataset.hostStatus = 'failed'
    await fallback.mount(this.#itemContext(record))
    record.mounted = true
  }

  async #destroyRecord(record: SpatialItemRecord): Promise<void> {
    record.abortController.abort('spatial-layer-item-removed')
    try { await record.host?.destroy?.() } catch (cause) {
      this.#report('destroy', cause, record.item.layerItemId)
    }
    record.wrapper.remove()
    this.#records.delete(record.item.layerItemId)
  }

  #report(phase: SurfaceLifecyclePhase, cause: unknown, layerItemId: string): void {
    try {
      this.#context?.services.reportDiagnostic?.({
        surfaceId: this.id,
        phase,
        severity: 'error',
        message: `Spatial layer item ${layerItemId} failed during ${phase}`,
        cause,
      })
    } catch { /* diagnostics must never break the surface */ }
  }

  #updateCameraTransform(): void {
    if (!this.#world || !this.#svg || !this.#root) return
    this.#world.setAttribute(
      'transform',
      `translate(${this.#camera.viewportWidth / 2} ${this.#camera.viewportHeight / 2}) scale(${this.#camera.zoom}) translate(${-this.#camera.x} ${-this.#camera.y})`,
    )
    this.#svg.setAttribute('width', String(this.#camera.viewportWidth))
    this.#svg.setAttribute('height', String(this.#camera.viewportHeight))
    this.#svg.setAttribute('viewBox', `0 0 ${this.#camera.viewportWidth} ${this.#camera.viewportHeight}`)
    this.#root.style.width = `${this.#camera.viewportWidth}px`
    this.#root.style.height = `${this.#camera.viewportHeight}px`
  }

  #renderChrome(): void {
    if (!this.#root) return
    this.#root.querySelector('.spatial-controls')?.remove()
    this.#root.querySelector('.spatial-minimap')?.remove()
    const dom = this.#root.ownerDocument
    if (this.#options.showControls) {
      const controls = dom.createElement('div')
      controls.className = 'spatial-controls'
      controls.setAttribute('role', 'toolbar')
      controls.setAttribute('aria-label', '空间视图控制')
      const addButton = (label: string, action: () => void, frameId?: string) => {
        const button = dom.createElement('button')
        button.type = 'button'
        button.textContent = label
        if (frameId) button.dataset.cameraFrameId = frameId
        button.addEventListener('click', action)
        controls.appendChild(button)
      }
      addButton('总览', () => { void this.setCameraFrame('home') }, 'home')
      for (const frame of this.#document.camera.frames) {
        addButton(frame.name, () => { void this.setCameraFrame(frame.id) }, frame.id)
      }
      addButton('缩小', () => { void this.setCamera(zoomSpatialCameraAt(
        this.#camera,
        this.#camera.zoom / 1.25,
        { x: this.#camera.viewportWidth / 2, y: this.#camera.viewportHeight / 2 },
      )) })
      addButton('放大', () => { void this.setCamera(zoomSpatialCameraAt(
        this.#camera,
        this.#camera.zoom * 1.25,
        { x: this.#camera.viewportWidth / 2, y: this.#camera.viewportHeight / 2 },
      )) })
      this.#root.appendChild(controls)
    }
    if (this.#options.showMinimap) {
      const minimap = buildSpatialMinimap(this.#effectiveDocument(), this.#camera, { width: 180, height: 112 })
      const map = dom.createElementNS(SVG_NS, 'svg')
      map.classList.add('spatial-minimap')
      map.setAttribute('width', String(minimap.width))
      map.setAttribute('height', String(minimap.height))
      map.setAttribute('viewBox', `0 0 ${minimap.width} ${minimap.height}`)
      map.setAttribute('role', 'img')
      map.setAttribute('aria-label', '空间内容小地图')
      for (const node of minimap.nodes) {
        const rect = dom.createElementNS(SVG_NS, 'rect')
        rect.dataset.layerItemId = node.id
        rect.setAttribute('x', String(node.x))
        rect.setAttribute('y', String(node.y))
        rect.setAttribute('width', String(Math.max(1, node.width)))
        rect.setAttribute('height', String(Math.max(1, node.height)))
        rect.setAttribute('fill', '#94a3b8')
        rect.setAttribute('opacity', '.72')
        map.appendChild(rect)
      }
      const viewport = dom.createElementNS(SVG_NS, 'rect')
      viewport.classList.add('spatial-minimap-viewport')
      viewport.setAttribute('x', String(minimap.viewport.x))
      viewport.setAttribute('y', String(minimap.viewport.y))
      viewport.setAttribute('width', String(Math.max(1, minimap.viewport.width)))
      viewport.setAttribute('height', String(Math.max(1, minimap.viewport.height)))
      viewport.setAttribute('fill', 'none')
      viewport.setAttribute('stroke', '#2563eb')
      viewport.setAttribute('stroke-width', '2')
      map.appendChild(viewport)
      this.#root.appendChild(map)
    }
  }

  #handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.#root?.contains(event.target as Node)) return
    const target = event.target as Element
    if (target.closest?.('.spatial-controls, .spatial-minimap')) return
    const wrapper = target.closest?.<SVGGElement>('[data-spatial-layer-record]')
    if (wrapper) {
      const record = this.#records.get(wrapper.dataset.layerItemId ?? '')
      if (record && record.item.hitPolicy !== 'pass-through') {
        this.#options.onLayerHit?.({
          surfaceId: this.id,
          layerItemId: record.item.layerItemId,
          kind: record.item.kind,
          order: Math.max(0, this.#visibleRecords.indexOf(record)),
          source: record.source,
        })
      }
      return
    }
    if (!this.#options.interactiveCamera) return
    this.#drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    this.#root.focus()
    event.preventDefault()
  }

  #handleDoubleClick = (event: MouseEvent): void => {
    if (this.#mode !== 'inspect' || !this.#root?.contains(event.target as Node)) return
    const wrapper = (event.target as Element).closest?.<SVGGElement>('[data-spatial-layer-record]')
    if (!wrapper) return
    const record = this.#records.get(wrapper.dataset.layerItemId ?? '')
    if (!record || record.item.kind !== 'native' || record.item.hitPolicy === 'pass-through') return
    const field = nativePrimaryAuthoringField(record.item)
    if (!field) return
    event.preventDefault()
    event.stopPropagation()
    this.#options.onLayerHit?.({
      surfaceId: this.id,
      layerItemId: record.item.layerItemId,
      kind: record.item.kind,
      order: Math.max(0, this.#visibleRecords.indexOf(record)),
      source: record.source,
      field,
      targetKind: field.endsWith('assetId') ? 'asset' : 'text',
    })
  }

  #handlePointerMove = (event: PointerEvent): void => {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return
    const delta = { x: event.clientX - this.#drag.x, y: event.clientY - this.#drag.y }
    this.#drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    void this.setCamera(panSpatialCamera(this.#camera, delta))
  }

  #handlePointerUp = (event: PointerEvent): void => {
    if (this.#drag?.pointerId === event.pointerId) this.#drag = null
  }

  #handleWheel = (event: WheelEvent): void => {
    if (!this.#options.interactiveCamera || !this.#root?.contains(event.target as Node)) return
    if ((event.target as Element).closest?.('[data-spatial-layer-record]')) return
    const bounds = this.#svg?.getBoundingClientRect()
    if (!bounds) return
    const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const factor = Math.exp(-event.deltaY * 0.0015)
    void this.setCamera(zoomSpatialCameraAt(
      this.#camera,
      this.#camera.zoom * factor,
      anchor,
      { min: this.#options.minZoom, max: this.#options.maxZoom },
    ))
    event.preventDefault()
  }

  #handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.#options.interactiveCamera || !this.#root?.contains(event.target as Node)) return
    let next: SpatialCamera | undefined
    if (event.key === 'ArrowLeft') next = panSpatialCamera(this.#camera, { x: 48, y: 0 })
    else if (event.key === 'ArrowRight') next = panSpatialCamera(this.#camera, { x: -48, y: 0 })
    else if (event.key === 'ArrowUp') next = panSpatialCamera(this.#camera, { x: 0, y: 48 })
    else if (event.key === 'ArrowDown') next = panSpatialCamera(this.#camera, { x: 0, y: -48 })
    else if (event.key === 'Home') {
      void this.setCameraFrame('home')
      event.preventDefault()
      return
    } else if (event.key === '+' || event.key === '=') {
      next = zoomSpatialCameraAt(this.#camera, this.#camera.zoom * 1.25, {
        x: this.#camera.viewportWidth / 2,
        y: this.#camera.viewportHeight / 2,
      }, { min: this.#options.minZoom, max: this.#options.maxZoom })
    } else if (event.key === '-' || event.key === '_') {
      next = zoomSpatialCameraAt(this.#camera, this.#camera.zoom / 1.25, {
        x: this.#camera.viewportWidth / 2,
        y: this.#camera.viewportHeight / 2,
      }, { min: this.#options.minZoom, max: this.#options.maxZoom })
    }
    if (!next) return
    void this.setCamera(next)
    event.preventDefault()
  }
}
