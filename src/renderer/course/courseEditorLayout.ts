import type {
  CourseLocation,
  CourseProjectDocument,
  CourseSurfaceDocument,
  FlowBlock,
  SlideSurfaceDocument,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'

export type CourseEditorLayoutKind = 'slide' | 'flow' | 'spatial' | 'mixed'
export type CourseEditorLayout = CourseEditorLayoutKind | 'unavailable'

export type CourseEditorLayoutUnavailableReason =
  | 'empty-locations'
  | 'missing-surface'
  | 'unknown-surface-type'

export interface CourseEditorLayoutSnapshot {
  readonly layout: CourseEditorLayout
  readonly referencedSurfaceTypes: readonly ('slide' | 'flow' | 'spatial-2d')[]
  readonly unavailable?: {
    readonly reason: CourseEditorLayoutUnavailableReason
    readonly message: string
    readonly locationId?: string
    readonly surfaceId?: string
    readonly surfaceType?: string
  }
}

export type CourseEditorPrimaryNavigation =
  | 'slide-thumbnails'
  | 'course-page-tree'
  | 'unavailable'

export interface CourseEditorShellPolicy {
  readonly layout: CourseEditorLayout
  readonly primaryNavigation: CourseEditorPrimaryNavigation
  readonly leftPanelLabel: '幻灯片' | '课程结构' | '当前位置不可用'
  readonly compactPageTree: boolean
  readonly showSharedContent: true
  readonly allowAddSlidePage: true
  readonly allowAddFlowPage: true
  readonly allowAddSpatialPage: true
}

export const SHARED_CONTENT_SECTION_ID = 'shared-content' as const
export const GLOBAL_LAYER_ENTRY_ID = 'global-layer' as const

export interface CourseGlobalLayerEntry {
  readonly id: typeof GLOBAL_LAYER_ENTRY_ID
  readonly kind: 'global-layer'
  readonly label: '全局层'
  readonly rangeLabel: '全课'
  readonly isLocation: false
  readonly writesHistory: false
}

export interface CourseSharedContentSection {
  readonly id: typeof SHARED_CONTENT_SECTION_ID
  readonly kind: 'shared-content'
  readonly label: '共享内容'
  readonly entries: readonly [CourseGlobalLayerEntry]
}

export type CoursePageTreeNodeKind =
  | 'slide-page'
  | 'slide-scene'
  | 'flow-page'
  | 'flow-heading'
  | 'flow-section'
  | 'spatial-page'
  | 'spatial-camera-group'
  | 'spatial-camera'

export interface CoursePageTreeNode {
  readonly id: string
  readonly kind: CoursePageTreeNodeKind
  readonly surfaceId: string
  readonly surfaceType: 'slide' | 'flow' | 'spatial-2d'
  readonly label: string
  readonly locationId: string | null
  readonly children: readonly CoursePageTreeNode[]
}

export interface CoursePageTree {
  readonly compact: boolean
  readonly nodes: readonly CoursePageTreeNode[]
}

export interface CourseStructureViewModel {
  readonly layout: CourseEditorLayoutSnapshot
  readonly shell: CourseEditorShellPolicy
  readonly sharedContent: CourseSharedContentSection
  readonly pageTree: CoursePageTree
}

type LayoutProject = Pick<CourseProjectDocument, 'locations' | 'surfaces'>

const SURFACE_TYPE_TO_KIND: Readonly<Record<string, CourseEditorLayoutKind | undefined>> = {
  slide: 'slide',
  flow: 'flow',
  'spatial-2d': 'spatial',
}

const FIXED_GLOBAL_LAYER_ENTRY: CourseGlobalLayerEntry = Object.freeze({
  id: GLOBAL_LAYER_ENTRY_ID,
  kind: 'global-layer',
  label: '全局层',
  rangeLabel: '全课',
  isLocation: false,
  writesHistory: false,
})

const FIXED_SHARED_CONTENT: CourseSharedContentSection = Object.freeze({
  id: SHARED_CONTENT_SECTION_ID,
  kind: 'shared-content',
  label: '共享内容',
  entries: Object.freeze([FIXED_GLOBAL_LAYER_ENTRY]) as readonly [CourseGlobalLayerEntry],
})

function unavailableSnapshot(
  reason: CourseEditorLayoutUnavailableReason,
  message: string,
  extra: {
    locationId?: string
    surfaceId?: string
    surfaceType?: string
  } = {},
): CourseEditorLayoutSnapshot {
  return {
    layout: 'unavailable',
    referencedSurfaceTypes: [],
    unavailable: { reason, message, ...extra },
  }
}

function surfacesById(project: LayoutProject): Map<string, CourseSurfaceDocument> {
  const map = new Map<string, CourseSurfaceDocument>()
  for (const surface of project.surfaces) {
    map.set(surface.id, surface)
  }
  return map
}

/**
 * Pure layout derivation from location-referenced surfaces only.
 * Isolated surfaces, global layers and surface shared items never join the type set.
 * Does not read or write projectMode.
 */
export function deriveCourseEditorLayout(project: LayoutProject): CourseEditorLayoutSnapshot {
  if (project.locations.length === 0) {
    return unavailableSnapshot(
      'empty-locations',
      '课程没有可用的页面位置，当前编辑器不可用',
    )
  }

  const byId = surfacesById(project)
  const referencedSurfaceTypes: Array<'slide' | 'flow' | 'spatial-2d'> = []
  const uniqueKinds: CourseEditorLayoutKind[] = []

  for (const location of project.locations) {
    const surface = byId.get(location.surfaceId)
    if (surface === undefined) {
      return unavailableSnapshot(
        'missing-surface',
        `课程位置“${location.id}”引用了缺失的表面“${location.surfaceId}”，当前编辑器不可用`,
        { locationId: location.id, surfaceId: location.surfaceId },
      )
    }
    const kind = SURFACE_TYPE_TO_KIND[surface.type]
    if (kind === undefined) {
      return unavailableSnapshot(
        'unknown-surface-type',
        `表面“${surface.id}”的类型“${String(surface.type)}”无法识别，当前编辑器不可用`,
        { locationId: location.id, surfaceId: surface.id, surfaceType: String(surface.type) },
      )
    }
    if (!referencedSurfaceTypes.includes(surface.type)) {
      referencedSurfaceTypes.push(surface.type)
    }
    if (!uniqueKinds.includes(kind)) {
      uniqueKinds.push(kind)
    }
  }

  return {
    layout: uniqueKinds.length === 1 ? uniqueKinds[0]! : 'mixed',
    referencedSurfaceTypes,
  }
}

export function deriveCourseEditorShellPolicy(
  project: LayoutProject,
): CourseEditorShellPolicy {
  const snapshot = deriveCourseEditorLayout(project)
  return shellPolicyForLayout(snapshot.layout)
}

export type CourseWorkspaceChromeRoute =
  | 'legacy'
  | 'slide'
  | 'flow'
  | 'spatial'
  | 'unavailable'

/** Slide keeps the V8 scene-state strip. Flow/Spatial use their own chrome. */
export function courseWorkspaceShowsSceneStateStrip(
  route: CourseWorkspaceChromeRoute,
): boolean {
  return route === 'legacy' || route === 'slide' || route === 'unavailable'
}

export function shellPolicyForLayout(layout: CourseEditorLayout): CourseEditorShellPolicy {
  if (layout === 'unavailable') {
    return {
      layout,
      primaryNavigation: 'unavailable',
      leftPanelLabel: '当前位置不可用',
      compactPageTree: false,
      showSharedContent: true,
      allowAddSlidePage: true,
      allowAddFlowPage: true,
      allowAddSpatialPage: true,
    }
  }
  if (layout === 'slide') {
    return {
      layout,
      primaryNavigation: 'slide-thumbnails',
      leftPanelLabel: '幻灯片',
      compactPageTree: true,
      showSharedContent: true,
      allowAddSlidePage: true,
      allowAddFlowPage: true,
      allowAddSpatialPage: true,
    }
  }
  return {
    layout,
    primaryNavigation: 'course-page-tree',
    leftPanelLabel: '课程结构',
    compactPageTree: false,
    showSharedContent: true,
    allowAddSlidePage: true,
    allowAddFlowPage: true,
    allowAddSpatialPage: true,
  }
}

interface LocationSurfaceGroup {
  readonly surfaceId: string
  readonly surface: CourseSurfaceDocument | undefined
  readonly locations: CourseLocation[]
}

function groupLocationsBySurface(project: LayoutProject): LocationSurfaceGroup[] {
  const byId = surfacesById(project)
  const groups: LocationSurfaceGroup[] = []
  for (const location of project.locations) {
    const last = groups[groups.length - 1]
    if (last && last.surfaceId === location.surfaceId) {
      last.locations.push(location)
      continue
    }
    groups.push({
      surfaceId: location.surfaceId,
      surface: byId.get(location.surfaceId),
      locations: [location],
    })
  }
  return groups
}

function slideSceneLabel(
  surface: SlideSurfaceDocument,
  location: Extract<CourseLocation, { kind: 'slide-scene' }>,
): string {
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  return scene?.name ?? location.label
}

function primarySlideLocations(
  locations: readonly CourseLocation[],
): Array<Extract<CourseLocation, { kind: 'slide-scene' }>> {
  const slideLocations = locations.filter(
    (location): location is Extract<CourseLocation, { kind: 'slide-scene' }> =>
      location.kind === 'slide-scene',
  )
  const withoutState = slideLocations.filter((location) => location.stateId === undefined)
  return withoutState.length > 0 ? withoutState : slideLocations
}

function slideSceneNode(
  surface: SlideSurfaceDocument,
  location: Extract<CourseLocation, { kind: 'slide-scene' }>,
): CoursePageTreeNode {
  return {
    id: location.id,
    kind: 'slide-scene',
    surfaceId: surface.id,
    surfaceType: 'slide',
    label: slideSceneLabel(surface, location),
    locationId: location.id,
    children: [],
  }
}

function isFlowCourseAnchor(block: FlowBlock | undefined): block is Extract<
  FlowBlock,
  { type: 'heading' | 'section' }
> {
  return block?.type === 'heading' || block?.type === 'section'
}

function flowAnchorNodes(
  blocks: readonly FlowBlock[],
  locationByBlockId: Map<string, Extract<CourseLocation, { kind: 'flow-block' }>>,
  surfaceId: string,
): CoursePageTreeNode[] {
  const nodes: CoursePageTreeNode[] = []
  for (const block of blocks) {
    if (block.type === 'heading') {
      const location = locationByBlockId.get(block.id)
      if (!location) continue
      nodes.push({
        id: location.id,
        kind: 'flow-heading',
        surfaceId,
        surfaceType: 'flow',
        label: block.text.trim() || location.label,
        locationId: location.id,
        children: [],
      })
      continue
    }
    if (block.type === 'section') {
      const location = locationByBlockId.get(block.id)
      const children = flowAnchorNodes(block.blocks, locationByBlockId, surfaceId)
      if (location) {
        nodes.push({
          id: location.id,
          kind: 'flow-section',
          surfaceId,
          surfaceType: 'flow',
          label: block.title.trim() || location.label,
          locationId: location.id,
          children,
        })
      } else {
        nodes.push(...children)
      }
    }
  }
  return nodes
}

function firstFlowAnchorLocationId(
  surface: Extract<CourseSurfaceDocument, { type: 'flow' }>,
  locations: readonly CourseLocation[],
): string | null {
  const locationByBlockId = new Map(
    locations.flatMap((location) =>
      location.kind === 'flow-block' ? [[location.blockId, location] as const] : [],
    ),
  )
  const visit = (blocks: readonly FlowBlock[]): string | null => {
    for (const block of blocks) {
      if (isFlowCourseAnchor(block) && locationByBlockId.has(block.id)) {
        return locationByBlockId.get(block.id)!.id
      }
      if (block.type === 'section') {
        const nested = visit(block.blocks)
        if (nested) return nested
      }
    }
    return null
  }
  return visit(surface.blocks) ?? locations[0]?.id ?? null
}

function spatialCameraNodes(
  surface: SpatialSurfaceDocument,
  locations: readonly CourseLocation[],
): CoursePageTreeNode[] {
  const locationByFrameId = new Map(
    locations.flatMap((location) =>
      location.kind === 'spatial-camera'
        ? [[location.cameraFrameId, location] as const]
        : [],
    ),
  )
  return surface.camera.frames.flatMap((frame) => {
    const location = locationByFrameId.get(frame.id)
    if (!location) return []
    return [{
      id: location.id,
      kind: 'spatial-camera' as const,
      surfaceId: surface.id,
      surfaceType: 'spatial-2d' as const,
      label: frame.name,
      locationId: location.id,
      children: [],
    }]
  })
}

function buildGroupNode(
  group: LocationSurfaceGroup,
  compactSlide: boolean,
): CoursePageTreeNode[] {
  const { surface, locations, surfaceId } = group
  if (!surface) return []

  if (surface.type === 'slide') {
    const scenes = primarySlideLocations(locations).map((location) =>
      slideSceneNode(surface, location),
    )
    if (compactSlide) return scenes
    return [{
      id: `page:${surfaceId}`,
      kind: 'slide-page',
      surfaceId,
      surfaceType: 'slide',
      label: surface.title,
      locationId: scenes[0]?.locationId ?? locations[0]?.id ?? null,
      children: scenes,
    }]
  }

  if (surface.type === 'flow') {
    const locationByBlockId = new Map(
      locations.flatMap((location) =>
        location.kind === 'flow-block' ? [[location.blockId, location] as const] : [],
      ),
    )
    return [{
      id: `page:${surfaceId}`,
      kind: 'flow-page',
      surfaceId,
      surfaceType: 'flow',
      label: surface.title,
      locationId: firstFlowAnchorLocationId(surface, locations),
      children: flowAnchorNodes(surface.blocks, locationByBlockId, surfaceId),
    }]
  }

  const cameras = spatialCameraNodes(surface, locations)
  return [{
    id: `page:${surfaceId}`,
    kind: 'spatial-page',
    surfaceId,
    surfaceType: 'spatial-2d',
    label: surface.title,
    locationId: cameras[0]?.locationId ?? locations[0]?.id ?? null,
    children: [{
      id: `cameras:${surfaceId}`,
      kind: 'spatial-camera-group',
      surfaceId,
      surfaceType: 'spatial-2d',
      label: '本页镜头',
      locationId: null,
      children: cameras,
    }],
  }]
}

export function buildCourseSharedContentSection(): CourseSharedContentSection {
  return FIXED_SHARED_CONTENT
}

export function buildCourseStructureViewModel(project: LayoutProject): CourseStructureViewModel {
  const layout = deriveCourseEditorLayout(project)
  const shell = shellPolicyForLayout(layout.layout)
  if (layout.layout === 'unavailable') {
    return {
      layout,
      shell,
      sharedContent: FIXED_SHARED_CONTENT,
      pageTree: { compact: false, nodes: [] },
    }
  }

  const compactSlide = layout.layout === 'slide'
  const nodes = groupLocationsBySurface(project).flatMap((group) =>
    buildGroupNode(group, compactSlide),
  )

  return {
    layout,
    shell,
    sharedContent: FIXED_SHARED_CONTENT,
    pageTree: {
      compact: compactSlide,
      nodes,
    },
  }
}

export function isCourseEditorLayoutReady(
  snapshot: CourseEditorLayoutSnapshot,
): snapshot is CourseEditorLayoutSnapshot & { layout: CourseEditorLayoutKind } {
  return snapshot.layout !== 'unavailable'
}
