import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path, { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { _electron as electron } from 'playwright'
import sharp from 'sharp'

export const EDITOR_BASE_COMMIT = '3e41ec058627d38c4b9f5439b454cc72331e1485'

export type EditorEntryMode = 'transition' | 'v8-only'

export interface RepositorySnapshot {
  root: string
  baseCommit: string
  basePaths: Set<string>
  currentPaths: Set<string>
  overrides: Map<string, Buffer>
}

export interface VerificationOptions {
  entryMode: EditorEntryMode
  visual?: boolean
  outputDirectory?: string
}

interface RectSnapshot {
  x: number
  y: number
  width: number
  height: number
  right: number
  bottom: number
}

interface GeometryCapture {
  expectedViewport: { width: number; height: number }
  actualViewport: { width: number; height: number; devicePixelRatio: number }
  document: {
    clientWidth: number
    clientHeight: number
    scrollWidth: number
    scrollHeight: number
    bodyScrollWidth: number
    bodyScrollHeight: number
  }
  rectangles: Record<string, RectSnapshot>
}

interface GoldenCapture {
  viewport: { width: number; height: number }
  bytes: number
  sha256: string
  screenshotFile: string
  geometry: GeometryCapture
}

interface GoldenContract {
  diagnostics: {
    pageErrors: string[]
    consoleErrors: string[]
    externalRequests: string[]
  }
  captures: GoldenCapture[]
}

export class PreservationViolation extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'PreservationViolation'
    this.code = code
  }
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const protectedExactPaths = [
  'src/renderer/App.tsx',
  'src/renderer/ui/TopToolbar.tsx',
  'src/renderer/ui/ScenePanel.tsx',
  'src/renderer/ui/SceneThumbnail.tsx',
  'src/renderer/ui/Workspace.tsx',
  'src/renderer/ui/SceneStateStrip.tsx',
  'src/renderer/ui/RightSidebar.tsx',
  'src/renderer/ui/ElementsTab.tsx',
  'src/renderer/ui/NodesTab.tsx',
  'src/renderer/ui/PropertiesTab.tsx',
  'src/renderer/ui/ComponentsTab.tsx',
  'src/renderer/ui/AutomationTab.tsx',
  'src/renderer/ui/DeveloperTab.tsx',
  'src/renderer/ui/PresenterSettingsEditor.tsx',
  'src/renderer/authoring/stageViewportTransform.ts',
  'src/renderer/styles/globals.css',
] as const
const requiredReachablePaths = [
  'src/renderer/App.tsx',
  'src/renderer/ui/TopToolbar.tsx',
  'src/renderer/ui/ScenePanel.tsx',
  'src/renderer/ui/Workspace.tsx',
  'src/renderer/ui/SceneStateStrip.tsx',
  'src/renderer/ui/RightSidebar.tsx',
] as const
const forbiddenV9EntryPaths = [
  'src/renderer/course/CourseStudioApp.tsx',
  'src/renderer/course/CourseSurfaceCanvas.tsx',
] as const
const requiredDomTokens: Array<{ path: string; tokens: string[] }> = [
  {
    path: 'src/renderer/App.tsx',
    tokens: ['className="app-shell"', 'app-main', 'editor-center', 'status-bar'],
  },
  { path: 'src/renderer/ui/TopToolbar.tsx', tokens: ['data-testid="top-toolbar"'] },
  { path: 'src/renderer/ui/ScenePanel.tsx', tokens: ['scene-panel'] },
  {
    path: 'src/renderer/ui/Workspace.tsx',
    tokens: ['canvas-viewport', 'data-testid="canvas-stage"'],
  },
  { path: 'src/renderer/ui/SceneStateStrip.tsx', tokens: ['scene-state-strip'] },
  { path: 'src/renderer/ui/RightSidebar.tsx', tokens: ['right-sidebar'] },
]
const expectedBehaviorPaths = [
  'tests/unit/editorStore.test.ts',
  'tests/unit/globalEditorStore.test.ts',
  'tests/unit/globalLayerUi.test.tsx',
  'tests/unit/sceneStateUi.test.tsx',
  'tests/unit/stageViewportTransform.test.ts',
  'tests/unit/editorFormattingUi.test.tsx',
  'tests/unit/simpleEditorMode.test.tsx',
  'tests/unit/developerMode.test.tsx',
  'tests/unit/mediaTab.test.tsx',
  'tests/unit/componentPropertiesEditor.test.tsx',
  'tests/unit/presenterSettingsUi.test.tsx',
  'tests/unit/interactionEditor.test.tsx',
] as const
const goldenViewports = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const

function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new PreservationViolation(code, message)
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function gitLines(root: string, args: string[]): string[] {
  const output = execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  return output.split(/\r?\n/u).map(normalizePath).filter(Boolean)
}

export function createRepositorySnapshot(
  root = repositoryRoot,
  baseCommit = EDITOR_BASE_COMMIT,
): RepositorySnapshot {
  execFileSync('git', ['merge-base', '--is-ancestor', baseCommit, 'HEAD'], { cwd: root })
  return {
    root,
    baseCommit,
    basePaths: new Set(gitLines(root, ['ls-tree', '-r', '--name-only', baseCommit])),
    currentPaths: new Set(gitLines(root, [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
    ])),
    overrides: new Map(),
  }
}

export function cloneRepositorySnapshot(snapshot: RepositorySnapshot): RepositorySnapshot {
  return {
    root: snapshot.root,
    baseCommit: snapshot.baseCommit,
    basePaths: new Set(snapshot.basePaths),
    currentPaths: new Set(snapshot.currentPaths),
    overrides: new Map(snapshot.overrides),
  }
}

export function setSnapshotText(
  snapshot: RepositorySnapshot,
  filePath: string,
  source: string,
): void {
  const normalized = normalizePath(filePath)
  snapshot.currentPaths.add(normalized)
  snapshot.overrides.set(normalized, Buffer.from(source, 'utf8'))
}

export function deleteSnapshotPath(snapshot: RepositorySnapshot, filePath: string): void {
  const normalized = normalizePath(filePath)
  snapshot.currentPaths.delete(normalized)
  snapshot.overrides.delete(normalized)
}

function readSnapshotBuffer(snapshot: RepositorySnapshot, filePath: string): Buffer {
  const normalized = normalizePath(filePath)
  invariant(
    snapshot.currentPaths.has(normalized),
    'FILE_MISSING',
    `Required file does not exist: ${normalized}`,
  )
  const override = snapshot.overrides.get(normalized)
  if (override) return override
  return readFileSync(resolve(snapshot.root, normalized))
}

function readSnapshotText(snapshot: RepositorySnapshot, filePath: string): string {
  return readSnapshotBuffer(snapshot, filePath).toString('utf8')
}

function protectedCorePaths(snapshot: RepositorySnapshot): string[] {
  const phaserPaths = [...snapshot.basePaths]
    .filter((filePath) => filePath.startsWith('src/renderer/phaser/'))
    .sort()
  invariant(phaserPaths.length > 0, 'BASELINE_INVALID', 'BASE3E has no Phaser editor files')
  return [...protectedExactPaths, ...phaserPaths]
}

function verifyCorePaths(snapshot: RepositorySnapshot): void {
  for (const filePath of protectedCorePaths(snapshot)) {
    invariant(
      snapshot.basePaths.has(filePath),
      'BASELINE_INVALID',
      `Protected path is absent from BASE3E: ${filePath}`,
    )
    invariant(
      snapshot.currentPaths.has(filePath),
      'CORE_FILE_MISSING',
      `Protected BASE3E path was deleted or renamed: ${filePath}`,
    )
  }
}

function verifyForbiddenFrontendStructures(snapshot: RepositorySnapshot): void {
  for (const filePath of snapshot.currentPaths) {
    if (filePath.startsWith('src/renderer/converged/')) {
      throw new PreservationViolation('FORBIDDEN_FRONTEND_PATH', filePath)
    }
    if (filePath.startsWith('src/renderer/studio/')) {
      throw new PreservationViolation('FORBIDDEN_FRONTEND_PATH', filePath)
    }
    if (!filePath.startsWith('src/renderer/') || !/\.[cm]?[jt]sx?$/u.test(filePath)) continue
    const baseName = path.posix.basename(filePath, path.posix.extname(filePath))
    const isNewPath = !snapshot.basePaths.has(filePath)
    if (isNewPath && /Editor(?:App|Shell)$/u.test(baseName)) {
      throw new PreservationViolation('FORBIDDEN_FRONTEND_PATH', filePath)
    }
    if (isNewPath && /Slide.*Workspace|Workspace.*Slide/u.test(baseName)) {
      throw new PreservationViolation('FORBIDDEN_SLIDE_WORKSPACE', filePath)
    }
    const source = readSnapshotText(snapshot, filePath)
    if (/\b(?:ConvergedEditorApp|V9EditorShell)\b/u.test(source)) {
      throw new PreservationViolation(
        'FORBIDDEN_FRONTEND_IDENTIFIER',
        `${filePath} declares or references a forbidden replacement shell`,
      )
    }
    const replacementDeclaration = source.match(
      /\b(?:function|class|const|let|var)\s+([A-Z][A-Za-z0-9_$]*Editor(?:App|Shell))\b/u,
    )
    if (replacementDeclaration) {
      throw new PreservationViolation(
        'FORBIDDEN_FRONTEND_IDENTIFIER',
        `${filePath} declares ${replacementDeclaration[1]}`,
      )
    }
    const slideWorkspaceDeclaration = source.match(
      /\b(?:function|class|const|let|var)\s+([A-Z][A-Za-z0-9_$]*Slide[A-Za-z0-9_$]*Workspace)\b/u,
    )
    if (slideWorkspaceDeclaration) {
      throw new PreservationViolation(
        'FORBIDDEN_SLIDE_WORKSPACE',
        `${filePath} declares ${slideWorkspaceDeclaration[1]}`,
      )
    }
  }
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const declarations = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gu
  const dynamicImports = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu
  for (const pattern of [declarations, dynamicImports]) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]!)
  }
  return [...new Set(specifiers)]
}

function resolveRelativeImport(
  snapshot: RepositorySnapshot,
  importer: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith('.')) return null
  const base = normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier)))
  const candidates = extname(base)
    ? [base]
    : [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
        `${base}/index.js`,
        `${base}/index.jsx`,
      ]
  return candidates.find((candidate) => snapshot.currentPaths.has(candidate)) ?? null
}

function importGraph(snapshot: RepositorySnapshot, entryPath: string): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  const queue = [entryPath]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (graph.has(current)) continue
    invariant(snapshot.currentPaths.has(current), 'ENTRY_FILE_MISSING', current)
    const imports = importSpecifiers(readSnapshotText(snapshot, current))
      .map((specifier) => resolveRelativeImport(snapshot, current, specifier))
      .filter((candidate): candidate is string => Boolean(candidate))
    graph.set(current, imports)
    for (const imported of imports) {
      if (!graph.has(imported) && /\.[cm]?[jt]sx?$/u.test(imported)) queue.push(imported)
    }
  }
  return graph
}

function verifyEntryGraph(snapshot: RepositorySnapshot, entryMode: EditorEntryMode): void {
  const entryPath = 'src/renderer/ProductApp.tsx'
  const graph = importGraph(snapshot, entryPath)
  for (const requiredPath of requiredReachablePaths) {
    invariant(
      graph.has(requiredPath),
      'ORIGINAL_APP_UNREACHABLE',
      `${requiredPath} is not reachable from ${entryPath}`,
    )
  }
  if (entryMode !== 'v8-only') return
  const forbiddenReachable = [...graph.keys()].filter((filePath) => (
    forbiddenV9EntryPaths.includes(filePath as typeof forbiddenV9EntryPaths[number]) ||
    /(?:^|\/)V9EditorShell\.[cm]?[jt]sx?$/u.test(filePath)
  ))
  invariant(
    forbiddenReachable.length === 0,
    'FORBIDDEN_ENTRY_REACHABLE',
    `v8-only entry reaches ${forbiddenReachable.join(', ')}`,
  )
  const directImports = importSpecifiers(readSnapshotText(snapshot, entryPath))
    .map((specifier) => resolveRelativeImport(snapshot, entryPath, specifier))
    .filter((candidate): candidate is string => Boolean(candidate))
  const forbiddenDirect = directImports.filter((filePath) => (
    forbiddenV9EntryPaths.includes(filePath as typeof forbiddenV9EntryPaths[number]) ||
    /V9EditorShell/u.test(filePath)
  ))
  invariant(
    forbiddenDirect.length === 0,
    'FORBIDDEN_ENTRY_IMPORT',
    `ProductApp imports ${forbiddenDirect.join(', ')}`,
  )
}

function verifyDomContracts(snapshot: RepositorySnapshot): void {
  for (const contract of requiredDomTokens) {
    const source = readSnapshotText(snapshot, contract.path)
    for (const token of contract.tokens) {
      invariant(
        source.includes(token),
        'DOM_CONTRACT_MISSING',
        `${contract.path} no longer contains ${token}`,
      )
    }
  }
}

function stripCommentsAndStrings(source: string): string {
  let output = ''
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code'
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    const next = source[index + 1]
    if (state === 'code') {
      if (character === '/' && next === '/') {
        state = 'line'
        output += '  '
        index += 1
      } else if (character === '/' && next === '*') {
        state = 'block'
        output += '  '
        index += 1
      } else if (character === "'") {
        state = 'single'
        output += ' '
      } else if (character === '"') {
        state = 'double'
        output += ' '
      } else if (character === '`') {
        state = 'template'
        output += ' '
      } else {
        output += character
      }
      continue
    }
    if (state === 'line') {
      if (character === '\n') {
        state = 'code'
        output += '\n'
      } else output += ' '
      continue
    }
    if (state === 'block') {
      if (character === '*' && next === '/') {
        state = 'code'
        output += '  '
        index += 1
      } else output += character === '\n' ? '\n' : ' '
      continue
    }
    if (escaped) {
      escaped = false
      output += character === '\n' ? '\n' : ' '
      continue
    }
    if (character === '\\') {
      escaped = true
      output += ' '
      continue
    }
    const closes = (
      (state === 'single' && character === "'") ||
      (state === 'double' && character === '"') ||
      (state === 'template' && character === '`')
    )
    if (closes) state = 'code'
    output += character === '\n' ? '\n' : ' '
  }
  return output
}

function verifyNoDisabledTests(snapshot: RepositorySnapshot): void {
  const violations: string[] = []
  for (const filePath of [...snapshot.currentPaths].sort()) {
    const isTestPath = (
      filePath.startsWith('tests/') ||
      filePath.includes('/tests/') ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath)
    )
    if (!isTestPath || !/\.(?:[cm]?[jt]sx?)$/u.test(filePath)) continue
    const codeOnly = stripCommentsAndStrings(readSnapshotText(snapshot, filePath))
    const pattern = /\b(?:describe|it|test)\s*\.\s*(?:skip|todo|only)\b/gu
    let match: RegExpExecArray | null
    while ((match = pattern.exec(codeOnly)) !== null) {
      const line = codeOnly.slice(0, match.index).split('\n').length
      violations.push(`${filePath}:${line}:${match[0]}`)
    }
  }
  invariant(
    violations.length === 0,
    'DISABLED_TEST_FOUND',
    violations.join(', '),
  )
}

function verifyBehaviorMap(snapshot: RepositorySnapshot): void {
  const mapPath = 'tests/contracts/v8-behavior-map.json'
  const behaviorMap = JSON.parse(readSnapshotText(snapshot, mapPath)) as {
    schemaVersion: number
    baseline: {
      sourceCommit: string
      protectedSuiteCount: number
      staticDefinitionCount: number
      parameterizedDefinitionCount: number
      expandedCaseCount: number
      expectedVitestResult: { filesPassed: number; testsPassed: number }
    }
    policy: { allowedDispositions: string[] }
    suites: Array<{
      path: string
      disposition: string
      sha256: string
      staticDefinitionCount: number
      expandedCaseCount: number
      reason?: string
      replacementTests?: string[]
      definitions: Array<{
        disposition: string
        expandedCaseCount: number
        reason?: string
        replacementTests?: string[]
      }>
    }>
  }
  invariant(behaviorMap.schemaVersion === 1, 'BEHAVIOR_MAP_INVALID', 'schemaVersion must be 1')
  invariant(
    behaviorMap.baseline.sourceCommit === snapshot.baseCommit,
    'BEHAVIOR_MAP_INVALID',
    'sourceCommit does not match BASE3E',
  )
  invariant(
    JSON.stringify(behaviorMap.policy.allowedDispositions) === JSON.stringify(['keep', 'adapt', 'retire']),
    'BEHAVIOR_MAP_INVALID',
    'allowed dispositions drifted',
  )
  invariant(
    JSON.stringify(behaviorMap.suites.map((suite) => suite.path)) === JSON.stringify(expectedBehaviorPaths),
    'BEHAVIOR_MAP_UNMAPPED',
    'protected suite paths drifted',
  )

  let definitions = 0
  let parameterized = 0
  let expandedCases = 0
  for (const suite of behaviorMap.suites) {
    invariant(
      ['keep', 'adapt', 'retire'].includes(suite.disposition),
      'BEHAVIOR_MAP_INVALID',
      `${suite.path} has invalid disposition`,
    )
    const mayBeDeleted = suite.disposition === 'retire'
    invariant(
      mayBeDeleted || snapshot.currentPaths.has(suite.path),
      'BEHAVIOR_MAP_UNMAPPED',
      `${suite.path} was deleted without retirement`,
    )
    if (snapshot.currentPaths.has(suite.path)) {
      invariant(
        sha256(readSnapshotBuffer(snapshot, suite.path)) === suite.sha256,
        'BEHAVIOR_MAP_HASH_DRIFT',
        `${suite.path} changed without a coordinator map update`,
      )
    }
    const dispositions = [suite, ...suite.definitions]
    for (const item of dispositions) {
      invariant(
        ['keep', 'adapt', 'retire'].includes(item.disposition),
        'BEHAVIOR_MAP_INVALID',
        `${suite.path} contains an invalid disposition`,
      )
      if (item.disposition === 'keep') continue
      invariant(
        typeof item.reason === 'string' && item.reason.trim().length > 0,
        'BEHAVIOR_MAP_REPLACEMENT_MISSING',
        `${suite.path} ${item.disposition} needs a reason`,
      )
      invariant(
        Array.isArray(item.replacementTests) && item.replacementTests.length > 0,
        'BEHAVIOR_MAP_REPLACEMENT_MISSING',
        `${suite.path} ${item.disposition} needs replacement tests`,
      )
      for (const replacement of item.replacementTests) {
        invariant(
          snapshot.currentPaths.has(normalizePath(replacement)),
          'BEHAVIOR_MAP_REPLACEMENT_MISSING',
          `${suite.path} replacement does not exist: ${replacement}`,
        )
      }
    }
    invariant(
      suite.staticDefinitionCount === suite.definitions.length,
      'BEHAVIOR_MAP_INVALID',
      `${suite.path} definition count drifted`,
    )
    const suiteExpanded = suite.definitions.reduce(
      (sum, definition) => sum + definition.expandedCaseCount,
      0,
    )
    invariant(
      suite.expandedCaseCount === suiteExpanded,
      'BEHAVIOR_MAP_INVALID',
      `${suite.path} expanded count drifted`,
    )
    definitions += suite.staticDefinitionCount
    parameterized += suite.definitions.filter((definition) => definition.expandedCaseCount > 1).length
    expandedCases += suite.expandedCaseCount
  }
  invariant(
    behaviorMap.baseline.protectedSuiteCount === 12 && behaviorMap.suites.length === 12,
    'BEHAVIOR_MAP_INVALID',
    'protected suite total must be 12',
  )
  invariant(
    behaviorMap.baseline.staticDefinitionCount === definitions && definitions === 151,
    'BEHAVIOR_MAP_INVALID',
    'static definition total must be 151',
  )
  invariant(
    behaviorMap.baseline.parameterizedDefinitionCount === parameterized && parameterized === 7,
    'BEHAVIOR_MAP_INVALID',
    'parameterized definition total must be 7',
  )
  invariant(
    behaviorMap.baseline.expandedCaseCount === expandedCases && expandedCases === 172,
    'BEHAVIOR_MAP_INVALID',
    'expanded case total must be 172',
  )
  invariant(
    behaviorMap.baseline.expectedVitestResult.filesPassed === 12 &&
      behaviorMap.baseline.expectedVitestResult.testsPassed === 172,
    'BEHAVIOR_MAP_INVALID',
    'expected Vitest result drifted',
  )
}

export function assertGeometryCapture(capture: GeometryCapture): void {
  const { expectedViewport, actualViewport, document, rectangles } = capture
  invariant(
    actualViewport.width === expectedViewport.width &&
      actualViewport.height === expectedViewport.height,
    'VIEWPORT_MISMATCH',
    `${actualViewport.width}x${actualViewport.height} != ${expectedViewport.width}x${expectedViewport.height}`,
  )
  invariant(
    document.scrollWidth === document.clientWidth &&
      document.scrollHeight === document.clientHeight &&
      document.bodyScrollWidth === document.clientWidth &&
      document.bodyScrollHeight === document.clientHeight,
    'PAGE_OVERFLOW',
    `${expectedViewport.width}x${expectedViewport.height} has page-level overflow`,
  )
  const requiredRectangles = [
    'appShell',
    'toolbar',
    'appMain',
    'scenePanel',
    'editorCenter',
    'workspace',
    'canvasViewport',
    'canvasStage',
    'stateStrip',
    'rightSidebar',
    'statusBar',
  ]
  for (const name of requiredRectangles) {
    const rectangle = rectangles[name]
    invariant(Boolean(rectangle), 'GEOMETRY_MISSING', `${name} is missing`)
    invariant(
      rectangle!.width > 0 && rectangle!.height > 0,
      'GEOMETRY_INVALID',
      `${name} has no area`,
    )
    invariant(
      rectangle!.x >= -0.5 && rectangle!.y >= -0.5 &&
        rectangle!.right <= expectedViewport.width + 0.5 &&
        rectangle!.bottom <= expectedViewport.height + 0.5,
      'GEOMETRY_OUTSIDE_VIEWPORT',
      `${name} is outside ${expectedViewport.width}x${expectedViewport.height}`,
    )
  }
  const r = rectangles
  invariant(r.toolbar!.bottom <= r.appMain!.y + 1, 'GEOMETRY_OVERLAP', 'toolbar overlaps app main')
  invariant(r.scenePanel!.right <= r.editorCenter!.x + 1, 'GEOMETRY_OVERLAP', 'scene panel overlaps editor center')
  invariant(r.editorCenter!.right <= r.rightSidebar!.x + 1, 'GEOMETRY_OVERLAP', 'editor center overlaps right sidebar')
  invariant(r.workspace!.bottom <= r.stateStrip!.y + 1, 'GEOMETRY_OVERLAP', 'workspace overlaps state strip')
  invariant(r.appMain!.bottom <= r.statusBar!.y + 1, 'GEOMETRY_OVERLAP', 'app main overlaps status bar')
}

async function verifyGoldenContracts(snapshot: RepositorySnapshot): Promise<GoldenContract> {
  const contractPath = 'tests/contracts/v8-shell-baseline/geometry.json'
  const contract = JSON.parse(readSnapshotText(snapshot, contractPath)) as GoldenContract
  invariant(
    contract.diagnostics.pageErrors.length === 0 &&
      contract.diagnostics.consoleErrors.length === 0 &&
      contract.diagnostics.externalRequests.length === 0,
    'GOLDEN_DIAGNOSTICS_INVALID',
    'G02 diagnostics are not clean',
  )
  invariant(contract.captures.length === 3, 'GOLDEN_INVALID', 'Expected three golden captures')
  for (let index = 0; index < goldenViewports.length; index += 1) {
    const expected = goldenViewports[index]!
    const capture = contract.captures[index]!
    invariant(
      capture.viewport.width === expected.width && capture.viewport.height === expected.height,
      'GOLDEN_INVALID',
      `Unexpected viewport at index ${index}`,
    )
    assertGeometryCapture(capture.geometry)
    const imagePath = `tests/contracts/v8-shell-baseline/${capture.screenshotFile}`
    const image = readSnapshotBuffer(snapshot, imagePath)
    invariant(image.byteLength === capture.bytes, 'GOLDEN_HASH_DRIFT', `${imagePath} byte length changed`)
    invariant(sha256(image) === capture.sha256, 'GOLDEN_HASH_DRIFT', `${imagePath} hash changed`)
    const metadata = await sharp(image).metadata()
    invariant(
      metadata.width === expected.width && metadata.height === expected.height,
      'GOLDEN_DIMENSION_DRIFT',
      `${imagePath} dimensions changed`,
    )
  }
  return contract
}

export async function verifyRepositorySnapshot(
  snapshot: RepositorySnapshot,
  options: Pick<VerificationOptions, 'entryMode'>,
): Promise<void> {
  verifyCorePaths(snapshot)
  verifyForbiddenFrontendStructures(snapshot)
  verifyEntryGraph(snapshot, options.entryMode)
  verifyDomContracts(snapshot)
  verifyNoDisabledTests(snapshot)
  verifyBehaviorMap(snapshot)
  await verifyGoldenContracts(snapshot)
}

async function waitFor<T>(
  predicate: () => Promise<T | null | false>,
  label: string,
  timeoutMs = 15_000,
): Promise<T> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await predicate()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  const suffix = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new PreservationViolation('VISUAL_TIMEOUT', `${label}${suffix}`)
}

async function readLiveGeometry(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>,
  viewport: { width: number; height: number },
): Promise<GeometryCapture> {
  return page.evaluate(({ expectedWidth, expectedHeight }) => {
    const selectors = {
      appShell: '.app-shell',
      toolbar: '[data-testid="top-toolbar"]',
      appMain: '.app-main',
      scenePanel: '.scene-panel',
      editorCenter: '.editor-center',
      workspace: 'main[aria-label="课件画布"]',
      canvasViewport: '.canvas-viewport',
      canvasStage: '[data-testid="canvas-stage"]',
      stateStrip: '.scene-state-strip',
      rightSidebar: '.right-sidebar',
      statusBar: '.status-bar',
    }
    const rectangles: Record<string, RectSnapshot> = {}
    for (const [name, selector] of Object.entries(selectors)) {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) throw new Error(`Missing live element: ${name}`)
      const rect = element.getBoundingClientRect()
      rectangles[name] = {
        x: Number(rect.x.toFixed(3)),
        y: Number(rect.y.toFixed(3)),
        width: Number(rect.width.toFixed(3)),
        height: Number(rect.height.toFixed(3)),
        right: Number(rect.right.toFixed(3)),
        bottom: Number(rect.bottom.toFixed(3)),
      }
    }
    return {
      expectedViewport: { width: expectedWidth, height: expectedHeight },
      actualViewport: {
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio,
      },
      document: {
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollWidth: document.body.scrollWidth,
        bodyScrollHeight: document.body.scrollHeight,
      },
      rectangles,
    }
  }, { expectedWidth: viewport.width, expectedHeight: viewport.height })
}

function assertLiveGeometryMatchesGolden(live: GeometryCapture, golden: GeometryCapture): void {
  invariant(
    JSON.stringify(live.actualViewport) === JSON.stringify(golden.actualViewport),
    'LIVE_GEOMETRY_DRIFT',
    'actual viewport metadata drifted',
  )
  invariant(
    JSON.stringify(live.document) === JSON.stringify(golden.document),
    'LIVE_GEOMETRY_DRIFT',
    'document geometry drifted',
  )
  for (const [name, expected] of Object.entries(golden.rectangles)) {
    const actual = live.rectangles[name]
    invariant(Boolean(actual), 'LIVE_GEOMETRY_DRIFT', `${name} disappeared`)
    for (const key of ['x', 'y', 'width', 'height', 'right', 'bottom'] as const) {
      invariant(
        Math.abs(actual![key] - expected[key]) <= 0.75,
        'LIVE_GEOMETRY_DRIFT',
        `${name}.${key}: ${actual![key]} != ${expected[key]}`,
      )
    }
  }
}

async function compareMaskedGolden(
  currentPath: string,
  goldenPath: string,
  diffPath: string,
  mask: RectSnapshot,
): Promise<{ mismatchPixels: number; comparedPixels: number; mismatchRatio: number; meanAbsoluteError: number }> {
  const [current, golden] = await Promise.all([
    sharp(currentPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(goldenPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ])
  invariant(
    current.info.width === golden.info.width && current.info.height === golden.info.height,
    'LIVE_GOLDEN_DIMENSION_DRIFT',
    `${current.info.width}x${current.info.height} != ${golden.info.width}x${golden.info.height}`,
  )
  const { width, height } = current.info
  const maskLeft = Math.floor(mask.x)
  const maskTop = Math.floor(mask.y)
  const maskRight = Math.ceil(mask.right)
  const maskBottom = Math.ceil(mask.bottom)
  const diff = Buffer.alloc(width * height * 4)
  let mismatchPixels = 0
  let comparedPixels = 0
  let absoluteError = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const masked = x >= maskLeft && x < maskRight && y >= maskTop && y < maskBottom
      if (masked) {
        diff[offset] = 32
        diff[offset + 1] = 96
        diff[offset + 2] = 196
        diff[offset + 3] = 48
        continue
      }
      comparedPixels += 1
      let maxDelta = 0
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(current.data[offset + channel]! - golden.data[offset + channel]!)
        absoluteError += delta
        maxDelta = Math.max(maxDelta, delta)
      }
      if (maxDelta > 12) {
        mismatchPixels += 1
        diff[offset] = 255
        diff[offset + 1] = 32
        diff[offset + 2] = 32
        diff[offset + 3] = 255
      } else {
        diff[offset] = golden.data[offset]!
        diff[offset + 1] = golden.data[offset + 1]!
        diff[offset + 2] = golden.data[offset + 2]!
        diff[offset + 3] = 28
      }
    }
  }
  await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(diffPath)
  const mismatchRatio = comparedPixels === 0 ? 0 : mismatchPixels / comparedPixels
  const meanAbsoluteError = comparedPixels === 0 ? 0 : absoluteError / (comparedPixels * 4)
  invariant(
    mismatchRatio <= 0.0015,
    'LIVE_GOLDEN_PIXEL_DRIFT',
    `${path.basename(currentPath)} mismatch ratio ${mismatchRatio.toFixed(6)} exceeds 0.0015`,
  )
  invariant(
    meanAbsoluteError <= 0.35,
    'LIVE_GOLDEN_PIXEL_DRIFT',
    `${path.basename(currentPath)} mean absolute error ${meanAbsoluteError.toFixed(6)} exceeds 0.35`,
  )
  return { mismatchPixels, comparedPixels, mismatchRatio, meanAbsoluteError }
}

async function runVisualVerification(
  snapshot: RepositorySnapshot,
  contract: GoldenContract,
  options: VerificationOptions,
): Promise<unknown> {
  const outputDirectory = resolve(
    snapshot.root,
    options.outputDirectory ?? 'output/editor-preservation',
  )
  mkdirSync(outputDirectory, { recursive: true })
  for (const requiredBuild of [
    'dist-player/player.iife.js',
    'dist-renderer/index.html',
    'dist-electron/main/index.js',
  ]) {
    invariant(existsSync(resolve(snapshot.root, requiredBuild)), 'BUILD_MISSING', requiredBuild)
  }

  const profileDirectory = mkdtempSync(path.join(tmpdir(), 'ittoedu-preservation-'))
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const externalRequests: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profileDirectory}`],
    cwd: snapshot.root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      COURSEWARE_E2E_BACKGROUND: '1',
    },
  })
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
        externalRequests.push(request.url())
      }
    })
    await page.waitForLoadState('domcontentloaded')
    if (options.entryMode === 'transition') {
      await page.getByTestId('course-studio-v9').waitFor()
      await page.goto('courseware-editor://app/index.html?editor=legacy-v8', {
        waitUntil: 'domcontentloaded',
      })
    }
    await page.locator('.app-shell').waitFor()
    await page.locator('[data-testid="canvas-stage"] canvas').waitFor()
    const routeButton = page.getByTestId('open-course-v9')
    if (await routeButton.count()) {
      await routeButton.evaluate((button) => {
        if (button instanceof HTMLElement) button.hidden = true
      })
    }
    await page.getByRole('button', { name: '专业', exact: true }).click()
    await waitFor(
      () => page.getByRole('button', { name: '专业', exact: true })
        .getAttribute('aria-pressed').then((value) => value === 'true'),
      'professional mode',
    )
    const initialStateButton = page.locator('.scene-state-card').filter({
      has: page.locator('.scene-state-card__name', { hasText: '初始' }),
    })
    await initialStateButton.click()
    await waitFor(
      () => initialStateButton.getAttribute('aria-pressed').then((value) => value === 'true'),
      'named initial state',
    )
    const initialRetry = page.getByRole('button', { name: '重新载入画布', exact: true })
    if (await initialRetry.count()) await initialRetry.click()
    await waitFor(
      () => page.locator('.runtime-preview-loading').count().then((count) => count === 0),
      'initial preview',
    )
    await page.getByRole('tab', { name: '元素', exact: true }).click()
    await page.getByRole('tab', { name: '常用', exact: true }).click()
    await page.getByTestId('add-text').click()
    const insertionRetry = page.getByRole('button', { name: '重新载入画布', exact: true })
    if (await insertionRetry.count()) await insertionRetry.click()
    await waitFor(
      () => page.locator('.runtime-preview-loading').count().then((count) => count === 0),
      'preview after text insertion',
    )
    await waitFor(
      () => page.locator('.status-bar').textContent().then((text) => Boolean(text?.includes('已选：'))),
      'selected text status',
    )
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(650)

    const captures = []
    for (let index = 0; index < goldenViewports.length; index += 1) {
      const viewport = goldenViewports[index]!
      const resizeTrace = []
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const actual = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
        resizeTrace.push(actual)
        if (actual.width === viewport.width && actual.height === viewport.height) break
        await app.evaluate(({ BrowserWindow }, correction) => {
          const window = BrowserWindow.getAllWindows()[0]
          if (!window) throw new Error('Editor BrowserWindow is missing')
          const [width, height] = window.getSize()
          window.setSize(
            Math.max(1, width + correction.width),
            Math.max(1, height + correction.height),
            false,
          )
        }, {
          width: viewport.width - actual.width,
          height: viewport.height - actual.height,
        })
        await page.waitForTimeout(250)
      }
      await waitFor(
        () => page.evaluate(
          ({ width, height }) => innerWidth === width && innerHeight === height,
          viewport,
        ),
        `${viewport.width}x${viewport.height} viewport`,
      )
      await page.waitForTimeout(350)
      const geometry = await readLiveGeometry(page, viewport)
      assertGeometryCapture(geometry)
      const golden = contract.captures[index]!
      assertLiveGeometryMatchesGolden(geometry, golden.geometry)
      const currentPath = resolve(outputDirectory, `current-${viewport.width}x${viewport.height}.png`)
      const diffPath = resolve(outputDirectory, `diff-${viewport.width}x${viewport.height}.png`)
      await page.screenshot({ path: currentPath, fullPage: false, scale: 'css' })
      const goldenPath = resolve(
        snapshot.root,
        'tests/contracts/v8-shell-baseline',
        golden.screenshotFile,
      )
      const comparison = await compareMaskedGolden(
        currentPath,
        goldenPath,
        diffPath,
        golden.geometry.rectangles.canvasStage!,
      )
      captures.push({ viewport, resizeTrace, geometry, currentPath, diffPath, comparison })
    }
    invariant(pageErrors.length === 0, 'LIVE_PAGE_ERROR', pageErrors.join('; '))
    invariant(consoleErrors.length === 0, 'LIVE_CONSOLE_ERROR', consoleErrors.join('; '))
    invariant(externalRequests.length === 0, 'LIVE_EXTERNAL_REQUEST', externalRequests.join('; '))
    const report = {
      status: 'PASS',
      entryMode: options.entryMode,
      mask: 'canvasStage only',
      thresholds: { channelDelta: 12, mismatchRatio: 0.0015, meanAbsoluteError: 0.35 },
      captures,
      diagnostics: { pageErrors, consoleErrors, externalRequests },
    }
    writeFileSync(resolve(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    return report
  } finally {
    await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((window) => window.destroy())
      setTimeout(() => electronApp.exit(0), 0)
    }).catch(() => undefined)
    await app.close().catch(() => undefined)
    rmSync(profileDirectory, { recursive: true, force: true })
  }
}

export async function runEditorPreservationVerification(
  options: VerificationOptions,
  root = repositoryRoot,
): Promise<{ static: 'PASS'; visual?: unknown }> {
  const snapshot = createRepositorySnapshot(root)
  await verifyRepositorySnapshot(snapshot, options)
  const result: { static: 'PASS'; visual?: unknown } = { static: 'PASS' }
  if (options.visual) {
    const contract = await verifyGoldenContracts(snapshot)
    result.visual = await runVisualVerification(snapshot, contract, options)
  }
  return result
}

function parseEntryMode(): EditorEntryMode {
  const argument = process.argv.find((value) => value.startsWith('--entry-mode='))
  const value = argument?.slice('--entry-mode='.length) ?? 'transition'
  invariant(
    value === 'transition' || value === 'v8-only',
    'CLI_INVALID',
    `Unknown entry mode: ${value}`,
  )
  return value
}

async function main(): Promise<void> {
  const result = await runEditorPreservationVerification({
    entryMode: parseEntryMode(),
    visual: process.argv.includes('--visual'),
  })
  console.log(JSON.stringify({ status: 'PASS', ...result }, null, 2))
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
