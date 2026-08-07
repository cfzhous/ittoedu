import fs from 'node:fs/promises'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import type { ComponentPackageData } from '../src/shared/componentTypes'
import type {
  ExternalComponentNode,
  ProjectDocument,
  SceneDocument,
} from '../src/shared/projectTypes'
import type { InteractionRule } from '../src/shared/interactionTypes'
import { isTerminalNavigationAction } from '../src/shared/interactionTypes'
import { projectDocumentSchema } from '../src/shared/projectSchema'
import {
  collectProjectHealth,
  summarizeProjectHealth,
  type ProjectHealthDiagnostic,
  type ProjectHealthSummary,
} from '../src/shared/projectHealth'
import { openProjectArchive } from '../src/renderer/project/projectArchive'
import { parseComponentPackageFiles } from '../src/renderer/components/importComponentPackage'
import { buildExportPayload } from '../src/renderer/export/buildExportPayload'
import { buildStandaloneHtml } from '../src/renderer/export/buildStandaloneHtml'

const DEFAULT_LESSON_PATH = path.resolve(
  process.cwd(),
  'output',
  'induction-courseware',
  '不是磁场，而是变化.h5lesson',
)
const PLAYER_BUNDLE_PATH = path.resolve(process.cwd(), 'dist-player', 'player.iife.js')

const INDUCTION_BUTTON_AUTHORING_KEYS = [
  'content.prediction.choiceLeft',
  'content.prediction.choiceZero',
  'content.prediction.choiceRight',
  'content.prediction.lockLabel',
  'content.lab.slowApproach',
  'content.lab.fastApproach',
  'content.lab.holdNear',
  'content.lab.recede',
  'content.lab.resetLabel',
  'content.lab.compareLabel',
  'content.model.verifyLabel',
  'content.lenz.chooseLeft',
  'content.lenz.chooseRight',
  'content.lenz.submitLabel',
  'content.transfer.yesLabel',
  'content.transfer.noLabel',
  'content.transfer.checkLabel',
  'content.transfer.summaryLabel',
] as const

const EXPECTED_SCENES = [
  {
    name: '先押一个答案',
    states: ['predict_empty', 'predict_locked'],
  },
  {
    name: '让证据说话',
    states: ['lab_ready', 'trial_recorded', 'evidence_complete', 'prediction_compare'],
  },
  {
    name: '从现象到模型',
    states: ['model_intro', 'slope_task', 'model_repair', 'model_mastered'],
  },
  {
    name: '方向不是背口令',
    states: ['approach_worked', 'recede_attempt', 'direction_repair', 'direction_mastered'],
  },
  {
    name: '换一个装置还会吗',
    states: ['transfer_attempt', 'transfer_repair', 'transfer_mastered', 'exit_summary'],
  },
] as const

type CheckStatus = 'passed' | 'warning' | 'failed'

interface ValidationCheck {
  id: string
  title: string
  status: CheckStatus
  summary: string
  details: string[]
  metrics?: Record<string, string | number | boolean>
}

interface StandaloneEvidence {
  mode: 'existing' | 'generated-in-memory' | 'unavailable'
  path?: string
  byteLength?: number
  containsPayload?: boolean
  offline?: boolean
}

interface ValidationReport {
  reportVersion: 1
  validator: 'induction-courseware-v1'
  generatedAt: string
  target: string
  result: 'passed' | 'failed'
  counts: Record<CheckStatus, number>
  metrics: {
    sceneCount?: number
    stateCount?: number
    interactionRuleCount?: number
    componentPackageCount?: number
    nativeEditableTextCount?: number
    componentEditableTextCount?: number
  }
  health?: {
    summary: ProjectHealthSummary
    diagnostics: ProjectHealthDiagnostic[]
  }
  standalone?: StandaloneEvidence
  checks: ValidationCheck[]
}

interface CliOptions {
  lessonPath: string
  reportPath: string
  htmlPath?: string
}

interface StringLeaf {
  key: string
  value: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCli(argv: string[]): CliOptions | null {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log([
      '用法: npx tsx scripts/validate-induction-lesson.ts [lesson.h5lesson]',
      '      [--report validation-report.json] [--html standalone.html]',
      '',
      '不传工程路径时，默认验收 output/induction-courseware/不是磁场，而是变化.h5lesson。',
      '--html 指向已有 HTML；文件不存在时会在该路径生成。',
    ].join('\n'))
    return null
  }

  let lessonPath: string | undefined
  let reportPath: string | undefined
  let htmlPath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!
    if (value === '--report') {
      reportPath = argv[index + 1]
      index += 1
      continue
    }
    if (value === '--html') {
      htmlPath = argv[index + 1]
      index += 1
      continue
    }
    if (value.startsWith('-')) {
      throw new Error(`未知参数：${value}`)
    }
    if (lessonPath !== undefined) {
      throw new Error(`只能指定一个 .h5lesson 路径：${value}`)
    }
    lessonPath = value
  }

  const resolvedLessonPath = path.resolve(lessonPath ?? DEFAULT_LESSON_PATH)
  return {
    lessonPath: resolvedLessonPath,
    reportPath: path.resolve(
      reportPath ?? path.join(path.dirname(resolvedLessonPath), 'validation-report.json'),
    ),
    ...(htmlPath === undefined ? {} : { htmlPath: path.resolve(htmlPath) }),
  }
}

function createReport(target: string): ValidationReport {
  return {
    reportVersion: 1,
    validator: 'induction-courseware-v1',
    generatedAt: new Date().toISOString(),
    target,
    result: 'failed',
    counts: { passed: 0, warning: 0, failed: 0 },
    metrics: {},
    checks: [],
  }
}

function addCheck(
  report: ValidationReport,
  check: Omit<ValidationCheck, 'details'> & { details?: string[] },
): void {
  report.checks.push({ ...check, details: check.details ?? [] })
}

function normalizedId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(?:scene|state)[_-]+/, '')
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, '')
}

function hasSemanticState(stateIds: readonly string[], expected: string): boolean {
  const wanted = normalizedId(expected)
  return stateIds.some((stateId) => {
    const actual = normalizedId(stateId)
    return actual === wanted || actual.endsWith(wanted)
  })
}

function collectStringLeaves(value: unknown, prefix = ''): StringLeaf[] {
  if (typeof value === 'string') {
    return value.trim().length === 0 ? [] : [{ key: prefix, value }]
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStringLeaves(
      item,
      prefix.length === 0 ? String(index) : `${prefix}.${index}`,
    ))
  }
  if (!isRecord(value)) return []
  return Object.entries(value).flatMap(([key, item]) => collectStringLeaves(
    item,
    prefix.length === 0 ? key : `${prefix}.${key}`,
  ))
}

function sceneStateIds(scene: SceneDocument): string[] {
  return scene.presentation?.states.map((state) => state.id) ?? []
}

function allRules(project: ProjectDocument): InteractionRule[] {
  return [
    ...project.globalInteractions,
    ...project.scenes.flatMap((scene) => scene.interactions),
  ]
}

function componentNodes(project: ProjectDocument): Array<{
  scope: 'scene' | 'global'
  sceneId?: string
  node: ExternalComponentNode
}> {
  const nodes: Array<{
    scope: 'scene' | 'global'
    sceneId?: string
    node: ExternalComponentNode
  }> = []
  project.scenes.forEach((scene) => {
    scene.nodes.forEach((node) => {
      if (node.type === 'external-component') {
        nodes.push({ scope: 'scene', sceneId: scene.id, node })
      }
    })
  })
  project.globalLayer.forEach(({ node }) => {
    if (node.type === 'external-component') nodes.push({ scope: 'global', node })
  })
  return nodes
}

function findPackageFiles(
  componentFiles: Readonly<Record<string, Record<string, Uint8Array>>>,
  recordKey: string,
  packageId: string,
  version: string,
): Record<string, Uint8Array> | undefined {
  return (
    componentFiles[`${packageId}@${version}`] ??
    componentFiles[recordKey] ??
    componentFiles[packageId]
  )
}

function validateRawProjectShape(report: ValidationReport, rawProject: unknown): void {
  const details: string[] = []
  if (!isRecord(rawProject)) {
    addCheck(report, {
      id: 'project.raw-v8',
      title: '原始工程为显式 Project V8',
      status: 'failed',
      summary: 'project.json 根节点不是对象',
    })
    return
  }

  if (rawProject.schemaVersion !== 8) details.push('schemaVersion 必须为 8')
  for (const key of ['globalLayer', 'globalInteractions', 'media', 'playback']) {
    if (!Object.prototype.hasOwnProperty.call(rawProject, key)) {
      details.push(`缺少显式字段 ${key}`)
    }
  }
  if (!Array.isArray(rawProject.scenes) || rawProject.scenes.some(
    (scene) => !isRecord(scene) || !Object.prototype.hasOwnProperty.call(scene, 'interactions'),
  )) {
    details.push('每个场景必须显式包含 interactions')
  }
  addCheck(report, {
    id: 'project.raw-v8',
    title: '原始工程为显式 Project V8',
    status: details.length === 0 ? 'passed' : 'failed',
    summary: details.length === 0
      ? '未依赖打开时迁移，V8 必需字段完整'
      : `发现 ${details.length} 项原始结构问题`,
    details,
  })
}

function validateSceneSpine(report: ValidationReport, project: ProjectDocument): void {
  const details: string[] = []
  if (project.scenes.length !== EXPECTED_SCENES.length) {
    details.push(`期望 5 幕，实际 ${project.scenes.length} 幕`)
  }
  EXPECTED_SCENES.forEach((expected, index) => {
    const scene = project.scenes[index]
    if (!scene) {
      details.push(`第 ${index + 1} 幕缺失：${expected.name}`)
      return
    }
    if (!scene.name.includes(expected.name)) {
      details.push(`第 ${index + 1} 幕应为“${expected.name}”，实际为“${scene.name}”`)
    }
    const stateIds = sceneStateIds(scene)
    expected.states.forEach((stateId) => {
      if (!hasSemanticState(stateIds, stateId)) {
        details.push(`${scene.name}缺少关键状态 ${stateId}`)
      }
    })
  })
  report.metrics.sceneCount = project.scenes.length
  report.metrics.stateCount = project.scenes.reduce(
    (count, scene) => count + (scene.presentation?.states.length ?? 0),
    0,
  )
  addCheck(report, {
    id: 'pedagogy.scene-spine',
    title: '五幕教学主线与关键状态',
    status: details.length === 0 ? 'passed' : 'failed',
    summary: details.length === 0
      ? '预测—证据—建模—方向—迁移的次序与命名状态完整'
      : `教学主线有 ${details.length} 项不符合`,
    details,
    metrics: {
      sceneCount: project.scenes.length,
      stateCount: report.metrics.stateCount,
    },
  })
}

function validatePresentationAndReachability(
  report: ValidationReport,
  project: ProjectDocument,
): void {
  const thumbnailDetails: string[] = []
  const reachabilityDetails: string[] = []
  const globalTargets = project.globalInteractions.flatMap((rule) => (
    rule.enabled
      ? rule.actions
        .filter((step) => step.action.type === 'presentation.set')
        .map((step) => step.action.type === 'presentation.set' ? step.action.stateId : '')
      : []
  ))

  project.scenes.forEach((scene) => {
    const presentation = scene.presentation
    const ids = sceneStateIds(scene)
    if (!presentation) {
      thumbnailDetails.push(`${scene.name}缺少 presentation`)
      reachabilityDetails.push(`${scene.name}缺少 presentation`)
      return
    }
    if (!presentation.thumbnailStateId || !ids.includes(presentation.thumbnailStateId)) {
      thumbnailDetails.push(`${scene.name}的 thumbnailStateId 缺失或无效`)
    }
    if (!ids.includes(presentation.initialStateId)) {
      thumbnailDetails.push(`${scene.name}的 initialStateId 无效`)
    }

    const localTargets = scene.interactions.flatMap((rule) => (
      rule.enabled
        ? rule.actions
          .filter((step) => step.action.type === 'presentation.set')
          .map((step) => step.action.type === 'presentation.set' ? step.action.stateId : '')
        : []
    ))
    const incomingTargets = project.scenes.flatMap((source) => source.interactions).flatMap(
      (rule) => rule.enabled
        ? rule.actions.flatMap((step) => {
          if (step.action.type !== 'scene.go' || step.action.sceneId !== scene.id) return []
          return [step.action.targetStateId ?? presentation.initialStateId]
        })
        : [],
    )
    const reachable = new Set([...localTargets, ...globalTargets, ...incomingTargets])
    const nonInitialReachable = [...reachable].filter(
      (stateId) => stateId !== presentation.initialStateId && ids.includes(stateId),
    )
    if (nonInitialReachable.length === 0) {
      reachabilityDetails.push(`${scene.name}没有由声明式规则可达的非初始状态`)
    }

    const eventToState = scene.interactions.some((rule) => (
      rule.enabled &&
      ['node.click', 'component.event', 'runtime.event'].includes(rule.trigger.type) &&
      rule.actions.some((step) => step.action.type === 'presentation.set')
    ))
    if (!eventToState) {
      reachabilityDetails.push(`${scene.name}缺少“用户/组件事件 → 命名状态”规则`)
    }
  })

  addCheck(report, {
    id: 'presentation.thumbnail-states',
    title: '初始状态与缩略图状态',
    status: thumbnailDetails.length === 0 ? 'passed' : 'failed',
    summary: thumbnailDetails.length === 0
      ? '五幕均指定了确定且存在的缩略图状态'
      : `发现 ${thumbnailDetails.length} 项状态引用问题`,
    details: thumbnailDetails,
  })
  addCheck(report, {
    id: 'interactions.event-state-reachability',
    title: '声明式事件到状态的可达性',
    status: reachabilityDetails.length === 0 ? 'passed' : 'failed',
    summary: reachabilityDetails.length === 0
      ? '每幕至少有一个可由显式规则到达的后续稳定状态'
      : `发现 ${reachabilityDetails.length} 项可达性问题`,
    details: reachabilityDetails,
  })
}

function validateInteractionOrdering(report: ValidationReport, project: ProjectDocument): void {
  const details: string[] = []
  const scopes: Array<{ name: string; rules: InteractionRule[] }> = [
    { name: '全局', rules: project.globalInteractions },
    ...project.scenes.map((scene) => ({ name: `场景 ${scene.name}`, rules: scene.interactions })),
  ]

  scopes.forEach(({ name, rules }) => {
    const ruleIds = new Set<string>()
    const actionIds = new Set<string>()
    rules.forEach((rule) => {
      if (ruleIds.has(rule.id)) details.push(`${name}重复规则 ID ${rule.id}`)
      ruleIds.add(rule.id)
      if (rule.actions.length === 0) details.push(`${name}规则 ${rule.id}没有动作`)
      rule.actions.forEach((step, index) => {
        if (actionIds.has(step.id)) details.push(`${name}重复动作 ID ${step.id}`)
        actionIds.add(step.id)
        if (index === 0 && step.start !== 'after-previous') {
          details.push(`${name}规则 ${rule.id}的首动作必须 after-previous`)
        }
        if (isTerminalNavigationAction(step.action)) {
          if (index !== rule.actions.length - 1) {
            details.push(`${name}规则 ${rule.id}的导航动作不在末尾`)
          }
          if (step.start !== 'after-previous') {
            details.push(`${name}规则 ${rule.id}的导航动作未独立成组`)
          }
        }
      })
    })
  })

  const controllerIds = new Set<string>()
  project.globalLayer.forEach(({ node }) => {
    if (node.type !== 'teacher-controller') return
    node.buttons.forEach((button) => {
      if (controllerIds.has(button.id)) details.push(`教师控制器重复按钮 ID ${button.id}`)
      controllerIds.add(button.id)
    })
  })

  report.metrics.interactionRuleCount = allRules(project).length
  addCheck(report, {
    id: 'interactions.ids-and-navigation-order',
    title: '规则 ID 与导航动作顺序',
    status: details.length === 0 ? 'passed' : 'failed',
    summary: details.length === 0
      ? '规则/动作 ID 在各作用域唯一，导航均位于末尾独立动作组'
      : `发现 ${details.length} 项规则编排问题`,
    details,
    metrics: { ruleCount: allRules(project).length },
  })
}

function validateProjectEnvelope(report: ValidationReport, project: ProjectDocument): void {
  const details: string[] = []
  if (!Array.isArray(project.globalLayer) || project.globalLayer.length === 0) {
    details.push('globalLayer 必须包含至少一个全局元素')
  }
  if (!project.globalLayer.some(({ node }) => node.type === 'teacher-controller')) {
    details.push('globalLayer 缺少画布教师控制器')
  }
  if (!Array.isArray(project.globalInteractions)) details.push('globalInteractions 不是数组')
  if (!project.media?.audio) details.push('缺少 media.audio')
  if (project.playback.controls !== 'canvas') details.push('playback.controls 应为 canvas')
  if (typeof project.playback.keyboardNavigation !== 'boolean') {
    details.push('playback.keyboardNavigation 必须显式设定')
  }
  const channels = project.media?.audio?.channelVolumes
  for (const channel of ['music', 'narration', 'sfx', 'ui', 'video'] as const) {
    if (!channels || typeof channels[channel] !== 'number') {
      details.push(`media.audio.channelVolumes 缺少 ${channel}`)
    }
  }
  addCheck(report, {
    id: 'project.delivery-envelope',
    title: '全局层、媒体与播放语义',
    status: details.length === 0 ? 'passed' : 'failed',
    summary: details.length === 0
      ? 'globalLayer / globalInteractions / media.audio / playback 结构完整'
      : `发现 ${details.length} 项交付结构问题`,
    details,
    metrics: {
      globalLayerItems: project.globalLayer.length,
      globalInteractionRules: project.globalInteractions.length,
      soundDefinitions: Object.keys(project.media.audio.sounds).length,
    },
  })
}

function validateComponents(
  report: ValidationReport,
  project: ProjectDocument,
  components: Record<string, ComponentPackageData>,
): void {
  const details: string[] = []
  const nodes = componentNodes(project)
  const packageEntries = Object.entries(project.componentPackages)
  if (packageEntries.length === 0) details.push('工程未嵌入任何互动组件包')
  if (nodes.length === 0) details.push('工程未放置任何互动组件实例')

  packageEntries.forEach(([recordKey, meta]) => {
    const component = components[recordKey] ?? components[`${meta.packageId}@${meta.version}`]
    if (!component) {
      details.push(`组件包 ${recordKey} 未能解析`)
      return
    }
    const manifest = component.manifest
    if (manifest.schemaVersion !== 4) details.push(`${recordKey} schemaVersion 不是 4`)
    if (manifest.runtimeApiVersion !== 4) details.push(`${recordKey} runtimeApiVersion 不是 4`)
    if (manifest.schemaVersion === 4) {
      if (!['dom', 'phaser', 'hybrid'].includes(manifest.renderMode)) {
        details.push(`${recordKey} renderMode 无效`)
      }
      const usedScopes = new Set(nodes.filter((entry) => (
        entry.node.component.packageId === meta.packageId &&
        entry.node.component.version === meta.version
      )).map((entry) => entry.scope))
      usedScopes.forEach((scope) => {
        if (!manifest.supportedScopes.includes(scope)) {
          details.push(`${recordKey} 在 ${scope} 作用域使用，但 manifest 未声明支持`)
        }
      })
    }
    if (!/CoursewareComponent\s*\.\s*define\s*\(/.test(component.runtimeSource)) {
      details.push(`${recordKey} runtime.js 未通过 CoursewareComponent.define 登记`)
    }
    for (const lifecycleHook of ['prepareCapture', 'destroy']) {
      if (!component.runtimeSource.includes(lifecycleHook)) {
        details.push(`${recordKey} runtime.js 缺少 ${lifecycleHook} 生命周期实现`)
      }
    }
    if (Buffer.byteLength(component.runtimeSource, 'utf8') > 2 * 1024 * 1024) {
      details.push(`${recordKey} runtime.js 超过 2 MiB`)
    }
    if (!meta.thumbnailPath || !manifest.thumbnail || !component.files[manifest.thumbnail]) {
      details.push(`${recordKey} 缺少可用组件缩略图`)
    }
    if (manifest.id === 'com.alepha.physics.induction-lab') {
      const missingButtonTargets = INDUCTION_BUTTON_AUTHORING_KEYS.filter(
        (key) => !component.runtimeSource.includes(key),
      )
      if (!component.runtimeSource.includes('coursewareEditKey')) {
        details.push(`${recordKey} runtime.js 未启用 DOM 画布文字登记`)
      }
      if (missingButtonTargets.length > 0) {
        details.push(
          `${recordKey} 有 ${missingButtonTargets.length} 个按钮文字未登记画布编辑目标：${missingButtonTargets.join(', ')}`,
        )
      }
    }
  })

  report.metrics.componentPackageCount = packageEntries.length
  addCheck(report, {
    id: 'components.v4-runtime-api4',
    title: '组件包 V4 / Runtime API 4',
    status: details.length === 0 ? 'passed' : 'failed',
    summary: details.length === 0
      ? '嵌入组件均为 V4，作用域、登记、尺寸与缩略图边界完整'
      : `发现 ${details.length} 项组件问题`,
    details,
    metrics: {
      packageCount: packageEntries.length,
      instanceCount: nodes.length,
    },
  })
}

function validateEditableText(
  report: ValidationReport,
  project: ProjectDocument,
  components: Record<string, ComponentPackageData>,
): void {
  const details: string[] = []
  const samples: string[] = []
  let nativeCount = 0
  let componentCount = 0

  project.scenes.forEach((scene) => {
    const nativeTextNodes = scene.nodes.filter((node) => node.type === 'text')
    nativeCount += nativeTextNodes.length
    if (nativeTextNodes.length === 0) details.push(`${scene.name}没有原生可编辑文字节点`)
    nativeTextNodes.slice(0, 2).forEach((node) => samples.push(
      `${scene.name} / TextNode.${node.id}: ${node.text.slice(0, 48)}`,
    ))
    scene.presentation?.states.forEach((state) => {
      Object.entries(state.nodeOverrides).forEach(([nodeId, override]) => {
        const overrideRecord = override as Record<string, unknown>
        const overrideText = overrideRecord.text
        if (typeof overrideText === 'string' && overrideText.trim().length > 0) {
          nativeCount += 1
          if (samples.length < 16) samples.push(
            `${scene.name} / ${state.id} / TextNode.${nodeId}: ${overrideText.slice(0, 48)}`,
          )
        }
      })
    })
  })

  componentNodes(project).forEach(({ node, sceneId }) => {
    const metaEntry = Object.entries(project.componentPackages).find(([, meta]) => (
      meta.packageId === node.component.packageId && meta.version === node.component.version
    ))
    const component = metaEntry
      ? components[metaEntry[0]] ?? components[`${node.component.packageId}@${node.component.version}`]
      : undefined
    const manifestContent = component && isRecord(component.manifest.defaultProps.content)
      ? component.manifest.defaultProps.content
      : {}
    const instanceContent = isRecord(node.props.content) ? node.props.content : {}
    const resolvedLeaves = collectStringLeaves({ ...manifestContent, ...instanceContent }, 'content')
    componentCount += resolvedLeaves.length
    if (resolvedLeaves.length === 0) {
      details.push(`${sceneId ?? '全局'} / ${node.name}缺少 props.content 文案表`)
    }
    resolvedLeaves.slice(0, 3).forEach((leaf) => {
      if (samples.length < 24) samples.push(`${sceneId ?? '全局'} / ${leaf.key}: ${leaf.value.slice(0, 48)}`)
    })
  })

  const runtimes = [
    ...(project.globalRuntime ? [{ label: '全局运行时', runtime: project.globalRuntime }] : []),
    ...project.scenes.flatMap((scene) => scene.runtime
      ? [{ label: `${scene.name}运行时`, runtime: scene.runtime }]
      : []),
  ]
  runtimes.forEach(({ label, runtime }) => {
    const leaves = collectStringLeaves(runtime.content.values, 'content.values')
    if (runtime.enabled && leaves.length === 0) details.push(`${label}启用但 content.values 为空`)
    leaves.slice(0, 3).forEach((leaf) => {
      if (samples.length < 28) samples.push(`${label} / ${leaf.key}: ${leaf.value.slice(0, 48)}`)
    })
  })

  report.metrics.nativeEditableTextCount = nativeCount
  report.metrics.componentEditableTextCount = componentCount
  addCheck(report, {
    id: 'authoring.visible-text-editability',
    title: '人工可见文字可编辑性抽查',
    status: details.length === 0 ? 'passed' : 'failed',
    summary: details.length === 0
      ? '抽查文字均来自 TextNode、props.content 或 runtime.content.values'
      : `发现 ${details.length} 项文字编辑边界问题`,
    details: [...details, ...samples.map((sample) => `抽查：${sample}`)],
    metrics: {
      nativeTextEntries: nativeCount,
      componentContentEntries: componentCount,
      sampleCount: samples.length,
    },
  })
}

function validateStaticFallbacks(
  report: ValidationReport,
  project: ProjectDocument,
  components: Record<string, ComponentPackageData>,
): void {
  const details: string[] = []
  const runtimes = [
    ...(project.globalRuntime ? [{ label: '全局运行时', runtime: project.globalRuntime }] : []),
    ...project.scenes.flatMap((scene) => scene.runtime
      ? [{ label: `${scene.name}运行时`, runtime: scene.runtime }]
      : []),
  ]
  runtimes.forEach(({ label, runtime }) => {
    if (!runtime.enabled) return
    if (!runtime.staticFallback) {
      details.push(`${label}启用但缺少 staticFallback`)
      return
    }
    if (!project.assets[runtime.staticFallback.assetId]) {
      details.push(`${label}的 staticFallback 素材不存在`)
    }
  })
  Object.entries(project.componentPackages).forEach(([recordKey, meta]) => {
    const component = components[recordKey] ?? components[`${meta.packageId}@${meta.version}`]
    const thumbnail = component?.manifest.thumbnail
    if (!meta.thumbnailPath || !thumbnail || !component?.files[thumbnail]) {
      details.push(`组件 ${recordKey}缺少可嵌入的缩略图后备`)
    }
  })
  addCheck(report, {
    id: 'exports.static-fallbacks',
    title: '静态导出后备',
    status: details.length === 0 ? 'passed' : 'failed',
    summary: details.length === 0
      ? '启用的运行时均有 staticFallback，组件均有缩略图后备'
      : `发现 ${details.length} 项静态后备问题`,
    details,
  })
}

async function validateStandalone(
  report: ValidationReport,
  options: CliOptions,
  payload: ReturnType<typeof buildExportPayload>,
): Promise<void> {
  const candidates = options.htmlPath
    ? [options.htmlPath]
    : [
      path.join(
        path.dirname(options.lessonPath),
        `${path.basename(options.lessonPath, path.extname(options.lessonPath))}.html`,
      ),
      path.join(path.dirname(options.lessonPath), 'standalone.html'),
    ]
  let html: string | undefined
  let existingPath: string | undefined
  for (const candidate of candidates) {
    try {
      html = await fs.readFile(candidate, 'utf8')
      existingPath = candidate
      break
    } catch (error) {
      const code = isRecord(error) ? error.code : undefined
      if (code !== 'ENOENT') throw error
    }
  }

  let mode: StandaloneEvidence['mode'] = 'existing'
  if (html === undefined) {
    const playerBundle = await fs.readFile(PLAYER_BUNDLE_PATH, 'utf8')
    html = buildStandaloneHtml(payload, { playerBundle, lang: 'zh-CN' })
    mode = 'generated-in-memory'
    if (options.htmlPath) {
      await fs.mkdir(path.dirname(options.htmlPath), { recursive: true })
      await fs.writeFile(options.htmlPath, html, 'utf8')
      existingPath = options.htmlPath
      mode = 'existing'
    }
  }

  const containsPayload = html.includes('__H5_LESSON_PAYLOAD__')
  const offline = !/https?:\/\//i.test(html)
  const passed = html.length > 100_000 && containsPayload && offline
  report.standalone = {
    mode,
    ...(existingPath === undefined ? {} : { path: existingPath }),
    byteLength: Buffer.byteLength(html, 'utf8'),
    containsPayload,
    offline,
  }
  addCheck(report, {
    id: 'exports.standalone-html',
    title: '离线 Standalone HTML',
    status: passed ? 'passed' : 'failed',
    summary: passed
      ? mode === 'existing'
        ? '已有 Standalone HTML 包含发布数据且无远程 URL'
        : '已在内存中成功生成 Standalone HTML，包含发布数据且无远程 URL'
      : 'Standalone HTML 完整性或离线性检查失败',
    details: [
      `模式：${mode}`,
      `字节数：${Buffer.byteLength(html, 'utf8')}`,
      `包含发布载荷：${containsPayload}`,
      `无远程 URL：${offline}`,
    ],
  })
}

function finishReport(report: ValidationReport): void {
  report.counts = { passed: 0, warning: 0, failed: 0 }
  report.checks.forEach((check) => {
    report.counts[check.status] += 1
  })
  report.result = report.counts.failed === 0 ? 'passed' : 'failed'
}

async function writeAndPrintReport(report: ValidationReport, reportPath: string): Promise<void> {
  finishReport(report)
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  const heading = report.result === 'passed' ? '验收通过' : '验收失败'
  const metrics = report.metrics
  console.log(`${heading}：${path.basename(report.target)}`)
  console.log(
    `检查 ${report.checks.length} 项 · 通过 ${report.counts.passed} · ` +
    `提醒 ${report.counts.warning} · 失败 ${report.counts.failed}`,
  )
  if (metrics.sceneCount !== undefined) {
    console.log(
      `课程 ${metrics.sceneCount} 幕 / ${metrics.stateCount ?? 0} 状态 / ` +
      `${metrics.interactionRuleCount ?? 0} 条规则 / ${metrics.componentPackageCount ?? 0} 个组件包`,
    )
  }
  if (report.health) {
    console.log(
      `工程健康：errors=${report.health.summary.error}, ` +
      `warnings=${report.health.summary.warning}, info=${report.health.summary.info}`,
    )
  }
  report.checks.filter((check) => check.status === 'failed').forEach((check) => {
    console.error(`失败·${check.title}：${check.summary}`)
    check.details.slice(0, 8).forEach((detail) => console.error(`  - ${detail}`))
  })
  console.log(`JSON 报告：${reportPath}`)
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2))
  if (!options) return
  const report = createReport(options.lessonPath)

  try {
    const lessonBytes = Uint8Array.from(await fs.readFile(options.lessonPath))
    addCheck(report, {
      id: 'archive.readable',
      title: '.h5lesson 归档可读',
      status: lessonBytes.byteLength > 0 ? 'passed' : 'failed',
      summary: `已读取 ${lessonBytes.byteLength} 字节`,
    })

    const rawFiles = unzipSync(lessonBytes)
    const rawProjectBytes = rawFiles['project.json']
    if (!rawProjectBytes) throw new Error('归档根目录缺少 project.json')
    const rawProject = JSON.parse(strFromU8(rawProjectBytes)) as unknown
    validateRawProjectShape(report, rawProject)

    const opened = openProjectArchive(lessonBytes)
    const project = projectDocumentSchema.parse(opened.project)
    addCheck(report, {
      id: 'project.schema',
      title: 'Project V8 Schema',
      status: project.schemaVersion === 8 ? 'passed' : 'failed',
      summary: `schemaVersion=${project.schemaVersion}，归档打开与 Schema 解析成功`,
    })

    const diagnostics = collectProjectHealth(project)
    const healthSummary = summarizeProjectHealth(diagnostics)
    report.health = { summary: healthSummary, diagnostics }
    addCheck(report, {
      id: 'project.health',
      title: '工程健康检查',
      status: healthSummary.error > 0
        ? 'failed'
        : healthSummary.warning > 0
          ? 'warning'
          : 'passed',
      summary: `errors=${healthSummary.error}, warnings=${healthSummary.warning}, info=${healthSummary.info}`,
      details: diagnostics.map((diagnostic) => (
        `${diagnostic.severity}/${diagnostic.code}: ${diagnostic.message}`
      )),
    })

    const components: Record<string, ComponentPackageData> = {}
    for (const [recordKey, meta] of Object.entries(project.componentPackages)) {
      const files = findPackageFiles(
        opened.componentFiles,
        recordKey,
        meta.packageId,
        meta.version,
      )
      if (!files) continue
      const parsed = parseComponentPackageFiles(files, {
        expectedId: meta.packageId,
        expectedVersion: meta.version,
      })
      components[recordKey] = parsed
      components[`${meta.packageId}@${meta.version}`] = parsed
    }

    validateSceneSpine(report, project)
    validatePresentationAndReachability(report, project)
    validateInteractionOrdering(report, project)
    validateProjectEnvelope(report, project)
    validateComponents(report, project, components)
    validateEditableText(report, project, components)
    validateStaticFallbacks(report, project, components)

    const payload = buildExportPayload({
      project,
      assetFiles: opened.assetFiles,
      components,
    })
    addCheck(report, {
      id: 'exports.payload',
      title: 'buildExportPayload',
      status: 'passed',
      summary: '发布载荷构建成功，工程素材与组件依赖完整',
      metrics: {
        exportedAssets: Object.keys(payload.assets).length,
        exportedComponents: Object.keys(payload.components).length,
      },
    })
    await validateStandalone(report, options, payload)
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    addCheck(report, {
      id: 'validator.fatal',
      title: '验收流程阻断',
      status: 'failed',
      summary: error instanceof Error ? error.message : String(error),
      details: [message],
    })
  }

  await writeAndPrintReport(report, options.reportPath)
  if (report.result === 'failed') process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error('电磁感应课件验收脚本失败', error)
  process.exitCode = 1
})
