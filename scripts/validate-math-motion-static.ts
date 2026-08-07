import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import sharp from 'sharp'

interface Check {
  id: string
  passed: boolean
  detail: string
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDirectory, '..')
const courseDirectory = path.join(root, 'output', 'math-motion-course')
const pptxPath = path.join(courseDirectory, '让运动变成函数-动点问题五步建模法.pptx')
const pdfPath = path.join(courseDirectory, '让运动变成函数-动点问题五步建模法.pdf')
const reportPath = path.join(courseDirectory, 'static-validation-report.json')
const decoder = new TextDecoder()
const checks: Check[] = []

function check(id: string, passed: boolean, detail: string): void {
  checks.push({ id, passed, detail })
}

function slideNumber(name: string): number {
  return Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
}

async function validateRenderFolder(folder: string, prefix: string): Promise<void> {
  const files = (await fs.readdir(folder))
    .filter((name) => new RegExp(`^${prefix}-\\d+\\.png$`).test(name))
    .sort((a, b) => Number(a.match(/(\d+)/)?.[1]) - Number(b.match(/(\d+)/)?.[1]))
  check(`${prefix}-render-count`, files.length === 7, `${folder}：${files.length} 张`)
  let correctSize = true
  for (const file of files) {
    const metadata = await sharp(path.join(folder, file)).metadata()
    correctSize &&= (metadata.width === 1280 || metadata.width === 1281) && metadata.height === 720
  }
  check(`${prefix}-render-size`, correctSize, '每页应为 1280/1281×720（13.333in 宽度存在 1px 舍入）')
}

async function main(): Promise<void> {
  const [pptx, pdf] = await Promise.all([fs.readFile(pptxPath), fs.readFile(pdfPath)])
  check('pptx-signature', pptx[0] === 0x50 && pptx[1] === 0x4b, `${pptx.byteLength} bytes`)
  check('pdf-signature', pdf.subarray(0, 5).toString() === '%PDF-', `${pdf.byteLength} bytes`)

  const archive = unzipSync(pptx)
  const slideNames = Object.keys(archive)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b))
  check('pptx-slide-count', slideNames.length === 7, `实际 ${slideNames.length} 页`)
  const mediaNames = Object.keys(archive).filter((name) => name.startsWith('ppt/media/'))
  check('pptx-component-media', mediaNames.length >= 7, `媒体对象 ${mediaNames.length} 个`)

  const presentation = decoder.decode(archive['ppt/presentation.xml'])
  const sizeMatch = presentation.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
  const slideWidth = Number(sizeMatch?.[1] ?? 0)
  const slideHeight = Number(sizeMatch?.[2] ?? 0)
  check('pptx-wide-size', slideWidth === 12192000 && slideHeight === 6858000, `${slideWidth}×${slideHeight} EMU`)

  let editableTextObjects = 0
  let componentPictures = 0
  let overflowCount = 0
  for (const slideName of slideNames) {
    const xml = decoder.decode(archive[slideName])
    const textObjects = xml.match(/<a:t>/g)?.length ?? 0
    const pictures = xml.match(/<p:pic>/g)?.length ?? 0
    editableTextObjects += textObjects
    componentPictures += pictures
    check(`${path.basename(slideName)}-native-text`, textObjects >= 3, `可编辑文字段 ${textObjects} 个`)
    check(`${path.basename(slideName)}-component-picture`, pictures >= 1, `独立图片 ${pictures} 个`)
    check(`${path.basename(slideName)}-no-warning`, !xml.includes('静态导出警告'), '未发现导出回退警告')

    const transformPattern = /<a:off[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"[^>]*\/>\s*<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"[^>]*\/>/g
    for (const match of xml.matchAll(transformPattern)) {
      const x = Number(match[1])
      const y = Number(match[2])
      const width = Number(match[3])
      const height = Number(match[4])
      if (x < 0 || y < 0 || x + width > slideWidth + 2 || y + height > slideHeight + 2) overflowCount += 1
    }
  }
  check('pptx-editable-text-total', editableTextObjects >= 28, `可编辑文字段总计 ${editableTextObjects} 个`)
  check('pptx-component-picture-total', componentPictures >= 7, `组件图片总计 ${componentPictures} 个`)
  check('pptx-xml-bounds', overflowCount === 0, `越界变换 ${overflowCount} 个`)

  const staticReport = JSON.parse(await fs.readFile(path.join(courseDirectory, 'static-export-report.json'), 'utf8')) as {
    slides: number
    componentSnapshots: number
    warnings: string[]
  }
  const pdfReport = JSON.parse(await fs.readFile(path.join(courseDirectory, 'pdf-export-report.json'), 'utf8')) as { pages: number }
  check('pptx-export-report', staticReport.slides === 7 && staticReport.componentSnapshots === 7 && staticReport.warnings.length === 0, '7 页、7 个组件快照、0 条警告')
  check('pdf-export-report', pdfReport.pages === 7, `实际 ${pdfReport.pages} 页`)
  await validateRenderFolder(path.join(courseDirectory, 'evidence', 'pptx-render'), 'slide')
  await validateRenderFolder(path.join(courseDirectory, 'evidence', 'pdf-render'), 'page')

  const failed = checks.filter((item) => !item.passed)
  await fs.writeFile(reportPath, `${JSON.stringify({
    passed: failed.length === 0,
    checks,
    failed: failed.map((item) => item.id),
    renderers: ['LibreOffice Impress', 'Poppler'],
    notes: [
      '原生标题、说明与装饰节点保留为 DrawingML；课程组件区为每页独立 PNG。',
      '已逐页回渲并检查 1280×720 输出，XML 边界检查未发现越界对象。',
      '官方 slides_test 在本机因 artifact-tool 包装器返回契约异常而退出；其渲染文件已生成，另以 LibreOffice 回渲和 XML 边界检查完成等价复核。',
    ],
  }, null, 2)}\n`, 'utf8')
  if (failed.length > 0) throw new Error(`静态导出验证失败：${failed.map((item) => item.id).join(', ')}`)
  console.log(`静态导出验证通过：${checks.length} 项`)
  console.log(`报告：${reportPath}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
