import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { build as viteBuild } from 'vite'
import { componentManifestSchema } from '../src/shared/componentSchema'
import type { ComponentManifest, ComponentPackageData } from '../src/shared/componentTypes'
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
import { createProjectArchive, openProjectArchive } from '../src/renderer/project/projectArchive'
import { buildExportPayload } from '../src/renderer/export/buildExportPayload'
import { buildStandaloneHtml } from '../src/renderer/export/buildStandaloneHtml'
import { buildWebPackage } from '../src/renderer/export/buildWebPackage'
import {
  BASE_LINKED_GRAPH_MODEL,
  VERIFIED_MATH_TRUTHS,
  deriveAreaTruth,
  deriveLinkedGraphSnapshot,
  quadraticMaximum,
} from '../examples/math-motion-function-lab/mathModel'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDirectory, '..')
const componentDirectory = path.join(root, 'examples', 'math-motion-function-lab')
const componentEntryPath = path.join(componentDirectory, 'runtime.entry.ts')
const componentRuntimePath = path.join(componentDirectory, 'runtime.js')
const outputDirectory = path.join(root, 'output', 'math-motion-course')
const evidenceDirectory = path.join(outputDirectory, 'evidence')
const componentArchivePath = path.join(outputDirectory, 'motion-function-lab.h5component')
const lessonArchivePath = path.join(outputDirectory, '让运动变成函数-动点问题五步建模法.h5lesson')
const standaloneHtmlPath = path.join(outputDirectory, '让运动变成函数-动点问题五步建模法.html')
const webPackagePath = path.join(outputDirectory, '让运动变成函数-动点问题五步建模法-web.zip')
const projectJsonPath = path.join(outputDirectory, 'project.json')
const healthReportPath = path.join(outputDirectory, 'project-health.json')
const buildSummaryPath = path.join(outputDirectory, 'build-summary.json')
const evidenceManifestPath = path.join(outputDirectory, 'evidence-manifest.json')
const previewConfigPath = path.join(outputDirectory, 'preview-config.json')
const captureDirectory = path.join(outputDirectory, 'capture-pages')
const captureConfigPath = path.join(outputDirectory, 'capture-config.json')
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
  focus: '#0A53BE',
} as const

const courseModel = {
  base: BASE_LINKED_GRAPH_MODEL,
  domainVariant: {
    ...VERIFIED_MATH_TRUTHS.domainVariant,
    domain: [...VERIFIED_MATH_TRUTHS.domainVariant.domain] as [number, number],
  },
  transfer: {
    ...VERIFIED_MATH_TRUTHS.transfer,
    domain: [...VERIFIED_MATH_TRUTHS.transfer.domain] as [number, number],
  },
}

const sceneSpecs = [
  {
    id: 'scene_prediction',
    name: '01 · 预测',
    mode: 'prediction',
    states: ['prediction_open', 'prediction_locked'],
    event: 'prediction.locked',
  },
  {
    id: 'scene_constraints',
    name: '02 · 约束分类',
    mode: 'constraints',
    states: ['constraints_attempt', 'constraints_repair', 'constraints_complete'],
    repairEvent: 'constraints.repair',
    event: 'constraints.completed',
  },
  {
    id: 'scene_model',
    name: '03 · 函数建模',
    mode: 'model',
    states: ['model_attempt', 'model_repair', 'model_complete'],
    repairEvent: 'model.repair',
    event: 'model.completed',
  },
  {
    id: 'scene_linked_graph',
    name: '04 · 图式联动',
    mode: 'linked-graph',
    states: ['linked_explore', 'linked_proved'],
    event: 'linked.mastered',
  },
  {
    id: 'scene_domain',
    name: '05 · 定义域修复',
    mode: 'domain',
    states: ['domain_attempt', 'domain_repair', 'domain_complete'],
    repairEvent: 'domain.repair',
    event: 'domain.completed',
  },
  {
    id: 'scene_transfer',
    name: '06 · 同构迁移',
    mode: 'transfer',
    states: ['transfer_attempt', 'transfer_hint', 'transfer_complete'],
    repairEvent: 'transfer.repair',
    hintEvent: 'transfer.hint',
    event: 'transfer.completed',
  },
  {
    id: 'scene_summary',
    name: '07 · 方法总结',
    mode: 'summary',
    states: ['summary_attempt', 'summary_complete'],
    event: 'summary.completed',
  },
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function relativePath(target: string): string {
  return path.relative(root, target).replaceAll('\\', '/')
}

async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
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
    backgroundColor?: string
    backgroundOpacity?: number
    cornerRadius?: number
    padding?: number
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
      padding: options.padding ?? 0,
      overflow: 'shrink',
      backgroundColor: options.backgroundColor ?? '#000000',
      backgroundOpacity: options.backgroundOpacity ?? 0,
      cornerRadius: options.cornerRadius ?? 0,
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

function componentNode(
  manifest: ComponentManifest,
  id: string,
  mode: string,
  phase: string,
  content: Record<string, string>,
  x: number,
  y: number,
  width: number,
  height: number,
): ExternalComponentNode {
  const defaults = isRecord(manifest.defaultProps) ? manifest.defaultProps : {}
  const defaultPalette = isRecord(defaults.palette) ? defaults.palette : palette
  const node = createExternalComponentNode({
    id,
    name: `课程互动：${mode}`,
    x,
    y,
    width,
    height,
    component: { packageId: manifest.id, version: manifest.version },
    props: {
      mode,
      phase,
      model: courseModel,
      content,
      palette: defaultPalette,
      reducedMotion: false,
    },
  })
  node.playbackInitialVisibility = 'inherit'
  return node
}

function actionStep(id: string, action: InteractionRule['actions'][number]['action']) {
  return { id, start: 'after-previous' as const, delayMs: 0, action }
}

function componentStateRule(
  id: string,
  nodeId: string,
  eventName: string,
  fromStates: string[],
  targetStateId: string,
): InteractionRule {
  return {
    id,
    name: `${eventName} → ${targetStateId}`,
    enabled: true,
    trigger: { type: 'component.event', nodeId, eventName },
    conditions: [{ type: 'presentation.in', stateIds: fromStates }],
    actions: [actionStep(`${id}_set`, {
      type: 'presentation.set',
      stateId: targetStateId,
      transition: { duration: 180, ease: 'Sine.easeInOut' },
    })],
  }
}

function componentNextRule(id: string, nodeId: string, completeStateId: string): InteractionRule {
  return {
    id,
    name: '完成后进入下一幕',
    enabled: true,
    trigger: { type: 'component.event', nodeId, eventName: 'navigation.next' },
    conditions: [{ type: 'presentation.in', stateIds: [completeStateId] }],
    actions: [actionStep(`${id}_next`, { type: 'scene.next' })],
  }
}

const commonContent = {
  disabledHint: '编辑与静态捕获保留确定画面；请在试运行中操作。',
  suspendedHint: '本幕互动已暂停。',
  choosePlaceholder: '请选择…',
  submitLabel: '核对我的判断',
}

const predictionContent = {
  ...commonContent,
  ariaLabel: '动点问题最大值位置预测',
  kicker: '先留下直觉证据',
  predictionMark: '?',
  instruction: '不计算：目标面积最大时，动点更可能处在哪一段？',
  predictionContext: '两个动点同时出发：一个让底边变长，另一个让高变短。',
  choiceHeading: '把你的第一判断锁定在时间轴上',
  optionStart: '靠近起点',
  optionMiddle: '中间附近',
  optionEnd: '靠近终点',
  lockLabel: '锁定预测',
  selectionRequired: '先选择一个位置，再锁定预测。',
  initialStatus: '这里暂不判对错；稍后用函数图象回看这次预测。',
  completeStatus: '预测已保留。后续证据可能支持它，也可能迫使我们修正。',
  nextLabel: '进入约束分类 →',
}

const constraintsContent = {
  ...commonContent,
  ariaLabel: '动点问题约束分类任务',
  kicker: '读题不是摘数字，而是辨角色',
  instruction: '把题面信息分成常量、变量、范围和目标量。',
  sourceSpeedLabel: '已知速度',
  sourceSpeed: 'P: 2 m/s　Q: 1.5 m/s',
  sourceTimeLabel: '运动时间',
  sourceTime: 't',
  sourceBoundaryLabel: '同时停止条件',
  sourceBoundary: '0 ≤ t ≤ 4',
  sourceTargetLabel: '研究对象',
  sourceTarget: '△APQ 的面积 S(t)',
  classificationHeading: '为每条信息选择它在模型中的角色',
  categoryConstant: '常量',
  categoryVariable: '变量',
  categoryRange: '范围',
  categoryTarget: '目标量',
  itemSpeed: '2 与 1.5',
  itemTime: 't',
  itemDomain: '0 ≤ t ≤ 4',
  itemArea: 'S(t)',
  initialStatus: '先确认每个量在模型中做什么，再进入关系式。',
  repairStatus: '有信息被放错了角色：速度固定不等于线段固定，定义域也不是目标量。',
  completeStatus: '约束结构已厘清：常量决定变化率，变量驱动运动，范围限制可行位置。',
  nextLabel: '进入函数建模 →',
}

const modelContent = {
  ...commonContent,
  ariaLabel: '动点问题函数建模任务',
  kicker: '把运动关系组装成一个函数',
  slotAp: '底边 AP',
  slotBq: '高 BQ',
  slotDomain: '可行时间',
  slotArea: '三角形面积',
  apCorrect: 'AP = 2t',
  apPlus: 'AP = 2 + t',
  apReverse: 'AP = 8 − 2t',
  bqCorrect: 'BQ = 6 − 1.5t',
  bqForward: 'BQ = 1.5t',
  bqPlus: 'BQ = 6 + 1.5t',
  domainCorrect: '0 ≤ t ≤ 4',
  domainLong: '0 ≤ t ≤ 6',
  domainOpen: 't ≥ 0',
  areaCorrect: 'S = ½·AP·BQ',
  areaDouble: 'S = AP·BQ',
  areaSum: 'S = AP + BQ',
  previewHeading: '组装结果',
  previewPlaceholder: 'S(t) = ？',
  previewDomain: '定义域必须与运动同步',
  previewNote: '线段方向、面积系数和停止时刻共同决定函数。',
  initialStatus: '四个槽位都来自同一运动过程，不能各自猜一个熟悉公式。',
  repairStatus: '模型仍不自洽：检查线段是增长还是缩短、三角形是否漏乘 ½，以及 Q 何时到达端点。',
  completeStatus: '模型成立：S(t) = 6t − 1.5t²，且 0 ≤ t ≤ 4。',
  nextLabel: '进入图式联动 →',
}

const domainContent = {
  ...commonContent,
  ariaLabel: '定义域变式最大值修复任务',
  kicker: '顶点正确，不代表答案可行',
  instruction: '新函数的抛物线顶点在 t = 6，但运动只允许到 t = 4。最大值取在哪里？',
  domainPrompt: 'S(t) = 6t − 0.5t²，0 ≤ t ≤ 4。灰色虚线是完整抛物线，蓝色才是可行部分。',
  graphAriaLabel: '完整抛物线与零到四的可行区间对照图',
  feasibleDomainLabel: '可行区间：0 ≤ t ≤ 4',
  optionVertex: '取抛物线顶点：t = 6，S = 18',
  optionEndpoint: '比较可行端点：t = 4，S = 16',
  optionMidpoint: '仍取区间中点：t = 2，S = 10',
  conclusionTemplate: 'Smax = {value}，t = {input}',
  initialStatus: '先问“点是否可达”，再谈它是不是最高。',
  repairStatus: '这个点不满足运动范围。把视线从完整抛物线收回蓝色可行区间。',
  completeStatus: '定义域修复完成：区间外顶点不能作答，可行最大值为 16，发生在 t = 4。',
  nextLabel: '进入同构迁移 →',
}

const transferContent = {
  ...commonContent,
  ariaLabel: '动点面积函数同构迁移任务',
  kicker: '图形换了，结构没有换',
  instruction: '矩形宽为 x，高为 6 − 0.75x。选择面积函数与最大值结论。',
  geometryAriaLabel: '宽为 x、高为六减零点七五x的动态矩形示意图',
  xValueTemplate: 'x = {value}',
  yValueTemplate: 'y = {value}',
  lineRelationLabel: 'y = 6 − 0.75x',
  targetRegionLabel: '目标矩形',
  formulaSlot: '面积函数',
  resultSlot: '最大值',
  formulaCorrect: 'S(x) = x(6 − 0.75x)',
  formulaTriangle: 'S(x) = ½x(6 − 0.75x)',
  formulaLinear: 'S(x) = 6 − 0.75x',
  resultCorrect: 'x = 4，y = 3，Smax = 12',
  resultVertex: 'x = 8，y = 0，Smax = 0',
  resultEndpoint: 'x = 3，y = 3.75，Smax = 11.25',
  hintLabel: '显示结构提示',
  hintText: '先写“目标量 = 两个变化量的乘积”，再把 y = 6 − 0.75x 代入；最后检查顶点是否落在可行范围。',
  initialStatus: '不要按图形名称找旧题；寻找“一个量增、另一个量减”的同一结构。',
  repairFormulaStatus: '面积关系还没有对应目标区域：这是矩形，不需要乘 ½。',
  repairResultStatus: '函数已对，但最值位置仍需核对：顶点横坐标为 −b/2a。',
  completeStatus: '迁移完成：S(x) = 6x − 0.75x²，在 (x, y) = (4, 3) 时取最大值 12。',
  nextLabel: '整理五步方法 →',
}

const summaryContent = {
  ...commonContent,
  ariaLabel: '动点问题五步建模法总结任务',
  instruction: '把五个动作排成可迁移的建模顺序。',
  evidenceBaseLabel: '母题',
  evidenceBase: '6 @ t = 2',
  evidenceDomainLabel: '定义域变式',
  evidenceDomain: '16 @ t = 4',
  evidenceTransferLabel: '同构迁移',
  evidenceTransfer: '12 @ (4, 3)',
  'step.constraints': '约束',
  'step.variables': '变量',
  'step.relation': '关系',
  'step.domain': '范围',
  'step.interpret': '解释',
  emptySlot: '等待放入',
  undoLabel: '撤回一步',
  resetLabel: '重新排列',
  initialStatus: '顺序不是口诀装饰：前一步为后一步提供合法输入。',
  repairStatus: '顺序还不能形成闭环。先读约束，再定变量与关系；求出结果后仍要回到范围和情境解释。',
  completeStatus: '五步闭环：约束 → 变量 → 关系 → 范围 → 解释。先把运动变成函数，再把函数答案翻译回运动。',
  completionMark: '✓',
}

function buildPredictionScene(manifest: ComponentManifest): SceneDocument {
  const scene = createScene({ id: 'scene_prediction', name: '01 · 预测', backgroundColor: palette.paper })
  const componentId = 'prediction_component'
  scene.nodes = [
    textNode('prediction_number', '节拍编号', '01', 70, 38, 116, 110, { fontSize: 74, color: palette.blue, bold: true }),
    textNode('prediction_title', '本幕标题', '先别算，先猜它在哪里', 188, 48, 740, 54, { fontSize: 38, bold: true }),
    textNode('prediction_subtitle', '本幕说明', '把直觉锁定，稍后让图、式和位置共同检验。', 192, 103, 680, 32, { fontSize: 17, color: palette.muted }),
    textNode('prediction_label', '英文节拍标签', 'PREDICTION  /  BEFORE CALCULATION', 872, 62, 336, 28, { fontSize: 11, color: palette.blue, bold: true, align: 'right', letterSpacing: 1.1 }),
    componentNode(manifest, componentId, 'prediction', 'prediction_open', predictionContent, 70, 164, 1138, 424),
  ]
  scene.presentation = {
    initialStateId: 'prediction_open',
    thumbnailStateId: 'prediction_locked',
    states: [
      { id: 'prediction_open', name: '预测开放', nodeOverrides: {} },
      {
        id: 'prediction_locked',
        name: '预测已锁定',
        nodeOverrides: {
          [componentId]: { props: { phase: 'prediction_locked' } },
        },
      },
    ],
  }
  scene.interactions = [
    componentStateRule('prediction_lock', componentId, 'prediction.locked', ['prediction_open'], 'prediction_locked'),
    componentNextRule('prediction_continue', componentId, 'prediction_locked'),
  ]
  return scene
}

function buildConstraintsScene(manifest: ComponentManifest): SceneDocument {
  const scene = createScene({ id: 'scene_constraints', name: '02 · 约束分类', backgroundColor: palette.paper })
  const componentId = 'constraints_component'
  scene.nodes = [
    shapeNode('constraints_bar', '顶部短线', 70, 40, 64, 16, palette.red),
    textNode('constraints_number', '节拍编号', '02', 70, 58, 90, 52, { fontSize: 34, color: palette.blue, bold: true }),
    textNode('constraints_title', '本幕标题', '先分清每个量在做什么', 154, 42, 720, 58, { fontSize: 37, bold: true }),
    textNode('constraints_subtitle', '本幕说明', '数字不是模型；角色与边界才决定数字如何进入模型。', 158, 98, 760, 32, { fontSize: 17, color: palette.muted }),
    textNode('constraints_label', '英文节拍标签', 'CONSTRAINTS', 1040, 54, 168, 28, { fontSize: 12, color: palette.red, bold: true, align: 'right', letterSpacing: 1.4 }),
    componentNode(manifest, componentId, 'constraints', 'constraints_attempt', constraintsContent, 70, 154, 1138, 452),
  ]
  scene.presentation = {
    initialStateId: 'constraints_attempt',
    thumbnailStateId: 'constraints_complete',
    states: [
      { id: 'constraints_attempt', name: '首次分类', nodeOverrides: {} },
      { id: 'constraints_repair', name: '分类修复', nodeOverrides: { [componentId]: { props: { phase: 'constraints_repair' } } } },
      { id: 'constraints_complete', name: '分类完成', nodeOverrides: { [componentId]: { props: { phase: 'constraints_complete' } } } },
    ],
  }
  scene.interactions = [
    componentStateRule('constraints_repair', componentId, 'constraints.repair', ['constraints_attempt'], 'constraints_repair'),
    componentStateRule('constraints_complete', componentId, 'constraints.completed', ['constraints_attempt', 'constraints_repair'], 'constraints_complete'),
    componentNextRule('constraints_continue', componentId, 'constraints_complete'),
  ]
  return scene
}

function buildModelScene(manifest: ComponentManifest): SceneDocument {
  const scene = createScene({ id: 'scene_model', name: '03 · 函数建模', backgroundColor: palette.paper })
  const componentId = 'model_component'
  scene.nodes = [
    textNode('model_formula_ghost', '公式引导符', 'S(t)', 66, 34, 210, 82, { fontSize: 64, color: palette.red, bold: true }),
    textNode('model_title', '本幕标题', '让四个槽位只讲一个故事', 290, 48, 720, 52, { fontSize: 36, bold: true }),
    textNode('model_subtitle', '本幕说明', '线段方向、面积关系与运动范围必须彼此一致。', 294, 100, 680, 30, { fontSize: 17, color: palette.muted }),
    textNode('model_label', '英文节拍标签', 'MODEL ASSEMBLY  /  03', 972, 58, 236, 26, { fontSize: 11, color: palette.blue, bold: true, align: 'right', letterSpacing: 1.2 }),
    componentNode(manifest, componentId, 'model', 'model_attempt', modelContent, 70, 154, 1138, 452),
  ]
  scene.presentation = {
    initialStateId: 'model_attempt',
    thumbnailStateId: 'model_complete',
    states: [
      { id: 'model_attempt', name: '模型组装', nodeOverrides: {} },
      { id: 'model_repair', name: '模型修复', nodeOverrides: { [componentId]: { props: { phase: 'model_repair' } } } },
      { id: 'model_complete', name: '模型完成', nodeOverrides: { [componentId]: { props: { phase: 'model_complete' } } } },
    ],
  }
  scene.interactions = [
    componentStateRule('model_repair', componentId, 'model.repair', ['model_attempt'], 'model_repair'),
    componentStateRule('model_complete', componentId, 'model.completed', ['model_attempt', 'model_repair'], 'model_complete'),
    componentNextRule('model_continue', componentId, 'model_complete'),
  ]
  return scene
}

function buildLinkedScene(manifest: ComponentManifest): SceneDocument {
  const scene = createScene({ id: 'scene_linked_graph', name: '04 · 图式联动', backgroundColor: palette.paper })
  const defaults = isRecord(manifest.defaultProps) ? manifest.defaultProps : {}
  const linkedContent = {
    ...(isRecord(defaults.content)
      ? Object.fromEntries(Object.entries(defaults.content).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {}),
    nextLabel: '进入定义域变式 →',
  }
  const componentId = 'linked_graph_component'
  scene.nodes = [
    shapeNode('motion_rail_line', '学习路径竖线', 37, 38, 16, 568, palette.blue, { fillOpacity: 0.12, cornerRadius: 8 }),
    shapeNode('motion_rail_dot', '当前节拍圆点', 37, 34, 16, 16, palette.blue, { cornerRadius: 8 }),
    textNode('motion_rail_label', '纵向学习路径', '从运动到模型', 16, 62, 29, 176, { fontSize: 17, color: palette.blue, bold: true, writingMode: 'vertical-rl', align: 'center', letterSpacing: 2 }),
    textNode('motion_title', '课例标题', '让运动变成函数', 88, 38, 720, 58, { fontSize: 39, bold: true }),
    textNode('motion_subtitle', '操作提示', '拖动 t，让点的位置、面积表达式与函数图象在同一时刻对齐', 91, 98, 880, 34, { fontSize: 18, color: palette.muted }),
    textNode('motion_scene_label', '节拍标签', '图式联动  /  LINKED GRAPH', 936, 48, 288, 30, { fontSize: 12, color: palette.blue, bold: true, align: 'right', letterSpacing: 1.2 }),
    componentNode(manifest, componentId, 'linked-graph', 'linked_explore', linkedContent, 88, 154, 1136, 452),
    textNode('step_constraints', '方法步骤：约束', '约束', 90, 616, 92, 30, { fontSize: 15, color: palette.muted, align: 'center' }),
    textNode('step_variables', '方法步骤：变量', '变量', 196, 616, 92, 30, { fontSize: 15, color: palette.muted, align: 'center' }),
    textNode('step_relation', '方法步骤：关系', '关系', 302, 616, 92, 30, { fontSize: 15, color: palette.muted, align: 'center' }),
    shapeNode('step_domain_rule', '当前方法步骤底色', 414, 620, 80, 26, palette.blueSoft, { cornerRadius: 13 }),
    textNode('step_domain', '方法步骤：范围', '范围', 408, 616, 92, 30, { fontSize: 15, color: palette.blue, bold: true, align: 'center' }),
    textNode('step_interpret', '方法步骤：解释', '解释', 514, 616, 92, 30, { fontSize: 15, color: palette.muted, align: 'center' }),
  ]
  scene.presentation = {
    initialStateId: 'linked_explore',
    thumbnailStateId: 'linked_proved',
    states: [
      { id: 'linked_explore', name: '探索图式联动', nodeOverrides: {} },
      { id: 'linked_proved', name: '最大值已证明', nodeOverrides: { [componentId]: { props: { phase: 'proved' } } } },
    ],
  }
  scene.interactions = [
    componentStateRule('linked_complete', componentId, 'linked.mastered', ['linked_explore'], 'linked_proved'),
    componentNextRule('linked_continue', componentId, 'linked_proved'),
  ]
  return scene
}

function buildDomainScene(manifest: ComponentManifest): SceneDocument {
  const scene = createScene({ id: 'scene_domain', name: '05 · 定义域修复', backgroundColor: palette.paper })
  const componentId = 'domain_component'
  scene.nodes = [
    textNode('domain_label', '英文节拍标签', 'DOMAIN BEFORE VERTEX', 70, 48, 300, 28, { fontSize: 12, color: palette.red, bold: true, letterSpacing: 1.3 }),
    textNode('domain_title', '本幕标题', '最高点在区间外，怎么办？', 428, 40, 780, 58, { fontSize: 38, bold: true, align: 'right' }),
    textNode('domain_subtitle', '本幕说明', '不是所有解析式上的点，都是运动能够到达的点。', 478, 98, 730, 32, { fontSize: 17, color: palette.muted, align: 'right' }),
    shapeNode('domain_index', '节拍编号底色', 70, 91, 76, 42, palette.blueSoft, { cornerRadius: 21 }),
    textNode('domain_number', '节拍编号', '05', 70, 91, 76, 42, { fontSize: 20, color: palette.blue, bold: true, align: 'center' }),
    componentNode(manifest, componentId, 'domain', 'domain_attempt', domainContent, 70, 154, 1138, 452),
  ]
  scene.presentation = {
    initialStateId: 'domain_attempt',
    thumbnailStateId: 'domain_complete',
    states: [
      { id: 'domain_attempt', name: '判断可行点', nodeOverrides: {} },
      { id: 'domain_repair', name: '定义域修复', nodeOverrides: { [componentId]: { props: { phase: 'domain_repair' } } } },
      { id: 'domain_complete', name: '端点最值完成', nodeOverrides: { [componentId]: { props: { phase: 'domain_complete' } } } },
    ],
  }
  scene.interactions = [
    componentStateRule('domain_repair', componentId, 'domain.repair', ['domain_attempt'], 'domain_repair'),
    componentStateRule('domain_complete', componentId, 'domain.completed', ['domain_attempt', 'domain_repair'], 'domain_complete'),
    componentNextRule('domain_continue', componentId, 'domain_complete'),
  ]
  return scene
}

function buildTransferScene(manifest: ComponentManifest): SceneDocument {
  const scene = createScene({ id: 'scene_transfer', name: '06 · 同构迁移', backgroundColor: palette.paper })
  const componentId = 'transfer_component'
  scene.nodes = [
    textNode('transfer_number', '节拍编号', '06', 70, 38, 92, 80, { fontSize: 54, color: palette.red, bold: true }),
    shapeNode('transfer_arrow', '迁移箭头', 168, 70, 150, 16, palette.red),
    textNode('transfer_title', '本幕标题', '图形换了，能否看见同一个函数？', 338, 42, 776, 56, { fontSize: 36, bold: true }),
    textNode('transfer_subtitle', '本幕说明', '不要复述母题步骤；让“一个量增、另一个量减”的结构自己说话。', 340, 98, 790, 32, { fontSize: 17, color: palette.muted }),
    textNode('transfer_label', '英文节拍标签', 'TRANSFER', 1118, 52, 90, 26, { fontSize: 11, color: palette.blue, bold: true, align: 'right', letterSpacing: 1.2 }),
    componentNode(manifest, componentId, 'transfer', 'transfer_attempt', transferContent, 70, 154, 1138, 452),
  ]
  scene.presentation = {
    initialStateId: 'transfer_attempt',
    thumbnailStateId: 'transfer_complete',
    states: [
      { id: 'transfer_attempt', name: '独立迁移', nodeOverrides: {} },
      { id: 'transfer_hint', name: '结构提示', nodeOverrides: { [componentId]: { props: { phase: 'transfer_hint' } } } },
      { id: 'transfer_complete', name: '迁移完成', nodeOverrides: { [componentId]: { props: { phase: 'transfer_complete' } } } },
    ],
  }
  scene.interactions = [
    componentStateRule('transfer_repair_hint', componentId, 'transfer.repair', ['transfer_attempt'], 'transfer_hint'),
    componentStateRule('transfer_manual_hint', componentId, 'transfer.hint', ['transfer_attempt'], 'transfer_hint'),
    componentStateRule('transfer_complete', componentId, 'transfer.completed', ['transfer_attempt', 'transfer_hint'], 'transfer_complete'),
    componentNextRule('transfer_continue', componentId, 'transfer_complete'),
  ]
  return scene
}

function buildSummaryScene(manifest: ComponentManifest): SceneDocument {
  const scene = createScene({ id: 'scene_summary', name: '07 · 方法总结', backgroundColor: palette.paper })
  const componentId = 'summary_component'
  scene.nodes = [
    textNode('summary_label', '英文节拍标签', 'MODEL → METHOD', 70, 46, 220, 28, { fontSize: 12, color: palette.blue, bold: true, letterSpacing: 1.4 }),
    textNode('summary_title', '本幕标题', '把一道题，压缩成可迁移的方法', 210, 38, 860, 60, { fontSize: 38, bold: true, align: 'center' }),
    textNode('summary_subtitle', '本幕说明', '三组答案已经留下证据；现在整理产生这些答案的共同路径。', 250, 98, 780, 32, { fontSize: 17, color: palette.muted, align: 'center' }),
    textNode('summary_number', '节拍编号', '07', 1110, 40, 98, 62, { fontSize: 42, color: palette.red, bold: true, align: 'right' }),
    componentNode(manifest, componentId, 'summary', 'summary_attempt', summaryContent, 70, 154, 1138, 452),
    textNode('summary_closing', '结课语', '把运动变成函数，也把方法带走。', 360, 630, 560, 48, { fontSize: 20, color: palette.blue, bold: true, align: 'center', visible: false }),
  ]
  scene.presentation = {
    initialStateId: 'summary_attempt',
    thumbnailStateId: 'summary_complete',
    states: [
      { id: 'summary_attempt', name: '排列五步法', nodeOverrides: {} },
      { id: 'summary_complete', name: '方法闭环完成', nodeOverrides: { [componentId]: { props: { phase: 'summary_complete' } }, summary_closing: { visible: true } } },
    ],
  }
  scene.interactions = [
    componentStateRule('summary_complete', componentId, 'summary.completed', ['summary_attempt'], 'summary_complete'),
  ]
  return scene
}

function buildProject(
  manifest: ComponentManifest,
  componentKey: string,
  componentMetadata: ReturnType<typeof importComponentPackage>['metadata'],
): ProjectDocument {
  const project = createProject({
    id: 'project_math_motion_five_step_course',
    title: '让运动变成函数——动点问题的五步建模法',
    now: timestamp,
    idFactory: (() => {
      let value = 0
      return () => String(++value).padStart(3, '0')
    })(),
  })
  project.scenes = [
    buildPredictionScene(manifest),
    buildConstraintsScene(manifest),
    buildModelScene(manifest),
    buildLinkedScene(manifest),
    buildDomainScene(manifest),
    buildTransferScene(manifest),
    buildSummaryScene(manifest),
  ]
  project.componentPackages[componentKey] = componentMetadata
  project.globalInteractions = []
  project.media.audio = {
    defaultMuted: true,
    masterVolume: 1,
    channelVolumes: { music: 0, narration: 0, sfx: 0, ui: 0, video: 0 },
    sounds: {},
    narrationDucking: { enabled: false, musicVolume: 0, fadeMs: 0 },
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

function assertMathTruth(): void {
  const baseMaximum = quadraticMaximum(deriveAreaTruth(BASE_LINKED_GRAPH_MODEL))
  const domainMaximum = quadraticMaximum(VERIFIED_MATH_TRUTHS.domainVariant)
  const transferMaximum = quadraticMaximum(VERIFIED_MATH_TRUTHS.transfer)
  if (baseMaximum.input !== 2 || baseMaximum.value !== 6) throw new Error('母题最大值不正确')
  if (domainMaximum.input !== 4 || domainMaximum.value !== 16) throw new Error('定义域变式最大值不正确')
  if (transferMaximum.input !== 4 || transferMaximum.value !== 12) throw new Error('迁移题最大值不正确')
  const checkpoints = [0, 2, 4].map((t) => deriveLinkedGraphSnapshot(BASE_LINKED_GRAPH_MODEL, t).area)
  if (JSON.stringify(checkpoints) !== JSON.stringify([0, 6, 0])) throw new Error('母题关键时刻不正确')
}

function assertProject(project: ProjectDocument, manifest: ComponentManifest): void {
  if (project.schemaVersion !== 7) throw new Error('整课工程不是 Project V7')
  if (project.canvas.width !== 1280 || project.canvas.height !== 720) throw new Error('整课画布不是 1280×720')
  if (project.scenes.length !== 7) throw new Error(`整课场景数错误：${project.scenes.length}`)
  if (project.playback.controls !== 'canvas' || project.playback.keyboardNavigation) {
    throw new Error('整课必须使用画布控制器并关闭键盘翻页')
  }
  const allIds = new Set<string>()
  project.scenes.forEach((scene, index) => {
    const spec = sceneSpecs[index]
    if (!spec || scene.id !== spec.id) throw new Error(`第 ${index + 1} 幕 ID 不正确`)
    if (!scene.presentation) throw new Error(`${scene.id} 缺少 presentation`)
    const stateIds = scene.presentation.states.map((state) => state.id)
    if (JSON.stringify(stateIds) !== JSON.stringify([...spec.states])) {
      throw new Error(`${scene.id} 状态不完整：${stateIds.join(', ')}`)
    }
    if (scene.presentation.initialStateId !== spec.states[0]) throw new Error(`${scene.id} 初态不正确`)
    if (scene.presentation.thumbnailStateId !== spec.states.at(-1)) throw new Error(`${scene.id} 缩略图状态不正确`)
    const components = scene.nodes.filter((node): node is ExternalComponentNode => node.type === 'external-component')
    if (components.length !== 1 || components[0]?.component.packageId !== manifest.id) {
      throw new Error(`${scene.id} 必须只有一个课程专用组件实例`)
    }
    if (components[0]?.props.mode !== spec.mode) throw new Error(`${scene.id} 组件 mode 不正确`)
    const events = scene.interactions
      .filter((rule) => rule.trigger.type === 'component.event')
      .map((rule) => rule.trigger.type === 'component.event' ? rule.trigger.eventName : '')
    if (!events.includes(spec.event)) throw new Error(`${scene.id} 缺少完成事件 ${spec.event}`)
    if ('repairEvent' in spec && spec.repairEvent && !events.includes(spec.repairEvent)) {
      throw new Error(`${scene.id} 缺少修复事件 ${spec.repairEvent}`)
    }
    if ('hintEvent' in spec && spec.hintEvent && !events.includes(spec.hintEvent)) {
      throw new Error(`${scene.id} 缺少提示事件 ${spec.hintEvent}`)
    }
    scene.nodes.forEach((node) => {
      if (allIds.has(node.id)) throw new Error(`节点 ID 重复：${node.id}`)
      allIds.add(node.id)
    })
  })
}

function assertOfflineSource(source: string): void {
  const bytes = new TextEncoder().encode(source).byteLength
  if (bytes >= MAX_RUNTIME_BYTES) throw new Error(`组件运行时超过 2 MiB：${bytes}`)
  if (/(^|[;\n\r])\s*import\s*(?:[(\s{*]|["'])/m.test(source)) throw new Error('组件运行时包含 import')
  if (/(^|[;\n\r])\s*export\s+(?:default|const|let|var|function|class|\{|\*)/m.test(source)) throw new Error('组件运行时包含 export')
  if (/\brequire\s*\(/.test(source)) throw new Error('组件运行时包含 require')
  if (/(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\()[^\n]{0,120}https?:\/\//i.test(source)) {
    throw new Error('组件运行时包含远程网络请求')
  }
}

function validateRuntimeRegistration(source: string, manifest: ComponentManifest): void {
  let definition: unknown
  const api = { define(candidate: unknown) { definition = candidate } }
  const runtimeWindow = { CoursewareComponent: api }
  const execute = new Function('window', 'globalThis', 'self', 'CoursewareComponent', `"use strict";\n${source}`)
  execute(runtimeWindow, runtimeWindow, runtimeWindow, api)
  if (!isRecord(definition) || definition.id !== manifest.id || definition.runtimeApiVersion !== 4 || typeof definition.create !== 'function') {
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
      lib: { entry: componentEntryPath, name: 'MathMotionFunctionLab', formats: ['iife'], fileName: () => 'runtime.js' },
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
  if (manifest.thumbnail) files[manifest.thumbnail] = Uint8Array.from(await fs.readFile(path.join(componentDirectory, manifest.thumbnail)))
  for (const assetPath of Object.values(manifest.assets)) {
    files[assetPath] = Uint8Array.from(await fs.readFile(path.join(componentDirectory, assetPath)))
  }
  return files
}

function assertStandaloneOffline(html: string): void {
  if (/<(?:script|img|audio|video|source|link)\b[^>]+(?:src|href)=["']https?:\/\//i.test(html)) throw new Error('离线 HTML 中出现远程资源')
  if (/\b(?:fetch|WebSocket|EventSource)\s*\(\s*["']https?:\/\//i.test(html)) throw new Error('离线 HTML 中出现远程网络调用')
}

async function evidenceItem(
  id: string,
  kind: 'screenshot' | 'recording' | 'pptx-render' | 'comparison',
  filename: string,
  required: boolean,
  metadata: { sceneId?: string; stateId?: string; notes?: string } = {},
) {
  const filePath = path.join(evidenceDirectory, filename)
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

async function writeEvidenceManifest(runtimeBytes: number, healthPassed: boolean): Promise<void> {
  const artifactSources = [
    { id: 'course-lesson', kind: 'h5lesson' as const, filePath: lessonArchivePath },
    { id: 'course-html', kind: 'standalone-html' as const, filePath: standaloneHtmlPath },
    { id: 'course-web-package', kind: 'web-package' as const, filePath: webPackagePath },
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
    evidenceItem('prediction-initial-frame', 'screenshot', 'prediction-open.png', true, { sceneId: 'scene_prediction', stateId: 'prediction_open' }),
    evidenceItem('linked-proved-frame', 'screenshot', 'linked-proved.png', true, { sceneId: 'scene_linked_graph', stateId: 'linked_proved' }),
    evidenceItem('transfer-complete-frame', 'screenshot', 'transfer-complete.png', true, { sceneId: 'scene_transfer', stateId: 'transfer_complete' }),
    evidenceItem('course-interaction-recording', 'recording', 'course-core-path.webm', true, { notes: '核心联动 t=0→1→2→3→4 与完成证明帧' }),
    evidenceItem('pptx-render', 'pptx-render', 'pptx-render.png', true, { notes: '七页 PPTX 渲染审阅图' }),
    evidenceItem('visual-comparison', 'comparison', 'course-visual-comparison.png', true, { notes: '三张批准视觉参考与实际关键帧对照' }),
  ])
  const manifest = coursewareEvidenceManifestV1Schema.parse({
    schemaVersion: 1,
    experienceId: 'math-motion-five-step-course',
    experienceVersion: '0.2.0',
    scope: 'full-course',
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
        { id: 'offline-exports', path: relativePath(buildSummaryPath), passed: true },
      ],
    },
    result: {
      status: 'pending',
      notes: [
        '自动构建只确认管线，不代表七幕整课已经通过教学与视觉结果审阅。',
        '必须补齐关键截图、互动录屏与 PPTX 渲染证据后由批准人审阅。',
      ],
    },
  })
  await fs.writeFile(evidenceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function main(): Promise<void> {
  await fs.mkdir(outputDirectory, { recursive: true })
  await fs.mkdir(evidenceDirectory, { recursive: true })
  const manifest = componentManifestSchema.parse(JSON.parse(await fs.readFile(path.join(componentDirectory, 'manifest.json'), 'utf8')) as unknown)
  if (manifest.schemaVersion !== 4 || manifest.runtimeApiVersion !== 4 || manifest.renderMode !== 'dom' || !manifest.supportedScopes.includes('scene')) {
    throw new Error('动点函数组件必须是 Component API 4 DOM 场景组件')
  }
  assertMathTruth()
  const runtimeSource = await bundleRuntime()
  assertOfflineSource(runtimeSource)
  validateRuntimeRegistration(runtimeSource, manifest)
  const componentFiles = await buildComponentFiles(manifest, runtimeSource)
  const componentArchive = zipSync(componentFiles, { level: 7, mtime: reproducibleTimestamp })
  const component = importComponentPackage(componentArchive, { expectedId: manifest.id, expectedVersion: manifest.version })
  await fs.writeFile(componentArchivePath, componentArchive)

  const project = buildProject(manifest, component.key, component.metadata)
  assertProject(project, manifest)
  const diagnostics = collectProjectHealth(project)
  const health = summarizeProjectHealth(diagnostics)
  await fs.writeFile(healthReportPath, `${JSON.stringify({ summary: health, diagnostics }, null, 2)}\n`, 'utf8')
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
  const webPackage = buildWebPackage(payload, { playerBundle, lang: 'zh-CN' })
  await fs.writeFile(webPackagePath, webPackage)

  await fs.mkdir(captureDirectory, { recursive: true })
  const capturePages = reopenedProject.scenes.map((scene, index) => {
    const isolatedProject: ProjectDocument = {
      ...structuredClone(reopenedProject),
      id: `${reopenedProject.id}_capture_${scene.id}`,
      title: `${reopenedProject.title} · ${scene.name}`,
      scenes: [structuredClone(scene)],
      globalLayer: [],
      globalInteractions: [],
    }
    const isolatedPayload = buildExportPayload({ project: isolatedProject, assets: {}, components })
    const filename = `${String(index + 1).padStart(2, '0')}-${scene.id}.html`
    const componentNode = scene.nodes.find((node): node is ExternalComponentNode => node.type === 'external-component')
    if (!componentNode) throw new Error(`场景 ${scene.id} 缺少课程组件实例`)
    return {
      filename,
      html: buildStandaloneHtml(isolatedPayload, { playerBundle, lang: 'zh-CN' }),
      record: {
        index: index + 1,
        sceneId: scene.id,
        stateId: scene.presentation?.initialStateId ?? null,
        source: relativePath(path.join(captureDirectory, filename)),
        pageOutput: `evidence/pages/${String(index + 1).padStart(2, '0')}-${scene.id}.png`,
        component: {
          nodeId: componentNode.id,
          snapshotKey: `${scene.id}:${componentNode.id}`,
          output: `evidence/components/${String(index + 1).padStart(2, '0')}-${scene.id}.png`,
          bounds: {
            x: componentNode.x,
            y: componentNode.y,
            width: componentNode.width,
            height: componentNode.height,
          },
        },
      },
    }
  })
  await Promise.all(capturePages.map(({ filename, html: captureHtml }) =>
    fs.writeFile(path.join(captureDirectory, filename), captureHtml, 'utf8')))
  await fs.writeFile(captureConfigPath, `${JSON.stringify({
    viewport: reopenedProject.canvas,
    pages: capturePages.map(({ record }) => record),
  }, null, 2)}\n`, 'utf8')

  const previewConfig = {
    source: relativePath(standaloneHtmlPath),
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    keyFrames: [
      { sceneId: 'scene_prediction', stateId: 'prediction_open', output: 'evidence/prediction-open.png' },
      { sceneId: 'scene_linked_graph', stateId: 'linked_proved', output: 'evidence/linked-proved.png' },
      { sceneId: 'scene_transfer', stateId: 'transfer_complete', output: 'evidence/transfer-complete.png' },
    ],
  }
  await fs.writeFile(previewConfigPath, `${JSON.stringify(previewConfig, null, 2)}\n`, 'utf8')

  const runtimeBytes = new TextEncoder().encode(runtimeSource).byteLength
  const summary = {
    title: reopenedProject.title,
    scope: 'seven-scene-course',
    format: 'Project V7 / Component API 4 DOM',
    canvas: reopenedProject.canvas,
    sceneStates: Object.fromEntries(reopenedProject.scenes.map((scene) => [scene.id, scene.presentation?.states.map((state) => state.id) ?? []])),
    outputs: {
      lessonArchive: relativePath(lessonArchivePath),
      standaloneHtml: relativePath(standaloneHtmlPath),
      webPackage: relativePath(webPackagePath),
      componentArchive: relativePath(componentArchivePath),
      projectJson: relativePath(projectJsonPath),
      healthReport: relativePath(healthReportPath),
      previewConfig: relativePath(previewConfigPath),
      captureConfig: relativePath(captureConfigPath),
      evidenceManifest: relativePath(evidenceManifestPath),
    },
    component: {
      id: manifest.id,
      version: manifest.version,
      runtimeBytes,
      modes: sceneSpecs.map((spec) => spec.mode),
      propsContract: ['mode', 'phase', 'model', 'content', 'palette', 'reducedMotion'],
      courseStateKeys: ['mathMotion.prediction', 'mathMotion.completedBeats', 'mathMotion.hintCount'],
    },
    math: {
      base: quadraticMaximum(deriveAreaTruth(BASE_LINKED_GRAPH_MODEL)),
      domainVariant: quadraticMaximum(VERIFIED_MATH_TRUTHS.domainVariant),
      transfer: quadraticMaximum(VERIFIED_MATH_TRUTHS.transfer),
    },
    pipelineStatus: health.error === 0 ? 'passed' : 'failed',
    outcomeStatus: 'pending',
    staticExportNote: 'HTML 保留全部互动；PDF/PPTX 使用各场景初态，组件实验区静态化，最终总结幕初态保留三组数值证据。',
  }
  await fs.writeFile(buildSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  await writeEvidenceManifest(runtimeBytes, health.error === 0)

  console.log(`七幕课件：${lessonArchivePath}`)
  console.log(`单 HTML：${standaloneHtmlPath}`)
  console.log(`网页包：${webPackagePath}`)
  console.log(`证据清单：${evidenceManifestPath}`)
  console.log(`工程检查：errors=${health.error}, warnings=${health.warning}, info=${health.info}`)
  console.log('结果状态：pending（等待七幕真实播放、静态导出与人工结果审阅）')
}

main().catch((error: unknown) => {
  console.error('生成动点问题七幕整课失败', error)
  process.exitCode = 1
})
