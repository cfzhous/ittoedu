import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp, { type OverlayOptions } from 'sharp'

interface CapturePage {
  index: number
  sceneId: string
  stateId: string | null
  pageOutput: string
  component: {
    nodeId: string
    snapshotKey: string
    output: string
    bounds: { x: number; y: number; width: number; height: number }
  }
}

interface CaptureConfig {
  viewport: { width: number; height: number }
  pages: CapturePage[]
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDirectory, '..')
const courseDirectory = path.join(root, 'output', 'math-motion-course')
const evidenceDirectory = path.join(courseDirectory, 'evidence')
const rawPagesDirectory = path.join(evidenceDirectory, 'raw-pages')
const browserFramesDirectory = path.join(evidenceDirectory, 'browser-frames')
const recordingFramesDirectory = path.join(evidenceDirectory, 'linked-recording')
const comparisonPath = path.join(evidenceDirectory, 'course-visual-comparison.png')
const storyboardPath = path.join(evidenceDirectory, 'seven-scene-storyboard.png')
const metadataPath = path.join(evidenceDirectory, 'visual-evidence-metadata.json')

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!)
}

function stripSvg(width: number, left: string, right: string): Buffer {
  return Buffer.from(`<svg width="${width}" height="44" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="44" fill="#16191F"/>
    <text x="18" y="29" fill="#FFFFFF" font-family="Microsoft YaHei, sans-serif" font-size="16" font-weight="700">${escapeXml(left)}</text>
    <text x="${width / 2 + 18}" y="29" fill="#FFFFFF" font-family="Microsoft YaHei, sans-serif" font-size="16" font-weight="700">${escapeXml(right)}</text>
    <line x1="${width / 2}" y1="0" x2="${width / 2}" y2="44" stroke="#74777C"/>
  </svg>`)
}

function singleLabelSvg(width: number, label: string): Buffer {
  return Buffer.from(`<svg width="${width}" height="36" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="36" fill="#16191F"/>
    <text x="14" y="24" fill="#FFFFFF" font-family="Microsoft YaHei, sans-serif" font-size="14" font-weight="700">${escapeXml(label)}</text>
  </svg>`)
}

async function normalize(input: string, output: string, width: number, height: number): Promise<Buffer> {
  const rendered = await sharp(input).resize(width, height, { fit: 'fill' }).png().toBuffer()
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, rendered)
  return rendered
}

async function main(): Promise<void> {
  const config = JSON.parse(await fs.readFile(path.join(courseDirectory, 'capture-config.json'), 'utf8')) as CaptureConfig
  const viewport = config.viewport
  const pageBuffers = new Map<string, Buffer>()
  const componentSnapshots: Record<string, string> = {}

  for (const page of config.pages) {
    const basename = `${String(page.index).padStart(2, '0')}-${page.sceneId}`
    const rawPath = path.join(rawPagesDirectory, `${basename}.jpg`)
    const pagePath = path.join(courseDirectory, page.pageOutput)
    const pageBuffer = await normalize(rawPath, pagePath, viewport.width, viewport.height)
    pageBuffers.set(page.sceneId, pageBuffer)

    const componentPath = path.join(courseDirectory, page.component.output)
    await fs.mkdir(path.dirname(componentPath), { recursive: true })
    await sharp(pageBuffer)
      .extract({
        left: Math.round(page.component.bounds.x),
        top: Math.round(page.component.bounds.y),
        width: Math.round(page.component.bounds.width),
        height: Math.round(page.component.bounds.height),
      })
      .png({ compressionLevel: 9 })
      .toFile(componentPath)
    componentSnapshots[page.component.snapshotKey] = path.relative(root, componentPath).replaceAll('\\', '/')
  }

  const keyFrames = [
    ['prediction-open-latest.jpg', 'prediction-open.png'],
    ['linked-05-proved-latest.jpg', 'linked-proved.png'],
    ['transfer-complete.jpg', 'transfer-complete.png'],
  ] as const
  for (const [source, target] of keyFrames) {
    await normalize(
      path.join(browserFramesDirectory, source),
      path.join(evidenceDirectory, target),
      viewport.width,
      viewport.height,
    )
  }

  const comparisons = [
    {
      label: '01 预测初态',
      reference: path.join(root, 'docs', 'courseware-pilots', 'math-motion', 'references', 'prediction-reference.png'),
      actual: path.join(evidenceDirectory, 'prediction-open.png'),
    },
    {
      label: '04 图式联动完成态',
      reference: path.join(root, 'docs', 'courseware-pilots', 'math-motion', 'references', 'linked-graph-reference.png'),
      actual: path.join(evidenceDirectory, 'linked-proved.png'),
    },
    {
      label: '06 同构迁移完成态',
      reference: path.join(root, 'docs', 'courseware-pilots', 'math-motion', 'references', 'transfer-reference.png'),
      actual: path.join(evidenceDirectory, 'transfer-complete.png'),
    },
  ]
  const comparisonComposites: OverlayOptions[] = []
  for (let index = 0; index < comparisons.length; index += 1) {
    const item = comparisons[index]!
    const [reference, actual] = await Promise.all([
      sharp(item.reference).resize(640, 360, { fit: 'fill' }).png().toBuffer(),
      sharp(item.actual).resize(640, 360, { fit: 'fill' }).png().toBuffer(),
    ])
    const top = index * 404
    comparisonComposites.push(
      { input: stripSvg(1280, `${item.label} · 批准视觉目标`, `${item.label} · 实际浏览器画面`), left: 0, top },
      { input: reference, left: 0, top: top + 44 },
      { input: actual, left: 640, top: top + 44 },
    )
  }
  await sharp({ create: { width: 1280, height: comparisons.length * 404, channels: 4, background: '#FBF8F1' } })
    .composite(comparisonComposites)
    .png()
    .toFile(comparisonPath)

  const storyboardComposites: OverlayOptions[] = []
  for (const page of config.pages) {
    const column = (page.index - 1) % 2
    const row = Math.floor((page.index - 1) / 2)
    const left = column * 640
    const top = row * 396
    const image = await sharp(pageBuffers.get(page.sceneId)!)
      .resize(640, 360, { fit: 'fill' })
      .png()
      .toBuffer()
    storyboardComposites.push(
      { input: singleLabelSvg(640, `${String(page.index).padStart(2, '0')} · ${page.sceneId} · ${page.stateId ?? 'initial'}`), left, top },
      { input: image, left, top: top + 36 },
    )
  }
  await sharp({ create: { width: 1280, height: 1584, channels: 4, background: '#FBF8F1' } })
    .composite(storyboardComposites)
    .png()
    .toFile(storyboardPath)

  await fs.mkdir(recordingFramesDirectory, { recursive: true })
  const recordingSources = [
    'linked-00.jpg',
    'linked-02.jpg',
    'linked-03.jpg',
    'linked-04.jpg',
    'linked-05-proved.jpg',
    'linked-05-proved-latest.jpg',
    'linked-05-proved-latest.jpg',
    'linked-05-proved-latest.jpg',
  ]
  for (let index = 0; index < recordingSources.length; index += 1) {
    await normalize(
      path.join(browserFramesDirectory, recordingSources[index]!),
      path.join(recordingFramesDirectory, `frame-${String(index).padStart(2, '0')}.png`),
      viewport.width,
      viewport.height,
    )
  }

  await fs.writeFile(metadataPath, `${JSON.stringify({
    viewport,
    pageEvidence: config.pages.map((page) => page.pageOutput),
    componentSnapshots,
    keyFrames: keyFrames.map(([, target]) => `output/math-motion-course/evidence/${target}`),
    comparison: path.relative(root, comparisonPath).replaceAll('\\', '/'),
    storyboard: path.relative(root, storyboardPath).replaceAll('\\', '/'),
    recordingFrames: recordingSources.length,
    outcomeStatus: 'pending',
    notes: [
      '所有实际画面均来自 1280×720 独立浏览器播放器。',
      '视觉目标图仅用于并排审阅，不进入课件成品。',
      '联动探索态未显示 Smax=6，完成态才显示结论。',
    ],
  }, null, 2)}\n`, 'utf8')

  console.log(`七幕拼图：${storyboardPath}`)
  console.log(`视觉对照：${comparisonPath}`)
  console.log(`组件快照：${Object.keys(componentSnapshots).length} 个`)
}

main().catch((error: unknown) => {
  console.error('生成七幕课件视觉证据失败', error)
  process.exitCode = 1
})
