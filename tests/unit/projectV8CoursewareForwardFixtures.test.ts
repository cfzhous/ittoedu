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
import { describe, expect, it } from 'vitest'
import {
  createFormulaNode,
  createProject,
  createScene,
  createTextNode,
} from '@/renderer/project/createProject'
import {
  createProjectArchive,
  openProjectArchive,
} from '@/renderer/project/projectArchive'
import { projectDocumentSchema } from '@/shared/projectSchema'
import type {
  FormulaAstNode,
  ProjectDocument,
  ScenePresentation,
} from '@/shared/projectTypes'

const execFileAsync = promisify(execFile)
const root = path.resolve(__dirname, '..', '..')
const fixtureRoot = path.join(root, 'tests', 'fixtures', 'courseware-v8')
const skillScripts = path.join(
  root,
  '.agents',
  'skills',
  'build-project-v8-courseware',
  'scripts',
)
const python = process.platform === 'win32' ? 'python' : 'python3'
const archiveTimestamp = '2026-08-13T00:00:00.000Z'

interface FixtureState {
  id: string
  name: string
  semantic: 'hidden' | 'success' | 'error'
  nodeOverrides: Record<string, Record<string, unknown>>
}

interface ForwardFixture {
  schemaVersion: 1
  fixtureId: string
  fixturePurpose: 'mechanism-only'
  pathMode: 'fast' | 'high-risk'
  carrierDecision: {
    selected: 'native-owned' | 'hybrid-owned'
    reason: string
    rejected: string[]
  }
  project: {
    id: string
    title: string
    sceneId: string
    sceneName: string
    backgroundColor: string
    nodeIds: Record<string, string>
    content: Record<string, string>
    formula?: {
      formulaId: string
      accessibleText: string
      ast: FormulaAstNode
    }
  }
  presentation: {
    initialStateId: string
    thumbnailStateId: string
    staticStateId: string
    states: FixtureState[]
  }
  runtime?: {
    renderMode: 'hybrid'
    content: Record<string, string>
    nodeBindings: Record<string, string>
    staticFallback: {
      assetId: string
      coverage: 'runtime-layer'
      layer: 'underlay'
      base64File: string
    }
    source: string
  }
  patchScenario: {
    humanEdit: { binding: string, value: string }
    builderPatch: { binding: string, value: string }
  }
  evidenceBoundary: {
    maximumAutomatedOutcome: 'engineering candidate'
    notProductAcceptance: true
    deferredToW2: string[]
  }
}

type InventoryEditability =
  | 'canvas-distinct'
  | 'authoring-view'
  | 'property'
  | 'developer'
  | 'blocked'

interface AuthoringInventoryV2 {
  schemaVersion: 2
  caseId: string
  projectPath: string
  generatedFrom: {
    presentationScriptSha256: string
    capabilityIndexSha256: string
    developmentPlanSha256: string
  }
  globalEntities: unknown[]
  scenes: Array<{
    sceneId: string
    ownership: 'native-owned' | 'runtime-owned' | 'hybrid-owned' | 'component-composed'
    entities: Array<{
      id: string
      binding: string
      editability: InventoryEditability
      intent: string
      authoringEntry: string
      expectedOutcome: string
      authoringOutcomeId: string
    }>
  }>
}

type PythonFailure = Error & { stdout?: string, stderr?: string }

async function loadJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(fixtureRoot, ...segments), 'utf8')) as T
}

function presentationFrom(fixture: ForwardFixture): ScenePresentation {
  return {
    initialStateId: fixture.presentation.initialStateId,
    thumbnailStateId: fixture.presentation.thumbnailStateId,
    states: structuredClone(fixture.presentation.states),
  } as ScenePresentation
}

function buildNativeProject(fixture: ForwardFixture): ProjectDocument {
  if (!fixture.project.formula) throw new Error('native fixture requires a formula')
  const project = createProject({
    id: fixture.project.id,
    title: fixture.project.title,
    now: archiveTimestamp,
    includeDefaultController: false,
    controls: 'none',
  })
  const scene = createScene({
    id: fixture.project.sceneId,
    name: fixture.project.sceneName,
    backgroundColor: fixture.project.backgroundColor,
  })
  scene.nodes = [
    createTextNode({
      id: fixture.project.nodeIds.title,
      name: '题目标题',
      x: 80,
      y: 56,
      width: 1120,
      height: 72,
      text: fixture.project.content.title,
    }),
    createFormulaNode({
      id: fixture.project.nodeIds.formula,
      name: '判别式',
      x: 350,
      y: 174,
      width: 580,
      height: 180,
      formulaId: fixture.project.formula.formulaId,
      accessibleText: fixture.project.formula.accessibleText,
      ast: fixture.project.formula.ast,
    }),
    createTextNode({
      id: fixture.project.nodeIds.hint,
      name: '计算提示',
      x: 160,
      y: 392,
      width: 960,
      height: 70,
      text: fixture.project.content.hint,
    }),
    createTextNode({
      id: fixture.project.nodeIds.feedback,
      name: '稳定反馈',
      x: 160,
      y: 500,
      width: 960,
      height: 92,
      text: fixture.project.content.feedback,
    }),
  ]
  scene.presentation = presentationFrom(fixture)
  project.scenes = [scene]
  return projectDocumentSchema.parse(project)
}

async function buildHybridArchive(
  fixture: ForwardFixture,
): Promise<{ project: ProjectDocument, archive: Uint8Array }> {
  if (!fixture.runtime) throw new Error('hybrid fixture requires a runtime')
  const project = createProject({
    id: fixture.project.id,
    title: fixture.project.title,
    now: archiveTimestamp,
    includeDefaultController: false,
    controls: 'none',
  })
  const scene = createScene({
    id: fixture.project.sceneId,
    name: fixture.project.sceneName,
    backgroundColor: fixture.project.backgroundColor,
  })
  scene.nodes = [
    createTextNode({
      id: fixture.project.nodeIds.title,
      name: '实验标题',
      x: 72,
      y: 52,
      width: 1136,
      height: 82,
      text: fixture.project.content.title,
    }),
    createTextNode({
      id: fixture.project.nodeIds.status,
      name: '稳定复核状态',
      x: 120,
      y: 570,
      width: 1040,
      height: 86,
      text: fixture.project.content.status,
    }),
  ]
  scene.presentation = presentationFrom(fixture)
  const fallbackBytes = Buffer.from(
    (await readFile(
      path.join(
        fixtureRoot,
        'runtime-hybrid-high-risk',
        fixture.runtime.staticFallback.base64File,
      ),
      'utf8',
    )).trim(),
    'base64',
  )
  const fallbackId = fixture.runtime.staticFallback.assetId
  project.assets[fallbackId] = {
    id: fallbackId,
    filename: 'hybrid-static-fallback.png',
    mimeType: 'image/png',
    kind: 'image',
    path: 'assets/hybrid-static-fallback.png',
    byteLength: fallbackBytes.byteLength,
    width: 1,
    height: 1,
  }
  scene.runtime = {
    runtimeApiVersion: 2,
    enabled: true,
    renderMode: fixture.runtime.renderMode,
    source: fixture.runtime.source,
    content: {
      values: structuredClone(fixture.runtime.content),
      metadata: {
        prompt: { label: '实验提示' },
        hiddenMessage: { label: '隐藏态说明' },
        successMessage: { label: '成功态说明' },
        errorMessage: { label: '错误态说明' },
      },
    },
    assets: {},
    nodeBindings: structuredClone(fixture.runtime.nodeBindings),
    staticFallback: {
      assetId: fallbackId,
      coverage: fixture.runtime.staticFallback.coverage,
      layer: fixture.runtime.staticFallback.layer,
    },
  }
  project.scenes = [scene]
  const parsed = projectDocumentSchema.parse(project)
  return {
    project: parsed,
    archive: createProjectArchive({
      project: parsed,
      assetFiles: { [fallbackId]: fallbackBytes },
      componentFiles: {},
    }, { mtime: archiveTimestamp }),
  }
}

function archiveWithoutAssets(project: ProjectDocument): Uint8Array {
  return createProjectArchive({
    project: projectDocumentSchema.parse(project),
    assetFiles: {},
    componentFiles: {},
  }, { mtime: archiveTimestamp })
}

function applyStablePatch(
  project: ProjectDocument,
  binding: string,
  value: string,
): void {
  const parts = binding.split(':')
  const [owner, scope] = parts
  if (scope !== 'scene') throw new Error(`fixture patch requires scene scope: ${binding}`)
  const scene = project.scenes.find((item) => item.id === parts[2])
  if (!scene) throw new Error(`stable scene id not found: ${parts[2]}`)
  if (owner === 'native') {
    const node = scene.nodes.find((item) => item.id === parts[3])
    if (!node || node.type !== 'text' || parts[4] !== 'text') {
      throw new Error(`stable native text binding not found: ${binding}`)
    }
    node.text = value
    return
  }
  if (owner === 'runtime' && parts[3] === 'text') {
    const key = parts[4]
    if (!scene.runtime || !key || !(key in scene.runtime.content.values)) {
      throw new Error(`stable runtime content binding not found: ${binding}`)
    }
    scene.runtime.content.values[key] = value
    return
  }
  throw new Error(`unsupported fixture binding: ${binding}`)
}

async function runPython(
  script: string,
  args: string[],
  expectFailure = false,
): Promise<{ stdout: string, stderr: string }> {
  try {
    const result = await execFileAsync(
      python,
      [path.join(skillScripts, script), ...args],
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
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
}

async function validateInventory(
  archive: Uint8Array,
  inventory: unknown,
): Promise<Record<string, unknown>> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-v8-forward-'))
  try {
    const inventoryProjectPath = (inventory as { projectPath?: unknown }).projectPath
    if (typeof inventoryProjectPath !== 'string') throw new Error('fixture inventory has no projectPath')
    const projectPath = path.join(temporaryRoot, path.basename(inventoryProjectPath))
    const inventoryPath = path.join(temporaryRoot, 'authoring-inventory.json')
    await writeFile(projectPath, archive)
    await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
    const result = await runPython('validate_authoring_inventory.py', [
      inventoryPath,
      '--project',
      projectPath,
      '--structural-only',
      '--json',
    ])
    return JSON.parse(result.stdout) as Record<string, unknown>
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

function nodeIds(project: ProjectDocument): string[] {
  return project.scenes.flatMap((scene) => scene.nodes.map((node) => node.id)).sort()
}

describe('Project V8 courseware forward fixtures', () => {
  it('builds and locally patches the native formula fixture through real V8 APIs', async () => {
    const fixture = await loadJson<ForwardFixture>('native-simple', 'fixture.json')
    const inventory = await loadJson<AuthoringInventoryV2>(
      'native-simple',
      'authoring-inventory.json',
    )
    const project = buildNativeProject(fixture)
    const archive = archiveWithoutAssets(project)
    const reopened = openProjectArchive(archive)

    expect(fixture).toMatchObject({
      pathMode: 'fast',
      fixturePurpose: 'mechanism-only',
      carrierDecision: { selected: 'native-owned' },
    })
    expect(fixture.carrierDecision.rejected).toHaveLength(2)
    expect(inventory).toMatchObject({
      schemaVersion: 2,
      generatedFrom: { developmentPlanSha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      scenes: [{
        ownership: 'native-owned',
        entities: expect.arrayContaining([
          expect.objectContaining({ editability: 'canvas-distinct', authoringOutcomeId: 'AUTH-001' }),
        ]),
      }],
    })
    expect(reopened.project.schemaVersion).toBe(8)
    expect(reopened.project.scenes[0]!.presentation).toMatchObject({
      initialStateId: 'state_native_hidden',
      thumbnailStateId: 'state_native_success',
    })
    expect(reopened.project.scenes[0]!.presentation?.states.map((state) => state.id))
      .toEqual(['state_native_hidden', 'state_native_success', 'state_native_error'])
    const formula = reopened.project.scenes[0]!.nodes.find(
      (node) => node.id === fixture.project.nodeIds.formula,
    )
    expect(formula).toMatchObject({
      type: 'formula',
      formulaId: 'formula_discriminant',
      accessibleText: '德尔塔等于 b 的平方减去四 a c',
    })
    expect(fixture.presentation.staticStateId).toBe('state_native_success')
    expect(await validateInventory(archive, inventory)).toMatchObject({
      status: 'passed',
      errors: [],
    })

    const beforeIds = nodeIds(reopened.project)
    applyStablePatch(
      reopened.project,
      fixture.patchScenario.humanEdit.binding,
      fixture.patchScenario.humanEdit.value,
    )
    const afterHumanEdit = openProjectArchive(archiveWithoutAssets(reopened.project))
    applyStablePatch(
      afterHumanEdit.project,
      fixture.patchScenario.builderPatch.binding,
      fixture.patchScenario.builderPatch.value,
    )
    const afterBuilderPatch = openProjectArchive(
      archiveWithoutAssets(afterHumanEdit.project),
    ).project
    const title = afterBuilderPatch.scenes[0]!.nodes.find(
      (node) => node.id === fixture.project.nodeIds.title,
    )
    const feedback = afterBuilderPatch.scenes[0]!.nodes.find(
      (node) => node.id === fixture.project.nodeIds.feedback,
    )
    expect(title).toMatchObject({ text: fixture.patchScenario.humanEdit.value })
    expect(feedback).toMatchObject({ text: fixture.patchScenario.builderPatch.value })
    expect(nodeIds(afterBuilderPatch)).toEqual(beforeIds)
    expect(fixture.evidenceBoundary).toMatchObject({
      maximumAutomatedOutcome: 'engineering candidate',
      notProductAcceptance: true,
    })
  })

  it('builds a high-risk hybrid fixture with stable states and a real static fallback', async () => {
    const fixture = await loadJson<ForwardFixture>(
      'runtime-hybrid-high-risk',
      'fixture.json',
    )
    const inventory = await loadJson<AuthoringInventoryV2>(
      'runtime-hybrid-high-risk',
      'authoring-inventory.json',
    )
    const built = await buildHybridArchive(fixture)
    const reopened = openProjectArchive(built.archive)
    const scene = reopened.project.scenes[0]!

    expect(fixture).toMatchObject({
      pathMode: 'high-risk',
      fixturePurpose: 'mechanism-only',
      carrierDecision: { selected: 'hybrid-owned' },
    })
    expect(inventory).toMatchObject({
      schemaVersion: 2,
      generatedFrom: { developmentPlanSha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      scenes: [{
        ownership: 'hybrid-owned',
        entities: expect.arrayContaining([
          expect.objectContaining({ editability: 'authoring-view', authoringOutcomeId: 'AUTH-003' }),
          expect.objectContaining({ editability: 'property', authoringOutcomeId: 'AUTH-004' }),
        ]),
      }],
    })
    expect(scene.runtime).toMatchObject({
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'hybrid',
      nodeBindings: { stableStatus: fixture.project.nodeIds.status },
      staticFallback: {
        assetId: 'asset_hybrid_static_fallback',
        coverage: 'runtime-layer',
        layer: 'underlay',
      },
    })
    expect(reopened.assetFiles.asset_hybrid_static_fallback?.byteLength).toBeGreaterThan(0)
    expect(scene.presentation?.states.map((state) => state.id)).toEqual([
      'state_hybrid_hidden',
      'state_hybrid_success',
      'state_hybrid_error',
    ])
    expect(fixture.presentation.staticStateId).toBe('state_hybrid_success')
    expect(await validateInventory(built.archive, inventory)).toMatchObject({
      status: 'passed',
      errors: [],
    })

    const beforeIds = nodeIds(reopened.project)
    applyStablePatch(
      reopened.project,
      fixture.patchScenario.humanEdit.binding,
      fixture.patchScenario.humanEdit.value,
    )
    const humanArchive = createProjectArchive({
      project: reopened.project,
      assetFiles: reopened.assetFiles,
      componentFiles: reopened.componentFiles,
    }, { mtime: archiveTimestamp })
    const afterHumanEdit = openProjectArchive(humanArchive)
    applyStablePatch(
      afterHumanEdit.project,
      fixture.patchScenario.builderPatch.binding,
      fixture.patchScenario.builderPatch.value,
    )
    const patched = openProjectArchive(createProjectArchive({
      project: afterHumanEdit.project,
      assetFiles: afterHumanEdit.assetFiles,
      componentFiles: afterHumanEdit.componentFiles,
    }, { mtime: archiveTimestamp })).project
    const title = patched.scenes[0]!.nodes.find(
      (node) => node.id === fixture.project.nodeIds.title,
    )
    expect(title).toMatchObject({ text: fixture.patchScenario.humanEdit.value })
    expect(patched.scenes[0]!.runtime?.content.values.prompt)
      .toBe(fixture.patchScenario.builderPatch.value)
    expect(nodeIds(patched)).toEqual(beforeIds)
    expect(fixture.evidenceBoundary.deferredToW2).toEqual(expect.arrayContaining([
      'editor-ui-round-trip',
      'player-interaction',
      'pdf',
      'pptx',
      'screenshots',
      'recording',
      'human-acceptance',
    ]))
  })

  it('rejects session-local Runtime target IDs instead of persisting Player snapshots', async () => {
    const fixture = await loadJson<ForwardFixture>(
      'runtime-hybrid-high-risk',
      'fixture.json',
    )
    const inventory = await loadJson<Record<string, unknown>>(
      'runtime-hybrid-high-risk',
      'authoring-inventory.json',
    )
    const built = await buildHybridArchive(fixture)
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-v8-target-id-'))
    try {
      const projectPath = path.join(temporaryRoot, 'fixture.h5lesson')
      const inventoryPath = path.join(temporaryRoot, 'authoring-inventory.json')
      await writeFile(projectPath, built.archive)
      const variants = [
        'runtime:scene:scene_hybrid_energy:text:registered:1',
        'runtime:scene:scene_hybrid_energy:text:targetId',
      ]
      for (const binding of variants) {
        const invalid = structuredClone(inventory) as {
          scenes: Array<{ entities: Array<{ binding: string }> }>
        }
        invalid.scenes[0]!.entities[2]!.binding = binding
        await writeFile(inventoryPath, `${JSON.stringify(invalid, null, 2)}\n`, 'utf8')
        const result = await runPython('validate_authoring_inventory.py', [
          inventoryPath,
          '--project',
          projectPath,
          '--structural-only',
          '--json',
        ], true)
        const report = JSON.parse(result.stdout) as { errors: string[] }
        expect(report.errors.join('\n')).toMatch(
          /invalid persistent binding|session-local target id is forbidden/,
        )
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('rejects stale evidence and an automated accepted claim without product artifacts', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-v8-evidence-'))
    try {
      const evidenceDirectory = path.join(temporaryRoot, 'evidence')
      await mkdir(evidenceDirectory, { recursive: true })
      const artifactPath = path.join(temporaryRoot, 'mechanism-only.txt')
      const manifestPath = path.join(evidenceDirectory, 'evidence-manifest.json')
      const artifactBytes = Buffer.from('W1-5 mechanism fixture; not product evidence.\n')
      await writeFile(artifactPath, artifactBytes)
      const artifact = {
        id: 'mechanism-only',
        kind: 'mechanism-fixture',
        path: 'mechanism-only.txt',
        sha256: '0'.repeat(64),
      }
      const manifest = {
        schemaVersion: 1,
        caseId: 'negative-forward-evidence',
        caseRoot: '..',
        pipelineStatus: 'not-run',
        outcomeStatus: 'placeholder',
        inputs: {},
        commands: [],
        artifacts: [artifact],
        editRoundTrips: [],
        differences: [],
        remainingRisks: ['真实产品证据留给 W2'],
        humanAcceptance: null,
      }
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      const stale = await runPython(
        'validate_evidence.py',
        [manifestPath, '--json'],
        true,
      )
      expect((JSON.parse(stale.stdout) as { errors: string[] }).errors.join('\n'))
        .toContain('evidence hash is stale')

      artifact.sha256 = createHash('sha256').update(artifactBytes).digest('hex')
      const automatedAccepted = {
        ...manifest,
        pipelineStatus: 'passed',
        outcomeStatus: 'accepted',
        commands: [{ command: 'mechanism-only', exitCode: 0 }],
        editRoundTrips: [{
          binding: 'native:scene:scene:test:text',
          beforeProjectSha256: '1'.repeat(64),
          afterProjectSha256: '2'.repeat(64),
          evidenceArtifactIds: ['mechanism-only'],
        }],
        humanAcceptance: {
          decision: 'accepted',
          reviewer: 'Codex',
          approvedAt: '2026-08-13T00:00:00Z',
          approvalEvidence: 'invalid-automated-claim',
          explicitOpinion: '自动化不能做此判断',
          scopeSha256: '0'.repeat(64),
        },
      }
      await writeFile(
        manifestPath,
        `${JSON.stringify(automatedAccepted, null, 2)}\n`,
        'utf8',
      )
      const rejected = await runPython(
        'validate_evidence.py',
        [manifestPath, '--json'],
        true,
      )
      const errors = (JSON.parse(rejected.stdout) as { errors: string[] }).errors
      expect(errors).toContain('automation cannot be the acceptance reviewer')
      expect(errors.join('\n')).toContain('delivery evidence is missing artifact kinds')
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
})
