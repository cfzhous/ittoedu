import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import * as agentKit from '../agent-kit/index.mjs'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '../src/renderer/project/courseProjectArchive'
import { buildPublishedCourseStandaloneHtml } from '../src/renderer/export/course/buildCoursePackages'
import { courseProjectDocumentSchema } from '../src/shared/courseProjectSchema'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const onePixelPng = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
))

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main(): Promise<void> {
  assert(process.platform === 'win32', 'verify:clean-windows must run on Windows.')
  const isolatedRoot = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-clean-windows-'))
  const sourceCase = path.join(isolatedRoot, 'source-case')
  const movedCase = path.join(isolatedRoot, 'moved-case')
  const skillDestination = path.join(isolatedRoot, 'profile', '.agents', 'skills')

  try {
    await mkdir(sourceCase, { recursive: true })
    await mkdir(movedCase, { recursive: true })
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(repositoryRoot, 'scripts', 'install-courseware-skills.ps1'),
      '-SourceRoot',
      path.join(repositoryRoot, '.agents', 'skills'),
      '-DestinationRoot',
      skillDestination,
    ])
    const installedSkills = (await readdir(skillDestination)).sort()
    assert(
      JSON.stringify(installedSkills) === JSON.stringify([
        'build-courseware-project',
        'orchestrate-courseware',
      ]),
      `Unexpected installed Skills: ${installedSkills.join(', ')}`,
    )

    const planPath = path.join(sourceCase, '01-teaching-plan.md')
    const scriptPath = path.join(sourceCase, '02-presentation-script.md')
    const capabilityPath = path.join(sourceCase, 'capabilities.json')
    await writeFile(planPath, '# 教学策划\n\n观察同一内容在三种表面中的表达。\n', 'utf8')
    await writeFile(scriptPath, '# 教学呈现脚本\n\n从 Slide 进入 Flow，再进入 Spatial 2D。\n', 'utf8')
    await copyFile(path.join(repositoryRoot, 'agent-kit', 'capabilities', 'index.json'), capabilityPath)
    await agentKit.scaffoldWorkspace(sourceCase, {
      id: 'clean-windows-course',
      title: 'Clean Windows Course',
      teachingPlan: '01-teaching-plan.md',
      presentationScript: '02-presentation-script.md',
      capabilityIndex: 'capabilities.json',
      kitRoot: path.join(repositoryRoot, 'agent-kit'),
    })
    const kitUrl = pathToFileURL(path.join(repositoryRoot, 'agent-kit', 'index.mjs')).href
    await writeFile(path.join(sourceCase, 'src', 'course.mjs'), `
import { author, defineCourseProject, defineScene, defineSurface } from ${JSON.stringify(kitUrl)}
export default defineCourseProject({
  id: 'clean-windows-course',
  title: 'Clean Windows Course',
  assets: {
    pixel: { id: 'pixel', filename: 'pixel.png', mimeType: 'image/png', kind: 'image', path: 'assets/pixel.png', byteLength: ${onePixelPng.byteLength} }
  },
  surfaces: [
    defineSurface({ id: 'slide', kind: 'slide', scenes: [defineScene({ id: 'intro', items: [author.text({ id: 'title', text: 'Clean Windows', geometry: { x: 80, y: 60, width: 720, height: 100 } })] })] }),
    defineSurface({ id: 'flow', kind: 'flow', scenes: [defineScene({ id: 'reading', items: [author.text({ id: 'paragraph', text: 'Semantic Flow content' }), author.image({ id: 'pixel-image', assetId: 'pixel' })] })] }),
    defineSurface({ id: 'map', kind: 'spatial-2d', scenes: [defineScene({ id: 'world', items: [author.shape({ id: 'marker', data: { shapeType: 'ellipse' }, geometry: { x: -40, y: -40, width: 80, height: 80 } })] })] })
  ]
})
`, 'utf8')
    await writeFile(path.join(sourceCase, 'assets', 'pixel.png'), onePixelPng)

    const workspaceReport = await agentKit.validateWorkspace(sourceCase)
    assert(workspaceReport.valid, workspaceReport.errors.join('; '))
    const graph = JSON.parse(await readFile(path.join(sourceCase, 'build-graph.json'), 'utf8'))
    await agentKit.assembleBuildGraph(graph, { workspace: sourceCase })
    const semanticInput = JSON.parse(
      await readFile(path.join(sourceCase, 'build', 'course-project.input.json'), 'utf8'),
    )
    const project = courseProjectDocumentSchema.parse(agentKit.compileCourseProjectV9(semanticInput))
    const assetFiles = { pixel: onePixelPng }
    const archive = createCourseProjectArchive({
      project,
      assetFiles,
      componentFiles: {},
    }, { mtime: '2026-08-14T00:00:00.000Z' })
    const sourceArchive = path.join(sourceCase, 'clean-windows-course.h5lesson')
    const movedArchive = path.join(movedCase, 'clean-windows-course.h5lesson')
    await writeFile(sourceArchive, archive)
    await copyFile(sourceArchive, movedArchive)
    await rm(sourceCase, { recursive: true, force: true })

    const reopened = openCourseProjectArchive(new Uint8Array(await readFile(movedArchive)))
    assert(reopened.project.schemaVersion === 9, 'Moved archive did not reopen as Course Project V9.')
    assert(reopened.project.surfaces.length === 3, 'Moved archive lost a surface.')
    assert(reopened.assetFiles.pixel?.byteLength === onePixelPng.byteLength, 'Moved archive lost its asset.')

    const html = buildPublishedCourseStandaloneHtml({
      project: reopened.project,
      assetFiles: reopened.assetFiles,
      components: {},
    }, 'window.__ITTOEDU_CLEAN_WINDOWS_PLAYER__=true;')
    assert(html.includes('window.__H5_COURSE_PAYLOAD__='), 'Standalone HTML has no Published Course payload.')
    assert(html.includes('data:image/png;base64,'), 'Standalone HTML did not inline the used asset.')
    assert(!/(?:src|href)=["'](?:https?:)?\/\//i.test(html), 'Standalone HTML contains an external resource URL.')
    assert(!/https?:\/\//i.test(html), 'Standalone HTML contains a network URL.')
    assert(!html.toLocaleLowerCase().includes(repositoryRoot.toLocaleLowerCase()), 'Standalone HTML leaked the repository path.')
    await writeFile(path.join(movedCase, 'clean-windows-course.html'), html, 'utf8')

    process.stdout.write(`${JSON.stringify({
      valid: true,
      installedSkills,
      projectSchemaVersion: reopened.project.schemaVersion,
      surfaces: reopened.project.surfaces.map((surface) => surface.type),
      archiveBytes: archive.byteLength,
      standaloneHtmlBytes: Buffer.byteLength(html),
      externalNetworkUrls: 0,
    })}\n`)
  } finally {
    if (process.env.COURSEWARE_KEEP_CLEAN_WINDOWS_OUTPUT !== '1') {
      await rm(isolatedRoot, { recursive: true, force: true })
    } else {
      process.stdout.write(`Preserved clean Windows workspace: ${isolatedRoot}\n`)
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? (error as Error).message}\n`)
  process.exitCode = 1
})
