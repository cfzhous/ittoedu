import { APP_COMPANY, APP_NAME } from '../../../shared/constants'
import type {
  CourseProjectDocument,
  LayerItem,
  LayerItemOverride,
  ScopedLayerItem,
  SlideSceneDocument,
  SlideSurfaceDocument,
} from '../../../shared/courseProjectTypes'
import type { SceneNode } from '../../../shared/projectTypes'
import { bytesToDataUrl } from '../base64'
import {
  pptxColor,
  pptxNodePosition,
  pptxRotation,
  pptxTransparency,
  WIDE_SLIDE_HEIGHT,
  WIDE_SLIDE_WIDTH,
  type CanvasScale,
  type PptxSlide,
} from '../pptxShared'
import {
  addPptxFormulaNode,
  addPptxShapeNode,
  addPptxTextNode,
} from '../pptxTextAndShape'
import {
  buildCourseExportDifferenceReport,
  type CourseExportDifference,
} from './printArtifacts'

export interface CoursePptxDynamicCaptureContext {
  project: CourseProjectDocument
  surface: SlideSurfaceDocument
  scene: SlideSceneDocument
  item: Extract<LayerItem, { kind: 'component' | 'runtime' }>
}

export interface BuildCoursePptxOptions {
  /** Return a PNG/JPEG data URL captured from the actual item host. */
  captureDynamicItem?(context: CoursePptxDynamicCaptureContext): string | undefined | Promise<string | undefined>
  onWarning?(message: string): void
}

export interface CoursePptxResult {
  bytes: Uint8Array
  slideCount: number
  warnings: string[]
  differences: CourseExportDifference[]
}

function isScopedVisible(entry: ScopedLayerItem, locationId: string): boolean {
  if (entry.visibility.mode === 'all') return true
  const includes = entry.visibility.locationIds.includes(locationId)
  return entry.visibility.mode === 'include' ? includes : !includes
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(base)
  for (const [key, value] of Object.entries(patch)) {
    const previous = next[key]
    next[key] = value && typeof value === 'object' && !Array.isArray(value) && previous && typeof previous === 'object' && !Array.isArray(previous)
      ? deepMerge(previous as Record<string, unknown>, value as Record<string, unknown>)
      : structuredClone(value)
  }
  return next
}

function applyOverride(item: LayerItem, override: LayerItemOverride | undefined): LayerItem {
  if (!override) return structuredClone(item)
  const next = structuredClone(item)
  if (override.label !== undefined) next.label = override.label
  if (override.frame !== undefined) next.frame = { ...next.frame, ...override.frame }
  if (override.order !== undefined) next.order = override.order
  if (override.visible !== undefined) next.visible = override.visible
  if (override.locked !== undefined) next.locked = override.locked
  if (override.rotation !== undefined) next.rotation = override.rotation
  if (override.opacity !== undefined) next.opacity = override.opacity
  if (override.hitPolicy !== undefined) next.hitPolicy = override.hitPolicy
  if (override.playbackInitialVisibility !== undefined) next.playbackInitialVisibility = override.playbackInitialVisibility
  if (next.kind === 'native' && override.nativeData) {
    next.content.data = deepMerge(next.content.data as Record<string, unknown>, override.nativeData) as typeof next.content.data
  } else if (next.kind === 'component' && override.componentProps) {
    next.props = deepMerge(next.props, override.componentProps)
  }
  return next
}

function sceneItems(
  project: CourseProjectDocument,
  surface: SlideSurfaceDocument,
  scene: SlideSceneDocument,
): LayerItem[] {
  const state = scene.presentation?.states.find((candidate) => candidate.id === scene.presentation?.initialStateId)
  const location = project.locations.find((candidate) => candidate.kind === 'slide-scene' && candidate.surfaceId === surface.id && candidate.sceneId === scene.id)
  const locationId = location?.id ?? scene.id
  const entries = [
    ...project.globalLayerItems.filter((entry) => isScopedVisible(entry, locationId)).map((entry) => structuredClone(entry.item)),
    ...surface.surfaceLayerItems.filter((entry) => isScopedVisible(entry, locationId)).map((entry) => structuredClone(entry.item)),
    ...scene.layerItems.map((item) => applyOverride(item, state?.layerItemOverrides[item.layerItemId])),
  ]
  const explicit = state?.layerItemOrder ? new Map(state.layerItemOrder.map((id, index) => [id, index])) : null
  if (explicit) {
    entries.forEach((item) => {
      const order = explicit.get(item.layerItemId)
      if (order !== undefined) item.order = order
    })
  }
  return entries.sort((left, right) => left.order - right.order || left.layerItemId.localeCompare(right.layerItemId))
}

function nativeNode(item: Extract<LayerItem, { kind: 'native' }>): SceneNode {
  return {
    ...structuredClone(item.content.data),
    id: item.layerItemId,
    name: item.label,
    type: item.content.nativeType,
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: item.rotation,
    opacity: item.opacity,
    visible: item.visible,
    locked: item.locked,
    playbackInitialVisibility: item.playbackInitialVisibility,
  } as SceneNode
}

function assetData(
  project: CourseProjectDocument,
  assetFiles: Readonly<Record<string, Uint8Array>>,
  assetId: string,
): string | undefined {
  const meta = project.assets[assetId]
  const bytes = assetFiles[assetId]
  return meta && bytes ? bytesToDataUrl(bytes, meta.mimeType) : undefined
}

function addImage(
  slide: PptxSlide,
  item: Pick<LayerItem, 'frame' | 'rotation' | 'opacity' | 'label' | 'layerItemId'>,
  data: string,
  scale: CanvasScale,
  suffix: string,
): void {
  slide.addImage({
    data,
    x: item.frame.x * scale.x,
    y: item.frame.y * scale.y,
    w: item.frame.width * scale.x,
    h: item.frame.height * scale.y,
    rotate: pptxRotation(item.rotation),
    transparency: pptxTransparency(item.opacity),
    objectName: `${item.label} · ${item.layerItemId} · ${suffix}`,
    altText: `${item.label}（${suffix}）`,
  })
}

function addPlaceholder(slide: PptxSlide, item: LayerItem, scale: CanvasScale, message: string): void {
  slide.addText(message, {
    x: item.frame.x * scale.x,
    y: item.frame.y * scale.y,
    w: item.frame.width * scale.x,
    h: item.frame.height * scale.y,
    rotate: pptxRotation(item.rotation),
    transparency: pptxTransparency(item.opacity),
    objectName: `${item.label} · ${item.layerItemId} · 静态占位`,
    fill: { color: item.kind === 'runtime' ? 'F5F3FF' : 'EFF6FF' },
    line: { color: item.kind === 'runtime' ? '7C3AED' : '2563EB', width: 1.25, dashType: 'dash' },
    color: '334155',
    fontFace: 'Microsoft YaHei',
    fontSize: 13,
    align: 'center',
    valign: 'middle',
    margin: 5,
    fit: 'shrink',
  })
}

async function addNative(
  slide: PptxSlide,
  item: Extract<LayerItem, { kind: 'native' }>,
  project: CourseProjectDocument,
  assetFiles: Readonly<Record<string, Uint8Array>>,
  scale: CanvasScale,
  warnings: string[],
): Promise<void> {
  const node = nativeNode(item)
  if (!node.visible) return
  if (node.type === 'text') addPptxTextNode(slide, node, scale)
  else if (node.type === 'formula') addPptxFormulaNode(slide, node, scale)
  else if (node.type === 'shape') addPptxShapeNode(slide, node, scale)
  else if (node.type === 'image') {
    const data = assetData(project, assetFiles, node.assetId)
    if (data) addImage(slide, item, data, scale, '可编辑图片')
    else {
      addPlaceholder(slide, item, scale, `图片素材缺失\n${node.assetId}`)
      warnings.push(`图片“${item.label}”的素材 ${node.assetId} 缺失。`)
    }
  } else if (node.type === 'video') {
    const poster = node.poster.assetId ? assetData(project, assetFiles, node.poster.assetId) : undefined
    if (poster) addImage(slide, item, poster, scale, '视频封面')
    else addPlaceholder(slide, item, scale, `▶ 视频\n${project.assets[node.assetId]?.filename ?? item.label}`)
    warnings.push(`视频“${item.label}”在 PPTX 中使用可选择封面/占位，不保留播放交互。`)
  } else if (node.type === 'teacher-controller') {
    if (!node.includeInStaticExports) return
    slide.addText(node.title, {
      ...pptxNodePosition(node, scale),
      rotate: pptxRotation(node.rotation),
      color: pptxColor(node.style.textColor, 'F8FAFC'),
      fill: { color: pptxColor(node.style.backgroundColor, '172033'), transparency: pptxTransparency(node.style.backgroundOpacity) },
      line: { color: pptxColor(node.style.accentColor, 'E7B85C'), width: 1 },
      fontFace: 'Microsoft YaHei', fontSize: 13, align: 'center', valign: 'middle',
      objectName: `${item.label} · ${item.layerItemId} · 教师控制器`,
    })
  }
}

function addWarningNote(slide: PptxSlide, warnings: readonly string[]): void {
  if (warnings.length === 0) return
  const text = `静态导出提示：${[...new Set(warnings)].join(' ')}`
  slide.addText(text, {
    x: .15, y: 6.92, w: 13.03, h: .42,
    objectName: '导出差异说明', margin: 3,
    fontFace: 'Microsoft YaHei', fontSize: 8.5, bold: true,
    color: '7C2D12', fill: { color: 'FEF3C7', transparency: 5 },
    line: { color: 'F59E0B', width: .75 }, fit: 'shrink', valign: 'middle',
  })
  slide.addNotes(text)
}

/**
 * Real V9 Slide -> PPTX exporter. It consumes unified LayerItem order directly:
 * Native text/shape remain Office objects, formula is the documented static
 * formula mapping, and dynamic items use actual captures or authored fallback.
 */
export async function buildCoursePptx(
  project: CourseProjectDocument,
  assetFiles: Readonly<Record<string, Uint8Array>>,
  options: BuildCoursePptxOptions = {},
): Promise<CoursePptxResult> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = APP_NAME
  pptx.company = APP_COMPANY
  pptx.title = project.title
  pptx.subject = 'Course Project V9 Slide 可编辑兼容导出'
  pptx.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei' }
  const scale: CanvasScale = { x: WIDE_SLIDE_WIDTH / 1280, y: WIDE_SLIDE_HEIGHT / 720 }
  const warnings: string[] = []
  let slideCount = 0
  for (const surface of project.surfaces) {
    if (surface.type !== 'slide') continue
    for (const scene of surface.scenes) {
      slideCount += 1
      const slide = pptx.addSlide()
      const sceneWarnings: string[] = []
      const state = scene.presentation?.states.find((candidate) => candidate.id === scene.presentation?.initialStateId)
      slide.background = { color: pptxColor(state?.backgroundColor ?? scene.backgroundColor, 'FFFFFF') }
      const backgroundAssetId = state?.backgroundAssetId === undefined ? scene.backgroundAssetId : state.backgroundAssetId
      if (backgroundAssetId) {
        const background = assetData(project, assetFiles, backgroundAssetId)
        if (background) slide.addImage({ data: background, x: 0, y: 0, w: WIDE_SLIDE_WIDTH, h: WIDE_SLIDE_HEIGHT, objectName: `${scene.name} · 背景图片` })
        else sceneWarnings.push(`场景“${scene.name}”背景素材缺失。`)
      }
      for (const item of sceneItems(project, surface, scene)) {
        if (!item.visible) continue
        if (item.kind === 'native') {
          await addNative(slide, item, project, assetFiles, scale, sceneWarnings)
          continue
        }
        let captured: string | undefined
        try {
          captured = await options.captureDynamicItem?.({ project, surface, scene, item })
        } catch (cause) {
          sceneWarnings.push(`${item.kind} “${item.label}”实例快照失败：${cause instanceof Error ? cause.message : String(cause)}`)
        }
        if (captured?.startsWith('data:image/')) {
          addImage(slide, item, captured, scale, '实际运行快照')
        } else {
          const fallbackId = item.kind === 'component' ? item.staticFallbackAssetId : item.runtime.staticFallback?.assetId
          const fallback = fallbackId ? assetData(project, assetFiles, fallbackId) : undefined
          if (fallback) {
            addImage(slide, item, fallback, scale, '作者静态后备')
            sceneWarnings.push(`${item.kind} “${item.label}”在 PPTX 中使用作者静态后备。`)
          } else {
            addPlaceholder(slide, item, scale, `${item.kind === 'component' ? '互动组件' : '互动运行时'}\n${item.label}`)
            sceneWarnings.push(`${item.kind} “${item.label}”无快照或静态后备，已使用可选择占位，未静默省略。`)
          }
        }
      }
      sceneWarnings.forEach((message) => options.onWarning?.(message))
      warnings.push(...sceneWarnings)
      addWarningNote(slide, sceneWarnings)
    }
  }
  if (slideCount === 0) throw new Error('当前课程没有 Slide 表面，无法生成 PPTX。')
  const nonSlideDifferences = project.surfaces
    .filter((surface) => surface.type !== 'slide')
    .map((surface) => `${surface.type} 表面“${surface.title}”没有 PPTX 映射，已明确忽略。`)
  warnings.push(...nonSlideDifferences)
  nonSlideDifferences.forEach((message) => options.onWarning?.(message))
  const output = await pptx.write({ outputType: 'arraybuffer', compression: true })
  return {
    bytes: new Uint8Array(output as ArrayBuffer),
    slideCount,
    warnings,
    differences: buildCourseExportDifferenceReport(project.surfaces.map((surface) => ({ id: surface.id, kind: surface.type }))),
  }
}
