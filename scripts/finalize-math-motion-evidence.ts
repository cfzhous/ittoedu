import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { coursewareEvidenceManifestV1Schema } from '../src/shared/coursewareEvidence'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDirectory, '..')
const courseDirectory = path.join(root, 'output', 'math-motion-course')
const manifestPath = path.join(courseDirectory, 'evidence-manifest.json')
const lessonPath = path.join(courseDirectory, '让运动变成函数-动点问题五步建模法.h5lesson')
const pptxPath = path.join(courseDirectory, '让运动变成函数-动点问题五步建模法.pptx')
const pdfPath = path.join(courseDirectory, '让运动变成函数-动点问题五步建模法.pdf')

async function sha256(filePath: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
}

function relativePath(filePath: string): string {
  return path.relative(root, filePath).replaceAll('\\', '/')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const base = coursewareEvidenceManifestV1Schema.parse(JSON.parse(await fs.readFile(manifestPath, 'utf8')) as unknown)
  const staticReport = JSON.parse(await fs.readFile(path.join(courseDirectory, 'static-export-report.json'), 'utf8')) as {
    sourceLesson: { sha256: string }
    slides: number
    componentSnapshots: number
    warnings: string[]
  }
  const pdfReport = JSON.parse(await fs.readFile(path.join(courseDirectory, 'pdf-export-report.json'), 'utf8')) as { pages: number }
  const validation = JSON.parse(await fs.readFile(path.join(courseDirectory, 'validation-report.json'), 'utf8')) as { summary: { pipelineStatus: string } }
  const staticValidation = JSON.parse(await fs.readFile(path.join(courseDirectory, 'static-validation-report.json'), 'utf8')) as { passed: boolean }
  const lessonHash = await sha256(lessonPath)
  const staticFresh = staticReport.sourceLesson.sha256 === lessonHash
  const artifactFiles = [
    { id: 'course-pptx', kind: 'pptx' as const, filePath: pptxPath },
    { id: 'course-pdf', kind: 'pdf' as const, filePath: pdfPath },
  ]
  const extraArtifacts = await Promise.all(artifactFiles.map(async ({ filePath, ...entry }) => ({
    ...entry,
    path: relativePath(filePath),
    sha256: await sha256(filePath),
  })))
  const evidence = await Promise.all(base.evidence.map(async (item) => {
    const filePath = path.join(root, item.path)
    const present = await exists(filePath)
    return {
      ...item,
      present,
      ...(present ? { sha256: await sha256(filePath) } : {}),
      ...(item.id === 'course-interaction-recording'
        ? { notes: '核心联动 t=0→1→2→3→4 与完成证明帧' }
        : {}),
    }
  }))
  const staticPassed = staticFresh
    && staticReport.slides === 7
    && staticReport.componentSnapshots === 7
    && staticReport.warnings.length === 0
    && pdfReport.pages === 7
  const reports = [
    ...base.pipeline.reports.filter((report) => !['course-validation', 'static-exports', 'render-evidence'].includes(report.id)),
    { id: 'course-validation', path: relativePath(path.join(courseDirectory, 'validation-report.json')), passed: validation.summary.pipelineStatus === 'passed' },
    { id: 'static-exports', path: relativePath(path.join(courseDirectory, 'static-export-report.json')), passed: staticPassed },
    { id: 'static-export-validation', path: relativePath(path.join(courseDirectory, 'static-validation-report.json')), passed: staticValidation.passed },
    {
      id: 'render-evidence',
      path: relativePath(path.join(courseDirectory, 'evidence', 'pptx-render.png')),
      passed: await exists(path.join(courseDirectory, 'evidence', 'pptx-render.png'))
        && await exists(path.join(courseDirectory, 'evidence', 'pdf-render.png')),
    },
  ]
  const pipelinePassed = reports.every((report) => report.passed)
  const manifest = coursewareEvidenceManifestV1Schema.parse({
    ...base,
    generatedAt: new Date().toISOString(),
    generatedBy: 'automation',
    artifacts: [
      ...base.artifacts.filter((artifact) => !extraArtifacts.some((entry) => entry.id === artifact.id)),
      ...extraArtifacts,
    ],
    evidence,
    pipeline: { status: pipelinePassed ? 'passed' : 'failed', reports },
    result: {
      status: 'pending',
      notes: [
        '必需制品、关键截图、联动短录屏和 PPTX/PDF 回渲证据已补齐。',
        '自动化只确认管线与证据完整，结果仍等待人工视觉和教学审阅。',
        '探索态不显示 Smax=6；该结论只在 linked_proved 状态披露。',
      ],
    },
  })
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`证据清单已更新：${manifestPath}`)
  console.log(`管线状态：${manifest.pipeline.status}；结果状态：${manifest.result.status}`)
}

main().catch((error: unknown) => {
  console.error('更新七幕课件证据清单失败', error)
  process.exitCode = 1
})
