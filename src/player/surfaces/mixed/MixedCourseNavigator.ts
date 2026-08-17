import type { CoursePlayer } from '../CoursePlayer'
import type { SurfaceKind, SurfaceOperationResult } from '../SurfaceHost'

export interface MixedSurfaceEntry {
  id: string
  kind: SurfaceKind
  title: string
  initialTargetId?: string
}

export interface MixedCourseDefinition {
  id: string
  title: string
  surfaces: MixedSurfaceEntry[]
}

export interface MixedDeepLink {
  surfaceId: string
  targetId?: string
}

export interface MixedNavigationState extends MixedDeepLink {
  index: number
  previousSurfaceId?: string
}

export interface MixedCoursePlayerPort {
  readonly activeSurfaceId: string | null
  activateSurface(surfaceId: string): Promise<SurfaceOperationResult>
  resetSurface(surfaceId: string, scope?: 'surface' | 'course'): Promise<SurfaceOperationResult>
  resetCourse(): Promise<readonly SurfaceOperationResult[]>
  /** Optional: release the previous Mixed surface session without destroying the host. */
  releaseSurfaceSession?(surfaceId: string): Promise<SurfaceOperationResult>
}

export interface MixedCourseNavigatorOptions {
  onNavigate?: (state: MixedNavigationState) => void | Promise<void>
  onTarget?: (surfaceId: string, targetId: string | undefined) => void | Promise<void>
}

function assertStableId(id: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    throw new Error(`${label} must be a stable non-empty id`)
  }
}

export function buildMixedDeepLink(link: MixedDeepLink): string {
  assertStableId(link.surfaceId, 'surfaceId')
  if (link.targetId !== undefined) assertStableId(link.targetId, 'targetId')
  const params = new URLSearchParams({ surface: link.surfaceId })
  if (link.targetId !== undefined) params.set('target', link.targetId)
  return `#${params.toString()}`
}

export function parseMixedDeepLink(value: string): MixedDeepLink | null {
  const hashIndex = value.indexOf('#')
  const query = (hashIndex >= 0 ? value.slice(hashIndex + 1) : value).replace(/^\?/, '')
  const params = new URLSearchParams(query)
  const surfaceId = params.get('surface')
  if (!surfaceId) return null
  try {
    assertStableId(surfaceId, 'surfaceId')
    const targetId = params.get('target') ?? undefined
    if (targetId !== undefined) assertStableId(targetId, 'targetId')
    return { surfaceId, ...(targetId ? { targetId } : {}) }
  } catch {
    return null
  }
}

/** Course-level navigation for ordered heterogeneous surfaces. */
export class MixedCourseNavigator {
  readonly #course: MixedCourseDefinition
  readonly #player: MixedCoursePlayerPort
  readonly #onNavigate?: MixedCourseNavigatorOptions['onNavigate']
  readonly #onTarget?: MixedCourseNavigatorOptions['onTarget']
  readonly #surfaceMap: Map<string, MixedSurfaceEntry>
  #current: MixedDeepLink | null = null
  #history: MixedDeepLink[] = []

  constructor(
    course: MixedCourseDefinition,
    player: MixedCoursePlayerPort | CoursePlayer,
    options: MixedCourseNavigatorOptions = {},
  ) {
    if (course.surfaces.length === 0) throw new Error('A mixed course needs at least one surface')
    const surfaceMap = new Map<string, MixedSurfaceEntry>()
    for (const surface of course.surfaces) {
      assertStableId(surface.id, 'surfaceId')
      if (surfaceMap.has(surface.id)) throw new Error(`Duplicate mixed surface id: ${surface.id}`)
      surfaceMap.set(surface.id, { ...surface })
    }
    this.#course = {
      ...course,
      surfaces: course.surfaces.map((surface) => ({ ...surface })),
    }
    this.#surfaceMap = surfaceMap
    this.#player = player
    this.#onNavigate = options.onNavigate
    this.#onTarget = options.onTarget
  }

  get current(): MixedDeepLink | null {
    return this.#current ? { ...this.#current } : null
  }

  get canGoBack(): boolean {
    return this.#history.length > 0
  }

  async start(link?: MixedDeepLink): Promise<MixedNavigationState> {
    const first = this.#course.surfaces[0]!
    return this.navigate(link ?? {
      surfaceId: first.id,
      ...(first.initialTargetId ? { targetId: first.initialTargetId } : {}),
    }, { recordHistory: false })
  }

  async navigateDeepLink(value: string): Promise<MixedNavigationState> {
    const link = parseMixedDeepLink(value)
    if (!link) throw new Error(`Invalid mixed-course deep link: ${value}`)
    return this.navigate(link)
  }

  async navigate(
    link: MixedDeepLink,
    options: { recordHistory?: boolean } = {},
  ): Promise<MixedNavigationState> {
    const surface = this.#surfaceMap.get(link.surfaceId)
    if (!surface) throw new Error(`Unknown mixed-course surface: ${link.surfaceId}`)
    if (link.targetId !== undefined) assertStableId(link.targetId, 'targetId')
    const previous = this.#current
    if (previous && previous.surfaceId !== link.surfaceId) {
      await this.#player.releaseSurfaceSession?.(previous.surfaceId)
    }
    const activation = await this.#player.activateSurface(link.surfaceId)
    if (!activation.ok) throw activation.failure?.error ?? new Error('Surface activation failed')
    if (previous && options.recordHistory !== false) this.#history.push(previous)
    this.#current = { ...link }
    await this.#onTarget?.(link.surfaceId, link.targetId)
    const state = this.#state(previous?.surfaceId)
    await this.#onNavigate?.(state)
    return state
  }

  async next(): Promise<MixedNavigationState | null> {
    const index = this.#currentIndex()
    const next = this.#course.surfaces[index + 1]
    if (!next) return null
    return this.navigate({
      surfaceId: next.id,
      ...(next.initialTargetId ? { targetId: next.initialTargetId } : {}),
    })
  }

  async previous(): Promise<MixedNavigationState | null> {
    const index = this.#currentIndex()
    const previous = this.#course.surfaces[index - 1]
    if (!previous) return null
    return this.navigate({
      surfaceId: previous.id,
      ...(previous.initialTargetId ? { targetId: previous.initialTargetId } : {}),
    })
  }

  async back(): Promise<MixedNavigationState | null> {
    const link = this.#history.pop()
    if (!link) return null
    return this.navigate(link, { recordHistory: false })
  }

  async resetCurrentSurface(): Promise<MixedNavigationState> {
    if (!this.#current) throw new Error('Mixed course has not started')
    const result = await this.#player.resetSurface(this.#current.surfaceId, 'surface')
    if (!result.ok) throw result.failure?.error ?? new Error('Surface reset failed')
    const surface = this.#surfaceMap.get(this.#current.surfaceId)!
    return this.navigate({
      surfaceId: surface.id,
      ...(surface.initialTargetId ? { targetId: surface.initialTargetId } : {}),
    }, { recordHistory: false })
  }

  async resetCourse(): Promise<MixedNavigationState> {
    const results = await this.#player.resetCourse()
    const failed = results.find((result) => !result.ok)
    if (failed) throw failed.failure?.error ?? new Error('Course reset failed')
    this.#history = []
    this.#current = null
    return this.start()
  }

  #currentIndex(): number {
    if (!this.#current) throw new Error('Mixed course has not started')
    const index = this.#course.surfaces.findIndex((surface) => surface.id === this.#current?.surfaceId)
    if (index < 0) throw new Error('Current mixed-course surface no longer exists')
    return index
  }

  #state(previousSurfaceId?: string): MixedNavigationState {
    if (!this.#current) throw new Error('Mixed course has not started')
    const index = this.#currentIndex()
    return {
      ...this.#current,
      index,
      ...(previousSurfaceId ? { previousSurfaceId } : {}),
    }
  }
}
