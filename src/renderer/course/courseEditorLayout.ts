import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
} from '../../shared/courseProjectTypes'

export type CourseEditorLayoutKind = 'slide' | 'flow' | 'spatial' | 'mixed'
export type CourseEditorPrimaryAction = 'scene' | 'slide-page' | 'flow-page' | 'spatial-page'
export type CourseEditorDropdownAction = 'slide-page' | 'flow-page' | 'spatial-page'

export interface CourseEditorLayoutResult {
  readonly kind: CourseEditorLayoutKind
  readonly primary: {
    readonly action: CourseEditorPrimaryAction
    readonly surfaceId?: string
  }
  readonly dropdown: readonly CourseEditorDropdownAction[]
  readonly activeSurfaceId: string | null
}

type LayoutProject = Pick<CourseProjectDocument, 'locations' | 'surfaces'>

const SURFACE_TYPE_TO_KIND: Readonly<Record<string, CourseEditorLayoutKind | undefined>> = {
  slide: 'slide',
  flow: 'flow',
  'spatial-2d': 'spatial',
}

const ALL_DROPDOWN_ACTIONS: readonly CourseEditorDropdownAction[] = [
  'slide-page',
  'flow-page',
  'spatial-page',
]

function surfacesById(project: LayoutProject): Map<string, CourseSurfaceDocument> {
  const map = new Map<string, CourseSurfaceDocument>()
  for (const surface of project.surfaces) {
    map.set(surface.id, surface)
  }
  return map
}

function referencedSurfaceTypes(
  project: LayoutProject,
): readonly ('slide' | 'flow' | 'spatial-2d')[] {
  const byId = surfacesById(project)
  const types: Array<'slide' | 'flow' | 'spatial-2d'> = []
  for (const location of project.locations) {
    const surface = byId.get(location.surfaceId)
    if (!surface) continue
    if (surface.type === 'slide' || surface.type === 'flow' || surface.type === 'spatial-2d') {
      if (!types.includes(surface.type)) types.push(surface.type)
    }
  }
  return types
}

function layoutKindFromSurfaceTypes(
  types: readonly ('slide' | 'flow' | 'spatial-2d')[],
): CourseEditorLayoutKind {
  const uniqueKinds = types.flatMap((type) => {
    const kind = SURFACE_TYPE_TO_KIND[type]
    return kind ? [kind] : []
  }).filter((kind, index, all) => all.indexOf(kind) === index)
  if (uniqueKinds.length === 1) return uniqueKinds[0]!
  return 'mixed'
}

function firstSlideSurfaceId(project: LayoutProject): string | undefined {
  const byId = surfacesById(project)
  for (const location of project.locations) {
    const surface = byId.get(location.surfaceId)
    if (surface?.type === 'slide') return surface.id
  }
  return project.surfaces.find((surface) => surface.type === 'slide')?.id
}

function resolveActiveSlideSurfaceId(
  project: LayoutProject,
  activeLocationId: string | undefined,
): string | undefined {
  if (activeLocationId) {
    const active = project.locations.find((location) => location.id === activeLocationId)
    if (active) {
      const surface = surfacesById(project).get(active.surfaceId)
      if (surface?.type === 'slide') return surface.id
    }
  }
  return firstSlideSurfaceId(project)
}

function primaryActionForKind(
  kind: CourseEditorLayoutKind,
  project: LayoutProject,
  activeLocationId: string | undefined,
): CourseEditorLayoutResult['primary'] {
  if (kind === 'flow') return { action: 'flow-page' }
  if (kind === 'spatial') return { action: 'spatial-page' }
  if (kind === 'slide') {
    const surfaceId = resolveActiveSlideSurfaceId(project, activeLocationId)
    return surfaceId ? { action: 'scene', surfaceId } : { action: 'slide-page' }
  }
  const slideSurfaceId = firstSlideSurfaceId(project)
  if (slideSurfaceId) {
    return {
      action: 'scene',
      surfaceId: resolveActiveSlideSurfaceId(project, activeLocationId) ?? slideSurfaceId,
    }
  }
  return { action: 'slide-page' }
}

function dropdownForPrimary(primary: CourseEditorLayoutResult['primary']): CourseEditorDropdownAction[] {
  const occupied = primary.action === 'scene'
    ? 'slide-page'
    : primary.action
  return ALL_DROPDOWN_ACTIONS.filter((action) => action !== occupied)
}

function resolveActiveSurfaceId(
  project: LayoutProject,
  activeLocationId: string | undefined,
): string | null {
  if (!activeLocationId) return null
  const location = project.locations.find((candidate) => candidate.id === activeLocationId)
  return location?.surfaceId ?? null
}

/**
 * Pure layout derivation from location-referenced surfaces only.
 * Does not read or write projectMode.
 */
export function deriveCourseEditorLayout(
  project: LayoutProject,
  activeLocationId?: string,
): CourseEditorLayoutResult {
  const types = referencedSurfaceTypes(project)
  const kind = layoutKindFromSurfaceTypes(types)
  const primary = primaryActionForKind(kind, project, activeLocationId)
  return {
    kind,
    primary,
    dropdown: dropdownForPrimary(primary),
    activeSurfaceId: resolveActiveSurfaceId(project, activeLocationId),
  }
}
