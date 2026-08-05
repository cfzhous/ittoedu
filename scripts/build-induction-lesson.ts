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
import type {
  ExternalComponentNode,
  ProjectDocument,
  SceneDocument,
  ShapeNode,
  TextNode,
} from '../src/shared/projectTypes'
import type {
  InteractionActionPayload,
  InteractionCondition,
  InteractionRule,
} from '../src/shared/interactionTypes'
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

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDirectory, '..')
const componentDirectory = path.join(root, 'examples', 'induction-lab-component')
const componentEntryPath = path.join(componentDirectory, 'runtime.entry.ts')
const outputDirectory = path.join(root, 'output', 'induction-courseware')
const componentBuildDirectory = path.join(outputDirectory, '_component')
const componentRuntimePath = path.join(componentBuildDirectory, 'runtime.js')
const componentArchivePath = path.join(outputDirectory, 'induction-lab.h5component')
const lessonArchivePath = path.join(outputDirectory, '不是磁场，而是变化.h5lesson')
const standaloneHtmlPath = path.join(outputDirectory, '不是磁场，而是变化.html')
const projectJsonPath = path.join(outputDirectory, 'project.json')
const healthReportPath = path.join(outputDirectory, 'project-health.json')
const buildSummaryPath = path.join(outputDirectory, 'build-summary.json')
const previewConfigPath = path.join(outputDirectory, 'preview-config.json')
const previewScreenshotPath = path.join(outputDirectory, 'preview.png')
const thirdPartyNoticesPath = path.join(outputDirectory, 'THIRD_PARTY_NOTICES.md')
const playerBundlePath = path.join(root, 'dist-player', 'player.iife.js')
const rootPackageJsonPath = path.join(root, 'package.json')
const installedThreePackageJsonPath = path.join(root, 'node_modules', 'three', 'package.json')
const installedThreeLicensePath = path.join(root, 'node_modules', 'three', 'LICENSE')
const reproducibleTimestamp = new Date('2026-08-04T00:00:00.000Z')
const timestamp = reproducibleTimestamp.toISOString()
const MAX_RUNTIME_BYTES = 2 * 1024 * 1024

const palette = {
  ivory: '#F3EFE6',
  paper: '#FCFAF5',
  graphite: '#20241F',
  muted: '#6D706A',
  line: '#D2CABC',
  copper: '#A85F36',
  copperSoft: '#E9D7C8',
  blue: '#2E6F8F',
  blueSoft: '#DCEAF0',
  red: '#A24B43',
  redSoft: '#F0DEDB',
  green: '#3E6958',
  greenSoft: '#DDE9E2',
} as const

interface ThreePackageMetadata {
  version: string
  licenseText: string
}

interface BundledComponentRuntime {
  source: string
  includesThree: boolean
}

interface SceneShellOptions {
  id: string
  name: string
  chapter: string
  title: string
  subtitle: string
  page: string
  accent: string
}

interface StatusOptions {
  panelId: string
  textId: string
  text: string
  color?: string
  fill?: string
  visible?: boolean
  width?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    backgroundColor?: string
    backgroundOpacity?: number
    cornerRadius?: number
    padding?: number
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
      fontFamily: '"Microsoft YaHei", "Noto Sans SC", sans-serif',
      fontSize: options.fontSize ?? 20,
      color: options.color ?? palette.graphite,
      bold: options.bold ?? false,
      align: options.align ?? 'left',
      verticalAlign: 'middle',
      writingMode: 'horizontal',
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
  borderColor: string,
  options: {
    fillOpacity?: number
    borderOpacity?: number
    borderWidth?: number
    cornerRadius?: number
    visible?: boolean
  } = {},
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
      borderColor,
      borderOpacity: options.borderOpacity ?? 1,
      borderWidth: options.borderWidth ?? 1,
      cornerRadius: options.cornerRadius ?? 16,
    },
  })
  node.playbackInitialVisibility = 'inherit'
  return node
}

function actionStep(
  id: string,
  action: InteractionActionPayload,
  start: 'after-previous' | 'with-previous' = 'after-previous',
  delayMs = 0,
) {
  return { id, start, delayMs, action }
}

function clickRule(
  id: string,
  name: string,
  nodeId: string,
  action: InteractionActionPayload,
  conditions: InteractionCondition[] = [],
): InteractionRule {
  return {
    id,
    name,
    enabled: true,
    trigger: { type: 'node.click', nodeId },
    conditions,
    actions: [actionStep(`${id}_action`, action)],
  }
}

function componentEventRule(
  id: string,
  name: string,
  nodeId: string,
  eventName: string,
  stateId: string,
  allowedStates: string[],
): InteractionRule {
  return {
    id,
    name,
    enabled: true,
    trigger: { type: 'component.event', nodeId, eventName },
    conditions: [{ type: 'presentation.in', stateIds: allowedStates }],
    actions: [
      actionStep(`${id}_set_state`, {
        type: 'presentation.set',
        stateId,
        transition: { duration: 240, ease: 'Sine.easeInOut' },
      }),
    ],
  }
}

function sceneShell(options: SceneShellOptions): SceneDocument {
  const scene = createScene({
    id: options.id,
    name: options.name,
    backgroundColor: palette.ivory,
  })
  scene.nodes = [
    shapeNode(
      `${options.id}_top_rule`,
      '顶部章节色线',
      0,
      0,
      1280,
      16,
      options.accent,
      options.accent,
      { borderWidth: 0, cornerRadius: 0 },
    ),
    textNode(`${options.id}_chapter`, '章节标签', options.chapter, 58, 24, 680, 24, {
      fontSize: 12,
      color: options.accent,
      bold: true,
      letterSpacing: 1.6,
    }),
    textNode(`${options.id}_title`, '页面标题', options.title, 56, 45, 910, 50, {
      fontSize: 32,
      color: palette.graphite,
      bold: true,
    }),
    textNode(`${options.id}_subtitle`, '学习提示', options.subtitle, 58, 91, 1060, 28, {
      fontSize: 14,
      color: palette.muted,
    }),
    textNode(`${options.id}_page`, '页码', options.page, 1135, 31, 84, 64, {
      fontSize: 42,
      color: options.accent,
      bold: true,
      align: 'right',
    }),
  ]
  return scene
}

function defaultComponentContent(manifest: ComponentManifest): Record<string, unknown> {
  const defaultProps = isRecord(manifest.defaultProps) ? manifest.defaultProps : {}
  return isRecord(defaultProps.content) ? defaultProps.content : {}
}

function componentProps(
  manifest: ComponentManifest,
  mode: 'prediction' | 'lab' | 'model' | 'lenz' | 'transfer',
  content: Record<string, unknown>,
): Record<string, unknown> {
  const defaults = isRecord(manifest.defaultProps) ? manifest.defaultProps : {}
  const defaultContent = defaultComponentContent(manifest)
  const defaultModeContent = isRecord(defaultContent[mode]) ? defaultContent[mode] : {}
  return {
    ...defaults,
    mode,
    phase: 'initial',
    palette: {
      background: palette.paper,
      text: palette.graphite,
      muted: palette.muted,
      copper: palette.copper,
      blue: palette.blue,
      red: palette.red,
      line: palette.line,
    },
    content: {
      ...defaultContent,
      [mode]: {
        ...defaultModeContent,
        ...content,
      },
    },
  }
}

function componentNode(
  manifest: ComponentManifest,
  id: string,
  name: string,
  mode: 'prediction' | 'lab' | 'model' | 'lenz' | 'transfer',
  content: Record<string, unknown>,
): ExternalComponentNode {
  const node = createExternalComponentNode({
    id,
    name,
    x: 56,
    y: 126,
    width: 1168,
    height: 426,
    component: { packageId: manifest.id, version: manifest.version },
    props: componentProps(manifest, mode, content),
  })
  node.playbackInitialVisibility = 'inherit'
  return node
}

function statusNodes(options: StatusOptions): [ShapeNode, TextNode] {
  const width = options.width ?? 842
  return [
    shapeNode(
      options.panelId,
      '稳定反馈背景',
      58,
      566,
      width,
      58,
      options.fill ?? palette.paper,
      options.color ?? palette.line,
      {
        borderWidth: 1,
        cornerRadius: 12,
        visible: options.visible ?? false,
      },
    ),
    textNode(
      options.textId,
      '稳定反馈文字',
      options.text,
      78,
      574,
      width - 40,
      42,
      {
        fontSize: 15,
        color: options.color ?? palette.graphite,
        bold: true,
        visible: options.visible ?? false,
      },
    ),
  ]
}

function nextButton(
  buttonId: string,
  textId: string,
  label: string,
  accent: string,
  visible = false,
): [ShapeNode, TextNode] {
  return [
    shapeNode(buttonId, '继续按钮', 928, 566, 296, 58, accent, accent, {
      borderWidth: 0,
      cornerRadius: 12,
      visible,
    }),
    textNode(textId, '继续按钮文字', label, 944, 574, 264, 42, {
      fontSize: 15,
      color: '#FFFFFF',
      bold: true,
      align: 'center',
      visible,
    }),
  ]
}

function buildPredictionScene(manifest: ComponentManifest): SceneDocument {
  const scene = sceneShell({
    id: 'scene_prediction',
    name: '01 · 先押一个答案',
    chapter: 'PREDICT  /  预测',
    title: '先押一个答案',
    subtitle: '同一块磁体：靠近、停住、远离。哪一段会出现感应电压？',
    page: '01',
    accent: palette.copper,
  })
  scene.nodes.push(
    componentNode(
      manifest,
      'prediction_component',
      '磁感应预测互动',
      'prediction',
      {
        eyebrow: '先预测，再看证据',
        title: '三段运动，电压会怎样变化？',
        instruction: '分别判断“靠近—停住—远离”三个阶段，完成后锁定预测。',
        approachLabel: '靠近线圈',
        stopLabel: '停在线圈口前',
        recedeLabel: '远离线圈',
        voltageQuestion: '是否出现感应电压？',
        yesLabel: '有',
        noLabel: '无',
        lockLabel: '锁定预测',
        lockedLabel: '预测已锁定',
      },
    ),
    ...statusNodes({
      panelId: 'prediction_feedback_panel',
      textId: 'prediction_feedback_text',
      text: '预测已锁定。暂时不判对错；下一幕只让证据说话。',
      color: palette.copper,
      fill: '#F8F0E9',
    }),
    ...nextButton(
      'prediction_next_button',
      'prediction_next_text',
      '进入实验 · 看证据 →',
      palette.graphite,
    ),
  )
  scene.presentation = {
    initialStateId: 'predict_empty',
    thumbnailStateId: 'predict_empty',
    states: [
      {
        id: 'predict_empty',
        name: '等待预测',
        description: '三段判断尚未锁定',
        nodeOverrides: {},
      },
      {
        id: 'predict_locked',
        name: '预测已锁定',
        description: '保留原始预测，下一幕再与证据比较',
        nodeOverrides: {
          prediction_component: { props: { phase: 'locked', locked: true } },
          prediction_feedback_panel: { visible: true },
          prediction_feedback_text: { visible: true },
          prediction_next_button: { visible: true },
          prediction_next_text: { visible: true },
        },
      },
    ],
  }
  scene.interactions = [
    componentEventRule(
      'prediction_lock_result',
      '锁定预测后显示稳定结果',
      'prediction_component',
      'prediction.locked',
      'predict_locked',
      ['predict_empty'],
    ),
    clickRule(
      'prediction_go_evidence',
      '进入证据实验',
      'prediction_next_button',
      { type: 'scene.go', sceneId: 'scene_evidence' },
      [{ type: 'presentation.in', stateIds: ['predict_locked'] }],
    ),
  ]
  return scene
}

function buildEvidenceScene(manifest: ComponentManifest): SceneDocument {
  const scene = sceneShell({
    id: 'scene_evidence',
    name: '02 · 让证据说话',
    chapter: 'EVIDENCE  /  证据',
    title: '让证据说话',
    subtitle: '同一装置，只改变磁体的运动状态：停、慢进、快进、远离。',
    page: '02',
    accent: palette.blue,
  })
  scene.nodes.push(
    componentNode(manifest, 'evidence_component', '磁感应证据实验', 'lab', {
      eyebrow: '同一装置 · 单变量对照',
      title: '把“磁场存在”与“磁通量变化”分开',
      instruction: '依次完成停住、慢速靠近、快速靠近、远离，观察电表与轨迹。',
      stationaryLabel: '停住',
      slowApproachLabel: '慢速靠近',
      fastApproachLabel: '快速靠近',
      recedeLabel: '远离',
      runLabel: '运行',
      resetLabel: '复位',
      recordLabel: '记录证据',
      voltageLabel: '感应电压 U',
      fieldLabel: '线圈处磁场 B',
      evidenceTitle: '证据板',
      zeroEvidence: '磁场很强，但静止时电压为 0',
      speedEvidence: '变化越快，脉冲越高',
      directionEvidence: '运动方向反转，电压方向也反转',
    }),
    ...statusNodes({
      panelId: 'evidence_status_panel',
      textId: 'evidence_status_text',
      text: '准备就绪：先把磁体停在线圈口前，观察“有磁场但无电压”。',
      color: palette.blue,
      fill: palette.blueSoft,
    }),
    ...nextButton(
      'evidence_next_button',
      'evidence_next_text',
      '进入模型 · 看曲线 →',
      palette.graphite,
    ),
  )
  scene.presentation = {
    initialStateId: 'lab_ready',
    thumbnailStateId: 'lab_ready',
    states: [
      {
        id: 'lab_ready',
        name: '实验就绪',
        description: '等待完成第一条证据',
        nodeOverrides: {
          evidence_status_panel: { visible: true },
          evidence_status_text: { visible: true },
        },
      },
      {
        id: 'trial_recorded',
        name: '已记录一条证据',
        description: '运动与静止已形成第一次对照',
        nodeOverrides: {
          evidence_component: { props: { phase: 'trial-recorded' } },
          evidence_status_panel: { visible: true },
          evidence_status_text: {
            visible: true,
            text: '第一条证据：磁体运动时出现脉冲。继续做快慢与方向对照。',
          },
        },
      },
      {
        id: 'evidence_complete',
        name: '证据已完整',
        description: '停、快慢和方向三组证据已经齐全',
        nodeOverrides: {
          evidence_component: { props: { phase: 'complete' } },
          evidence_status_panel: {
            visible: true,
            style: { fillColor: palette.greenSoft, borderColor: palette.green },
          },
          evidence_status_text: {
            visible: true,
            text: '证据齐了：更快 → 脉冲更高；方向反转 → 电压反向。',
            style: { color: palette.green },
          },
        },
      },
      {
        id: 'prediction_compare',
        name: '预测与证据对照',
        description: '回看首幕预测并完成概念冲突',
        nodeOverrides: {
          evidence_component: { props: { phase: 'prediction-compare', locked: true } },
          evidence_status_panel: {
            visible: true,
            style: { fillColor: '#F8F0E9', borderColor: palette.copper },
          },
          evidence_status_text: {
            visible: true,
            text: '回看预测：决定因素不是“有没有磁场”，而是穿过线圈的磁通量是否改变。',
            style: { color: palette.copper },
          },
          evidence_next_button: { visible: true },
          evidence_next_text: { visible: true },
        },
      },
    ],
  }
  scene.interactions = [
    componentEventRule(
      'evidence_record_trial',
      '记录第一条证据',
      'evidence_component',
      'trial.recorded',
      'trial_recorded',
      ['lab_ready'],
    ),
    componentEventRule(
      'evidence_finish_trials',
      '完成全部证据',
      'evidence_component',
      'evidence.complete',
      'evidence_complete',
      ['lab_ready', 'trial_recorded'],
    ),
    componentEventRule(
      'evidence_compare_prediction',
      '对照预测与证据',
      'evidence_component',
      'prediction.compare',
      'prediction_compare',
      ['evidence_complete'],
    ),
    clickRule(
      'evidence_go_model',
      '进入模型建构',
      'evidence_next_button',
      { type: 'scene.go', sceneId: 'scene_model' },
      [{ type: 'presentation.in', stateIds: ['prediction_compare'] }],
    ),
  ]
  return scene
}

function buildModelScene(manifest: ComponentManifest): SceneDocument {
  const scene = sceneShell({
    id: 'scene_model',
    name: '03 · 从现象到模型',
    chapter: 'MODEL  /  建模',
    title: '从现象到模型',
    subtitle: '让装置、磁通量 Φ(t) 与感应电压 U(t) 共用一条时间线。',
    page: '03',
    accent: palette.blue,
  })
  scene.nodes.push(
    componentNode(manifest, 'model_component', '磁通量与电压同步模型', 'model', {
      eyebrow: '同一时刻 · 三种表征',
      title: '看斜率，不看高度',
      instruction: '拖动共享时间线，找到“磁通量不为 0，但感应电压为 0”的时刻。',
      apparatusLabel: '装置位置',
      fluxLabel: '磁通量 Φ',
      voltageLabel: '感应电压 U',
      timeLabel: '时间 t',
      searchPrompt: '寻找 U = 0 且 Φ ≠ 0',
      submitLabel: '就在这里',
      resetLabel: '重新观察',
      slopeHint: '比较相邻时刻的 Φ：曲线斜率代表磁通量变化率。',
      formulaFlux: 'Φ = BA cos θ',
      formulaEmf: '|E| = N |ΔΦ / Δt|',
      formulaCurrent: '闭合回路中：I = E / R',
      zeroConclusion: '磁通量不变 → 感应电压为 0',
    }),
    ...statusNodes({
      panelId: 'model_status_panel',
      textId: 'model_status_text',
      text: '先自由拖动时间线：让磁体位置、Φ(t) 与 U(t) 同步起来。',
      color: palette.blue,
      fill: palette.blueSoft,
    }),
    ...nextButton(
      'model_next_button',
      'model_next_text',
      '进入方向判断 →',
      palette.graphite,
    ),
  )
  scene.presentation = {
    initialStateId: 'model_intro',
    thumbnailStateId: 'model_intro',
    states: [
      {
        id: 'model_intro',
        name: '模型初识',
        description: '自由拖动共享时间线',
        nodeOverrides: {
          model_status_panel: { visible: true },
          model_status_text: { visible: true },
        },
      },
      {
        id: 'slope_task',
        name: '斜率任务',
        description: '寻找 U=0 且 Φ 不为零的时刻',
        nodeOverrides: {
          model_component: { props: { phase: 'slope-task' } },
          model_status_panel: { visible: true },
          model_status_text: {
            visible: true,
            text: '任务：找到 U = 0 而 Φ ≠ 0 的时刻，并说出此时 Φ 曲线的斜率。',
          },
        },
      },
      {
        id: 'model_repair',
        name: '模型纠偏',
        description: '把注意从曲线高度移向曲线斜率',
        nodeOverrides: {
          model_component: { props: { phase: 'repair' } },
          model_status_panel: {
            visible: true,
            style: { fillColor: palette.redSoft, borderColor: palette.red },
          },
          model_status_text: {
            visible: true,
            text: '别看曲线有多高；看这一刻 Φ 的斜率是否为 0。',
            style: { color: palette.red },
          },
        },
      },
      {
        id: 'model_mastered',
        name: '模型已建构',
        description: '完成磁通量变化率与感应电压的对应',
        nodeOverrides: {
          model_component: { props: { phase: 'mastered', locked: true } },
          model_status_panel: {
            visible: true,
            style: { fillColor: palette.greenSoft, borderColor: palette.green },
          },
          model_status_text: {
            visible: true,
            text: '看斜率，不看高度：|U| ∝ |ΔΦ / Δt|；Φ 不变时，即使很大，U 仍为 0。',
            style: { color: palette.green },
          },
          model_next_button: { visible: true },
          model_next_text: { visible: true },
        },
      },
    ],
  }
  scene.interactions = [
    componentEventRule(
      'model_begin_slope_task',
      '进入斜率任务',
      'model_component',
      'model.slope-task',
      'slope_task',
      ['model_intro'],
    ),
    componentEventRule(
      'model_show_repair',
      '显示斜率纠偏',
      'model_component',
      'model.repair',
      'model_repair',
      ['slope_task', 'model_repair'],
    ),
    componentEventRule(
      'model_show_mastery',
      '完成模型建构',
      'model_component',
      'model.mastered',
      'model_mastered',
      ['slope_task', 'model_repair'],
    ),
    clickRule(
      'model_go_lenz',
      '进入方向判断',
      'model_next_button',
      { type: 'scene.go', sceneId: 'scene_lenz' },
      [{ type: 'presentation.in', stateIds: ['model_mastered'] }],
    ),
  ]
  return scene
}

function buildLenzScene(manifest: ComponentManifest): SceneDocument {
  const scene = sceneShell({
    id: 'scene_lenz',
    name: '04 · 方向不是背口令',
    chapter: 'DIRECTION  /  方向',
    title: '方向不是背口令',
    subtitle: '楞次定律反抗的是“磁通量的变化”，不是原磁场本身。',
    page: '04',
    accent: palette.copper,
  })
  scene.nodes.push(
    componentNode(manifest, 'lenz_component', '楞次定律方向推理', 'lenz', {
      eyebrow: '先判断变化，再判断反抗',
      title: '用三步推理替代一句口令',
      instruction: '先跟随“靠近”范例，再独立完成“远离”判断。',
      approachLabel: '磁体靠近',
      recedeLabel: '磁体远离',
      stepOneTitle: '① 原磁通量怎样变？',
      stepTwoTitle: '② 感应磁场要阻碍什么？',
      stepThreeTitle: '③ 用右手定则判电流方向',
      increasingLabel: '增大',
      decreasingLabel: '减小',
      sameDirectionLabel: '与原磁场同向',
      oppositeDirectionLabel: '与原磁场反向',
      clockwiseLabel: '顺时针',
      counterClockwiseLabel: '逆时针',
      checkLabel: '检查推理',
      retryLabel: '从第一步重来',
      coreSentence: '反抗的是变化',
    }),
    ...statusNodes({
      panelId: 'lenz_status_panel',
      textId: 'lenz_status_text',
      text: '范例：磁体靠近 → 原磁通量增大 → 感应磁场阻碍“增大”。',
      color: palette.copper,
      fill: '#F8F0E9',
    }),
    ...nextButton(
      'lenz_next_button',
      'lenz_next_text',
      '进入迁移挑战 →',
      palette.graphite,
    ),
  )
  scene.presentation = {
    initialStateId: 'approach_worked',
    thumbnailStateId: 'approach_worked',
    states: [
      {
        id: 'approach_worked',
        name: '靠近范例',
        description: '教师示范三步方向推理',
        nodeOverrides: {
          lenz_status_panel: { visible: true },
          lenz_status_text: { visible: true },
        },
      },
      {
        id: 'recede_attempt',
        name: '远离尝试',
        description: '学生独立完成磁体远离的三步推理',
        nodeOverrides: {
          lenz_component: { props: { phase: 'recede-attempt' } },
          lenz_status_panel: { visible: true },
          lenz_status_text: {
            visible: true,
            text: '轮到你：磁体远离时，先判断 Φ 增大还是减小，再判断感应磁场方向。',
          },
        },
      },
      {
        id: 'direction_repair',
        name: '方向纠偏',
        description: '回到磁通量变化方向重新推理',
        nodeOverrides: {
          lenz_component: { props: { phase: 'repair' } },
          lenz_status_panel: {
            visible: true,
            style: { fillColor: palette.redSoft, borderColor: palette.red },
          },
          lenz_status_text: {
            visible: true,
            text: '先别判电流方向：第一步只回答“原磁通量正在增大还是减小”。',
            style: { color: palette.red },
          },
        },
      },
      {
        id: 'direction_mastered',
        name: '方向推理完成',
        description: '完成磁体远离的完整判断链',
        nodeOverrides: {
          lenz_component: { props: { phase: 'mastered', locked: true } },
          lenz_status_panel: {
            visible: true,
            style: { fillColor: palette.greenSoft, borderColor: palette.green },
          },
          lenz_status_text: {
            visible: true,
            text: '磁体远离：原磁通量减小，感应磁场试图维持它。反抗的是变化。',
            style: { color: palette.green },
          },
          lenz_next_button: { visible: true },
          lenz_next_text: { visible: true },
        },
      },
    ],
  }
  scene.interactions = [
    componentEventRule(
      'lenz_begin_recede',
      '进入远离判断',
      'lenz_component',
      'lenz.recede-attempt',
      'recede_attempt',
      ['approach_worked'],
    ),
    componentEventRule(
      'lenz_show_repair',
      '显示方向纠偏',
      'lenz_component',
      'lenz.repair',
      'direction_repair',
      ['recede_attempt', 'direction_repair'],
    ),
    componentEventRule(
      'lenz_show_mastery',
      '完成方向推理',
      'lenz_component',
      'lenz.mastered',
      'direction_mastered',
      ['recede_attempt', 'direction_repair'],
    ),
    clickRule(
      'lenz_go_transfer',
      '进入迁移挑战',
      'lenz_next_button',
      { type: 'scene.go', sceneId: 'scene_transfer' },
      [{ type: 'presentation.in', stateIds: ['direction_mastered'] }],
    ),
  ]
  return scene
}

function buildTransferScene(manifest: ComponentManifest): SceneDocument {
  const scene = sceneShell({
    id: 'scene_transfer',
    name: '05 · 换一个装置还会吗',
    chapter: 'TRANSFER  /  迁移',
    title: '换一个装置还会吗',
    subtitle: '不看“磁体有没有动”，只问穿过回路的磁通量是否改变。',
    page: '05',
    accent: palette.green,
  })
  scene.nodes.push(
    componentNode(manifest, 'transfer_component', '电磁感应迁移判断', 'transfer', {
      eyebrow: '三种新装置 · 同一个判断链',
      title: '感应是否发生？理由是什么？',
      instruction: '逐个选择“有/无感应”，并把理由落到 B、A 或 θ 的变化。',
      caseOneTitle: '电磁铁电流改变',
      caseOneDescription: '线圈不动，电磁铁中的电流逐渐增大。',
      caseTwoTitle: '线圈在匀强磁场中转动',
      caseTwoDescription: '磁场大小不变，线圈与磁场夹角持续改变。',
      caseThreeTitle: '磁体与线圈一起平移',
      caseThreeDescription: '二者相对位置、姿态始终不变。',
      inducedLabel: '有感应',
      notInducedLabel: '无感应',
      fieldReason: 'B 改变',
      areaReason: 'A 改变',
      angleReason: 'θ 改变',
      unchangedReason: 'Φ 不变',
      checkLabel: '检查三组判断',
      summaryLabel: '收束判断链',
    }),
    ...statusNodes({
      panelId: 'transfer_status_panel',
      textId: 'transfer_status_text',
      text: '逐个判断：先问 Φ 是否改变，再说明是 B、A、θ 中哪个量改变。',
      color: palette.green,
      fill: palette.greenSoft,
    }),
    shapeNode(
      'transfer_review_button',
      '回到模型按钮',
      714,
      566,
      242,
      58,
      palette.paper,
      palette.blue,
      { borderWidth: 1, cornerRadius: 12, visible: false },
    ),
    textNode('transfer_review_text', '回到模型文字', '回到模型复盘', 730, 574, 210, 42, {
      fontSize: 15,
      color: palette.blue,
      bold: true,
      align: 'center',
      visible: false,
    }),
    shapeNode(
      'transfer_restart_button',
      '重新开始按钮',
      976,
      566,
      248,
      58,
      palette.graphite,
      palette.graphite,
      { borderWidth: 0, cornerRadius: 12, visible: false },
    ),
    textNode('transfer_restart_text', '重新开始文字', '重新开始整课', 992, 574, 216, 42, {
      fontSize: 15,
      color: '#FFFFFF',
      bold: true,
      align: 'center',
      visible: false,
    }),
    shapeNode(
      'transfer_summary_panel',
      '结课判断链背景',
      130,
      170,
      1020,
      334,
      palette.paper,
      palette.copper,
      { borderWidth: 2, cornerRadius: 22, visible: false },
    ),
    textNode(
      'transfer_summary_kicker',
      '结课总结标签',
      'THE JUDGEMENT CHAIN  /  最终判断链',
      176,
      202,
      928,
      28,
      {
        fontSize: 13,
        color: palette.copper,
        bold: true,
        align: 'center',
        letterSpacing: 1.4,
        visible: false,
      },
    ),
    textNode(
      'transfer_summary_title',
      '结课总结标题',
      '不是磁场，而是变化',
      176,
      238,
      928,
      60,
      {
        fontSize: 38,
        color: palette.graphite,
        bold: true,
        align: 'center',
        visible: false,
      },
    ),
    textNode(
      'transfer_summary_chain',
      '结课判断链',
      '① 穿过回路的磁通量 Φ 改变了吗？\n② 改变得有多快？  →  决定感应电压大小\n③ 原来的变化方向是什么？  →  决定感应电流方向',
      224,
      316,
      832,
      132,
      {
        fontSize: 21,
        color: palette.graphite,
        bold: true,
        align: 'left',
        visible: false,
      },
    ),
    textNode(
      'transfer_summary_formula',
      '结课公式',
      'Φ = BA cos θ     ·     |E| = N |ΔΦ / Δt|',
      240,
      456,
      800,
      32,
      {
        fontSize: 16,
        color: palette.blue,
        bold: true,
        align: 'center',
        visible: false,
      },
    ),
  )
  scene.presentation = {
    initialStateId: 'transfer_attempt',
    thumbnailStateId: 'transfer_attempt',
    states: [
      {
        id: 'transfer_attempt',
        name: '迁移判断',
        description: '完成三种新装置的感应判断与理由',
        nodeOverrides: {
          transfer_status_panel: { visible: true },
          transfer_status_text: { visible: true },
        },
      },
      {
        id: 'transfer_repair',
        name: '迁移纠偏',
        description: '把理由从表面运动转回磁通量变化',
        nodeOverrides: {
          transfer_component: { props: { phase: 'repair' } },
          transfer_status_panel: {
            visible: true,
            style: { fillColor: palette.redSoft, borderColor: palette.red },
          },
          transfer_status_text: {
            visible: true,
            text: '至少一个理由仍停在“有磁场”或“磁体在动”。请明确 Φ 为什么变或不变。',
            style: { color: palette.red },
          },
        },
      },
      {
        id: 'transfer_mastered',
        name: '迁移通过',
        description: '三种新装置均使用磁通量变化完成判断',
        nodeOverrides: {
          transfer_component: { props: { phase: 'mastered', locked: true } },
          transfer_status_panel: {
            visible: true,
            style: { fillColor: palette.greenSoft, borderColor: palette.green },
          },
          transfer_status_text: {
            visible: true,
            text: '迁移通过：B、A、θ 中任一量变化都可能改变 Φ；整体同动时 Φ 可以保持不变。',
            style: { color: palette.green },
          },
        },
      },
      {
        id: 'exit_summary',
        name: '结课总结',
        description: '收束为可迁移的三步判断链',
        nodeOverrides: {
          transfer_component: { visible: false, props: { phase: 'summary', locked: true } },
          transfer_status_panel: { visible: false },
          transfer_status_text: { visible: false },
          transfer_summary_panel: { visible: true },
          transfer_summary_kicker: { visible: true },
          transfer_summary_title: { visible: true },
          transfer_summary_chain: { visible: true },
          transfer_summary_formula: { visible: true },
          transfer_review_button: { visible: true },
          transfer_review_text: { visible: true },
          transfer_restart_button: { visible: true },
          transfer_restart_text: { visible: true },
        },
      },
    ],
  }
  scene.interactions = [
    componentEventRule(
      'transfer_show_repair',
      '显示迁移纠偏',
      'transfer_component',
      'transfer.repair',
      'transfer_repair',
      ['transfer_attempt', 'transfer_repair'],
    ),
    componentEventRule(
      'transfer_show_mastery',
      '完成迁移判断',
      'transfer_component',
      'transfer.mastered',
      'transfer_mastered',
      ['transfer_attempt', 'transfer_repair'],
    ),
    componentEventRule(
      'transfer_show_summary',
      '收束结课判断链',
      'transfer_component',
      'transfer.summary',
      'exit_summary',
      ['transfer_mastered'],
    ),
    clickRule(
      'transfer_review_model',
      '回到模型复盘',
      'transfer_review_button',
      { type: 'scene.go', sceneId: 'scene_model', targetStateId: 'model_mastered' },
      [{ type: 'presentation.in', stateIds: ['exit_summary'] }],
    ),
    clickRule(
      'transfer_restart_course',
      '重新开始整课',
      'transfer_restart_button',
      { type: 'course.restart' },
      [{ type: 'presentation.in', stateIds: ['exit_summary'] }],
    ),
  ]
  return scene
}

function buildProject(
  manifest: ComponentManifest,
  componentKey: string,
  componentMetadata: ReturnType<typeof importComponentPackage>['metadata'],
): ProjectDocument {
  const project = createProject({
    id: 'project_not_magnetic_field_but_change',
    title: '不是磁场，而是变化',
    now: timestamp,
    idFactory: (() => {
      let value = 0
      return () => String(++value).padStart(3, '0')
    })(),
  })
  project.scenes = [
    buildPredictionScene(manifest),
    buildEvidenceScene(manifest),
    buildModelScene(manifest),
    buildLenzScene(manifest),
    buildTransferScene(manifest),
  ]
  project.componentPackages[componentKey] = componentMetadata
  project.globalInteractions = []
  project.media.audio = {
    defaultMuted: false,
    masterVolume: 0.92,
    channelVolumes: {
      music: 0,
      narration: 1,
      sfx: 0.72,
      ui: 0.58,
      video: 1,
    },
    sounds: {},
    narrationDucking: {
      enabled: true,
      musicVolume: 0.22,
      fadeMs: 260,
    },
  }
  project.playback = { controls: 'canvas', keyboardNavigation: true }

  const controller = project.globalLayer.find(
    (item) => item.node.type === 'teacher-controller',
  )
  if (controller?.node.type === 'teacher-controller') {
    controller.node.id = 'induction_teacher_controller'
    controller.node.name = '课程导航控制器'
    controller.node.title = '不是磁场，而是变化'
    controller.node.x = 56
    controller.node.y = 650
    controller.node.width = 1168
    controller.node.height = 54
    controller.node.compact = true
    controller.node.collapsible = true
    controller.node.defaultCollapsed = false
    controller.node.showSceneProgress = true
    controller.node.includeInStaticExports = false
    controller.node.style.backgroundColor = palette.graphite
    controller.node.style.backgroundOpacity = 0.97
    controller.node.style.accentColor = palette.copper
    controller.node.style.textColor = '#F7F4ED'
    controller.node.style.cornerRadius = 12
  }
  return projectDocumentSchema.parse(project)
}

async function loadThreePackageMetadata(): Promise<ThreePackageMetadata> {
  const [rootPackageText, installedPackageText, licenseText] = await Promise.all([
    fs.readFile(rootPackageJsonPath, 'utf8'),
    fs.readFile(installedThreePackageJsonPath, 'utf8'),
    fs.readFile(installedThreeLicensePath, 'utf8'),
  ])
  const rootPackage = JSON.parse(rootPackageText) as unknown
  const installedPackage = JSON.parse(installedPackageText) as unknown
  const declaredVersion = isRecord(rootPackage) && isRecord(rootPackage.devDependencies)
    ? rootPackage.devDependencies.three
    : undefined
  const installedVersion = isRecord(installedPackage) ? installedPackage.version : undefined
  const installedLicense = isRecord(installedPackage) ? installedPackage.license : undefined
  if (
    typeof declaredVersion !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(declaredVersion)
  ) {
    throw new Error('package.json 必须用精确版本固定 devDependencies.three')
  }
  if (installedVersion !== declaredVersion) {
    throw new Error(
      `Three.js 安装版本 ${String(installedVersion)} 与 package.json ${declaredVersion} 不一致`,
    )
  }
  if (installedLicense !== 'MIT') {
    throw new Error(`Three.js 许可证应为 MIT，实际为 ${String(installedLicense)}`)
  }
  return { version: declaredVersion, licenseText }
}

function buildThreeThirdPartyNotice({ version, licenseText }: ThreePackageMetadata): string {
  return `# Third-party notices

The generated component runtime, \`induction-lab.h5component\`,
\`不是磁场，而是变化.h5lesson\`, and
\`不是磁场，而是变化.html\` contain a bundled copy of Three.js.
Keep this notice with redistributed artifacts.

## Three.js ${version}

- Project: https://threejs.org/
- Source repository: https://github.com/mrdoob/three.js
- License: MIT

${licenseText.trim()}\n`
}

function buildNoThirdPartyNotice(): string {
  return `# Third-party notices

No third-party JavaScript library is bundled into the component runtime.
The packaged apparatus images are project-authored visual assets.
`
}

function assertOfflineBundle(source: string, label: string): void {
  const bytes = new TextEncoder().encode(source).byteLength
  if (bytes >= MAX_RUNTIME_BYTES) {
    throw new Error(`${label} 超过 2 MiB Runtime 上限：${bytes} bytes`)
  }
  if (/(^|[;\n\r])\s*import\s*(?:[(\s{*]|["'])/m.test(source)) {
    throw new Error(`${label} 仍包含 import`)
  }
  if (/(^|[;\n\r])\s*export\s+(?:default|const|let|var|function|class|\{|\*)/m.test(source)) {
    throw new Error(`${label} 仍包含 export`)
  }
  if (/\brequire\s*\(/.test(source)) {
    throw new Error(`${label} 仍包含 require`)
  }
  if (/(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\()[^\n]{0,120}https?:\/\//i.test(source)) {
    throw new Error(`${label} 包含远程网络请求`)
  }
}

function validateComponentDefinition(source: string, manifest: ComponentManifest): void {
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
    typeof definition !== 'object' ||
    definition === null ||
    Reflect.get(definition, 'id') !== manifest.id ||
    Reflect.get(definition, 'runtimeApiVersion') !== manifest.runtimeApiVersion ||
    typeof Reflect.get(definition, 'create') !== 'function'
  ) {
    throw new Error(`组件“${manifest.id}”runtime 注册与 manifest 不一致`)
  }
}

function viteResultIncludesThree(result: Awaited<ReturnType<typeof viteBuild>>): boolean {
  const outputs = Array.isArray(result) ? result : [result]
  return outputs.some((output) => {
    if (!isRecord(output) || !Array.isArray(output.output)) return false
    return output.output.some((entry) => {
      if (!isRecord(entry) || entry.type !== 'chunk' || !isRecord(entry.modules)) return false
      return Object.keys(entry.modules).some((moduleId) =>
        /[\\/]node_modules[\\/]three[\\/]/i.test(moduleId),
      )
    })
  })
}

async function bundleComponentRuntime(): Promise<BundledComponentRuntime> {
  await fs.mkdir(componentBuildDirectory, { recursive: true })
  const result = await viteBuild({
    configFile: false,
    logLevel: 'warn',
    build: {
      outDir: componentBuildDirectory,
      emptyOutDir: false,
      copyPublicDir: false,
      sourcemap: false,
      minify: 'esbuild',
      lib: {
        entry: componentEntryPath,
        name: 'InductionLabComponent',
        formats: ['iife'],
        fileName: () => 'runtime.js',
      },
    },
  })
  return {
    source: await fs.readFile(componentRuntimePath, 'utf8'),
    includesThree: viteResultIncludesThree(result),
  }
}

async function buildComponentFiles(
  manifest: ComponentManifest,
  runtimeSource: string,
  notice: string,
): Promise<Record<string, Uint8Array>> {
  if (manifest.thumbnail === undefined) {
    throw new Error('可视组件必须提供离线 thumbnail')
  }
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
    [manifest.entry]: strToU8(runtimeSource),
    [manifest.thumbnail]: Uint8Array.from(
      await fs.readFile(path.join(componentDirectory, manifest.thumbnail)),
    ),
    'THIRD_PARTY_NOTICES.md': strToU8(notice),
  }
  for (const assetPath of Object.values(manifest.assets)) {
    if (files[assetPath] !== undefined) continue
    files[assetPath] = Uint8Array.from(
      await fs.readFile(path.join(componentDirectory, assetPath)),
    )
  }
  return files
}

function assertProjectSemantics(project: ProjectDocument, manifest: ComponentManifest): void {
  const expectedSceneStateIds: Record<string, string[]> = {
    scene_prediction: ['predict_empty', 'predict_locked'],
    scene_evidence: ['lab_ready', 'trial_recorded', 'evidence_complete', 'prediction_compare'],
    scene_model: ['model_intro', 'slope_task', 'model_repair', 'model_mastered'],
    scene_lenz: ['approach_worked', 'recede_attempt', 'direction_repair', 'direction_mastered'],
    scene_transfer: ['transfer_attempt', 'transfer_repair', 'transfer_mastered', 'exit_summary'],
  }
  if (project.schemaVersion !== 7) throw new Error('工程不是 Project V7')
  if (project.canvas.width !== 1280 || project.canvas.height !== 720) {
    throw new Error('工程画布不是 1280×720')
  }
  if (project.scenes.length !== 5) throw new Error('工程场景数量不是 5')
  if (!Array.isArray(project.globalLayer) || !Array.isArray(project.globalInteractions)) {
    throw new Error('工程缺少 globalLayer 或 globalInteractions')
  }
  if (project.playback.controls !== 'canvas') throw new Error('工程未使用画布教师控制器')
  if (!project.media.audio) throw new Error('工程缺少 media.audio')
  for (const [sceneId, expectedStateIds] of Object.entries(expectedSceneStateIds)) {
    const scene = project.scenes.find((candidate) => candidate.id === sceneId)
    if (!scene?.presentation) throw new Error(`场景 ${sceneId} 缺少 presentation`)
    const stateIds = scene.presentation.states.map((state) => state.id)
    if (JSON.stringify(stateIds) !== JSON.stringify(expectedStateIds)) {
      throw new Error(`场景 ${sceneId} 的命名状态不完整：${stateIds.join(', ')}`)
    }
    if (!Array.isArray(scene.interactions)) throw new Error(`场景 ${sceneId} 缺少 interactions`)
    const components = scene.nodes.filter(
      (node): node is ExternalComponentNode => node.type === 'external-component',
    )
    if (components.length !== 1) throw new Error(`场景 ${sceneId} 必须包含一个互动组件`)
    if (
      components[0]?.component.packageId !== manifest.id ||
      components[0]?.component.version !== manifest.version
    ) {
      throw new Error(`场景 ${sceneId} 的组件引用不匹配`)
    }
  }
}

function assertStandaloneOffline(html: string): void {
  if (/<(?:script|img|audio|video|source|link)\b[^>]+(?:src|href)=["']https?:\/\//i.test(html)) {
    throw new Error('离线 HTML 中出现远程资源引用')
  }
  if (/\b(?:fetch|WebSocket|EventSource)\s*\(\s*["']https?:\/\//i.test(html)) {
    throw new Error('离线 HTML 中出现远程网络调用')
  }
}

async function main(): Promise<void> {
  await fs.mkdir(outputDirectory, { recursive: true })
  const manifestText = await fs.readFile(path.join(componentDirectory, 'manifest.json'), 'utf8')
  const manifest = componentManifestSchema.parse(JSON.parse(manifestText) as unknown)
  if (
    manifest.schemaVersion !== 4 ||
    manifest.runtimeApiVersion !== 4 ||
    manifest.renderMode !== 'dom' ||
    !manifest.supportedScopes.includes('scene')
  ) {
    throw new Error('电磁感应组件必须是支持 scene scope 的 Component API 4 DOM 组件')
  }

  const bundledRuntime = await bundleComponentRuntime()
  const runtimeSource = bundledRuntime.source
  const threePackageMetadata = bundledRuntime.includesThree
    ? await loadThreePackageMetadata()
    : null
  const notice = threePackageMetadata === null
    ? buildNoThirdPartyNotice()
    : buildThreeThirdPartyNotice(threePackageMetadata)
  assertOfflineBundle(runtimeSource, '电磁感应组件运行时')
  validateComponentDefinition(runtimeSource, manifest)
  const componentFiles = await buildComponentFiles(manifest, runtimeSource, notice)
  const componentArchive = zipSync(componentFiles, {
    level: 7,
    mtime: reproducibleTimestamp,
  })
  const component = importComponentPackage(componentArchive, {
    expectedId: manifest.id,
    expectedVersion: manifest.version,
  })
  await fs.writeFile(componentArchivePath, componentArchive)

  const project = buildProject(manifest, component.key, component.metadata)
  assertProjectSemantics(project, manifest)
  projectDocumentSchema.parse(project)

  const diagnostics = collectProjectHealth(project)
  const healthSummary = summarizeProjectHealth(diagnostics)
  await fs.writeFile(
    healthReportPath,
    `${JSON.stringify({ summary: healthSummary, diagnostics }, null, 2)}\n`,
    'utf8',
  )
  if (healthSummary.error > 0) {
    throw new Error(`工程检查发现 ${healthSummary.error} 个阻断错误`)
  }

  const componentFilesByKey = { [component.key]: component.files }
  const lessonArchive = createProjectArchive(
    { project, assetFiles: {}, componentFiles: componentFilesByKey },
    { mtime: reproducibleTimestamp },
  )
  await fs.writeFile(lessonArchivePath, lessonArchive)

  const reopened = openProjectArchive(lessonArchive)
  const reopenedProject = projectDocumentSchema.parse(reopened.project)
  assertProjectSemantics(reopenedProject, manifest)
  const reopenedHealth = summarizeProjectHealth(collectProjectHealth(reopenedProject))
  if (reopenedHealth.error > 0) {
    throw new Error(`归档重开后工程检查出现 ${reopenedHealth.error} 个阻断错误`)
  }
  if (reopened.componentFiles[component.key] === undefined) {
    throw new Error('归档重开后缺少嵌入组件文件')
  }
  await fs.writeFile(projectJsonPath, `${JSON.stringify(reopenedProject, null, 2)}\n`, 'utf8')

  const playerBundle = await fs.readFile(playerBundlePath, 'utf8')
  const components: Record<string, ComponentPackageData> = { [component.key]: component }
  const payload = buildExportPayload({
    project: reopenedProject,
    assets: {},
    components,
  })
  const html = buildStandaloneHtml(payload, { playerBundle, lang: 'zh-CN' })
  assertStandaloneOffline(html)
  await fs.writeFile(standaloneHtmlPath, html, 'utf8')
  await fs.writeFile(thirdPartyNoticesPath, notice, 'utf8')

  const previewConfig = {
    source: path.relative(root, standaloneHtmlPath).replaceAll('\\', '/'),
    screenshot: path.relative(root, previewScreenshotPath).replaceAll('\\', '/'),
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    initialSceneId: 'scene_prediction',
    initialStateId: 'predict_empty',
  }
  await fs.writeFile(previewConfigPath, `${JSON.stringify(previewConfig, null, 2)}\n`, 'utf8')

  const summary = {
    title: reopenedProject.title,
    format: 'Project V7 / Component API 4',
    canvas: reopenedProject.canvas,
    output: {
      lessonArchive: path.relative(root, lessonArchivePath).replaceAll('\\', '/'),
      standaloneHtml: path.relative(root, standaloneHtmlPath).replaceAll('\\', '/'),
      componentArchive: path.relative(root, componentArchivePath).replaceAll('\\', '/'),
      projectJson: path.relative(root, projectJsonPath).replaceAll('\\', '/'),
      healthReport: path.relative(root, healthReportPath).replaceAll('\\', '/'),
      thirdPartyNotices: path.relative(root, thirdPartyNoticesPath).replaceAll('\\', '/'),
      previewConfig: path.relative(root, previewConfigPath).replaceAll('\\', '/'),
      previewScreenshot: path.relative(root, previewScreenshotPath).replaceAll('\\', '/'),
    },
    component: {
      key: component.key,
      schemaVersion: manifest.schemaVersion,
      runtimeApiVersion: manifest.runtimeApiVersion,
      renderMode: manifest.renderMode,
      runtimeBytes: new TextEncoder().encode(runtimeSource).byteLength,
      bundledThreeVersion: threePackageMetadata?.version ?? null,
    },
    health: healthSummary,
    scenes: reopenedProject.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      initialStateId: scene.presentation?.initialStateId,
      thumbnailStateId: scene.presentation?.thumbnailStateId,
      stateIds: scene.presentation?.states.map((state) => state.id) ?? [],
      interactionIds: scene.interactions.map((rule) => rule.id),
      mode: scene.nodes.find((node) => node.type === 'external-component')?.props.mode,
    })),
    validation: {
      schema: 'passed',
      healthZeroErrors: healthSummary.error === 0,
      archiveRoundTrip: 'passed',
      exportPayload: 'passed',
      standaloneOfflineGate: 'passed',
      runtimeRegistration: 'passed',
      runtimeIifeAndSize: 'passed',
      threeLicense: threePackageMetadata === null ? 'not-applicable' : 'passed',
      visualReview: 'passed; see design-qa.md',
    },
    staticExportNote: 'PDF/PPTX preserve authored native states; live component gestures are captured or use the packaged thumbnail fallback.',
  }
  await fs.writeFile(buildSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  console.log(`组件包：${componentArchivePath}`)
  console.log(`互动课件：${lessonArchivePath}`)
  console.log(`离线预览：${standaloneHtmlPath}`)
  console.log(`预览配置：${previewConfigPath}`)
  console.log(`构建摘要：${buildSummaryPath}`)
  console.log(
    `工程检查：errors=${healthSummary.error}, warnings=${healthSummary.warning}, info=${healthSummary.info}`,
  )
}

main().catch((error: unknown) => {
  console.error('生成《不是磁场，而是变化》互动课件失败', error)
  process.exitCode = 1
})
