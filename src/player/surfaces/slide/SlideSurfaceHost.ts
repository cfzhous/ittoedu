import { renderFormulaNodeSvg } from '../../../shared/formulaRenderer'
import { compareStableStrings } from '../../../shared/stableOrder'
import type {
  CourseEventBus,
  RuntimeHostActions,
  RuntimePresentationApi,
} from '../../../shared/runtimeTypes'
import {
  InteractionEngine,
  type InteractionBindableRoot,
  type InteractionEngineErrorContext,
  type InteractionNodeMotionContext,
} from '../../InteractionEngine'
import type { NodeMotionAction } from '../../../shared/interactionTypes'
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
  SurfaceCapture,
  SurfaceCaptureRequest,
  SurfaceHost,
  SurfaceLifecyclePhase,
  SurfaceMountContext,
  SurfacePlayerServices,
  SurfaceResetScope,
} from '../SurfaceHost'
import { DomPlaybackFreeze } from '../domPlaybackFreeze'
import {
  teacherControllerHitBounds,
  type TeacherControllerRuntimeNode,
  type TeacherControllerSessionOffset,
} from '../../teacherControllerRuntimeSession'
import {
  TeacherControllerDom,
  teacherControllerDomNode,
  type TeacherControllerDomContext,
  type TeacherControllerDomSession,
} from '../../teacherControllerDom'
import type {
  TeacherControllerSceneInfo,
  TeacherControllerViewStatus,
} from '../../../shared/teacherControllerLayout'

export type SlideInspectionMode = 'playback' | 'inspect'

export interface SlideItemCapture {
  format: SurfaceCapture['format']
  content: string
  warnings?: readonly string[]
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

export interface SlideInteractionSession {
  events: CourseEventBus
  hostActions: Readonly<RuntimeHostActions>
}

export interface SlideSurfaceHostOptions {
  initialSceneId?: string
  initialStateId?: string
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  /** Course-scoped items participate in the exact same sparse order. */
  globalLayerItems?: readonly ScopedLayerItem[]
  /**
   * Published playback interaction session. When omitted the surface stays
   * inert: it renders and reports hits but never executes scene rules.
   * Authoring inspect hosts, Flow overlays and capture paths must omit it.
   */
  interactions?: SlideInteractionSession
  /** Resolves CourseLocation.id when this surface is hosted by a mixed course. */
  resolveLocationId?(sceneId: string, stateId: string | undefined): string | undefined
  /** Guard hook evaluated before any built-in teacher-controller side effect. */
  beforeTeacherControllerAction?(
    action: TeacherControllerAction,
    item: NativeLayerItem,
  ): boolean | Promise<boolean>
  onLayerHit?(hit: SlideLayerHit): void
  onTeacherControllerAction?(action: TeacherControllerAction, item: NativeLayerItem): void
  /**
   * Course-level single executor for teacher-controller actions. When present
   * the host delegates every action (no local navigation, no guard hook) so the
   * course location pipeline owns navigation exactly once.
   */
  executeTeacherControllerAction?(
    action: TeacherControllerAction,
    item: NativeLayerItem,
  ): boolean | void | Promise<boolean | void>
  /** Authorable canvas controls toggle (`project.playback.controls`). */
  playbackControls?: 'canvas' | 'none'
  /** Course session mute seed (`project.media.audio.defaultMuted`). */
  initialMuted?: boolean
  /**
   * Course session progress source for teacher-controller progress labels.
   * When omitted the host uses this surface's scenes.
   */
  courseProgressSource?: SlideCourseProgressSource
}

export interface SlideCourseProgressSource {
  getLocations(): TeacherControllerSceneInfo[]
  getCurrentLocationId(): string | null
  getStateLabel?(): string | null
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
  onMediaEvent?: (eventName: string, seconds?: number) => void,
  sessionMuted?: boolean,
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
  // Course session mute is an additive override: it can only mute, never
  // unmute an authored-muted element. New scenes respect the live toggle.
  video.muted = data.muted || sessionMuted === true
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
  // Native media publishes its playback events to the interaction session so
  // video.started/paused/ended/time rules and global runtimes observe the same
  // protocol the Phaser player already emits.
  if (onMediaEvent) {
    video.addEventListener('playing', () => onMediaEvent('video:started'))
    video.addEventListener('pause', () => onMediaEvent('video:paused'))
    video.addEventListener('ended', () => onMediaEvent('video:ended'))
    video.addEventListener('timeupdate', () => onMediaEvent('video:time', video.currentTime))
  }
  return video
}

const DOM_MOTION_EASING: Record<NodeMotionAction['easing'], string> = {
  linear: 'linear',
  'ease-in': 'ease-in',
  'ease-out': 'ease-out',
  'ease-in-out': 'ease-in-out',
}

/**
 * Keyframes for one authored node.enter / node.exit on the compositor content
 * plane. The wrapper keeps rotation and authored opacity; the content element
 * carries the transient motion so reconcile re-layout cannot fight it.
 */
function domMotionKeyframes(
  action: NodeMotionAction,
  frame: { width: number; height: number },
): Keyframe[] | null {
  const entering = action.type === 'node.enter'
  const rest = { opacity: 1, transform: 'translate(0px, 0px) scale(1)' }
  let start: Record<string, string | number>
  switch (action.effect) {
    case 'fade':
      start = { opacity: 0 }
      break
    case 'slide': {
      const horizontal = action.direction === 'left' || action.direction === 'right'
      const distance = horizontal ? frame.width : frame.height
      const sign = (action.direction === 'left' || action.direction === 'up') ? -1 : 1
      const offset = `${sign * distance}px`
      start = horizontal
        ? { transform: `translateX(${offset})`, opacity: 1 }
        : { transform: `translateY(${offset})`, opacity: 1 }
      break
    }
    case 'scale':
      start = { transform: 'scale(0)', opacity: 1 }
      break
    case 'none':
      return null
  }
  return entering ? [start, rest] : [rest, start]
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

function renderTeacherController(
  item: NativeLayerItem,
  dom: Document,
  onAction: (action: TeacherControllerAction, item: NativeLayerItem) => void,
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
  controller.appendChild(title)
  for (const button of data.buttons) {
    if (!button.visible) continue
    if (button.label.trim() === '定位' || button.label.includes('试运行')) continue
    const element = dom.createElement('button')
    element.type = 'button'
    element.dataset.controllerButtonId = button.id
    element.textContent = button.label
    element.style.color = data.style.textColor
    element.style.borderColor = data.style.accentColor
    element.style.background = 'transparent'
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      onAction(button.action, item)
    })
    controller.appendChild(element)
  }
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
  #emitMediaEvent: ((eventName: string, seconds?: number) => void) | null
  #teacherControllerContext: TeacherControllerDomContext | null
  #teacherControllerDom: TeacherControllerDom | null = null
  #getSessionMuted: () => boolean

  constructor(
    item: NativeLayerItem,
    onTeacherControllerAction: (action: TeacherControllerAction, item: NativeLayerItem) => void,
    emitMediaEvent: ((eventName: string, seconds?: number) => void) | null = null,
    teacherControllerContext: TeacherControllerDomContext | null = null,
    getSessionMuted: () => boolean = () => false,
  ) {
    this.#item = item
    this.#onTeacherControllerAction = onTeacherControllerAction
    this.#emitMediaEvent = emitMediaEvent
    this.#teacherControllerContext = teacherControllerContext
    this.#getSessionMuted = getSessionMuted
  }

  mount(context: { container: HTMLElement; services: SurfacePlayerServices }): void {
    this.#container = context.container
    this.#services = context.services
    this.#render()
  }

  update(item: NativeLayerItem): void {
    this.#item = item
    this.#render()
  }

  activate(): void {}
  suspend(): void {}
  resume(): void {}
  reset(_scope: SurfaceResetScope): void {}
  setInspectionMode(_mode: SlideInspectionMode): void {}
  capture(_request: SurfaceCaptureRequest): void {}

  refreshTeacherControllerStatus(): void {
    this.#teacherControllerDom?.refreshStatus()
  }

  destroy(): void {
    this.#teacherControllerDom?.destroy()
    this.#teacherControllerDom = null
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
      case 'video': element = renderVideo(
        this.#item,
        dom,
        this.#services,
        this.#emitMediaEvent ?? undefined,
        this.#getSessionMuted(),
      ); break
      case 'shape': element = renderShape(this.#item, dom); break
      case 'teacher-controller':
        element = this.#teacherControllerContext
          ? this.#renderControllerDom()
          : renderTeacherController(
              this.#item,
              dom,
              this.#onTeacherControllerAction,
            )
        break
    }
    element.dataset.nativeType = this.#item.content.nativeType
    this.#container.replaceChildren(element)
  }

  #renderControllerDom(): HTMLElement {
    const context = this.#teacherControllerContext!
    const content = this.#item.content
    if (content.nativeType !== 'teacher-controller') {
      throw new TypeError('Expected teacher controller item')
    }
    const node = teacherControllerDomNode(
      this.#item.frame,
      this.#item.rotation,
      content.data,
    )
    if (!this.#teacherControllerDom) {
      this.#teacherControllerDom = new TeacherControllerDom({
        node,
        container: this.#container!,
        canvas: context.canvas,
        scenes: context.scenes,
        getCurrentSceneId: context.getCurrentSceneId,
        getStateLabel: context.getStateLabel,
        getStatus: context.getStatus,
        getSession: () => context.getSession(this.#item.layerItemId),
        onSessionChange: (next) => context.onSessionChange(this.#item.layerItemId, next),
        onAction: (action) => this.#onTeacherControllerAction(action, this.#item),
        getInteractive: context.getInteractive,
      })
      this.#container!.replaceChildren(this.#teacherControllerDom.rootElement)
    } else {
      this.#teacherControllerDom.update(node)
    }
    return this.#teacherControllerDom.rootElement
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
        : `互动运行时：${this.#item.label}`
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
  controlsEnabled = true,
  sessionOffset?: TeacherControllerSessionOffset,
): void {
  const { item, wrapper } = record
  const { frame } = item
  const isTeacherController = item.kind === 'native' &&
    item.content.nativeType === 'teacher-controller'
  if (isTeacherController && !controlsEnabled) {
    wrapper.hidden = true
    return
  }
  wrapper.style.left = `${frame.x + (sessionOffset?.dx ?? 0)}px`
  wrapper.style.top = `${frame.y + (sessionOffset?.dy ?? 0)}px`
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
  const playbackVisible = item.playbackInitialVisibility !== 'hidden'
  wrapper.hidden = !record.scopedVisible || !item.visible || !playbackVisible || sessionVisibility === false
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
 * Adapts one compositor wrapper to the interaction engine's bindable-root
 * contract. Visibility, input and cursor reads stay live so state-driven
 * layout changes apply without rebinding.
 */
function interactionBindableRoot(record: ItemRecord): InteractionBindableRoot {
  const wrapper = record.wrapper
  const input = {
    get enabled() { return record.item.hitPolicy !== 'pass-through' },
    get cursor() { return wrapper.style.cursor },
    set cursor(value: string | undefined) { wrapper.style.cursor = value ?? '' },
  }
  return {
    get active() { return true },
    get visible() { return !wrapper.hidden },
    input,
    on: (eventName, listener) => {
      wrapper.addEventListener(eventName, listener as EventListener)
    },
    off: (eventName, listener) => {
      wrapper.removeEventListener(eventName, listener as EventListener)
    },
  }
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
  #teacherControllerSession = new Map<string, TeacherControllerDomSession>()
  #controllerMuted: boolean
  #audioChangeDisposer: (() => void) | null = null
  #progressDisposer: (() => void) | null = null
  #surfaceAbortController: AbortController | null = null
  #queue: Promise<void> = Promise.resolve()
  #domPlayback = new DomPlaybackFreeze()
  #interactionEngine: InteractionEngine | null = null

  constructor(surface: SlideSurfaceDocument, options: SlideSurfaceHostOptions = {}) {
    if (surface.scenes.length === 0) throw new TypeError('Slide surface requires at least one scene')
    this.id = surface.id
    this.#document = cloneSurface(surface)
    this.#options = options
    this.#controllerMuted = options.initialMuted ?? false
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
      context.container.appendChild(root)
      this.#root = root
      this.#surfaceAbortController = new AbortController()
      if (context.signal.aborted) this.#surfaceAbortController.abort(context.signal.reason)
      else context.signal.addEventListener('abort', () => {
        this.#surfaceAbortController?.abort(context.signal.reason)
      }, { once: true })
      const interactions = this.#options.interactions
      if (interactions) {
        this.#audioChangeDisposer = interactions.events.on<{ muted?: boolean }>(
          'audio:change',
          (event) => {
            if (typeof event?.muted !== 'boolean') return
            this.#controllerMuted = event.muted
            this.#refreshControllerStatuses()
          },
        )
        this.#progressDisposer = interactions.events.on('course:location', () => {
          this.#refreshControllerStatuses()
        })
      }
      await this.#reconcile()
      // Mount stays quiet: the Published boot always follows with navigate →
      // setScene, which owns the scene-enter announcement.
      this.#syncInteractionEngine()
    })
  }

  updateDocument(surface: SlideSurfaceDocument): Promise<void> {
    return this.#run(async () => {
      if (surface.id !== this.id) throw new TypeError('Slide surface identity cannot change')
      if (surface.scenes.length === 0) throw new TypeError('Slide surface requires at least one scene')
      this.#document = cloneSurface(surface)
      let scene = this.#findScene(this.#sceneId)
      if (!scene) {
        scene = this.#document.scenes[0]!
        this.#sceneId = scene.id
      }
      this.#stateId = this.#validStateId(scene, this.#stateId)
      await this.#reconcile()
      this.#syncInteractionEngine()
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
      const previousSceneId = this.#sceneId
      const previousStateId = this.#stateId
      const sceneChanged = previousSceneId !== scene.id
      if (sceneChanged) this.#emitSceneExited(scene.id)
      this.#sceneId = scene.id
      const nextStateId = this.#validStateId(scene, stateId)
      if (!sceneChanged && previousStateId && nextStateId !== previousStateId) {
        this.#emitPresentationExited(previousStateId)
      }
      this.#stateId = nextStateId
      await this.#reconcile()
      this.#syncInteractionEngine()
      this.#emitSceneEntered(sceneChanged ? null : previousStateId)
    })
  }

  setPresentationState(stateId?: string): Promise<void> {
    return this.#run(async () => {
      const scene = this.#currentScene()
      const previousStateId = this.#stateId
      this.#stateId = this.#validStateId(scene, stateId)
      const changed = this.#stateId !== previousStateId
      if (changed && previousStateId) this.#emitPresentationExited(previousStateId)
      await this.#reconcile()
      const session = this.#options.interactions
      if (
        session &&
        this.#interactionEngine &&
        this.#stateId &&
        changed
      ) {
        session.events.emit('presentation:change', {
          sceneId: this.#sceneId,
          fromStateId: previousStateId ?? null,
          stateId: this.#stateId,
        })
      }
    })
  }

  /** Keeps every mounted Runtime/Component instance alive while editing its current frame. */
  setInspectionMode(mode: SlideInspectionMode): Promise<void> {
    return this.#run(async () => {
      if (this.#mode === mode) {
        this.#syncDomPlayback()
        return
      }
      this.#mode = mode
      if (this.#root) this.#root.dataset.inspectionMode = mode
      for (const record of this.#orderedRecords) {
        await this.#invoke(record, 'activate', () => record.host.setInspectionMode?.(mode))
      }
      // Inspection is an authoring frame: interaction execution never runs there.
      this.#syncInteractionEngine()
      this.#syncDomPlayback()
    })
  }

  setItemSessionVisibility(layerItemId: string, visible: boolean | undefined): void {
    if (visible === undefined) this.#sessionVisibility.delete(layerItemId)
    else this.#sessionVisibility.set(layerItemId, visible)
    const record = this.#records.get(layerItemId)
    if (record) {
      const session = this.#controllerSession(record.item)
      applyWrapperLayout(
        record,
        this.#mode,
        visible,
        this.#controlsEnabled(),
        session?.offset,
      )
    }
  }

  activate(): Promise<void> {
    return this.#run(async () => {
      this.#active = true
      if (this.#root) this.#root.hidden = false
      for (const record of this.#orderedRecords) {
        await this.#invoke(record, 'activate', () => record.host.activate?.())
      }
      this.#syncInteractionEngine()
      this.#syncDomPlayback()
    })
  }

  suspend(): Promise<void> {
    return this.#run(async () => {
      this.#active = false
      this.#emitSceneExited(undefined)
      this.#syncInteractionEngine()
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
      this.#syncInteractionEngine()
      this.#syncDomPlayback()
    })
  }

  reset(scope: SurfaceResetScope): Promise<void> {
    return this.#run(async () => {
      const previousSceneId = this.#sceneId
      const previousStateId = this.#stateId
      this.#sessionVisibility.clear()
      if (scope === 'course') {
        // Course restart restores the project defaults for controller session
        // state (offset + collapse) and the session mute override.
        this.#teacherControllerSession.clear()
        this.#controllerMuted = this.#options.initialMuted ?? false
      }
      // Resolve the target scene id first: the exit event must report the old
      // scene while #sceneId still points at it.
      const targetSceneId = scope === 'course'
        ? this.#document.scenes[0]!.id
        : previousSceneId
      const sceneChanged = previousSceneId !== targetSceneId
      if (sceneChanged) {
        this.#emitSceneExited(targetSceneId)
      } else {
        const nextStateId = this.#validStateId(
          this.#currentScene(),
          undefined,
        )
        if (previousStateId && previousStateId !== nextStateId) {
          this.#emitPresentationExited(previousStateId)
        }
      }
      this.#sceneId = targetSceneId
      const scene = this.#currentScene()
      this.#stateId = this.#validStateId(scene, undefined)
      await this.#reconcile()
      // A reset must not keep rule-run or media-threshold session state.
      this.#syncInteractionEngine()
      for (const record of this.#orderedRecords) {
        await this.#invoke(record, 'reset', () => record.host.reset?.(scope))
      }
      // Replay and restart re-enter the current scene: announce the fresh entry
      // so scene.enter and presentation.enter rules run again from the authored
      // state instead of keeping the stale session frame.
      this.#emitSceneEntered(sceneChanged ? null : previousStateId)
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
        if (!record.host.capture) continue
        try {
          const captured = await record.host.capture(request)
          if (captured) {
            capturedItems[index] = captured
            warnings.push(...(captured.warnings ?? []))
          }
        } catch (cause) {
          warnings.push(`${record.item.label} capture failed`)
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
          const warning = `${record.item.label} capture failed`
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
      if (
        record.item.kind === 'native' &&
        record.item.content.nativeType === 'teacher-controller'
      ) {
        const session = this.#controllerSession(record.item)
        if (!session) continue
        const bounds = teacherControllerHitBounds(
          teacherControllerDomNode(record.item.frame, record.item.rotation, record.item.content.data),
          session.offset,
          session.collapsed,
        )
        // A collapsed controller's real hit area is the pill, not the panel.
        if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) continue
      } else if (!pointInsideItem(record.item, x, y)) {
        continue
      }
      result.push(this.#hitForRecord(record, index))
    }
    return result
  }

  destroy(): Promise<void> {
    return this.#run(async () => {
      if (this.#destroyed) return
      // The interaction session ends with the surface: announce the scene exit
      // before tearing down the engine and item hosts so global observers see
      // the outgoing scene while the course event bus is still alive.
      this.#emitSceneExited(undefined)
      this.#destroyed = true
      this.#interactionEngine?.destroy()
      this.#interactionEngine = null
      this.#audioChangeDisposer?.()
      this.#audioChangeDisposer = null
      this.#progressDisposer?.()
      this.#progressDisposer = null
      this.#teacherControllerSession.clear()
      this.#surfaceAbortController?.abort('slide-surface-destroyed')
      for (const record of [...this.#orderedRecords].reverse()) {
        await this.#destroyRecord(record)
      }
      this.#records.clear()
      this.#orderedRecords = []
      this.#root?.removeEventListener('pointerdown', this.#handlePointerDown)
      this.#root?.removeEventListener('dblclick', this.#handleDoubleClick)
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
      const session = this.#controllerSession(record.item)
      applyWrapperLayout(
        record,
        this.#mode,
        this.#sessionVisibility.get(record.item.layerItemId),
        this.#controlsEnabled(),
        session?.offset,
      )
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
    this.#bindInteractionHandles()
    this.#syncDomPlayback()
  }

  #syncDomPlayback(): void {
    if (!this.#active || this.#mode === 'inspect') {
      this.#domPlayback.freeze(this.#root, this.#root, '.slide-native-video')
    } else {
      this.#domPlayback.release()
    }
  }

  /**
   * Rebuilds the scene interaction session from the current scene's rules.
   * Subscriptions and rule-run state never outlive their scene: every scene
   * switch, document replacement and reset starts from a fresh engine, and an
   * inspecting or session-less surface stays inert.
   */
  #syncInteractionEngine(): void {
    this.#interactionEngine?.destroy()
    this.#interactionEngine = null
    const session = this.#options.interactions
    if (!session || this.#destroyed || this.#mode !== 'playback' || !this.#active) return
    const scene = this.#currentScene()
    this.#interactionEngine = new InteractionEngine({
      sceneId: scene.id,
      rules: scene.interactions,
      events: session.events,
      presentation: this.#presentationApi(),
      hostActions: session.hostActions,
      executeNodeMotion: (action, context) => this.#executeNodeMotion(action, context),
      onError: (error, context) => this.#reportInteractionError(error, context),
    })
    this.#bindInteractionHandles()
  }

  #bindInteractionHandles(): void {
    this.#interactionEngine?.bindNodeHandles(
      this.#orderedRecords
        .filter((record) => record.source === 'scene')
        .map((record) => ({
          id: record.item.layerItemId,
          root: interactionBindableRoot(record),
        })),
    )
  }

  /**
   * Announces the entered scene so scene.enter / presentation.enter rules fire.
   * `previousStateId` supplies the fromStateId for same-scene state changes;
   * a scene switch has no presentation continuity, so it passes `null`.
   */
  #emitSceneEntered(previousStateId?: string | null): void {
    const session = this.#options.interactions
    if (!session || !this.#interactionEngine) return
    if (this.#stateId) {
      session.events.emit('presentation:change', {
        sceneId: this.#sceneId,
        fromStateId: previousStateId ?? null,
        stateId: this.#stateId,
      })
    }
    session.events.emit('scene:enter', { sceneId: this.#sceneId })
  }

  /** Announces the outgoing scene so global runtimes observe scene exits. */
  #emitSceneExited(toSceneId?: string): void {
    const session = this.#options.interactions
    if (!session) return
    session.events.emit('scene:exit', {
      sceneId: this.#sceneId,
      ...(toSceneId === undefined ? {} : { toSceneId }),
    })
  }

  /** Announces the named state being left on a same-scene state switch. */
  #emitPresentationExited(stateId: string): void {
    const session = this.#options.interactions
    if (!session) return
    session.events.emit('presentation:exit', {
      sceneId: this.#sceneId,
      stateId,
    })
  }

  /**
   * Publishes native media playback to the interaction session with the stable
   * layer item id and the scene active at the moment of the event.
   */
  #emitMediaEvent(nodeId: string, eventName: string, seconds?: number): void {
    const session = this.#options.interactions
    if (!session || this.#mode !== 'playback') return
    session.events.emit(eventName, {
      nodeId,
      sceneId: this.#sceneId,
      ...(seconds === undefined ? {} : { seconds }),
    })
  }

  /**
   * Executes an authored node.enter / node.exit on the item's content plane via
   * the Web Animations API. Environments without WAAPI (jsdom, capture) degrade
   * to an instant, still-order-correct completion. The promise resolves `false`
   * when the owning rule run is aborted or the element is recreated mid-motion,
   * so the engine never publishes a stale animation.completed.
   */
  #executeNodeMotion(
    action: NodeMotionAction,
    context: InteractionNodeMotionContext,
  ): boolean | PromiseLike<boolean> {
    if (this.#destroyed || this.#mode !== 'playback') return false
    const record = this.#records.get(action.nodeId)
    if (!record || record.failed) return false
    const content = record.content
    const entering = action.type === 'node.enter'
    const animate = typeof content.animate === 'function'
      ? content.animate.bind(content)
      : null
    if (entering) {
      this.setItemSessionVisibility(action.nodeId, true)
    } else if (!animate || record.wrapper.hidden) {
      this.setItemSessionVisibility(action.nodeId, false)
      return true
    }
    if (!animate) return true
    const keyframes = domMotionKeyframes(action, record.item.frame)
    if (!keyframes) {
      if (!entering) this.setItemSessionVisibility(action.nodeId, false)
      return true
    }
    const duration = Math.max(0, Math.min(60_000, action.durationMs))
    const animation = animate(keyframes, {
      duration,
      easing: DOM_MOTION_EASING[action.easing] ?? 'linear',
      fill: entering ? 'backwards' : 'forwards',
    })
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        if (!entering) this.setItemSessionVisibility(action.nodeId, false)
        resolve(true)
      }
      const cancel = (): void => {
        if (settled) return
        settled = true
        resolve(false)
      }
      animation.addEventListener('finish', finish, { once: true })
      animation.addEventListener('cancel', cancel, { once: true })
      const onAbort = (): void => {
        animation.cancel()
        cancel()
      }
      context.signal.addEventListener('abort', onAbort, { once: true })
      if (context.signal.aborted) onAbort()
      else void animation.finished.catch(cancel)
    })
  }

  /** Routes declarative rule failures to diagnostics with teacher-safe text. */
  #reportInteractionError(error: unknown, context: InteractionEngineErrorContext): void {
    const cause = error instanceof Error ? error : new Error(String(error))
    console.error('互动规则执行失败', cause)
    this.#context?.services.reportDiagnostic?.({
      surfaceId: this.id,
      phase: 'execute',
      severity: 'error',
      message: context.phase === 'bind' ? '互动规则绑定失败' : cause.message,
      cause,
    })
  }

  #presentationApi(): RuntimePresentationApi {
    return {
      current: () => this.#stateId ?? null,
      states: () => this.#currentScene().presentation?.states.map((state) => ({
        id: state.id,
        name: state.name,
      })) ?? [],
      setState: (stateId) => this.#setPresentationFromInteraction(stateId),
      // The DOM compositor applies state switches immediately; transition
      // timing is honored by the Phaser player, not this host.
      transitionTo: (stateId) => this.#setPresentationFromInteraction(stateId),
    }
  }

  #setPresentationFromInteraction(stateId: string): boolean | PromiseLike<boolean> {
    if (this.#destroyed || this.#mode !== 'playback') return false
    const scene = this.#currentScene()
    if (!scene.presentation?.states.some((state) => state.id === stateId)) return false
    // Genuinely await the applied state so the rule chain continues only after
    // the switch settles; a failed switch resolves false and stops the chain.
    return this.setPresentationState(stateId).then(
      () => true,
      (error: unknown) => {
        this.#reportInteractionError(error, { phase: 'execute' })
        return false
      },
    )
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
      return new NativeDomItemHost(
        item,
        (action, controller) => {
          void this.#handleTeacherControllerAction(action, controller)
        },
        item.content.nativeType === 'video'
          ? (eventName, seconds) => this.#emitMediaEvent(item.layerItemId, eventName, seconds)
          : null,
        this.#teacherControllerContext(),
        () => this.#controllerMuted,
      )
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
      const native = new NativeDomItemHost(
        record.item,
        (action, controller) => {
          void this.#handleTeacherControllerAction(action, controller)
        },
        record.item.content.nativeType === 'video'
          ? (eventName, seconds) => this.#emitMediaEvent(record.item.layerItemId, eventName, seconds)
          : null,
        this.#teacherControllerContext(),
        () => this.#controllerMuted,
      )
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
    if (this.#options.executeTeacherControllerAction) {
      // Single course-level owner: the published app navigates through the
      // guarded course location pipeline and handles mute/fullscreen/picker.
      await this.#options.executeTeacherControllerAction(action, item)
    } else {
      if (
        this.#options.beforeTeacherControllerAction &&
        await this.#options.beforeTeacherControllerAction(action, item) === false
      ) return
      const currentIndex = this.#document.scenes.findIndex((scene) => scene.id === this.#sceneId)
      if (action.type === 'scene.previous' && currentIndex > 0) {
        await this.setScene(this.#document.scenes[currentIndex - 1]!.id)
      } else if (action.type === 'scene.next' && currentIndex < this.#document.scenes.length - 1) {
        await this.setScene(this.#document.scenes[currentIndex + 1]!.id)
      } else if (action.type === 'scene.go') {
        await this.setScene(action.sceneId, action.targetStateId)
      } else if (action.type === 'scene.replay') {
        await this.reset('surface')
      } else if (action.type === 'course.restart') {
        await this.reset('course')
      }
      this.#options.onTeacherControllerAction?.(action, item)
    }
    const CustomEventConstructor = this.#root?.ownerDocument.defaultView?.CustomEvent
    const event = CustomEventConstructor
      ? new CustomEventConstructor('courseware:teacher-controller-action', { detail: action })
      : null
    if (event) this.#root?.dispatchEvent(event)
  }

  /** Session bundle the DOM controller reads and reports back through. */
  #teacherControllerContext(): TeacherControllerDomContext {
    const progressSource = this.#options.courseProgressSource
    return {
      canvas: this.#document.canvas,
      scenes: progressSource?.getLocations()
        ?? this.#document.scenes.map((scene) => ({ id: scene.id, name: scene.name })),
      getCurrentSceneId: () => progressSource?.getCurrentLocationId() ?? this.#sceneId,
      getStateLabel: () => {
        if (progressSource) return progressSource.getStateLabel?.() ?? null
        const scene = this.#currentScene()
        const state = this.#stateId
          ? scene.presentation?.states.find((candidate) => candidate.id === this.#stateId)
          : undefined
        return state?.name ?? null
      },
      getStatus: () => ({
        muted: this.#controllerMuted,
        fullscreen: Boolean(this.#root?.ownerDocument.fullscreenElement),
      }),
      getSession: (layerItemId) => {
        const item = this.#records.get(layerItemId)?.item
        return this.#controllerSession(item) ?? {
          offset: { dx: 0, dy: 0 },
          collapsed: false,
        }
      },
      onSessionChange: (layerItemId, next) => this.#applyTeacherControllerSession(layerItemId, next),
      getInteractive: () => this.#controllerInteractive(),
    }
  }

  /** Canonical session for a controller item; seeds the project defaults. */
  #controllerSession(item: LayerItem | undefined): TeacherControllerDomSession | undefined {
    if (
      !item ||
      item.kind !== 'native' ||
      item.content.nativeType !== 'teacher-controller'
    ) return undefined
    const existing = this.#teacherControllerSession.get(item.layerItemId)
    if (existing) return existing
    const session: TeacherControllerDomSession = {
      offset: { dx: 0, dy: 0 },
      collapsed: item.content.data.collapsible && item.content.data.defaultCollapsed,
    }
    this.#teacherControllerSession.set(item.layerItemId, session)
    return session
  }

  /** Persists a controller session change and moves the compositor wrapper. */
  #applyTeacherControllerSession(layerItemId: string, next: TeacherControllerDomSession): void {
    this.#teacherControllerSession.set(layerItemId, {
      offset: { ...next.offset },
      collapsed: next.collapsed,
    })
    const record = this.#records.get(layerItemId)
    if (record) {
      applyWrapperLayout(
        record,
        this.#mode,
        this.#sessionVisibility.get(layerItemId),
        this.#controlsEnabled(),
        next.offset,
      )
    }
  }

  #controlsEnabled(): boolean {
    return (this.#options.playbackControls ?? 'canvas') === 'canvas'
  }

  #controllerInteractive(): boolean {
    return this.#mode === 'playback' && this.#controlsEnabled()
  }

  #refreshControllerStatuses(): void {
    for (const record of this.#orderedRecords) {
      if (record.host instanceof NativeDomItemHost) {
        record.host.refreshTeacherControllerStatus()
      }
    }
  }
}
