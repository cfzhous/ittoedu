import { renderFormulaNodeSvg } from '../../../shared/formulaRenderer'
import { compareStableStrings } from '../../../shared/stableOrder'
import type {
  ComponentLayerItem,
  LayerItem,
  NativeLayerItem,
  RuntimeLayerItem,
  ScopedLayerItem,
  SlidePresentationState,
  SlideSceneDocument,
  SlideSurfaceDocument,
} from '../../../shared/courseProjectTypes'
import type { FormulaNode, TeacherControllerAction } from '../../../shared/projectTypes'
import type {
  AudioInteractionAction,
  NodeMotionAction,
  VideoInteractionAction,
} from '../../../shared/interactionTypes'
import type { CourseEventBus } from '../../../shared/runtimeTypes'
import {
  InteractionEngine,
  type InteractionBindableNodeHandle,
  type InteractionBindableRoot,
  type InteractionHostActions,
  type InteractionNodeMotionContext,
  type InteractionPresentationController,
} from '../../InteractionEngine'
import type {
  SurfaceCapture,
  SurfaceCaptureRequest,
  SurfaceHost,
  SurfaceLifecyclePhase,
  SurfaceMountContext,
  SurfacePlayerServices,
  SurfaceResetScope,
} from '../SurfaceHost'
import { DomPlaybackFreeze } from '../domPlaybackFreeze'

export type SlideInspectionMode = 'playback' | 'inspect'

export interface SlideItemCapture {
  format: SurfaceCapture['format']
  content: string
  warnings?: readonly string[]
}

export function slideItemCaptureFailureWarning(label: string): string {
  return `“${label}”的当前画面生成失败。`
}

export interface SlideLayerHit {
  surfaceId: string
  sceneId: string
  layerItemId: string
  kind: LayerItem['kind']
  /** Current canonical back-to-front position. */
  order: number
  source: 'scene' | 'surface' | 'global'
  field?: string
  hitId?: string
  targetKind?: 'text' | 'asset'
}

export interface SlideItemMountContext<T extends ComponentLayerItem | RuntimeLayerItem = ComponentLayerItem | RuntimeLayerItem> {
  surfaceId: string
  sceneId: string
  item: T
  container: HTMLElement
  services: SurfacePlayerServices
  signal: AbortSignal
  mode: SlideInspectionMode
  /** Bridges iframe/canvas-local hits back to the stable layer item identity. */
  reportHit(detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' }): void
}

/**
 * A backend adapter for one Component or Runtime item. Its container is already
 * positioned, clipped and ordered by the compositor; adapters must never append
 * a sibling plane to the surface root or document body.
 */
export interface SlideItemHost<T extends ComponentLayerItem | RuntimeLayerItem = ComponentLayerItem | RuntimeLayerItem> {
  mount(context: SlideItemMountContext<T>): void | Promise<void>
  update?(item: T, context: SlideItemMountContext<T>): void | Promise<void>
  activate?(): void | Promise<void>
  suspend?(): void | Promise<void>
  resume?(): void | Promise<void>
  reset?(scope: SurfaceResetScope): void | Promise<void>
  setInspectionMode?(mode: SlideInspectionMode): void | Promise<void>
  capture?(request: SurfaceCaptureRequest): SlideItemCapture | void | Promise<SlideItemCapture | void>
  destroy?(): void | Promise<void>
}

export type ComponentSlideItemHostFactory = (
  item: ComponentLayerItem,
) => SlideItemHost<ComponentLayerItem>

export type RuntimeSlideItemHostFactory = (
  item: RuntimeLayerItem,
) => SlideItemHost<RuntimeLayerItem>

export interface SlideSurfaceHostOptions {
  initialSceneId?: string
  initialStateId?: string
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  /** Course-scoped items participate in the exact same sparse order. */
  globalLayerItems?: readonly ScopedLayerItem[]
  /** Resolves CourseLocation.id when this surface is hosted by a mixed course. */
  resolveLocationId?(sceneId: string, stateId: string | undefined): string | undefined
  /** Shared V9 course bus used by Runtime/Component and declarative rules. */
  interactionEvents?: CourseEventBus
  /** Course audio authority shared by scene and global interaction engines. */
  executeAudioAction?(action: AudioInteractionAction): unknown
  /** Disable when a course-owned media bridge emits events for every surface. */
  emitInteractionMediaEvents?: boolean
  /** Course navigation authority; local same-surface behavior is the fallback. */
  interactionActions?: Partial<InteractionHostActions>
  /** Teacher-controller navigation authority, kept distinct from Runtime entry points. */
  teacherControllerActions?: Partial<InteractionHostActions>
  /** A course coordinator may announce entry after committing navigation state. */
  deferInteractionEntry?: boolean
  /** Guard hook evaluated before any built-in teacher-controller side effect. */
  beforeTeacherControllerAction?(
    action: TeacherControllerAction,
    item: NativeLayerItem,
  ): boolean | Promise<boolean>
  /** Course-wide progress text. Falls back to this Slide's scene position. */
  teacherControllerProgressText?(): string
  onLayerHit?(hit: SlideLayerHit): void
  onTeacherControllerAction?(
    action: TeacherControllerAction,
    item: NativeLayerItem,
  ): unknown
}

type EffectiveLayerEntry = {
  item: LayerItem
  source: 'scene' | 'surface' | 'global'
  scopedVisible: boolean
}

type ItemRecord = EffectiveLayerEntry & {
  wrapper: HTMLElement
  content: HTMLElement
  host: SlideItemHost | NativeDomItemHost
  abortController: AbortController
  failed: boolean
}

function cloneSurface(surface: SlideSurfaceDocument): SlideSurfaceDocument {
  return structuredClone(surface)
}

function isScopedVisible(entry: ScopedLayerItem, locationId: string): boolean {
  const included = entry.visibility.locationIds.includes(locationId)
  if (entry.visibility.mode === 'all') return true
  return entry.visibility.mode === 'include' ? included : !included
}

function deepMergeRecord(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = structuredClone(base)
  for (const [key, value] of Object.entries(patch)) {
    const previous = result[key]
    result[key] = value && typeof value === 'object' && !Array.isArray(value) &&
      previous && typeof previous === 'object' && !Array.isArray(previous)
      ? deepMergeRecord(
          previous as Record<string, unknown>,
          value as Record<string, unknown>,
        )
      : structuredClone(value)
  }
  return result
}

function materializeSceneItem(
  source: LayerItem,
  state: SlidePresentationState | undefined,
): LayerItem {
  const override = state?.layerItemOverrides[source.layerItemId]
  if (!override) return structuredClone(source)
  const item = structuredClone(source)
  if (override.label !== undefined) item.label = override.label
  if (override.frame) item.frame = { ...item.frame, ...override.frame }
  if (override.order !== undefined) item.order = override.order
  if (override.visible !== undefined) item.visible = override.visible
  if (override.locked !== undefined) item.locked = override.locked
  if (override.rotation !== undefined) item.rotation = override.rotation
  if (override.opacity !== undefined) item.opacity = override.opacity
  if (override.hitPolicy !== undefined) item.hitPolicy = override.hitPolicy
  if (override.playbackInitialVisibility !== undefined) {
    item.playbackInitialVisibility = override.playbackInitialVisibility
  }
  if (item.kind === 'native' && override.nativeData) {
    item.content.data = deepMergeRecord(
      item.content.data as Record<string, unknown>,
      override.nativeData,
    ) as typeof item.content.data
  }
  if (item.kind === 'component' && override.componentProps) {
    item.props = deepMergeRecord(item.props, override.componentProps)
  }
  return item
}

function materializeSceneItems(
  scene: SlideSceneDocument,
  stateId: string | undefined,
): { items: LayerItem[]; state?: SlidePresentationState } {
  const state = scene.presentation?.states.find((candidate) => candidate.id === stateId)
  const items = scene.layerItems.map((item) => materializeSceneItem(item, state))
  if (state?.layerItemOrder) {
    const byId = new Map(items.map((item) => [item.layerItemId, item]))
    const seen = new Set<string>()
    const ordered: LayerItem[] = []
    for (const id of state.layerItemOrder) {
      const item = byId.get(id)
      if (!item || seen.has(id)) continue
      seen.add(id)
      ordered.push(item)
    }
    const tail = items
      .filter((item) => !seen.has(item.layerItemId))
      .sort((left, right) => left.order - right.order || compareStableStrings(left.layerItemId, right.layerItemId))
    ordered.push(...tail)
    // Reorder into the scene's existing sparse numeric slots. Reindexing to
    // 0..N would move scene items across global/surface items when all scopes
    // are merged by one compositor order.
    const orderSlots = items
      .map((item) => item.order)
      .sort((left, right) => left - right)
    ordered.forEach((item, index) => { item.order = orderSlots[index]! })
  }
  return { items, state }
}

function canonicalEntries(entries: readonly EffectiveLayerEntry[]): EffectiveLayerEntry[] {
  return [...entries].sort((left, right) =>
    left.item.order - right.item.order ||
    compareStableStrings(left.item.layerItemId, right.item.layerItemId),
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function colorWithOpacity(color: string, opacity: number): string {
  const alpha = clamp(opacity, 0, 1)
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  const longHex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  const match = longHex ?? (shortHex
    ? [shortHex[0], `${shortHex[1]}${shortHex[1]}`, `${shortHex[2]}${shortHex[2]}`, `${shortHex[3]}${shortHex[3]}`]
    : null)
  if (!match) return color
  return `rgba(${Number.parseInt(match[1]!, 16)}, ${Number.parseInt(match[2]!, 16)}, ${Number.parseInt(match[3]!, 16)}, ${alpha})`
}

function createElement(dom: Document, tag: string, className?: string): HTMLElement {
  const element = dom.createElement(tag)
  if (className) element.className = className
  return element
}

function renderText(item: NativeLayerItem, dom: Document): HTMLElement {
  if (item.content.nativeType !== 'text') throw new TypeError('Expected text item')
  const { data } = item.content
  const element = createElement(dom, 'div', 'slide-native-text')
  element.textContent = data.text
  element.style.boxSizing = 'border-box'
  element.style.width = '100%'
  element.style.height = '100%'
  element.style.whiteSpace = 'pre-wrap'
  element.style.overflowWrap = 'anywhere'
  element.style.fontFamily = data.style.fontFamily
  element.style.fontSize = `${data.style.fontSize}px`
  element.style.color = data.style.color
  element.style.fontWeight = data.style.bold ? '700' : '400'
  element.style.fontStyle = data.style.italic ? 'italic' : 'normal'
  element.style.textDecoration = [
    data.style.underline ? 'underline' : '',
    data.style.strike ? 'line-through' : '',
  ].filter(Boolean).join(' ') || 'none'
  element.style.textAlign = data.style.align
  element.style.writingMode = data.style.writingMode
  // Project text spacing is an additive pixel value shared with the editor,
  // Phaser renderer and Spatial host. Treating it as a CSS multiplier (the
  // previous `line-height: 6`) pushes even a single line outside its frame.
  element.style.lineHeight = `${Math.max(
    data.style.fontSize,
    data.style.fontSize * 1.22 + data.style.lineSpacing,
  )}px`
  element.style.letterSpacing = `${data.style.letterSpacing}px`
  element.style.padding = `${data.style.padding}px`
  element.style.borderRadius = `${data.style.cornerRadius}px`
  element.style.backgroundColor = colorWithOpacity(
    data.style.backgroundColor,
    data.style.backgroundOpacity,
  )
  element.style.overflow = data.style.overflow === 'auto-height' ? 'visible' : 'hidden'
  element.style.display = 'flex'
  element.style.flexDirection = 'column'
  element.style.justifyContent = data.style.verticalAlign === 'top'
    ? 'flex-start'
    : data.style.verticalAlign === 'bottom'
      ? 'flex-end'
      : 'center'
  return element
}

function renderFormula(item: NativeLayerItem, dom: Document): HTMLElement {
  if (item.content.nativeType !== 'formula') throw new TypeError('Expected formula item')
  const { data } = item.content
  const element = createElement(dom, 'div', 'slide-native-formula')
  element.setAttribute('role', 'math')
  element.setAttribute('aria-label', data.accessibleText)
  element.dataset.formulaId = data.formulaId
  element.style.boxSizing = 'border-box'
  element.style.width = '100%'
  element.style.height = '100%'
  element.style.overflow = 'hidden'
  const formulaNode: FormulaNode = {
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
    ...structuredClone(data),
  }
  const rendered = renderFormulaNodeSvg(formulaNode)
  const parser = new dom.defaultView!.DOMParser()
  const parsed = parser.parseFromString(rendered.svg, 'image/svg+xml').documentElement
  const svg = dom.importNode(parsed, true) as unknown as SVGSVGElement
  svg.style.display = 'block'
  svg.style.width = '100%'
  svg.style.height = '100%'
  element.appendChild(svg)
  return element
}

function renderImage(
  item: NativeLayerItem,
  dom: Document,
  services: SurfacePlayerServices,
): HTMLElement {
  if (item.content.nativeType !== 'image') throw new TypeError('Expected image item')
  const { data } = item.content
  const image = dom.createElement('img')
  image.className = 'slide-native-image'
  image.src = services.resolveAsset(data.assetId) ?? ''
  image.alt = item.label
  image.dataset.assetId = data.assetId
  image.style.display = 'block'
  image.style.width = '100%'
  image.style.height = '100%'
  image.style.objectFit = data.fit === 'stretch' ? 'fill' : data.fit
  image.style.objectPosition = `${clamp(data.cropX, 0, 1) * 100}% ${clamp(data.cropY, 0, 1) * 100}%`
  image.style.borderRadius = `${data.cornerRadius}px`
  image.style.transform = `scale(${data.flipX ? -1 : 1}, ${data.flipY ? -1 : 1})`
  return image
}

function renderVideo(
  item: NativeLayerItem,
  dom: Document,
  services: SurfacePlayerServices,
): HTMLElement {
  if (item.content.nativeType !== 'video') throw new TypeError('Expected video item')
  const { data } = item.content
  const video = dom.createElement('video')
  video.className = 'slide-native-video'
  video.src = services.resolveAsset(data.assetId) ?? ''
  video.dataset.assetId = data.assetId
  video.setAttribute('aria-label', item.label)
  video.controls = data.showControls
  video.autoplay = data.autoplay
  video.loop = data.loop
  video.muted = data.muted
  video.volume = clamp(data.volume, 0, 1)
  video.playbackRate = data.playbackRate
  video.style.display = 'block'
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.objectFit = data.fit === 'stretch' ? 'fill' : data.fit
  if (data.poster.mode === 'image' && data.poster.assetId) {
    video.poster = services.resolveAsset(data.poster.assetId) ?? ''
  }
  if (data.clickToToggle) {
    video.addEventListener('click', () => {
      if (video.paused) void video.play().catch(() => undefined)
      else video.pause()
    })
  }
  return video
}

function renderShape(item: NativeLayerItem, dom: Document): HTMLElement {
  if (item.content.nativeType !== 'shape') throw new TypeError('Expected shape item')
  const { data } = item.content
  const { width, height } = item.frame
  const root = createElement(dom, 'div', 'slide-native-shape')
  root.setAttribute('role', 'img')
  root.setAttribute('aria-label', item.label)
  root.dataset.shapeType = data.shapeType
  Object.assign(root.style, { boxSizing: 'border-box', width: '100%', height: '100%' })
  const svg = dom.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.setAttribute('preserveAspectRatio', 'none')
  const create = (tag: string): SVGElement => dom.createElementNS('http://www.w3.org/2000/svg', tag)
  const set = (element: SVGElement, values: Record<string, string | number | undefined>): SVGElement => {
    for (const [key, value] of Object.entries(values)) if (value !== undefined) element.setAttribute(key, String(value))
    return element
  }
  const style = data.style
  const stroke = colorWithOpacity(style.borderColor, style.borderOpacity)
  const fill = colorWithOpacity(style.fillColor, style.fillOpacity)
  const dash = style.lineStyle === 'dashed'
    ? `${Math.max(1, style.borderWidth * 4)} ${Math.max(1, style.borderWidth * 3)}`
    : style.lineStyle === 'dotted'
      ? `${Math.max(1, style.borderWidth)} ${Math.max(1, style.borderWidth * 2)}`
      : undefined
  const common = (element: SVGElement, strokeOnly = false): SVGElement => set(element, {
    fill: strokeOnly ? 'none' : fill,
    stroke,
    'stroke-width': Math.max(0, style.borderWidth),
    'stroke-dasharray': dash,
    'vector-effect': 'non-scaling-stroke',
  })
  const markerId = (side: 'start' | 'end') => `slide-shape-${item.layerItemId.replace(/[^A-Za-z0-9_-]/g, '-')}-${side}`
  const addMarker = (side: 'start' | 'end', kind: typeof style.startArrow): string | undefined => {
    if (kind === 'none') return undefined
    let defs = svg.querySelector<SVGDefsElement>('defs')
    if (!defs) {
      defs = dom.createElementNS('http://www.w3.org/2000/svg', 'defs')
      svg.appendChild(defs)
    }
    const marker = set(create('marker'), {
      id: markerId(side), markerWidth: 10, markerHeight: 10,
      refX: 9, refY: 5, orient: 'auto-start-reverse', markerUnits: 'strokeWidth',
    })
    const head = kind === 'circle'
      ? set(create('circle'), { cx: 5, cy: 5, r: 3.3, fill: stroke })
      : kind === 'diamond'
        ? set(create('polygon'), { points: '1,5 5,1 9,5 5,9', fill: stroke })
        : kind === 'stealth'
          ? set(create('polygon'), { points: '0,1 10,5 0,9 3,5', fill: stroke })
          : set(create('path'), { d: 'M 0 0 L 10 5 L 0 10 z', fill: stroke })
    marker.appendChild(head)
    defs.appendChild(marker)
    return `url(#${markerId(side)})`
  }
  let startArrow = style.startArrow
  let endArrow = style.endArrow
  if (data.shapeType === 'arrow-left' || data.shapeType === 'arrow-left-right') startArrow = startArrow === 'none' ? 'triangle' : startArrow
  if (['arrow-right', 'arrow-up', 'arrow-down', 'arrow-left-right', 'elbow-arrow'].includes(data.shapeType)) {
    endArrow = endArrow === 'none' ? 'triangle' : endArrow
  }
  const line = (element: SVGElement): SVGElement => set(common(element, true), {
    'marker-start': addMarker('start', startArrow),
    'marker-end': addMarker('end', endArrow),
  })
  let body: SVGElement
  if (data.shapeType === 'ellipse') {
    body = common(set(create('ellipse'), { cx: width / 2, cy: height / 2, rx: width / 2, ry: height / 2 }))
  } else if (data.shapeType === 'triangle' || data.shapeType === 'emphasis-triangle') {
    body = common(set(create('polygon'), { points: `${width / 2},0 ${width},${height} 0,${height}` }))
  } else if (data.shapeType === 'diamond') {
    body = common(set(create('polygon'), { points: `${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}` }))
  } else if (data.shapeType === 'emphasis-dot') {
    body = common(set(create('circle'), { cx: width / 2, cy: height / 2, r: Math.min(width, height) / 2 }))
  } else if (data.shapeType === 'line' || data.shapeType.startsWith('arrow-')) {
    const vertical = data.shapeType === 'arrow-up' || data.shapeType === 'arrow-down'
    body = line(set(create('line'), vertical
      ? data.shapeType === 'arrow-down'
        ? { x1: width / 2, y1: 0, x2: width / 2, y2: height }
        : { x1: width / 2, y1: height, x2: width / 2, y2: 0 }
      : { x1: 0, y1: height / 2, x2: width, y2: height / 2 }))
  } else if (data.shapeType === 'elbow-arrow') {
    body = line(set(create('path'), { d: `M 0 ${height} L ${width / 2} ${height} L ${width / 2} 0 L ${width} 0` }))
  } else if (data.shapeType.startsWith('brace-') || data.shapeType.startsWith('bracket-')) {
    body = line(set(create('path'), { d: `M ${width} 0 L 0 0 L 0 ${height} L ${width} ${height}` }))
  } else {
    body = common(set(create('rect'), {
      x: 0, y: 0, width, height,
      rx: data.shapeType === 'rounded-rectangle' ? Math.max(0, style.cornerRadius) : 0,
    }))
  }
  svg.appendChild(body)
  root.appendChild(svg)
  return root
}

export interface TeacherControllerDomRenderOptions {
  progressText: string
  collapsed: boolean
  canInteract(): boolean
  onCollapsedChange(collapsed: boolean): void
  onAction(action: TeacherControllerAction, item: NativeLayerItem): void
}

export function renderTeacherController(
  item: NativeLayerItem,
  dom: Document,
  options: TeacherControllerDomRenderOptions,
): HTMLElement {
  if (item.content.nativeType !== 'teacher-controller') {
    throw new TypeError('Expected teacher controller item')
  }
  const { data } = item.content
  const controller = createElement(dom, 'nav', 'slide-native-teacher-controller')
  controller.setAttribute('aria-label', data.title || item.label)
  controller.style.boxSizing = 'border-box'
  controller.style.width = '100%'
  controller.style.height = '100%'
  controller.style.display = 'flex'
  controller.style.alignItems = 'center'
  controller.style.overflow = 'hidden'
  controller.style.gap = data.compact ? '4px' : '8px'
  controller.style.padding = data.compact ? '4px 6px' : '8px 12px'
  controller.style.backgroundColor = colorWithOpacity(
    data.style.backgroundColor,
    data.style.backgroundOpacity,
  )
  controller.style.color = data.style.textColor
  controller.style.borderRadius = `${data.style.cornerRadius}px`
  const title = createElement(dom, 'strong', 'slide-teacher-controller-title')
  title.textContent = data.title
  title.style.flex = 'none'
  title.style.whiteSpace = 'nowrap'
  controller.appendChild(title)

  const progress = dom.createElement('output')
  progress.className = 'slide-teacher-controller-progress'
  progress.dataset.teacherControllerProgress = 'true'
  progress.setAttribute('aria-label', '课程进度')
  progress.textContent = options.progressText
  progress.style.flex = 'none'
  progress.style.whiteSpace = 'nowrap'
  if (data.showSceneProgress) controller.appendChild(progress)

  const actions = createElement(dom, 'div', 'slide-teacher-controller-actions')
  actions.style.display = 'flex'
  actions.style.minWidth = '0'
  actions.style.flex = '1 1 auto'
  actions.style.alignItems = 'center'
  actions.style.gap = data.compact ? '4px' : '8px'
  actions.style.overflow = 'hidden'
  for (const button of data.buttons) {
    if (!button.visible) continue
    const element = dom.createElement('button')
    element.type = 'button'
    element.dataset.controllerButtonId = button.id
    element.textContent = button.label
    element.style.color = data.style.textColor
    element.style.borderColor = data.style.accentColor
    element.style.background = 'transparent'
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      if (options.canInteract()) options.onAction(button.action, item)
    })
    actions.appendChild(element)
  }
  controller.appendChild(actions)

  const collapse = dom.createElement('button')
  collapse.type = 'button'
  collapse.dataset.teacherControllerCollapse = 'true'
  collapse.style.flex = 'none'
  collapse.style.color = data.style.textColor
  collapse.style.borderColor = data.style.accentColor
  collapse.style.background = 'transparent'
  if (data.collapsible) controller.appendChild(collapse)

  const applyCollapsed = (requested: boolean) => {
    const collapsed = data.collapsible && requested
    controller.dataset.collapsed = String(collapsed)
    actions.hidden = collapsed
    progress.hidden = collapsed
    collapse.textContent = collapsed ? '展开' : '收起'
    collapse.setAttribute('aria-label', collapsed ? '展开教师控制器' : '收起教师控制器')
    collapse.setAttribute('aria-expanded', String(!collapsed))
  }
  applyCollapsed(options.collapsed)
  collapse.addEventListener('click', (event) => {
    event.stopPropagation()
    if (!options.canInteract()) return
    const collapsed = controller.dataset.collapsed !== 'true'
    options.onCollapsedChange(collapsed)
    applyCollapsed(collapsed)
  })
  return controller
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

class NativeDomItemHost {
  #item: NativeLayerItem
  #container: HTMLElement | null = null
  #services: SurfacePlayerServices | null = null
  #onTeacherControllerAction: (action: TeacherControllerAction, item: NativeLayerItem) => void
  #teacherControllerProgressText: () => string
  #teacherControllerCollapsed: boolean | undefined
  #mode: SlideInspectionMode = 'playback'

  constructor(
    item: NativeLayerItem,
    onTeacherControllerAction: (action: TeacherControllerAction, item: NativeLayerItem) => void,
    teacherControllerProgressText: () => string,
  ) {
    this.#item = item
    this.#onTeacherControllerAction = onTeacherControllerAction
    this.#teacherControllerProgressText = teacherControllerProgressText
    if (item.content.nativeType === 'teacher-controller') {
      this.#teacherControllerCollapsed = item.content.data.collapsible &&
        item.content.data.defaultCollapsed
    }
  }

  mount(context: { container: HTMLElement; services: SurfacePlayerServices }): void {
    this.#container = context.container
    this.#services = context.services
    this.#render()
  }

  update(item: NativeLayerItem): void {
    if (
      item.content.nativeType === 'teacher-controller' &&
      this.#item.content.nativeType === 'teacher-controller' && (
        item.content.data.collapsible !== this.#item.content.data.collapsible ||
        item.content.data.defaultCollapsed !== this.#item.content.data.defaultCollapsed
      )
    ) {
      this.#teacherControllerCollapsed = item.content.data.collapsible &&
        item.content.data.defaultCollapsed
    }
    this.#item = item
    this.#render()
  }

  activate(): void {}
  suspend(): void {}
  resume(): void {}
  reset(_scope: SurfaceResetScope): void {}
  setInspectionMode(mode: SlideInspectionMode): void {
    this.#mode = mode
  }
  capture(_request: SurfaceCaptureRequest): void {}

  refresh(): void {
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
    let element: HTMLElement
    switch (this.#item.content.nativeType) {
      case 'text': element = renderText(this.#item, dom); break
      case 'formula': element = renderFormula(this.#item, dom); break
      case 'image': element = renderImage(this.#item, dom, this.#services); break
      case 'video': element = renderVideo(this.#item, dom, this.#services); break
      case 'shape': element = renderShape(this.#item, dom); break
      case 'teacher-controller':
        element = renderTeacherController(
          this.#item,
          dom,
          {
            progressText: this.#teacherControllerProgressText(),
            collapsed: this.#teacherControllerCollapsed ?? false,
            canInteract: () => this.#mode === 'playback',
            onCollapsedChange: (collapsed) => {
              this.#teacherControllerCollapsed = collapsed
            },
            onAction: this.#onTeacherControllerAction,
          },
        )
        break
    }
    element.dataset.nativeType = this.#item.content.nativeType
    this.#container.replaceChildren(element)
  }
}

class StaticFallbackItemHost<T extends ComponentLayerItem | RuntimeLayerItem> implements SlideItemHost<T> {
  #item: T
  #container: HTMLElement | null = null
  #services: SurfacePlayerServices | null = null
  #error: Error | null

  constructor(item: T, error: Error | null = null) {
    this.#item = item
    this.#error = error
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
    const fallback = createElement(dom, 'div', 'slide-item-static-fallback')
    fallback.style.boxSizing = 'border-box'
    fallback.style.width = '100%'
    fallback.style.height = '100%'
    fallback.style.display = 'grid'
    fallback.style.placeItems = 'center'
    fallback.style.overflow = 'hidden'
    fallback.style.background = this.#item.kind === 'component' ? '#eff6ff' : '#f5f3ff'
    fallback.style.color = '#172033'
    fallback.style.border = `1px ${this.#error ? 'solid #dc2626' : 'dashed #64748b'}`
    const assetId = this.#item.kind === 'component'
      ? this.#item.staticFallbackAssetId
      : this.#item.runtime.staticFallback?.assetId
    if (assetId) {
      const image = dom.createElement('img')
      image.src = this.#services.resolveAsset(assetId) ?? ''
      image.alt = this.#item.label
      image.dataset.assetId = assetId
      image.style.width = '100%'
      image.style.height = '100%'
      image.style.objectFit = 'contain'
      fallback.appendChild(image)
    }
    const label = createElement(dom, 'span')
    label.textContent = this.#error
      ? `${this.#item.label}加载失败，已使用安全后备`
      : this.#item.kind === 'component'
        ? `互动组件：${this.#item.label}`
        : `互动内容：${this.#item.label}`
    fallback.appendChild(label)
    fallback.dataset.fallbackKind = this.#item.kind
    if (this.#error) {
      fallback.dataset.hostError = 'true'
      fallback.setAttribute('role', 'status')
    }
    this.#container.replaceChildren(fallback)
  }
}

function applyWrapperLayout(
  record: ItemRecord,
  _mode: SlideInspectionMode,
  sessionVisibility: boolean | undefined,
): void {
  const { item, wrapper } = record
  const { frame } = item
  wrapper.style.left = `${frame.x}px`
  wrapper.style.top = `${frame.y}px`
  wrapper.style.width = `${frame.width}px`
  wrapper.style.height = `${frame.height}px`
  wrapper.style.opacity = String(clamp(item.opacity, 0, 1))
  wrapper.style.transform = item.rotation === 0 ? '' : `rotate(${item.rotation}deg)`
  wrapper.style.pointerEvents = item.hitPolicy === 'pass-through' ? 'none' : 'auto'
  wrapper.dataset.layerOrder = String(item.order)
  wrapper.dataset.layerKind = item.kind
  wrapper.dataset.layerSource = record.source
  wrapper.dataset.hitPolicy = item.hitPolicy
  // Inspection is the frozen playback frame, not an authoring x-ray. Hidden
  // playback items remain hidden; teachers can still select them in the layer
  // panel and explicitly change their authored visibility.
  const playbackVisible = sessionVisibility ?? item.playbackInitialVisibility !== 'hidden'
  wrapper.hidden = !record.scopedVisible || !item.visible || !playbackVisible
}

function pointInsideItem(item: LayerItem, x: number, y: number): boolean {
  const { frame } = item
  const centerX = frame.x + frame.width / 2
  const centerY = frame.y + frame.height / 2
  const radians = -item.rotation * Math.PI / 180
  const dx = x - centerX
  const dy = y - centerY
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians) + frame.width / 2
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians) + frame.height / 2
  return localX >= 0 && localX <= frame.width && localY >= 0 && localY <= frame.height
}

/**
 * A cloned canvas has the same attributes as its live source but none of its
 * drawing buffer. Materialize that buffer as a PNG before the capture clone is
 * serialized, otherwise a later detached/PPTX rasterization sees a blank box.
 */
function materializeCanvasBitmaps(
  liveContent: HTMLElement,
  cloneContent: HTMLElement,
  label: string,
): void {
  const liveCanvases = [...liveContent.querySelectorAll<HTMLCanvasElement>('canvas')]
  const cloneCanvases = [...cloneContent.querySelectorAll<HTMLCanvasElement>('canvas')]
  cloneCanvases.forEach((cloneCanvas, index) => {
    const liveCanvas = liveCanvases[index]
    if (!liveCanvas || liveCanvas.width <= 0 || liveCanvas.height <= 0) {
      throw new Error(`${label} canvas ${index + 1} has no live bitmap`)
    }
    const dataUrl = liveCanvas.toDataURL('image/png')
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error(`${label} canvas ${index + 1} did not produce an image`)
    }
    const image = cloneContent.ownerDocument.createElement('img')
    for (const attribute of [...cloneCanvas.attributes]) {
      image.setAttribute(attribute.name, attribute.value)
    }
    image.src = dataUrl
    image.alt = liveCanvas.getAttribute('aria-label') ?? `${label} canvas`
    image.dataset.captureCanvas = 'true'
    cloneCanvas.replaceWith(image)
  })
}

/**
 * Production Slide compositor for Course Project V9. There are no underlay,
 * overlay or kind-specific planes: every visual participant is one direct DOM
 * child in the effective `layerItems` order.
 */
export class SlideSurfaceHost implements SurfaceHost {
  readonly kind = 'slide' as const
  readonly id: string

  #document: SlideSurfaceDocument
  #options: SlideSurfaceHostOptions
  #context: SurfaceMountContext | null = null
  #root: HTMLElement | null = null
  #records = new Map<string, ItemRecord>()
  #orderedRecords: ItemRecord[] = []
  #sceneId: string
  #stateId: string | undefined
  #mode: SlideInspectionMode = 'playback'
  #active = false
  #destroyed = false
  #sessionVisibility = new Map<string, boolean>()
  #surfaceAbortController: AbortController | null = null
  #queue: Promise<void> = Promise.resolve()
  #domPlayback = new DomPlaybackFreeze()
  #sceneInteractionEngine: InteractionEngine | null = null

  constructor(surface: SlideSurfaceDocument, options: SlideSurfaceHostOptions = {}) {
    if (surface.scenes.length === 0) throw new TypeError('Slide surface requires at least one scene')
    this.id = surface.id
    this.#document = cloneSurface(surface)
    this.#options = options
    const initial = surface.scenes.find((scene) => scene.id === options.initialSceneId) ?? surface.scenes[0]!
    this.#sceneId = initial.id
    this.#stateId = this.#validStateId(initial, options.initialStateId)
  }

  get sceneId(): string { return this.#sceneId }
  get stateId(): string | undefined { return this.#stateId }
  get inspectionMode(): SlideInspectionMode { return this.#mode }
  get rootElement(): HTMLElement | null { return this.#root }

  get document(): SlideSurfaceDocument {
    return cloneSurface(this.#document)
  }

  /** Refreshes progress/status text without remounting unrelated Native media or dynamic items. */
  refreshTeacherControllers(): void {
    for (const record of this.#orderedRecords) {
      if (record.item.kind !== 'native' || record.item.content.nativeType !== 'teacher-controller') continue
      if (record.host instanceof NativeDomItemHost) record.host.refresh()
    }
  }

  mount(context: SurfaceMountContext): Promise<void> {
    return this.#run(async () => {
      if (this.#destroyed) throw new Error('Cannot mount a destroyed Slide surface')
      if (this.#context) throw new Error('Slide surface is already mounted')
      this.#context = context
      const dom = context.container.ownerDocument
      const root = createElement(dom, 'section', 'slide-surface')
      root.dataset.surfaceId = this.id
      root.dataset.sceneId = this.#sceneId
      root.dataset.inspectionMode = this.#mode
      root.setAttribute('aria-label', this.#document.title)
      root.style.position = 'relative'
      root.style.width = `${this.#document.canvas.width}px`
      root.style.height = `${this.#document.canvas.height}px`
      root.style.overflow = 'hidden'
      root.style.isolation = 'isolate'
      root.hidden = !this.#active
      root.addEventListener('pointerdown', this.#handlePointerDown)
      root.addEventListener('dblclick', this.#handleDoubleClick)
      root.addEventListener('play', this.#handleNativeVideoEvent, true)
      root.addEventListener('pause', this.#handleNativeVideoEvent, true)
      root.addEventListener('ended', this.#handleNativeVideoEvent, true)
      root.addEventListener('timeupdate', this.#handleNativeVideoEvent, true)
      context.container.appendChild(root)
      this.#root = root
      this.#surfaceAbortController = new AbortController()
      if (context.signal.aborted) this.#surfaceAbortController.abort(context.signal.reason)
      else context.signal.addEventListener('abort', () => {
        this.#surfaceAbortController?.abort(context.signal.reason)
      }, { once: true })
      await this.#reconcile()
    })
  }

  updateDocument(surface: SlideSurfaceDocument): Promise<void> {
    return this.#run(async () => {
      if (surface.id !== this.id) throw new TypeError('Slide surface identity cannot change')
      if (surface.scenes.length === 0) throw new TypeError('Slide surface requires at least one scene')
      const restartInteractions = this.#interactionsShouldRun()
      if (restartInteractions) this.#stopInteractionEngines()
      this.#document = cloneSurface(surface)
      let scene = this.#findScene(this.#sceneId)
      if (!scene) {
        scene = this.#document.scenes[0]!
        this.#sceneId = scene.id
      }
      this.#stateId = this.#validStateId(scene, this.#stateId)
      await this.#reconcile()
      if (restartInteractions) this.#startInteractionEngines(false)
    })
  }

  /**
   * Reconciles course-scoped layers without recreating this surface host.
   * Existing records with the same stable layerItemId keep their Runtime /
   * Component instance and receive an ordinary item update.
   */
  updateGlobalLayerItems(items: readonly ScopedLayerItem[]): Promise<void> {
    return this.#run(async () => {
      this.#options.globalLayerItems = structuredClone(items)
      await this.#reconcile()
    })
  }

  setScene(sceneId: string, stateId?: string): Promise<void> {
    return this.#run(async () => {
      const scene = this.#findScene(sceneId)
      if (!scene) throw new Error(`Unknown Slide scene: ${sceneId}`)
      this.#sceneInteractionEngine?.destroy()
      this.#sceneInteractionEngine = null
      this.#sceneId = scene.id
      this.#stateId = this.#validStateId(scene, stateId)
      await this.#reconcile()
      if (this.#interactionsShouldRun()) {
        this.#startSceneInteractionEngine()
        this.#bindInteractionNodes()
        if (!this.#options.deferInteractionEntry) this.#announceInteractionEntry()
      }
    })
  }

  setPresentationState(stateId?: string): Promise<void> {
    return this.#run(async () => {
      const scene = this.#currentScene()
      const previousStateId = this.#stateId
      this.#stateId = this.#validStateId(scene, stateId)
      await this.#reconcile()
      this.#bindInteractionNodes()
      if (previousStateId !== this.#stateId && this.#interactionsShouldRun()) {
        this.#emitPresentationChange(previousStateId)
      }
    })
  }

  announceInteractionEntry(): Promise<void> {
    return this.#run(async () => {
      if (this.#interactionsShouldRun()) this.#announceInteractionEntry()
    })
  }

  /** Keeps every mounted Runtime/Component instance alive while editing its current frame. */
  setInspectionMode(mode: SlideInspectionMode): Promise<void> {
    return this.#run(async () => {
      if (this.#mode === mode) {
        this.#syncDomPlayback()
        return
      }
      if (mode === 'inspect') this.#stopInteractionEngines()
      this.#mode = mode
      if (this.#root) this.#root.dataset.inspectionMode = mode
      for (const record of this.#orderedRecords) {
        await this.#invoke(record, 'activate', () => record.host.setInspectionMode?.(mode))
      }
      this.#syncDomPlayback()
      if (mode === 'playback' && this.#active) this.#startInteractionEngines(true)
    })
  }

  setItemSessionVisibility(layerItemId: string, visible: boolean | undefined): void {
    if (visible === undefined) this.#sessionVisibility.delete(layerItemId)
    else this.#sessionVisibility.set(layerItemId, visible)
    const record = this.#records.get(layerItemId)
    if (record) applyWrapperLayout(record, this.#mode, visible)
  }

  activate(): Promise<void> {
    return this.#run(async () => {
      this.#active = true
      if (this.#root) this.#root.hidden = false
      for (const record of this.#orderedRecords) {
        await this.#invoke(record, 'activate', () => record.host.activate?.())
      }
      this.#syncDomPlayback()
      this.#startInteractionEngines(true)
    })
  }

  suspend(): Promise<void> {
    return this.#run(async () => {
      this.#stopInteractionEngines()
      this.#active = false
      for (const record of this.#orderedRecords) {
        await this.#invoke(record, 'suspend', () => record.host.suspend?.())
      }
      this.#syncDomPlayback()
      if (this.#root) this.#root.hidden = true
    })
  }

  resume(): Promise<void> {
    return this.#run(async () => {
      this.#active = true
      if (this.#root) this.#root.hidden = false
      for (const record of this.#orderedRecords) {
        await this.#invoke(record, 'resume', async () => {
          if (record.host.resume) await record.host.resume()
          else await record.host.activate?.()
        })
      }
      this.#syncDomPlayback()
      this.#startInteractionEngines(true)
    })
  }

  reset(scope: SurfaceResetScope): Promise<void> {
    return this.#run(async () => {
      this.#stopInteractionEngines()
      this.#sessionVisibility.clear()
      if (scope === 'course') this.#sceneId = this.#document.scenes[0]!.id
      const scene = this.#currentScene()
      this.#stateId = this.#validStateId(scene, undefined)
      await this.#reconcile()
      for (const record of this.#orderedRecords) {
        await this.#invoke(record, 'reset', () => record.host.reset?.(scope))
      }
      if (this.#interactionsShouldRun()) this.#startInteractionEngines(false)
    })
  }

  capture(request: SurfaceCaptureRequest): Promise<SurfaceCapture> {
    return this.#enqueue(async () => {
      const root = this.#root
      if (!root) throw new Error('Slide surface must be mounted before capture')
      const warnings: string[] = []
      const capturedItems: Array<SlideItemCapture | undefined> = []

      // Settle every live host before cloning. prepareCapture/capture.waitUntil
      // is allowed to update the current DOM or Canvas frame, and cloning first
      // would silently serialize the stale pre-capture state.
      for (let index = 0; index < this.#orderedRecords.length; index += 1) {
        const record = this.#orderedRecords[index]!
        if (
          record.item.kind === 'native' &&
          record.item.content.nativeType === 'teacher-controller' &&
          !record.item.content.data.includeInStaticExports
        ) continue
        if (!record.host.capture || request.dynamicPreparation === 'preserve-current') continue
        try {
          const captured = await record.host.capture(request)
          if (captured) {
            capturedItems[index] = captured
            warnings.push(...(captured.warnings ?? []))
          }
        } catch (cause) {
          warnings.push(slideItemCaptureFailureWarning(record.item.label))
          this.#report('capture', cause, record.item.layerItemId)
        }
      }

      const clone = root.cloneNode(true) as HTMLElement
      clone.hidden = false
      const cloneWrappers = Array.from(clone.children) as HTMLElement[]
      for (let index = 0; index < this.#orderedRecords.length; index += 1) {
        const record = this.#orderedRecords[index]!
        if (
          record.item.kind === 'native' &&
          record.item.content.nativeType === 'teacher-controller' &&
          !record.item.content.data.includeInStaticExports
        ) {
          cloneWrappers[index]?.remove()
          continue
        }
        const cloneContent = cloneWrappers[index]?.querySelector<HTMLElement>('.slide-layer-content')
        if (!cloneContent) continue
        const captured = capturedItems[index]
        try {
          if (captured) {
            cloneContent.dataset.captureFormat = captured.format
            if (captured.format === 'data-url') {
              const image = clone.ownerDocument.createElement('img')
              image.src = captured.content
              image.alt = record.item.label
              cloneContent.replaceChildren(image)
            } else if (captured.format === 'json') {
              const pre = clone.ownerDocument.createElement('pre')
              pre.textContent = captured.content
              cloneContent.replaceChildren(pre)
            } else {
              const template = clone.ownerDocument.createElement('template')
              template.innerHTML = captured.content
              cloneContent.replaceChildren(template.content.cloneNode(true))
            }
          }
          materializeCanvasBitmaps(record.content, cloneContent, record.item.label)
        } catch (cause) {
          const warning = slideItemCaptureFailureWarning(record.item.label)
          if (!warnings.includes(warning)) warnings.push(warning)
          this.#report('capture', cause, record.item.layerItemId)
        }
      }
      return {
        format: 'html',
        content: clone.outerHTML,
        width: request.width ?? this.#document.canvas.width,
        height: request.height ?? this.#document.canvas.height,
        warnings,
      }
    })
  }

  hitTest(x: number, y: number): SlideLayerHit | null {
    return this.hitStack(x, y)[0] ?? null
  }

  /** Returns front-to-back hits using exactly the same canonical list as paint/capture. */
  hitStack(x: number, y: number): SlideLayerHit[] {
    const result: SlideLayerHit[] = []
    for (let index = this.#orderedRecords.length - 1; index >= 0; index -= 1) {
      const record = this.#orderedRecords[index]!
      if (record.wrapper.hidden || record.item.hitPolicy === 'pass-through') continue
      if (!pointInsideItem(record.item, x, y)) continue
      result.push(this.#hitForRecord(record, index))
    }
    return result
  }

  destroy(): Promise<void> {
    return this.#run(async () => {
      if (this.#destroyed) return
      this.#destroyed = true
      this.#stopInteractionEngines()
      this.#surfaceAbortController?.abort('slide-surface-destroyed')
      for (const record of [...this.#orderedRecords].reverse()) {
        await this.#destroyRecord(record)
      }
      this.#records.clear()
      this.#orderedRecords = []
      this.#root?.removeEventListener('pointerdown', this.#handlePointerDown)
      this.#root?.removeEventListener('dblclick', this.#handleDoubleClick)
      this.#root?.removeEventListener('play', this.#handleNativeVideoEvent, true)
      this.#root?.removeEventListener('pause', this.#handleNativeVideoEvent, true)
      this.#root?.removeEventListener('ended', this.#handleNativeVideoEvent, true)
      this.#root?.removeEventListener('timeupdate', this.#handleNativeVideoEvent, true)
      this.#root?.remove()
      this.#root = null
      this.#context = null
      this.#surfaceAbortController = null
      this.#active = false
      this.#domPlayback.discard()
    })
  }

  #run(operation: () => Promise<void>): Promise<void> {
    return this.#enqueue(operation)
  }

  #enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation)
    this.#queue = result.then(() => undefined, () => undefined)
    return result
  }

  #findScene(sceneId: string): SlideSceneDocument | undefined {
    return this.#document.scenes.find((scene) => scene.id === sceneId)
  }

  #currentScene(): SlideSceneDocument {
    const scene = this.#findScene(this.#sceneId)
    if (!scene) throw new Error(`Unknown Slide scene: ${this.#sceneId}`)
    return scene
  }

  #validStateId(scene: SlideSceneDocument, requested: string | undefined): string | undefined {
    if (!scene.presentation) return undefined
    if (requested && scene.presentation.states.some((state) => state.id === requested)) return requested
    return scene.presentation.initialStateId
  }

  #effectiveEntries(): { entries: EffectiveLayerEntry[]; backgroundColor: string; backgroundAssetId?: string | null } {
    const scene = this.#currentScene()
    const materialized = materializeSceneItems(scene, this.#stateId)
    const locationId = this.#options.resolveLocationId?.(scene.id, this.#stateId) ?? scene.id
    const entries: EffectiveLayerEntry[] = [
      ...(this.#options.globalLayerItems ?? []).map((entry) => ({
        item: structuredClone(entry.item),
        source: 'global' as const,
        scopedVisible: isScopedVisible(entry, locationId),
      })),
      ...this.#document.surfaceLayerItems.map((entry) => ({
        item: structuredClone(entry.item),
        source: 'surface' as const,
        scopedVisible: isScopedVisible(entry, locationId),
      })),
      ...materialized.items.map((item) => ({
        item,
        source: 'scene' as const,
        scopedVisible: true,
      })),
    ]
    const seen = new Set<string>()
    const unique = canonicalEntries(entries).filter((entry) => {
      if (!seen.has(entry.item.layerItemId)) {
        seen.add(entry.item.layerItemId)
        return true
      }
      this.#report('mount', new Error(`Duplicate layer item id: ${entry.item.layerItemId}`), entry.item.layerItemId)
      return false
    })
    return {
      entries: unique,
      backgroundColor: materialized.state?.backgroundColor ?? scene.backgroundColor,
      backgroundAssetId: materialized.state?.backgroundAssetId === undefined
        ? scene.backgroundAssetId
        : materialized.state.backgroundAssetId,
    }
  }

  async #reconcile(): Promise<void> {
    if (!this.#root || !this.#context) return
    const effective = this.#effectiveEntries()
    const nextIds = new Set(effective.entries.map((entry) => entry.item.layerItemId))
    for (const record of this.#orderedRecords) {
      if (!nextIds.has(record.item.layerItemId)) await this.#destroyRecord(record)
    }

    const nextRecords: ItemRecord[] = []
    for (const entry of effective.entries) {
      let record = this.#records.get(entry.item.layerItemId)
      if (record && record.item.kind !== entry.item.kind) {
        await this.#destroyRecord(record)
        record = undefined
      }
      if (!record) record = await this.#createRecord(entry)
      else {
        record.item = entry.item
        record.source = entry.source
        record.scopedVisible = entry.scopedVisible
        await this.#updateRecord(record)
      }
      applyWrapperLayout(record, this.#mode, this.#sessionVisibility.get(record.item.layerItemId))
      // appendChild moves an existing child without remounting its backend.
      this.#root.appendChild(record.wrapper)
      nextRecords.push(record)
      this.#records.set(record.item.layerItemId, record)
    }
    this.#orderedRecords = nextRecords
    this.#root.dataset.sceneId = this.#sceneId
    this.#root.dataset.stateId = this.#stateId ?? ''
    this.#root.style.backgroundColor = effective.backgroundColor
    const backgroundUrl = effective.backgroundAssetId
      ? this.#context.services.resolveAsset(effective.backgroundAssetId)
      : undefined
    this.#root.style.backgroundImage = backgroundUrl ? `url("${backgroundUrl.replace(/"/g, '\\"')}")` : ''
    this.#root.style.backgroundSize = 'cover'
    this.#root.style.backgroundPosition = 'center'
    this.#bindInteractionNodes()
    this.#syncDomPlayback()
  }

  #interactionsShouldRun(): boolean {
    return Boolean(
      !this.#destroyed &&
      this.#active &&
      this.#mode === 'playback' &&
      this.#options.interactionEvents,
    )
  }

  #interactionPresentation(): InteractionPresentationController {
    return {
      current: () => this.#stateId ?? null,
      states: () => this.#currentScene().presentation?.states.map(({ id, name, description }) => ({
        id,
        name,
        ...(description ? { description } : {}),
      })) ?? [],
      setState: (stateId) => {
        const known = this.#currentScene().presentation?.states.some((state) => state.id === stateId)
        return known ? this.setPresentationState(stateId).then(() => true) : false
      },
      transitionTo: (stateId) => {
        const known = this.#currentScene().presentation?.states.some((state) => state.id === stateId)
        return known ? this.setPresentationState(stateId).then(() => true) : false
      },
    }
  }

  #interactionHostActions(): InteractionHostActions {
    const configured = this.#options.interactionActions
    return {
      goToScene: (sceneId, targetStateId) => configured?.goToScene
        ? configured.goToScene(sceneId, targetStateId)
        : this.#findScene(sceneId)
          ? this.setScene(sceneId, targetStateId).then(() => true)
          : false,
      nextScene: () => {
        if (configured?.nextScene) return configured.nextScene()
        const index = this.#document.scenes.findIndex((scene) => scene.id === this.#sceneId)
        const scene = this.#document.scenes[index + 1]
        return scene ? this.setScene(scene.id).then(() => true) : false
      },
      previousScene: () => {
        if (configured?.previousScene) return configured.previousScene()
        const index = this.#document.scenes.findIndex((scene) => scene.id === this.#sceneId)
        const scene = this.#document.scenes[index - 1]
        return scene ? this.setScene(scene.id).then(() => true) : false
      },
      replayScene: () => configured?.replayScene
        ? configured.replayScene()
        : this.reset('surface').then(() => {
            if (this.#interactionsShouldRun()) this.#announceInteractionEntry()
            return true
          }),
      restartCourse: () => configured?.restartCourse
        ? configured.restartCourse()
        : this.reset('course').then(() => {
            if (this.#interactionsShouldRun()) this.#announceInteractionEntry()
            return true
          }),
    }
  }

  #startInteractionEngines(announceEntry: boolean): void {
    if (!this.#interactionsShouldRun()) return
    this.#startSceneInteractionEngine()
    this.#bindInteractionNodes()
    if (announceEntry && !this.#options.deferInteractionEntry) this.#announceInteractionEntry()
  }

  #startSceneInteractionEngine(): void {
    if (this.#sceneInteractionEngine || !this.#interactionsShouldRun()) return
    const rules = this.#currentScene().interactions
    if (rules.length === 0) return
    this.#sceneInteractionEngine = new InteractionEngine({
      scope: 'scene',
      sceneId: this.#sceneId,
      currentSceneId: () => this.#sceneId,
      rules,
      events: this.#options.interactionEvents!,
      presentation: this.#interactionPresentation(),
      hostActions: this.#interactionHostActions(),
      executeAudioAction: this.#options.executeAudioAction,
      executeVideoAction: (action) => this.#executeVideoAction(action),
      executeNodeMotion: (action, context) => this.#executeNodeMotion(action, context),
      onError: (error, context) => this.#report(
        'activate',
        error instanceof Error ? error : new Error(String(error)),
        'nodeId' in (context.action ?? {}) ? (context.action as { nodeId: string }).nodeId : 'interaction',
      ),
    })
  }

  #stopInteractionEngines(): void {
    this.#sceneInteractionEngine?.destroy()
    this.#sceneInteractionEngine = null
  }

  #bindInteractionNodes(): void {
    if (!this.#sceneInteractionEngine) return
    const host = this
    const handles: InteractionBindableNodeHandle[] = this.#orderedRecords.map((record) => {
      const input = {
        get enabled(): boolean { return record.item.hitPolicy !== 'pass-through' },
        get cursor(): string | undefined { return record.wrapper.style.cursor || undefined },
        set cursor(value: string | undefined) { record.wrapper.style.cursor = value ?? '' },
      }
      const root: InteractionBindableRoot = {
        get active(): boolean { return host.#active && host.#mode === 'playback' },
        get visible(): boolean { return !record.wrapper.hidden },
        input,
        setInteractive: ({ cursor } = {}) => {
          if (cursor) record.wrapper.style.cursor = cursor
          return record.wrapper
        },
        on: (eventName, listener) => {
          record.wrapper.addEventListener(eventName, listener as EventListener)
          return record.wrapper
        },
        off: (eventName, listener) => {
          record.wrapper.removeEventListener(eventName, listener as EventListener)
          return record.wrapper
        },
      }
      return { id: record.item.layerItemId, root }
    })
    this.#sceneInteractionEngine?.bindNodeHandles(handles)
  }

  #announceInteractionEntry(): void {
    const events = this.#options.interactionEvents
    if (!events || !this.#interactionsShouldRun()) return
    this.#emitPresentationChange(undefined)
    events.emit('scene:enter', {
      surfaceId: this.id,
      sceneId: this.#sceneId,
      stateId: this.#stateId ?? null,
    })
  }

  #emitPresentationChange(previousStateId: string | undefined): void {
    if (!this.#stateId) return
    this.#options.interactionEvents?.emit('presentation:change', {
      surfaceId: this.id,
      sceneId: this.#sceneId,
      stateId: this.#stateId,
      previousStateId: previousStateId ?? null,
    })
  }

  #executeVideoAction(action: VideoInteractionAction): boolean | PromiseLike<boolean> {
    const record = this.#records.get(action.nodeId)
    const video = record?.content.querySelector<HTMLVideoElement>('video')
    if (!video) throw new Error(`找不到互动视频：${action.nodeId}`)
    const play = (): boolean | PromiseLike<boolean> => {
      const started = video.play()
      return started && typeof started.then === 'function'
        ? started.then(() => true)
        : true
    }
    switch (action.type) {
      case 'video.play': return play()
      case 'video.pause':
        video.pause()
        return true
      case 'video.restart':
        video.currentTime = 0
        return play()
      case 'video.stop':
        video.pause()
        video.currentTime = 0
        return true
      case 'video.toggle':
        if (video.paused) return play()
        video.pause()
        return true
      case 'video.seek':
        video.currentTime = action.seconds
        return true
    }
  }

  #executeNodeMotion(
    action: NodeMotionAction,
    context: InteractionNodeMotionContext,
  ): boolean | PromiseLike<boolean> {
    const record = this.#records.get(action.nodeId)
    if (!record || !this.#interactionsShouldRun()) return false
    const entering = action.type === 'node.enter'
    if (entering) this.setItemSessionVisibility(action.nodeId, true)
    const content = record.content
    const translate = action.effect === 'slide'
      ? action.direction === 'left' ? 'translateX(-10%)'
        : action.direction === 'right' ? 'translateX(10%)'
          : action.direction === 'up' ? 'translateY(-10%)' : 'translateY(10%)'
      : undefined
    const hiddenFrame: Keyframe = {
      opacity: 0,
      ...(action.effect === 'scale' ? { transform: 'scale(.92)' } : {}),
      ...(translate ? { transform: translate } : {}),
    }
    const shownFrame: Keyframe = { opacity: 1, transform: 'none' }
    if (action.effect === 'none' || action.durationMs <= 0 || typeof content.animate !== 'function') {
      this.setItemSessionVisibility(action.nodeId, entering)
      return true
    }
    const animation = content.animate(
      entering ? [hiddenFrame, shownFrame] : [shownFrame, hiddenFrame],
      {
        duration: action.durationMs,
        easing: action.easing,
        fill: 'none',
      },
    )
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (completed: boolean) => {
        if (settled) return
        settled = true
        context.signal.removeEventListener('abort', abort)
        if (completed && !entering) this.setItemSessionVisibility(action.nodeId, false)
        resolve(completed)
      }
      const abort = () => {
        animation.cancel()
        finish(false)
      }
      context.signal.addEventListener('abort', abort, { once: true })
      if (context.signal.aborted) {
        abort()
        return
      }
      void animation.finished.then(() => finish(true), () => finish(false))
    })
  }

  #handleNativeVideoEvent = (event: Event): void => {
    if (!this.#interactionsShouldRun() || this.#options.emitInteractionMediaEvents === false) return
    const target = event.target
    const ViewVideo = this.#root?.ownerDocument.defaultView?.HTMLVideoElement
    if (!ViewVideo || !(target instanceof ViewVideo)) return
    const wrapper = target.closest<HTMLElement>('.slide-layer-item')
    const nodeId = wrapper?.dataset.layerItemId
    if (!nodeId) return
    const payload = {
      surfaceId: this.id,
      sceneId: this.#sceneId,
      nodeId,
      seconds: target.currentTime,
    }
    if (event.type === 'play') this.#options.interactionEvents?.emit('video:started', payload)
    else if (event.type === 'pause') this.#options.interactionEvents?.emit('video:paused', payload)
    else if (event.type === 'ended') this.#options.interactionEvents?.emit('video:ended', payload)
    else if (event.type === 'timeupdate') this.#options.interactionEvents?.emit('video:time', payload)
  }

  #syncDomPlayback(): void {
    if (!this.#active || this.#mode === 'inspect') {
      this.#domPlayback.freeze(this.#root, this.#root, '.slide-native-video')
    } else {
      this.#domPlayback.release()
    }
  }

  async #createRecord(entry: EffectiveLayerEntry): Promise<ItemRecord> {
    const dom = this.#root!.ownerDocument
    const wrapper = createElement(dom, 'div', 'slide-layer-item')
    wrapper.dataset.layerItemId = entry.item.layerItemId
    wrapper.style.position = 'absolute'
    wrapper.style.boxSizing = 'border-box'
    wrapper.style.transformOrigin = 'center center'
    wrapper.style.contain = 'layout paint style'
    wrapper.style.overflow = 'hidden'
    const content = createElement(dom, 'div', 'slide-layer-content')
    content.style.width = '100%'
    content.style.height = '100%'
    content.style.boxSizing = 'border-box'
    wrapper.appendChild(content)
    const abortController = new AbortController()
    const surfaceSignal = this.#surfaceAbortController?.signal
    if (surfaceSignal?.aborted) abortController.abort(surfaceSignal.reason)
    else surfaceSignal?.addEventListener('abort', () => abortController.abort(surfaceSignal.reason), { once: true })
    let host: ItemRecord['host']
    let factoryError: Error | null = null
    try {
      host = this.#createHost(entry.item)
    } catch (cause) {
      factoryError = cause instanceof Error ? cause : new Error(String(cause))
      host = new StaticFallbackItemHost(
        entry.item as ComponentLayerItem | RuntimeLayerItem,
        factoryError,
      )
    }
    const record: ItemRecord = {
      ...entry,
      wrapper,
      content,
      host,
      abortController,
      failed: factoryError !== null,
    }
    if (factoryError) this.#report('mount', factoryError, entry.item.layerItemId)
    try {
      await this.#mountRecordHost(record)
    } catch (cause) {
      await this.#replaceWithFailureFallback(record, 'mount', cause)
    }
    if (this.#active) await this.#invoke(record, 'activate', () => record.host.activate?.())
    return record
  }

  #createHost(item: LayerItem): ItemRecord['host'] {
    if (item.kind === 'native') {
      return new NativeDomItemHost(item, (action, controller) => {
        void this.#handleTeacherControllerAction(action, controller)
      }, () => this.#teacherControllerProgressText())
    }
    if (item.kind === 'component') {
      return this.#options.componentHostFactory?.(item) ?? new StaticFallbackItemHost(item)
    }
    return this.#options.runtimeHostFactory?.(item) ?? new StaticFallbackItemHost(item)
  }

  #itemContext(record: ItemRecord): SlideItemMountContext {
    return {
      surfaceId: this.id,
      sceneId: this.#sceneId,
      item: record.item as ComponentLayerItem | RuntimeLayerItem,
      container: record.content,
      services: this.#context!.services,
      signal: record.abortController.signal,
      mode: this.#mode,
      reportHit: (detail) => {
        const index = this.#orderedRecords.indexOf(record)
        this.#options.onLayerHit?.(this.#hitForRecord(record, Math.max(0, index), detail))
      },
    }
  }

  async #mountRecordHost(record: ItemRecord): Promise<void> {
    if (record.item.kind === 'native') {
      await record.host.mount({
        container: record.content,
        services: this.#context!.services,
      } as never)
      return
    }
    await record.host.mount(this.#itemContext(record))
  }

  async #updateRecord(record: ItemRecord): Promise<void> {
    if (!record.host.update) return
    try {
      if (record.item.kind === 'native') {
        await record.host.update(record.item as never, undefined as never)
      } else {
        await (record.host as SlideItemHost<ComponentLayerItem | RuntimeLayerItem>)
          .update!(record.item, this.#itemContext(record))
      }
    } catch (cause) {
      await this.#replaceWithFailureFallback(record, 'mount', cause)
    }
  }

  async #invoke(
    record: ItemRecord,
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
    record: ItemRecord,
    phase: SurfaceLifecyclePhase,
    cause: unknown,
  ): Promise<void> {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    this.#report(phase, error, record.item.layerItemId)
    try { await record.host.destroy?.() } catch { /* failure is already isolated */ }
    record.content.replaceChildren()
    record.failed = true
    record.wrapper.dataset.hostStatus = 'failed'
    if (record.item.kind === 'native') {
      const native = new NativeDomItemHost(record.item, (action, controller) => {
        void this.#handleTeacherControllerAction(action, controller)
      }, () => this.#teacherControllerProgressText())
      record.host = native
      native.mount({ container: record.content, services: this.#context!.services })
      return
    }
    const fallback = new StaticFallbackItemHost(record.item, error)
    record.host = fallback
    fallback.mount(this.#itemContext(record) as never)
  }

  async #destroyRecord(record: ItemRecord): Promise<void> {
    record.abortController.abort('slide-layer-item-removed')
    try { await record.host.destroy?.() } catch (cause) {
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
        message: `Slide layer item ${layerItemId} failed during ${phase}`,
        cause,
      })
    } catch { /* diagnostics must never break the surface */ }
  }

  #hitForRecord(
    record: ItemRecord,
    order: number,
    detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' },
  ): SlideLayerHit {
    return {
      surfaceId: this.id,
      sceneId: this.#sceneId,
      layerItemId: record.item.layerItemId,
      kind: record.item.kind,
      order,
      source: record.source,
      ...detail,
    }
  }

  #handlePointerDown = (event: Event): void => {
    const target = event.target
    if (!(target instanceof this.#root!.ownerDocument.defaultView!.Element)) return
    const wrapper = target.closest<HTMLElement>('.slide-layer-item')
    if (!wrapper || wrapper.parentElement !== this.#root) return
    const record = this.#records.get(wrapper.dataset.layerItemId ?? '')
    if (!record || record.item.hitPolicy === 'pass-through' || wrapper.hidden) return
    this.#options.onLayerHit?.(this.#hitForRecord(record, this.#orderedRecords.indexOf(record)))
  }

  #handleDoubleClick = (event: Event): void => {
    if (this.#mode !== 'inspect') return
    const target = event.target
    if (!(target instanceof this.#root!.ownerDocument.defaultView!.Element)) return
    const wrapper = target.closest<HTMLElement>('.slide-layer-item')
    if (!wrapper || wrapper.parentElement !== this.#root) return
    const record = this.#records.get(wrapper.dataset.layerItemId ?? '')
    if (!record || record.item.kind !== 'native' || record.item.hitPolicy === 'pass-through' || wrapper.hidden) return
    const field = nativePrimaryAuthoringField(record.item)
    if (!field) return
    event.preventDefault()
    event.stopPropagation()
    this.#options.onLayerHit?.(this.#hitForRecord(
      record,
      this.#orderedRecords.indexOf(record),
      { field, targetKind: field.endsWith('assetId') ? 'asset' : 'text' },
    ))
  }

  async #handleTeacherControllerAction(
    action: TeacherControllerAction,
    item: NativeLayerItem,
  ): Promise<void> {
    // In inspection the controller is authored like every other unified layer.
    // Its visible buttons must not navigate, reset, mute or enter fullscreen
    // merely because the teacher clicked through the selected frame.
    if (this.#mode === 'inspect') return
    if (
      this.#options.beforeTeacherControllerAction &&
      await this.#options.beforeTeacherControllerAction(action, item) === false
    ) return
    const currentIndex = this.#document.scenes.findIndex((scene) => scene.id === this.#sceneId)
    const configured = this.#options.teacherControllerActions ?? this.#options.interactionActions
    if (action.type === 'scene.previous') {
      if (configured?.previousScene) await configured.previousScene()
      else if (currentIndex > 0) await this.setScene(this.#document.scenes[currentIndex - 1]!.id)
    } else if (action.type === 'scene.next') {
      if (configured?.nextScene) await configured.nextScene()
      else if (currentIndex < this.#document.scenes.length - 1) {
        await this.setScene(this.#document.scenes[currentIndex + 1]!.id)
      }
    } else if (action.type === 'scene.go') {
      if (configured?.goToScene) await configured.goToScene(action.sceneId, action.targetStateId)
      else await this.setScene(action.sceneId, action.targetStateId)
    } else if (action.type === 'scene.replay') {
      if (configured?.replayScene) await configured.replayScene()
      else await this.reset('surface')
    } else if (action.type === 'course.restart') {
      if (configured?.restartCourse) await configured.restartCourse()
      else await this.reset('course')
    }
    await this.#options.onTeacherControllerAction?.(action, item)
    const CustomEventConstructor = this.#root?.ownerDocument.defaultView?.CustomEvent
    const event = CustomEventConstructor
      ? new CustomEventConstructor('courseware:teacher-controller-action', { detail: action })
      : null
    if (event) this.#root?.dispatchEvent(event)
  }

  #teacherControllerProgressText(): string {
    const supplied = this.#options.teacherControllerProgressText?.().trim()
    if (supplied) return supplied
    const index = this.#document.scenes.findIndex((scene) => scene.id === this.#sceneId)
    const scene = this.#document.scenes[index]
    return scene
      ? `${index + 1} / ${this.#document.scenes.length} · ${scene.name}`
      : `1 / ${this.#document.scenes.length}`
  }
}
