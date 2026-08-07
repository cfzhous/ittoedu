import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import type {
  ComponentManifest,
  ComponentManifestV3,
} from '../src/shared/componentTypes'
import type {
  BaseNode,
  ImageNode,
  ProjectDocument,
  ShapeNode,
  TextNode,
} from '../src/shared/projectTypes'
import type { RuntimeDocument } from '../src/shared/runtimeTypes'
import { componentManifestSchema } from '../src/shared/componentSchema'
import { projectDocumentSchema } from '../src/shared/projectSchema'
import { importComponentPackage } from '../src/renderer/components/importComponentPackage'
import {
  createProjectArchive,
  openProjectArchive,
} from '../src/renderer/project/projectArchive'
import { buildExportPayload } from '../src/renderer/export/buildExportPayload'
import { buildStandaloneHtml } from '../src/renderer/export/buildStandaloneHtml'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')
const exampleDirectory = path.join(projectRoot, 'examples', 'runtime-v3-complete')
const runtimeDirectory = path.join(exampleDirectory, 'runtimes')
const componentDirectory = path.join(
  exampleDirectory,
  'components',
  'global-controls',
)
const assetDirectory = path.join(exampleDirectory, 'assets')
const playerBundlePath = path.join(projectRoot, 'dist-player', 'player.iife.js')

const projectJsonPath = path.join(exampleDirectory, 'project.json')
const componentArchivePath = path.join(
  exampleDirectory,
  'runtime-v3-global-controls.h5component',
)
const lessonArchivePath = path.join(
  exampleDirectory,
  'runtime-v3-complete-example.h5lesson',
)
const standaloneHtmlPath = path.join(
  exampleDirectory,
  'runtime-v3-complete-example.html',
)

const reproducibleTimestamp = new Date('2026-07-21T00:00:00.000Z')
const timestamp = reproducibleTimestamp.toISOString()

const globalContent: RuntimeDocument['content'] = {
  values: {
    ariaLabel: '课程全局状态面板',
    hudTitle: 'Project V8 跨场景状态',
    progressTemplate: '已到访 {current}/{total} · {scene}',
    challengePending: '挑战状态：等待完成 · 全局组件操作 {count} 次',
    challengeComplete: '挑战状态：已经完成 · 全局组件操作 {count} 次',
    'sceneName.scene_intro': '01 认识 V3',
    'sceneName.scene_challenge': '02 场景互动',
    'sceneName.scene_summary': '03 课程小结',
    'status.courseStarting': '正在创建全局运行时',
    'status.courseStarted': '课程已启动；全局状态将在普通翻页时保留',
    'status.courseRestarted': '课程已重开；课程状态已清空并重新创建',
    'status.sceneEntered': '已进入：{scene}',
    'status.introCompleted': '场景运行时已完成原生节点绑定互动',
    'status.challengePassed': '挑战已完成；通往总结页的导航守卫已放行',
    'status.componentUsed': '全局组件执行：{action}',
    'status.navigationBlocked': '请先完成第二场景的互动，再进入课程小结',
    'action.previous': '上一页',
    'action.replay': '重播本页',
    'action.next': '下一页',
    'action.restart': '重开课程',
  },
  metadata: {
    ariaLabel: { label: '全局面板无障碍名称' },
    hudTitle: { label: '全局 HUD 标题', maxLength: 80 },
    progressTemplate: {
      label: '进度格式',
      description: '支持 {current}、{total}、{scene}',
      maxLength: 120,
    },
    challengePending: { label: '挑战未完成状态' },
    challengeComplete: { label: '挑战已完成状态' },
    'status.navigationBlocked': {
      label: '导航阻止提示',
      multiline: true,
      maxLength: 200,
    },
  },
}

const introContent: RuntimeDocument['content'] = {
  values: {
    panelAriaLabel: '第一场景互动说明',
    missingBindingError: '缺少 interactionCard 节点绑定，无法启动第一场景互动。',
    instruction: '点击左侧发光卡片，直接触发写在 scene.runtime 中的一次性互动。',
    successMessage: '完成：运行时为原生节点绑定了输入和 Tween，并把跨页事实写入 courseState。',
    alreadyCompleteMessage: '该步骤在本轮课程中已经完成；重播本页不会清空 courseState。',
    continueLabel: '进入场景互动挑战',
  },
  metadata: {
    panelAriaLabel: { label: '互动面板无障碍名称' },
    missingBindingError: { label: '节点绑定错误提示', maxLength: 120 },
    instruction: { label: '互动说明', multiline: true, maxLength: 220 },
    successMessage: { label: '完成反馈', multiline: true, maxLength: 240 },
    alreadyCompleteMessage: {
      label: '重播后的反馈',
      multiline: true,
      maxLength: 240,
    },
    continueLabel: { label: '继续按钮', maxLength: 40 },
  },
}

const challengeContent: RuntimeDocument['content'] = {
  values: {
    panelAriaLabel: '第二场景知识挑战',
    prompt: '哪一种实现最适合“只在当前场景使用一次、但效果很复杂”的互动？',
    optionA: '强制制作成全局组件',
    optionB: '直接写入 scene.runtime',
    optionC: '降级成静态图片',
    initialFeedback: '请选择一个方案。全局控制条“下一页”会经过导航守卫。',
    correctFeedback: '正确。一次性场景互动无需为了接入编辑器而组件化。',
    wrongFeedbackTemplate: '第 {attempts} 次尝试尚未命中：先判断是否真的需要复用。',
    alreadyPassedFeedback: '本轮课程已经通过；重播本页会重建界面，但保留 courseState。',
    continueLabel: '进入课程小结',
  },
  metadata: {
    panelAriaLabel: { label: '挑战面板无障碍名称' },
    prompt: { label: '题干', multiline: true, maxLength: 240 },
    optionA: { label: '选项 A', maxLength: 80 },
    optionB: { label: '选项 B', maxLength: 80 },
    optionC: { label: '选项 C', maxLength: 80 },
    initialFeedback: { label: '初始提示', multiline: true, maxLength: 180 },
    correctFeedback: { label: '正确反馈', multiline: true, maxLength: 180 },
    wrongFeedbackTemplate: {
      label: '错误反馈格式',
      description: '支持 {attempts}',
      multiline: true,
      maxLength: 180,
    },
    alreadyPassedFeedback: {
      label: '重播后的通过反馈',
      multiline: true,
      maxLength: 200,
    },
    continueLabel: { label: '继续按钮', maxLength: 40 },
  },
}

function baseNode(
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Omit<BaseNode, 'type'> {
  return {
    id,
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    playbackInitialVisibility: 'inherit',
  }
}

function startsHidden<T extends BaseNode>(node: T): T {
  return { ...node, playbackInitialVisibility: 'hidden' }
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
  } = {},
): TextNode {
  return {
    ...baseNode(id, name, x, y, width, height),
    type: 'text',
    text,
    runs: [],
    style: {
      fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
      fontSize: options.fontSize ?? 28,
      color: options.color ?? '#f8fafc',
      bold: options.bold ?? false,
      italic: false,
      underline: false,
      strike: false,
      highlightColor: null,
      align: options.align ?? 'left',
      verticalAlign: 'middle',
      writingMode: 'horizontal',
      lineSpacing: 1.35,
      letterSpacing: 0,
      padding: 12,
      overflow: 'shrink',
      backgroundColor: options.backgroundColor ?? '#000000',
      backgroundOpacity: options.backgroundOpacity ?? 0,
      cornerRadius: options.cornerRadius ?? 0,
    },
  }
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
  cornerRadius = 24,
): ShapeNode {
  return {
    ...baseNode(id, name, x, y, width, height),
    type: 'shape',
    shapeType: 'rounded-rectangle',
    style: {
      fillColor,
      fillOpacity: 1,
      borderColor,
      borderOpacity: 1,
      borderWidth: 3,
      lineStyle: 'solid',
      cornerRadius,
      startArrow: 'none',
      endArrow: 'none',
    },
  }
}

function imageNode(
  id: string,
  name: string,
  assetId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageNode {
  return {
    ...baseNode(id, name, x, y, width, height),
    type: 'image',
    assetId,
    preserveAspectRatio: true,
    fit: 'contain',
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    cropX: 0.5,
    cropY: 0.5,
    flipX: false,
    flipY: false,
    cornerRadius: 0,
    feather: { amount: 0, mode: 'rectangle' },
  }
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function learningOrbitSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="420" viewBox="0 0 520 420">
  <defs>
    <radialGradient id="g" cx="50%" cy="45%" r="55%"><stop stop-color="#7dd3fc" stop-opacity=".95"/><stop offset="1" stop-color="#0c4a6e" stop-opacity=".1"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="8"/></filter>
  </defs>
  <rect width="520" height="420" rx="42" fill="#082f49"/>
  <circle cx="260" cy="210" r="145" fill="url(#g)" filter="url(#blur)"/>
  <g fill="none" stroke="#7dd3fc" stroke-width="4" opacity=".9">
    <ellipse cx="260" cy="210" rx="180" ry="74" transform="rotate(-18 260 210)"/>
    <ellipse cx="260" cy="210" rx="168" ry="65" transform="rotate(58 260 210)"/>
  </g>
  <circle cx="260" cy="210" r="68" fill="#38bdf8"/>
  <circle cx="113" cy="250" r="17" fill="#f0abfc"/>
  <circle cx="390" cy="109" r="14" fill="#fde68a"/>
  <circle cx="367" cy="326" r="12" fill="#86efac"/>
</svg>\n`
}

function globalFallbackSvg(): string {
  const progress = globalContent.values.progressTemplate
    .replace('{current}', '1')
    .replace('{total}', '3')
    .replace('{scene}', globalContent.values['sceneName.scene_intro'] ?? '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect x="24" y="22" width="620" height="82" rx="18" fill="#082f49" fill-opacity=".94" stroke="#7dd3fc"/>
  <text x="44" y="53" fill="#7dd3fc" font-family="Microsoft YaHei,sans-serif" font-size="18" font-weight="700">${xml(globalContent.values.hudTitle ?? '')}</text>
  <text x="225" y="52" fill="#e0f2fe" font-family="Microsoft YaHei,sans-serif" font-size="14" font-weight="700">${xml(progress)}</text>
  <text x="225" y="79" fill="#bae6fd" font-family="Microsoft YaHei,sans-serif" font-size="13">${xml((globalContent.values.challengePending ?? '').replace('{count}', '0'))}</text>
</svg>\n`
}

function introFallbackSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <circle cx="360" cy="350" r="150" fill="none" stroke="#38bdf8" stroke-width="4" opacity=".8"/>
  <rect x="760" y="170" width="430" height="250" rx="26" fill="#082f49" fill-opacity=".94" stroke="#7dd3fc"/>
  <foreignObject x="788" y="198" width="374" height="194"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#e0f2fe;font:700 22px/1.55 Microsoft YaHei,sans-serif">${xml(introContent.values.instruction ?? '')}</div></foreignObject>
</svg>\n`
}

function challengeFallbackSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#1e1b4b"/>
  <text x="640" y="112" text-anchor="middle" fill="#ede9fe" font-family="Microsoft YaHei,sans-serif" font-size="34" font-weight="700">场景运行时：无需强制组件化</text>
  <rect x="155" y="150" width="970" height="390" rx="30" fill="#2e1065" stroke="#c4b5fd"/>
  <foreignObject x="205" y="184" width="870" height="94"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#f5f3ff;text-align:center;font:700 28px/1.45 Microsoft YaHei,sans-serif">${xml(challengeContent.values.prompt ?? '')}</div></foreignObject>
  ${['optionA', 'optionB', 'optionC'].map((key, index) => `<g><rect x="${205 + index * 290}" y="300" width="270" height="108" rx="18" fill="#4c1d95" stroke="#c4b5fd"/><foreignObject x="${220 + index * 290}" y="320" width="240" height="68"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#f5f3ff;text-align:center;font:700 18px/1.45 Microsoft YaHei,sans-serif">${xml(challengeContent.values[key] ?? '')}</div></foreignObject></g>`).join('')}
  <text x="640" y="480" text-anchor="middle" fill="#ddd6fe" font-family="Microsoft YaHei,sans-serif" font-size="17">${xml(challengeContent.values.initialFeedback ?? '')}</text>
</svg>\n`
}

function runtimeDocument(
  source: string,
  renderMode: RuntimeDocument['renderMode'],
  content: RuntimeDocument['content'],
  staticFallback: RuntimeDocument['staticFallback'],
  nodeBindings?: Record<string, string>,
): RuntimeDocument {
  return {
    runtimeApiVersion: 1,
    enabled: true,
    renderMode,
    source,
    content,
    assets: {},
    ...(nodeBindings === undefined ? {} : { nodeBindings }),
    ...(staticFallback === undefined ? {} : { staticFallback }),
  }
}

function validateRuntimeDefinition(source: string, label: string): void {
  let definition: unknown
  const api = {
    define(candidate: unknown) {
      if (definition !== undefined) throw new Error(`${label} 重复注册`)
      definition = candidate
    },
  }
  const execute = new Function(
    'CoursewareRuntime',
    `"use strict";\n${source}`,
  ) as (runtimeApi: typeof api) => void
  execute(api)
  if (
    typeof definition !== 'object' ||
    definition === null ||
    Reflect.get(definition, 'runtimeApiVersion') !== 1 ||
    typeof Reflect.get(definition, 'create') !== 'function'
  ) {
    throw new Error(`${label} 未注册有效的 Runtime API 1 定义`)
  }
}

function validateComponentDefinition(
  source: string,
  manifest: ComponentManifest,
): void {
  let definition: unknown
  const runtimeWindow = {
    CoursewareComponent: {
      define(candidate: unknown) {
        if (definition !== undefined) throw new Error('组件 runtime 重复注册')
        definition = candidate
      },
    },
  }
  const execute = new Function('window', `"use strict";\n${source}`) as (
    value: typeof runtimeWindow,
  ) => void
  execute(runtimeWindow)
  if (
    typeof definition !== 'object' ||
    definition === null ||
    Reflect.get(definition, 'id') !== manifest.id ||
    Reflect.get(definition, 'runtimeApiVersion') !== manifest.runtimeApiVersion ||
    typeof Reflect.get(definition, 'create') !== 'function'
  ) {
    throw new Error('组件 runtime 注册内容与 manifest 不一致')
  }
}

async function readUtf8(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

async function main(): Promise<void> {
  await fs.mkdir(assetDirectory, { recursive: true })

  const [
    globalRuntimeSource,
    introRuntimeSource,
    challengeRuntimeSource,
    componentManifestText,
    componentRuntimeSource,
    playerBundle,
  ] = await Promise.all([
    readUtf8(path.join(runtimeDirectory, 'global-runtime.js')),
    readUtf8(path.join(runtimeDirectory, 'scene-intro-runtime.js')),
    readUtf8(path.join(runtimeDirectory, 'scene-challenge-runtime.js')),
    readUtf8(path.join(componentDirectory, 'manifest.json')),
    readUtf8(path.join(componentDirectory, 'runtime.js')),
    readUtf8(playerBundlePath).catch((error: unknown) => {
      throw new Error(
        '缺少 dist-player/player.iife.js；请先运行 npm run build:player',
        { cause: error },
      )
    }),
  ])

  validateRuntimeDefinition(globalRuntimeSource, '全局运行时')
  validateRuntimeDefinition(introRuntimeSource, '第一场景运行时')
  validateRuntimeDefinition(challengeRuntimeSource, '第二场景运行时')

  const manifestResult = componentManifestSchema.safeParse(
    JSON.parse(componentManifestText) as unknown,
  )
  if (!manifestResult.success || manifestResult.data.schemaVersion !== 3) {
    throw new Error(
      `V3 组件 manifest 无效：${manifestResult.success ? '版本不是 V3' : manifestResult.error.message}`,
    )
  }
  const manifest: ComponentManifestV3 = manifestResult.data
  validateComponentDefinition(componentRuntimeSource, manifest)

  const componentFiles = {
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
    'runtime.js': strToU8(componentRuntimeSource),
  }
  const componentArchive = zipSync(componentFiles, {
    level: 6,
    mtime: reproducibleTimestamp,
  })
  const importedComponent = importComponentPackage(componentArchive, {
    expectedId: manifest.id,
    expectedVersion: manifest.version,
  })

  const generatedAssets: Record<string, { filename: string; source: string }> = {
    asset_learning_orbit: {
      filename: 'learning-orbit.svg',
      source: learningOrbitSvg(),
    },
    asset_global_runtime_fallback: {
      filename: 'global-runtime-fallback.svg',
      source: globalFallbackSvg(),
    },
    asset_intro_runtime_fallback: {
      filename: 'intro-runtime-fallback.svg',
      source: introFallbackSvg(),
    },
    asset_challenge_runtime_fallback: {
      filename: 'challenge-runtime-fallback.svg',
      source: challengeFallbackSvg(),
    },
  }

  const assetFiles: Record<string, Uint8Array> = {}
  const projectAssets: ProjectDocument['assets'] = {}
  for (const [assetId, asset] of Object.entries(generatedAssets)) {
    const bytes = strToU8(asset.source)
    assetFiles[assetId] = bytes
    projectAssets[assetId] = {
      id: assetId,
      filename: asset.filename,
      mimeType: 'image/svg+xml',
      kind: 'image',
      path: `assets/${asset.filename}`,
      byteLength: bytes.byteLength,
      width: assetId === 'asset_learning_orbit' ? 520 : 1280,
      height: assetId === 'asset_learning_orbit' ? 420 : 720,
    }
    await fs.writeFile(path.join(assetDirectory, asset.filename), bytes)
  }

  const projectCandidate: ProjectDocument = {
    schemaVersion: 8,
    id: 'project_runtime_v3_complete_example',
    title: 'Runtime V3 完整互动示例',
    createdAt: timestamp,
    updatedAt: timestamp,
    canvas: { width: 1280, height: 720 },
    assets: projectAssets,
    componentPackages: {
      [importedComponent.key]: importedComponent.metadata,
    },
    globalRuntime: runtimeDocument(
      globalRuntimeSource,
      'dom',
      globalContent,
      {
        assetId: 'asset_global_runtime_fallback',
        coverage: 'runtime-layer',
        layer: 'overlay',
      },
    ),
    globalLayer: [
      {
        node: {
          ...baseNode(
            'global_controls_instance',
            'V3 全局课程控制条',
            110,
            620,
            1060,
            78,
          ),
          type: 'external-component',
          component: {
            packageId: manifest.id,
            version: manifest.version,
          },
          props: {
            content: {
              title: 'V3 全局控制台',
              status: {
                ready: '全局组件已创建；翻页后实例和操作次数都会保留',
              },
            },
            accent: '#7dd3fc',
          },
        },
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
    ],
    globalInteractions: [],
    media: {
      audio: {
        defaultMuted: false,
        masterVolume: 1,
        channelVolumes: {
          music: 1,
          narration: 1,
          sfx: 1,
          ui: 1,
          video: 1,
        },
        sounds: {},
        narrationDucking: {
          enabled: true,
          musicVolume: 0.3,
          fadeMs: 250,
        },
      },
    },
    playback: {
      controls: 'none',
      keyboardNavigation: true,
      presenter: {
        enabled: true,
        strategy: 'scene-navigation',
        additionalBindings: [],
      },
    },
    scenes: [
      {
        id: 'scene_intro',
        name: '01 认识 V3',
        backgroundColor: '#071a2b',
        interactions: [
          {
            id: 'intro_scene_entry_choreography',
            name: '入页节奏编排',
            enabled: true,
            trigger: { type: 'scene.enter' },
            conditions: [],
            actions: [
              {
                id: 'intro_title_enter',
                start: 'after-previous',
                delayMs: 0,
                action: {
                  type: 'node.enter',
                  nodeId: 'intro_title',
                  effect: 'fade',
                  durationMs: 320,
                  easing: 'ease-out',
                },
              },
              {
                id: 'intro_orbit_enter',
                start: 'with-previous',
                delayMs: 80,
                action: {
                  type: 'node.enter',
                  nodeId: 'intro_orbit_image',
                  effect: 'slide',
                  direction: 'right',
                  durationMs: 420,
                  easing: 'ease-out',
                },
              },
              {
                id: 'intro_card_enter',
                start: 'after-previous',
                delayMs: 60,
                action: {
                  type: 'node.enter',
                  nodeId: 'intro_interaction_card',
                  effect: 'scale',
                  durationMs: 260,
                  easing: 'ease-out',
                },
              },
              {
                id: 'intro_label_enter',
                start: 'with-previous',
                delayMs: 120,
                action: {
                  type: 'node.enter',
                  nodeId: 'intro_action_label',
                  effect: 'fade',
                  durationMs: 220,
                  easing: 'ease-out',
                },
              },
            ],
          },
          {
            id: 'intro_runtime_completion_exit',
            name: '操作完成后退出提示',
            enabled: true,
            trigger: {
              type: 'runtime.event',
              scope: 'scene',
              eventName: 'intro:complete',
            },
            conditions: [],
            actions: [{
              id: 'intro_label_exit',
              start: 'after-previous',
              delayMs: 0,
              action: {
                type: 'node.exit',
                nodeId: 'intro_action_label',
                effect: 'fade',
                durationMs: 180,
                easing: 'ease-in',
              },
            }],
          },
          {
            id: 'intro_after_exit_reveal_note',
            name: '退场完成后显示说明',
            enabled: true,
            trigger: {
              type: 'animation.completed',
              actionId: 'intro_label_exit',
            },
            conditions: [],
            actions: [{
              id: 'intro_note_enter',
              start: 'after-previous',
              delayMs: 80,
              action: {
                type: 'node.enter',
                nodeId: 'intro_editable_note',
                effect: 'slide',
                direction: 'up',
                durationMs: 360,
                easing: 'ease-out',
              },
            }],
          },
        ],
        nodes: [
          startsHidden(textNode(
            'intro_title',
            '场景标题',
            '效果第一，编辑器只是轻量编辑容器',
            70,
            112,
            1120,
            72,
            { fontSize: 38, bold: true, align: 'center', color: '#e0f2fe' },
          )),
          startsHidden(imageNode(
            'intro_orbit_image',
            '可替换的原生示意图片',
            'asset_learning_orbit',
            82,
            202,
            540,
            350,
          )),
          startsHidden(shapeNode(
            'intro_interaction_card',
            '场景运行时点击热点',
            210,
            255,
            300,
            230,
            '#0c4a6e',
            '#7dd3fc',
            34,
          )),
          startsHidden(textNode(
            'intro_action_label',
            '热点内原生文字',
            '点击探索 V3',
            245,
            318,
            230,
            95,
            {
              fontSize: 29,
              bold: true,
              align: 'center',
              color: '#f0f9ff',
            },
          )),
          startsHidden(textNode(
            'intro_editable_note',
            '原生文字说明',
            '这段文字可直接双击编辑；右侧互动文案来自 RuntimeDocument.content.values。',
            90,
            535,
            1090,
            60,
            { fontSize: 18, align: 'center', color: '#bae6fd' },
          )),
        ],
        runtime: runtimeDocument(
          introRuntimeSource,
          'hybrid',
          introContent,
          {
            assetId: 'asset_intro_runtime_fallback',
            coverage: 'runtime-layer',
            layer: 'overlay',
          },
          { interactionCard: 'intro_interaction_card' },
        ),
      },
      {
        id: 'scene_challenge',
        name: '02 场景互动',
        backgroundColor: '#1e1b4b',
        interactions: [],
        nodes: [
          textNode(
            'challenge_title',
            '场景标题',
            '场景运行时：无需强制组件化',
            110,
            92,
            1060,
            66,
            { fontSize: 34, bold: true, align: 'center', color: '#ede9fe' },
          ),
          textNode(
            'challenge_note',
            '教师提示',
            '可先点击全局控制条“下一页”观察导航守卫，再完成题目。',
            250,
            555,
            780,
            48,
            { fontSize: 17, align: 'center', color: '#ddd6fe' },
          ),
        ],
        runtime: runtimeDocument(
          challengeRuntimeSource,
          'dom',
          challengeContent,
          {
            assetId: 'asset_challenge_runtime_fallback',
            coverage: 'full-scene',
            layer: 'overlay',
          },
        ),
      },
      {
        id: 'scene_summary',
        name: '03 课程小结',
        backgroundColor: '#052e2b',
        interactions: [],
        nodes: [
          textNode(
            'summary_title',
            '总结标题',
            '一个工程，五种承载方式',
            140,
            112,
            1000,
            72,
            { fontSize: 40, bold: true, align: 'center', color: '#ccfbf1' },
          ),
          shapeNode(
            'summary_card_scene_runtime',
            '场景运行时卡片',
            92,
            235,
            330,
            220,
            '#134e4a',
            '#5eead4',
          ),
          shapeNode(
            'summary_card_global_runtime',
            '全局运行时卡片',
            475,
            235,
            330,
            220,
            '#164e63',
            '#67e8f9',
          ),
          shapeNode(
            'summary_card_component',
            '全局组件卡片',
            858,
            235,
            330,
            220,
            '#312e81',
            '#a5b4fc',
          ),
          textNode(
            'summary_scene_runtime_text',
            '场景运行时说明',
            'scene.runtime\n一次性场景互动\n效果可以自由发挥',
            118,
            262,
            278,
            164,
            { fontSize: 22, bold: true, align: 'center', color: '#ccfbf1' },
          ),
          textNode(
            'summary_global_runtime_text',
            '全局运行时说明',
            'globalRuntime\n事件、状态与守卫\n普通翻页保持',
            501,
            262,
            278,
            164,
            { fontSize: 22, bold: true, align: 'center', color: '#cffafe' },
          ),
          textNode(
            'summary_component_text',
            '全局组件说明',
            'V3 全局组件\n可复用、可配置\n同一实例跨场景',
            884,
            262,
            278,
            164,
            { fontSize: 22, bold: true, align: 'center', color: '#e0e7ff' },
          ),
          textNode(
            'summary_footer',
            '总结句',
            '所有人工可见文字仍然可编辑；其他互动逻辑不必为了编辑器而降级。',
            150,
            500,
            980,
            72,
            { fontSize: 24, bold: true, align: 'center', color: '#99f6e4' },
          ),
        ],
      },
    ],
  }

  const project: ProjectDocument = projectDocumentSchema.parse(projectCandidate)
  await fs.writeFile(projectJsonPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8')
  await fs.writeFile(componentArchivePath, componentArchive)

  const lessonArchive = createProjectArchive(
    {
      project,
      assetFiles,
      componentFiles: {
        [importedComponent.key]: importedComponent.files,
      },
    },
    { mtime: reproducibleTimestamp },
  )
  await fs.writeFile(lessonArchivePath, lessonArchive)

  const reopened = openProjectArchive(lessonArchive)
  if (
    reopened.project.schemaVersion !== 8 ||
    reopened.project.scenes.length !== 3 ||
    reopened.project.globalLayer.length !== 1 ||
    reopened.project.globalRuntime?.source !== globalRuntimeSource ||
    reopened.project.scenes[0]?.interactions.length !== 3 ||
    reopened.project.scenes[0]?.nodes.find(
      (node) => node.id === 'intro_editable_note',
    )?.playbackInitialVisibility !== 'hidden'
  ) {
    throw new Error('生成后的 .h5lesson 重新打开校验失败')
  }

  const payload = buildExportPayload({
    project,
    assets: assetFiles,
    components: {
      [importedComponent.key]: importedComponent,
    },
  })
  const html = buildStandaloneHtml(payload, { playerBundle })
  await fs.writeFile(standaloneHtmlPath, html, 'utf8')

  console.log(`已生成 Project V8 JSON：${projectJsonPath}`)
  console.log(`已生成 V3 全局组件包：${componentArchivePath}`)
  console.log(`已生成 Project V8 工程：${lessonArchivePath}`)
  console.log(`已生成离线单 HTML：${standaloneHtmlPath}`)
}

main().catch((error: unknown) => {
  console.error('生成 Project V8 / Runtime V3 过渡示例失败', error)
  process.exitCode = 1
})
