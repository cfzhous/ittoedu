import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import http, { type Server } from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  chromium,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test'

const GATES = [
  'teacherControl',
  'teacherEscape',
  'requiredActions',
  'assessmentTolerance',
  'authoringOutcome',
  'responseCapacity',
] as const

const BROWSER_GATES = GATES.filter((gate) => gate !== 'responseCapacity')
const EVENT_CONSOLE_PREFIX = 'COURSEWARE_BEHAVIOR_EVENT_V2:'
const HOST_EVIDENCE_CONSOLE_PREFIX = '[courseware-host-evidence-v1] '
const DEFAULT_SPEC = 'implementation/behavior-spec.json'
const DEFAULT_REPORT = 'evidence/behavior-report.json'
const DEFAULT_MANIFEST = 'evidence/evidence-manifest.json'

type Gate = typeof GATES[number]
type BrowserGate = typeof BROWSER_GATES[number]
type ResultStatus = 'passed' | 'failed' | 'not-run'

interface BehaviorStep {
  id: string
  action:
    | 'click'
    | 'fill'
    | 'press'
    | 'select-option'
    | 'check'
    | 'drag'
    | 'wait-visible'
    | 'reload'
  selector?: string
  value?: string
  key?: string
  targetSelector?: string
  timeoutMs?: number
}

interface BehaviorAssertion {
  id: string
  type:
    | 'visible'
    | 'hidden'
    | 'text'
    | 'value'
    | 'attribute'
    | 'count'
    | 'enabled'
    | 'url'
  selector?: string
  expected?: unknown
  name?: string
  match?: 'exact' | 'contains'
  timeoutMs?: number
}

interface ExpectedEvent {
  name: string
  match?: Record<string, unknown>
  afterStepId: string
}

interface BehaviorTest {
  id: string
  gate: BrowserGate
  contractRefs?: string[]
  sceneId?: string
  input?: string
  expectedResult?: 'pass' | 'fail'
  actionKind?: string
  timeoutMs?: number
  steps: BehaviorStep[]
  preAssertions?: BehaviorAssertion[]
  assertions: BehaviorAssertion[]
  witnessedEvents?: ExpectedEvent[]
}

interface AssessmentSpec {
  responseId: string
  mode: 'finite-auto' | 'normalized-auto' | 'human'
  evaluatorRef?: string
  acceptedValues?: string[]
}

interface CapacityItem {
  responseId: string
  baselineCount: number
  baselineSecondsEach: number
  retryCount: number
  retrySecondsEach: number
  discussionCount: number
  discussionSecondsEach: number
}

interface BehaviorSpecV2 {
  schemaVersion: 2
  caseId: string
  coursewareContractSha256: string
  presentationScriptSha256: string
  developmentPlanSha256: string
  responseCapacity: {
    durationSeconds: number
    nonResponseSeconds: number
    items: CapacityItem[]
  }
  gateRequirements: Record<Gate, string[]>
  assessments: AssessmentSpec[]
  tests: BehaviorTest[]
}

interface WitnessedEvent {
  name: string
  detail: Record<string, unknown>
  afterStepId: string | null
}

interface HostEvidenceRecord {
  schemaVersion: 1
  kind:
    | 'session-start'
    | 'assessment-evaluated'
    | 'action-recorded'
    | 'teacher-escape-recorded'
  sessionId: string
  sequence: number
  afterStepId: string | null
  scope?: 'scene' | 'global'
  sceneId?: string | null
  responseId?: string | null
  evaluatorId?: string
  input?: string
  acceptedValues?: string[]
  normalizedInput?: string
  status?: 'pass' | 'fail'
  actId?: string
  actionKind?: string
  eventType?: string
  action?: 'previous' | 'next' | 'scene-picker' | 'replay'
  phase?: 'requested' | 'confirmation-required' | 'completed'
  stateId?: string | null
  bypassNavigationGuards?: boolean
  accepted?: boolean
}

interface ItemResult {
  id: string
  status: ResultStatus
  error?: string
}

interface TestResult {
  id: string
  gate: BrowserGate
  status: 'passed' | 'failed'
  steps: ItemResult[]
  assertions: ItemResult[]
  witnessedEvents: WitnessedEvent[]
  hostEvidence: HostEvidenceRecord[]
  runtimeErrors: string[]
  screenshot?: { path: string, sha256: string, width: 1280, height: 720 }
  error?: string
}

interface GateResult {
  status: 'passed' | 'failed'
  testIds: string[]
}

export interface BehaviorReportV2 {
  schemaVersion: 2
  caseId: string
  specSha256: string
  runnerSha256: string
  coursewareContractSha256: string
  presentationScriptSha256: string
  developmentPlanSha256: string
  target: {
    path: string
    sha256: string
  }
  tests: TestResult[]
  gates: Record<Gate, GateResult>
  summary: {
    passed: number
    failed: number
  }
  errors: string[]
}

export interface BehaviorRunnerOptions {
  caseDir: string
  spec: string
  target?: string
  report: string
  screenshotDir?: string
  verifyReport?: boolean
}

interface RunnerIo {
  stdout(value: string): void
  stderr(value: string): void
}

const defaultIo: RunnerIo = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
}

class ConfigurationError extends Error {}

const usage = [
  '用法：npm run --silent run-courseware-behavior -- [选项]',
  '',
  '  --case-dir <dir>       课例根目录（默认当前目录）',
  `  --spec <path>          Behavior Spec（默认 ${DEFAULT_SPEC}）`,
  '  --target <path>        被测 HTML；省略时从 evidence manifest 的 html artifact 推导',
  `  --report <path>        输出报告（默认 ${DEFAULT_REPORT}）`,
  '  --screenshot-dir <dir> 可选：每项测试结束后保存整页截图',
  '  --verify-report        重放并与已有 --report 做 canonical 全量比对，不覆写报告',
].join('\n')

export function parseBehaviorRunnerArgs(argv: readonly string[]): BehaviorRunnerOptions {
  const options: BehaviorRunnerOptions = {
    caseDir: '.',
    spec: DEFAULT_SPEC,
    report: DEFAULT_REPORT,
  }
  const valueFlags = new Set([
    '--case-dir',
    '--spec',
    '--target',
    '--report',
    '--screenshot-dir',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--help' || flag === '-h') throw new ConfigurationError(usage)
    if (flag === '--verify-report') {
      options.verifyReport = true
      continue
    }
    if (!flag || !valueFlags.has(flag)) {
      throw new ConfigurationError(`未知参数：${flag ?? ''}\n\n${usage}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new ConfigurationError(`${flag} 缺少值\n\n${usage}`)
    }
    index += 1
    if (flag === '--case-dir') options.caseDir = value
    if (flag === '--spec') options.spec = value
    if (flag === '--target') options.target = value
    if (flag === '--report') options.report = value
    if (flag === '--screenshot-dir') options.screenshotDir = value
  }
  return options
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function resolveInside(caseRoot: string, value: string, label: string): string {
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(caseRoot, value)
  if (!isWithin(caseRoot, resolved)) {
    throw new ConfigurationError(`${label} 必须位于课例目录内：${value}`)
  }
  const realRoot = realpathSync.native(caseRoot)
  let existing = resolved
  while (!existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) throw new ConfigurationError(`${label} 没有安全的已存在父目录：${value}`)
    existing = parent
  }
  if (!isWithin(realRoot, realpathSync.native(existing))) {
    throw new ConfigurationError(`${label} 经符号链接或 reparse point 越出课例目录：${value}`)
  }
  return resolved
}

function pathIdentity(filename: string): string {
  const resolved = existsSync(filename) ? realpathSync.native(filename) : path.resolve(filename)
  if (existsSync(filename)) {
    const metadata = statSync(filename, { bigint: true })
    if (metadata.ino !== 0n) return `inode:${metadata.dev}:${metadata.ino}`
  }
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved
}

function requireExtension(filename: string, extensions: readonly string[], label: string): void {
  if (!extensions.includes(path.extname(filename).toLowerCase())) {
    throw new ConfigurationError(`${label} 必须使用 ${extensions.join(' 或 ')}`)
  }
}

function portableRelative(caseRoot: string, filename: string): string {
  const relative = path.relative(caseRoot, filename)
  if (!relative || relative === '.' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ConfigurationError(`无法生成课例内相对路径：${filename}`)
  }
  return relative.split(path.sep).join('/')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize)
    if (typeof item === 'object' && item !== null) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      )
    }
    return item
  }
  return JSON.stringify(normalize(value))
}

function stableReportProjection(value: unknown): unknown {
  const cloned = JSON.parse(JSON.stringify(value)) as unknown
  if (typeof cloned !== 'object' || cloned === null || Array.isArray(cloned)) return cloned
  const tests = (cloned as { tests?: unknown }).tests
  if (!Array.isArray(tests)) return cloned
  for (const test of tests) {
    if (typeof test !== 'object' || test === null || Array.isArray(test)) continue
    const records = (test as { hostEvidence?: unknown }).hostEvidence
    if (!Array.isArray(records)) continue
    const sessionStart = records.find((record) => (
      typeof record === 'object' && record !== null && !Array.isArray(record) &&
      (record as { kind?: unknown }).kind === 'session-start'
    )) as { sessionId?: unknown } | undefined
    const sessionId = sessionStart?.sessionId
    if (typeof sessionId !== 'string') continue
    for (const record of records) {
      if (
        typeof record === 'object' && record !== null && !Array.isArray(record) &&
        (record as { sessionId?: unknown }).sessionId === sessionId
      ) {
        ;(record as { sessionId: string }).sessionId = '<fresh-random-host-session>'
      }
    }
  }
  return cloned
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').trim().slice(0, 2_000)
}

function validHostEvidenceShape(record: HostEvidenceRecord): boolean {
  if (record.kind === 'session-start') {
    return record.schemaVersion === 1 && record.sequence === 0 && record.afterStepId === null &&
      Object.keys(record).sort().join(',') ===
        ['afterStepId', 'kind', 'schemaVersion', 'sequence', 'sessionId'].sort().join(',')
  }
  if (record.kind === 'teacher-escape-recorded') {
    const acceptedShape = record.phase === 'requested'
      ? record.accepted === undefined
      : record.phase === 'confirmation-required'
        ? record.accepted === false
        : record.phase === 'completed' && typeof record.accepted === 'boolean'
    const expectedKeys = [
      'action', 'afterStepId', 'bypassNavigationGuards', 'eventType', 'kind', 'phase',
      'sceneId', 'schemaVersion', 'sequence', 'sessionId', 'stateId',
      ...(record.phase === 'requested' ? [] : ['accepted']),
    ]
    return record.schemaVersion === 1 && Number.isInteger(record.sequence) && record.sequence > 0 &&
      ['previous', 'next', 'scene-picker', 'replay'].includes(record.action ?? '') &&
      ['requested', 'confirmation-required', 'completed'].includes(record.phase ?? '') &&
      (record.sceneId === null || (typeof record.sceneId === 'string' && record.sceneId.length > 0)) &&
      (record.stateId === null || (typeof record.stateId === 'string' && record.stateId.length > 0)) &&
      typeof record.bypassNavigationGuards === 'boolean' && acceptedShape &&
      record.eventType === 'click' &&
      (record.afterStepId === null || typeof record.afterStepId === 'string') &&
      Object.keys(record).sort().join(',') === expectedKeys.sort().join(',')
  }
  const common = record.schemaVersion === 1 && Number.isInteger(record.sequence) && record.sequence > 0 &&
    (record.scope === 'scene' || record.scope === 'global') &&
    (record.scope === 'scene' ? typeof record.sceneId === 'string' && record.sceneId.length > 0 : record.sceneId === null) &&
    (record.responseId === null || (
      typeof record.responseId === 'string' && /^RESP-\d{3,}$/.test(record.responseId)
    )) &&
    (record.afterStepId === null || typeof record.afterStepId === 'string')
  if (!common) return false
  if (record.kind === 'assessment-evaluated') {
    return typeof record.evaluatorId === 'string' && typeof record.input === 'string' &&
      Array.isArray(record.acceptedValues) && record.acceptedValues.every((item) => typeof item === 'string') &&
      typeof record.normalizedInput === 'string' && (record.status === 'pass' || record.status === 'fail') &&
      Object.keys(record).sort().join(',') === [
        'acceptedValues', 'afterStepId', 'evaluatorId', 'input', 'kind', 'normalizedInput',
        'responseId', 'sceneId', 'schemaVersion', 'scope', 'sequence', 'sessionId', 'status',
      ].sort().join(',')
  }
  return record.kind === 'action-recorded' &&
    typeof record.actId === 'string' && /^ACT-\d{3,}$/.test(record.actId) &&
    typeof record.actionKind === 'string' && [
      'click', 'select', 'text-input', 'formula-input', 'drag', 'sort', 'circle-text',
      'highlight', 'parameter-change', 'oral', 'paper', 'teacher-command',
    ].includes(record.actionKind) &&
    typeof record.eventType === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(record.eventType) &&
    Object.keys(record).sort().join(',') === [
      'actId', 'actionKind', 'afterStepId', 'eventType', 'kind', 'responseId', 'sceneId',
      'schemaVersion', 'scope', 'sequence', 'sessionId',
    ].sort().join(',')
}

function expectedTeacherBypass(
  expected: ExpectedEvent,
  teacherEvents: readonly ExpectedEvent[],
): boolean | undefined {
  const match = expected.match ?? {}
  const action = match.action
  if (action === 'previous' || action === 'scene-picker' || action === 'replay') return true
  if (action !== 'next') return undefined
  const confirmationSteps = new Set(teacherEvents.flatMap((event) => (
    event.match?.action === 'next' && event.match?.phase === 'confirmation-required'
      ? [event.afterStepId]
      : []
  )))
  if (confirmationSteps.size === 0) return false
  return !confirmationSteps.has(expected.afterStepId)
}

function hasExactTeacherEscapeTrace(
  test: BehaviorTest,
  hostEvidence: readonly HostEvidenceRecord[],
): boolean {
  const expected = (test.witnessedEvents ?? []).filter(
    (event) => event.name === 'courseware-teacher-escape-action',
  )
  const actual = hostEvidence.filter((record) => record.kind === 'teacher-escape-recorded')
  if (expected.length === 0 || actual.length !== expected.length) return false
  return expected.every((event, index) => {
    const expectedBypass = expectedTeacherBypass(event, expected)
    const record = actual[index]
    return record !== undefined &&
      record.afterStepId === event.afterStepId &&
      record.eventType === 'click' &&
      expectedBypass !== undefined && record.bypassNavigationGuards === expectedBypass &&
      valueMatches(event.match ?? {}, record)
  })
}

function valueMatches(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) return JSON.stringify(expected) === JSON.stringify(actual)
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) return false
    return Object.entries(expected).every(
      ([key, value]) => key in actual && valueMatches(value, (actual as Record<string, unknown>)[key]),
    )
  }
  return Object.is(expected, actual)
}

function computeCapacity(spec: BehaviorSpecV2): GateResult {
  const responseSeconds = spec.responseCapacity.items.reduce(
    (total, item) => total +
      item.baselineCount * item.baselineSecondsEach +
      item.retryCount * item.retrySecondsEach +
      item.discussionCount * item.discussionSecondsEach,
    0,
  )
  const plannedSeconds = spec.responseCapacity.nonResponseSeconds + responseSeconds
  return {
    status: plannedSeconds <= spec.responseCapacity.durationSeconds ? 'passed' : 'failed',
    testIds: [],
  }
}

export function computeBehaviorGates(
  spec: BehaviorSpecV2,
  testResults: readonly Pick<TestResult, 'id' | 'status'>[],
): Record<Gate, GateResult> {
  const passed = new Set(testResults.filter((result) => result.status === 'passed').map((result) => result.id))
  const gates = {} as Record<Gate, GateResult>
  for (const gate of BROWSER_GATES) {
    const required = [...spec.gateRequirements[gate]]
    gates[gate] = {
      status: required.length > 0 && required.every((testId) => passed.has(testId))
        ? 'passed'
        : 'failed',
      testIds: required,
    }
  }
  gates.responseCapacity = computeCapacity(spec)
  return gates
}

function validateSpecWithAuthority(specPath: string, caseRoot: string): void {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const validator = path.resolve(
    scriptDirectory,
    '..',
    '.agents',
    'skills',
    'build-project-v8-courseware',
    'scripts',
    'validate_behavior_spec.py',
  )
  if (!existsSync(validator)) {
    throw new ConfigurationError(`找不到 Behavior Spec 权威校验器：${validator}`)
  }
  const python = process.platform === 'win32' ? 'python' : 'python3'
  const validatorArgs = [validator, specPath]
  if (existsSync(path.join(caseRoot, '01-courseware-contract.md'))) {
    const editorRoot = path.resolve(scriptDirectory, '..')
    validatorArgs.push('--case-dir', caseRoot)
    const capabilityIndex = path.join(editorRoot, 'artifacts', 'ai-capabilities', 'index.json')
    if (existsSync(capabilityIndex)) validatorArgs.push('--capability-index', capabilityIndex)
  }
  validatorArgs.push('--json')
  const result = spawnSync(python, validatorArgs, {
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    },
    windowsHide: true,
  })
  if (result.error) {
    throw new ConfigurationError(`无法执行 Behavior Spec 校验器：${result.error.message}`)
  }
  let report: { status?: unknown, errors?: unknown }
  try {
    report = JSON.parse(result.stdout) as { status?: unknown, errors?: unknown }
  } catch {
    throw new ConfigurationError(
      `Behavior Spec 校验器没有返回 JSON：${String(result.stderr || result.stdout).trim()}`,
    )
  }
  if (result.status !== 0 || report.status !== 'passed') {
    const errors = Array.isArray(report.errors) ? report.errors.join('；') : String(result.stderr).trim()
    throw new ConfigurationError(`Behavior Spec 校验失败：${errors || '未知错误'}`)
  }
}

async function inferTarget(caseRoot: string): Promise<string> {
  const manifestPath = path.join(caseRoot, ...DEFAULT_MANIFEST.split('/'))
  let manifest: unknown
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    throw new ConfigurationError(
      `未提供 --target，且无法读取 ${DEFAULT_MANIFEST}：${messageOf(error)}`,
    )
  }
  const artifacts = typeof manifest === 'object' && manifest !== null &&
    Array.isArray((manifest as { artifacts?: unknown }).artifacts)
    ? (manifest as { artifacts: unknown[] }).artifacts
    : []
  const htmlPaths = artifacts.flatMap((artifact) => {
    if (typeof artifact !== 'object' || artifact === null) return []
    const value = artifact as { kind?: unknown, path?: unknown }
    return value.kind === 'html' && typeof value.path === 'string' ? [value.path] : []
  })
  if (htmlPaths.length !== 1) {
    throw new ConfigurationError(
      `未提供 --target，${DEFAULT_MANIFEST} 必须恰好声明一个 kind=html artifact`,
    )
  }
  return htmlPaths[0]!
}

function mimeType(filename: string): string {
  const extension = path.extname(filename).toLowerCase()
  return ({
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
  } as Record<string, string>)[extension] ?? 'application/octet-stream'
}

async function startCaseServer(caseRoot: string): Promise<{
  origin: string
  close(): Promise<void>
}> {
  const server: Server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const portable = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      let filename = path.resolve(caseRoot, ...portable.split('/'))
      if (!isWithin(caseRoot, filename)) {
        response.writeHead(403).end('Forbidden')
        return
      }
      const metadata = await stat(filename)
      if (metadata.isDirectory()) filename = path.join(filename, 'index.html')
      const realCaseRoot = await realpath(caseRoot)
      const realFilename = await realpath(filename)
      if (!isWithin(realCaseRoot, realFilename)) {
        response.writeHead(403).end('Forbidden')
        return
      }
      const bytes = await readFile(realFilename)
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': bytes.byteLength,
        'Content-Type': mimeType(realFilename),
      })
      response.end(bytes)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('无法分配本地行为验证端口')
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

async function launchBrowser(): Promise<Browser> {
  const args = [
    '--disable-background-networking',
    '--disable-dns-prefetch',
    '--disable-quic',
    '--disable-features=WebTransport',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
    '--proxy-server=http://127.0.0.1:9',
    '--proxy-bypass-list=127.0.0.1;localhost',
  ]
  try {
    return await chromium.launch({ headless: true, args })
  } catch (bundledError) {
    if (process.platform !== 'win32') throw bundledError
    try {
      return await chromium.launch({ channel: 'msedge', headless: true, args })
    } catch (edgeError) {
      throw new Error(
        `无法启动 Playwright Chromium（bundled: ${messageOf(bundledError)}；Edge: ${messageOf(edgeError)}）`,
      )
    }
  }
}

async function performStep(page: Page, step: BehaviorStep, defaultTimeout: number): Promise<void> {
  const timeout = step.timeoutMs ?? defaultTimeout
  if (step.action === 'reload') {
    await page.reload({ waitUntil: 'domcontentloaded', timeout })
    return
  }
  const locator = page.locator(step.selector!)
  if (step.action === 'click') await locator.click({ timeout })
  if (step.action === 'fill') await locator.fill(step.value!, { timeout })
  if (step.action === 'press') await locator.press(step.key!, { timeout })
  if (step.action === 'select-option') await locator.selectOption(step.value!, { timeout })
  if (step.action === 'check') await locator.check({ timeout })
  if (step.action === 'drag') {
    await locator.dragTo(page.locator(step.targetSelector!), { timeout })
  }
  if (step.action === 'wait-visible') await locator.waitFor({ state: 'visible', timeout })
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeout: number,
  failure: string,
): Promise<void> {
  const deadline = Date.now() + timeout
  let lastError: unknown
  while (Date.now() <= deadline) {
    try {
      if (await predicate()) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(lastError ? `${failure}：${messageOf(lastError)}` : failure)
}

async function locatorValue(locator: Locator): Promise<string> {
  return locator.inputValue()
}

async function performAssertion(
  page: Page,
  assertion: BehaviorAssertion,
  defaultTimeout: number,
): Promise<void> {
  const timeout = assertion.timeoutMs ?? defaultTimeout
  if (assertion.type === 'url') {
    const expected = String(assertion.expected)
    await waitUntil(
      async () => {
        const actual = page.url()
        if (assertion.match === 'contains') return actual.includes(expected)
        if (expected.startsWith('/')) return new URL(actual).pathname === expected
        return actual === expected
      },
      timeout,
      `URL 不匹配 ${expected}`,
    )
    return
  }
  const locator = page.locator(assertion.selector!)
  if (assertion.type === 'visible') {
    await locator.waitFor({ state: 'visible', timeout })
    return
  }
  if (assertion.type === 'hidden') {
    await locator.waitFor({ state: 'hidden', timeout })
    return
  }
  if (assertion.type === 'text') {
    await waitUntil(async () => {
      const actual = await locator.textContent()
      const expected = String(assertion.expected)
      return assertion.match === 'contains' ? (actual ?? '').includes(expected) : actual === expected
    }, timeout, `文本断言不匹配：${String(assertion.expected)}`)
    return
  }
  if (assertion.type === 'value') {
    await waitUntil(
      async () => await locatorValue(locator) === String(assertion.expected),
      timeout,
      `值断言不匹配：${String(assertion.expected)}`,
    )
    return
  }
  if (assertion.type === 'attribute') {
    await waitUntil(
      async () => await locator.getAttribute(assertion.name!) === assertion.expected,
      timeout,
      `属性 ${assertion.name} 断言不匹配`,
    )
    return
  }
  if (assertion.type === 'count') {
    await waitUntil(
      async () => await locator.count() === assertion.expected,
      timeout,
      `元素数量不等于 ${String(assertion.expected)}`,
    )
    return
  }
  if (assertion.type === 'enabled') {
    const expected = assertion.expected !== false
    await waitUntil(
      async () => await locator.isEnabled() === expected,
      timeout,
      `enabled 状态不等于 ${String(expected)}`,
    )
  }
}

function failedTestResult(test: BehaviorTest, error: unknown): TestResult {
  const message = messageOf(error)
  return {
    id: test.id,
    gate: test.gate,
    status: 'failed',
    steps: test.steps.map((step, index) => ({
      id: step.id,
      status: index === 0 ? 'failed' : 'not-run',
      ...(index === 0 ? { error: message } : {}),
    })),
    assertions: [...(test.preAssertions ?? []), ...test.assertions].map((assertion) => ({
      id: assertion.id,
      status: 'not-run',
    })),
    witnessedEvents: [],
    hostEvidence: [],
    runtimeErrors: [message],
    error: message,
  }
}

async function runTest(
  browser: Browser,
  targetUrl: string,
  test: BehaviorTest,
  assessments: readonly AssessmentSpec[],
  screenshotPath?: string,
): Promise<TestResult> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block',
  })
  const expectedEvents = test.witnessedEvents ?? []
  const eventNames = [...new Set(expectedEvents.map((event) => event.name))]
  const witnessedEvents: WitnessedEvent[] = []
  const hostEvidence: HostEvidenceRecord[] = []
  const runtimeErrors: string[] = []
  const allowedOrigin = new URL(targetUrl).origin
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== allowedOrigin) {
      runtimeErrors.push(`external network request blocked: ${url.toString()}`)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  await context.routeWebSocket(/.*/, (route) => {
    const url = new URL(route.url())
    if (url.origin !== allowedOrigin) {
      runtimeErrors.push(`external WebSocket blocked: ${url.toString()}`)
      return
    }
    route.connectToServer()
  })
  const page = await context.newPage()
  let currentStepId: string | null = null
  const eventConsolePrefix = `${EVENT_CONSOLE_PREFIX}${randomBytes(16).toString('hex')}:`
  page.on('console', (message) => {
    const text = message.text()
    if (text.startsWith(HOST_EVIDENCE_CONSOLE_PREFIX)) {
      try {
        const value = JSON.parse(text.slice(HOST_EVIDENCE_CONSOLE_PREFIX.length)) as HostEvidenceRecord
        hostEvidence.push({
          ...value,
          afterStepId: value.kind === 'session-start' ? null : currentStepId,
        })
      } catch {
        runtimeErrors.push('host evidence record is not valid JSON')
      }
      return
    }
    if (!text.startsWith(eventConsolePrefix)) {
      if (message.type() === 'error') runtimeErrors.push(`console.error: ${messageOf(text)}`)
      return
    }
    try {
      const value = JSON.parse(text.slice(eventConsolePrefix.length)) as WitnessedEvent
      if (eventNames.includes(value.name) && typeof value.detail === 'object' && value.detail !== null) {
        witnessedEvents.push({ ...value, afterStepId: currentStepId })
      }
    } catch {
      // Ignore page console messages that merely share the prefix but are not valid witness records.
    }
  })
  page.on('pageerror', (error) => {
    const stack = error.stack?.split(/\r?\n/).slice(0, 4).join(' | ')
    runtimeErrors.push(`pageerror: ${messageOf(stack || error)}`)
  })
  // Use a self-contained JavaScript string. Passing a TypeScript callback here
  // is unsafe under tsx/esbuild keepNames: Function#toString can retain a
  // reference to its module-scoped __name helper, which does not exist in the
  // browser's isolated init-script world.
  await page.addInitScript({ content: `(() => {
    const names = ${JSON.stringify(eventNames)};
    const prefix = ${JSON.stringify(eventConsolePrefix)};
    const seen = new WeakSet();
    const emit = console.info.bind(console);
    const serializableDetail = (value) => {
      if (value === undefined) return {}
      try {
        const clone = JSON.parse(JSON.stringify(structuredClone(value)))
        if (typeof clone === 'object' && clone !== null && !Array.isArray(clone)) {
          return clone
        }
        return { value: clone }
      } catch {
        return { serializationError: 'CustomEvent detail is not JSON-serializable' }
      }
    };
    const record = (name, event) => {
      if (seen.has(event)) return
      seen.add(event)
      const detail = event instanceof CustomEvent ? event.detail : undefined
      emit(prefix + JSON.stringify({ name, detail: serializableDetail(detail) }))
    };
    for (const name of names) {
      window.addEventListener(name, (event) => record(name, event), true)
      document.addEventListener(name, (event) => record(name, event), true)
    }
  })();` })

  const timeout = test.timeoutMs ?? 10_000
  const stepResults: ItemResult[] = []
  const assertionResults: ItemResult[] = []
  let stepsPassed = true
  let executionError: string | undefined
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout })
    for (const assertion of test.preAssertions ?? []) {
      try {
        await performAssertion(page, assertion, timeout)
        assertionResults.push({ id: assertion.id, status: 'passed' })
      } catch (error) {
        stepsPassed = false
        executionError = `操作前断言 ${assertion.id}：${messageOf(error)}`
        assertionResults.push({ id: assertion.id, status: 'failed', error: messageOf(error) })
      }
    }
    for (const step of test.steps) {
      if (!stepsPassed) {
        stepResults.push({ id: step.id, status: 'not-run' })
        continue
      }
      try {
        if (step.action === 'reload') {
          // A reload creates a new trusted Player session. Discard all records
          // from the old document and keep the new session-start outside any
          // user action; subsequent steps become the causal boundary again.
          witnessedEvents.length = 0
          hostEvidence.length = 0
          currentStepId = null
        } else {
          currentStepId = step.id
        }
        await performStep(page, step, timeout)
        if (step.action === 'reload') {
          await waitUntil(
            async () => hostEvidence.some((record) => record.kind === 'session-start'),
            timeout,
            'reload completed without a new host evidence session-start',
          )
          currentStepId = step.id
        }
        stepResults.push({ id: step.id, status: 'passed' })
      } catch (error) {
        stepsPassed = false
        executionError = `步骤 ${step.id}：${messageOf(error)}`
        stepResults.push({ id: step.id, status: 'failed', error: messageOf(error) })
      }
    }
    for (const assertion of test.assertions) {
      if (!stepsPassed) {
        assertionResults.push({ id: assertion.id, status: 'not-run' })
        continue
      }
      try {
        await performAssertion(page, assertion, timeout)
        assertionResults.push({ id: assertion.id, status: 'passed' })
      } catch (error) {
        executionError ??= `断言 ${assertion.id}：${messageOf(error)}`
        assertionResults.push({ id: assertion.id, status: 'failed', error: messageOf(error) })
      }
    }
    if (stepsPassed && expectedEvents.length > 0) {
      try {
        await waitUntil(
          async () => expectedEvents.every((expected) => witnessedEvents.some(
            (actual) => actual.name === expected.name &&
              actual.afterStepId === expected.afterStepId &&
              valueMatches(expected.match ?? {}, actual.detail),
          )),
          timeout,
          '未观察到声明的公开 CustomEvent',
        )
      } catch (error) {
        executionError ??= messageOf(error)
      }
    }
    const sessionStarts = hostEvidence.filter((record) => record.kind === 'session-start')
    if (hostEvidence.length > 0) {
      const sessionId = sessionStarts[0]?.sessionId
      const validSession = sessionStarts.length === 1 && hostEvidence[0]?.kind === 'session-start' &&
        sessionStarts[0]?.sequence === 0 && sessionStarts[0]?.afterStepId === null &&
        typeof sessionId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId) &&
        hostEvidence.every((record, index) => (
          validHostEvidenceShape(record) && record.sessionId === sessionId && record.sequence === index
        ))
      if (!validSession) runtimeErrors.push('host evidence session/sequence is invalid or was spoofed')
    }
    if (test.gate === 'assessmentTolerance') {
      const responseId = test.contractRefs?.find((ref) => ref.startsWith('RESP-'))
      const assessment = assessments.find((item) => item.responseId === responseId)
      if (assessment && assessment.mode !== 'human') {
        const actionStepIds = test.steps
          .filter((step) => step.action !== 'wait-visible' && step.action !== 'reload')
          .map((step) => step.id)
        const expectedInput = test.input
        const normalizedInput = typeof expectedInput === 'string'
          ? assessment.evaluatorRef === 'EVAL-normalized-short-v1'
            ? expectedInput.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und')
            : expectedInput.trim()
          : undefined
        const matchingHostRecord = hostEvidence.some((record) => (
          record.kind === 'assessment-evaluated' &&
          record.afterStepId !== null && actionStepIds.includes(record.afterStepId) &&
          record.responseId === responseId &&
          record.evaluatorId === assessment.evaluatorRef &&
          record.input === expectedInput &&
          JSON.stringify(record.acceptedValues) === JSON.stringify(assessment.acceptedValues) &&
          record.normalizedInput === normalizedInput &&
          record.status === test.expectedResult &&
          (record.scope === 'global' || (record.scope === 'scene' && record.sceneId === test.sceneId))
        ))
        if (!matchingHostRecord) {
          runtimeErrors.push(
            `missing host-owned assessment trace for ${responseId ?? 'unknown response'} after the declared action`,
          )
        }
      }
    }
    if (test.gate === 'requiredActions') {
      const actRefs = test.contractRefs?.filter((ref) => ref.startsWith('ACT-')) ?? []
      const responseRefs = test.contractRefs?.filter((ref) => ref.startsWith('RESP-')) ?? []
      const allowedStepActions: Record<string, BehaviorStep['action'][]> = {
        click: ['click'],
        select: ['click', 'select-option'],
        'text-input': ['fill'],
        'formula-input': ['fill'],
        drag: ['drag'],
        sort: ['drag'],
        'circle-text': ['click', 'drag'],
        highlight: ['click', 'drag'],
        'parameter-change': ['fill', 'select-option', 'press'],
        'teacher-command': ['click', 'press'],
      }
      const eventTypesByStepAction: Partial<Record<BehaviorStep['action'], readonly string[]>> = {
        click: ['click'],
        fill: ['input', 'change'],
        press: ['keydown', 'keyup'],
        'select-option': ['input', 'change'],
        check: ['click', 'change'],
        drag: ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'dragstart', 'drag', 'drop', 'dragend'],
      }
      const actionKind = test.actionKind ?? ''
      const actionSteps = test.steps
        .filter((step) => (allowedStepActions[actionKind] ?? []).includes(step.action))
      const actionStepIds = actionSteps.map((step) => step.id)
      const expectedResponseId = responseRefs.length === 1 ? responseRefs[0] : null
      const matchingHostRecords = hostEvidence.filter((record) => (
        record.kind === 'action-recorded' &&
        actRefs.length === 1 && record.actId === actRefs[0] &&
        record.actionKind === actionKind && record.responseId === expectedResponseId &&
        record.afterStepId !== null && actionStepIds.includes(record.afterStepId) &&
        (eventTypesByStepAction[actionSteps.find((step) => step.id === record.afterStepId)?.action ?? 'reload'] ?? [])
          .includes(record.eventType ?? '') &&
        (record.scope === 'global' || (record.scope === 'scene' && record.sceneId === test.sceneId))
      ))
      if (actionStepIds.length !== 1 || matchingHostRecords.length !== 1) {
        runtimeErrors.push(
          `missing unique host-owned action trace for ${actRefs[0] ?? 'unknown action'} after the declared action`,
        )
      }
    }
    if (test.gate === 'teacherControl' || test.gate === 'teacherEscape') {
      if (!hasExactTeacherEscapeTrace(test, hostEvidence)) {
        runtimeErrors.push(
          'missing exact host-owned teacher escape trace bound to source scene/state/action/phase/step',
        )
      }
    }
    const passed = stepsPassed &&
      assertionResults.every((result) => result.status === 'passed') &&
      expectedEvents.every((expected) => witnessedEvents.some(
        (actual) => actual.name === expected.name &&
          actual.afterStepId === expected.afterStepId &&
          valueMatches(expected.match ?? {}, actual.detail),
      )) && runtimeErrors.length === 0
    return {
      id: test.id,
      gate: test.gate,
      status: passed ? 'passed' : 'failed',
      steps: stepResults,
      assertions: assertionResults,
      witnessedEvents,
      hostEvidence,
      runtimeErrors,
      ...(executionError ? { error: executionError } : {}),
    }
  } catch (error) {
    return failedTestResult(test, error)
  } finally {
    if (screenshotPath) {
      await mkdir(path.dirname(screenshotPath), { recursive: true }).catch(() => undefined)
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined)
    }
    await context.close().catch(() => undefined)
  }
}

function safeTestFilename(testId: string): string {
  return `${testId.replace(/[^A-Za-z0-9._-]/g, '_')}.png`
}

async function writeReport(filename: string, report: BehaviorReportV2): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

export async function runCoursewareBehaviorCli(
  argv: readonly string[],
  io: RunnerIo = defaultIo,
): Promise<0 | 1 | 2> {
  let options: BehaviorRunnerOptions
  try {
    options = parseBehaviorRunnerArgs(argv)
  } catch (error) {
    const message = messageOf(error)
    if (message === usage.replace(/\s+/g, ' ').trim()) io.stdout(`${usage}\n`)
    else io.stderr(`${error instanceof Error ? error.message : message}\n`)
    return 2
  }

  try {
    const caseRoot = path.resolve(options.caseDir)
    const caseMetadata = await stat(caseRoot).catch(() => undefined)
    if (!caseMetadata?.isDirectory()) throw new ConfigurationError(`课例目录不存在：${caseRoot}`)
    const specPath = resolveInside(caseRoot, options.spec, '--spec')
    const targetValue = options.target ?? await inferTarget(caseRoot)
    const targetPath = resolveInside(caseRoot, targetValue, '--target')
    const reportPath = resolveInside(caseRoot, options.report, '--report')
    let expectedReport: unknown
    if (options.verifyReport) {
      try {
        expectedReport = JSON.parse(await readFile(reportPath, 'utf8')) as unknown
      } catch (error) {
        throw new ConfigurationError(`--verify-report 无法读取已有报告：${messageOf(error)}`)
      }
    }
    const screenshotDirectory = options.screenshotDir
      ? resolveInside(caseRoot, options.screenshotDir, '--screenshot-dir')
      : undefined
    requireExtension(specPath, ['.json'], '--spec')
    requireExtension(reportPath, ['.json'], '--report')
    requireExtension(targetPath, ['.html', '.htm'], '--target')
    const identities = new Map<string, string>()
    for (const [label, filename] of [
      ['--spec', specPath], ['--target', targetPath], ['--report', reportPath],
    ] as const) {
      const identity = pathIdentity(filename)
      const other = identities.get(identity)
      if (other) throw new ConfigurationError(`${label} 不得别名或覆盖 ${other}`)
      identities.set(identity, label)
    }
    const [specBytes, targetBytes] = await Promise.all([readFile(specPath), readFile(targetPath)])
    validateSpecWithAuthority(specPath, caseRoot)
    let spec: BehaviorSpecV2
    try {
      spec = JSON.parse(specBytes.toString('utf8')) as BehaviorSpecV2
    } catch (error) {
      throw new ConfigurationError(`Behavior Spec JSON 不可读：${messageOf(error)}`)
    }
    const specHash = sha256(specBytes)
    const initialTargetHash = sha256(targetBytes)
    const targetRelative = portableRelative(caseRoot, targetPath)
    const targetUrlPath = targetRelative.split('/').map(encodeURIComponent).join('/')
    const results: TestResult[] = []
    let executionFailure: string | undefined
    let browser: Browser | undefined
    let server: Awaited<ReturnType<typeof startCaseServer>> | undefined
    try {
      server = await startCaseServer(caseRoot)
      browser = await launchBrowser()
      for (const test of spec.tests) {
        const screenshotPath = screenshotDirectory
          ? path.join(screenshotDirectory, safeTestFilename(test.id))
          : undefined
        const result = await runTest(
          browser,
          `${server.origin}/${targetUrlPath}`,
          test,
          spec.assessments,
          screenshotPath,
        )
        if (screenshotPath && existsSync(screenshotPath)) {
          result.screenshot = {
            path: portableRelative(caseRoot, screenshotPath),
            sha256: sha256(await readFile(screenshotPath)),
            width: 1280,
            height: 720,
          }
        }
        results.push(result)
      }
    } catch (error) {
      executionFailure = messageOf(error)
      for (const test of spec.tests.slice(results.length)) {
        results.push(failedTestResult(test, error))
      }
    } finally {
      await browser?.close().catch(() => undefined)
      await server?.close().catch(() => undefined)
    }

    const finalTargetBytes = await readFile(targetPath)
    const finalTargetHash = sha256(finalTargetBytes)
    if (finalTargetHash !== initialTargetHash) {
      executionFailure = '被测 HTML 在行为验证期间发生字节变化，当前结果不可绑定到单一交付物'
      for (const result of results) {
        result.status = 'failed'
        result.error = executionFailure
      }
    }
    const currentSpecHash = sha256(await readFile(specPath))
    if (currentSpecHash !== specHash) {
      executionFailure = 'Behavior Spec 在执行期间发生字节变化，当前结果不可绑定'
      for (const result of results) {
        result.status = 'failed'
        result.error = executionFailure
      }
    }
    const gates = computeBehaviorGates(spec, results)
    const passed = results.filter((result) => result.status === 'passed').length
    const runnerSha256 = sha256(await readFile(fileURLToPath(import.meta.url)))
    const reportErrors = [
      ...(executionFailure ? [executionFailure] : []),
      ...results.flatMap((result) => result.runtimeErrors),
    ].filter((item, index, values) => values.indexOf(item) === index)
    const report: BehaviorReportV2 = {
      schemaVersion: 2,
      caseId: spec.caseId,
      specSha256: specHash,
      runnerSha256,
      coursewareContractSha256: spec.coursewareContractSha256,
      presentationScriptSha256: spec.presentationScriptSha256,
      developmentPlanSha256: spec.developmentPlanSha256,
      target: { path: targetRelative, sha256: finalTargetHash },
      tests: results,
      gates,
      summary: { passed, failed: results.length - passed },
      errors: reportErrors,
    }
    let replayMismatch = false
    if (options.verifyReport) {
      replayMismatch = canonicalJson(stableReportProjection(expectedReport)) !==
        canonicalJson(stableReportProjection(report))
      if (replayMismatch) report.errors.push('已有 Behavior Report 与可信重放结果不一致')
    } else {
      await mkdir(path.dirname(reportPath), { recursive: true })
      resolveInside(caseRoot, portableRelative(caseRoot, reportPath), '--report')
      await writeReport(reportPath, report)
    }
    const allPassed = !executionFailure && !replayMismatch && report.errors.length === 0 &&
      GATES.every((gate) => gates[gate].status === 'passed')
    io.stdout(`${JSON.stringify({
      status: allPassed ? 'passed' : 'failed',
      report: portableRelative(caseRoot, reportPath),
      summary: report.summary,
      gates,
      ...(!allPassed ? {
        failures: report.tests
          .filter((test) => test.status === 'failed')
          .map((test) => ({
            id: test.id,
            ...(test.error ? { error: test.error } : {}),
            runtimeErrors: test.runtimeErrors,
          })),
      } : {}),
      ...(executionFailure ? { error: executionFailure } : {}),
      ...(replayMismatch ? { error: '已有 Behavior Report 与可信重放结果不一致' } : {}),
    }, null, 2)}\n`)
    return allPassed ? 0 : 1
  } catch (error) {
    io.stderr(`行为执行器配置/校验错误：${messageOf(error)}\n`)
    return 2
  }
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
  void runCoursewareBehaviorCli(process.argv.slice(2))
    .then((exitCode) => { process.exitCode = exitCode })
    .catch((error: unknown) => {
      process.stderr.write(`行为执行器异常：${messageOf(error)}\n`)
      process.exitCode = 2
    })
}
