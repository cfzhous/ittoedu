// @vitest-environment node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { strToU8, zipSync } from 'fflate'
import PptxGenJS from 'pptxgenjs'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createProject,
  createScene,
  createTextNode,
} from '@/renderer/project/createProject'
import { createProjectArchive } from '@/renderer/project/projectArchive'

const execFileAsync = promisify(execFile)
const root = path.resolve(__dirname, '..', '..')
const validator = path.join(
  root,
  '.agents',
  'skills',
  'build-project-v8-courseware',
  'scripts',
  'validate_evidence.py',
)
const python = process.platform === 'win32' ? 'python' : 'python3'

interface EvidenceArtifact {
  id: string
  kind: string
  path: string
  sha256: string
}

interface EvidenceManifest {
  schemaVersion: 1 | 2
  caseId: string
  caseRoot: '..'
  pipelineStatus: 'not-run' | 'failed' | 'passed'
  outcomeStatus: 'unusable' | 'placeholder' | 'engineering candidate' | 'art candidate' | 'accepted'
  inputs: Record<string, string>
  commands: unknown[]
  artifacts: EvidenceArtifact[]
  editRoundTrips: Array<{
    binding: string
    beforeProjectSha256: string
    afterProjectSha256: string
    inventoryEntityIds?: string[]
    authoringOutcomeIds?: string[]
    beforeValue?: unknown
    afterValue?: unknown
    reopenedValue?: unknown
    playerObservedValue?: unknown
    evidenceArtifactIds: string[]
    exportEvidenceArtifactIds?: string[]
  }>
  sceneEvidence: Array<{ sceneId: string, sceneType: 'interactive' | 'static' }>
  requiredFrames: Array<{
    sceneId: string
    role: 'pre-interaction' | 'feedback' | 'stable-result' | 'static-stable'
    artifactId: string
  }>
  recordingRequired?: boolean
  differences: string[]
  remainingRisks: string[]
  verification?: {
    behaviorSpecArtifactId: string
    behaviorReportArtifactId: string
    authoringInventoryArtifactId: string
  }
  humanAcceptance: null | {
    decision: 'accepted'
    reviewer: string
    approvedAt: string
    approvalEvidence: string
    explicitOpinion: string
    scopeSha256: string
  }
}

interface ValidationReport {
  status: 'passed' | 'failed'
  currentAcceptanceScopeSha256: string
  errors: string[]
}

let temporaryRoot = ''

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function runValidator(manifestPath: string): Promise<ValidationReport> {
  try {
    const result = await execFileAsync(python, [validator, manifestPath, '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
      timeout: 20_000,
    })
    return JSON.parse(result.stdout) as ValidationReport
  } catch (error) {
    const failure = error as Error & { stdout?: string }
    if (!failure.stdout) throw error
    return JSON.parse(failure.stdout) as ValidationReport
  }
}

async function persistManifest(
  manifestPath: string,
  manifest: EvidenceManifest,
): Promise<ValidationReport> {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return runValidator(manifestPath)
}

function minimalPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1280 720] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  body += `startxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body, 'ascii')
}

function minimalMp4(): Buffer {
  // A real, independently generated one-frame H.264/MP4 recording. Keeping the
  // bytes in the test avoids an ffmpeg dependency in CI while exercising an
  // actual playable media container instead of a renamed text placeholder.
  return Buffer.from([
    'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMVbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAGQAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAA',
    'AAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAj90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAGQA',
    'AAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAABkAAAAAAABAAAA',
    'AAG3bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAABABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABYm1pbmYAAAAU',
    'dm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAASJzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAA',
    'AAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAE',
    'AAADAFA8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAN2QAAAAAAAAABhzdHRzAAAAAAAAAAEAAAABAAAEAAAAABxzdHNjAAAAAAAA',
    'AAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAALFAAAAAQAAABRzdGNvAAAAAAAAAAEAAANFAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwA',
    'AAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2Mi4xMi4xMDIAAAAIZnJlZQAAAs1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gy',
    'NjQgLSBjb3JlIDE2NSByMzIyMyAwNDgwY2IwIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4u',
    'b3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lf',
    'cmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bz',
    'a2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxh',
    'Y2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWln',
    'aHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEwIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAg',
    'cmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAA3',
    '//728P4FNlYEwQ==',
  ].join(''), 'base64')
}

async function makePptx(): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  const slide = pptx.addSlide()
  slide.addText('Project V8 evidence', { x: 0.5, y: 0.5, w: 4, h: 0.5 })
  const result = await pptx.write({ outputType: 'uint8array' })
  if (!(result instanceof Uint8Array)) throw new Error('PptxGenJS did not return bytes')
  return result
}

async function buildAuthenticManifest(): Promise<{
  caseRoot: string
  manifestPath: string
  manifest: EvidenceManifest
}> {
  const caseRoot = path.join(temporaryRoot, 'case')
  const evidenceRoot = path.join(caseRoot, 'evidence')
  const deliveryRoot = path.join(caseRoot, 'delivery')
  const implementationRoot = path.join(caseRoot, 'implementation')
  const projectRoot = path.join(caseRoot, 'project')
  await mkdir(evidenceRoot, { recursive: true })
  await mkdir(deliveryRoot, { recursive: true })
  await mkdir(implementationRoot, { recursive: true })
  await mkdir(projectRoot, { recursive: true })

  const presentationScriptSha256 = 'a'.repeat(64)
  const capabilityIndexSha256 = 'b'.repeat(64)
  const developmentPlanBytes = Buffer.from(
    '# Development Plan\n\n- Carrier: native Project V8\n- Target: engineering candidate\n',
    'utf8',
  )
  const developmentPlanSha256 = sha256(developmentPlanBytes)
  await writeFile(path.join(caseRoot, '03-development-plan.md'), developmentPlanBytes)

  const interactiveScene = createScene({ id: 'scene_interactive', name: '交互幕' })
  interactiveScene.nodes.push(createTextNode({
    id: 'title',
    name: '课程标题',
    text: '原始标题',
  }))
  const staticScene = createScene({ id: 'scene_static', name: '静态幕' })
  const project = createProject({
    id: 'evidence_authenticity',
    now: '2026-08-13T00:00:00.000Z',
    includeDefaultController: false,
    controls: 'none',
  })
  project.scenes = [interactiveScene, staticScene]
  const projectBytes = createProjectArchive({
    project,
    assetFiles: {},
    componentFiles: {},
  }, { mtime: '2026-08-13T00:00:00.000Z' })

  const htmlBytes = Buffer.from(
    [
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body>',
      '<button data-testid="teacher-next">下一幕</button>',
      '<button data-testid="teacher-escape">教师脱困</button>',
      '<button data-testid="required-action">提交</button>',
      '<button data-testid="record-assessment">记录评价</button>',
      '<div data-testid="assessment-recorded">已记录</div>',
      '<div id="title">修改后标题</div>',
      '<script>document.querySelector(`[data-testid="record-assessment"]`).addEventListener(`click`,()=>document.dispatchEvent(new CustomEvent(`courseware-assessment-result`,{detail:{responseId:`RESP-001`,status:`recorded`}})))</script>',
      '</body></html>',
    ].join(''),
    'utf8',
  )
  const webPackageBytes = zipSync({
    'index.html': strToU8('<!doctype html><html><body><script src="course-data.js"></script></body></html>'),
    'course-data.js': strToU8('globalThis.__COURSEWARE__={schemaVersion:1};'),
    'player/player.iife.js': strToU8('globalThis.CoursewarePlayer={mount(){}};'),
    'player/player.css': strToU8('html,body{width:100%;height:100%;}'),
  })
  const pngBytes = await Promise.all(
    ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6'].map(color =>
      sharp({
        create: { width: 1280, height: 720, channels: 4, background: color },
      }).png().toBuffer(),
    ),
  )

  const artifactSpecs: Array<[string, string, string, Uint8Array]> = [
    ['project', 'project', 'project/evidence-authenticity.h5lesson', projectBytes],
    ['html', 'html', 'delivery/lesson.html', htmlBytes],
    ['web-package', 'web-package', 'delivery/lesson-web.zip', webPackageBytes],
    ['pdf', 'pdf', 'delivery/lesson.pdf', minimalPdf()],
    ['pptx', 'pptx', 'delivery/lesson.pptx', await makePptx()],
    ['interactive-pre', 'screenshot', 'delivery/interactive-pre.png', pngBytes[0]!],
    ['interactive-feedback', 'screenshot', 'delivery/interactive-feedback.png', pngBytes[1]!],
    ['interactive-stable', 'screenshot', 'delivery/interactive-stable.png', pngBytes[2]!],
    ['static-stable', 'screenshot', 'delivery/static-stable.png', pngBytes[3]!],
    ['contact-sheet', 'contact-sheet', 'delivery/contact-sheet.png', pngBytes[4]!],
    ['recording', 'recording', 'delivery/interaction.mp4', minimalMp4()],
  ]
  const artifacts: EvidenceArtifact[] = []
  for (const [id, kind, relative, bytes] of artifactSpecs) {
    await writeFile(path.join(caseRoot, ...relative.split('/')), bytes)
    artifacts.push({ id, kind, path: relative, sha256: sha256(bytes) })
  }

  const behaviorTests = [
    {
      id: 'BEH-001',
      gate: 'teacherControl',
      contractRefs: ['CTRL-001'],
      sceneId: 'scene_interactive',
      steps: [{ id: 'STEP-001', action: 'click', selector: '[data-testid="teacher-next"]' }],
      assertions: [{ id: 'AST-001', type: 'visible', selector: 'body' }],
      witnessedEvents: [],
    },
    {
      id: 'BEH-002',
      gate: 'teacherEscape',
      contractRefs: ['ESC-001'],
      sceneId: 'scene_interactive',
      steps: [{ id: 'STEP-002', action: 'click', selector: '[data-testid="teacher-escape"]' }],
      assertions: [{ id: 'AST-002', type: 'visible', selector: 'body' }],
      witnessedEvents: [],
    },
    {
      id: 'BEH-003',
      gate: 'requiredActions',
      contractRefs: ['ACT-001'],
      sceneId: 'scene_interactive',
      steps: [{ id: 'STEP-003', action: 'click', selector: '[data-testid="required-action"]' }],
      assertions: [{ id: 'AST-003', type: 'visible', selector: 'body' }],
      witnessedEvents: [],
    },
    {
      id: 'BEH-004',
      gate: 'assessmentTolerance',
      contractRefs: ['RESP-001'],
      sceneId: 'scene_interactive',
      variant: 'human-recorded',
      steps: [{ id: 'STEP-004', action: 'click', selector: '[data-testid="record-assessment"]' }],
      assertions: [{ id: 'AST-004', type: 'visible', selector: '[data-testid="assessment-recorded"]' }],
      witnessedEvents: [{
        name: 'courseware-assessment-result',
        match: { responseId: 'RESP-001' },
      }],
    },
    {
      id: 'BEH-005',
      gate: 'authoringOutcome',
      contractRefs: ['AUTH-001'],
      sceneId: 'scene_interactive',
      steps: [{ id: 'STEP-005', action: 'reload', selector: 'body' }],
      assertions: [{ id: 'AST-005', type: 'text', selector: '#title', expected: '修改后标题' }],
      witnessedEvents: [],
    },
  ]
  const gateRequirements = {
    teacherControl: ['BEH-001'],
    teacherEscape: ['BEH-002'],
    requiredActions: ['BEH-003'],
    assessmentTolerance: ['BEH-004'],
    authoringOutcome: ['BEH-005'],
    responseCapacity: [],
  }
  const behaviorSpec = {
    schemaVersion: 2,
    caseId: 'evidence-authenticity',
    presentationScriptSha256,
    developmentPlanSha256,
    assessments: [{
      responseId: 'RESP-001',
      mode: 'human',
      authority: 'teacher',
    }],
    responseCapacity: {
      durationSeconds: 300,
      nonResponseSeconds: 120,
      items: [{
        responseId: 'RESP-001',
        baselineCount: 1,
        baselineSecondsEach: 20,
        retryCount: 0,
        retrySecondsEach: 0,
        discussionCount: 1,
        discussionSecondsEach: 30,
      }],
    },
    gateRequirements,
    tests: behaviorTests,
  }
  const behaviorSpecBytes = Buffer.from(`${JSON.stringify(behaviorSpec, null, 2)}\n`, 'utf8')
  const behaviorSpecSha256 = sha256(behaviorSpecBytes)
  await writeFile(path.join(implementationRoot, 'behavior-spec.json'), behaviorSpecBytes)
  artifacts.push({
    id: 'behavior-spec',
    kind: 'behavior-spec',
    path: 'implementation/behavior-spec.json',
    sha256: behaviorSpecSha256,
  })

  const inventory = {
    schemaVersion: 2,
    caseId: 'evidence-authenticity',
    projectPath: 'project/evidence-authenticity.h5lesson',
    generatedFrom: {
      presentationScriptSha256,
      capabilityIndexSha256,
      developmentPlanSha256,
    },
    scenes: [
      {
        sceneId: 'scene_interactive',
        ownership: 'native-owned',
        entities: [{
          id: 'scene-interactive-title',
          label: '课程标题',
          kind: 'text',
          sourceRef: 'CNT-001',
          intent: '教师可修改课程标题并在播放与导出结果中看到修改',
          authoringEntry: '属性面板 / 文本',
          expectedOutcome: '保存、重开和 Player 均显示修改后标题',
          authoringOutcomeId: 'AUTH-001',
          binding: 'native:scene:scene_interactive:title:text',
          editability: 'property',
          requiredForAcceptance: true,
        }],
      },
      {
        sceneId: 'scene_static',
        ownership: 'native-owned',
        entities: [],
      },
    ],
    globalEntities: [],
  }
  const inventoryBytes = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
  await writeFile(path.join(implementationRoot, 'authoring-inventory.json'), inventoryBytes)
  artifacts.push({
    id: 'authoring-inventory',
    kind: 'authoring-inventory',
    path: 'implementation/authoring-inventory.json',
    sha256: sha256(inventoryBytes),
  })

  const behaviorReportTests = behaviorTests.map(test => ({
    id: test.id,
    gate: test.gate,
    status: 'passed',
    steps: test.steps.map(step => ({ id: step.id, status: 'passed' })),
    assertions: test.assertions.map(assertion => ({ id: assertion.id, status: 'passed' })),
    witnessedEvents: test.id === 'BEH-004'
      ? [{
          name: 'courseware-assessment-result',
          detail: { responseId: 'RESP-001', status: 'recorded' },
        }]
      : [],
  }))
  const behaviorReport = {
    schemaVersion: 2,
    caseId: 'evidence-authenticity',
    specSha256: behaviorSpecSha256,
    presentationScriptSha256,
    developmentPlanSha256,
    target: {
      path: 'delivery/lesson.html',
      sha256: sha256(htmlBytes),
    },
    tests: behaviorReportTests,
    gates: {
      teacherControl: { status: 'passed', testIds: ['BEH-001'] },
      teacherEscape: { status: 'passed', testIds: ['BEH-002'] },
      requiredActions: { status: 'passed', testIds: ['BEH-003'] },
      assessmentTolerance: { status: 'passed', testIds: ['BEH-004'] },
      authoringOutcome: { status: 'passed', testIds: ['BEH-005'] },
      responseCapacity: { status: 'passed', testIds: [] },
    },
    summary: { passed: 5, failed: 0 },
  }
  const behaviorReportBytes = Buffer.from(`${JSON.stringify(behaviorReport, null, 2)}\n`, 'utf8')
  await writeFile(path.join(evidenceRoot, 'behavior-report.json'), behaviorReportBytes)
  artifacts.push({
    id: 'behavior-report',
    kind: 'behavior-report',
    path: 'evidence/behavior-report.json',
    sha256: sha256(behaviorReportBytes),
  })

  const manifest: EvidenceManifest = {
    schemaVersion: 2,
    caseId: 'evidence-authenticity',
    caseRoot: '..',
    pipelineStatus: 'passed',
    outcomeStatus: 'engineering candidate',
    inputs: {
      presentationScriptSha256,
      capabilityIndexSha256,
      developmentPlanSha256,
      behaviorSpecSha256,
    },
    commands: [],
    artifacts,
    editRoundTrips: [{
      binding: 'native:scene:scene_interactive:title:text',
      beforeProjectSha256: sha256(Buffer.from('before-project', 'utf8')),
      afterProjectSha256: sha256(projectBytes),
      inventoryEntityIds: ['scene-interactive-title'],
      authoringOutcomeIds: ['AUTH-001'],
      beforeValue: '原始标题',
      afterValue: '修改后标题',
      reopenedValue: '修改后标题',
      playerObservedValue: '修改后标题',
      evidenceArtifactIds: ['project', 'interactive-stable'],
      exportEvidenceArtifactIds: ['html', 'pdf', 'pptx'],
    }],
    sceneEvidence: [
      { sceneId: 'scene_interactive', sceneType: 'interactive' },
      { sceneId: 'scene_static', sceneType: 'static' },
    ],
    requiredFrames: [],
    differences: [],
    remainingRisks: [],
    verification: {
      behaviorSpecArtifactId: 'behavior-spec',
      behaviorReportArtifactId: 'behavior-report',
      authoringInventoryArtifactId: 'authoring-inventory',
    },
    humanAcceptance: null,
  }
  return {
    caseRoot,
    manifestPath: path.join(evidenceRoot, 'evidence-manifest.json'),
    manifest,
  }
}

beforeEach(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-v8-evidence-'))
})

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

describe('Project V8 evidence authenticity gate', () => {
  it('keeps standalone evidence structural-only and binds outcomeStatus into the scope', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    const engineering = await persistManifest(manifestPath, manifest)
    expect(engineering.status).toBe('failed')
    expect(engineering.errors).toContain(
      'candidate evidence requires validate_v8_case trusted behavior replay; standalone validate_evidence is structural-only',
    )

    manifest.outcomeStatus = 'art candidate'
    const art = await persistManifest(manifestPath, manifest)
    expect(art.status).toBe('failed')
    expect(art.errors).toContain(
      'art candidate cannot be issued by the local evidence validator without an external trusted human review receipt',
    )
    expect(art.currentAcceptanceScopeSha256)
      .not.toBe(engineering.currentAcceptanceScopeSha256)
  })

  it('rejects automated reviewer tokens and phrases', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    manifest.outcomeStatus = 'accepted'
    manifest.humanAcceptance = {
      decision: 'accepted',
      reviewer: 'Codex automation',
      approvedAt: '2026-08-13T08:00:00+08:00',
      approvalEvidence: 'human-review-session-1',
      explicitOpinion: '已审看真实产物并同意验收',
      scopeSha256: '',
    }
    const unbound = await persistManifest(manifestPath, manifest)
    manifest.humanAcceptance.scopeSha256 = unbound.currentAcceptanceScopeSha256
    for (const reviewer of [
      'Codex automation',
      'ChatGPT',
      'AI agent/bot',
      '中文自动化审阅',
      '课程智能体',
    ]) {
      manifest.humanAcceptance.reviewer = reviewer
      const report = await persistManifest(manifestPath, manifest)
      expect(report.errors, reviewer)
        .toContain('automation cannot be the acceptance reviewer')
    }
  }, 15_000)

  it('does not let a free-text named human self-sign accepted locally', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    manifest.outcomeStatus = 'accepted'
    manifest.humanAcceptance = {
      decision: 'accepted',
      reviewer: '王老师',
      approvedAt: '2026-08-13T08:00:00+08:00',
      approvalEvidence: 'human-review-session-2',
      explicitOpinion: '已审看真实产物并同意验收',
      scopeSha256: '',
    }
    const unbound = await persistManifest(manifestPath, manifest)
    expect(unbound.errors).toContain(
      'humanAcceptance scopeSha256 does not match the current evidence scope',
    )
    manifest.humanAcceptance.scopeSha256 = unbound.currentAcceptanceScopeSha256
    expect((await persistManifest(manifestPath, manifest)).errors).toContain(
      'accepted cannot be issued by the local evidence validator without an external trusted human review receipt',
    )
  })

  it('rejects renamed text, malformed containers, and a reused delivery path', async () => {
    const { caseRoot, manifestPath, manifest } = await buildAuthenticManifest()
    const corruptIds = new Set([
      'project',
      'html',
      'web-package',
      'pdf',
      'pptx',
      'interactive-pre',
      'contact-sheet',
      'recording',
    ])
    for (const artifact of manifest.artifacts) {
      if (!corruptIds.has(artifact.id)) continue
      const corrupt = Buffer.from(`not a real ${artifact.kind}\n`, 'utf8')
      await writeFile(path.join(caseRoot, ...artifact.path.split('/')), corrupt)
      artifact.sha256 = sha256(corrupt)
    }
    const contactSheet = manifest.artifacts.find(item => item.id === 'contact-sheet')!
    const feedback = manifest.artifacts.find(item => item.id === 'interactive-feedback')!
    contactSheet.path = feedback.path
    contactSheet.sha256 = feedback.sha256

    const report = await persistManifest(manifestPath, manifest)
    const errors = report.errors.join('\n')
    expect(report.status).toBe('failed')
    expect(errors).toContain('project artifact is not a readable ZIP container')
    expect(errors).toContain('html artifact is implausibly small')
    expect(errors).toContain('web-package artifact is not a readable ZIP container')
    expect(errors).toContain('pdf artifact has no valid PDF header')
    expect(errors).toContain('pptx artifact is not a readable OOXML ZIP container')
    expect(errors).toContain('has no recognizable image header and dimensions')
    expect(errors).toContain('recording artifact has no recognizable media container header')
    expect(errors).toContain('duplicate artifact path')
  })

  it('keeps locally unverifiable frames out of an engineering candidate', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    manifest.requiredFrames = [
      { sceneId: 'scene_interactive', role: 'stable-result', artifactId: 'interactive-stable' },
    ]

    const report = await persistManifest(manifestPath, manifest)
    const errors = report.errors.join('\n')
    expect(errors).toContain('engineering candidate requiredFrames must be empty')
  })

  it('requires recording only when the approved manifest scope derives recordingRequired', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    manifest.artifacts = manifest.artifacts.filter(artifact => artifact.kind !== 'recording')
    const ordinary = await persistManifest(manifestPath, manifest)
    expect(ordinary.errors.join('\n')).not.toContain('delivery evidence is missing artifact kinds: recording')

    manifest.recordingRequired = true
    const required = await persistManifest(manifestPath, manifest)
    expect(required.errors.join('\n')).toContain('delivery evidence is missing artifact kinds: recording')
  })

  it('requires sceneEvidence to cover exactly the delivered Project V8 scenes', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    manifest.sceneEvidence = [
      { sceneId: 'scene_interactive', sceneType: 'interactive' },
      { sceneId: 'scene_unknown', sceneType: 'static' },
    ]
    const report = await persistManifest(manifestPath, manifest)
    const errors = report.errors.join('\n')
    expect(errors).toContain('sceneEvidence is missing Project V8 scenes: scene_static')
    expect(errors).toContain('sceneEvidence declares scenes absent from Project V8: scene_unknown')
  })

  it('rejects schema v2 custom artifact kinds and shell command strings', async () => {
    const { caseRoot, manifestPath, manifest } = await buildAuthenticManifest()
    const customBytes = Buffer.from('custom evidence bypass', 'utf8')
    await writeFile(path.join(caseRoot, 'delivery', 'custom.txt'), customBytes)
    manifest.artifacts.push({
      id: 'custom-bypass',
      kind: 'custom-success',
      path: 'delivery/custom.txt',
      sha256: sha256(customBytes),
    })
    manifest.commands[0] = {
      command: 'npm run --silent check:ai-capabilities',
      exitCode: 0,
    } as never

    const report = await persistManifest(manifestPath, manifest)
    const errors = report.errors.join('\n')
    expect(errors).toContain('unsupported schemaVersion 2 artifact kind')
    expect(errors).toContain('self-reported command results are forbidden')
    expect(errors).toContain('commands must be the closed empty set')
  })

  it('keeps an empty placeholder manifest resumable', async () => {
    const caseRoot = path.join(temporaryRoot, 'placeholder-case')
    const manifestPath = path.join(caseRoot, 'evidence', 'evidence-manifest.json')
    await mkdir(path.dirname(manifestPath), { recursive: true })
    const placeholder: EvidenceManifest = {
      schemaVersion: 1,
      caseId: 'placeholder-case',
      caseRoot: '..',
      pipelineStatus: 'not-run',
      outcomeStatus: 'placeholder',
      inputs: {},
      commands: [],
      artifacts: [],
      editRoundTrips: [],
      sceneEvidence: [],
      requiredFrames: [],
      differences: [],
      remainingRisks: [],
      humanAcceptance: null,
    }
    expect(await persistManifest(manifestPath, placeholder))
      .toMatchObject({ status: 'passed', errors: [] })
  })
})
