import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { build as viteBuild } from 'vite'
import { componentManifestSchema } from '../src/shared/componentSchema'
import type { ComponentManifest } from '../src/shared/componentTypes'
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
const componentDirectory = path.join(root, 'examples', 'incline-motion-3d-component')
const componentEntryPath = path.join(componentDirectory, 'runtime.entry.ts')
const componentRuntimePath = path.join(componentDirectory, 'runtime.js')
const componentArchivePath = path.join(root, 'examples', 'incline-motion-3d.h5component')
const lessonArchivePath = path.join(root, 'examples', 'incline-motion-3d-lesson.h5lesson')
const artifactDirectory = path.join(root, 'artifacts', 'incline-motion-3d')
const standaloneHtmlPath = path.join(artifactDirectory, 'incline-motion-3d-lesson.html')
const projectJsonPath = path.join(artifactDirectory, 'project.json')
const healthReportPath = path.join(artifactDirectory, 'project-health.json')
const playerBundlePath = path.join(root, 'dist-player', 'player.iife.js')
const reproducibleTimestamp = new Date('2026-07-23T00:00:00.000Z')
const timestamp = reproducibleTimestamp.toISOString()

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
  } = {},
): TextNode {
  return createTextNode({
    id,
    name,
    text,
    x,
    y,
    width,
    height,
    visible: options.visible ?? true,
    style: {
      fontSize: options.fontSize ?? 24,
      color: options.color ?? '#f8fafc',
      bold: options.bold ?? false,
      align: options.align ?? 'left',
      verticalAlign: 'middle',
      lineSpacing: 4,
      padding: options.padding ?? 0,
      overflow: 'shrink',
      backgroundColor: options.backgroundColor ?? '#000000',
      backgroundOpacity: options.backgroundOpacity ?? 0,
      cornerRadius: options.cornerRadius ?? 0,
    },
  })
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
  return createShapeNode('rounded-rectangle', {
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
      cornerRadius: options.cornerRadius ?? 20,
    },
  })
}

function componentNode(
  manifest: ComponentManifest,
  props: Record<string, unknown>,
): ExternalComponentNode {
  return createExternalComponentNode({
    id: 'incline_experiment_component',
    name: '3D 斜面运动实验',
    x: 70,
    y: 128,
    width: 1140,
    height: 450,
    component: {
      packageId: manifest.id,
      version: manifest.version,
    },
    props,
  })
}

function actionStep(id: string, action: InteractionActionPayload) {
  return {
    id,
    start: 'after-previous' as const,
    delayMs: 0,
    action,
  }
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

function baseScene(
  id: string,
  name: string,
  backgroundColor: string,
  kicker: string,
  title: string,
  subtitle: string,
  page: string,
  accent: string,
): SceneDocument {
  const scene = createScene({ id, name, backgroundColor })
  scene.nodes = [
    shapeNode(
      `${id}_top_glow`,
      '顶部光带',
      0,
      0,
      1280,
      16,
      accent,
      accent,
      { borderWidth: 0, cornerRadius: 0 },
    ),
    textNode(`${id}_kicker`, '栏目标签', kicker, 64, 28, 760, 26, {
      fontSize: 13,
      color: accent,
      bold: true,
    }),
    textNode(`${id}_title`, '页面标题', title, 64, 52, 1030, 48, {
      fontSize: 32,
      bold: true,
    }),
    textNode(`${id}_subtitle`, '学习提示', subtitle, 66, 99, 990, 28, {
      fontSize: 14,
      color: '#8da8bb',
    }),
    textNode(`${id}_page`, '页码', page, 1128, 35, 90, 68, {
      fontSize: 44,
      color: accent,
      bold: true,
      align: 'right',
    }),
  ]
  return scene
}

function buildIntroScene(): SceneDocument {
  const scene = baseScene(
    'scene_intro',
    '01 · 提出问题',
    '#061421',
    'PHYSICS QUESTION  /  物理问题',
    '怎样让斜面上的滑块更快到达底端？',
    '先作出预测，再用 3D 实验验证。',
    '01',
    '#38bdf8',
  )

  scene.nodes.push(
    shapeNode('intro_question_panel', '问题背景', 64, 150, 1152, 180, '#0d2638', '#244b63'),
    textNode(
      'intro_question',
      '问题',
      '保持接触材料不变，只改变斜面倾角。你认为哪种斜面上的滑块运动得更快？',
      112,
      175,
      1056,
      70,
      { fontSize: 24, bold: true, align: 'center' },
    ),
    textNode(
      'intro_hint',
      '作答提示',
      '点击一个预测。这里没有惩罚，实验数据会告诉你答案。',
      170,
      252,
      940,
      38,
      { fontSize: 14, color: '#8da8bb', align: 'center' },
    ),
    shapeNode('intro_choice_steep', '选择：倾角更大', 150, 360, 450, 96, '#123149', '#38bdf8', {
      borderWidth: 2,
    }),
    textNode('intro_choice_steep_text', '选择文字：倾角更大', 'A  ·  倾角更大的斜面', 170, 376, 410, 64, {
      fontSize: 21,
      bold: true,
      align: 'center',
    }),
    shapeNode('intro_choice_gentle', '选择：倾角更小', 680, 360, 450, 96, '#123149', '#64748b', {
      borderWidth: 2,
    }),
    textNode('intro_choice_gentle_text', '选择文字：倾角更小', 'B  ·  倾角更小的斜面', 700, 376, 410, 64, {
      fontSize: 21,
      bold: true,
      align: 'center',
    }),
    shapeNode('intro_feedback_panel', '预测反馈背景', 184, 486, 912, 70, '#12334a', '#38bdf8', {
      visible: false,
    }),
    textNode('intro_feedback_text', '预测反馈', '预测已记录。下一步用实验验证。', 212, 500, 856, 42, {
      fontSize: 16,
      color: '#d9f2ff',
      bold: true,
      align: 'center',
      visible: false,
    }),
    shapeNode('intro_start_button', '开始实验按钮', 460, 575, 360, 52, '#0284c7', '#7dd3fc', {
      visible: false,
      borderWidth: 1,
      cornerRadius: 16,
    }),
    textNode('intro_start_text', '开始实验文字', '进入 3D 实验室', 472, 582, 336, 38, {
      fontSize: 17,
      bold: true,
      align: 'center',
      visible: false,
    }),
  )

  scene.presentation = {
    initialStateId: 'state_prediction',
    thumbnailStateId: 'state_prediction',
    states: [
      {
        id: 'state_prediction',
        name: '等待预测',
        description: '学生选择一个斜面倾角预测',
        nodeOverrides: {},
      },
      {
        id: 'state_predict_steep',
        name: '预测：倾角更大',
        nodeOverrides: {
          intro_choice_steep: {
            style: { fillColor: '#0c4a6e', borderColor: '#7dd3fc' },
          },
          intro_feedback_panel: { visible: true },
          intro_feedback_text: {
            visible: true,
            text: '你预测：倾角越大，滑块越快。现在去实验室验证。',
          },
          intro_start_button: { visible: true },
          intro_start_text: { visible: true },
        },
      },
      {
        id: 'state_predict_gentle',
        name: '预测：倾角更小',
        nodeOverrides: {
          intro_choice_gentle: {
            style: { fillColor: '#334155', borderColor: '#cbd5e1' },
          },
          intro_feedback_panel: {
            visible: true,
            style: { fillColor: '#2e2b45', borderColor: '#a78bfa' },
          },
          intro_feedback_text: {
            visible: true,
            text: '你预测：倾角越小，滑块越快。让实验数据来检验它。',
          },
          intro_start_button: { visible: true },
          intro_start_text: { visible: true },
        },
      },
    ],
  }

  scene.interactions = [
    clickRule(
      'intro_choose_steep',
      '选择倾角更大',
      'intro_choice_steep',
      {
        type: 'presentation.set',
        stateId: 'state_predict_steep',
        transition: { duration: 220, ease: 'Sine.easeInOut' },
      },
      [{ type: 'presentation.in', stateIds: ['state_prediction'] }],
    ),
    clickRule(
      'intro_choose_gentle',
      '选择倾角更小',
      'intro_choice_gentle',
      {
        type: 'presentation.set',
        stateId: 'state_predict_gentle',
        transition: { duration: 220, ease: 'Sine.easeInOut' },
      },
      [{ type: 'presentation.in', stateIds: ['state_prediction'] }],
    ),
    clickRule(
      'intro_start_experiment',
      '进入 3D 实验室',
      'intro_start_button',
      { type: 'scene.go', sceneId: 'scene_experiment' },
      [{
        type: 'presentation.in',
        stateIds: ['state_predict_steep', 'state_predict_gentle'],
      }],
    ),
  ]
  return scene
}

function buildExperimentScene(manifest: ComponentManifest): SceneDocument {
  const scene = baseScene(
    'scene_experiment',
    '02 · 3D 探究实验',
    '#05131f',
    '3D EXPERIMENT  /  对照实验',
    '改变一个条件，观察滑块运动',
    '完成并记录两组不同参数，才能解锁规律归纳。',
    '02',
    '#22d3ee',
  )
  scene.nodes.push(
    componentNode(manifest, {
      initialAngle: 24,
      initialFriction: 0.12,
      showForceArrows: true,
      accent: '#38bdf8',
      blockColor: '#fb923c',
      surface: '#071827',
    }),
    shapeNode('experiment_complete_panel', '实验完成背景', 188, 588, 710, 44, '#064e3b', '#34d399', {
      visible: false,
      cornerRadius: 14,
    }),
    textNode(
      'experiment_complete_text',
      '实验完成提示',
      '✓ 两组对照实验已完成，可以归纳规律了',
      206,
      593,
      674,
      34,
      { fontSize: 14, color: '#a7f3d0', bold: true, align: 'center', visible: false },
    ),
    shapeNode('experiment_next_button', '进入规律归纳', 926, 588, 284, 44, '#0e7490', '#67e8f9', {
      visible: false,
      cornerRadius: 14,
    }),
    textNode('experiment_next_text', '进入规律归纳文字', '查看规律 →', 938, 593, 260, 34, {
      fontSize: 14,
      bold: true,
      align: 'center',
      visible: false,
    }),
  )
  scene.presentation = {
    initialStateId: 'state_experiment',
    thumbnailStateId: 'state_experiment',
    states: [
      {
        id: 'state_experiment',
        name: '实验进行中',
        nodeOverrides: {},
      },
      {
        id: 'state_experiment_complete',
        name: '已完成两组对照',
        description: '组件发出 comparison.ready 后进入',
        nodeOverrides: {
          experiment_complete_panel: { visible: true },
          experiment_complete_text: { visible: true },
          experiment_next_button: { visible: true },
          experiment_next_text: { visible: true },
        },
      },
    ],
  }
  scene.interactions = [
    {
      id: 'experiment_unlock_summary',
      name: '两组实验完成后解锁规律',
      enabled: true,
      trigger: {
        type: 'component.event',
        nodeId: 'incline_experiment_component',
        eventName: 'comparison.ready',
      },
      conditions: [{ type: 'presentation.in', stateIds: ['state_experiment'] }],
      actions: [
        actionStep('experiment_unlock_summary_action', {
          type: 'presentation.set',
          stateId: 'state_experiment_complete',
          transition: { duration: 260, ease: 'Sine.easeInOut' },
        }),
      ],
    },
    clickRule(
      'experiment_go_summary',
      '进入规律归纳',
      'experiment_next_button',
      { type: 'scene.go', sceneId: 'scene_summary' },
      [{ type: 'presentation.in', stateIds: ['state_experiment_complete'] }],
    ),
  ]
  return scene
}

function buildSummaryScene(): SceneDocument {
  const scene = baseScene(
    'scene_summary',
    '03 · 规律归纳',
    '#071426',
    'PATTERN FINDER  /  规律归纳',
    '哪些因素改变了滑块的加速度？',
    '点击三个变量卡片，理解实验数据背后的物理意义。',
    '03',
    '#a78bfa',
  )
  scene.nodes.push(
    shapeNode('summary_formula_panel', '公式背景', 210, 150, 860, 104, '#111c3a', '#6366f1', {
      borderWidth: 2,
    }),
    textNode('summary_formula', '加速度公式', 'a = g（sin θ − μ cos θ）', 250, 166, 780, 58, {
      fontSize: 34,
      color: '#ddd6fe',
      bold: true,
      align: 'center',
    }),
    textNode(
      'summary_formula_note',
      '公式说明',
      '当沿斜面向下的作用超过摩擦作用时，滑块开始运动。',
      300,
      219,
      680,
      24,
      { fontSize: 12, color: '#9fa9c5', align: 'center' },
    ),
    shapeNode('summary_card_angle', '变量：倾角', 100, 298, 320, 116, '#12233d', '#38bdf8', {
      borderWidth: 2,
    }),
    textNode('summary_card_angle_title', '倾角标题', 'θ  ·  斜面倾角', 126, 314, 268, 38, {
      fontSize: 20,
      color: '#7dd3fc',
      bold: true,
      align: 'center',
    }),
    textNode('summary_card_angle_note', '倾角摘要', '倾角越大\n下滑分力越大', 140, 352, 240, 48, {
      fontSize: 14,
      color: '#b5ccda',
      align: 'center',
    }),
    shapeNode('summary_card_friction', '变量：摩擦', 480, 298, 320, 116, '#12233d', '#a78bfa', {
      borderWidth: 2,
    }),
    textNode('summary_card_friction_title', '摩擦标题', 'μ  ·  摩擦系数', 506, 314, 268, 38, {
      fontSize: 20,
      color: '#c4b5fd',
      bold: true,
      align: 'center',
    }),
    textNode('summary_card_friction_note', '摩擦摘要', '摩擦越大\n运动越慢', 520, 352, 240, 48, {
      fontSize: 14,
      color: '#b5ccda',
      align: 'center',
    }),
    shapeNode('summary_card_mass', '变量：质量', 860, 298, 320, 116, '#12233d', '#fbbf24', {
      borderWidth: 2,
    }),
    textNode('summary_card_mass_title', '质量标题', 'm  ·  滑块质量', 886, 314, 268, 38, {
      fontSize: 20,
      color: '#fde68a',
      bold: true,
      align: 'center',
    }),
    textNode('summary_card_mass_note', '质量摘要', '理想模型中\n质量会抵消', 900, 352, 240, 48, {
      fontSize: 14,
      color: '#b5ccda',
      align: 'center',
    }),
    shapeNode('summary_detail_panel', '规律说明背景', 132, 450, 1016, 100, '#0d2338', '#33546b'),
    textNode(
      'summary_detail_text',
      '规律详细说明',
      '点击上方任意变量卡片，查看它怎样影响运动。',
      174,
      472,
      932,
      56,
      { fontSize: 18, color: '#d8e6ef', bold: true, align: 'center' },
    ),
    shapeNode('summary_next_button', '进入检测按钮', 460, 574, 360, 54, '#7c3aed', '#c4b5fd', {
      cornerRadius: 16,
    }),
    textNode('summary_next_text', '进入检测文字', '进入即时检测 →', 472, 582, 336, 38, {
      fontSize: 17,
      bold: true,
      align: 'center',
    }),
  )
  scene.presentation = {
    initialStateId: 'state_summary',
    thumbnailStateId: 'state_summary',
    states: [
      {
        id: 'state_summary',
        name: '规律总览',
        nodeOverrides: {},
      },
      {
        id: 'state_angle_detail',
        name: '倾角规律',
        nodeOverrides: {
          summary_card_angle: {
            style: { fillColor: '#0c4a6e', borderColor: '#7dd3fc' },
          },
          summary_detail_panel: {
            style: { fillColor: '#082f49', borderColor: '#38bdf8' },
          },
          summary_detail_text: {
            text: '倾角增大时，sin θ 增大，沿斜面向下的作用增强，所以加速度通常增大。',
          },
        },
      },
      {
        id: 'state_friction_detail',
        name: '摩擦规律',
        nodeOverrides: {
          summary_card_friction: {
            style: { fillColor: '#312e81', borderColor: '#c4b5fd' },
          },
          summary_detail_panel: {
            style: { fillColor: '#25204a', borderColor: '#a78bfa' },
          },
          summary_detail_text: {
            text: '摩擦系数增大时，μ cos θ 项增大，摩擦作用更强，加速度减小，甚至可能不下滑。',
          },
        },
      },
      {
        id: 'state_mass_detail',
        name: '质量规律',
        nodeOverrides: {
          summary_card_mass: {
            style: { fillColor: '#45380d', borderColor: '#fde68a' },
          },
          summary_detail_panel: {
            style: { fillColor: '#332d16', borderColor: '#fbbf24' },
          },
          summary_detail_text: {
            text: '在这个理想滑动模型中，重力分力和摩擦力都与质量成正比，因此计算加速度时质量抵消。',
          },
        },
      },
    ],
  }
  scene.interactions = [
    clickRule('summary_show_angle', '查看倾角规律', 'summary_card_angle', {
      type: 'presentation.set',
      stateId: 'state_angle_detail',
      transition: { duration: 220, ease: 'Sine.easeInOut' },
    }),
    clickRule('summary_show_friction', '查看摩擦规律', 'summary_card_friction', {
      type: 'presentation.set',
      stateId: 'state_friction_detail',
      transition: { duration: 220, ease: 'Sine.easeInOut' },
    }),
    clickRule('summary_show_mass', '查看质量规律', 'summary_card_mass', {
      type: 'presentation.set',
      stateId: 'state_mass_detail',
      transition: { duration: 220, ease: 'Sine.easeInOut' },
    }),
    clickRule('summary_go_quiz', '进入即时检测', 'summary_next_button', {
      type: 'scene.go',
      sceneId: 'scene_quiz',
    }),
  ]
  return scene
}

function buildQuizScene(): SceneDocument {
  const scene = baseScene(
    'scene_quiz',
    '04 · 即时检测',
    '#0b1222',
    'QUICK CHECK  /  即时检测',
    '哪一个滑块会更快到达斜面底端？',
    '两组实验的斜面长度相同，重力加速度相同。',
    '04',
    '#34d399',
  )
  scene.nodes.push(
    shapeNode('quiz_question_panel', '题目背景', 110, 150, 1060, 112, '#102239', '#2d4f65'),
    textNode(
      'quiz_question',
      '检测题',
      '比较下列两组条件，选择加速度更大、到达底端更快的一组。',
      150,
      171,
      980,
      68,
      { fontSize: 23, bold: true, align: 'center' },
    ),
    shapeNode('quiz_option_a', '选项 A', 120, 300, 470, 132, '#123149', '#38bdf8', {
      borderWidth: 2,
    }),
    textNode('quiz_option_a_title', '选项 A 标题', 'A  ·  倾角 35°', 150, 318, 410, 42, {
      fontSize: 22,
      color: '#7dd3fc',
      bold: true,
      align: 'center',
    }),
    textNode('quiz_option_a_detail', '选项 A 条件', '摩擦系数 μ = 0.10', 150, 369, 410, 34, {
      fontSize: 16,
      color: '#bdd2df',
      align: 'center',
    }),
    shapeNode('quiz_option_b', '选项 B', 690, 300, 470, 132, '#123149', '#a78bfa', {
      borderWidth: 2,
    }),
    textNode('quiz_option_b_title', '选项 B 标题', 'B  ·  倾角 20°', 720, 318, 410, 42, {
      fontSize: 22,
      color: '#c4b5fd',
      bold: true,
      align: 'center',
    }),
    textNode('quiz_option_b_detail', '选项 B 条件', '摩擦系数 μ = 0.30', 720, 369, 410, 34, {
      fontSize: 16,
      color: '#bdd2df',
      align: 'center',
    }),
    shapeNode('quiz_feedback_panel', '检测反馈背景', 170, 474, 940, 88, '#0d2933', '#34d399', {
      visible: false,
    }),
    textNode('quiz_feedback_text', '检测反馈', '回答正确。', 208, 490, 864, 56, {
      fontSize: 18,
      color: '#a7f3d0',
      bold: true,
      align: 'center',
      visible: false,
    }),
    shapeNode('quiz_retry_button', '再试一次按钮', 460, 582, 360, 50, '#7c2d12', '#fb923c', {
      visible: false,
      cornerRadius: 16,
    }),
    textNode('quiz_retry_text', '再试一次文字', '再试一次', 472, 588, 336, 38, {
      fontSize: 17,
      bold: true,
      align: 'center',
      visible: false,
    }),
    shapeNode('quiz_revisit_button', '返回实验按钮', 460, 582, 360, 50, '#047857', '#6ee7b7', {
      visible: false,
      cornerRadius: 16,
    }),
    textNode('quiz_revisit_text', '返回实验文字', '完成！返回实验自由探究', 472, 588, 336, 38, {
      fontSize: 16,
      bold: true,
      align: 'center',
      visible: false,
    }),
  )
  scene.presentation = {
    initialStateId: 'state_quiz',
    thumbnailStateId: 'state_quiz',
    states: [
      {
        id: 'state_quiz',
        name: '等待作答',
        nodeOverrides: {},
      },
      {
        id: 'state_quiz_correct',
        name: '回答正确',
        nodeOverrides: {
          quiz_option_a: {
            style: { fillColor: '#064e3b', borderColor: '#6ee7b7' },
          },
          quiz_feedback_panel: { visible: true },
          quiz_feedback_text: {
            visible: true,
            text: '正确！A 的倾角更大、摩擦更小，因此沿斜面向下的合作用更强。',
          },
          quiz_revisit_button: { visible: true },
          quiz_revisit_text: { visible: true },
        },
      },
      {
        id: 'state_quiz_wrong',
        name: '回答错误',
        nodeOverrides: {
          quiz_option_b: {
            style: { fillColor: '#4c1d2f', borderColor: '#fb7185' },
          },
          quiz_feedback_panel: {
            visible: true,
            style: { fillColor: '#3b1f2b', borderColor: '#fb7185' },
          },
          quiz_feedback_text: {
            visible: true,
            text: '再想一想：倾角增大有利于下滑，而摩擦系数增大会阻碍下滑。',
            style: { color: '#fecdd3' },
          },
          quiz_retry_button: { visible: true },
          quiz_retry_text: { visible: true },
        },
      },
    ],
  }
  scene.interactions = [
    clickRule(
      'quiz_choose_a',
      '选择 A',
      'quiz_option_a',
      {
        type: 'presentation.set',
        stateId: 'state_quiz_correct',
        transition: { duration: 220, ease: 'Sine.easeInOut' },
      },
      [{ type: 'presentation.in', stateIds: ['state_quiz'] }],
    ),
    clickRule(
      'quiz_choose_b',
      '选择 B',
      'quiz_option_b',
      {
        type: 'presentation.set',
        stateId: 'state_quiz_wrong',
        transition: { duration: 220, ease: 'Sine.easeInOut' },
      },
      [{ type: 'presentation.in', stateIds: ['state_quiz'] }],
    ),
    clickRule(
      'quiz_retry',
      '再试一次',
      'quiz_retry_button',
      {
        type: 'presentation.set',
        stateId: 'state_quiz',
        transition: { duration: 180, ease: 'Sine.easeInOut' },
      },
      [{ type: 'presentation.in', stateIds: ['state_quiz_wrong'] }],
    ),
    clickRule(
      'quiz_revisit_experiment',
      '返回实验自由探究',
      'quiz_revisit_button',
      { type: 'scene.go', sceneId: 'scene_experiment' },
      [{ type: 'presentation.in', stateIds: ['state_quiz_correct'] }],
    ),
  ]
  return scene
}

function buildProject(
  manifest: ComponentManifest,
  componentMetadata: ReturnType<typeof importComponentPackage>['metadata'],
): ProjectDocument {
  const project = createProject({
    id: 'project_incline_motion_3d',
    title: '斜面运动 3D 互动实验',
    now: timestamp,
    idFactory: (() => {
      let value = 0
      return () => String(++value).padStart(3, '0')
    })(),
  })
  project.scenes = [
    buildIntroScene(),
    buildExperimentScene(manifest),
    buildSummaryScene(),
    buildQuizScene(),
  ]
  project.componentPackages[manifest.id] = componentMetadata

  const controller = project.globalLayer.find(
    (item) => item.node.type === 'teacher-controller',
  )
  if (controller?.node.type === 'teacher-controller') {
    controller.node.name = '课件导航控制器'
    controller.node.title = '斜面运动实验'
    controller.node.x = 110
    controller.node.y = 648
    controller.node.width = 1060
    controller.node.height = 58
    controller.node.compact = true
    controller.node.defaultCollapsed = false
    controller.node.style.backgroundColor = '#0b1d2c'
    controller.node.style.backgroundOpacity = 0.96
    controller.node.style.accentColor = '#38bdf8'
    controller.node.style.cornerRadius = 14
  }
  return projectDocumentSchema.parse(project)
}

async function bundleComponentRuntime(): Promise<string> {
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
        name: 'InclineMotion3DComponent',
        formats: ['iife'],
        fileName: () => 'runtime.js',
      },
    },
  })
  const source = await fs.readFile(componentRuntimePath, 'utf8')
  if (/(^|[;\n\r])\s*import\s*(?:[(\s{*]|["'])/m.test(source)) {
    throw new Error('组件运行时仍包含 import')
  }
  if (/(^|[;\n\r])\s*export\s+(?:default|const|let|var|function|class|\{|\*)/m.test(source)) {
    throw new Error('组件运行时仍包含 export')
  }
  if (/\brequire\s*\(/.test(source)) {
    throw new Error('组件运行时仍包含 require')
  }
  if (!source.includes('CoursewareComponent')) {
    throw new Error('组件运行时没有注册 CoursewareComponent')
  }
  return source
}

async function main(): Promise<void> {
  await fs.mkdir(artifactDirectory, { recursive: true })
  const runtimeSource = await bundleComponentRuntime()
  const [manifestText, thumbnail] = await Promise.all([
    fs.readFile(path.join(componentDirectory, 'manifest.json'), 'utf8'),
    fs.readFile(path.join(componentDirectory, 'thumbnail.svg')),
  ])
  const manifest = componentManifestSchema.parse(JSON.parse(manifestText) as unknown)
  const componentFiles = {
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
    'runtime.js': strToU8(runtimeSource),
    'thumbnail.svg': Uint8Array.from(thumbnail),
  }
  const componentArchive = zipSync(componentFiles, {
    level: 7,
    mtime: reproducibleTimestamp,
  })
  const component = importComponentPackage(componentArchive, {
    expectedId: manifest.id,
    expectedVersion: manifest.version,
  })
  await fs.writeFile(componentArchivePath, componentArchive)

  const project = buildProject(component.manifest, component.metadata)
  const diagnostics = collectProjectHealth(project)
  const healthSummary = summarizeProjectHealth(diagnostics)
  await fs.writeFile(healthReportPath, `${JSON.stringify({
    summary: healthSummary,
    diagnostics,
  }, null, 2)}\n`, 'utf8')
  if (healthSummary.error > 0) {
    throw new Error(`工程检查发现 ${healthSummary.error} 个阻断错误`)
  }

  const lessonArchive = createProjectArchive({
    project,
    assetFiles: {},
    componentFiles: { [component.key]: component.files },
  }, { mtime: reproducibleTimestamp })
  await fs.writeFile(lessonArchivePath, lessonArchive)

  const reopened = openProjectArchive(lessonArchive)
  projectDocumentSchema.parse(reopened.project)
  if (reopened.project.schemaVersion !== 7) throw new Error('工程不是 Project V7')
  if (reopened.project.scenes.length !== 4) throw new Error('工程场景数量不是 4')
  const experimentScene = reopened.project.scenes.find((scene) => scene.id === 'scene_experiment')
  if (!experimentScene) throw new Error('缺少 3D 实验场景')
  if (experimentScene.nodes.filter((node) => node.type === 'external-component').length !== 1) {
    throw new Error('3D 实验场景必须包含且仅包含一个实验组件')
  }

  await fs.writeFile(projectJsonPath, `${JSON.stringify(reopened.project, null, 2)}\n`, 'utf8')
  const playerBundle = await fs.readFile(playerBundlePath, 'utf8')
  const payload = buildExportPayload({
    project: reopened.project,
    components: { [component.manifest.id]: component },
  })
  const html = buildStandaloneHtml(payload, { playerBundle, lang: 'zh-CN' })
  if (/https?:\/\//i.test(html)) throw new Error('离线 HTML 中出现远程 URL')
  await fs.writeFile(standaloneHtmlPath, html, 'utf8')

  console.log(`3D 组件：${componentArchivePath}`)
  console.log(`互动课件：${lessonArchivePath}`)
  console.log(`离线预览：${standaloneHtmlPath}`)
  console.log(`工程检查：errors=${healthSummary.error}, warnings=${healthSummary.warning}, info=${healthSummary.info}`)
}

main().catch((error: unknown) => {
  console.error('生成斜面运动 3D 互动课件失败', error)
  process.exitCode = 1
})
