import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  createProjectArchive,
  openProjectArchive,
} from '{{EDITOR_IMPORT_PREFIX}}/src/renderer/project/projectArchive'
import { projectDocumentSchema } from '{{EDITOR_IMPORT_PREFIX}}/src/shared/projectSchema'

const inputPath = process.argv[2]
const outputPath = process.argv[3]
if (!inputPath || !outputPath) throw new Error('用法: patch.ts <input.h5lesson> <output.h5lesson>')

async function main() {
  const opened = openProjectArchive(await fs.readFile(path.resolve(inputPath)))
  const project = opened.project
  // 按稳定 scene/node/binding ID 做最小修改；找不到或重复时必须 throw，不得按数组序号猜测。
  projectDocumentSchema.parse(project)
  const archive = createProjectArchive({
    project,
    assetFiles: opened.assetFiles,
    componentFiles: opened.componentFiles,
  })
  await fs.writeFile(path.resolve(outputPath), archive)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
