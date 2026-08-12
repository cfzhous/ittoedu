import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8 } from 'fflate'
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
  evaluateQuadratic,
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
const outputDirectory = path.join(root, 'output', 'math-motion-sample')
const lessonArchivePath = path.join(outputDirectory, '让运动变成函数-核心联动样片.h5lesson')
const componentArchivePath = path.join(outputDirectory, 'motion-function-lab.h5component')
const standaloneHtmlPath = path.join(outputDirectory, '让运动变成函数-核心联动样片.html')
const evidenceManifestPath = path.join(outputDirectory, 'evidence-manifest.json')
const reportPath = path.join(outputDirectory, 'validation-report.json')

function check(id: string, condition: boolean, summary: string, details: string[] = []): CheckResult {
  return { id, status: condition ? 'passed' : 'failed', summary, details }
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9
}

async function main(): Promise<void> {
  const results: CheckResult[] = []
  const [lessonBytes, componentBytes, html, evidenceText] = await Promise.all([
    fs.readFile(lessonArchivePath),
    fs.readFile(componentArchivePath),
    fs.readFile(standaloneHtmlPath, 'utf8'),
    fs.readFile(evidenceManifestPath, 'utf8'),
  ])
  const component = importComponentPackage(componentBytes)
  const manifest = componentManifestSchema.parse(component.manifest)
  const runtimeSource = strFromU8(component.files[manifest.entry]!)
  results.push(check(
    'component.protocol',
    manifest.id === 'com.ittoedu.math.motion-function-lab' &&
      manifest.schemaVersion === 4 &&
      manifest.runtimeApiVersion === 4 &&
      manifest.renderMode === 'dom' &&
      manifest.supportedScopes.includes('scene'),
    '课程专用组件使用 Component API 4 DOM/scene 协议',
  ))
  const defaultProps = manifest.defaultProps as Record<string, unknown>
  results.push(check(
    'component.props-contract',
    ['mode', 'phase', 'model', 'content', 'palette', 'reducedMotion'].every(
      (key) => Object.prototype.hasOwnProperty.call(defaultProps, key),
    ),
    '组件公开 props 合同完整',
    Object.keys(defaultProps),
  ))
  const lifecycleNames = [
    'setMode',
    'resize',
    'updateProps',
    'setVisible',
    'suspend',
    'resume',
    'prepareCapture',
    'destroy',
  ]
  results.push(check(
    'component.lifecycle',
    lifecycleNames.every((name) => runtimeSource.includes(`${name}(`)),
    '组件运行时包含完整生命周期钩子',
    lifecycleNames.filter((name) => !runtimeSource.includes(`${name}(`)),
  ))
  results.push(check(
    'component.accessibility',
    runtimeSource.includes('aria-live') &&
      runtimeSource.includes('aria-valuetext') &&
      runtimeSource.includes('createElement("input")'),
    '组件包含原生 range、动态数值反馈与 aria-live',
  ))
  results.push(check(
    'component.offline',
    !/(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\()[^\n]{0,120}https?:\/\//i.test(runtimeSource) &&
      !/\brequire\s*\(/.test(runtimeSource),
    '组件运行时无远程请求与 CommonJS 依赖',
  ))

  const baseTruth = deriveAreaTruth(BASE_LINKED_GRAPH_MODEL)
  const baseFrames = [0, 2, 4].map((t) => deriveLinkedGraphSnapshot(BASE_LINKED_GRAPH_MODEL, t))
  results.push(check(
    'math.base-keyframes',
    close(baseFrames[0]!.area, 0) &&
      close(baseFrames[1]!.ap, 4) &&
      close(baseFrames[1]!.bq, 3) &&
      close(baseFrames[1]!.area, 6) &&
      close(baseFrames[2]!.area, 0),
    '母题 t=0,2,4 的位置与面积正确',
    baseFrames.map((frame) => JSON.stringify(frame)),
  ))
  const expectedMaximums = [
    ['base', VERIFIED_MATH_TRUTHS.base, 2, 6],
    ['domainVariant', VERIFIED_MATH_TRUTHS.domainVariant, 4, 16],
    ['transfer', VERIFIED_MATH_TRUTHS.transfer, 4, 12],
  ] as const
  for (const [name, truth, expectedInput, expectedValue] of expectedMaximums) {
    const maximum = quadraticMaximum(truth)
    results.push(check(
      `math.${name}`,
      close(maximum.input, expectedInput) &&
        close(maximum.value, expectedValue) &&
        close(evaluateQuadratic(truth, maximum.input), expectedValue),
      `${name} 最大值为 ${expectedValue} @ ${expectedInput}`,
      [JSON.stringify(maximum)],
    ))
  }
  results.push(check(
    'math.single-source',
    close(baseTruth.linear, VERIFIED_MATH_TRUTHS.base.linear) &&
      close(baseTruth.quadratic, VERIFIED_MATH_TRUTHS.base.quadratic),
    '几何数值常量推导出的函数与权威母题一致',
  ))

  const reopened = openProjectArchive(lessonBytes)
  const project = projectDocumentSchema.parse(reopened.project)
  const health = summarizeProjectHealth(collectProjectHealth(project))
  results.push(check(
    'project.schema-health',
    project.schemaVersion === 8 && health.error === 0,
    `Project V8 工程健康检查 errors=${health.error}`,
  ))
  results.push(check(
    'project.scope',
    project.scenes.length === 1 && project.scenes[0]?.id === 'scene_linked_graph',
    '阶段门禁只实现一个核心联动场景',
  ))
  const scene = project.scenes[0]!
  const presentation = scene.presentation!
  results.push(check(
    'project.states',
    presentation.initialStateId === 'linked_explore' &&
      presentation.thumbnailStateId === 'linked_proved' &&
      presentation.states.map((state) => state.id).join(',') === 'linked_explore,linked_proved',
    '探索初态与完成缩略图状态命名正确',
  ))
  const eventRule = scene.interactions.find((rule) => rule.trigger.type === 'component.event')
  results.push(check(
    'project.event-reachability',
    eventRule?.trigger.type === 'component.event' &&
      eventRule.trigger.eventName === 'linked.mastered' &&
      eventRule.actions.some((step) => step.action.type === 'presentation.set' && step.action.stateId === 'linked_proved'),
    'linked.mastered 可达 linked_proved',
  ))
  results.push(check(
    'project.playback-policy',
    project.playback.controls === 'canvas' && project.playback.keyboardNavigation === false,
    '关闭键盘翻页并使用画布控制器',
  ))
  const nodeIds = scene.nodes.map((node) => node.id)
  results.push(check(
    'project.unique-ids',
    new Set(nodeIds).size === nodeIds.length,
    '场景节点 ID 唯一',
  ))
  const explored = materializeScene(scene, 'linked_explore')
  const proved = materializeScene(scene, 'linked_proved')
  const provedComponent = proved.nodes.find((node) => node.id === 'linked_graph_component')
  results.push(check(
    'project.state-materialization',
    provedComponent?.type === 'external-component' && provedComponent.props.phase === 'proved',
    '完成态正确覆盖组件 phase',
  ))
  let stressStable = true
  const exploredJson = JSON.stringify(explored)
  const provedJson = JSON.stringify(proved)
  for (let index = 0; index < 25; index += 1) {
    if (
      JSON.stringify(materializeScene(scene, 'linked_explore')) !== exploredJson ||
      JSON.stringify(materializeScene(scene, 'linked_proved')) !== provedJson
    ) {
      stressStable = false
      break
    }
  }
  results.push(check(
    'project.state-stress',
    stressStable,
    '25 轮探索/完成态物化保持确定性',
  ))

  results.push(check(
    'export.standalone-offline',
    !/<(?:script|img|audio|video|source|link)\b[^>]+(?:src|href)=["']https?:\/\//i.test(html) &&
      !/\b(?:fetch|WebSocket|EventSource)\s*\(\s*["']https?:\/\//i.test(html),
    '单 HTML 无远程资源与网络调用',
  ))
  results.push(check(
    'export.embedded-component',
    Object.keys(reopened.componentFiles).length === 1,
    '归档重开保留唯一组件包',
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
    scope: 'core-sample-only',
    summary: {
      passed: results.length - failed.length,
      failed: failed.length,
      pipelineStatus: failed.length === 0 ? 'passed' : 'failed',
      outcomeStatus: evidence.result.status,
    },
    results,
  }
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  if (failed.length > 0) {
    throw new Error(`核心样片验证失败：${failed.map((result) => result.id).join(', ')}`)
  }
  console.log(`核心样片验证通过：${results.length} 项`)
  console.log(`验证报告：${reportPath}`)
  console.log(`管线状态：passed；结果状态：${evidence.result.status}`)
}

main().catch((error: unknown) => {
  console.error('验证动点问题核心样片失败', error)
  process.exitCode = 1
})
