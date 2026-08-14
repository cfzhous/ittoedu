import { courseProjectDocumentSchema } from '../../../shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  FlowSurfaceDocument,
  MixedPrintEntry,
  SlideSceneDocument,
  SlideSurfaceDocument,
} from '../../../shared/courseProjectTypes'
import { getEffectiveCourseLayerOrder } from '../../../shared/courseProjectModel'
import type { SurfaceCapture } from '../../../player/surfaces/SurfaceHost'
import type { FlowStaticLayerEntry } from '../../../player/surfaces/flow/FlowSurfaceHost'
import {
  spatialCameraFromPose,
} from '../../../player/surfaces/spatial/spatialModel'
import { renderSpatialSvgMarkup } from '../../../player/surfaces/spatial/SpatialSurfaceHost'
import {
  buildCourseExportDifferenceReport,
  buildFlowPrintHtml,
  buildMixedPrintPlan,
  type CourseExportDifference,
  type MixedPrintPage,
  type MixedPrintPlan,
  type PrintPageSize,
} from './printArtifacts'

export interface SlidePrintCaptureContext {
  project: CourseProjectDocument
  surface: SlideSurfaceDocument
  scene: SlideSceneDocument
}

export interface FlowPrintCaptureContext {
  project: CourseProjectDocument
  surface: FlowSurfaceDocument
  locationId: string
}

export interface BuildCoursePrintOptions {
  resolveAsset?: (assetId: string) => string | undefined
  /** Required for Slide pages because deterministic runtime/component capture belongs to Slide Host. */
  captureSlide?: (context: SlidePrintCaptureContext) => string | Promise<string>
  /** Captures the mounted Flow host so unified dynamic layers keep their real frame. */
  captureFlow?: (context: FlowPrintCaptureContext) => SurfaceCapture | Promise<SurfaceCapture>
}

export interface CoursePrintFailure {
  surfaceId: string
  sourceId: string
  target: 'pdf'
  error: Error
}

export interface CoursePrintBuildResult {
  artifact?: MixedPrintPlan
  failures: CoursePrintFailure[]
  differences: CourseExportDifference[]
}

function error(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

interface FlowPrintFragment {
  bodyHtml: string
  fragmentStyles: string
}

const FLOW_PAGE_RULE = /@page(?:\s+[^{}]+)?\s*\{[^{}]*\}/giu

function safePagePadding(pageRule: string): string | undefined {
  const raw = pageRule.match(/\bmargin\s*:\s*([^;}]+)/iu)?.[1]?.trim()
  if (!raw) return undefined
  const values = raw.split(/\s+/u)
  if (values.length > 4 || values.some((value) => !/^(?:0|\d+(?:\.\d+)?(?:mm|cm|in|pt|pc|px|q|%))$/iu.test(value))) {
    return undefined
  }
  return values.join(' ')
}

/**
 * Preserve the controlled Flow document styles while turning its standalone
 * page rule into fragment padding. Mixed print owns the final named @page
 * rules, so an embedded Flow page must never carry an unnamed @page rule.
 */
function flowPrintFragment(documentHtml: string): FlowPrintFragment {
  const bodyMatch = documentHtml.match(/<body[^>]*>([\s\S]*)<\/body>/iu)
  const headMatch = documentHtml.match(/<head[^>]*>([\s\S]*)<\/head>/iu)
  const head = headMatch?.[1] ?? ''
  let pagePadding: string | undefined
  const fragmentStyles = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)]
    .map((match) => (match[1] ?? '').replace(FLOW_PAGE_RULE, (rule) => {
      pagePadding ??= safePagePadding(rule)
      return ''
    }).trim())
    .filter(Boolean)
    .join('\n')
  if (!fragmentStyles) throw new Error('Flow print document did not provide carryable head styles')
  if (/@page\b/iu.test(fragmentStyles)) {
    throw new Error('Flow print fragment retained an unsafe @page rule')
  }
  const style = pagePadding
    ? ` style="box-sizing:border-box;min-height:100%;padding:${pagePadding}"`
    : ''
  return {
    bodyHtml: `<div class="course-flow-print-fragment"${style}>${bodyMatch?.[1] ?? documentHtml}</div>`,
    fragmentStyles,
  }
}

function pageSizeFor(
  kind: MixedPrintPage['surfaceKind'],
  policy: 'A4' | 'letter' | 'surface-native',
): PrintPageSize {
  if (policy === 'A4') return kind === 'flow'
    ? { widthMm: 210, heightMm: 297, marginMm: 0 }
    : { widthMm: 297, heightMm: 210, marginMm: 0 }
  if (policy === 'letter') return kind === 'flow'
    ? { widthMm: 215.9, heightMm: 279.4, marginMm: 0 }
    : { widthMm: 279.4, heightMm: 215.9, marginMm: 0 }
  if (kind === 'slide') return { widthMm: 338.667, heightMm: 190.5, marginMm: 0 }
  return kind === 'flow'
    ? { widthMm: 210, heightMm: 297, marginMm: 0 }
    : { widthMm: 297, heightMm: 210, marginMm: 0 }
}

function orient(
  size: PrintPageSize,
  orientation: 'auto' | 'portrait' | 'landscape',
): PrintPageSize {
  if (orientation === 'auto') return size
  const portrait = size.heightMm >= size.widthMm
  if ((orientation === 'portrait') === portrait) return size
  return { ...size, widthMm: size.heightMm, heightMm: size.widthMm }
}

function defaultEntries(project: CourseProjectDocument): MixedPrintEntry[] {
  return project.surfaces.map((surface): MixedPrintEntry => {
    if (surface.type === 'slide') {
      return {
        id: `print:${surface.id}`,
        kind: 'slide-scenes',
        surfaceId: surface.id,
        sceneIds: surface.scenes.map((scene) => scene.id),
      }
    }
    if (surface.type === 'flow') {
      return { id: `print:${surface.id}`, kind: 'flow-document', surfaceId: surface.id }
    }
    return {
      id: `print:${surface.id}`,
      kind: 'spatial-frames',
      surfaceId: surface.id,
      cameraFrameIds: surface.camera.frames.map((frame) => frame.id),
    }
  })
}

function flowPrintLocationId(project: CourseProjectDocument, surfaceId: string): string {
  const start = project.locations.find((location) => location.id === project.startLocationId)
  if (start?.surfaceId === surfaceId) return start.id
  const location = project.locations.find((candidate) => candidate.surfaceId === surfaceId)
  if (!location) throw new Error(`Flow surface ${surfaceId} has no printable course location`)
  return location.id
}

/**
 * Builds the browser-print input for every selected surface. Failures remain
 * scoped to their page/surface; successful pages can still be reviewed or
 * exported, and the caller receives an explicit loss report.
 */
export async function buildCoursePrintArtifacts(
  input: CourseProjectDocument,
  options: BuildCoursePrintOptions = {},
): Promise<CoursePrintBuildResult> {
  const project = courseProjectDocumentSchema.parse(input)
  const declared = project.mixedPrintPlan ?? {
    pageSize: 'surface-native' as const,
    orientation: 'auto' as const,
    entries: defaultEntries(project),
  }
  const resolveAsset = options.resolveAsset ?? (() => undefined)
  const pages: MixedPrintPage[] = []
  const failures: CoursePrintFailure[] = []
  const warnings: string[] = []

  for (const entry of declared.entries) {
    const surface = project.surfaces.find((candidate) => candidate.id === entry.surfaceId)
    if (!surface) continue
    const size = orient(pageSizeFor(surface.type, declared.pageSize), declared.orientation)
    if (entry.kind === 'slide-scenes' && surface.type === 'slide') {
      for (const sceneId of entry.sceneIds) {
        const scene = surface.scenes.find((candidate) => candidate.id === sceneId)
        if (!scene) continue
        try {
          if (!options.captureSlide) {
            throw new Error('Slide print capture callback is required')
          }
          const bodyHtml = await options.captureSlide({ project, surface, scene })
          if (!bodyHtml.trim()) throw new Error('Slide capture returned empty HTML')
          pages.push({
            id: `${entry.id}:${scene.id}`,
            surfaceId: surface.id,
            surfaceKind: 'slide',
            title: scene.name,
            bodyHtml,
            pageSize: size,
            sourceFrameId: scene.id,
          })
        } catch (cause) {
          failures.push({ surfaceId: surface.id, sourceId: scene.id, target: 'pdf', error: error(cause) })
        }
      }
      continue
    }
    if (entry.kind === 'flow-document' && surface.type === 'flow') {
      const locationId = flowPrintLocationId(project, surface.id)
      const effectiveLayerItems = getEffectiveCourseLayerOrder({
        project,
        surfaceId: surface.id,
        locationId,
      }).filter((candidate): candidate is FlowStaticLayerEntry => (
        candidate.source === 'global' || candidate.source === 'surface'
      ))
      let capturedDocument: SurfaceCapture | undefined
      if (effectiveLayerItems.length > 0 && options.captureFlow) {
        try {
          capturedDocument = await options.captureFlow({ project, surface, locationId })
          if (capturedDocument.format !== 'html') {
            throw new Error(`Flow capture returned ${capturedDocument.format}; HTML is required`)
          }
        } catch (cause) {
          failures.push({ surfaceId: surface.id, sourceId: entry.id, target: 'pdf', error: error(cause) })
          capturedDocument = undefined
        }
      }
      try {
        const artifact = buildFlowPrintHtml(surface, {
          resolveAsset,
          locationId,
          effectiveLayerItems,
          ...(capturedDocument ? { capturedDocument } : {}),
        })
        const fragment = flowPrintFragment(artifact.html)
        warnings.push(...artifact.warnings)
        pages.push({
          id: entry.id,
          surfaceId: surface.id,
          surfaceKind: 'flow',
          title: surface.title,
          bodyHtml: fragment.bodyHtml,
          fragmentStyles: fragment.fragmentStyles,
          pageSize: size,
        })
      } catch (cause) {
        failures.push({ surfaceId: surface.id, sourceId: entry.id, target: 'pdf', error: error(cause) })
      }
      continue
    }
    if (entry.kind === 'spatial-frames' && surface.type === 'spatial-2d') {
      const frames = entry.cameraFrameIds.length > 0
        ? entry.cameraFrameIds.map((frameId) => surface.camera.frames.find((frame) => frame.id === frameId))
        : [undefined]
      for (const frame of frames) {
        const sourceId = frame?.id ?? `${surface.id}:home`
        try {
          if (entry.cameraFrameIds.length > 0 && !frame) {
            throw new Error(`Unknown Spatial camera frame ${sourceId}`)
          }
          const pose = frame ?? surface.camera.home
          const camera = spatialCameraFromPose(pose, { width: 1120, height: 760 })
          pages.push({
            id: `${entry.id}:${sourceId}`,
            surfaceId: surface.id,
            surfaceKind: 'spatial-2d',
            title: frame?.name ?? surface.title,
            bodyHtml: `<div class="spatial-print-frame">${renderSpatialSvgMarkup(surface, camera, resolveAsset)}</div>`,
            pageSize: size,
            sourceFrameId: frame?.id,
          })
        } catch (cause) {
          failures.push({ surfaceId: surface.id, sourceId, target: 'pdf', error: error(cause) })
        }
      }
    }
  }

  const surfaceDescriptors = project.surfaces.map((surface) => ({
    id: surface.id,
    kind: surface.type,
  }))
  const differences = buildCourseExportDifferenceReport(surfaceDescriptors)
  if (pages.length === 0) return { failures, differences }
  const defaultPageSize = orient(
    pageSizeFor(project.surfaces[0]!.type, declared.pageSize),
    declared.orientation,
  )
  const artifact = buildMixedPrintPlan({
    id: project.id,
    title: project.title,
    surfaces: project.surfaces.map((surface) => ({
      id: surface.id,
      kind: surface.type,
      title: surface.title,
      pages: pages.filter((page) => page.surfaceId === surface.id),
    })).filter((surface) => surface.pages.length > 0),
  }, {
    pageSizePolicy: declared.pageSize === 'surface-native' ? 'preserve' : 'normalize',
    defaultPageSize,
  })
  artifact.warnings.unshift(...warnings)
  return { artifact, failures, differences }
}
