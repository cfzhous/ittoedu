import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promises as fs } from 'node:fs'
import {
  createProject,
  createScene,
  createTextNode,
} from '{{EDITOR_IMPORT_PREFIX}}/src/renderer/project/createProject'
import {
  createProjectArchive,
  openProjectArchive,
} from '{{EDITOR_IMPORT_PREFIX}}/src/renderer/project/projectArchive'
import { projectDocumentSchema } from '{{EDITOR_IMPORT_PREFIX}}/src/shared/projectSchema'

const IMPLEMENTATION_COMPLETE = false
const caseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(caseRoot, 'project')
const outputPath = path.join(outputDirectory, '{{CASE_ID}}.h5lesson')
const timestamp = new Date('2026-08-13T00:00:00.000Z')

function buildProject() {
  const project = createProject({
    id: 'project_{{CASE_ID_UNDERSCORE}}',
    title: {{TITLE_JSON}},
    now: timestamp,
    includeDefaultController: true,
    idFactory: (() => { let index = 0; return () => String(++index).padStart(4, '0') })(),
  })
  const scene = createScene({ id: 'scene_001', name: '场景 1', backgroundColor: '#ffffff' })
  scene.nodes.push(createTextNode({
    id: 'scene_001_title',
    x: 96,
    y: 72,
    width: 1088,
    height: 88,
    text: {{TITLE_JSON}},
    style: { fontSize: 42, color: '#1f2937', align: 'left' },
  }))
  project.scenes = [scene]
  return projectDocumentSchema.parse(project)
}

async function main() {
  if (!IMPLEMENTATION_COMPLETE) {
    throw new Error('Builder 仍是初始化骨架；先按获批脚本完成场景、互动、Inventory 与静态结果。')
  }
  const project = buildProject()
  const archive = createProjectArchive({ project, assetFiles: {}, componentFiles: {} }, { mtime: timestamp })
  const reopened = openProjectArchive(archive)
  projectDocumentSchema.parse(reopened.project)
  await fs.mkdir(outputDirectory, { recursive: true })
  await fs.writeFile(outputPath, archive)
  process.stdout.write(`${outputPath}\n`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
