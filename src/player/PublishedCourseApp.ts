import { publishedCourseV2Schema } from '../shared/publishedCourseSchema'
import type {
  CourseLocation,
  CourseProjectDocument,
  CourseStateScalar,
  FlowBlock,
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
import {
  ScenePickerOverlay,
  type ScenePickerLocation,
} from './ScenePickerOverlay'

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

function findFlowBlock(
  blocks: readonly FlowBlock[],
  blockId: string,
): FlowBlock | undefined {
  for (const block of blocks) {
    if (block.id === blockId) return block
    if (block.type === 'section') {
      const nested = findFlowBlock(block.blocks, blockId)
      if (nested) return nested
    }
  }
  return undefined
}

function isPrimarySlideLocation(
  locations: readonly CourseLocation[],
  location: Extract<CourseLocation, { kind: 'slide-scene' }>,
): boolean {
  const siblings = locations.filter((candidate): candidate is Extract<CourseLocation, { kind: 'slide-scene' }> => (
    candidate.kind === 'slide-scene' &&
    candidate.surfaceId === location.surfaceId &&
    candidate.sceneId === location.sceneId
  ))
  const withoutState = siblings.filter((candidate) => candidate.stateId === undefined)
  const primary = withoutState.length > 0 ? withoutState : siblings
  return primary[0]?.id === location.id
}

function isNavigableFlowLocation(
  project: CourseProjectDocument,
  location: Extract<CourseLocation, { kind: 'flow-block' }>,
): boolean {
  const surface = project.surfaces.find((entry) => entry.id === location.surfaceId)
  if (surface?.type !== 'flow') return false
  const block = findFlowBlock(surface.blocks, location.blockId)
  if (block?.type === 'heading' || block?.type === 'section') return true
  const surfaceLocations = project.locations.filter((candidate) => (
    candidate.kind === 'flow-block' && candidate.surfaceId === location.surfaceId
  ))
  const hasAnchor = surfaceLocations.some((candidate) => {
    if (candidate.kind !== 'flow-block') return false
    const candidateBlock = findFlowBlock(surface.blocks, candidate.blockId)
    return candidateBlock?.type === 'heading' || candidateBlock?.type === 'section'
  })
  return !hasAnchor && surfaceLocations[0]?.id === location.id
}

/** Course-directory / prev-next / progress order: Slide scenes, Flow anchors, Spatial cameras. */
function navigablePublishedLocations(project: CourseProjectDocument): CourseLocation[] {
  return project.locations.filter((location) => {
    if (location.kind === 'slide-scene') return isPrimarySlideLocation(project.locations, location)
    if (location.kind === 'spatial-camera') return true
    if (location.kind === 'flow-block') return isNavigableFlowLocation(project, location)
    return false
  })
}

function locationDisplayName(
  project: CourseProjectDocument,
  location: CourseLocation,
): string {
  if (location.kind === 'slide-scene') {
    const surface = project.surfaces.find((entry) => entry.id === location.surfaceId)
    const scene = surface?.type === 'slide'
      ? surface.scenes.find((entry) => entry.id === location.sceneId)
      : undefined
    return scene?.name ?? location.label
  }
  if (location.kind === 'flow-block') {
    const surface = project.surfaces.find((entry) => entry.id === location.surfaceId)
    if (surface?.type === 'flow') {
      const block = findFlowBlock(surface.blocks, location.blockId)
      if (block?.type === 'heading') return block.text.trim() || location.label
      if (block?.type === 'section') return block.title.trim() || location.label
    }
    return location.label
  }
  const surface = project.surfaces.find((entry) => entry.id === location.surfaceId)
  const frame = surface?.type === 'spatial-2d'
    ? surface.camera.frames.find((entry) => entry.id === location.cameraFrameId)
    : undefined
  return frame?.name ?? location.label
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
  readonly #navigationLocations: CourseLocation[]
  readonly #locationMap: Map<string, CourseLocation>
  readonly #diagnostics: SurfaceDiagnostic[] = []
  readonly #dynamicHosts: PublishedDynamicHostRegistry
  readonly #player: CoursePlayer
  #currentLocationId: string | null = null
  #muted: boolean
  #scenePicker: ScenePickerOverlay | null = null
  #teacherActionChain: Promise<void> = Promise.resolve()
  #destroyed = false

  private constructor(
    payload: PublishedCourseV2Payload,
    root: HTMLElement,
    options: PublishedCourseAppOptions,
  ) {
    this.payload = publishedCourseV2Schema.parse(payload)
    this.project = publishedCourseToPlayerDocument(this.payload)
    this.#muted = this.project.media.audio.defaultMuted
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
    this.#navigationLocations = navigablePublishedLocations(this.project)
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

    const previousLocationId = this.#currentLocationId
    const previous = previousLocationId ? this.#locationMap.get(previousLocationId) : undefined
    if (previous && previous.surfaceId !== target.surfaceId) {
      const leaveId = previous.kind === 'slide-scene' ? previous.sceneId : previous.id
      this.events.emit('scene:leave', { sceneId: leaveId })
    }

    const activation = await this.#player.activateSurface(target.surfaceId)
    if (!activation.ok) {
      this.#showNotice('课件页面加载失败，其他页面仍可使用。')
      return false
    }

    // Progress sources read this.#currentLocationId during host rebuilds.
    this.#currentLocationId = locationId
    try {
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
    } catch (error) {
      this.#currentLocationId = previousLocationId
      throw error
    }
    this.#syncContainers(target.surfaceId)
    replaceUrlLocation(locationId)
    this.events.emit('course:location', { locationId })
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
    const index = this.#navigationIndex()
    const next = this.#navigationLocations[index + 1]
    return next ? this.navigate(next.id, entryPoint) : false
  }

  async previous(entryPoint: CourseNavigationEntryPoint = 'presenter'): Promise<boolean> {
    const index = this.#navigationIndex()
    const previous = this.#navigationLocations[index - 1]
    return previous ? this.navigate(previous.id, entryPoint) : false
  }

  async replay(): Promise<void> {
    if (!this.#currentLocationId) return
    const location = this.#locationMap.get(this.#currentLocationId)
    if (!location) return
    await this.#player.resetSurface(location.surfaceId, 'surface')
    // reset('surface') already re-entered the current scene and announced the
    // fresh scene.enter once. Re-navigating would replay the semantic unit's
    // entry rules a second time, so only re-pin a location-pinned state.
    if (location.kind === 'slide-scene') {
      const host = this.#slideHosts.get(location.surfaceId)
      if (host && location.stateId && host.stateId !== location.stateId) {
        await host.setPresentationState(location.stateId)
      }
      return
    }
    await this.navigate(location.id, 'replay')
  }

  async restart(): Promise<void> {
    const decision = this.courseState.restart()
    // Restart restores the project defaults for every course session state,
    // including the session mute override and controller offset/collapse.
    this.#muted = this.project.media.audio.defaultMuted
    this.events.emit('audio:change', { muted: this.#muted })
    await this.#player.resetCourse()
    // reset('course') already restored every surface to its authored default
    // scene and announced the fresh entry once. Activate the start location
    // without re-navigating, so the start scene's enter rules run exactly once.
    const target = this.#locationMap.get(decision.toLocationId)
    if (target?.kind === 'slide-scene') {
      await this.#player.activateSurface(target.surfaceId)
      const host = this.#slideHosts.get(target.surfaceId)
      if (host && host.sceneId !== target.sceneId) {
        await host.setScene(target.sceneId, target.stateId)
      } else if (host && target.stateId && host.stateId !== target.stateId) {
        await host.setPresentationState(target.stateId)
      }
      this.#currentLocationId = target.id
      this.#syncContainers(target.surfaceId)
      replaceUrlLocation(target.id)
      this.events.emit('course:location', { locationId: target.id })
      return
    }
    this.#currentLocationId = null
    await this.navigate(decision.toLocationId, 'restart')
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return
    this.#destroyed = true
    await this.#player.destroy()
    this.#dynamicHosts.dispose()
    this.#scenePicker?.destroy()
    this.#scenePicker = null
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
      this.events.emit('course:location', { locationId: location.id })
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
          // Single owner: the course location pipeline executes every
          // teacher-controller action (guards, cross-surface navigation, mute,
          // fullscreen and the scene picker). The surface host never navigates
          // locally, so App and host can never double-execute one action.
          executeTeacherControllerAction: (action) => this.#handleCourseTeacherAction(action),
          playbackControls: this.project.playback.controls,
          initialMuted: this.#muted,
          courseProgressSource: this.#courseProgressSource(),
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
          executeTeacherControllerAction: (action) => this.#handleCourseTeacherAction(action),
          playbackControls: this.project.playback.controls,
          initialMuted: this.#muted,
          interactions: {
            events: this.events,
            hostActions: this.#interactionHostActions(),
          },
          // Same course location source as Slide/Spatial so the overlay
          // controller never falls back to the fake flow-overlay scene.
          courseProgressSource: this.#courseProgressSource(),
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
        // Single owner: the course location pipeline executes every
        // teacher-controller action (guards, cross-surface navigation, mute,
        // fullscreen and the scene picker). The Spatial host delegates to
        // this executor and never falls back to a second local handler, so
        // one user action can never be executed twice.
        executeTeacherControllerAction: (action) => this.#handleCourseTeacherAction(action),
        playbackControls: this.project.playback.controls,
        initialMuted: this.#muted,
        audioChangeSource: this.events,
        courseProgressSource: this.#courseProgressSource(),
      })
      this.#spatialHosts.set(surface.id, spatial)
      return spatial
    })
  }

  async #mount(): Promise<void> {
    this.#root.replaceChildren()
    const dom = this.#root.ownerDocument
    // The scene directory layer positions against the course root.
    this.#root.style.position = 'relative'
    const shell = dom.createElement('main')
    shell.className = 'course-shell'
    const stage = dom.createElement('section')
    stage.className = 'course-stage'
    const linked = locationFromUrl()
    const initial = linked && this.#locationMap.has(linked) ? linked : this.project.startLocationId
    this.#currentLocationId = this.#locationMap.has(initial) ? initial : null
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

    this.#scenePicker = new ScenePickerOverlay({
      stage: this.#root,
      scenes: [],
      locations: this.#pickerLocations(),
      onSelect: (locationId, bypassNavigationGuards) => {
        void this.navigate(
          locationId,
          bypassNavigationGuards ? 'author-force' : 'teacher-controller',
        )
      },
    })

    const started = await this.navigate(initial, 'initial-entry', startStateFromUrl())
    if (!started) {
      const firstHealthy = this.#locations.find((location) => this.#player.statusOf(location.surfaceId) !== 'failed')
      if (firstHealthy) await this.navigate(firstHealthy.id, 'initial-entry')
    }
  }

  /** Every navigable published location, in the canonical course navigation order. */
  #pickerLocations(): ScenePickerLocation[] {
    return this.#navigationLocations.map((location) => ({
      id: location.id,
      locationId: location.id,
      name: locationDisplayName(this.project, location),
      kind: location.kind,
      ...(location.kind === 'slide-scene' ? { sceneId: location.sceneId } : {}),
    }))
  }

  #courseProgressSource() {
    return {
      getLocations: () => this.#navigationLocations.map((location) => ({
        id: location.id,
        name: locationDisplayName(this.project, location),
      })),
      getCurrentLocationId: () => this.#currentLocationId,
      getStateLabel: () => this.#currentSlideStateLabel(),
    }
  }

  #currentSlideStateLabel(): string | null {
    const locationId = this.#currentLocationId
    if (!locationId) return null
    const location = this.#locationMap.get(locationId)
    if (!location || location.kind !== 'slide-scene') return null
    const host = this.#slideHosts.get(location.surfaceId)
    if (!host || host.sceneId !== location.sceneId || !host.stateId) return null
    const scene = host.document.scenes.find((entry) => entry.id === host.sceneId)
    return scene?.presentation?.states.find((entry) => entry.id === host.stateId)?.name ?? null
  }

  /**
   * Interaction rules navigate through the same guarded location pipeline as
   * presenter and teacher-controller navigation. Every action is genuinely
   * awaited: a blocked or failed navigation resolves `false` so the engine
   * stops the rest of the rule chain, and unexpected failures surface a
   * teacher-understandable notice instead of an internal identifier.
   */
  #interactionHostActions(): Readonly<RuntimeHostActions> {
    const run = async (operation: () => Promise<boolean>): Promise<boolean> => {
      try {
        return await operation()
      } catch (error) {
        console.error('互动规则导航失败', error)
        this.#showNotice('互动跳转失败，请检查课件互动设置后重试。')
        return false
      }
    }
    return {
      goToScene: (sceneId, targetStateId) => (
        run(() => this.goToScene(sceneId, targetStateId, 'runtime'))
      ),
      nextScene: () => run(() => this.next('runtime')),
      previousScene: () => run(() => this.previous('runtime')),
      replayScene: () => run(async () => { await this.replay(); return true }),
      restartCourse: () => run(async () => { await this.restart(); return true }),
    }
  }

  #syncContainers(activeSurfaceId: string): void {
    for (const [surfaceId, container] of this.#surfaceContainers) {
      const active = surfaceId === activeSurfaceId
      container.hidden = !active
      container.style.pointerEvents = active ? '' : 'none'
    }
  }

  #navigationIndex(): number {
    if (!this.#currentLocationId) return -1
    const direct = this.#navigationLocations.findIndex((location) => location.id === this.#currentLocationId)
    if (direct >= 0) return direct
    const fullIndex = this.#locations.findIndex((location) => location.id === this.#currentLocationId)
    if (fullIndex < 0) return -1
    for (let index = fullIndex; index >= 0; index -= 1) {
      const mapped = this.#navigationLocations.findIndex((location) => (
        location.id === this.#locations[index]?.id
      ))
      if (mapped >= 0) return mapped
    }
    return -1
  }

  /**
   * Single executor for teacher-controller actions from Slide, Flow and Spatial
   * surfaces. Navigation always runs through the guarded course location
   * pipeline, so a blocked or failed action stops here and surfaces a
   * teacher-understandable notice instead of an internal identifier.
   */
  async #handleCourseTeacherAction(action: TeacherControllerAction): Promise<void> {
    // Serialize clicks instead of dropping them. A blocked next() is still an
    // in-flight await; the next click must run after that decision settles so
    // a just-updated course state can unblock the same action.
    const run = this.#teacherActionChain.then(() => this.#runCourseTeacherAction(action))
    this.#teacherActionChain = run.then(() => undefined, () => undefined)
    await run
  }

  async #runCourseTeacherAction(action: TeacherControllerAction): Promise<void> {
    try {
      if (action.type === 'scene.previous') await this.previous('teacher-controller')
      else if (action.type === 'scene.next') await this.next('teacher-controller')
      else if (action.type === 'scene.replay') await this.replay()
      else if (action.type === 'course.restart') await this.restart()
      else if (action.type === 'scene.go') await this.goToScene(
        action.sceneId,
        action.targetStateId,
        'teacher-controller',
      )
      else if (action.type === 'scene.open-picker') {
        this.#scenePicker?.open(this.#currentLocationId)
      } else if (action.type === 'audio.toggle-mute') {
        this.#muted = !this.#muted
        this.#root.querySelectorAll<HTMLMediaElement>('audio, video')
          .forEach((element) => { element.muted = this.#muted })
        // The slide host refreshes controller mute labels from this session event.
        this.events.emit('audio:change', { muted: this.#muted })
      } else if (action.type === 'player.fullscreen.toggle') {
        const dom = this.#root.ownerDocument
        if (dom.fullscreenElement) await dom.exitFullscreen?.()
        else await this.#root.requestFullscreen?.()
      }
    } catch (error) {
      console.error('教师控制器动作失败', error)
      this.#showNotice('教师控制器动作失败，请重试。')
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
