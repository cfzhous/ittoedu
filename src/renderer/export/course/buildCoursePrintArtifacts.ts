import { courseProjectDocumentSchema } from '../../../shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  FlowSurfaceDocument,
  MixedPrintEntry,
  SlideSceneDocument,
  SlideSurfaceDocument,
  SpatialSurfaceDocument,
} from '../../../shared/courseProjectTypes'
import {
  getEffectiveCourseLayerOrder,
  isCourseLayerVisibleAtLocation,
} from '../../../shared/courseProjectModel'
import { compareStableStrings } from '../../../shared/stableOrder'
import type { SurfaceCapture } from '../../../player/surfaces/SurfaceHost'
import type { FlowStaticLayerEntry } from '../../../player/surfaces/flow/FlowSurfaceHost'
import {
  SPATIAL_CANONICAL_VIEWPORT,
  spatialCameraFromPose,
} from '../../../player/surfaces/spatial/spatialModel'
import { renderSpatialSvgMarkup } from '../../../player/surfaces/spatial/SpatialSurfaceHost'
import {
  buildCourseExportDifferenceReport,
  buildFlowPrintHtml,
  buildMixedPrintPlan,
  resolveSlideExportLocationId,
  type CourseExportDifference,
  type MixedPrintPage,
  type MixedPrintPlan,
  type PrintPageSize,
} from './printArtifacts'

export interface SlidePrintCaptureContext {
  project: CourseProjectDocument
  surface: SlideSurfaceDocument
  scene: SlideSceneDocument
  /** Stable course location used to resolve shared-layer visibility. */
  locationId: string
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
  if (!fragmentStyles) throw new Error('流式讲义缺少可用的打印样式。')
  if (/@page\b/iu.test(fragmentStyles)) {
    throw new Error('流式讲义的打印样式与当前页面设置冲突。')
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

export interface FlowStaticExportLayerPlan {
  primaryLocationId: string
  locationIds: string[]
  effectiveLayerItems: FlowStaticLayerEntry[]
  /** True when one static document consolidates layers that vary between blocks. */
  consolidatesLocationScopedLayers: boolean
  warnings: string[]
}

/**
 * A Flow document can span several course locations. Static exports therefore
 * use the union of layers visible at any Flow location instead of silently
 * applying only the start/first block's visibility.
 */
export function buildFlowStaticExportLayerPlan(
  project: CourseProjectDocument,
  surface: FlowSurfaceDocument,
): FlowStaticExportLayerPlan {
  const matching = project.locations.filter((location) => (
    location.kind === 'flow-block' && location.surfaceId === surface.id
  ))
  const start = matching.find((location) => location.id === project.startLocationId)
  const orderedLocations = start
    ? [start, ...matching.filter((location) => location.id !== start.id)]
    : matching
  if (orderedLocations.length === 0) {
    throw new Error('当前流式讲义缺少可导出的课程位置。')
  }
  const locationIds = orderedLocations.map((location) => location.id)
  const byLayerId = new Map<string, FlowStaticLayerEntry>()
  for (const locationId of locationIds) {
    for (const entry of getEffectiveCourseLayerOrder({
      project,
      surfaceId: surface.id,
      locationId,
    })) {
      if (entry.source !== 'global' && entry.source !== 'surface') continue
      byLayerId.set(entry.item.layerItemId, { item: entry.item, source: entry.source })
    }
  }
  const scopedEntries = [...project.globalLayerItems, ...surface.surfaceLayerItems]
  const consolidatesLocationScopedLayers = locationIds.length > 1 && scopedEntries.some((entry) => (
    new Set(locationIds.map((locationId) => (
      isCourseLayerVisibleAtLocation(entry, locationId)
    ))).size > 1
  ))
  return {
    primaryLocationId: locationIds[0]!,
    locationIds,
    effectiveLayerItems: [...byLayerId.values()].sort((left, right) => (
      left.item.order - right.item.order ||
      compareStableStrings(left.item.layerItemId, right.item.layerItemId)
    )),
    consolidatesLocationScopedLayers,
    warnings: consolidatesLocationScopedLayers
      ? ['讲义中有随课程位置变化的共享内容；已将各位置可见的内容合并到本次静态导出中，未静默省略。']
      : [],
  }
}

function spatialPrintLocationId(
  project: CourseProjectDocument,
  surfaceId: string,
  cameraFrameId?: string,
): string {
  if (cameraFrameId) {
    const exact = project.locations.find((location) => (
      location.kind === 'spatial-camera' &&
      location.surfaceId === surfaceId &&
      location.cameraFrameId === cameraFrameId
    ))
    if (exact) return exact.id
    throw new Error('有一个空间镜头缺少可导出的课程位置。')
  }
  const start = project.locations.find((location) => location.id === project.startLocationId)
  if (start?.kind === 'spatial-camera' && start.surfaceId === surfaceId) return start.id
  const first = project.locations.find((location) => (
    location.kind === 'spatial-camera' && location.surfaceId === surfaceId
  ))
  if (!first) throw new Error('当前空间画布缺少可导出的课程位置。')
  return first.id
}

function spatialPrintSurfaceAtLocation(
  project: CourseProjectDocument,
  surface: SpatialSurfaceDocument,
  locationId: string,
): { surface: SpatialSurfaceDocument; warnings: string[] } {
  const printable = structuredClone(surface)
  printable.surfaceLayerItems = []
  const allItems = getEffectiveCourseLayerOrder({
    project,
    surfaceId: surface.id,
    locationId,
  }).map(({ item }) => structuredClone(item))
  const omittedControllers = allItems.filter((item) => (
    item.kind === 'native' &&
    item.content.nativeType === 'teacher-controller' &&
    !item.content.data.includeInStaticExports
  ))
  printable.world.layerItems = allItems.filter((item) => !omittedControllers.includes(item))
  return {
    surface: printable,
    warnings: omittedControllers.map((item) => `教师控制器“${item.label}”已按静态导出设置省略。`),
  }
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
            throw new Error('幻灯片打印画面未就绪。')
          }
          const locationId = resolveSlideExportLocationId(project, surface, scene)
          const bodyHtml = await options.captureSlide({ project, surface, scene, locationId })
          if (!bodyHtml.trim()) throw new Error('幻灯片打印画面为空。')
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
      const layerPlan = buildFlowStaticExportLayerPlan(project, surface)
      const locationId = layerPlan.primaryLocationId
      const effectiveLayerItems = layerPlan.effectiveLayerItems
      warnings.push(...layerPlan.warnings)
      let capturedDocument: SurfaceCapture | undefined
      if (options.captureFlow && !layerPlan.consolidatesLocationScopedLayers) {
        try {
          capturedDocument = await options.captureFlow({ project, surface, locationId })
          if (capturedDocument.format !== 'html') {
            throw new Error('流式讲义的打印画面格式不正确。')
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
          resolveComponentName: (packageId, version) => {
            const component = project.componentPackages[packageId]
            return component?.version === version ? component.name : undefined
          },
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
      const pagesToRender = [
        { kind: 'home' as const },
        ...entry.cameraFrameIds.map((frameId) => ({
          kind: 'frame' as const,
          frameId,
          frame: surface.camera.frames.find((frame) => frame.id === frameId),
        })),
      ]
      for (const page of pagesToRender) {
        const frame = page.kind === 'frame' ? page.frame : undefined
        const sourceId = page.kind === 'frame' ? page.frameId : `${surface.id}:home`
        try {
          if (page.kind === 'frame' && !frame) {
            throw new Error('空间画布中有一个镜头已不存在，无法导出该页。')
          }
          const pose = page.kind === 'home' ? surface.camera.home : frame!
          const camera = spatialCameraFromPose(pose, SPATIAL_CANONICAL_VIEWPORT)
          const locationId = spatialPrintLocationId(
            project,
            surface.id,
            page.kind === 'frame' ? page.frameId : undefined,
          )
          const printable = spatialPrintSurfaceAtLocation(project, surface, locationId)
          for (const warning of printable.warnings) {
            if (!warnings.includes(warning)) warnings.push(warning)
          }
          pages.push({
            id: `${entry.id}:${sourceId}`,
            surfaceId: surface.id,
            surfaceKind: 'spatial-2d',
            title: page.kind === 'home' ? `${surface.title} — 首页` : frame!.name,
            bodyHtml: `<div class="spatial-print-frame">${renderSpatialSvgMarkup(printable.surface, camera, resolveAsset)}</div>`,
            pageSize: size,
            sourceFrameId: page.kind === 'frame' ? page.frameId : undefined,
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
