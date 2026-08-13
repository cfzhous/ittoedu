// @vitest-environment node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { openProjectArchive } from '@/renderer/project/projectArchive'
import type { ProjectDocument } from '@/shared/projectTypes'

const execFileAsync = promisify(execFile)
const root = path.resolve(__dirname, '..', '..')
const fixtureRoot = path.join(
  root,
  'tests',
  'fixtures',
  'courseware-v8',
  'e2e-native-fast',
)
const orchestratorScripts = path.join(
  root,
  '.agents',
  'skills',
  'orchestrate-courseware',
  'scripts',
)
const builderRoot = path.join(
  root,
  '.agents',
  'skills',
  'build-project-v8-courseware',
)
const builderScripts = path.join(builderRoot, 'scripts')
const python = process.platform === 'win32' ? 'python' : 'python3'
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')

interface E2EFixture {
  schemaVersion: 1
  fixtureId: string
  fixturePurpose: 'w1-builder-contract'
  caseId: string
  title: string
  project: {
    sceneId: string
    nodeIds: string[]
    initialTitle: string
    humanEditedTitle: string
    builderPatchedFeedback: string
  }
  evidenceBoundary: {
    maximumAutomatedOutcome: 'engineering candidate'
    notEditorUiEvidence: true
    notProductAcceptance: true
    deferredToW2: string[]
  }
}

interface ImplementationState {
  schemaVersion: 2
  caseId: string
  status: 'planned' | 'implemented' | 'verified'
  coursewareContractSha256: string
  presentationScriptSha256: string
  capabilityIndexSha256: string
  developmentPlanSha256: string
  behaviorSpecSha256: string
  currentProjectSha256: string | null
}

interface CaseManifest {
  stage: string
  resultStatus: string
  artifacts: {
    presentationScript: { sha256: string }
  }
  reviews: {
    experience: {
      status: string
      scopeSha256: string
      approvedBy: string
    }
  }
  derivedReadiness: {
    status: string
    approvedReviewHashes: Record<string, string>
    exactContentLocations: Record<string, string>
  }
}

type ExecutionFailure = Error & { stdout?: string, stderr?: string }

async function execute(
  executable: string,
  args: string[],
  timeout = 120_000,
): Promise<{ stdout: string, stderr: string }> {
  try {
    return await execFileAsync(executable, args, {
      cwd: root,
      encoding: 'utf8',
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    })
  } catch (error) {
    const failure = error as ExecutionFailure
    throw new Error(
      `${executable} ${args.join(' ')} failed\nstdout:\n${failure.stdout ?? ''}\nstderr:\n${failure.stderr ?? ''}`,
      { cause: error },
    )
  }
}

async function runPython(
  scriptsRoot: string,
  script: string,
  args: string[],
  timeout = 120_000,
): Promise<{ stdout: string, stderr: string }> {
  return execute(python, [path.join(scriptsRoot, script), ...args], timeout)
}

async function runTsx(
  script: string,
  args: string[] = [],
  timeout = 120_000,
): Promise<{ stdout: string, stderr: string }> {
  return execute(process.execPath, [
    tsxCli,
    '--tsconfig',
    path.join(root, 'tsconfig.json'),
    script,
    ...args,
  ], timeout)
}

async function loadJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, 'utf8')) as T
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function render(template: string, replacements: Record<string, string>): string {
  let rendered = template
  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.split(token).join(value)
  }
  return rendered
}

function projectNodeIds(project: ProjectDocument): string[] {
  return project.scenes
    .flatMap((scene) => scene.nodes.map((node) => node.id))
    .sort()
}

async function installFixtureImplementation(
  caseRoot: string,
  replacements: Record<string, string>,
): Promise<{ developmentPlanSha256: string, behaviorSpecSha256: string }> {
  const planTemplate = await readFile(
    path.join(fixtureRoot, '03-development-plan.md'),
    'utf8',
  )
  const renderedPlan = render(planTemplate, replacements)
  expect(renderedPlan).not.toMatch(/\{\{[A-Z0-9_]+\}\}/)
  await writeFile(path.join(caseRoot, '03-development-plan.md'), renderedPlan, 'utf8')
  const developmentPlanSha256 = sha256(renderedPlan)
  const boundReplacements = {
    ...replacements,
    '{{DEVELOPMENT_PLAN_SHA256}}': developmentPlanSha256,
  }
  const destinations = new Map<string, string>([
    ['authoring-inventory.json', path.join(caseRoot, 'implementation', 'authoring-inventory.json')],
    ['behavior-spec.json', path.join(caseRoot, 'implementation', 'behavior-spec.json')],
    ['build.ts', path.join(caseRoot, 'implementation', 'build.ts')],
    ['human-edit.ts', path.join(caseRoot, 'implementation', 'human-edit.ts')],
    ['patch.ts', path.join(caseRoot, 'implementation', 'patch.ts')],
  ])
  for (const [sourceName, destination] of destinations) {
    const template = await readFile(path.join(fixtureRoot, sourceName), 'utf8')
    const rendered = render(template, boundReplacements)
    expect(rendered).not.toMatch(/\{\{[A-Z0-9_]+\}\}/)
    await writeFile(destination, rendered, 'utf8')
  }
  const behaviorSpecSha256 = sha256(await readFile(
    path.join(caseRoot, 'implementation', 'behavior-spec.json'),
  ))
  const statePath = path.join(caseRoot, 'implementation', 'implementation-state.json')
  const state = await loadJson<ImplementationState>(statePath)
  state.developmentPlanSha256 = developmentPlanSha256
  state.behaviorSpecSha256 = behaviorSpecSha256
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  return { developmentPlanSha256, behaviorSpecSha256 }
}

describe('Project V8 Builder end-to-end contract', () => {
  it('runs V2 readiness, init, real TS build, persisted edit, stable-ID patch, and implementation validation', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-v8-e2e-'))
    try {
      const fixture = await loadJson<E2EFixture>(path.join(fixtureRoot, 'fixture.json'))
      const casesRoot = path.join(temporaryRoot, 'cases')
      const caseRoot = path.join(casesRoot, fixture.caseId)

      await runPython(orchestratorScripts, 'init_case.py', [
        '--root', temporaryRoot,
        '--cases-dir', 'cases',
        '--case-id', fixture.caseId,
        '--title', fixture.title,
        '--brief', 'W1 自动前向夹具：验证 Project V8 Builder 的首次构建与稳定 ID 局部 Patch。',
        '--duration-minutes', '10',
        '--path-mode', 'fast',
      ])
      await copyFile(
        path.join(fixtureRoot, '01-courseware-contract.md'),
        path.join(caseRoot, '01-courseware-contract.md'),
      )
      await copyFile(
        path.join(fixtureRoot, '02-presentation-script.md'),
        path.join(caseRoot, '02-presentation-script.md'),
      )
      await runPython(orchestratorScripts, 'case_artifact.py', [
        caseRoot, 'ready', 'coursewareContract',
      ])
      await runPython(orchestratorScripts, 'case_artifact.py', [
        caseRoot, 'ready', 'presentationScript',
      ])
      await runPython(orchestratorScripts, 'case_artifact.py', [
        caseRoot, 'review-ready', 'experience',
      ])
      await runPython(orchestratorScripts, 'case_artifact.py', [
        caseRoot,
        'approve',
        'experience',
        '--approved-by',
        '课程负责人',
        '--evidence',
        'W1 合约夹具：明确批准当前聚合范围用于自动前向测试',
      ])
      await runPython(orchestratorScripts, 'validate_case.py', [
        caseRoot,
        '--target',
        'implementation-ready',
        '--capability-index',
        path.join(root, 'artifacts', 'ai-capabilities', 'index.json'),
        '--promote',
        '--json',
      ])

      const readyCase = await loadJson<CaseManifest>(path.join(caseRoot, 'case.json'))
      expect(readyCase).toMatchObject({
        stage: 'implementation-ready',
        resultStatus: 'pending',
        derivedReadiness: { status: 'implementation-ready' },
        reviews: { experience: { status: 'approved', approvedBy: '课程负责人' } },
      })
      expect(readyCase.derivedReadiness.approvedReviewHashes.experience)
        .toBe(readyCase.reviews.experience.scopeSha256)
      expect(Object.keys(readyCase.derivedReadiness.exactContentLocations))
        .toContain('CNT-001')

      const initialized = await runPython(builderScripts, 'init_v8_implementation.py', [
        '--case-dir', caseRoot,
        '--editor-root', root,
      ])
      expect(JSON.parse(initialized.stdout)).toMatchObject({
        status: 'initialized',
        caseDir: caseRoot,
      })
      const scaffold = await readFile(path.join(caseRoot, 'implementation', 'build.ts'), 'utf8')
      expect(scaffold).toContain('const IMPLEMENTATION_COMPLETE = false')

      const initializedState = await loadJson<ImplementationState>(
        path.join(caseRoot, 'implementation', 'implementation-state.json'),
      )
      const implementationRoot = path.join(caseRoot, 'implementation')
      let editorImportPrefix = path.relative(implementationRoot, root).replaceAll('\\', '/')
      if (!editorImportPrefix.startsWith('.')) editorImportPrefix = `./${editorImportPrefix}`
      const installedHashes = await installFixtureImplementation(caseRoot, {
        '{{EDITOR_IMPORT_PREFIX}}': editorImportPrefix,
        '{{COURSEWARE_CONTRACT_SHA256}}': initializedState.coursewareContractSha256,
        '{{PRESENTATION_SHA256}}': initializedState.presentationScriptSha256,
        '{{CAPABILITY_SHA256}}': initializedState.capabilityIndexSha256,
      })

      const buildSource = await readFile(path.join(implementationRoot, 'build.ts'), 'utf8')
      expect(buildSource).toContain('/src/renderer/project/createProject')
      expect(buildSource).toContain('/src/renderer/project/projectArchive')
      expect(buildSource).toContain('createProjectArchive')
      expect(buildSource).toContain('openProjectArchive')
      expect(buildSource).toContain('projectDocumentSchema.parse')
      expect(buildSource).not.toContain('IMPLEMENTATION_COMPLETE')

      const buildResult = await runTsx(path.join(implementationRoot, 'build.ts'))
      const projectPath = path.join(caseRoot, 'project', `${fixture.caseId}.h5lesson`)
      expect(buildResult.stdout.trim()).toBe(projectPath)
      const initialArchive = await readFile(projectPath)
      const initialProject = openProjectArchive(initialArchive).project
      const initialNodeIds = projectNodeIds(initialProject)
      expect(initialProject).toMatchObject({
        schemaVersion: 8,
        id: 'project_e2e_native_fast',
        scenes: [{
          id: fixture.project.sceneId,
          presentation: {
            initialStateId: 'state_fraction_initial',
            thumbnailStateId: 'state_fraction_result',
          },
        }],
      })
      expect(initialNodeIds).toEqual([...fixture.project.nodeIds].sort())

      const initialValidation = await runPython(builderScripts, 'validate_v8_case.py', [
        '--case-dir', caseRoot,
        '--editor-root', root,
        '--target', 'implementation',
        '--json',
      ])
      expect(JSON.parse(initialValidation.stdout)).toMatchObject({
        pipelineStatus: 'passed',
        target: 'implementation',
        errors: [],
      })

      const authoringReplayOnly = process.env.COURSEWARE_E2E_REAL_AUTHORING_REPLAY === '1'
      if (process.env.COURSEWARE_E2E_REAL_EVIDENCE === '1' || authoringReplayOnly) {
        const desktopBuild = await execute(
          process.execPath,
          [
            path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
            'run', '--silent', 'build:desktop',
          ],
          300_000,
        )
        expect(desktopBuild.stdout).toContain('player.iife.js')
        const authoring = await runTsx(path.join(root, 'scripts', 'run-courseware-authoring.ts'), [
          '--case-dir', caseRoot,
          '--editor-root', root,
          '--delivery-html', 'delivery/lesson.html',
          '--delivery-web-package', 'delivery/lesson-web.zip',
          '--delivery-pdf', 'delivery/lesson.pdf',
          '--delivery-pptx', 'delivery/lesson.pptx',
          '--report', 'evidence/authoring-session-report.json',
          '--write-deliveries',
        ], 300_000)
        expect(JSON.parse(authoring.stdout)).toMatchObject({ status: 'passed', errors: [] })
        if (authoringReplayOnly) {
          const authoringReplay = await runTsx(
            path.join(root, 'scripts', 'run-courseware-authoring.ts'),
            [
              '--case-dir', caseRoot,
              '--editor-root', root,
              '--delivery-html', 'delivery/lesson.html',
              '--delivery-web-package', 'delivery/lesson-web.zip',
              '--delivery-pdf', 'delivery/lesson.pdf',
              '--delivery-pptx', 'delivery/lesson.pptx',
              '--report', 'evidence/authoring-session-report.json',
              '--verify-report',
            ],
            300_000,
          )
          expect(JSON.parse(authoringReplay.stdout)).toMatchObject({ status: 'passed', errors: [] })
        }
        if (!authoringReplayOnly) {
        const behavior = await runTsx(path.join(root, 'scripts', 'run-courseware-behavior.ts'), [
          '--case-dir', caseRoot,
          '--spec', 'implementation/behavior-spec.json',
          '--target', 'delivery/lesson.html',
          '--report', 'evidence/behavior-report.json',
        ])
        expect(JSON.parse(behavior.stdout)).toMatchObject({
          status: 'passed',
          summary: { passed: 12, failed: 0 },
        })
        const behaviorReport = await loadJson<{
          tests: Array<{
            id: string
            status: string
            hostEvidence: Array<Record<string, unknown>>
          }>
        }>(path.join(caseRoot, 'evidence', 'behavior-report.json'))
        const requiredAction = behaviorReport.tests.find(test => test.id === 'BEH-003')
        expect(requiredAction).toMatchObject({ status: 'passed' })
        expect(requiredAction?.hostEvidence).toEqual(expect.arrayContaining([expect.objectContaining({
          kind: 'action-recorded',
          actId: 'ACT-001',
          responseId: 'RESP-001',
          actionKind: 'select',
          eventType: 'click',
          afterStepId: 'STEP-003',
        })]))
        const assessment = behaviorReport.tests.find(test => test.id === 'BEH-004')
        expect(assessment).toMatchObject({ status: 'passed' })
        expect(assessment?.hostEvidence).toEqual(expect.arrayContaining([expect.objectContaining({
          kind: 'assessment-evaluated',
          responseId: 'RESP-001',
          evaluatorId: 'EVAL-finite-choice-v1',
          input: 'A',
          status: 'pass',
          afterStepId: 'STEP-004',
        })]))

        const state = await loadJson<ImplementationState>(
          path.join(caseRoot, 'implementation', 'implementation-state.json'),
        )
        const artifactEntries = [
          ['project', 'project', `project/${fixture.caseId}.h5lesson`],
          ['html', 'html', 'delivery/lesson.html'],
          ['web-package', 'web-package', 'delivery/lesson-web.zip'],
          ['pdf', 'pdf', 'delivery/lesson.pdf'],
          ['pptx', 'pptx', 'delivery/lesson.pptx'],
          ['behavior-spec', 'behavior-spec', 'implementation/behavior-spec.json'],
          ['behavior-report', 'behavior-report', 'evidence/behavior-report.json'],
          ['authoring-inventory', 'authoring-inventory', 'implementation/authoring-inventory.json'],
          ['authoring-target-snapshot', 'authoring-target-snapshot', 'implementation/authoring-target-snapshot.json'],
          ['authoring-session-report', 'authoring-session-report', 'evidence/authoring-session-report.json'],
        ] as const
        const artifacts = await Promise.all(artifactEntries.map(async ([id, kind, relativePath]) => ({
          id,
          kind,
          path: relativePath,
          sha256: sha256(await readFile(path.join(caseRoot, ...relativePath.split('/')))),
        })))
        const manifestPath = path.join(caseRoot, 'evidence', 'evidence-manifest.json')
        const placeholderManifestBytes = await readFile(manifestPath)
        try {
          const manifest = JSON.parse(placeholderManifestBytes.toString('utf8')) as Record<string, unknown>
          Object.assign(manifest, {
            pipelineStatus: 'passed',
            outcomeStatus: 'engineering candidate',
            inputs: {
              coursewareContractSha256: state.coursewareContractSha256,
              presentationScriptSha256: state.presentationScriptSha256,
              capabilityIndexSha256: state.capabilityIndexSha256,
              developmentPlanSha256: state.developmentPlanSha256,
              behaviorSpecSha256: state.behaviorSpecSha256,
              projectSha256: state.currentProjectSha256,
            },
            commands: [],
            artifacts,
            editRoundTrips: [],
            sceneEvidence: [{ sceneId: fixture.project.sceneId, sceneType: 'interactive' }],
            requiredFrames: [],
            differences: [],
            remainingRisks: [],
            verification: {
              behaviorSpecArtifactId: 'behavior-spec',
              behaviorReportArtifactId: 'behavior-report',
              authoringInventoryArtifactId: 'authoring-inventory',
              authoringTargetSnapshotArtifactId: 'authoring-target-snapshot',
              authoringSessionReportArtifactId: 'authoring-session-report',
            },
            humanAcceptance: null,
          })
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
          const totalEvidence = await runPython(builderScripts, 'validate_v8_case.py', [
            '--case-dir', caseRoot,
            '--editor-root', root,
            '--target', 'evidence',
            '--json',
          ], 360_000)
          expect(JSON.parse(totalEvidence.stdout)).toMatchObject({
            pipelineStatus: 'passed',
            outcomeStatus: 'engineering candidate',
            target: 'evidence',
            errors: [],
            blockedCapabilities: [],
          })
        } finally {
          await writeFile(manifestPath, placeholderManifestBytes)
        }
        }
      }

      const snapshotPath = path.join(implementationRoot, 'authoring-target-snapshot.json')
      const snapshotBytes = await readFile(snapshotPath)
      const invalidSnapshot = JSON.parse(snapshotBytes.toString('utf8')) as {
        captures: Array<{
          captureMethod: string
          selectionBounds: { x: number, y: number, width: number, height: number }
        }>
      }
      invalidSnapshot.captures[0]!.captureMethod = 'runtime-authoring-target-v1'
      invalidSnapshot.captures[0]!.selectionBounds = { x: 0, y: 0, width: 20, height: 20 }
      await writeFile(snapshotPath, `${JSON.stringify(invalidSnapshot, null, 2)}\n`, 'utf8')
      await expect(runPython(builderScripts, 'validate_authoring_target_snapshot.py', [
        snapshotPath,
        '--inventory', path.join(implementationRoot, 'authoring-inventory.json'),
        '--project', projectPath,
        '--case-dir', caseRoot,
        '--json',
      ])).rejects.toThrow(/IoU must be > 0\.85|captureMethod must be/)
      await writeFile(snapshotPath, snapshotBytes)

      const behaviorPath = path.join(implementationRoot, 'behavior-spec.json')
      const behaviorBytes = await readFile(behaviorPath)
      const inventedBehavior = JSON.parse(behaviorBytes.toString('utf8')) as {
        assessments: Array<{ responseId: string }>
      }
      inventedBehavior.assessments[0]!.responseId = 'RESP-999'
      await writeFile(behaviorPath, `${JSON.stringify(inventedBehavior, null, 2)}\n`, 'utf8')
      await expect(runPython(builderScripts, 'validate_behavior_spec.py', [
        behaviorPath,
        '--case-dir', caseRoot,
        '--capability-index', path.join(root, 'artifacts', 'ai-capabilities', 'index.json'),
        '--json',
      ])).rejects.toThrow(/RESP IDs differ from the approved contract/)
      await writeFile(behaviorPath, behaviorBytes)

      const inventoryPath = path.join(implementationRoot, 'authoring-inventory.json')
      const inventoryBytes = await readFile(inventoryPath)
      const inventedInventory = JSON.parse(inventoryBytes.toString('utf8')) as {
        scenes: Array<{ entities: Array<{ authoringOutcomeId: string }> }>
      }
      inventedInventory.scenes[0]!.entities[0]!.authoringOutcomeId = 'AUTH-999'
      await writeFile(inventoryPath, `${JSON.stringify(inventedInventory, null, 2)}\n`, 'utf8')
      await expect(runPython(builderScripts, 'validate_authoring_inventory.py', [
        inventoryPath,
        '--project', projectPath,
        '--case-dir', caseRoot,
        '--json',
      ])).rejects.toThrow(/authoringOutcomeId is not approved/)
      await writeFile(inventoryPath, inventoryBytes)

      const capabilityHash = sha256(await readFile(
        path.join(root, 'artifacts', 'ai-capabilities', 'index.json'),
      ))
      const inventory = await loadJson<{
        caseId: string
        projectPath: string
        generatedFrom: {
          presentationScriptSha256: string
          capabilityIndexSha256: string
          developmentPlanSha256: string
        }
        scenes: Array<{
          sceneId: string
          entities: Array<{
            binding: string
            editability: 'canvas-distinct' | 'authoring-view' | 'property' | 'developer' | 'blocked'
            authoringOutcomeId: string
          }>
        }>
      }>(path.join(implementationRoot, 'authoring-inventory.json'))
      const builtState = await loadJson<ImplementationState>(
        path.join(implementationRoot, 'implementation-state.json'),
      )
      expect(inventory).toMatchObject({
        caseId: fixture.caseId,
        projectPath: `project/${fixture.caseId}.h5lesson`,
        generatedFrom: {
          presentationScriptSha256: readyCase.artifacts.presentationScript.sha256,
          capabilityIndexSha256: capabilityHash,
          developmentPlanSha256: installedHashes.developmentPlanSha256,
        },
        scenes: [{ sceneId: fixture.project.sceneId }],
      })
      expect(inventory.scenes[0]!.entities.map((entity) => entity.binding)).toEqual([
        'native:scene:scene_fraction_choice:node_fraction_title:text',
        'native:scene:scene_fraction_choice:node_fraction_prompt:text',
        'native:scene:scene_fraction_choice:node_fraction_feedback:text',
      ])
      expect(inventory.scenes[0]!.entities.map((entity) => entity.editability))
        .toEqual(['canvas-distinct', 'canvas-distinct', 'canvas-distinct'])
      expect(inventory.scenes[0]!.entities.map((entity) => entity.authoringOutcomeId))
        .toEqual(['AUTH-001', 'AUTH-002', 'AUTH-003'])
      expect(builtState).toMatchObject({
        schemaVersion: 2,
        status: 'implemented',
        presentationScriptSha256: readyCase.artifacts.presentationScript.sha256,
        capabilityIndexSha256: capabilityHash,
        developmentPlanSha256: installedHashes.developmentPlanSha256,
        behaviorSpecSha256: installedHashes.behaviorSpecSha256,
        currentProjectSha256: sha256(initialArchive),
      })

      const humanEditedPath = path.join(caseRoot, 'project', 'e2e-native-fast.human.h5lesson')
      await runTsx(path.join(implementationRoot, 'human-edit.ts'), [
        projectPath,
        humanEditedPath,
      ])
      const humanArchive = await readFile(humanEditedPath)
      const humanProject = openProjectArchive(humanArchive).project
      const humanTitle = humanProject.scenes[0]!.nodes.find(
        (node) => node.id === 'node_fraction_title',
      )
      expect(humanTitle).toMatchObject({
        type: 'text',
        text: fixture.project.humanEditedTitle,
      })
      expect(projectNodeIds(humanProject)).toEqual(initialNodeIds)
      expect(sha256(humanArchive)).not.toBe(sha256(initialArchive))

      const patchSource = await readFile(path.join(implementationRoot, 'patch.ts'), 'utf8')
      expect(patchSource).toContain("item.id === 'scene_fraction_choice'")
      expect(patchSource).toContain("item.id === 'node_fraction_feedback'")
      expect(patchSource).not.toContain('scenes[0]')
      await runTsx(path.join(implementationRoot, 'patch.ts'), [
        humanEditedPath,
        projectPath,
      ])

      const finalArchive = await readFile(projectPath)
      const finalProject = openProjectArchive(finalArchive).project
      const finalTitle = finalProject.scenes[0]!.nodes.find(
        (node) => node.id === 'node_fraction_title',
      )
      const finalFeedback = finalProject.scenes[0]!.nodes.find(
        (node) => node.id === 'node_fraction_feedback',
      )
      expect(finalTitle).toMatchObject({
        type: 'text',
        text: fixture.project.humanEditedTitle,
      })
      expect(finalFeedback).toMatchObject({
        type: 'text',
        text: fixture.project.builderPatchedFeedback,
      })
      expect(projectNodeIds(finalProject)).toEqual(initialNodeIds)
      expect(sha256(finalArchive)).not.toBe(sha256(humanArchive))

      const finalValidation = await runPython(builderScripts, 'validate_v8_case.py', [
        '--case-dir', caseRoot,
        '--editor-root', root,
        '--target', 'implementation',
        '--json',
      ])
      expect(JSON.parse(finalValidation.stdout)).toMatchObject({
        pipelineStatus: 'passed',
        target: 'implementation',
        errors: [],
      })
      const verifiedState = await loadJson<ImplementationState>(
        path.join(implementationRoot, 'implementation-state.json'),
      )
      expect(verifiedState).toMatchObject({
        status: 'verified',
        currentProjectSha256: sha256(finalArchive),
      })

      const evidence = await loadJson<{
        pipelineStatus: string
        outcomeStatus: string
        humanAcceptance: unknown
      }>(path.join(caseRoot, 'evidence', 'evidence-manifest.json'))
      expect(evidence).toMatchObject({
        pipelineStatus: 'not-run',
        outcomeStatus: 'placeholder',
        humanAcceptance: null,
      })
      expect(fixture.evidenceBoundary).toMatchObject({
        maximumAutomatedOutcome: 'engineering candidate',
        notEditorUiEvidence: true,
        notProductAcceptance: true,
      })
      expect(fixture.evidenceBoundary.deferredToW2).toEqual(expect.arrayContaining([
        'editor-ui-round-trip',
        'player-interaction',
        'single-html',
        'web-package',
        'pdf',
        'pptx',
        'screenshots',
        'recording',
        'human-acceptance',
      ]))
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }, 600_000)
})
