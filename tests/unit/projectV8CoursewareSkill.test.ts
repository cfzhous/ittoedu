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
import { pathToFileURL } from 'node:url'
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
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')

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
      controls: 'none',
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
      schemaVersion: 2,
      caseId: 'inventory-case',
      projectPath: 'project/inventory-case.h5lesson',
      generatedFrom: {
        coursewareContractSha256: 'd'.repeat(64),
        presentationScriptSha256: 'a'.repeat(64),
        capabilityIndexSha256: 'b'.repeat(64),
        developmentPlanSha256: 'c'.repeat(64),
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
          intent: '修改学生可见标题',
          authoringEntry: '在画布选中标题文本节点并直接编辑',
          expectedOutcome: '重开后保留新标题，Player 与导出显示同一文本',
          authoringOutcomeId: 'AUTH-001',
          binding: `native:scene:${scene.id}:${text.id}:text`,
          editability: 'canvas-distinct',
          requiredForAcceptance: true,
        }],
      }],
    }
    await writeJson(inventoryPath, inventory)

    const valid = await runPython('validate_authoring_inventory.py', [
      inventoryPath,
      '--project',
      projectPath,
      '--structural-only',
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
      '--structural-only',
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

  it('forces nested Python validators onto UTF-8 even on a non-UTF-8 host', async () => {
    const probe = [
      'import json,os,pathlib,subprocess,sys',
      `sys.path.insert(0, ${JSON.stringify(scriptsRoot)})`,
      'from v8_common import utf8_process_options',
      'result=subprocess.run([sys.executable,"-c","print(chr(35838)+chr(20214))"],**utf8_process_options())',
      'print(json.dumps({"returncode":result.returncode,"stdout":result.stdout.strip(),"encoding":utf8_process_options()["env"].get("PYTHONIOENCODING")}))',
    ].join(';')
    const result = await execFileAsync(python, ['-c', probe], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONUTF8: '0',
        PYTHONIOENCODING: 'utf-8',
        PYTHONDONTWRITEBYTECODE: '1',
      },
      timeout: 15_000,
    })

    expect(JSON.parse(result.stdout)).toEqual({
      returncode: 0,
      stdout: '课件',
      encoding: 'utf-8',
    })
  })

  it.runIf(process.platform === 'win32')(
    'uses an absolute file URL for a case on a different Windows drive',
    async () => {
      const probe = [
        'import json,pathlib,sys',
        `sys.path.insert(0, ${JSON.stringify(scriptsRoot)})`,
        'from init_v8_implementation import typescript_import_prefix',
        'value=typescript_import_prefix(pathlib.Path("C:/editor-root"),pathlib.Path("D:/external-case/implementation"))',
        'print(json.dumps({"value":value}))',
      ].join(';')
      const result = await execFileAsync(python, ['-c', probe], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
        timeout: 15_000,
      })

      expect(JSON.parse(result.stdout)).toEqual({ value: 'file:///C:/editor-root' })
    },
  )

  it('lets tsx resolve a static file-URL import containing spaces and reserved characters', async () => {
    const modulePath = path.join(temporaryRoot, 'module # percent %.ts')
    const probePath = path.join(temporaryRoot, 'static import probe.ts')
    await writeFile(modulePath, 'export const importedThroughFileUrl = "passed"\n', 'utf8')
    await writeFile(
      probePath,
      `import { importedThroughFileUrl } from ${JSON.stringify(pathToFileURL(modulePath).href)}\n` +
        'process.stdout.write(importedThroughFileUrl)\n',
      'utf8',
    )
    const result = await execFileAsync(process.execPath, [
      tsx, '--tsconfig', path.join(root, 'tsconfig.json'), probePath,
    ], { cwd: os.tmpdir(), encoding: 'utf8', timeout: 15_000 })
    expect(result.stdout).toBe('passed')
  })

  it('does not accept evaluator IDs or assessment calls that exist only in comments/strings', async () => {
    const project = createProject({
      id: 'assessment-comment-bypass',
      now: '2026-08-13T00:00:00.000Z',
      includeDefaultController: false,
      controls: 'none',
    })
    project.scenes[0]!.runtime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: `CoursewareRuntime.define({runtimeApiVersion:2,create(ctx){
        // ctx.assessment.evaluate({evaluatorId:'EVAL-finite-choice-v1',input:'A'})
        const forged = "ctx.assessment.evaluate({evaluatorId:'EVAL-finite-choice-v1'})";
        return {resize(){},setVisible(){},suspend(){},resume(){},destroy(){}};
      }})`,
      content: { values: {}, metadata: {} },
      assets: {},
      nodeBindings: {},
    }
    const projectPath = path.join(temporaryRoot, 'assessment-comment-bypass.h5lesson')
    await writeFile(projectPath, createProjectArchive({
      project,
      assetFiles: {},
      componentFiles: {},
    }, { mtime: '2026-08-13T00:00:00.000Z' }))
    const probe = [
      'import json,pathlib,sys',
      `sys.path.insert(0, ${JSON.stringify(scriptsRoot)})`,
      'from validate_v8_case import validate_assessment_carriers',
      'errors=[]; blocked=[]',
      `validate_assessment_carriers(pathlib.Path(${JSON.stringify(projectPath)}),` +
        `{"assessments":[{"responseId":"RESP-001","mode":"finite-auto","evaluatorRef":"EVAL-finite-choice-v1"}]},` +
        `pathlib.Path(${JSON.stringify(root)}),"implementation",errors,blocked)`,
      'print(json.dumps({"errors":errors,"blocked":blocked}))',
    ].join(';')
    const result = await execFileAsync(python, ['-c', probe], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
      timeout: 15_000,
    })
    expect(JSON.parse(result.stdout)).toMatchObject({
      blocked: [],
      errors: [expect.stringContaining('comments/string tokens do not count')],
    })
  })
})
