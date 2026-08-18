import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import {
  addCourseFlowPage,
  addCourseSpatialPage,
} from '@/renderer/course/courseLocationCommands'
import { buildPublishedCourseV2Payload } from '@/renderer/export/course/buildPublishedCourse'
import {
  buildCourseExportPageList,
  buildCoursePrintArtifacts,
  renderPublishedSpatialFrameSvg,
  SPATIAL_EXPORT_VIEWPORT,
} from '@/renderer/export/course/buildCoursePrintArtifacts'
import { buildFlowDocx } from '@/renderer/export/course/flowDocx'
import {
  buildFlowPrintPlan,
  flowPrintPlanHasRuntimeToc,
  renderFlowPrintHtml,
} from '@/renderer/export/course/flowPrintPlan'
import { createBlankCourseProject } from '@/renderer/project/createCourseProject'

const NOW = '2026-08-17T12:00:00.000Z'
const ASSET_BYTES = new Uint8Array([1, 2, 3, 4])

function mixedPublishedFixture() {
  let project = createBlankCourseProject({ now: NOW, includeDefaultController: true })
  const flowAdded = addCourseFlowPage(project, {
    now: NOW,
    expectedRevision: project.revision,
    title: '阅读任务',
  })
  expect(flowAdded.ok).toBe(true)
  if (!flowAdded.ok) throw new Error(flowAdded.reason)
  project = flowAdded.project

  const spatialAdded = addCourseSpatialPage(project, {
    now: NOW,
    expectedRevision: project.revision,
    title: '无限画布',
  })
  expect(spatialAdded.ok).toBe(true)
  if (!spatialAdded.ok) throw new Error(spatialAdded.reason)
  project = spatialAdded.project as CourseProjectDocument

  const spatialSurface = project.surfaces.find((surface) => surface.type === 'spatial-2d')
  if (spatialSurface?.type === 'spatial-2d') {
    spatialSurface.world.bounds = { mode: 'infinite' }
  }

  const assetFiles = Object.fromEntries(
    Object.keys(project.assets).map((id) => [id, ASSET_BYTES]),
  )
  const published = buildPublishedCourseV2Payload({
    project,
    assetFiles,
    components: {},
  })
  return { project, published }
}

describe('buildCoursePrintArtifacts', () => {
  it('builds mixed print/DOCX file list and keeps HUD plus runtime TOC out of files', async () => {
    const { project, published } = mixedPublishedFixture()
    const flowSurface = published.surfaces.find((surface) => surface.type === 'flow')
    if (flowSurface?.type !== 'flow') throw new Error('expected flow surface')

    const plan = buildFlowPrintPlan(flowSurface)
    expect(plan.includesRuntimeToc).toBe(false)
    expect(flowPrintPlanHasRuntimeToc(plan)).toBe(false)
    const flowHtml = renderFlowPrintHtml(plan)
    expect(flowHtml).not.toContain('flow-runtime-toc')
    expect(flowHtml).not.toContain('打开目录')

    const docx = buildFlowDocx(flowSurface)
    const docxXml = strFromU8(unzipSync(docx.bytes)['word/document.xml']!)
    expect(docxXml).not.toContain('flow-runtime-toc')
    expect(docxXml).not.toContain('打开目录')

    const spatialSurface = published.surfaces.find((surface) => surface.type === 'spatial-2d')
    if (spatialSurface?.type !== 'spatial-2d') throw new Error('expected spatial surface')
    const { svg, viewport } = renderPublishedSpatialFrameSvg(
      spatialSurface,
      spatialSurface.camera.frames[0]?.id,
      () => undefined,
    )
    expect(viewport).toEqual(SPATIAL_EXPORT_VIEWPORT)
    expect(viewport.width).not.toBe(1280)
    expect(viewport.height).not.toBe(720)
    expect(svg).toContain('data-spatial-viewport="1120x760"')

    const result = await buildCoursePrintArtifacts(published, {
      resolveAssetBytes: (assetId) => ({
        bytes: ASSET_BYTES,
        mimeType: published.assets[assetId]?.mimeType ?? 'application/octet-stream',
      }),
    })

    expect(buildCourseExportPageList(published).length).toBeGreaterThan(0)
    expect(result.files.some((file) => file.kind === 'flow-print-html')).toBe(true)
    expect(result.files.some((file) => file.kind === 'docx')).toBe(true)
    expect(result.report.some((item) => item.message.includes('全局图层'))).toBe(true)

    const mixedHtml = new TextDecoder().decode(
      result.files.find((file) => file.kind === 'flow-print-html')!.bytes,
    )
    expect(mixedHtml).not.toContain('全局')
    expect(mixedHtml).not.toContain(project.globalLayerItems[0]?.item.layerItemId ?? 'missing-global')
    expect(mixedHtml).not.toContain('flow-runtime-toc')
    expect(mixedHtml).toContain('data-spatial-viewport="1120x760"')
  })

  it('returns Chinese reasons for missing assets without throwing', async () => {
    const { published } = mixedPublishedFixture()
    const broken = structuredClone(published)
    broken.assets['missing-flow-image'] = { mimeType: 'image/png', url: '' }

    const result = await buildCoursePrintArtifacts(broken)
    expect(result.files.length).toBeGreaterThan(0)
    expect(result.report.some((item) => (
      item.severity === 'error' && item.message.includes('缺少可离线引用')
    ))).toBe(true)
  })
})
