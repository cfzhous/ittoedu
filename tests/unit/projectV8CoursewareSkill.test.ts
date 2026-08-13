// @vitest-environment node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createProject,
  createTextNode,
} from '@/renderer/project/createProject'
import { createProjectArchive } from '@/renderer/project/projectArchive'

const execFileAsync = promisify(execFile)
const root = path.resolve(__dirname, '..', '..')
const skillRoot = path.join(root, '.agents', 'skills', 'build-project-v8-courseware')
const scriptsRoot = path.join(skillRoot, 'scripts')
const python = process.platform === 'win32' ? 'python' : 'python3'

type PythonFailure = Error & { stdout?: string, stderr?: string }

let temporaryRoot = ''

async function runPython(
  script: string,
  args: string[],
  expectFailure = false,
): Promise<{ stdout: string, stderr: string }> {
  try {
    const result = await execFileAsync(
      python,
      [path.join(scriptsRoot, script), ...args],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
        timeout: 15_000,
      },
    )
    if (expectFailure) throw new Error('Expected the Python validator to fail.')
    return result
  } catch (error) {
    const failure = error as PythonFailure
    if (!expectFailure) throw error
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    }
  }
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

beforeEach(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-v8-skill-'))
})

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

describe('Project V8 courseware Skill', () => {
  it('uses current real TypeScript entrypoints and refuses a scaffold build', async () => {
    const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8')
    const buildTemplate = await readFile(
      path.join(skillRoot, 'assets', 'case-templates', 'build.ts'),
      'utf8',
    )

    expect(skill).toContain('Project V8 / Runtime API 2 / Runtime Authoring 1 / Component API 4')
    expect(skill).toContain('不得建立影子 Project DSL')
    expect(skill).not.toContain('build-project-v7-courseware` 生成')
    expect(buildTemplate).toContain("/src/renderer/project/createProject'")
    expect(buildTemplate).toContain("/src/renderer/project/projectArchive'")
    expect(buildTemplate).toContain('const IMPLEMENTATION_COMPLETE = false')
    expect(buildTemplate).toContain('createProjectArchive')
  })

  it('validates scoped persistent bindings against a real Project V8 archive', async () => {
    const project = createProject({
      id: 'project_inventory',
      now: '2026-08-13T00:00:00.000Z',
      includeDefaultController: false,
    })
    const scene = project.scenes[0]!
    const text = createTextNode({ id: 'title', text: '受控标题' })
    scene.nodes.push(text)
    const archive = createProjectArchive({
      project,
      assetFiles: {},
      componentFiles: {},
    }, { mtime: '2026-08-13T00:00:00.000Z' })
    const projectPath = path.join(temporaryRoot, 'inventory-case.h5lesson')
    await writeFile(projectPath, archive)

    const inventoryPath = path.join(temporaryRoot, 'authoring-inventory.json')
    const inventory = {
      schemaVersion: 1,
      caseId: 'inventory-case',
      projectPath: 'project/inventory-case.h5lesson',
      generatedFrom: {
        presentationScriptSha256: 'a'.repeat(64),
        capabilityIndexSha256: 'b'.repeat(64),
      },
      globalEntities: [],
      scenes: [{
        sceneId: scene.id,
        ownership: 'native-owned',
        entities: [{
          id: 'scene-title',
          label: '标题',
          kind: 'text',
          sourceRef: 'CNT-001',
          binding: `native:scene:${scene.id}:${text.id}:text`,
          editability: 'visible',
          requiredForAcceptance: true,
        }],
      }],
    }
    await writeJson(inventoryPath, inventory)

    const valid = await runPython('validate_authoring_inventory.py', [
      inventoryPath,
      '--project',
      projectPath,
      '--json',
    ])
    expect(JSON.parse(valid.stdout)).toMatchObject({ status: 'passed', errors: [] })

    inventory.scenes[0]!.entities[0]!.binding =
      `runtime:scene:${scene.id}:text:registered:1`
    await writeJson(inventoryPath, inventory)
    const invalid = await runPython('validate_authoring_inventory.py', [
      inventoryPath,
      '--project',
      projectPath,
      '--json',
    ], true)
    const report = JSON.parse(invalid.stdout)
    expect(report.status).toBe('failed')
    expect(report.errors.join('\n')).toContain('invalid persistent binding')
  })

  it('binds evidence to exact bytes and never lets automation grant accepted', async () => {
    const artifactPath = path.join(temporaryRoot, 'artifact.txt')
    const artifactBytes = Buffer.from('W1 mechanism evidence; not a delivery artifact.\n', 'utf8')
    await writeFile(artifactPath, artifactBytes)
    const manifestPath = path.join(temporaryRoot, 'evidence', 'evidence-manifest.json')
    const artifactHash = createHash('sha256').update(artifactBytes).digest('hex')
    const manifest = {
      schemaVersion: 1,
      caseId: 'evidence-case',
      caseRoot: '..',
      pipelineStatus: 'not-run',
      outcomeStatus: 'placeholder',
      inputs: { presentationScriptSha256: 'a'.repeat(64) },
      commands: [],
      artifacts: [{
        id: 'mechanism-fixture',
        kind: 'mechanism-fixture',
        path: 'artifact.txt',
        sha256: artifactHash,
      }],
      editRoundTrips: [],
      sceneEvidence: [],
      requiredFrames: [],
      differences: [],
      remainingRisks: [],
      humanAcceptance: null as null | Record<string, string>,
    }
    await writeJson(manifestPath, manifest)

    const exact = await runPython('validate_evidence.py', [manifestPath, '--json'])
    expect(JSON.parse(exact.stdout)).toMatchObject({ status: 'passed', errors: [] })

    manifest.artifacts[0]!.sha256 = '0'.repeat(64)
    await writeJson(manifestPath, manifest)
    const stale = await runPython('validate_evidence.py', [manifestPath, '--json'], true)
    expect(JSON.parse(stale.stdout).errors.join('\n')).toContain('evidence hash is stale')

    manifest.artifacts[0]!.sha256 = artifactHash
    manifest.pipelineStatus = 'passed'
    manifest.outcomeStatus = 'accepted'
    manifest.humanAcceptance = {
      decision: 'accepted',
      reviewer: 'Codex automation',
      approvedAt: '2026-08-13T00:00:00Z',
      approvalEvidence: 'invalid-automated-claim',
      explicitOpinion: '自动化不能代替人工产品验收',
      scopeSha256: '',
    }
    await writeJson(manifestPath, manifest)
    const unbound = await runPython('validate_evidence.py', [manifestPath, '--json'], true)
    manifest.humanAcceptance.scopeSha256 = JSON.parse(unbound.stdout).currentAcceptanceScopeSha256
    await writeJson(manifestPath, manifest)
    const automated = await runPython('validate_evidence.py', [manifestPath, '--json'], true)
    expect(JSON.parse(automated.stdout).errors.join('\n'))
      .toContain('automation cannot be the acceptance reviewer')
  })
})
