import type { SpatialPathDash } from '../../../shared/courseProjectTypes'
import type { TeacherControllerAction } from '../../../shared/projectTypes'
import type { TeacherControllerSceneInfo } from '../../../shared/teacherControllerLayout'
import type {
  PublishedCourseV2Payload,
  PublishedLayerItem,
  PublishedNativeLayerItem,
} from '../../../shared/publishedCourseTypes'
import {
  TeacherControllerDom,
  teacherControllerDomNode,
  type TeacherControllerDomSession,
} from '../../teacherControllerDom'
import {
  collectSpatialPlaybackEntries,
  isSpatialTeacherControllerItem,
  isSpatialViewportPlaybackItem,
  publishedCameraSnapshot,
  publishedSpatialInputFromCourse,
  publishedSpatialPaths,
  publishedSpatialRelations,
  spatialWorldGroupTransform,
  worldItemVisibleInRuntimeCamera,
  type PublishedSpatialRuntimeInput,
  type SpatialPlaybackEntry,
  type SpatialRuntimeCamera,
  type SpatialRuntimeViewport,
} from './spatialModel'
import {
  enterSpatialRuntimeLocation,
  leaveSpatialRuntimeLocation,
  openSpatialRuntimeSession,
  reopenSpatialRuntimeSession,
  selectSpatialRuntimePlaybackPath,
  setSpatialRuntimeCamera,
  spatialRuntimeAtEnd,
  spatialRuntimeAtStart,
  spatialRuntimeGoNext,
  spatialRuntimeGoPrevious,
  type OpenSpatialRuntimeSessionOptions,
  type SpatialRuntimeSession,
} from './spatialRuntimeSession'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEFAULT_PATH_COLOR = '#64748b'
const DEFAULT_PATH_WIDTH = 2

export interface SpatialAudioChangeSource {
  on<T = unknown>(eventName: string, listener: (payload: T) => void | Promise<void>): () => void
}

export interface SpatialCourseProgressSource {
  getLocations(): TeacherControllerSceneInfo[]
  getCurrentLocationId(): string | null
  getStateLabel?(): string | null
}

export function createSpatialPlayerSessionSources(input: {
  audioChangeSource?: SpatialAudioChangeSource
  courseProgressSource?: SpatialCourseProgressSource
}): Pick<SpatialSurfaceHostOptions, 'audioChangeSource' | 'courseProgressSource'> {
  return {
    audioChangeSource: input.audioChangeSource,
    courseProgressSource: input.courseProgressSource,
  }
}

export interface SpatialSurfaceHostOptions {
  playbackControls?: 'canvas' | 'none'
  initialMuted?: boolean
  playbackPathId?: string | null
  locationId?: string
  audioChangeSource?: SpatialAudioChangeSource
  courseProgressSource?: SpatialCourseProgressSource
  resolveAsset?: (assetId: string) => string | undefined
  executeTeacherControllerAction?: (
    action: TeacherControllerAction,
    item: PublishedNativeLayerItem,
  ) => boolean | void | Promise<boolean | void>
}

type TeacherControllerNativeItem = PublishedNativeLayerItem & {
  content: Extract<PublishedNativeLayerItem['content'], { nativeType: 'teacher-controller' }>
}

interface SpatialHostRecord {
  entry: SpatialPlaybackEntry
  wrapper: HTMLElement | SVGGElement
  controllerDom: TeacherControllerDom | null
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(value)
    ? value
    : fallback
}

function nativeLabel(item: PublishedLayerItem): string {
  if (item.kind === 'native' && item.content.nativeType === 'text') return item.content.data.text
  if (item.kind === 'native' && item.content.nativeType === 'teacher-controller') {
    return item.content.data.title
  }
  if (item.kind === 'component') return item.component.packageId
  if (item.kind === 'runtime') return 'runtime'
  return item.kind
}

function pathDashArray(dash: SpatialPathDash | undefined): string | undefined {
  if (dash === 'dashed') return '8 6'
  if (dash === 'dotted') return '2 5'
  return undefined
}

function layerCenter(item: PublishedLayerItem): { x: number; y: number } {
  return {
    x: item.frame.x + item.frame.width / 2,
    y: item.frame.y + item.frame.height / 2,
  }
}

function createWorldItem(dom: Document, item: PublishedLayerItem, resolveAsset: (assetId: string) => string | undefined): SVGGElement {
  const group = dom.createElementNS(SVG_NS, 'g')
  const { frame } = item
  if (item.kind === 'native' && item.content.nativeType === 'image') {
    const image = dom.createElementNS(SVG_NS, 'image')
    image.setAttribute('href', resolveAsset(item.content.data.assetId) ?? '')
    image.setAttribute('x', String(frame.x))
    image.setAttribute('y', String(frame.y))
    image.setAttribute('width', String(frame.width))
    image.setAttribute('height', String(frame.height))
    image.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    group.appendChild(image)
  } else if (item.kind === 'native' && item.content.nativeType === 'text') {
    const text = dom.createElementNS(SVG_NS, 'text')
    text.textContent = item.content.data.text
    text.setAttribute('x', String(frame.x + Math.max(0, item.content.data.style.padding)))
    text.setAttribute('y', String(frame.y + Math.max(item.content.data.style.fontSize, 16)))
    text.setAttribute('fill', safeColor(item.content.data.style.color, '#172033'))
    text.setAttribute('font-size', String(item.content.data.style.fontSize))
    text.setAttribute('font-family', item.content.data.style.fontFamily)
    group.appendChild(text)
  } else if (item.kind === 'native' && item.content.nativeType === 'shape') {
    const rect = dom.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(frame.x))
    rect.setAttribute('y', String(frame.y))
    rect.setAttribute('width', String(frame.width))
    rect.setAttribute('height', String(frame.height))
    rect.setAttribute('fill', safeColor(item.content.data.style.fillColor, '#e2e8f0'))
    rect.setAttribute('stroke', safeColor(item.content.data.style.borderColor, '#64748b'))
    group.appendChild(rect)
  } else {
    const rect = dom.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(frame.x))
    rect.setAttribute('y', String(frame.y))
    rect.setAttribute('width', String(frame.width))
    rect.setAttribute('height', String(frame.height))
    rect.setAttribute('fill', item.kind === 'component' ? '#eff6ff' : '#f8fafc')
    rect.setAttribute('stroke', '#64748b')
    group.appendChild(rect)
    const text = dom.createElementNS(SVG_NS, 'text')
    text.textContent = nativeLabel(item)
    text.setAttribute('x', String(frame.x + frame.width / 2))
    text.setAttribute('y', String(frame.y + frame.height / 2))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'middle')
    text.setAttribute('fill', '#172033')
    group.appendChild(text)
  }
  group.setAttribute('opacity', String(item.opacity))
  if (item.rotation !== 0) {
    group.setAttribute(
      'transform',
      `rotate(${item.rotation} ${frame.x + frame.width / 2} ${frame.y + frame.height / 2})`,
    )
  }
  return group
}

function createViewportHud(dom: Document, item: PublishedLayerItem): HTMLElement {
  const root = dom.createElement('div')
  root.className = 'spatial-viewport-hud'
  Object.assign(root.style, {
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    color: '#172033',
    background: '#ffffff',
    border: '1px solid #cbd5e1',
    padding: '8px',
  })
  root.textContent = nativeLabel(item)
  return root
}

/**
 * Independent Spatial Player host. Reads Published Course V2 world/camera/path/relation
 * fields. Runtime camera is session-only and never writes the published document.
 * Global HUD, teacher controller, audio chrome and course UI stay on the viewport.
 */
export class SpatialSurfaceHost {
  readonly kind = 'spatial-2d' as const
  readonly id: string
  #session: SpatialRuntimeSession
  #options: SpatialSurfaceHostOptions
  #root: HTMLElement | null = null
  #svg: SVGSVGElement | null = null
  #world: SVGGElement | null = null
  #screenLayer: HTMLElement | null = null
  #records = new Map<string, SpatialHostRecord>()
  #controllerSession = new Map<string, TeacherControllerDomSession>()
  #muted: boolean
  #audioDisposer: (() => void) | null = null
  #destroyed = false

  static fromPublishedCourse(
    course: PublishedCourseV2Payload,
    viewport: SpatialRuntimeViewport,
    options: SpatialSurfaceHostOptions & OpenSpatialRuntimeSessionOptions = {},
  ): SpatialSurfaceHost {
    return new SpatialSurfaceHost(
      publishedSpatialInputFromCourse(course, {
        surfaceId: options.surfaceId,
        playbackPathId: options.playbackPathId ?? null,
      }),
      viewport,
      options,
    )
  }

  constructor(
    source: PublishedCourseV2Payload | PublishedSpatialRuntimeInput,
    viewport: SpatialRuntimeViewport,
    options: SpatialSurfaceHostOptions & OpenSpatialRuntimeSessionOptions = {},
  ) {
    this.#options = options
    this.#session = openSpatialRuntimeSession(source, viewport, {
      surfaceId: options.surfaceId,
      playbackPathId: options.playbackPathId ?? (
        'playbackPathId' in source ? source.playbackPathId : null
      ),
      locationId: options.locationId,
    })
    this.id = this.#session.input.surface.id
    this.#muted = options.initialMuted ?? false
  }

  get camera(): SpatialRuntimeCamera | null {
    return this.#session.camera ? { ...this.#session.camera } : null
  }

  get locationId(): string {
    return this.#session.locationId
  }

  get playbackPathId(): string | null {
    return this.#session.playbackPathId
  }

  get atTourStart(): boolean {
    return spatialRuntimeAtStart(this.#session)
  }

  get atTourEnd(): boolean {
    return spatialRuntimeAtEnd(this.#session)
  }

  get rootElement(): HTMLElement | null {
    return this.#root
  }

  publishedCameraSnapshot() {
    return publishedCameraSnapshot(this.#session.input.surface)
  }

  publishedPaths() {
    return publishedSpatialPaths(this.#session.input.surface)
  }

  publishedRelations() {
    return publishedSpatialRelations(this.#session.input.surface)
  }

  getRenderedStageBounds(): { width: number; height: number } {
    const camera = this.#session.camera
    const fallback = {
      width: camera?.viewportWidth ?? this.#session.viewport.width,
      height: camera?.viewportHeight ?? this.#session.viewport.height,
    }
    const root = this.#root
    if (!root) return fallback
    const rect = root.getBoundingClientRect()
    return {
      width: rect.width > 0 ? rect.width : fallback.width,
      height: rect.height > 0 ? rect.height : fallback.height,
    }
  }

  async mount(container: HTMLElement): Promise<void> {
    if (this.#destroyed) throw new Error('Cannot mount a destroyed Spatial surface')
    if (this.#root) throw new Error('Spatial surface is already mounted')
    const camera = this.#requireCamera()
    const dom = container.ownerDocument
    const root = dom.createElement('section')
    root.className = 'spatial-surface'
    root.dataset.surfaceId = this.id
    root.dataset.spatialViewportWidth = String(camera.viewportWidth)
    root.dataset.spatialViewportHeight = String(camera.viewportHeight)
    root.dataset.worldBoundsMode = this.#session.input.surface.world.bounds.mode
    root.tabIndex = 0
    root.setAttribute('role', 'region')
    root.setAttribute('aria-label', `${this.#session.input.surface.title} 空间探索`)
    Object.assign(root.style, {
      position: 'relative',
      width: `${camera.viewportWidth}px`,
      height: `${camera.viewportHeight}px`,
      overflow: 'hidden',
      isolation: 'isolate',
    })
    const svg = dom.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('width', String(camera.viewportWidth))
    svg.setAttribute('height', String(camera.viewportHeight))
    svg.setAttribute('viewBox', `0 0 ${camera.viewportWidth} ${camera.viewportHeight}`)
    svg.setAttribute('aria-label', this.#session.input.surface.title)
    svg.dataset.spatialWorldCanvas = 'true'
    const world = dom.createElementNS(SVG_NS, 'g')
    world.dataset.spatialWorld = 'true'
    world.dataset.coordinateSpace = 'world'
    svg.appendChild(world)
    root.appendChild(svg)
    const screenLayer = dom.createElement('div')
    screenLayer.className = 'spatial-screen-layer'
    screenLayer.dataset.coordinateSpace = 'viewport'
    screenLayer.dataset.spatialChrome = 'viewport'
    Object.assign(screenLayer.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'visible',
      pointerEvents: 'none',
    })
    root.appendChild(screenLayer)
    container.appendChild(root)
    this.#root = root
    this.#svg = svg
    this.#world = world
    this.#screenLayer = screenLayer
    this.#subscribeAudio()
    this.#renderWorldDecorations()
    this.#updateWorldTransform()
    this.#reconcileRecords()
  }

  async activate(): Promise<void> {
    if (!this.#session.active) {
      this.#session = reopenSpatialRuntimeSession(this.#session)
    }
    if (this.#root) this.#root.hidden = false
    this.#updateWorldTransform()
    this.#reconcileRecords()
  }

  async suspend(): Promise<void> {
    this.#session = leaveSpatialRuntimeLocation(this.#session)
    if (this.#root) this.#root.hidden = true
  }

  async resume(): Promise<void> {
    this.#session = reopenSpatialRuntimeSession(this.#session)
    if (this.#root) this.#root.hidden = false
    this.#updateWorldTransform()
    this.#reconcileRecords()
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#audioDisposer?.()
    this.#audioDisposer = null
    for (const record of this.#records.values()) record.controllerDom?.destroy()
    this.#records.clear()
    this.#controllerSession.clear()
    this.#root?.remove()
    this.#root = null
    this.#svg = null
    this.#world = null
    this.#screenLayer = null
    this.#session = leaveSpatialRuntimeLocation(this.#session)
  }

  async goNext(): Promise<{ atBoundary: boolean }> {
    const result = spatialRuntimeGoNext(this.#session)
    this.#session = result.session
    this.#updateWorldTransform()
    this.#reconcileRecords()
    this.#refreshControllers()
    return { atBoundary: result.atBoundary }
  }

  async goPrevious(): Promise<{ atBoundary: boolean }> {
    const result = spatialRuntimeGoPrevious(this.#session)
    this.#session = result.session
    this.#updateWorldTransform()
    this.#reconcileRecords()
    this.#refreshControllers()
    return { atBoundary: result.atBoundary }
  }

  async setLocationId(locationId: string): Promise<void> {
    this.#session = enterSpatialRuntimeLocation(this.#session, locationId)
    this.#updateWorldTransform()
    this.#reconcileRecords()
    this.#refreshControllers()
  }

  async setPlaybackPath(playbackPathId: string | null): Promise<void> {
    this.#session = selectSpatialRuntimePlaybackPath(this.#session, playbackPathId)
    this.#updateWorldTransform()
    this.#reconcileRecords()
  }

  async setRuntimeCamera(camera: SpatialRuntimeCamera): Promise<void> {
    this.#session = setSpatialRuntimeCamera(this.#session, camera)
    this.#updateWorldTransform()
    this.#reconcileWorldVisibility()
  }

  #requireCamera(): SpatialRuntimeCamera {
    if (!this.#session.camera) {
      throw new Error('Spatial runtime camera is not active')
    }
    return this.#session.camera
  }

  #resolveAsset = (assetId: string): string | undefined => this.#options.resolveAsset?.(assetId)

  #updateWorldTransform(): void {
    if (!this.#world || !this.#svg || !this.#root || !this.#session.camera) return
    const camera = this.#session.camera
    this.#world.setAttribute('transform', spatialWorldGroupTransform(camera))
    this.#svg.setAttribute('width', String(camera.viewportWidth))
    this.#svg.setAttribute('height', String(camera.viewportHeight))
    this.#svg.setAttribute('viewBox', `0 0 ${camera.viewportWidth} ${camera.viewportHeight}`)
    this.#root.style.width = `${camera.viewportWidth}px`
    this.#root.style.height = `${camera.viewportHeight}px`
  }

  #renderWorldDecorations(): void {
    if (!this.#world) return
    const existing = this.#world.querySelector('[data-spatial-paths-relations]')
    existing?.remove()
    const surface = this.#session.input.surface
    const items = new Map(surface.world.layerItems.map((item) => [item.layerItemId, item]))
    const dom = this.#world.ownerDocument
    const group = dom.createElementNS(SVG_NS, 'g')
    group.dataset.spatialPathsRelations = 'true'
    group.style.pointerEvents = 'none'
    for (const path of publishedSpatialPaths(surface)) {
      const points = path.layerItemIds
        .map((id) => items.get(id))
        .filter((item): item is PublishedLayerItem => Boolean(item))
        .map(layerCenter)
      if (points.length === 0) continue
      const polyline = dom.createElementNS(SVG_NS, 'polyline')
      polyline.dataset.spatialPathId = path.id
      polyline.setAttribute('fill', 'none')
      polyline.setAttribute('stroke', safeColor(path.style?.color, DEFAULT_PATH_COLOR))
      polyline.setAttribute('stroke-width', String(Math.max(0.5, path.style?.width ?? DEFAULT_PATH_WIDTH)))
      polyline.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' '))
      const dash = pathDashArray(path.style?.dash)
      if (dash) polyline.setAttribute('stroke-dasharray', dash)
      group.appendChild(polyline)
    }
    for (const relation of publishedSpatialRelations(surface)) {
      const source = items.get(relation.sourceLayerItemId)
      const target = items.get(relation.targetLayerItemId)
      if (!source || !target) continue
      const from = layerCenter(source)
      const to = layerCenter(target)
      const line = dom.createElementNS(SVG_NS, 'line')
      line.dataset.spatialRelationId = relation.id
      line.setAttribute('x1', String(from.x))
      line.setAttribute('y1', String(from.y))
      line.setAttribute('x2', String(to.x))
      line.setAttribute('y2', String(to.y))
      line.setAttribute('stroke', DEFAULT_PATH_COLOR)
      line.setAttribute('stroke-width', String(DEFAULT_PATH_WIDTH))
      group.appendChild(line)
      if (relation.label) {
        const text = dom.createElementNS(SVG_NS, 'text')
        text.dataset.spatialRelationLabel = relation.id
        text.setAttribute('x', String((from.x + to.x) / 2))
        text.setAttribute('y', String((from.y + to.y) / 2))
        text.setAttribute('fill', '#334155')
        text.setAttribute('font-size', '12')
        text.setAttribute('text-anchor', 'middle')
        text.textContent = relation.label
        group.appendChild(text)
      }
    }
    if (group.childNodes.length > 0) this.#world.insertBefore(group, this.#world.firstChild)
  }

  #reconcileRecords(): void {
    if (!this.#world || !this.#screenLayer) return
    const entries = collectSpatialPlaybackEntries(this.#session.input, this.#session.locationId)
    const nextIds = new Set(entries.map((entry) => entry.item.layerItemId))
    for (const [id, record] of [...this.#records.entries()]) {
      if (nextIds.has(id)) continue
      record.controllerDom?.destroy()
      record.wrapper.remove()
      this.#records.delete(id)
    }
    for (const entry of entries) {
      let record = this.#records.get(entry.item.layerItemId)
      if (!record) {
        record = this.#createRecord(entry)
        this.#records.set(entry.item.layerItemId, record)
      } else {
        record.entry = entry
      }
      this.#applyRecord(record)
    }
    this.#reconcileWorldVisibility()
  }

  #reconcileWorldVisibility(): void {
    if (!this.#world || !this.#screenLayer || !this.#session.camera) return
    const camera = this.#session.camera
    const rules = this.#session.input.surface.semanticZoom
    for (const record of this.#records.values()) {
      const { item, source, coordinateSpace } = record.entry
      if (coordinateSpace === 'viewport') {
        if (!this.#screenLayer.contains(record.wrapper)) this.#screenLayer.appendChild(record.wrapper)
        continue
      }
      const visible = worldItemVisibleInRuntimeCamera(item, camera, rules) || source === 'surface'
      if (visible) {
        if (!this.#world.contains(record.wrapper)) this.#world.appendChild(record.wrapper)
        record.wrapper.removeAttribute('display')
      } else {
        record.wrapper.remove()
      }
    }
  }

  #createRecord(entry: SpatialPlaybackEntry): SpatialHostRecord {
    const dom = this.#world!.ownerDocument
    const viewport = isSpatialViewportPlaybackItem(entry.source, entry.item)
    if (viewport) {
      const wrapper = dom.createElement('div')
      wrapper.className = 'spatial-viewport-item'
      wrapper.dataset.spatialLayerRecord = 'true'
      wrapper.dataset.layerItemId = entry.item.layerItemId
      wrapper.dataset.layerKind = entry.item.kind
      wrapper.dataset.layerSource = entry.source
      wrapper.dataset.coordinateSpace = 'viewport'
      Object.assign(wrapper.style, {
        position: 'absolute',
        boxSizing: 'border-box',
        overflow: 'hidden',
        pointerEvents: 'auto',
      })
      let controllerDom: TeacherControllerDom | null = null
      if (isSpatialTeacherControllerItem(entry.item)) {
        const content = dom.createElement('div')
        content.className = 'spatial-screen-teacher-controller-content'
        Object.assign(content.style, {
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
        })
        wrapper.classList.add('spatial-screen-teacher-controller')
        wrapper.appendChild(content)
        controllerDom = this.#mountTeacherController(entry.item, content)
      } else {
        wrapper.appendChild(createViewportHud(dom, entry.item))
      }
      return { entry, wrapper, controllerDom }
    }
    const wrapper = createWorldItem(dom, entry.item, this.#resolveAsset)
    wrapper.dataset.spatialLayerRecord = 'true'
    wrapper.dataset.layerItemId = entry.item.layerItemId
    wrapper.dataset.layerKind = entry.item.kind
    wrapper.dataset.layerSource = entry.source
    wrapper.dataset.coordinateSpace = 'world'
    return { entry, wrapper, controllerDom: null }
  }

  #applyRecord(record: SpatialHostRecord): void {
    const { item, source } = record.entry
    record.wrapper.dataset.layerItemId = item.layerItemId
    record.wrapper.dataset.layerSource = source
    if (!isSpatialViewportPlaybackItem(source, item)) return
    const html = record.wrapper as HTMLElement
    const session = this.#controllerSessionFor(item)
    const offset = session?.offset ?? { dx: 0, dy: 0 }
    html.style.left = `${item.frame.x + offset.dx}px`
    html.style.top = `${item.frame.y + offset.dy}px`
    html.style.width = `${item.frame.width}px`
    html.style.height = `${item.frame.height}px`
    html.style.opacity = String(item.opacity)
    html.style.transform = item.rotation === 0 ? '' : `rotate(${item.rotation}deg)`
    html.style.zIndex = String(item.order)
    if (isSpatialTeacherControllerItem(item)) {
      html.hidden = (this.#options.playbackControls ?? 'canvas') === 'none'
    }
  }

  #controllerSessionFor(item: PublishedLayerItem): TeacherControllerDomSession | undefined {
    if (!isSpatialTeacherControllerItem(item)) return undefined
    const existing = this.#controllerSession.get(item.layerItemId)
    if (existing) return existing
    const session: TeacherControllerDomSession = {
      offset: { dx: 0, dy: 0 },
      collapsed: item.content.data.collapsible && item.content.data.defaultCollapsed,
    }
    this.#controllerSession.set(item.layerItemId, session)
    return session
  }

  #mountTeacherController(
    item: TeacherControllerNativeItem,
    container: HTMLElement,
  ): TeacherControllerDom {
    const node = teacherControllerDomNode(item.frame, item.rotation, item.content.data)
    return new TeacherControllerDom({
      node,
      container,
      canvas: {
        width: this.#session.viewport.width,
        height: this.#session.viewport.height,
      },
      getRenderedStageBounds: () => this.getRenderedStageBounds(),
      scenes: this.#progressLocations(),
      getCurrentSceneId: () => this.#currentProgressId(),
      getStateLabel: () => this.#options.courseProgressSource?.getStateLabel?.() ?? null,
      getStatus: () => ({
        muted: this.#muted,
        fullscreen: Boolean(this.#root?.ownerDocument.fullscreenElement),
      }),
      getSession: () => this.#controllerSessionFor(item) ?? { offset: { dx: 0, dy: 0 }, collapsed: false },
      onSessionChange: (next) => {
        this.#controllerSession.set(item.layerItemId, {
          offset: { ...next.offset },
          collapsed: next.collapsed,
        })
        const record = this.#records.get(item.layerItemId)
        if (record) this.#applyRecord(record)
      },
      onAction: (action) => {
        void this.#handleTeacherControllerAction(action, item)
      },
      getInteractive: () => this.#session.active && (this.#options.playbackControls ?? 'canvas') === 'canvas',
    })
  }

  #progressLocations(): TeacherControllerSceneInfo[] {
    if (this.#options.courseProgressSource) return this.#options.courseProgressSource.getLocations()
    return this.#session.input.locations.map((location) => ({
      id: location.id,
      name: location.label,
    }))
  }

  #currentProgressId(): string | null {
    if (this.#options.courseProgressSource) {
      return this.#options.courseProgressSource.getCurrentLocationId()
    }
    return this.#session.locationId
  }

  #refreshControllers(): void {
    for (const record of this.#records.values()) {
      if (!record.controllerDom || !isSpatialTeacherControllerItem(record.entry.item)) continue
      record.controllerDom.update(teacherControllerDomNode(
        record.entry.item.frame,
        record.entry.item.rotation,
        record.entry.item.content.data,
      ))
    }
  }

  #subscribeAudio(): void {
    this.#audioDisposer?.()
    this.#audioDisposer = null
    const source = this.#options.audioChangeSource
    if (!source) return
    this.#audioDisposer = source.on<{ muted?: boolean }>('audio:change', (event) => {
      if (typeof event?.muted !== 'boolean') return
      this.#muted = event.muted
      this.#refreshControllers()
    })
  }

  async #handleTeacherControllerAction(
    action: TeacherControllerAction,
    item: PublishedNativeLayerItem,
  ): Promise<void> {
    if (this.#options.executeTeacherControllerAction) {
      await this.#options.executeTeacherControllerAction(action, item)
    } else if (action.type === 'scene.next') {
      await this.goNext()
    } else if (action.type === 'scene.previous') {
      await this.goPrevious()
    } else if (action.type === 'scene.replay') {
      this.#session = reopenSpatialRuntimeSession(this.#session)
      this.#updateWorldTransform()
      this.#reconcileRecords()
    } else if (action.type === 'audio.toggle-mute') {
      this.#muted = !this.#muted
      this.#refreshControllers()
    }
    const CustomEventConstructor = this.#root?.ownerDocument.defaultView?.CustomEvent
    if (!CustomEventConstructor || !this.#root) return
    this.#root.dispatchEvent(new CustomEventConstructor('courseware:teacher-controller-action', {
      detail: action,
    }))
  }
}

export type { PublishedSpatialRuntimeInput, SpatialRuntimeCamera } from './spatialModel'
export {
  publishedSpatialInputFromCourse,
  spatialWorldGroupTransform,
} from './spatialModel'
export {
  openSpatialRuntimeSession,
  spatialRuntimeGoNext,
  spatialRuntimeGoPrevious,
  enterSpatialRuntimeLocation,
  leaveSpatialRuntimeLocation,
  reopenSpatialRuntimeSession,
} from './spatialRuntimeSession'
