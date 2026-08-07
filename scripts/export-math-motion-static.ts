import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildExportPayload } from '../src/renderer/export/buildExportPayload'
import { buildPptx } from '../src/renderer/export/buildPptx'
import { importComponentPackage } from '../src/renderer/components/importComponentPackage'
import { openProjectArchive } from '../src/renderer/project/projectArchive'
import { projectDocumentSchema } from '../src/shared/projectSchema'

interface VisualEvidenceMetadata {
  componentSnapshots: Record<string, string>
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDirectory, '..')
const courseDirectory = path.join(root, 'output', 'math-motion-course')
const lessonPath = path.join(courseDirectory, '让运动变成函数-动点问题五步建模法.h5lesson')
const componentPath = path.join(courseDirectory, 'motion-function-lab.h5component')
const pptxPath = path.join(courseDirectory, '让运动变成函数-动点问题五步建模法.pptx')
const reportPath = path.join(courseDirectory, 'static-export-report.json')
const metadataPath = path.join(courseDirectory, 'evidence', 'visual-evidence-metadata.json')

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function installTextLayoutDom(): void {
  const createCanvas = () => ({
    width: 1,
    height: 1,
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwVfWQAAAABJRU5ErkJggg==',
    getContext() {
      const state: Record<string, unknown> = {
        font: '16px sans-serif',
        globalAlpha: 1,
        imageSmoothingEnabled: true,
      }
      return new Proxy(state, {
        get(target, property) {
          if (property === 'measureText') {
            return (value: string) => ({ width: Array.from(value).length * 9 })
          }
          if (property in target) return target[property as string]
          return () => undefined
        },
        set(target, property, value) {
          target[property as string] = value
          return true
        },
      })
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(tagName: string) {
        if (tagName !== 'canvas') throw new Error(`静态导出 DOM 仅支持 canvas，收到 ${tagName}`)
        return createCanvas()
      },
    } as unknown as Document,
  })
}

async function main(): Promise<void> {
  installTextLayoutDom()
  const lessonBytes = await fs.readFile(lessonPath)
  const archive = openProjectArchive(lessonBytes)
  const project = projectDocumentSchema.parse(archive.project)
  const component = importComponentPackage(await fs.readFile(componentPath))
  const components = { [component.key]: component }
  const payload = buildExportPayload({
    project,
    assets: archive.assetFiles,
    components,
  })

  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as VisualEvidenceMetadata
  const snapshots = new Map<string, string>()
  for (const [snapshotKey, relativeSnapshotPath] of Object.entries(metadata.componentSnapshots)) {
    const bytes = await fs.readFile(path.join(root, relativeSnapshotPath))
    snapshots.set(snapshotKey, `data:image/png;base64,${bytes.toString('base64')}`)
  }

  const warnings: string[] = []
  const pptx = await buildPptx(payload, archive.assetFiles, {
    componentSnapshots: snapshots,
    skipSnapshotRendering: true,
    onWarning(warning) {
      warnings.push(warning)
    },
  })
  await fs.writeFile(pptxPath, pptx)
  await fs.writeFile(reportPath, `${JSON.stringify({
    title: project.title,
    sourceLesson: {
      path: path.relative(root, lessonPath).replaceAll('\\', '/'),
      sha256: sha256(lessonBytes),
    },
    slides: project.scenes.length,
    componentSnapshots: snapshots.size,
    pptx: {
      path: path.relative(root, pptxPath).replaceAll('\\', '/'),
      bytes: pptx.byteLength,
      sha256: sha256(pptx),
    },
    warnings,
    staticSemantics: {
      sceneState: 'initialStateId',
      nativeNodes: 'editable DrawingML',
      externalComponents: 'independent PNG snapshots',
      interaction: 'not retained in PPTX/PDF',
    },
  }, null, 2)}\n`, 'utf8')
  if (warnings.length > 0) throw new Error(`PPTX 导出出现 ${warnings.length} 条警告`)
  console.log(`PPTX：${pptxPath}`)
  console.log(`可编辑原生节点 + ${snapshots.size} 个独立组件快照`)
}

main().catch((error: unknown) => {
  console.error('导出动点问题静态 PPTX 失败', error)
  process.exitCode = 1
})
