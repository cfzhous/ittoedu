// @vitest-environment node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  link,
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
  computeBehaviorGates,
  parseBehaviorRunnerArgs,
  runCoursewareBehaviorCli,
} from '../../scripts/run-courseware-behavior'

const execFileAsync = promisify(execFile)
const root = path.resolve(__dirname, '..', '..')
const validatorScripts = path.join(
  root,
  '.agents',
  'skills',
  'build-project-v8-courseware',
  'scripts',
)
const python = process.platform === 'win32' ? 'python' : 'python3'
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const behaviorRunner = path.join(root, 'scripts', 'run-courseware-behavior.ts')

let caseRoot = ''

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function behaviorTest(
  id: string,
  gate: string,
  contractRef: string,
  step: Record<string, unknown>,
  assertion: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    gate,
    contractRefs: [contractRef],
    sceneId: 'scene-001',
    timeoutMs: 5_000,
    steps: [{ id: 'STEP-001', ...step }],
    assertions: [{ id: 'AST-001', ...assertion }],
    witnessedEvents: [],
    ...extra,
  }
}

function validSpec(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    caseId: 'behavior-runner-fixture',
    coursewareContractSha256: 'c'.repeat(64),
    presentationScriptSha256: 'a'.repeat(64),
    developmentPlanSha256: 'b'.repeat(64),
    assessments: [{
      responseId: 'RESP-001',
      collectionMode: 'digital-required',
      responseType: 'choice',
      mode: 'finite-auto',
      authority: 'system',
      navigationGate: 'hard',
      teacherOverrideRef: 'ESC-001',
      evaluatorRef: 'component:fixture-evaluator@1',
      acceptedValues: ['A', 'figure A'],
      toleranceCaseRefs: ['TOL-001', 'TOL-002', 'TOL-003'],
    }],
    responseCapacity: {
      durationSeconds: 300,
      nonResponseSeconds: 120,
      items: [{
        responseId: 'RESP-001',
        baselineCount: 1,
        baselineSecondsEach: 30,
        retryCount: 1,
        retrySecondsEach: 20,
        discussionCount: 1,
        discussionSecondsEach: 60,
      }],
    },
    gateRequirements: {
      teacherControl: ['BEH-001'],
      teacherEscape: ['BEH-002'],
      requiredActions: ['BEH-003'],
      assessmentTolerance: ['BEH-004', 'BEH-005', 'BEH-006'],
      authoringOutcome: ['BEH-007'],
      responseCapacity: [],
    },
    tests: [
      behaviorTest(
        'BEH-001',
        'teacherControl',
        'CTRL-001',
        { action: 'click', selector: '[data-testid="teacher-next"]' },
        { type: 'text', selector: '#scene', expected: 'scene-2' },
        {
          projectStateId: 'state-001',
          witnessedEvents: [
            {
              name: 'courseware-teacher-escape-action',
              match: {
                action: 'next', phase: 'requested', sceneId: 'scene-001', stateId: 'state-001',
              },
              afterStepId: 'STEP-001',
            },
            {
              name: 'courseware-teacher-escape-action',
              match: {
                action: 'next', phase: 'completed', accepted: true,
                sceneId: 'scene-001', stateId: 'state-001',
              },
              afterStepId: 'STEP-001',
            },
          ],
        },
      ),
      behaviorTest(
        'BEH-002',
        'teacherEscape',
        'ESC-001',
        { action: 'click', selector: '[data-testid="teacher-escape"]' },
        { type: 'visible', selector: '#escaped' },
        {
          projectStateId: 'state-001',
          witnessedEvents: [
            {
              name: 'courseware-teacher-escape-action',
              match: {
                action: 'replay', phase: 'requested', sceneId: 'scene-001', stateId: 'state-001',
              },
              afterStepId: 'STEP-001',
            },
            {
              name: 'courseware-teacher-escape-action',
              match: {
                action: 'replay', phase: 'completed', accepted: true,
                sceneId: 'scene-001', stateId: 'state-001',
              },
              afterStepId: 'STEP-001',
            },
          ],
        },
      ),
      behaviorTest(
        'BEH-003',
        'requiredActions',
        'ACT-001',
        { action: 'fill', selector: '#answer', value: '42' },
        { type: 'value', selector: '#answer', expected: '42' },
        { actionKind: 'text-input' },
      ),
      behaviorTest(
        'BEH-004',
        'assessmentTolerance',
        'RESP-001',
        { action: 'click', selector: '[data-variant="exact"]' },
        { type: 'text', selector: '#assessment', expected: 'accepted' },
        {
          variant: 'exact',
          input: 'A',
          expectedResult: 'pass',
          witnessedEvents: [{
            name: 'courseware:assessment-result',
            match: { responseId: 'RESP-001', accepted: true, variant: 'exact' },
            afterStepId: 'STEP-001',
          }],
        },
      ),
      behaviorTest(
        'BEH-005',
        'assessmentTolerance',
        'RESP-001',
        { action: 'click', selector: '[data-variant="accepted-variant"]' },
        { type: 'text', selector: '#assessment', expected: 'accepted' },
        {
          variant: 'accepted-variant',
          input: 'figure A',
          expectedResult: 'pass',
          witnessedEvents: [{
            name: 'courseware:assessment-result',
            match: { responseId: 'RESP-001', accepted: true, variant: 'accepted-variant' },
            afterStepId: 'STEP-001',
          }],
        },
      ),
      behaviorTest(
        'BEH-006',
        'assessmentTolerance',
        'RESP-001',
        { action: 'click', selector: '[data-variant="rejected"]' },
        { type: 'text', selector: '#assessment', expected: 'rejected' },
        {
          variant: 'rejected',
          input: 'B',
          expectedResult: 'fail',
          witnessedEvents: [{
            name: 'courseware:assessment-result',
            match: { responseId: 'RESP-001', accepted: false, variant: 'rejected' },
            afterStepId: 'STEP-001',
          }],
        },
      ),
      behaviorTest(
        'BEH-007',
        'authoringOutcome',
        'AUTH-001',
        { action: 'reload' },
        { type: 'visible', selector: '#title' },
      ),
    ],
  }
}

const html = `<!doctype html>
<html lang="zh-CN">
  <body>
    <button data-testid="teacher-next">下一页</button>
    <button data-testid="teacher-escape">教师出口</button>
    <p id="scene">scene-1</p>
    <p id="escaped" hidden>escaped</p>
    <input id="answer" />
    <input id="title" value="original title" />
    <button data-variant="exact">精确值</button>
    <button data-variant="accepted-variant">允许变体</button>
    <button data-variant="rejected">拒绝值</button>
    <p id="assessment">pending</p>
    <script>
      const hostEvidenceSessionId = crypto.randomUUID()
      let hostEvidenceSequence = 0
      console.info('[courseware-host-evidence-v1] ' + JSON.stringify({
        schemaVersion: 1,
        kind: 'session-start',
        sessionId: hostEvidenceSessionId,
        sequence: 0,
      }))
      const emitTeacherEscape = (action, phase, bypassNavigationGuards, accepted) => {
        const detail = {
          action,
          phase,
          sceneId: 'scene-001',
          stateId: 'state-001',
          bypassNavigationGuards,
          ...(accepted === undefined ? {} : { accepted }),
        }
        console.info('[courseware-host-evidence-v1] ' + JSON.stringify({
          schemaVersion: 1,
          kind: 'teacher-escape-recorded',
          sessionId: hostEvidenceSessionId,
          sequence: ++hostEvidenceSequence,
          ...detail,
          eventType: 'click',
        }))
        window.dispatchEvent(new CustomEvent('courseware-teacher-escape-action', { detail }))
      }
      document.querySelector('[data-testid="teacher-next"]').addEventListener('click', () => {
        emitTeacherEscape('next', 'requested', false)
        document.querySelector('#scene').textContent = 'scene-2'
        emitTeacherEscape('next', 'completed', false, true)
      })
      document.querySelector('[data-testid="teacher-escape"]').addEventListener('click', () => {
        emitTeacherEscape('replay', 'requested', true)
        document.querySelector('#escaped').hidden = false
        emitTeacherEscape('replay', 'completed', true, true)
      })
      document.querySelector('#answer').addEventListener('input', (event) => {
        console.info('[courseware-host-evidence-v1] ' + JSON.stringify({
          schemaVersion: 1,
          kind: 'action-recorded',
          sessionId: hostEvidenceSessionId,
          sequence: ++hostEvidenceSequence,
          scope: 'scene',
          sceneId: 'scene-001',
          actId: 'ACT-001',
          responseId: null,
          actionKind: 'text-input',
          eventType: event.type,
        }))
      })
      for (const button of document.querySelectorAll('[data-variant]')) {
        button.addEventListener('click', () => {
          const variant = button.dataset.variant
          const accepted = variant !== 'rejected'
          const input = variant === 'exact' ? 'A' : variant === 'accepted-variant' ? 'figure A' : 'B'
          document.querySelector('#assessment').textContent = accepted ? 'accepted' : 'rejected'
          console.info('[courseware-host-evidence-v1] ' + JSON.stringify({
            schemaVersion: 1,
            kind: 'assessment-evaluated',
            sessionId: hostEvidenceSessionId,
            sequence: ++hostEvidenceSequence,
            scope: 'scene',
            sceneId: 'scene-001',
            responseId: 'RESP-001',
            evaluatorId: 'component:fixture-evaluator@1',
            input,
            acceptedValues: ['A', 'figure A'],
            normalizedInput: input.trim(),
            status: accepted ? 'pass' : 'fail',
          }))
          document.dispatchEvent(new CustomEvent('courseware:assessment-result', {
            detail: { responseId: 'RESP-001', accepted, variant },
          }))
        })
      }
    </script>
  </body>
</html>
`

beforeEach(async () => {
  caseRoot = await mkdtemp(path.join(os.tmpdir(), 'courseware-behavior-runner-'))
})

afterEach(async () => {
  if (caseRoot) await rm(caseRoot, { recursive: true, force: true })
})

describe('courseware behavior runner', () => {
  it('parses portable defaults and recomputes response capacity rather than trusting a report', () => {
    expect(parseBehaviorRunnerArgs(['--case-dir', 'case'])).toEqual({
      caseDir: 'case',
      spec: 'implementation/behavior-spec.json',
      report: 'evidence/behavior-report.json',
    })
    const spec = validSpec() as never
    const testResults = (spec as { tests: Array<{ id: string }> }).tests.map(({ id }) => ({
      id,
      status: 'passed' as const,
    }))
    const gates = computeBehaviorGates(spec, testResults)
    expect(Object.values(gates).every(({ status }) => status === 'passed')).toBe(true)
    ;(spec as { responseCapacity: { durationSeconds: number } }).responseCapacity.durationSeconds = 1
    expect(computeBehaviorGates(spec, testResults).responseCapacity.status).toBe('failed')
  })

  it('rejects wrong extensions and report hardlink aliases before browser execution', async () => {
    const specPath = path.join(caseRoot, 'implementation', 'behavior-spec.json')
    const targetPath = path.join(caseRoot, 'delivery', 'lesson.html')
    const hardlinkReport = path.join(caseRoot, 'evidence', 'behavior-report.json')
    await writeJson(specPath, validSpec())
    await mkdir(path.dirname(targetPath), { recursive: true })
    await mkdir(path.dirname(hardlinkReport), { recursive: true })
    await writeFile(targetPath, html, 'utf8')
    await link(specPath, hardlinkReport)

    for (const args of [
      ['--spec', 'implementation/behavior-spec.json', '--target', 'delivery/lesson.html', '--report', 'evidence/report.txt'],
      ['--spec', 'implementation/behavior-spec.json', '--target', 'delivery/lesson.html', '--report', 'evidence/behavior-report.json'],
    ]) {
      let stderr = ''
      const exitCode = await runCoursewareBehaviorCli(
        ['--case-dir', caseRoot, ...args],
        { stdout: () => undefined, stderr: value => { stderr += value } },
      )
      expect(exitCode, stderr).toBe(2)
    }
  })

  it('runs real Chromium through public DOM controls and emits an evidence-validator-compatible report', async () => {
    const specPath = path.join(caseRoot, 'implementation', 'behavior-spec.json')
    const targetPath = path.join(caseRoot, 'delivery', 'lesson.html')
    const reportPath = path.join(caseRoot, 'evidence', 'behavior-report.json')
    await writeJson(specPath, validSpec())
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, html, 'utf8')

    let stdout = ''
    let stderr = ''
    const exitCode = await runCoursewareBehaviorCli([
      '--case-dir', caseRoot,
      '--spec', 'implementation/behavior-spec.json',
      '--target', 'delivery/lesson.html',
      '--report', 'evidence/behavior-report.json',
    ], {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value },
    })

    expect(exitCode, stderr).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({ status: 'passed' })
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
      specSha256: string
      runnerSha256: string
      errors: string[]
      target: { path: string, sha256: string }
      tests: Array<{
        status: string
        witnessedEvents: unknown[]
        hostEvidence: Array<{ kind: string, sequence: number, afterStepId: string | null }>
      }>
      gates: Record<string, { status: string }>
      summary: { passed: number, failed: number }
    }
    expect(report.specSha256).toBe(
      createHash('sha256').update(await readFile(specPath)).digest('hex'),
    )
    expect(report.runnerSha256).toBe(
      createHash('sha256').update(await readFile(path.join(root, 'scripts', 'run-courseware-behavior.ts'))).digest('hex'),
    )
    expect(report.errors).toEqual([])
    expect(report.target).toEqual({
      path: 'delivery/lesson.html',
      sha256: createHash('sha256').update(await readFile(targetPath)).digest('hex'),
    })
    expect(report.tests).toHaveLength(7)
    expect(report.tests.every(({ status }) => status === 'passed')).toBe(true)
    expect(report.tests[3]!.witnessedEvents).toEqual([{
      name: 'courseware:assessment-result',
      detail: { responseId: 'RESP-001', accepted: true, variant: 'exact' },
      afterStepId: 'STEP-001',
    }])
    expect(report.tests[6]!.hostEvidence).toEqual([expect.objectContaining({
      kind: 'session-start',
      sequence: 0,
      afterStepId: null,
    })])
    expect(Object.values(report.gates).every(({ status }) => status === 'passed')).toBe(true)
    expect(report.summary).toEqual({ passed: 7, failed: 0 })

    const validatorCode = [
      'import hashlib,json,sys',
      `sys.path.insert(0, ${JSON.stringify(validatorScripts)})`,
      'from validate_evidence import computed_behavior_gates',
      `spec_path=${JSON.stringify(specPath)}`,
      `report_path=${JSON.stringify(reportPath)}`,
      `case_root=${JSON.stringify(caseRoot)}`,
      'spec_bytes=open(spec_path,"rb").read()',
      'spec=json.loads(spec_bytes)',
      'report=json.load(open(report_path,encoding="utf-8"))',
      'errors=[]',
      `editor_root=${JSON.stringify(root)}`,
      'gates=computed_behavior_gates(spec,hashlib.sha256(spec_bytes).hexdigest(),report,__import__("pathlib").Path(case_root),__import__("pathlib").Path(editor_root),errors)',
      'print(json.dumps({"errors":errors,"gates":gates}))',
      'raise SystemExit(1 if errors else 0)',
    ].join(';')
    const validation = await execFileAsync(python, ['-c', validatorCode], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
      timeout: 15_000,
    })
    expect(JSON.parse(validation.stdout)).toMatchObject({ errors: [] })

    const validReplayExit = await runCoursewareBehaviorCli([
      '--case-dir', caseRoot,
      '--spec', 'implementation/behavior-spec.json',
      '--target', 'delivery/lesson.html',
      '--report', 'evidence/behavior-report.json',
      '--verify-report',
    ], { stdout: () => undefined, stderr: () => undefined })
    expect(validReplayExit).toBe(0)

    // Exercise the actual tsx CLI compilation path. esbuild keepNames once
    // leaked its module-scoped __name helper into the serialized init script,
    // while the direct Vitest import path appeared healthy.
    const cliReplay = await execFileAsync(process.execPath, [
      tsx,
      '--tsconfig', path.join(root, 'tsconfig.json'),
      behaviorRunner,
      '--case-dir', caseRoot,
      '--spec', 'implementation/behavior-spec.json',
      '--target', 'delivery/lesson.html',
      '--report', 'evidence/behavior-report.json',
      '--verify-report',
    ], { cwd: os.tmpdir(), encoding: 'utf8', timeout: 30_000 })
    expect(JSON.parse(cliReplay.stdout)).toMatchObject({ status: 'passed' })

    const tamperedReport = { ...report, summary: { passed: 999, failed: 0 } }
    const tamperedBytes = `${JSON.stringify(tamperedReport, null, 2)}\n`
    await writeFile(reportPath, tamperedBytes, 'utf8')
    let replayStdout = ''
    const replayExit = await runCoursewareBehaviorCli([
      '--case-dir', caseRoot,
      '--spec', 'implementation/behavior-spec.json',
      '--target', 'delivery/lesson.html',
      '--report', 'evidence/behavior-report.json',
      '--verify-report',
    ], {
      stdout: value => { replayStdout += value },
      stderr: () => undefined,
    })
    expect(replayExit).toBe(1)
    expect(replayStdout).toContain('与可信重放结果不一致')
    expect(await readFile(reportPath, 'utf8')).toBe(tamperedBytes)
  }, 60_000)

  it('returns exit 1 for an observable failure and still writes the complete report', async () => {
    const spec = validSpec()
    const firstAssertion = (
      spec as {
        tests: Array<{ assertions: Array<Record<string, unknown>> }>
      }
    ).tests[0]!.assertions[0]!
    firstAssertion.expected = 'unreachable-scene'
    firstAssertion.timeoutMs = 150
    await writeJson(path.join(caseRoot, 'implementation', 'behavior-spec.json'), spec)
    await mkdir(path.join(caseRoot, 'delivery'), { recursive: true })
    await writeFile(path.join(caseRoot, 'delivery', 'lesson.html'), html, 'utf8')

    const exitCode = await runCoursewareBehaviorCli([
      '--case-dir', caseRoot,
      '--target', 'delivery/lesson.html',
    ], { stdout: () => undefined, stderr: () => undefined })

    expect(exitCode).toBe(1)
    const report = JSON.parse(
      await readFile(path.join(caseRoot, 'evidence', 'behavior-report.json'), 'utf8'),
    ) as {
      tests: Array<{ id: string, status: string, assertions: Array<{ id: string, status: string }> }>
      gates: Record<string, { status: string }>
      summary: { passed: number, failed: number }
    }
    expect(report.tests).toHaveLength(7)
    expect(report.tests[0]).toMatchObject({
      id: 'BEH-001',
      status: 'failed',
      assertions: [{ id: 'AST-001', status: 'failed' }],
    })
    expect(report.gates.teacherControl.status).toBe('failed')
    expect(report.summary).toEqual({ passed: 6, failed: 1 })
  }, 60_000)

  it('rejects forged host action/teacher event types, null assessment response IDs, and sequence gaps', async () => {
    await writeJson(path.join(caseRoot, 'implementation', 'behavior-spec.json'), validSpec())
    await mkdir(path.join(caseRoot, 'delivery'), { recursive: true })
    const variants = [
      {
        label: 'action event type',
        source: html.replace('eventType: event.type', "eventType: 'submit'"),
        expected: 'missing unique host-owned action trace',
      },
      {
        label: 'teacher event type',
        source: html.replace("eventType: 'click',", "eventType: 'submit',"),
        expected: 'host evidence session/sequence is invalid or was spoofed',
      },
      {
        label: 'teacher phase order',
        source: html.replace(
          "emitTeacherEscape('next', 'requested', false)\n        document.querySelector('#scene').textContent = 'scene-2'\n        emitTeacherEscape('next', 'completed', false, true)",
          "emitTeacherEscape('next', 'completed', false, true)\n        document.querySelector('#scene').textContent = 'scene-2'\n        emitTeacherEscape('next', 'requested', false)",
        ),
        expected: 'missing exact host-owned teacher escape trace',
      },
      {
        label: 'assessment response ID',
        source: html.replace(
          "responseId: 'RESP-001',\n            evaluatorId:",
          "responseId: null,\n            evaluatorId:",
        ),
        expected: 'missing host-owned assessment trace',
      },
      {
        label: 'sequence gap',
        source: html.replace('sequence: ++hostEvidenceSequence', 'sequence: 99'),
        expected: 'host evidence session/sequence is invalid or was spoofed',
      },
    ]
    for (const variant of variants) {
      await writeFile(path.join(caseRoot, 'delivery', 'lesson.html'), variant.source, 'utf8')
      const exitCode = await runCoursewareBehaviorCli([
        '--case-dir', caseRoot,
        '--target', 'delivery/lesson.html',
      ], { stdout: () => undefined, stderr: () => undefined })
      expect(exitCode, variant.label).toBe(1)
      const report = JSON.parse(
        await readFile(path.join(caseRoot, 'evidence', 'behavior-report.json'), 'utf8'),
      ) as { tests: Array<{ runtimeErrors: string[] }> }
      expect(report.tests.flatMap(test => test.runtimeErrors).join('\n')).toContain(variant.expected)
      if (variant.label === 'teacher phase order') {
        const validatorCode = [
          'import hashlib,json,sys',
          `sys.path.insert(0, ${JSON.stringify(validatorScripts)})`,
          'from validate_evidence import computed_behavior_gates',
          `spec_path=${JSON.stringify(path.join(caseRoot, 'implementation', 'behavior-spec.json'))}`,
          `report_path=${JSON.stringify(path.join(caseRoot, 'evidence', 'behavior-report.json'))}`,
          'spec_bytes=open(spec_path,"rb").read()',
          'spec=json.loads(spec_bytes)',
          'report=json.load(open(report_path,encoding="utf-8"))',
          'errors=[]',
          `gates=computed_behavior_gates(spec,hashlib.sha256(spec_bytes).hexdigest(),report,__import__('pathlib').Path(${JSON.stringify(caseRoot)}),__import__('pathlib').Path(${JSON.stringify(root)}),errors)`,
          'print(json.dumps({"errors":errors,"gates":gates}))',
          'raise SystemExit(1 if errors else 0)',
        ].join(';')
        await expect(execFileAsync(python, ['-c', validatorCode], {
          encoding: 'utf8',
          env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
          timeout: 15_000,
        })).rejects.toMatchObject({ stdout: expect.stringContaining('out of order') })
      }
    }
  }, 60_000)
})
