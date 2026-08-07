import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDirectory, '..')
const referencePath = path.join(
  root,
  'docs',
  'courseware-pilots',
  'math-motion',
  'references',
  'linked-graph-reference.png',
)
const evidenceDirectory = path.join(root, 'output', 'math-motion-sample', 'evidence')
const implementationPath = path.join(evidenceDirectory, 'linked-proved.png')
const comparisonPath = path.join(evidenceDirectory, 'linked-graph-comparison.png')
const focusComparisonPath = path.join(evidenceDirectory, 'linked-graph-focus-comparison.png')
const metadataPath = path.join(evidenceDirectory, 'visual-evidence-metadata.json')
const thumbnailPath = path.join(root, 'examples', 'math-motion-function-lab', 'thumbnail.png')

function labelSvg(width: number, left: string, right: string): Buffer {
  return Buffer.from(`
    <svg width="${width}" height="50" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="50" fill="#16191F"/>
      <text x="24" y="32" fill="#FFFFFF" font-family="Microsoft YaHei, sans-serif" font-size="18" font-weight="700">${left}</text>
      <text x="${width / 2 + 24}" y="32" fill="#FFFFFF" font-family="Microsoft YaHei, sans-serif" font-size="18" font-weight="700">${right}</text>
      <line x1="${width / 2}" y1="0" x2="${width / 2}" y2="50" stroke="#74777C" stroke-width="1"/>
    </svg>
  `)
}

async function main(): Promise<void> {
  await fs.mkdir(evidenceDirectory, { recursive: true })
  const [referenceMetadata, implementationMetadata] = await Promise.all([
    sharp(referencePath).metadata(),
    sharp(implementationPath).metadata(),
  ])
  const normalizedReference = await sharp(referencePath)
    .resize(1280, 720, { fit: 'fill' })
    .png()
    .toBuffer()
  const normalizedImplementation = await sharp(implementationPath)
    .resize(1280, 720, { fit: 'fill' })
    .png()
    .toBuffer()
  await sharp({
    create: { width: 2560, height: 770, channels: 4, background: '#FBF8F1' },
  })
    .composite([
      { input: labelSvg(2560, '批准视觉目标（公式几何不一致，仅审阅视觉语言）', '1280×720 实际完成态（数学真相优先）'), left: 0, top: 0 },
      { input: normalizedReference, left: 0, top: 50 },
      { input: normalizedImplementation, left: 1280, top: 50 },
    ])
    .png()
    .toFile(comparisonPath)

  const [referenceFocus, implementationFocus] = await Promise.all([
    sharp(normalizedReference)
      .extract({ left: 70, top: 135, width: 1170, height: 500 })
      .png()
      .toBuffer(),
    sharp(normalizedImplementation)
      .extract({ left: 70, top: 135, width: 1170, height: 500 })
      .png()
      .toBuffer(),
  ])
  await sharp({
    create: { width: 2340, height: 550, channels: 4, background: '#FBF8F1' },
  })
    .composite([
      { input: labelSvg(2340, '目标：核心图式区域', '实现：核心图式区域'), left: 0, top: 0 },
      { input: referenceFocus, left: 0, top: 50 },
      { input: implementationFocus, left: 1170, top: 50 },
    ])
    .png()
    .toFile(focusComparisonPath)

  await sharp(normalizedImplementation)
    .extract({ left: 88, top: 154, width: 1136, height: 452 })
    .resize(568, 226, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(thumbnailPath)

  const metadata = {
    generatedAt: new Date().toISOString(),
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    source: {
      path: path.relative(root, referencePath).replaceAll('\\', '/'),
      pixels: { width: referenceMetadata.width, height: referenceMetadata.height },
      normalizedPixels: { width: 1280, height: 720 },
    },
    implementation: {
      path: path.relative(root, implementationPath).replaceAll('\\', '/'),
      pixels: { width: implementationMetadata.width, height: implementationMetadata.height },
      normalizedPixels: { width: 1280, height: 720 },
    },
    comparisons: [
      path.relative(root, comparisonPath).replaceAll('\\', '/'),
      path.relative(root, focusComparisonPath).replaceAll('\\', '/'),
    ],
    thumbnail: path.relative(root, thumbnailPath).replaceAll('\\', '/'),
  }
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  console.log(`完整对照：${comparisonPath}`)
  console.log(`局部对照：${focusComparisonPath}`)
  console.log(`真实缩略图：${thumbnailPath}`)
}

main().catch((error: unknown) => {
  console.error('生成动点样片视觉证据失败', error)
  process.exitCode = 1
})
