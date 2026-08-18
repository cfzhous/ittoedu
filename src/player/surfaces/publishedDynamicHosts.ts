import type { PublishedCourseSurface, PublishedCourseV2Payload } from '../../shared/publishedCourseTypes'
import { CoursePlayer, type CoursePlayerOptions } from './CoursePlayer'
import { FlowSurfaceHost } from './flow/FlowSurfaceHost'
import {
  MixedCourseNavigator,
  mixedCourseDefinitionFromPublished,
  type MixedCatalogEntry,
  type MixedCourseProgress,
  type MixedNavigationState,
} from './mixed/MixedCourseNavigator'
import { SlidePublishedAdapter } from './slide/SlidePublishedAdapter'
import { SpatialSurfaceHost } from './spatial/SpatialSurfaceHost'
import type {
  SurfaceCapture,
  SurfaceCaptureRequest,
  SurfaceHost,
  SurfaceKind,
  SurfaceMountContext,
  SurfacePlayerServices,
  SurfaceResetScope,
} from './SurfaceHost'

export type PublishedDynamicHostKind = 'slide' | 'flow' | 'spatial'

export interface CreatePublishedDynamicHostsOptions {
  viewport?: { width: number; height: number }
  resolveAsset?: (assetId: string) => string | undefined
}

export interface PublishedCourseSessionOptions extends CreatePublishedDynamicHostsOptions {
  services?: Partial<SurfacePlayerServices>
  onFailure?: CoursePlayerOptions['onFailure']
}

/**
 * Thin factory: `slide | flow | spatial` → existing product host or the
 * minimal Slide V2 adapter. Do not copy the donor 899-line runtime/component
 * compositor, and do not import SurfaceRuntimeAuthoring.
 */
export function publishedDynamicHostKind(
  type: PublishedCourseSurface['type'],
): PublishedDynamicHostKind {
  if (type === 'spatial-2d') return 'spatial'
  return type
}

export function firstPublishedLocationId(
  payload: PublishedCourseV2Payload,
  surfaceId: string,
): string {
  const match = payload.locations.find((location) => location.surfaceId === surfaceId)
  if (match) return match.id
  throw new Error(`Published surface ${surfaceId} has no location`)
}

export function createPublishedSurfaceHost(
  payload: PublishedCourseV2Payload,
  surfaceId: string,
  options: CreatePublishedDynamicHostsOptions = {},
): SurfaceHost {
  const surface = payload.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface) throw new Error(`Unknown published surface: ${surfaceId}`)
  const startLocationId = firstPublishedLocationId(payload, surfaceId)
  const resolveAsset = options.resolveAsset
    ?? ((assetId: string) => payload.assets[assetId]?.url)
  const kind = publishedDynamicHostKind(surface.type)
  if (kind === 'slide') {
    return new SlidePublishedAdapter(payload, surface.id, {
      locationId: startLocationId,
      resolveAsset,
    })
  }
  if (kind === 'flow') {
    return new FlowPublishedAdapter(payload, surface.id, startLocationId, resolveAsset)
  }
  return new SpatialPublishedAdapter(
    payload,
    surface.id,
    startLocationId,
    options.viewport ?? { width: 1280, height: 720 },
    resolveAsset,
  )
}

export function createPublishedSurfaceHosts(
  payload: PublishedCourseV2Payload,
  options: CreatePublishedDynamicHostsOptions = {},
): SurfaceHost[] {
  return payload.surfaces.map((surface) => (
    createPublishedSurfaceHost(payload, surface.id, options)
  ))
}

function defaultCourseStateServices(
  payload: PublishedCourseV2Payload,
): SurfacePlayerServices {
  const state = new Map<string, unknown>()
  return {
    navigate: () => undefined,
    getCourseState: (key) => state.get(key),
    setCourseState: (key, value) => {
      state.set(key, value)
    },
    resolveAsset: (assetId) => payload.assets[assetId]?.url,
  }
}

/** Mixed try-run / whole-course preview session. Does not write CourseProjectDocument. */
export class PublishedCourseSession {
  readonly player: CoursePlayer
  readonly navigator: MixedCourseNavigator
  readonly #hosts: readonly SurfaceHost[]

  constructor(player: CoursePlayer, navigator: MixedCourseNavigator, hosts: readonly SurfaceHost[]) {
    this.player = player
    this.navigator = navigator
    this.#hosts = hosts
  }

  listCatalog(): MixedCatalogEntry[] {
    return this.navigator.listCatalog()
  }

  getProgress(): MixedCourseProgress {
    return this.navigator.getProgress()
  }

  next(): Promise<MixedNavigationState | null> {
    return this.navigator.next()
  }

  previous(): Promise<MixedNavigationState | null> {
    return this.navigator.previous()
  }

  goToLocation(locationId: string): Promise<MixedNavigationState> {
    return this.navigator.goToLocation(locationId)
  }

  goToIndex(index: number): Promise<MixedNavigationState> {
    return this.navigator.goToIndex(index)
  }

  async mount(container: HTMLElement): Promise<void> {
    for (const host of this.#hosts) {
      const slot = container.ownerDocument.createElement('div')
      slot.dataset.courseSurfaceSlot = host.id
      slot.style.position = 'relative'
      slot.style.height = '100%'
      container.appendChild(slot)
      const mounted = await this.player.mountSurface(host.id, slot)
      if (!mounted.ok) throw mounted.failure?.error ?? new Error(`Failed to mount ${host.id}`)
    }
    await this.navigator.start()
  }

  async destroy(): Promise<void> {
    await this.player.destroy()
  }
}

export function createPublishedCourseSession(
  payload: PublishedCourseV2Payload,
  options: PublishedCourseSessionOptions = {},
): PublishedCourseSession {
  const playback = structuredClone(payload)
  const hosts = createPublishedSurfaceHosts(playback, {
    viewport: options.viewport,
    resolveAsset: options.resolveAsset ?? options.services?.resolveAsset,
  })
  const services: SurfacePlayerServices = {
    ...defaultCourseStateServices(playback),
    ...options.services,
    resolveAsset: options.resolveAsset
      ?? options.services?.resolveAsset
      ?? ((assetId) => playback.assets[assetId]?.url),
  }
  const player = new CoursePlayer(hosts, {
    services,
    onFailure: options.onFailure,
  })
  const navigator = new MixedCourseNavigator(
    mixedCourseDefinitionFromPublished(playback),
    player,
  )
  if (!options.services?.navigate) {
    services.navigate = async (deepLink) => {
      await navigator.navigateDeepLink(deepLink)
    }
  }
  return new PublishedCourseSession(player, navigator, hosts)
}

class FlowPublishedAdapter implements SurfaceHost {
  readonly kind = 'flow' as const
  readonly id: string
  readonly #host: FlowSurfaceHost
  readonly #startLocationId: string

  constructor(
    payload: PublishedCourseV2Payload,
    surfaceId: string,
    startLocationId: string,
    resolveAsset: (assetId: string) => string | undefined,
  ) {
    this.id = surfaceId
    this.#startLocationId = startLocationId
    this.#host = new FlowSurfaceHost(payload, {
      surfaceId,
      locationId: startLocationId,
      resolveAsset,
    })
  }

  async mount(context: SurfaceMountContext): Promise<void> {
    await this.#host.mount(context.container)
  }

  async activate(): Promise<void> {
    await this.#host.activate()
  }

  async suspend(): Promise<void> {
    await this.#host.suspend()
  }

  async resume(): Promise<void> {
    await this.#host.resume()
  }

  async reset(_scope: SurfaceResetScope): Promise<void> {
    await this.#host.setLocationId(this.#startLocationId)
  }

  async capture(_request: SurfaceCaptureRequest): Promise<SurfaceCapture> {
    return {
      format: 'json',
      content: JSON.stringify({
        surfaceId: this.id,
        locationId: this.#host.locationId,
      }),
    }
  }

  async setLocationId(locationId: string): Promise<void> {
    await this.#host.setLocationId(locationId)
  }

  getLocationId(): string {
    return this.#host.locationId
  }

  async destroy(): Promise<void> {
    await this.#host.destroy()
  }
}

class SpatialPublishedAdapter implements SurfaceHost {
  readonly kind = 'spatial-2d' as const
  readonly id: string
  readonly #host: SpatialSurfaceHost
  readonly #startLocationId: string

  constructor(
    payload: PublishedCourseV2Payload,
    surfaceId: string,
    startLocationId: string,
    viewport: { width: number; height: number },
    resolveAsset: (assetId: string) => string | undefined,
  ) {
    this.id = surfaceId
    this.#startLocationId = startLocationId
    this.#host = SpatialSurfaceHost.fromPublishedCourse(payload, viewport, {
      surfaceId,
      locationId: startLocationId,
      resolveAsset,
    })
  }

  async mount(context: SurfaceMountContext): Promise<void> {
    await this.#host.mount(context.container)
    const root = this.#host.rootElement
    if (root) root.hidden = true
  }

  async activate(): Promise<void> {
    await this.#host.activate()
  }

  async suspend(): Promise<void> {
    await this.#host.suspend()
  }

  async resume(): Promise<void> {
    await this.#host.resume()
  }

  async reset(_scope: SurfaceResetScope): Promise<void> {
    await this.#host.setLocationId(this.#startLocationId)
  }

  async capture(_request: SurfaceCaptureRequest): Promise<SurfaceCapture> {
    return {
      format: 'json',
      content: JSON.stringify({
        surfaceId: this.id,
        locationId: this.#host.locationId,
      }),
    }
  }

  async setLocationId(locationId: string): Promise<void> {
    await this.#host.setLocationId(locationId)
  }

  getLocationId(): string {
    return this.#host.locationId
  }

  async destroy(): Promise<void> {
    await this.#host.destroy()
  }
}

export type { SurfaceKind }
