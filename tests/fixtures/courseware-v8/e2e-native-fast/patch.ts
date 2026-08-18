import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createProjectArchive,
  openProjectArchive,
} from '{{EDITOR_IMPORT_PREFIX}}/src/renderer/project/projectArchive'
import { projectDocumentSchema } from '{{EDITOR_IMPORT_PREFIX}}/src/shared/projectSchema'

const inputPath = process.argv[2]
const outputPath = process.argv[3]
if (!inputPath || !outputPath) {
  throw new Error('用法: patch.ts <input.h5lesson> <output.h5lesson>')
}
const caseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const statePath = path.join(caseRoot, 'implementation', 'implementation-state.json')
const targetSnapshotPath = path.join(caseRoot, 'implementation', 'authoring-target-snapshot.json')

async function main() {
  const opened = openProjectArchive(await fs.readFile(path.resolve(inputPath)))
  const sceneMatches = opened.project.scenes.filter(
    (item) => item.id === 'scene_fraction_choice',
  )
  if (sceneMatches.length !== 1) {
    throw new Error('stable scene id is missing or ambiguous: scene_fraction_choice')
  }
  const scene = sceneMatches[0]!
  const title = scene.nodes.find((item) => item.id === 'node_fraction_title')
  if (title?.type !== 'text') {
    throw new Error('human-edited stable title node is missing')
  }
  const humanTitleBeforePatch = title.text
  const feedbackMatches = scene.nodes.filter(
    (item) => item.id === 'node_fraction_feedback',
  )
  if (feedbackMatches.length !== 1 || feedbackMatches[0]!.type !== 'text') {
    throw new Error('stable feedback node id is missing or ambiguous: node_fraction_feedback')
  }
  feedbackMatches[0].text = '再次作答前，请先圈出同一个整体。'
  opened.project.updatedAt = '2026-08-13T00:10:00.000Z'
  const project = projectDocumentSchema.parse(opened.project)
  const preservedTitle = project.scenes
    .find((item) => item.id === 'scene_fraction_choice')
    ?.nodes.find((item) => item.id === 'node_fraction_title')
  if (preservedTitle?.type !== 'text' || preservedTitle.text !== humanTitleBeforePatch) {
    throw new Error('stable-ID patch overwrote the human title edit')
  }
  const archive = createProjectArchive({
    project,
    assetFiles: opened.assetFiles,
    componentFiles: opened.componentFiles,
  }, { mtime: '2026-08-13T00:10:00.000Z' })
  await fs.writeFile(path.resolve(outputPath), archive)

  const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as Record<string, unknown>
  state.status = 'verified'
  const projectSha256 = createHash('sha256').update(archive).digest('hex')
  state.currentProjectSha256 = projectSha256
  const targetSnapshot = JSON.parse(await fs.readFile(targetSnapshotPath, 'utf8')) as Record<string, unknown>
  targetSnapshot.projectSha256 = projectSha256
  const snapshotBytes = Buffer.from(`${JSON.stringify(targetSnapshot, null, 2)}\n`, 'utf8')
  await fs.writeFile(targetSnapshotPath, snapshotBytes)
  state.authoringTargetSnapshotSha256 = createHash('sha256').update(snapshotBytes).digest('hex')
  state.tasks = [{ id: 'TASK-001', status: 'verified' }]
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
