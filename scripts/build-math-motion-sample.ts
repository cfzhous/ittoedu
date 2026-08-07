import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { build as viteBuild } from 'vite'
import { componentManifestSchema } from '../src/shared/componentSchema'
import type {
  ComponentManifest,
  ComponentPackageData,
} from '../src/shared/componentTypes'
import { coursewareEvidenceManifestV1Schema } from '../src/shared/coursewareEvidence'
import type {
  ExternalComponentNode,
  ProjectDocument,
  SceneDocument,
  ShapeNode,
  TextNode,
} from '../src/shared/projectTypes'
import type { InteractionRule } from '../src/shared/interactionTypes'
import { projectDocumentSchema } from '../src/shared/projectSchema'
import { collectProjectHealth, summarizeProjectHealth } from '../src/shared/projectHealth'
import {
  createExternalComponentNode,
  createProject,
  createScene,
  createShapeNode,
  createTextNode,
} from '../src/renderer/project/createProject'
import { importComponentPackage } from '../src/renderer/components/importComponentPackage'
import {
  createProjectArchive,
  openProjectArchive,
} from '../src/renderer/project/projectArchive'
import { buildExportPayload } from '../src/renderer/export/buildExportPayload'
import { buildStandaloneHtml } from '../src/renderer/export/buildStandaloneHtml'
import {
  BASE_LINKED_GRAPH_MODEL,
  deriveAreaTruth,
  deriveLinkedGraphSnapshot,
  quadraticMaximum,
} from '../examples/math-motion-function-lab/mathModel'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDirectory, '..')
const componentDirectory = path.join(root, 'examples', 'math-motion-function-lab')
const componentEntryPath = path.join(componentDirectory, 'runtime.entry.ts')
const componentRuntimePath = path.join(componentDirectory, 'runtime.js')
const outputDirectory = path.join(root, 'output', 'math-motion-sample')
const evidenceDirectory = path.join(outputDirectory, 'evidence')
const componentArchivePath = path.join(outputDirectory, 'motion-function-lab.h5component')
const lessonArchivePath = path.join(outputDirectory, '让运动变成函数-核心联动样片.h5lesson')
const standaloneHtmlPath = path.join(outputDirectory, '让运动变成函数-核心联动样片.html')
const projectJsonPath = path.join(outputDirectory, 'project.json')
const healthReportPath = path.join(outputDirectory, 'project-health.json')
const buildSummaryPath = path.join(outputDirectory, 'build-summary.json')
const evidenceManifestPath = path.join(outputDirectory, 'evidence-manifest.json')
const previewConfigPath = path.join(outputDirectory, 'preview-config.json')
const exploreScreenshotPath = path.join(evidenceDirectory, 'linked-explore.png')
const provedScreenshotPath = path.join(evidenceDirectory, 'linked-proved.png')
const comparisonPath = path.join(evidenceDirectory, 'linked-graph-comparison.png')
const recordingPath = path.join(evidenceDirectory, 'linked-interaction.webm')
const playerBundlePath = path.join(root, 'dist-player', 'player.iife.js')
const reproducibleTimestamp = new Date('2026-08-07T00:00:00.000Z')
const timestamp = reproducibleTimestamp.toISOString()
const MAX_RUNTIME_BYTES = 2 * 1024 * 1024

const palette = {
  paper: '#FBF8F1',
  ink: '#16191F',
  muted: '#74777C',
  line: '#C9CDD2',
  blue: '#145DCE',
  blueSoft: '#DCE9FF',
  red: '#E04424',
  redSoft: '#F8D9CF',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function relativePath(target: string): string {
  return path.relative(root, target).replaceAll('\\', '/')
}

async function sha256File(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}

async function evidenceItem(
  id: string,
  kind: 'screenshot' | 'recording' | 'pptx-render' | 'comparison',
  filePath: string,
  required: boolean,
  metadata: { sceneId?: string; stateId?: string; notes?: string } = {},
) {
  const present = await fs.stat(filePath).then((stat) => stat.isFile()).catch(() => false)
  return {
    id,
    kind,
    path: relativePath(filePath),
    required,
    present,
    ...(present ? { sha256: await sha256File(filePath) } : {}),
    ...metadata,
  }
}

function textNode(
  id: string,
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    fontSize?: number
    color?: string
    bold?: boolean
    align?: 'left' | 'center' | 'right'
    writingMode?: 'horizontal' | 'vertical-rl' | 'vertical-lr'
    visible?: boolean
    letterSpacing?: number
  } = {},
): TextNode {
  const node = createTextNode({
    id,
    name,
    text,
    x,
    y,
    width,
    height,
    visible: options.visible ?? true,
    style: {
      fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
      fontSize: options.fontSize ?? 18,
      color: options.color ?? palette.ink,
      bold: options.bold ?? false,
      align: options.align ?? 'left',
      verticalAlign: 'middle',
      writingMode: options.writingMode ?? 'horizontal',
      lineSpacing: 4,
      letterSpacing: options.letterSpacing ?? 0,
      padding: 0,
      overflow: 'shrink',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      cornerRadius: 0,
    },
  })
  node.playbackInitialVisibility = 'inherit'
  return node
}

function shapeNode(
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string,
  options: { visible?: boolean; cornerRadius?: number; fillOpacity?: number } = {},
): ShapeNode {
  const node = createShapeNode('rounded-rectangle', {
    id,
    name,
    x,
    y,
    width,
    height,
    visible: options.visible ?? true,
    style: {
      fillColor,
      fillOpacity: options.fillOpacity ?? 1,
      borderColor: fillColor,
      borderOpacity: 1,
      borderWidth: 0,
      cornerRadius: options.cornerRadius ?? 0,
    },
  })
  node.playbackInitialVisibility = 'inherit'
  return node
}

function componentEventRule(): InteractionRule {
  return {
    id: 'linked_mark_mastered',
    name: '确认图式联动结论',
    enabled: true,
    trigger: {
      type: 'component.event',
      nodeId: 'linked_graph_component',
      eventName: 'linked.mastered',
    },
    conditions: [{ type: 'presentation.in', stateIds: ['linked_explore'] }],
    actions: [{
      id: 'linked_mark_mastered_action',
      start: 'after-previous',
      delayMs: 0,
      action: {
        type: 'presentation.set',
        stateId: 'linked_proved',
        transition: { duration: 180, ease: 'Sine.easeInOut' },
      },
    }],
  }
}

function buildScene(manifest: ComponentManifest): SceneDocument {
  const scene = createScene({
    id: 'scene_linked_graph',
    name: '04 · 图式联动',
    backgroundColor: palette.paper,
  })
  const defaults = isRecord(manifest.defaultProps) ? manifest.defaultProps : {}
  const component = createExternalComponentNode({
    id: 'linked_graph_component',
    name: '动点位置—面积—函数图象联动实验',
    x: 88,
    y: 154,
    width: 1136,
    height: 452,
    component: { packageId: manifest.id, version: manifest.version },
    props: {
      ...defaults,
      mode: 'linked-graph',
      phase: 'explore',
      model: BASE_LINKED_GRAPH_MODEL,
    },
  })
  component.playbackInitialVisibility = 'inherit'
  scene.nodes = [
    shapeNode('motion_rail_line', '学习路径竖线', 37, 38, 16, 568, palette.blue, {
      fillOpacity: 0.12,
      cornerRadius: 8,
    }),
    shapeNode('motion_rail_dot', '当前节拍圆点', 37, 34, 16, 16, palette.blue, { cornerRadius: 8 }),
    textNode('motion_rail_label', '纵向学习路径', '从运动到模型', 16, 62, 29, 176, {
      fontSize: 17,
      color: palette.blue,
      bold: true,
      writingMode: 'vertical-rl',
      align: 'center',
      letterSpacing: 2,
    }),
    textNode('motion_title', '课例标题', '让运动变成函数', 88, 38, 720, 58, {
      fontSize: 39,
      color: palette.ink,
      bold: true,
    }),
    textNode('motion_subtitle', '操作提示', '拖动 t，让点的位置、面积表达式与函数图象在同一时刻对齐', 91, 98, 880, 34, {
      fontSize: 18,
      color: palette.muted,
    }),
    textNode('motion_scene_label', '节拍标签', '图式联动  /  LINKED GRAPH', 936, 48, 288, 30, {
      fontSize: 12,
      color: palette.blue,
      bold: true,
      align: 'right',
      letterSpacing: 1.2,
    }),
    component,
    textNode('step_constraints', '方法步骤：约束', '约束', 90, 616, 92, 30, {
      fontSize: 15,
      color: palette.muted,
      align: 'center',
    }),
    textNode('step_variables', '方法步骤：变量', '变量', 196, 616, 92, 30, {
      fontSize: 15,
      color: palette.muted,
      align: 'center',
    }),
    textNode('step_relation', '方法步骤：关系', '关系', 302, 616, 92, 30, {
      fontSize: 15,
      color: palette.muted,
      align: 'center',
    }),
    shapeNode('step_domain_rule', '当前方法步骤底色', 414, 620, 80, 26, palette.blueSoft, {
      cornerRadius: 13,
    }),
    textNode('step_domain', '方法步骤：范围', '范围', 408, 616, 92, 30, {
      fontSize: 15,
      color: palette.blue,
      bold: true,
      align: 'center',
    }),
    textNode('step_interpret', '方法步骤：解释', '解释', 514, 616, 92, 30, {
      fontSize: 15,
      color: palette.muted,
      align: 'center',
    }),
    textNode('linked_completion', '完成反馈', '完成 · 等待讲评  →', 904, 614, 320, 36, {
      fontSize: 16,
      color: palette.blue,
      bold: true,
      align: 'right',
      visible: false,
    }),
  ]
  scene.presentation = {
    initialStateId: 'linked_explore',
    thumbnailStateId: 'linked_proved',
    states: [
      {
        id: 'linked_explore',
        name: '探索图式联动',
        description: '从 t = 0 出发，依次检查 0、2、4 三个时刻',
        nodeOverrides: {},
      },
      {
        id: 'linked_proved',
        name: '最大值已证明',
        description: 't = 2 时三种表征共同给出 Smax = 6',
        nodeOverrides: {
          linked_graph_component: { props: { phase: 'proved' } },
          linked_completion: { visible: true },
        },
      },
    ],
  }
  scene.interactions = [componentEventRule()]
  return scene
}

function buildProject(
  manifest: ComponentManifest,
  componentKey: string,
  componentMetadata: ReturnType<typeof importComponentPackage>['metadata'],
): ProjectDocument {
  const project = createProject({
    id: 'project_math_motion_linked_graph_sample',
    title: '让运动变成函数——核心联动样片',
    now: timestamp,
    idFactory: (() => {
      let value = 0
      return () => String(++value).padStart(3, '0')
    })(),
  })
  project.scenes = [buildScene(manifest)]
  project.componentPackages[componentKey] = componentMetadata
  project.globalInteractions = []
  project.media.audio = {
    defaultMuted: true,
    masterVolume: 1,
    channelVolumes: {
      music: 0,
      narration: 0,
      sfx: 0,
      ui: 0,
      video: 0,
    },
    sounds: {},
    narrationDucking: {
      enabled: false,
      musicVolume: 0,
      fadeMs: 0,
    },
  }
  project.playback = { controls: 'canvas', keyboardNavigation: false }
  const controller = project.globalLayer.find((item) => item.node.type === 'teacher-controller')
  if (controller?.node.type === 'teacher-controller') {
    controller.node.id = 'math_motion_teacher_controller'
    controller.node.name = '折叠式画布控制器'
    controller.node.title = '课堂控制'
    controller.node.x = 874
    controller.node.y = 672
    controller.node.width = 350
    controller.node.height = 34
    controller.node.compact = true
    controller.node.collapsible = true
    controller.node.defaultCollapsed = true
    controller.node.showSceneProgress = false
    controller.node.includeInStaticExports = false
    controller.node.buttons = [
      { id: 'controller_back', action: { type: 'scene.previous' }, label: '返回', visible: true },
      { id: 'controller_replay', action: { type: 'scene.replay' }, label: '重播', visible: true },
      { id: 'controller_restart', action: { type: 'course.restart' }, label: '重开', visible: true },
      { id: 'controller_fullscreen', action: { type: 'player.fullscreen.toggle' }, label: '全屏', visible: true },
    ]
    controller.node.style.backgroundColor = palette.ink
    controller.node.style.backgroundOpacity = 0.96
    controller.node.style.accentColor = palette.blue
    controller.node.style.textColor = '#FFFFFF'
    controller.node.style.cornerRadius = 4
  }
  return projectDocumentSchema.parse(project)
}

function assertProject(project: ProjectDocument, manifest: ComponentManifest): void {
  if (project.schemaVersion !== 7) throw new Error('样片工程不是 Project V7')
  if (project.canvas.width !== 1280 || project.canvas.height !== 720) {
    throw new Error('样片画布不是 1280×720')
  }
  if (project.scenes.length !== 1) throw new Error('核心样片必须只包含一个场景')
  if (project.playback.controls !== 'canvas' || project.playback.keyboardNavigation) {
    throw new Error('样片必须使用画布控制器并关闭键盘翻页')
  }
  const scene = project.scenes[0]
  if (!scene?.presentation) throw new Error('核心场景缺少 presentation')
  const stateIds = scene.presentation.states.map((state) => state.id)
  if (JSON.stringify(stateIds) !== JSON.stringify(['linked_explore', 'linked_proved'])) {
    throw new Error(`核心场景状态不完整：${stateIds.join(', ')}`)
  }
  if (
    scene.presentation.initialStateId !== 'linked_explore' ||
    scene.presentation.thumbnailStateId !== 'linked_proved'
  ) {
    throw new Error('核心场景初态或缩略图状态不符合门禁约定')
  }
  const components = scene.nodes.filter(
    (node): node is ExternalComponentNode => node.type === 'external-component',
  )
  if (components.length !== 1 || components[0]?.component.packageId !== manifest.id) {
    throw new Error('核心场景必须只使用一个课程专用组件实例')
  }
  const event = scene.interactions.find((rule) => rule.trigger.type === 'component.event')
  if (event?.trigger.type !== 'component.event' || event.trigger.eventName !== 'linked.mastered') {
    throw new Error('核心场景缺少 linked.mastered 状态映射')
  }
}

function assertMathTruth(): void {
  const truth = deriveAreaTruth(BASE_LINKED_GRAPH_MODEL)
  const maximum = quadraticMaximum(truth)
  const snapshots = [0, 2, 4].map((value) => deriveLinkedGraphSnapshot(BASE_LINKED_GRAPH_MODEL, value))
  const observed = snapshots.map(({ t, ap, bq, area }) => ({ t, ap, bq, area }))
  const expected = [
    { t: 0, ap: 0, bq: 6, area: 0 },
    { t: 2, ap: 4, bq: 3, area: 6 },
    { t: 4, ap: 8, bq: 0, area: 0 },
  ]
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(`核心数学关键帧不正确：${JSON.stringify(observed)}`)
  }
  if (maximum.input !== 2 || maximum.value !== 6) {
    throw new Error(`核心最大值不正确：${JSON.stringify(maximum)}`)
  }
}

function assertOfflineSource(source: string, label: string): void {
  const bytes = new TextEncoder().encode(source).byteLength
  if (bytes >= MAX_RUNTIME_BYTES) throw new Error(`${label} 超过 2 MiB：${bytes} bytes`)
  if (/(^|[;\n\r])\s*import\s*(?:[(\s{*]|["'])/m.test(source)) throw new Error(`${label} 包含 import`)
  if (/(^|[;\n\r])\s*export\s+(?:default|const|let|var|function|class|\{|\*)/m.test(source)) {
    throw new Error(`${label} 包含 export`)
  }
  if (/\brequire\s*\(/.test(source)) throw new Error(`${label} 包含 require`)
  if (/(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\()[^\n]{0,120}https?:\/\//i.test(source)) {
    throw new Error(`${label} 包含远程网络请求`)
  }
}

function validateRuntimeRegistration(source: string, manifest: ComponentManifest): void {
  let definition: unknown
  const api = {
    define(candidate: unknown) {
      if (definition !== undefined) throw new Error('组件 runtime 重复注册')
      definition = candidate
    },
  }
  const runtimeWindow = { CoursewareComponent: api }
  const execute = new Function(
    'window',
    'globalThis',
    'self',
    'CoursewareComponent',
    `"use strict";\n${source}`,
  ) as (
    windowValue: typeof runtimeWindow,
    globalValue: typeof runtimeWindow,
    selfValue: typeof runtimeWindow,
    apiValue: typeof api,
  ) => void
  execute(runtimeWindow, runtimeWindow, runtimeWindow, api)
  if (
    !isRecord(definition) ||
    definition.id !== manifest.id ||
    definition.runtimeApiVersion !== manifest.runtimeApiVersion ||
    typeof definition.create !== 'function'
  ) {
    throw new Error('组件 runtime 注册与 manifest 不一致')
  }
}

async function bundleRuntime(): Promise<string> {
  await viteBuild({
    configFile: false,
    logLevel: 'warn',
    build: {
      outDir: componentDirectory,
      emptyOutDir: false,
      copyPublicDir: false,
      sourcemap: false,
      minify: 'esbuild',
      lib: {
        entry: componentEntryPath,
        name: 'MathMotionFunctionLab',
        formats: ['iife'],
        fileName: () => 'runtime.js',
      },
    },
  })
  return fs.readFile(componentRuntimePath, 'utf8')
}

async function buildComponentFiles(
  manifest: ComponentManifest,
  runtimeSource: string,
): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
    [manifest.entry]: strToU8(runtimeSource),
    'THIRD_PARTY_NOTICES.md': strToU8('# Third-party notices\n\nNo third-party JavaScript or remote asset is bundled into this component.\n'),
  }
  if (manifest.thumbnail) {
    files[manifest.thumbnail] = Uint8Array.from(
      await fs.readFile(path.join(componentDirectory, manifest.thumbnail)),
    )
  }
  for (const assetPath of Object.values(manifest.assets)) {
    files[assetPath] = Uint8Array.from(await fs.readFile(path.join(componentDirectory, assetPath)))
  }
  return files
}

function assertStandaloneOffline(html: string): void {
  if (/<(?:script|img|audio|video|source|link)\b[^>]+(?:src|href)=["']https?:\/\//i.test(html)) {
    throw new Error('离线 HTML 中出现远程资源')
  }
  if (/\b(?:fetch|WebSocket|EventSource)\s*\(\s*["']https?:\/\//i.test(html)) {
    throw new Error('离线 HTML 中出现远程网络调用')
  }
}

async function writeEvidenceManifest(
  runtimeBytes: number,
  healthPassed: boolean,
): Promise<void> {
  const artifactSources = [
    { id: 'sample-lesson', kind: 'h5lesson' as const, filePath: lessonArchivePath },
    { id: 'sample-html', kind: 'standalone-html' as const, filePath: standaloneHtmlPath },
    { id: 'component-package', kind: 'component-package' as const, filePath: componentArchivePath },
    { id: 'project-json', kind: 'project-json' as const, filePath: projectJsonPath },
    { id: 'health-report', kind: 'report' as const, filePath: healthReportPath },
  ]
  const artifacts = await Promise.all(artifactSources.map(async ({ filePath, ...artifact }) => ({
    ...artifact,
    path: relativePath(filePath),
    sha256: await sha256File(filePath),
  })))
  const evidence = await Promise.all([
    evidenceItem('linked-explore-frame', 'screenshot', exploreScreenshotPath, true, {
      sceneId: 'scene_linked_graph',
      stateId: 'linked_explore',
    }),
    evidenceItem('linked-proved-frame', 'screenshot', provedScreenshotPath, true, {
      sceneId: 'scene_linked_graph',
      stateId: 'linked_proved',
    }),
    evidenceItem('linked-reference-comparison', 'comparison', comparisonPath, true, {
      notes: '批准的核心视觉参考与 1280×720 实际完成态并排比较',
    }),
    evidenceItem('linked-interaction-recording', 'recording', recordingPath, false, {
      notes: '整课 outcome-review 前升级为必需证据',
    }),
  ])
  const manifest = coursewareEvidenceManifestV1Schema.parse({
    schemaVersion: 1,
    experienceId: 'math-motion-linked-graph-sample',
    experienceVersion: '0.1.0',
    scope: 'core-sample',
    generatedAt: new Date().toISOString(),
    generatedBy: 'automation',
    artifacts,
    evidence,
    pipeline: {
      status: healthPassed ? 'passed' : 'failed',
      reports: [
        { id: 'project-health', path: relativePath(healthReportPath), passed: healthPassed },
        { id: 'runtime-size', path: relativePath(buildSummaryPath), passed: runtimeBytes < MAX_RUNTIME_BYTES },
        { id: 'math-truth', path: relativePath(buildSummaryPath), passed: true },
        { id: 'archive-round-trip', path: relativePath(buildSummaryPath), passed: true },
        { id: 'standalone-offline', path: relativePath(buildSummaryPath), passed: true },
      ],
    },
    result: {
      status: 'pending',
      notes: [
        '自动构建只确认管线，不代表视觉或教学结果已被人类接受。',
        '核心样片达到 art candidate 后仍须通过人工视觉门禁。',
      ],
    },
  })
  await fs.writeFile(evidenceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function main(): Promise<void> {
  await fs.mkdir(outputDirectory, { recursive: true })
  await fs.mkdir(evidenceDirectory, { recursive: true })
  const manifestText = await fs.readFile(path.join(componentDirectory, 'manifest.json'), 'utf8')
  const manifest = componentManifestSchema.parse(JSON.parse(manifestText) as unknown)
  if (
    manifest.schemaVersion !== 4 ||
    manifest.runtimeApiVersion !== 4 ||
    manifest.renderMode !== 'dom' ||
    !manifest.supportedScopes.includes('scene')
  ) {
    throw new Error('动点函数组件必须是支持 scene scope 的 Component API 4 DOM 组件')
  }
  assertMathTruth()
  const runtimeSource = await bundleRuntime()
  assertOfflineSource(runtimeSource, '动点函数组件运行时')
  validateRuntimeRegistration(runtimeSource, manifest)
  const componentFiles = await buildComponentFiles(manifest, runtimeSource)
  const componentArchive = zipSync(componentFiles, { level: 7, mtime: reproducibleTimestamp })
  const component = importComponentPackage(componentArchive, {
    expectedId: manifest.id,
    expectedVersion: manifest.version,
  })
  await fs.writeFile(componentArchivePath, componentArchive)

  const project = buildProject(manifest, component.key, component.metadata)
  assertProject(project, manifest)
  projectDocumentSchema.parse(project)
  const diagnostics = collectProjectHealth(project)
  const health = summarizeProjectHealth(diagnostics)
  await fs.writeFile(
    healthReportPath,
    `${JSON.stringify({ summary: health, diagnostics }, null, 2)}\n`,
    'utf8',
  )
  if (health.error > 0) throw new Error(`工程检查发现 ${health.error} 个阻断错误`)

  const componentFilesByKey = { [component.key]: component.files }
  const lessonArchive = createProjectArchive(
    { project, assetFiles: {}, componentFiles: componentFilesByKey },
    { mtime: reproducibleTimestamp },
  )
  await fs.writeFile(lessonArchivePath, lessonArchive)
  const reopened = openProjectArchive(lessonArchive)
  const reopenedProject = projectDocumentSchema.parse(reopened.project)
  assertProject(reopenedProject, manifest)
  if (!reopened.componentFiles[component.key]) throw new Error('归档重开后缺少组件文件')
  const reopenedHealth = summarizeProjectHealth(collectProjectHealth(reopenedProject))
  if (reopenedHealth.error > 0) throw new Error('归档重开后出现工程阻断错误')
  await fs.writeFile(projectJsonPath, `${JSON.stringify(reopenedProject, null, 2)}\n`, 'utf8')

  const playerBundle = await fs.readFile(playerBundlePath, 'utf8')
  const components: Record<string, ComponentPackageData> = { [component.key]: component }
  const payload = buildExportPayload({ project: reopenedProject, assets: {}, components })
  const html = buildStandaloneHtml(payload, { playerBundle, lang: 'zh-CN' })
  assertStandaloneOffline(html)
  await fs.writeFile(standaloneHtmlPath, html, 'utf8')

  const previewConfig = {
    source: relativePath(standaloneHtmlPath),
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    sceneId: 'scene_linked_graph',
    initialStateId: 'linked_explore',
    completedStateId: 'linked_proved',
    screenshots: {
      explore: relativePath(exploreScreenshotPath),
      proved: relativePath(provedScreenshotPath),
      comparison: relativePath(comparisonPath),
    },
  }
  await fs.writeFile(previewConfigPath, `${JSON.stringify(previewConfig, null, 2)}\n`, 'utf8')

  const runtimeBytes = new TextEncoder().encode(runtimeSource).byteLength
  const summary = {
    title: reopenedProject.title,
    scope: 'core-sample-only',
    format: 'Project V7 / Component API 4 DOM',
    canvas: reopenedProject.canvas,
    outputs: {
      lessonArchive: relativePath(lessonArchivePath),
      standaloneHtml: relativePath(standaloneHtmlPath),
      componentArchive: relativePath(componentArchivePath),
      projectJson: relativePath(projectJsonPath),
      healthReport: relativePath(healthReportPath),
      previewConfig: relativePath(previewConfigPath),
      evidenceManifest: relativePath(evidenceManifestPath),
    },
    component: {
      id: manifest.id,
      version: manifest.version,
      schemaVersion: manifest.schemaVersion,
      runtimeApiVersion: manifest.runtimeApiVersion,
      renderMode: manifest.renderMode,
      runtimeBytes,
      propsContract: ['mode', 'phase', 'model', 'content', 'palette', 'reducedMotion'],
      lifecycle: ['setMode', 'resize', 'updateProps', 'setVisible', 'suspend', 'resume', 'prepareCapture', 'destroy'],
    },
    math: {
      formula: 'S(t) = 6t - 1.5t²',
      domain: [0, 4],
      checkpoints: [
        deriveLinkedGraphSnapshot(BASE_LINKED_GRAPH_MODEL, 0),
        deriveLinkedGraphSnapshot(BASE_LINKED_GRAPH_MODEL, 2),
        deriveLinkedGraphSnapshot(BASE_LINKED_GRAPH_MODEL, 4),
      ],
      maximum: quadraticMaximum(deriveAreaTruth(BASE_LINKED_GRAPH_MODEL)),
    },
    pipelineStatus: health.error === 0 ? 'passed' : 'failed',
    outcomeStatus: 'pending',
    validation: {
      schema: 'passed',
      healthZeroErrors: health.error === 0,
      archiveRoundTrip: 'passed',
      standaloneOffline: 'passed',
      runtimeRegistration: 'passed',
      runtimeIifeAndSize: 'passed',
      mathTruth: 'passed',
      visualReview: {
        status: 'pending',
        evidenceManifest: relativePath(evidenceManifestPath),
      },
    },
    staticExportNote: '核心样片阶段暂不生成整课 PDF/PPTX；最终整课导出按初态静态化，完成答案由总结幕保留。',
  }
  await fs.writeFile(buildSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  await writeEvidenceManifest(runtimeBytes, health.error === 0)

  console.log(`组件包：${componentArchivePath}`)
  console.log(`核心样片：${lessonArchivePath}`)
  console.log(`离线预览：${standaloneHtmlPath}`)
  console.log(`证据清单：${evidenceManifestPath}`)
  console.log(`工程检查：errors=${health.error}, warnings=${health.warning}, info=${health.info}`)
  console.log('结果状态：pending（自动构建不写入人工签署；门禁记录见 design-qa.md）')
}

main().catch((error: unknown) => {
  console.error('生成动点问题核心联动样片失败', error)
  process.exitCode = 1
})
