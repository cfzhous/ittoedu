import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'fflate'
import { componentManifestSchema } from '../src/shared/componentSchema'
import { coursewareEvidenceManifestV1Schema } from '../src/shared/coursewareEvidence'
import { projectDocumentSchema } from '../src/shared/projectSchema'
import { collectProjectHealth, summarizeProjectHealth } from '../src/shared/projectHealth'
import { materializeScene } from '../src/shared/presentation'
import { importComponentPackage } from '../src/renderer/components/importComponentPackage'
import { openProjectArchive } from '../src/renderer/project/projectArchive'
import {
  BASE_LINKED_GRAPH_MODEL,
  VERIFIED_MATH_TRUTHS,
  deriveAreaTruth,
  deriveLinkedGraphSnapshot,
  quadraticMaximum,
} from '../examples/math-motion-function-lab/mathModel'

interface CheckResult {
  id: string
  status: 'passed' | 'failed'
  summary: string
  details: string[]
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDirectory, '..')
const outputDirectory = path.join(root, 'output', 'math-motion-course')
const lessonArchivePath = path.join(outputDirectory, '让运动变成函数-动点问题五步建模法.h5lesson')
const componentArchivePath = path.join(outputDirectory, 'motion-function-lab.h5component')
const standaloneHtmlPath = path.join(outputDirectory, '让运动变成函数-动点问题五步建模法.html')
const webPackagePath = path.join(outputDirectory, '让运动变成函数-动点问题五步建模法-web.zip')
const evidenceManifestPath = path.join(outputDirectory, 'evidence-manifest.json')
const reportPath = path.join(outputDirectory, 'validation-report.json')

const expectedScenes = [
  ['scene_prediction', 'prediction', ['prediction_open', 'prediction_locked'], 'prediction.locked'],
  ['scene_constraints', 'constraints', ['constraints_attempt', 'constraints_repair', 'constraints_complete'], 'constraints.completed'],
  ['scene_model', 'model', ['model_attempt', 'model_repair', 'model_complete'], 'model.completed'],
  ['scene_linked_graph', 'linked-graph', ['linked_explore', 'linked_proved'], 'linked.mastered'],
  ['scene_domain', 'domain', ['domain_attempt', 'domain_repair', 'domain_complete'], 'domain.completed'],
  ['scene_transfer', 'transfer', ['transfer_attempt', 'transfer_hint', 'transfer_complete'], 'transfer.completed'],
  ['scene_summary', 'summary', ['summary_attempt', 'summary_complete'], 'summary.completed'],
] as const

function check(id: string, condition: boolean, summary: string, details: string[] = []): CheckResult {
  return { id, status: condition ? 'passed' : 'failed', summary, details }
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9
}

function hasRemoteReference(source: string): boolean {
  return /<(?:script|img|audio|video|source|link)\b[^>]+(?:src|href)=["']https?:\/\//i.test(source)
    || /\b(?:fetch|WebSocket|EventSource)\s*\(\s*["']https?:\/\//i.test(source)
}

async function main(): Promise<void> {
  const results: CheckResult[] = []
  const [lessonBytes, componentBytes, html, webBytes, evidenceText] = await Promise.all([
    fs.readFile(lessonArchivePath),
    fs.readFile(componentArchivePath),
    fs.readFile(standaloneHtmlPath, 'utf8'),
    fs.readFile(webPackagePath),
    fs.readFile(evidenceManifestPath, 'utf8'),
  ])

  const component = importComponentPackage(componentBytes)
  const manifest = componentManifestSchema.parse(component.manifest)
  const runtimeSource = strFromU8(component.files[manifest.entry]!)
  results.push(check(
    'component.protocol',
    manifest.id === 'com.ittoedu.math.motion-function-lab'
      && manifest.schemaVersion === 4
      && manifest.runtimeApiVersion === 4
      && manifest.renderMode === 'dom'
      && manifest.supportedScopes.includes('scene'),
    '课程专用组件使用 Component API 4 DOM/scene 协议',
  ))
  const editor = 'editor' in manifest ? manifest.editor : undefined
  const modeOptions = editor?.properties
    .find((property) => property.key === 'mode' && property.type === 'select')
  const optionValues = modeOptions?.type === 'select'
    ? modeOptions.options.map((option) => option.value)
    : []
  results.push(check(
    'component.seven-modes',
    expectedScenes.every(([, mode]) => optionValues.includes(mode)),
    '组件公开七种课程模式',
    optionValues,
  ))
  const lifecycleNames = ['setMode', 'resize', 'updateProps', 'setVisible', 'suspend', 'resume', 'prepareCapture', 'destroy']
  results.push(check(
    'component.lifecycle',
    lifecycleNames.every((name) => runtimeSource.includes(`${name}(`)),
    '组件运行时包含完整生命周期钩子',
    lifecycleNames.filter((name) => !runtimeSource.includes(`${name}(`)),
  ))
  results.push(check(
    'component.accessibility',
    runtimeSource.includes('aria-live')
      && runtimeSource.includes('aria-valuetext')
      && runtimeSource.includes('select')
      && runtimeSource.includes('preventScroll'),
    '拖动、结构化作答和焦点恢复具备键盘与报读语义',
  ))
  results.push(check(
    'component.course-state-boundary',
    ['mathMotion.prediction', 'mathMotion.completedBeats', 'mathMotion.hintCount'].every((key) => runtimeSource.includes(key))
      && !runtimeSource.includes('studentId')
      && !runtimeSource.includes('score'),
    'courseState 只记录预测、完成节拍和提示次数',
  ))
  results.push(check(
    'component.offline',
    !/(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\()[^\n]{0,120}https?:\/\//i.test(runtimeSource)
      && !/\brequire\s*\(/.test(runtimeSource),
    '组件运行时无远程请求与 CommonJS 依赖',
  ))

  const baseFrames = [0, 2, 4].map((t) => deriveLinkedGraphSnapshot(BASE_LINKED_GRAPH_MODEL, t))
  results.push(check(
    'math.base-keyframes',
    close(baseFrames[0]!.area, 0)
      && close(baseFrames[1]!.ap, 4)
      && close(baseFrames[1]!.bq, 3)
      && close(baseFrames[1]!.area, 6)
      && close(baseFrames[2]!.area, 0),
    '母题 t=0,2,4 的位置与面积正确',
    baseFrames.map((frame) => JSON.stringify(frame)),
  ))
  const maximums = [
    ['base', deriveAreaTruth(BASE_LINKED_GRAPH_MODEL), 2, 6],
    ['domain', VERIFIED_MATH_TRUTHS.domainVariant, 4, 16],
    ['transfer', VERIFIED_MATH_TRUTHS.transfer, 4, 12],
  ] as const
  maximums.forEach(([id, truth, input, value]) => {
    const maximum = quadraticMaximum(truth)
    results.push(check(
      `math.${id}`,
      close(maximum.input, input) && close(maximum.value, value),
      `${id} 最大值为 ${value} @ ${input}`,
      [JSON.stringify(maximum)],
    ))
  })

  const reopened = openProjectArchive(lessonBytes)
  const project = projectDocumentSchema.parse(reopened.project)
  const health = summarizeProjectHealth(collectProjectHealth(project))
  results.push(check(
    'project.schema-health',
    project.schemaVersion === 8 && health.error === 0,
    `Project V8 工程健康检查 errors=${health.error}`,
  ))
  results.push(check(
    'project.seven-scenes',
    project.scenes.length === expectedScenes.length
      && project.scenes.every((scene, index) => scene.id === expectedScenes[index]?.[0]),
    '七幕顺序与稳定场景 ID 正确',
    project.scenes.map((scene) => scene.id),
  ))

  const allNodeIds: string[] = []
  let allStateMappingsReachable = true
  let allNextButtonsGated = true
  let allContentRegistered = true
  const stressBaselines = new Map<string, string>()
  project.scenes.forEach((scene, index) => {
    const expected = expectedScenes[index]!
    const [, expectedMode, expectedStateIds, completedEvent] = expected
    const stateIds = scene.presentation?.states.map((state) => state.id) ?? []
    results.push(check(
      `project.states.${scene.id}`,
      scene.presentation?.initialStateId === expectedStateIds[0]
        && scene.presentation?.thumbnailStateId === expectedStateIds.at(-1)
        && stateIds.join('|') === expectedStateIds.join('|'),
      `${scene.id} 的初态、修复态与完成态正确`,
      stateIds,
    ))
    const components = scene.nodes.filter((node) => node.type === 'external-component')
    const courseComponent = components[0]
    if (components.length !== 1 || courseComponent?.props.mode !== expectedMode) allStateMappingsReachable = false
    if (courseComponent?.type === 'external-component') {
      const content = courseComponent.props.content
      if (!content || typeof content !== 'object' || Object.values(content).some((value) => typeof value !== 'string')) {
        allContentRegistered = false
      }
    }
    const completedRule = scene.interactions.find(
      (rule) => rule.trigger.type === 'component.event' && rule.trigger.eventName === completedEvent,
    )
    const completedStateId = expectedStateIds.at(-1)!
    if (!completedRule?.actions.some(
      (step) => step.action.type === 'presentation.set' && step.action.stateId === completedStateId,
    )) allStateMappingsReachable = false
    const initial = materializeScene(scene, expectedStateIds[0])
    const completed = materializeScene(scene, completedStateId)
    if (index < expectedScenes.length - 1) {
      const initialComponent = initial.nodes.find((node) => node.type === 'external-component')
      const completedComponent = completed.nodes.find((node) => node.type === 'external-component')
      const navigationRule = scene.interactions.find(
        (rule) => rule.trigger.type === 'component.event'
          && rule.trigger.eventName === 'navigation.next',
      )
      const conditions = navigationRule?.conditions
        .filter((condition) => condition.type === 'presentation.in')
        .flatMap((condition) => condition.type === 'presentation.in' ? condition.stateIds : []) ?? []
      if (
        initialComponent?.type !== 'external-component'
        || completedComponent?.type !== 'external-component'
        || typeof completedComponent.props.content !== 'object'
        || (completedComponent.props.content as Record<string, unknown>).nextLabel === undefined
        || initialComponent.props.phase === completedComponent.props.phase
        || !conditions.includes(completedStateId)
        || !navigationRule?.actions.some((step) => step.action.type === 'scene.next')
      ) allNextButtonsGated = false
    }
    expectedStateIds.forEach((stateId) => {
      stressBaselines.set(`${scene.id}:${stateId}`, JSON.stringify(materializeScene(scene, stateId)))
    })
    scene.nodes.forEach((node) => allNodeIds.push(node.id))
  })
  results.push(check('project.event-reachability', allStateMappingsReachable, '七幕完成事件均可达各自完成态'))
  results.push(check('project.next-gates', allNextButtonsGated, '前六幕下一幕按钮由完成态显现，并通过组件事件声明式进入下一幕'))
  results.push(check('project.visible-content', allContentRegistered, '组件实例的人工可见文案全部登记在 props.content'))
  results.push(check('project.unique-node-ids', new Set(allNodeIds).size === allNodeIds.length, '七幕节点 ID 全局唯一'))
  results.push(check(
    'project.playback-policy',
    project.playback.controls === 'canvas'
      && project.playback.keyboardNavigation === false
      && project.globalLayer.some((item) => item.node.type === 'teacher-controller'
        && item.node.buttons.map((button) => button.action.type).join('|') === 'scene.previous|scene.replay|course.restart|player.fullscreen.toggle'),
    '关闭键盘翻页，折叠控制器仅保留返回、重播、重开和全屏',
  ))
  let stressStable = true
  for (let round = 0; round < 25 && stressStable; round += 1) {
    for (const scene of project.scenes) {
      for (const state of scene.presentation?.states ?? []) {
        if (JSON.stringify(materializeScene(scene, state.id)) !== stressBaselines.get(`${scene.id}:${state.id}`)) {
          stressStable = false
          break
        }
      }
    }
  }
  results.push(check('project.state-stress', stressStable, '25 轮七幕全部稳定状态物化保持确定性'))

  results.push(check('export.standalone-offline', !hasRemoteReference(html), '单 HTML 无远程资源与网络调用'))
  const webFiles = unzipSync(webBytes)
  const webText = Object.entries(webFiles)
    .filter(([name]) => /\.(?:html|js|json|css)$/i.test(name))
    .map(([, bytes]) => strFromU8(bytes))
    .join('\n')
  results.push(check(
    'export.web-package',
    Boolean(webFiles['index.html'])
      && Boolean(webFiles['player/player.iife.js'])
      && Boolean(webFiles['course-data.js'])
      && !hasRemoteReference(webText),
    '网页包结构完整且无远程资源',
    Object.keys(webFiles),
  ))
  results.push(check(
    'export.embedded-component',
    Object.keys(reopened.componentFiles).length === 1,
    '归档重开保留唯一课程专用组件包',
  ))

  const evidence = coursewareEvidenceManifestV1Schema.parse(JSON.parse(evidenceText) as unknown)
  results.push(check(
    'evidence.automation-policy',
    evidence.generatedBy === 'automation' && evidence.result.status !== 'accepted',
    `自动证据结果保持 ${evidence.result.status}`,
  ))
  results.push(check(
    'evidence.pipeline',
    evidence.pipeline.status === 'passed' && evidence.pipeline.reports.every((report) => report.passed),
    '证据清单记录的管线报告全部通过',
  ))

  const failed = results.filter((result) => result.status === 'failed')
  const report = {
    generatedAt: new Date().toISOString(),
    scope: 'seven-scene-course',
    summary: {
      passed: results.length - failed.length,
      failed: failed.length,
      pipelineStatus: failed.length === 0 ? 'passed' : 'failed',
      outcomeStatus: evidence.result.status,
    },
    results,
  }
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  if (failed.length > 0) throw new Error(`七幕整课验证失败：${failed.map((result) => result.id).join(', ')}`)
  console.log(`七幕整课验证通过：${results.length} 项`)
  console.log(`验证报告：${reportPath}`)
  console.log(`管线状态：passed；结果状态：${evidence.result.status}`)
}

main().catch((error: unknown) => {
  console.error('验证动点问题七幕整课失败', error)
  process.exitCode = 1
})
