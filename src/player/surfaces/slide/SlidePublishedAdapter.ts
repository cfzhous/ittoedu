import { isGlobalLayerItemVisible } from '../../globalLayerVisibility'
import type {
  CourseLocation,
  NativeElementContent,
} from '../../../shared/courseProjectTypes'
import type { TeacherControllerAction } from '../../../shared/projectTypes'
import type {
  PublishedCourseV2Payload,
  PublishedLayerItem,
  PublishedNativeLayerItem,
  PublishedScopedLayerItem,
  PublishedSlideScene,
  PublishedSlideSurface,
} from '../../../shared/publishedCourseTypes'
import { buildMixedDeepLink } from '../mixed/MixedCourseNavigator'
import type {
  SurfaceCapture,
  SurfaceCaptureRequest,
  SurfaceHost,
  SurfaceMountContext,
  SurfacePlayerServices,
  SurfaceResetScope,
} from '../SurfaceHost'
import {
  TeacherControllerDom,
  teacherControllerDomNode,
  type TeacherControllerDomSession,
} from '../../teacherControllerDom'
import {
  mountPublishedComponent,
  type PublishedComponentMountHandle,
} from '../publishedComponentMount'

function clonePayload(payload: PublishedCourseV2Payload): PublishedCourseV2Payload {
  return structuredClone(payload)
}

function isScopedVisible(entry: PublishedScopedLayerItem, locationId: string): boolean {
  return isGlobalLayerItemVisible(
    { visibility: { mode: entry.visibility.mode, sceneIds: entry.visibility.locationIds } },
    locationId,
  )
}

function findSlideSurface(
  payload: PublishedCourseV2Payload,
  surfaceId: string,
): PublishedSlideSurface {
  const surface = payload.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'slide') {
    throw new Error(`找不到 Slide 表面：${surfaceId}`)
  }
  return surface
}

function firstSlideLocationId(payload: PublishedCourseV2Payload, surfaceId: string): string {
  const match = payload.locations.find((location) => (
    location.kind === 'slide-scene' && location.surfaceId === surfaceId
  ))
  if (match) return match.id
  const surface = findSlideSurface(payload, surfaceId)
  const scene = surface.scenes[0]
  if (!scene) throw new Error(`Slide 表面没有场景：${surfaceId}`)
  return scene.id
}

function resolveSlideLocation(
  payload: PublishedCourseV2Payload,
  surfaceId: string,
  locationId: string,
): Extract<CourseLocation, { kind: 'slide-scene' }> {
  const location = payload.locations.find((candidate) => candidate.id === locationId)
  if (location?.kind === 'slide-scene' && location.surfaceId === surfaceId) return location
  const surface = findSlideSurface(payload, surfaceId)
  const scene = surface.scenes.find((candidate) => candidate.id === locationId)
  if (scene) {
    return {
      id: locationId,
      label: scene.name,
      kind: 'slide-scene',
      surfaceId,
      sceneId: scene.id,
    }
  }
  throw new Error(`找不到 Slide 位置：${locationId}`)
}

function firstKeyedString(value: unknown, keys: readonly string[]): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const direct = record[key]
    if (typeof direct === 'string' && direct.trim()) return direct.trim()
  }
  for (const nested of Object.values(record)) {
    const found = firstKeyedString(nested, keys)
    if (found) return found
  }
  return undefined
}

function firstAnyString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (!value || typeof value !== 'object') return undefined
  const nestedValues = Array.isArray(value) ? value : Object.values(value)
  for (const nested of nestedValues) {
    const found = firstAnyString(nested)
    if (found) return found
  }
  return undefined
}

function firstVisibleText(value: unknown): string | undefined {
  return firstKeyedString(value, ['title', 'label', 'text', 'heading', 'name'])
    ?? firstAnyString(value)
}

function appendFallbackImage(wrap: HTMLElement, url: string, alt: string): void {
  const image = wrap.ownerDocument.createElement('img')
  image.src = url
  image.alt = alt
  image.style.width = '100%'
  image.style.height = '100%'
  image.style.objectFit = 'contain'
  wrap.appendChild(image)
}

function applyNativeTextStyle(
  wrap: HTMLElement,
  data: Extract<NativeElementContent, { nativeType: 'text' }>['data'],
): void {
  const style = data.style
  const decorations: string[] = []
  if (style.underline) decorations.push('underline')
  if (style.strike) decorations.push('line-through')
  wrap.style.boxSizing = 'border-box'
  wrap.style.overflow = 'hidden'
  wrap.style.whiteSpace = 'pre-wrap'
  wrap.style.fontFamily = style.fontFamily || '"Microsoft YaHei", sans-serif'
  wrap.style.fontSize = `${Math.max(1, style.fontSize)}px`
  wrap.style.fontWeight = style.bold ? '700' : '400'
  wrap.style.fontStyle = style.italic ? 'italic' : 'normal'
  wrap.style.color = style.color || '#1f2937'
  wrap.style.textAlign = style.align
  wrap.style.lineHeight = `${Math.max(1, style.fontSize + style.lineSpacing)}px`
  wrap.style.letterSpacing = `${style.letterSpacing}px`
  wrap.style.padding = `${Math.max(0, style.padding)}px`
  wrap.style.textDecoration = decorations.join(' ') || 'none'
  wrap.style.writingMode = style.writingMode === 'horizontal' ? 'horizontal-tb' : style.writingMode
  wrap.textContent = data.text
}

function applyVisibleTextFallback(wrap: HTMLElement, text: string): void {
  wrap.style.boxSizing = 'border-box'
  wrap.style.display = 'flex'
  wrap.style.alignItems = 'center'
  wrap.style.justifyContent = 'center'
  wrap.style.padding = '12px 16px'
  wrap.style.overflow = 'hidden'
  wrap.style.background = '#0f766e'
  wrap.style.color = '#ffffff'
  wrap.style.font = 'bold 22px "Microsoft YaHei", sans-serif'
  wrap.textContent = text
}

function isPublishedTeacherController(
  item: PublishedLayerItem,
): item is PublishedNativeLayerItem & {
  content: Extract<PublishedNativeLayerItem['content'], { nativeType: 'teacher-controller' }>
} {
  return item.kind === 'native' && item.content.nativeType === 'teacher-controller'
}

function isPublishedInteractiveLayer(item: PublishedLayerItem): boolean {
  return isPublishedTeacherController(item)
    || (item.kind === 'native' && item.content.nativeType === 'video')
}

function appendLayerNode(
  dom: Document,
  parent: HTMLElement,
  item: PublishedLayerItem,
  source: 'scene' | 'surface' | 'global',
  resolveAsset: (assetId: string) => string | undefined,
  mountTeacherController?: (wrap: HTMLElement, item: PublishedNativeLayerItem) => void,
  options?: {
    components?: PublishedCourseV2Payload['components']
    interactive?: boolean
    mountComponent?: (handle: PublishedComponentMountHandle) => void
  },
): void {
  if (!item.visible || item.playbackInitialVisibility === 'hidden') return
  const wrap = dom.createElement('div')
  wrap.dataset.slideLayerItem = item.layerItemId
  wrap.dataset.layerSource = source
  if (source === 'global') wrap.dataset.globalLayerItem = item.layerItemId
  if (source !== 'scene') wrap.dataset.slideOverlayItem = item.layerItemId
  wrap.style.position = 'absolute'
  wrap.style.left = `${item.frame.x}px`
  wrap.style.top = `${item.frame.y}px`
  wrap.style.width = `${item.frame.width}px`
  wrap.style.height = `${item.frame.height}px`
  wrap.style.opacity = String(item.opacity)
  wrap.style.pointerEvents = isPublishedInteractiveLayer(item) || item.kind === 'component' ? 'auto' : 'none'
  wrap.style.zIndex = String(item.order)
  if (item.kind === 'native') wrap.dataset.nativeType = item.content.nativeType
  if (isPublishedTeacherController(item)) {
    mountTeacherController?.(wrap, item)
  } else if (item.kind === 'native' && item.content.nativeType === 'text') {
    applyNativeTextStyle(wrap, item.content.data)
  } else if (item.kind === 'native' && item.content.nativeType === 'video') {
    const url = resolveAsset(item.content.data.assetId)
    if (url) {
      const video = dom.createElement('video')
      video.controls = true
      video.src = url
      video.style.width = '100%'
      video.style.height = '100%'
      video.style.objectFit = 'contain'
      video.style.pointerEvents = 'auto'
      wrap.appendChild(video)
    }
  } else if (item.kind === 'native' && item.content.nativeType === 'formula') {
    const data = item.content.data
    wrap.style.boxSizing = 'border-box'
    wrap.style.overflow = 'hidden'
    wrap.style.whiteSpace = 'pre-wrap'
    wrap.style.fontFamily = '"Times New Roman", serif'
    wrap.style.fontSize = `${Math.max(1, data.style.fontSize)}px`
    wrap.style.color = data.style.color || '#1f2937'
    wrap.style.textAlign = data.style.align
    wrap.textContent = data.accessibleText || '公式'
  } else if (item.kind === 'native' && item.content.nativeType === 'image') {
    const url = resolveAsset(item.content.data.assetId)
    if (url) {
      const image = dom.createElement('img')
      image.src = url
      image.alt = ''
      image.style.width = '100%'
      image.style.height = '100%'
      image.style.objectFit = 'contain'
      wrap.appendChild(image)
    }
  } else if (item.kind === 'component') {
    wrap.dataset.slideFallbackKind = 'component'
    const handle = mountPublishedComponent(wrap, {
      container: wrap,
      componentId: item.component.packageId,
      version: item.component.version,
      instanceId: item.layerItemId,
      width: item.frame.width,
      height: item.frame.height,
      props: item.props,
      staticFallbackAssetId: item.staticFallbackAssetId,
      components: options?.components,
      resolveAsset,
      interactive: options?.interactive ?? true,
    })
    options?.mountComponent?.(handle)
  } else if (item.kind === 'runtime') {
    wrap.dataset.slideFallbackKind = 'runtime'
    const url = item.runtime.staticFallback
      ? resolveAsset(item.runtime.staticFallback.assetId)
      : undefined
    if (url) {
      appendFallbackImage(wrap, url, 'runtime 后备')
    } else {
      applyVisibleTextFallback(
        wrap,
        firstVisibleText(item.runtime.content.values) ?? item.runtime.protocol,
      )
    }
  } else {
    wrap.dataset.slideFallbackKind = item.kind
  }
  parent.appendChild(wrap)
}

/**
 * Minimal Published Course V2 Slide adapter. It is not PlayerApp and does not
 * project Flow/Spatial through buildStandaloneHtml.
 */
export class SlidePublishedAdapter implements SurfaceHost {
  readonly kind = 'slide' as const
  readonly id: string
  readonly #payload: PublishedCourseV2Payload
  readonly #startLocationId: string
  readonly #resolveAsset: (assetId: string) => string | undefined
  #locationId: string
  #root: HTMLElement | null = null
  #active = false
  #services: SurfacePlayerServices | null = null
  #controllers: TeacherControllerDom[] = []
  #componentHandles: PublishedComponentMountHandle[] = []
  #controllerSessions = new Map<string, TeacherControllerDomSession>()
  #muted = false

  constructor(
    payload: PublishedCourseV2Payload,
    surfaceId: string,
    options: {
      locationId?: string
      resolveAsset?: (assetId: string) => string | undefined
    } = {},
  ) {
    this.#payload = clonePayload(payload)
    this.id = surfaceId
    findSlideSurface(this.#payload, surfaceId)
    this.#startLocationId = options.locationId
      ?? firstSlideLocationId(this.#payload, surfaceId)
    this.#locationId = this.#startLocationId
    this.#resolveAsset = options.resolveAsset
      ?? ((assetId: string) => this.#payload.assets[assetId]?.url)
  }

  getLocationId(): string {
    return this.#locationId
  }

  async mount(context: SurfaceMountContext): Promise<void> {
    if (this.#root) throw new Error('Slide surface is already mounted')
    const root = context.container.ownerDocument.createElement('section')
    root.className = 'slide-published-adapter'
    root.dataset.surfaceId = this.id
    root.style.position = 'absolute'
    root.style.width = '1280px'
    root.style.height = '720px'
    root.style.overflow = 'hidden'
    root.style.transformOrigin = '0 0'
    root.hidden = !this.#active
    context.container.appendChild(root)
    this.#root = root
    this.#services = context.services
    this.#render()
  }

  async activate(): Promise<void> {
    this.#active = true
    if (this.#root) this.#root.hidden = false
  }

  async suspend(): Promise<void> {
    this.#active = false
    if (this.#root) this.#root.hidden = true
  }

  async resume(): Promise<void> {
    return this.activate()
  }

  async reset(_scope: SurfaceResetScope): Promise<void> {
    await this.setLocationId(this.#startLocationId)
  }

  async capture(_request: SurfaceCaptureRequest): Promise<SurfaceCapture> {
    return {
      format: 'json',
      content: JSON.stringify({
        surfaceId: this.id,
        locationId: this.#locationId,
      }),
    }
  }

  async setLocationId(locationId: string): Promise<void> {
    resolveSlideLocation(this.#payload, this.id, locationId)
    this.#locationId = locationId
    this.#render()
  }

  async destroy(): Promise<void> {
    this.#destroyComponents()
    this.#destroyControllers()
    this.#root?.remove()
    this.#root = null
    this.#active = false
    this.#services = null
  }

  #destroyComponents(): void {
    for (const handle of this.#componentHandles) {
      try {
        handle.destroy()
      } catch (error) {
        console.error('Slide component destroy failed', error)
      }
    }
    this.#componentHandles = []
  }

  #destroyControllers(): void {
    for (const controller of this.#controllers) controller.destroy()
    this.#controllers = []
  }

  #controllerSessionFor(item: PublishedLayerItem): TeacherControllerDomSession {
    const existing = this.#controllerSessions.get(item.layerItemId)
    if (existing) return existing
    const collapsed = isPublishedTeacherController(item)
      ? item.content.data.collapsible && item.content.data.defaultCollapsed
      : false
    const session: TeacherControllerDomSession = {
      offset: { dx: 0, dy: 0 },
      collapsed,
    }
    this.#controllerSessions.set(item.layerItemId, session)
    return session
  }

  #mountTeacherController(wrap: HTMLElement, item: PublishedNativeLayerItem): void {
    if (!isPublishedTeacherController(item) || this.#payload.playback.controls === 'none') return
    const root = this.#root
    if (!root) return
    const session = this.#controllerSessionFor(item)
    wrap.style.left = `${item.frame.x + session.offset.dx}px`
    wrap.style.top = `${item.frame.y + session.offset.dy}px`
    const node = teacherControllerDomNode(item.frame, item.rotation, item.content.data)
    const controller = new TeacherControllerDom({
      node,
      container: wrap,
      canvas: { width: 1280, height: 720 },
      getRenderedStageBounds: () => {
        const bounds = root.getBoundingClientRect()
        const width = bounds.width > 1 ? bounds.width : 1280
        const height = bounds.height > 1 ? bounds.height : 720
        return {
          left: bounds.width > 1 ? bounds.left : 0,
          top: bounds.height > 1 ? bounds.top : 0,
          width,
          height,
        }
      },
      scenes: this.#payload.locations.map((location) => ({
        id: location.id,
        name: location.label,
      })),
      getCurrentSceneId: () => this.#locationId,
      getStateLabel: () => null,
      getStatus: () => ({
        muted: this.#muted,
        fullscreen: Boolean(root.ownerDocument.fullscreenElement),
      }),
      getSession: () => this.#controllerSessionFor(item),
      onSessionChange: (next) => {
        this.#controllerSessions.set(item.layerItemId, next)
        wrap.style.left = `${item.frame.x + next.offset.dx}px`
        wrap.style.top = `${item.frame.y + next.offset.dy}px`
      },
      onAction: (action) => {
        void this.#handleControllerAction(action)
      },
      getInteractive: () => this.#active,
    })
    this.#controllers.push(controller)
  }

  async #handleControllerAction(action: TeacherControllerAction): Promise<void> {
    if (action.type === 'audio.toggle-mute') {
      this.#muted = !this.#muted
      for (const controller of this.#controllers) controller.refreshStatus()
      return
    }
    if (action.type === 'player.fullscreen.toggle') {
      const root = this.#root
      const dom = root?.ownerDocument
      if (!dom) return
      if (dom.fullscreenElement) await dom.exitFullscreen?.()
      else await root?.requestFullscreen?.()
      for (const controller of this.#controllers) controller.refreshStatus()
      return
    }
    const locations = this.#payload.locations
    const index = locations.findIndex((location) => location.id === this.#locationId)
    if (action.type === 'scene.next' && index >= 0 && index < locations.length - 1) {
      await this.#navigateTo(locations[index + 1]!)
      return
    }
    if (action.type === 'scene.previous' && index > 0) {
      await this.#navigateTo(locations[index - 1]!)
      return
    }
    if (action.type === 'course.restart') {
      const start = locations.find((location) => location.id === this.#payload.startLocationId)
        ?? locations[0]
      if (start) await this.#navigateTo(start)
      return
    }
    if (action.type === 'scene.replay') {
      const current = locations[index] ?? locations.find((location) => location.id === this.#locationId)
      if (current) await this.#navigateTo(current)
      return
    }
    if (action.type === 'scene.go') {
      const target = locations.find((location) => (
        location.id === action.sceneId
        || (location.kind === 'slide-scene' && location.sceneId === action.sceneId)
      ))
      if (target) await this.#navigateTo(target)
    }
  }

  async #navigateTo(location: CourseLocation): Promise<void> {
    await this.#services?.navigate(buildMixedDeepLink({
      locationId: location.id,
      surfaceId: location.surfaceId,
    }))
  }

  #render(): void {
    const root = this.#root
    if (!root) return
    this.#destroyComponents()
    this.#destroyControllers()
    const surface = findSlideSurface(this.#payload, this.id)
    const location = resolveSlideLocation(this.#payload, this.id, this.#locationId)
    const scene = sceneOf(surface, location)
    root.dataset.locationId = location.id
    root.dataset.sceneId = scene.id
    root.style.background = scene.backgroundColor
    root.replaceChildren()
    const stage = root.ownerDocument.createElement('div')
    stage.dataset.slideSceneStage = 'true'
    stage.style.position = 'absolute'
    stage.style.inset = '0'
    root.appendChild(stage)
    const mountController = (wrap: HTMLElement, item: PublishedNativeLayerItem) => {
      this.#mountTeacherController(wrap, item)
    }
    const layerOptions = {
      components: this.#payload.components,
      interactive: this.#active,
      mountComponent: (handle: PublishedComponentMountHandle) => {
        this.#componentHandles.push(handle)
      },
    }
    for (const item of scene.layerItems) {
      appendLayerNode(root.ownerDocument, stage, item, 'scene', this.#resolveAsset, mountController, layerOptions)
    }
    for (const entry of this.#payload.globalLayerItems) {
      if (!isScopedVisible(entry, location.id)) continue
      appendLayerNode(root.ownerDocument, stage, entry.item, 'global', this.#resolveAsset, mountController, layerOptions)
    }
    for (const entry of surface.surfaceLayerItems) {
      if (!isScopedVisible(entry, location.id)) continue
      appendLayerNode(root.ownerDocument, stage, entry.item, 'surface', this.#resolveAsset, mountController, layerOptions)
    }
  }
}

function sceneOf(
  surface: PublishedSlideSurface,
  location: Extract<CourseLocation, { kind: 'slide-scene' }>,
): PublishedSlideScene {
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  if (!scene) throw new Error(`找不到 Slide 场景：${location.sceneId}`)
  return scene
}
