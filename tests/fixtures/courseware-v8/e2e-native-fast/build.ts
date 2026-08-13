import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

const timestamp = '2026-08-13T00:00:00.000Z'
const caseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(caseRoot, 'project', 'e2e-native-fast.h5lesson')
const statePath = path.join(caseRoot, 'implementation', 'implementation-state.json')

function buildProject() {
  const project = createProject({
    id: 'project_e2e_native_fast',
    title: '分数意义：整体与等分',
    now: timestamp,
    includeDefaultController: false,
  })
  const scene = createScene({
    id: 'scene_fraction_choice',
    name: '判断四分之一',
    backgroundColor: '#f8fafc',
  })
  scene.nodes = [
    createTextNode({
      id: 'node_fraction_title',
      name: '任务标题',
      x: 96,
      y: 64,
      width: 1088,
      height: 72,
      text: '判断哪幅图能表示四分之一',
      style: { fontSize: 40, color: '#172033', bold: true },
    }),
    createTextNode({
      id: 'node_fraction_prompt',
      name: '任务说明',
      x: 128,
      y: 184,
      width: 1024,
      height: 208,
      text: '图 A 是一个正方形平均分成四份并涂其中一份；图 B 是两个大小不同的长方形拼在一起并涂较小的一块。请选择图 A 或图 B，并说明理由。',
      style: { fontSize: 30, color: '#26344f', lineSpacing: 12 },
    }),
    createTextNode({
      id: 'node_fraction_feedback',
      name: '错误修复反馈',
      x: 128,
      y: 472,
      width: 1024,
      height: 112,
      text: '等待作答。',
      style: {
        fontSize: 30,
        color: '#7c2d12',
        backgroundColor: '#ffedd5',
        backgroundOpacity: 1,
        cornerRadius: 12,
        padding: 18,
      },
    }),
  ]
  scene.presentation = {
    initialStateId: 'state_fraction_initial',
    thumbnailStateId: 'state_fraction_result',
    states: [
      {
        id: 'state_fraction_initial',
        name: '初始｜等待作答',
        nodeOverrides: {
          node_fraction_feedback: { visible: false },
        },
      },
      {
        id: 'state_fraction_error',
        name: '反馈｜修复整体概念',
        nodeOverrides: {
          node_fraction_feedback: {
            visible: true,
            text: '再次作答前，请先圈出同一个整体。',
          },
        },
      },
      {
        id: 'state_fraction_result',
        name: '稳定结果｜完整定义',
        nodeOverrides: {
          node_fraction_feedback: {
            visible: true,
            text: '正确：同一个整体被平均分成四份，涂色部分恰好是一份。',
          },
        },
      },
    ],
  }
  project.scenes = [scene]
  return projectDocumentSchema.parse(project)
}

async function main() {
  const project = buildProject()
  const archive = createProjectArchive({
    project,
    assetFiles: {},
    componentFiles: {},
  }, { mtime: timestamp })
  const reopened = openProjectArchive(archive)
  projectDocumentSchema.parse(reopened.project)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, archive)

  const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as Record<string, unknown>
  state.status = 'implemented'
  state.currentProjectSha256 = createHash('sha256').update(archive).digest('hex')
  state.tasks = [{ id: 'TASK-001', status: 'verified' }]
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  process.stdout.write(`${outputPath}\n`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
