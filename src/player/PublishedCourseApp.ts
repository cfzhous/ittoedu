import { publishedCourseV2Schema } from '../shared/publishedCourseSchema'
import type {
  CourseLocation,
  CourseProjectDocument,
  CourseStateScalar,
  ScopedLayerItem,
  SlideSurfaceDocument,
} from '../shared/courseProjectTypes'
import type { PublishedCourseV2Payload } from '../shared/publishedCourseTypes'
import type { TeacherControllerAction } from '../shared/projectTypes'
import type { RuntimeHostActions } from '../shared/runtimeTypes'
import { CourseEventBus } from './CourseEventBus'
import { DeclarativeCourseState, type CourseNavigationEntryPoint } from './DeclarativeCourseState'
import {
  publishedCourseToPlayerDocument,
} from './publishedCourse'
import { CoursePlayer } from './surfaces/CoursePlayer'
import { FlowSurfaceHost } from './surfaces/flow/FlowSurfaceHost'
import {
  PublishedDynamicHostRegistry,
} from './surfaces/publishedDynamicHosts'
import { SlideSurfaceHost } from './surfaces/slide/SlideSurfaceHost'
import { spatialCameraFromPose } from './surfaces/spatial/spatialModel'
import { SpatialSurfaceHost } from './surfaces/spatial/SpatialSurfaceHost'
import type { SurfaceDiagnostic, SurfaceHost } from './surfaces/SurfaceHost'

export interface PublishedCourseAppOptions {
  onDiagnostic?: (diagnostic: SurfaceDiagnostic) => void
  onNavigationBlocked?: (messages: readonly string[]) => void
}

function isScalar(value: unknown): value is CourseStateScalar {
  return value === null || ['boolean', 'number', 'string'].includes(typeof value)
}

function replaceUrlLocation(locationId: string): void {
  if (typeof history === 'undefined') return
  const params = new URLSearchParams()
  params.set('location', locationId)
  history.replaceState(null, '', `#${params.toString()}`)
}

function locationFromUrl(): string | undefined {
  if (typeof location === 'undefined') return undefined
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))
  return params.get('location') ?? undefined
}

/**
 * Optional presentation state for the very first navigation only. The trial
 * run overlay uses it to enter at the author's current state; locations that
 * pin their own stateId always win over this hint.
 */
function startStateFromUrl(): string | undefined {
  if (typeof location === 'undefined') return undefined
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))
  return params.get('state') ?? undefined
}

function mergeGlobalLayers(
  surface: SlideSurfaceDocument,
  globalLayerItems: readonly ScopedLayerItem[],
): SlideSurfaceDocument {
  return {
    ...structuredClone(surface),
    // The compositor owns cross-scope ordering; its globalLayerItems option is
    // preferred when available. Keeping this function isolated avoids ever
    // mutating the Published payload.
    surfaceLayerItems: structuredClone(surface.surfaceLayerItems),
  }
}

export class PublishedCourseApp {
  readonly payload: PublishedCourseV2Payload
  readonly project: CourseProjectDocument
  readonly courseState: DeclarativeCourseState
  readonly events = new CourseEventBus()

  readonly #root: HTMLElement
  readonly #options: PublishedCourseAppOptions
  readonly #surfaceContainers = new Map<string, HTMLElement>()
  readonly #slideHosts = new Map<string, SlideSurfaceHost>()
  readonly #flowHosts = new Map<string, FlowSurfaceHost>()
  readonly #spatialHosts = new Map<string, SpatialSurfaceHost>()
  readonly #locations: CourseLocation[]
  readonly #locationMap: Map<string, CourseLocation>
  readonly #diagnostics: SurfaceDiagnostic[] = []
  readonly #dynamicHosts: PublishedDynamicHostRegistry
  readonly #player: CoursePlayer
  #currentLocationId: string | null = null
  #destroyed = false

  private constructor(
    payload: PublishedCourseV2Payload,
    root: HTMLElement,
    options: PublishedCourseAppOptions,
  ) {
    this.payload = publishedCourseV2Schema.parse(payload)
    this.project = publishedCourseToPlayerDocument(this.payload)
    this.courseState = new DeclarativeCourseState({
      projectId: this.project.id,
      projectRevision: 0,
      declarations: this.project.courseState,
      navigationGuards: this.project.navigationGuards,
      locationIds: this.project.locations.map((entry) => entry.id),
      startLocationId: this.project.startLocationId,
    })
    this.#root = root
    this.#options = options
    this.#locations = structuredClone(this.project.locations)
    this.#locationMap = new Map(this.#locations.map((entry) => [entry.id, entry]))
    this.#dynamicHosts = new PublishedDynamicHostRegistry({
      payload: this.payload,
      courseState: this.courseState,
      events: this.events,
      navigation: {
        goToScene: async (sceneId, stateId) => { await this.goToScene(sceneId, stateId, 'runtime') },
        next: async () => { await this.next('runtime') },
        previous: async () => { await this.previous('runtime') },
        replay: () => this.replay(),
        restart: () => this.restart(),
        setPresentationState: (surfaceId, stateId) => this.setPresentationState(surfaceId, stateId),
        presentationState: (surfaceId) => this.presentationState(surfaceId),
      },
      reportDiagnostic: (surfaceId, itemId, error) => this.#report({
        surfaceId,
        phase: 'mount',
        severity: 'error',
        message: `${itemId}: ${error.message}`,
        cause: error,
      }),
    })
    const hosts = this.#createHosts()
    this.#player = new CoursePlayer(hosts, {
      services: {
        navigate: async (deepLink) => { await this.navigateDeepLink(deepLink, 'runtime') },
        getCourseState: (key) => this.courseState.get(key),
        setCourseState: (key, value) => {
          if (!isScalar(value)) throw new TypeError('Published course state only accepts scalar values')
          this.courseState.set(key, value)
        },
        resolveAsset: (assetId) => this.payload.assets[assetId]?.url,
        reportDiagnostic: (diagnostic) => this.#report(diagnostic),
      },
      onFailure: (failure) => this.#report({
        surfaceId: failure.surfaceId,
        phase: failure.phase,
        severity: 'error',
        message: failure.error.message,
        cause: failure.error,
      }),
    })
  }

  static async create(
    payload: PublishedCourseV2Payload,
    root: HTMLElement,
    options: PublishedCourseAppOptions = {},
  ): Promise<PublishedCourseApp> {
    const app = new PublishedCourseApp(payload, root, options)
    await app.#mount()
    return app
  }

  get currentLocationId(): string | null { return this.#currentLocationId }
  get diagnostics(): readonly SurfaceDiagnostic[] { return [...this.#diagnostics] }

  async navigate(
    locationId: string,
    entryPoint: CourseNavigationEntryPoint = 'presenter',
    startStateId?: string,
  ): Promise<boolean> {
    this.#assertAlive()
    const target = this.#locationMap.get(locationId)
    if (!target) throw new Error(`Unknown published course location: ${locationId}`)
    const decision = this.courseState.requestNavigation({
      entryPoint,
      ...(this.#currentLocationId ? { fromLocationId: this.#currentLocationId } : {}),
      toLocationId: locationId,
    })
    if (!decision.allowed) {
      const messages = decision.blockedBy.map((entry) => entry.message)
      this.#options.onNavigationBlocked?.(messages)
      this.#showNotice(messages.join('；'))
      return false
    }

    const activation = await this.#player.activateSurface(target.surfaceId)
    if (!activation.ok) {
      this.#showNotice(`表面“${target.surfaceId}”加载失败，其他表面仍可使用。`)
      return false
    }
    if (target.kind === 'slide-scene') {
      await this.#slideHosts.get(target.surfaceId)?.setScene(
        target.sceneId,
        target.stateId ?? startStateId,
      )
    } else if (target.kind === 'flow-block') {
      await this.#flowHosts.get(target.surfaceId)?.setLocationId(target.id)
      const container = this.#surfaceContainers.get(target.surfaceId)
      container?.querySelector<HTMLElement>(`[data-flow-block-id="${CSS.escape(target.blockId)}"]`)
        ?.scrollIntoView?.({ block: 'start' })
    } else {
      const surface = this.project.surfaces.find((entry) => entry.id === target.surfaceId)
      const host = this.#spatialHosts.get(target.surfaceId)
      if (surface?.type === 'spatial-2d' && host) {
        const frame = surface.camera.frames.find((entry) => entry.id === target.cameraFrameId)
        if (!frame) throw new Error(`Unknown Spatial camera frame: ${target.cameraFrameId}`)
        await host.setLocationId(target.id)
        await host.setCamera(spatialCameraFromPose(frame, { width: 1120, height: 760 }))
      }
    }
    this.#currentLocationId = locationId
    this.#syncContainers(target.surfaceId)
    replaceUrlLocation(locationId)
    return true
  }

  async navigateDeepLink(
    deepLink: string,
    entryPoint: CourseNavigationEntryPoint = 'presenter',
  ): Promise<boolean> {
    const hash = deepLink.includes('#') ? deepLink.slice(deepLink.indexOf('#') + 1) : deepLink
    const params = new URLSearchParams(hash.replace(/^\?/, ''))
    const locationId = params.get('location') ?? (this.#locationMap.has(deepLink) ? deepLink : null)
    if (!locationId) throw new Error(`Invalid published course deep link: ${deepLink}`)
    return this.navigate(locationId, entryPoint)
  }

  async next(entryPoint: CourseNavigationEntryPoint = 'presenter'): Promise<boolean> {
    const index = this.#locationIndex()
    const next = this.#locations[index + 1]
    return next ? this.navigate(next.id, entryPoint) : false
  }

  async previous(entryPoint: CourseNavigationEntryPoint = 'presenter'): Promise<boolean> {
    const index = this.#locationIndex()
    const previous = this.#locations[index - 1]
    return previous ? this.navigate(previous.id, entryPoint) : false
  }

  async replay(): Promise<void> {
    if (!this.#currentLocationId) return
    const location = this.#locationMap.get(this.#currentLocationId)
    if (!location) return
    await this.#player.resetSurface(location.surfaceId, 'surface')
    await this.navigate(location.id, 'replay')
  }

  async restart(): Promise<void> {
    const decision = this.courseState.restart()
    await this.#player.resetCourse()
    this.#currentLocationId = null
    await this.navigate(decision.toLocationId, 'restart')
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return
    this.#destroyed = true
    await this.#player.destroy()
    this.#dynamicHosts.dispose()
    this.events.dispose()
    this.#root.replaceChildren()
    this.#surfaceContainers.clear()
  }

  async goToScene(
    sceneId: string,
    stateId?: string,
    entryPoint: CourseNavigationEntryPoint = 'runtime',
  ): Promise<boolean> {
    const target = this.#locations.find((location) => (
      location.kind === 'slide-scene' &&
      location.sceneId === sceneId &&
      (stateId === undefined || location.stateId === stateId)
    ))
    if (!target) throw new Error(`No published location addresses Slide scene ${sceneId}`)
    return this.navigate(target.id, entryPoint)
  }

  async setPresentationState(surfaceId: string, stateId: string): Promise<void> {
    const host = this.#slideHosts.get(surfaceId)
    if (!host) throw new Error(`Unknown Slide surface ${surfaceId}`)
    await host.setPresentationState(stateId)
    const location = this.#locations.find((candidate) => (
      candidate.kind === 'slide-scene' && candidate.surfaceId === surfaceId &&
      candidate.sceneId === host.sceneId && candidate.stateId === stateId
    ))
    if (location) {
      this.#currentLocationId = location.id
      replaceUrlLocation(location.id)
    }
  }

  presentationState(surfaceId: string): {
    current: string | null
    states: Array<{ id: string; name: string; description?: string }>
  } {
    const host = this.#slideHosts.get(surfaceId)
    if (!host) return { current: null, states: [] }
    const scene = host.document.scenes.find((entry) => entry.id === host.sceneId)
    return {
      current: host.stateId ?? null,
      states: structuredClone(scene?.presentation?.states.map(({ id, name, description }) => ({
        id, name, ...(description ? { description } : {}),
      })) ?? []),
    }
  }

  #createHosts(): SurfaceHost[] {
    return this.project.surfaces.map((surface): SurfaceHost => {
      if (surface.type === 'slide') {
        const firstLocation = this.#locations.find((location) => (
          location.kind === 'slide-scene' && location.surfaceId === surface.id
        ))
        const slide = new SlideSurfaceHost(mergeGlobalLayers(surface, this.project.globalLayerItems), {
          initialSceneId: firstLocation?.kind === 'slide-scene' ? firstLocation.sceneId : undefined,
          initialStateId: firstLocation?.kind === 'slide-scene' ? firstLocation.stateId : undefined,
          globalLayerItems: structuredClone(this.project.globalLayerItems),
          componentHostFactory: this.#dynamicHosts.componentHost,
          runtimeHostFactory: this.#dynamicHosts.runtimeHost,
          interactions: {
            events: this.events,
            hostActions: this.#interactionHostActions(),
          },
          resolveLocationId: (sceneId, stateId) => this.#locations.find((location) => (
            location.kind === 'slide-scene' && location.surfaceId === surface.id &&
            location.sceneId === sceneId &&
            (stateId === undefined || location.stateId === stateId)
          ))?.id,
          beforeTeacherControllerAction: (action) => this.#allowTeacherAction(surface.id, action),
          onTeacherControllerAction: () => this.#syncSlideLocation(slide),
        })
        this.#slideHosts.set(surface.id, slide)
        return slide
      }
      if (surface.type === 'flow') {
        const firstLocation = this.#locations.find((location) => location.surfaceId === surface.id)
        const flow = new FlowSurfaceHost(surface, {
          renderComponent: (block) => this.#dynamicHosts.renderFlowComponent(
            surface.id,
            block,
            this.#root.ownerDocument,
          ),
          componentHostFactory: this.#dynamicHosts.componentHost,
          runtimeHostFactory: this.#dynamicHosts.runtimeHost,
          globalLayerItems: structuredClone(this.project.globalLayerItems),
          locationId: firstLocation?.id,
          onTeacherControllerAction: (action) => {
            void this.#handleCourseTeacherAction(action)
          },
        })
        this.#flowHosts.set(surface.id, flow)
        return flow
      }
      const firstLocation = this.#locations.find((location) => (
        location.kind === 'spatial-camera' && location.surfaceId === surface.id
      ))
      const spatial = new SpatialSurfaceHost(surface, { width: 1120, height: 760 }, {
        componentHostFactory: this.#dynamicHosts.componentHost,
        runtimeHostFactory: this.#dynamicHosts.runtimeHost,
        globalLayerItems: structuredClone(this.project.globalLayerItems),
        initialLocationId: firstLocation?.id,
        onTeacherControllerAction: (action) => this.#handleCourseTeacherAction(action),
      })
      this.#spatialHosts.set(surface.id, spatial)
      return spatial
    })
  }

  async #mount(): Promise<void> {
    this.#root.replaceChildren()
    const dom = this.#root.ownerDocument
    const shell = dom.createElement('main')
    shell.className = 'course-shell'
    const stage = dom.createElement('section')
    stage.className = 'course-stage'
    for (const surface of this.project.surfaces) {
      const container = dom.createElement('div')
      container.className = 'course-surface-host'
      container.dataset.surfaceId = surface.id
      container.hidden = true
      stage.appendChild(container)
      this.#surfaceContainers.set(surface.id, container)
      await this.#player.mountSurface(surface.id, container)
    }
    shell.appendChild(stage)
    this.#root.appendChild(shell)

    const linked = locationFromUrl()
    const initial = linked && this.#locationMap.has(linked) ? linked : this.project.startLocationId
    const started = await this.navigate(initial, 'initial-entry', startStateFromUrl())
    if (!started) {
      const firstHealthy = this.#locations.find((location) => this.#player.statusOf(location.surfaceId) !== 'failed')
      if (firstHealthy) await this.navigate(firstHealthy.id, 'initial-entry')
    }
  }

  /**
   * Interaction rules navigate through the same guarded location pipeline as
   * presenter and teacher-controller navigation. The engine contract is
   * synchronous, so the async navigation runs detached; failures surface on
   * the same console channel as the engine's own rule errors.
   */
  #interactionHostActions(): Readonly<RuntimeHostActions> {
    const run = (navigation: Promise<unknown>): boolean => {
      navigation.catch((error: unknown) => {
        console.error('互动规则导航失败', error)
      })
      return true
    }
    return {
      goToScene: (sceneId, targetStateId) => run(this.goToScene(sceneId, targetStateId, 'runtime')),
      nextScene: () => run(this.next('runtime')),
      previousScene: () => run(this.previous('runtime')),
      replayScene: () => run(this.replay()),
      restartCourse: () => run(this.restart()),
    }
  }

  #syncContainers(activeSurfaceId: string): void {
    for (const [surfaceId, container] of this.#surfaceContainers) {
      container.hidden = surfaceId !== activeSurfaceId
    }
  }

  #locationIndex(): number {
    if (!this.#currentLocationId) return -1
    return this.#locations.findIndex((location) => location.id === this.#currentLocationId)
  }

  async #allowTeacherAction(surfaceId: string, action: TeacherControllerAction): Promise<boolean> {
    if (action.type === 'course.restart' || action.type === 'scene.replay') return true
    const host = this.#slideHosts.get(surfaceId)
    if (!host) return false
    let target: CourseLocation | undefined
    if (action.type === 'scene.go') {
      target = this.#locations.find((location) => (
        location.kind === 'slide-scene' && location.surfaceId === surfaceId &&
        location.sceneId === action.sceneId &&
        (action.targetStateId === undefined || location.stateId === action.targetStateId)
      ))
    } else if (action.type === 'scene.next' || action.type === 'scene.previous') {
      const sceneIndex = host.document.scenes.findIndex((scene) => scene.id === host.sceneId)
      const scene = host.document.scenes[sceneIndex + (action.type === 'scene.next' ? 1 : -1)]
      target = scene ? this.#locations.find((location) => (
        location.kind === 'slide-scene' && location.surfaceId === surfaceId && location.sceneId === scene.id
      )) : undefined
    } else {
      return true
    }
    if (!target) return true
    const decision = this.courseState.requestNavigation({
      entryPoint: 'teacher-controller',
      ...(this.#currentLocationId ? { fromLocationId: this.#currentLocationId } : {}),
      toLocationId: target.id,
    })
    if (!decision.allowed) {
      const messages = decision.blockedBy.map((entry) => entry.message)
      this.#options.onNavigationBlocked?.(messages)
      this.#showNotice(messages.join('；'))
    }
    return decision.allowed
  }

  #syncSlideLocation(host: SlideSurfaceHost): void {
    const location = this.#locations.find((candidate) => (
      candidate.kind === 'slide-scene' && candidate.surfaceId === host.id &&
      candidate.sceneId === host.sceneId &&
      (candidate.stateId === undefined || candidate.stateId === host.stateId)
    ))
    if (location) {
      this.#currentLocationId = location.id
      replaceUrlLocation(location.id)
    }
  }

  async #handleCourseTeacherAction(action: TeacherControllerAction): Promise<void> {
    if (action.type === 'scene.previous') await this.previous('teacher-controller')
    else if (action.type === 'scene.next') await this.next('teacher-controller')
    else if (action.type === 'scene.replay') await this.replay()
    else if (action.type === 'course.restart') await this.restart()
    else if (action.type === 'scene.go') await this.goToScene(
      action.sceneId,
      action.targetStateId,
      'teacher-controller',
    )
    else if (action.type === 'audio.toggle-mute') {
      const media = this.#root.querySelectorAll<HTMLMediaElement>('audio, video')
      const muted = ![...media].every((element) => element.muted)
      media.forEach((element) => { element.muted = muted })
    } else if (action.type === 'player.fullscreen.toggle') {
      const dom = this.#root.ownerDocument
      if (dom.fullscreenElement) await dom.exitFullscreen?.()
      else await this.#root.requestFullscreen?.()
    }
  }

  #showNotice(message: string): void {
    let notice = this.#root.querySelector<HTMLElement>('[data-course-player-notice]')
    if (!notice) {
      notice = this.#root.ownerDocument.createElement('div')
      notice.dataset.coursePlayerNotice = 'true'
      notice.setAttribute('role', 'status')
      notice.style.position = 'absolute'
      notice.style.inset = '16px 16px auto'
      notice.style.zIndex = '2147483647'
      notice.style.padding = '10px 14px'
      notice.style.borderRadius = '8px'
      notice.style.background = '#fff7ed'
      notice.style.color = '#9a3412'
      this.#root.appendChild(notice)
    }
    notice.textContent = message
  }

  #report(diagnostic: SurfaceDiagnostic): void {
    this.#diagnostics.push(diagnostic)
    this.#options.onDiagnostic?.(diagnostic)
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('Published course player has been destroyed')
  }
}

export async function startPublishedCourse(
  payload: PublishedCourseV2Payload,
  root: HTMLElement | string = 'course-root',
  options: PublishedCourseAppOptions = {},
): Promise<PublishedCourseApp> {
  const element = typeof root === 'string' ? document.getElementById(root) : root
  if (!element) throw new Error('Cannot find the published course player root')
  return PublishedCourseApp.create(payload, element, options)
}
