import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  createProjectArchive,
  openProjectArchive,
} from '{{EDITOR_IMPORT_PREFIX}}/src/renderer/project/projectArchive'
import { projectDocumentSchema } from '{{EDITOR_IMPORT_PREFIX}}/src/shared/projectSchema'

const inputPath = process.argv[2]
const outputPath = process.argv[3]
if (!inputPath || !outputPath) {
  throw new Error('用法: human-edit.ts <input.h5lesson> <output.h5lesson>')
}

async function main() {
  const opened = openProjectArchive(await fs.readFile(path.resolve(inputPath)))
  const scene = opened.project.scenes.find((item) => item.id === 'scene_fraction_choice')
  if (!scene) throw new Error('stable scene id not found: scene_fraction_choice')
  const matches = scene.nodes.filter((item) => item.id === 'node_fraction_title')
  if (matches.length !== 1 || matches[0]!.type !== 'text') {
    throw new Error('stable text node id is missing or ambiguous: node_fraction_title')
  }
  matches[0].text = '人工编辑保留：先判断同一个整体是否被平均分'
  opened.project.updatedAt = '2026-08-13T00:05:00.000Z'
  const project = projectDocumentSchema.parse(opened.project)
  const archive = createProjectArchive({
    project,
    assetFiles: opened.assetFiles,
    componentFiles: opened.componentFiles,
  }, { mtime: '2026-08-13T00:05:00.000Z' })
  await fs.writeFile(path.resolve(outputPath), archive)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
