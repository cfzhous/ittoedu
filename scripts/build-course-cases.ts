import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, unzipSync } from 'fflate'
import * as agentKit from '../agent-kit/index.mjs'
import { parseComponentPackageFiles } from '../src/renderer/components/importComponentPackage'
import {
  buildPublishedCourseStandaloneHtml,
} from '../src/renderer/export/course/buildCoursePackages'
import { buildCoursePptx } from '../src/renderer/export/course/buildCoursePptx'
import { buildCoursePrintArtifacts } from '../src/renderer/export/course/buildCoursePrintArtifacts'
import { buildPublishedCourseV2Payload } from '../src/renderer/export/course/buildPublishedCourse'
import { buildFlowDocx } from '../src/renderer/export/course/flowDocx'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
  type CourseProjectArchiveData,
} from '../src/renderer/project/courseProjectArchive'
import {
  cullSpatialItems,
  spatialCameraFromPose,
} from '../src/player/surfaces/spatial/spatialModel'
import { courseProjectDocumentSchema } from '../src/shared/courseProjectSchema'
import { deriveCourseProjectAuthoringInventorySnapshot } from '../src/shared/courseProjectModel'
import type {
  CourseProjectDocument,
  FlowBlock,
  FlowSurfaceDocument,
  LayerItem,
  SlideSceneDocument,
  SpatialSurfaceDocument,
} from '../src/shared/courseProjectTypes'
import { publishedCourseV2Schema } from '../src/shared/publishedCourseSchema'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const caseRoot = path.join(root, 'examples', 'course-project-v9')
const playerBundlePath = path.join(root, 'dist-player', 'player.iife.js')
const fixedTimestamp = '2026-08-14T00:00:00.000Z'
const fixedArchiveTime = new Date('2026-08-14T00:00:00.000Z')
const runtimeModule = 'courseware-capabilities/runtimes/parameter-plot.js'
const componentModule = 'courseware-capabilities/components/evidence-sort/runtime.js'

/**
 * These ceilings were frozen after measuring the three real cases below. They
 * deliberately budget serialized delivery size and renderable model size,
 * rather than nondeterministic wall-clock time on a particular computer.
 */
const PERFORMANCE_BUDGETS = {
  'parabola-lab': {
    archiveBytes: 15_000,
    standaloneHtmlBytes: 2_100_000,
    maxSlideLayers: 8,
    maxFlowBlocks: 0,
    maxSpatialItems: 0,
    maxSpatialVisibleAtFrame: 0,
  },
  'historical-evidence': {
    archiveBytes: 15_000,
    standaloneHtmlBytes: 2_100_000,
    maxSlideLayers: 0,
    maxFlowBlocks: 28,
    maxSpatialItems: 0,
    maxSpatialVisibleAtFrame: 0,
  },
  'ecosystem-mixed': {
    archiveBytes: 20_000,
    standaloneHtmlBytes: 2_100_000,
    maxSlideLayers: 8,
    maxFlowBlocks: 10,
    maxSpatialItems: 32,
    maxSpatialVisibleAtFrame: 28,
  },
} as const

type CaseId = keyof typeof PERFORMANCE_BUDGETS
type ProductDynamicResolver = NonNullable<
  NonNullable<Parameters<typeof agentKit.compileCourseProjectV9>[1]>['resolveDynamic']
>
type ProductDynamicResolution = ReturnType<ProductDynamicResolver>

interface AssetRecord {
  meta: {
    id: string
    filename: string
    mimeType: string
    kind: 'image'
    path: string
    byteLength: number
    width?: number
    height?: number
  }
  bytes: Uint8Array
}

interface ComponentCapability {
  key: string
  metadata: ReturnType<typeof parseComponentPackageFiles>['metadata']
  files: Record<string, Uint8Array>
  source: ReturnType<typeof parseComponentPackageFiles>
}

interface BuiltCase {
  id: CaseId
  project: CourseProjectDocument
  assetFiles: Record<string, Uint8Array>
  componentFiles: Record<string, Record<string, Uint8Array>>
  semanticAuthoringAddresses: number
}

interface CaseMetrics {
  archiveBytes: number
  standaloneHtmlBytes: number
  slideScenes: number
  maxSlideLayers: number
  flowBlocks: number
  spatialItems: number
  maxSpatialVisibleAtFrame: number
  printPages: number
  docxBytes: number
  pptxBytes: number
}

function normalizeGeneratedHtml(html: string): string {
  return html.replace(/[\t ]+$/gmu, '')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function svgAsset(
  id: string,
  filename: string,
  svg: string,
  size: { width: number; height: number },
): AssetRecord {
  const bytes = strToU8(svg.trim())
  return {
    meta: {
      id,
      filename,
      mimeType: 'image/svg+xml',
      kind: 'image',
      path: `assets/${filename}`,
      byteLength: bytes.byteLength,
      width: size.width,
      height: size.height,
    },
    bytes,
  }
}

function assetMaps(records: readonly AssetRecord[]): {
  assets: Record<string, AssetRecord['meta']>
  assetFiles: Record<string, Uint8Array>
} {
  return {
    assets: Object.fromEntries(records.map((record) => [record.meta.id, record.meta])),
    assetFiles: Object.fromEntries(records.map((record) => [record.meta.id, record.bytes])),
  }
}

function fallbackSvg(title: string, detail: string, accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600" role="img" aria-label="${title}">
  <rect width="1200" height="600" rx="30" fill="#0b172a"/>
  <path d="M90 475 C240 425 300 95 430 90 C560 85 630 420 760 468 C880 510 970 225 1110 160" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>
  <text x="80" y="86" fill="#f8fafc" font-family="Microsoft YaHei,sans-serif" font-size="42" font-weight="700">${title}</text>
  <text x="80" y="550" fill="#cbd5e1" font-family="Microsoft YaHei,sans-serif" font-size="24">${detail}</text>
</svg>`
}

function gridSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="400" viewBox="0 0 720 400">
  <defs><pattern id="grid" width="54" height="35" patternUnits="userSpaceOnUse"><path d="M54 0H0V35" fill="none" stroke="#38bdf8" stroke-opacity=".34"/></pattern></defs>
  <rect width="720" height="400" fill="#071426"/><rect width="720" height="400" fill="url(#grid)"/>
</svg>`
}

function pondSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="校园池塘观察图">
  <defs>
    <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#83b9c8"/><stop offset="1" stop-color="#d8e8da"/></linearGradient>
    <linearGradient id="water" x2="0" y2="1"><stop stop-color="#397d88"/><stop offset="1" stop-color="#123e50"/></linearGradient>
    <radialGradient id="sun"><stop stop-color="#fff5c2"/><stop offset="1" stop-color="#fff5c2" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#sky)"/><circle cx="1030" cy="130" r="150" fill="url(#sun)"/>
  <path d="M0 280 Q150 190 300 278 T610 250 T920 272 T1280 220 V430 H0Z" fill="#285f43"/>
  <path d="M0 340 Q210 280 390 342 T770 318 T1280 330 V720 H0Z" fill="url(#water)"/>
  <g fill="#4b8b5f"><ellipse cx="170" cy="520" rx="95" ry="24"/><ellipse cx="980" cy="565" rx="115" ry="28"/><ellipse cx="720" cy="445" rx="72" ry="19"/></g>
  <g fill="#f0d36d"><circle cx="150" cy="505" r="10"/><circle cx="190" cy="515" r="8"/><circle cx="965" cy="548" r="9"/></g>
  <path d="M0 610 Q240 580 470 625 T930 600 T1280 630" fill="none" stroke="#acd9df" stroke-opacity=".38" stroke-width="8"/>
</svg>`
}

async function loadEvidenceSort(): Promise<ComponentCapability> {
  const directory = path.join(root, 'courseware-capabilities', 'components', 'evidence-sort')
  const files = {
    'manifest.json': new Uint8Array(await readFile(path.join(directory, 'manifest.json'))),
    'runtime.js': new Uint8Array(await readFile(path.join(directory, 'runtime.js'))),
  }
  const source = parseComponentPackageFiles(files)
  return {
    key: source.key,
    metadata: source.metadata,
    files: source.files,
    source,
  }
}

function dynamicResolver(
  parameterSource: string,
  component: ComponentCapability,
): ProductDynamicResolver {
  return (module, item): ProductDynamicResolution => {
    if (module === runtimeModule) {
      const values = item.data.content as Record<string, string>
      const gridBackground = String((item.data.assets as Record<string, string>).gridBackground)
      const fallbackAssetId = String(item.data.staticFallbackAssetId)
      return {
        kind: 'runtime',
        runtime: {
          protocol: 'surface-v1',
          runtimeApiVersion: 3,
          enabled: true,
          renderMode: 'dom',
          source: parameterSource,
          content: {
            values,
            metadata: Object.fromEntries(Object.keys(values).map((key) => [key, {
              label: key,
              multiline: key === 'prompt' || key === 'hint' || key === 'completeHint',
            }])),
          },
          assets: { gridBackground: { assetId: gridBackground } },
          staticFallback: { assetId: fallbackAssetId, coverage: 'scene' },
        },
      }
    }
    if (module === componentModule) {
      return {
        kind: 'component',
        component: {
          packageId: component.source.manifest.id,
          version: component.source.manifest.version,
        },
        packageMetadata: component.metadata as unknown as Record<string, unknown>,
        props: item.data.props as Record<string, unknown>,
        staticFallbackAssetId: String(item.data.staticFallbackAssetId),
      }
    }
    throw new Error(`Unknown dynamic capability module: ${module}`)
  }
}

function editableComponentAuthoring(): Array<{
  field: string
  pointer: `/data/${string}`
  kind: 'text' | 'property'
}> {
  const textFields = [
    'title',
    'columns/left', 'columns/middle', 'columns/right',
    'items/one', 'items/two', 'items/three', 'items/four', 'items/five', 'items/six',
    'completionStateKey',
  ]
  return [
    ...textFields.map((field) => ({
      field: `props/${field}`,
      pointer: `/data/props/${field}` as `/data/${string}`,
      kind: 'text' as const,
    })),
    {
      field: 'props/requiredMoves',
      pointer: '/data/props/requiredMoves',
      kind: 'property' as const,
    },
  ]
}

function runtimeAuthoring(): Array<{
  field: string
  pointer: `/data/${string}`
  kind: 'text' | 'asset'
}> {
  const contentKeys = [
    'prompt', 'hint', 'completeHint', 'resetLabel', 'directionLabel',
    'upLabel', 'downLabel', 'widthLabel', 'narrowLabel', 'wideLabel', 'baselineLabel',
  ]
  return [
    ...contentKeys.map((key) => ({
      field: `runtime/content/values/${key}`,
      pointer: `/data/content/${key}` as `/data/${string}`,
      kind: 'text' as const,
    })),
    {
      field: 'runtime/assets/gridBackground/assetId',
      pointer: '/data/assets/gridBackground',
      kind: 'asset' as const,
    },
  ]
}

function cloneCompiled(input: ReturnType<typeof agentKit.defineCourseProject>, resolver: ReturnType<typeof dynamicResolver>): CourseProjectDocument {
  const semanticReport = agentKit.validateCourseProject(input)
  assert(semanticReport.valid, semanticReport.errors.join('; '))
  const compiled = agentKit.compileCourseProjectV9(input, {
    timestamp: fixedTimestamp,
    resolveDynamic: resolver,
  })
  return courseProjectDocumentSchema.parse(structuredClone(compiled))
}

function flowBlockCount(blocks: readonly FlowBlock[]): number {
  return blocks.reduce((count, block) => count + 1 + (
    block.type === 'section' ? flowBlockCount(block.blocks) : 0
  ), 0)
}

function setTextStyle(
  project: CourseProjectDocument,
  layerItemId: string,
  patch: Partial<Extract<LayerItem, { kind: 'native' }>['content']['data'] & Record<string, unknown>>,
): void {
  for (const surface of project.surfaces) {
    if (surface.type !== 'slide') continue
    for (const scene of surface.scenes) {
      const item = scene.layerItems.find((candidate) => candidate.layerItemId === layerItemId)
      if (!item || item.kind !== 'native' || item.content.nativeType !== 'text') continue
      Object.assign(item.content.data.style, patch)
    }
  }
}

function scenePrintFragment(scene: SlideSceneDocument): string {
  const content = scene.layerItems.flatMap((item) => {
    if (!item.visible) return []
    if (item.kind === 'native' && item.content.nativeType === 'text') {
      return `<p>${escapeHtml(item.content.data.text)}</p>`
    }
    if (item.kind === 'native' && item.content.nativeType === 'formula') {
      return `<p>${escapeHtml(item.content.data.accessibleText)}</p>`
    }
    if (item.kind === 'runtime' || item.kind === 'component') {
      return `<p>[${item.kind}: ${escapeHtml(item.label)}]</p>`
    }
    return []
  }).join('')
  return `<article data-slide-scene="${escapeHtml(scene.id)}"><h1>${escapeHtml(scene.name)}</h1>${content}</article>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildParabola(
  parameterSource: string,
  component: ComponentCapability,
): BuiltCase {
  const grid = svgAsset('parabola-grid', 'parabola-grid.svg', gridSvg(), { width: 720, height: 400 })
  const fallback = svgAsset(
    'parabola-runtime-fallback',
    'parabola-runtime-fallback.svg',
    fallbackSvg('二次函数参数实验', '静态导出保留坐标、曲线与实验说明', '#38bdf8'),
    { width: 1200, height: 600 },
  )
  const assets = assetMaps([grid, fallback])
  const runtimeContent = {
    prompt: '改变 a，观察同一条抛物线怎样连续变化',
    hint: '各比较一组异号参数和同号不同绝对值参数',
    completeHint: '已完成开口方向与宽窄的两类比较',
    resetLabel: '重置实验',
    directionLabel: '开口',
    upLabel: '向上',
    downLabel: '向下',
    widthLabel: '宽窄',
    narrowLabel: '比 a=1 更窄',
    wideLabel: '比 a=1 更宽',
    baselineLabel: '与 a=1 同宽',
  }
  const semantic = agentKit.defineCourseProject({
    id: 'parabola-lab',
    title: '二次函数：从参数变化看图像',
    assets: assets.assets,
    theme: {
      fonts: [{ id: 'body', label: '正文', fontFamily: 'Microsoft YaHei' }],
      colors: [
        { id: 'background', label: '深色背景', color: '#071426' },
        { id: 'text', label: '浅色文字', color: '#f8fafc' },
        { id: 'accent', label: '曲线蓝', color: '#38bdf8' },
      ],
    },
    surfaces: [agentKit.defineSurface({
      id: 'parabola-slide',
      kind: 'slide',
      data: { title: '参数实验' },
      scenes: [
        agentKit.defineScene({
          id: 'prediction',
          name: '先留下分歧',
          data: { backgroundColor: '#071426' },
          items: [
            agentKit.author.shape({ id: 'prediction-background', data: { label: '背景', shapeType: 'rectangle', fillColor: '#071426', borderColor: '#071426' }, geometry: { x: 0, y: 0, width: 1280, height: 720 }, layer: { locked: true } }),
            agentKit.author.text({ id: 'prediction-kicker', text: 'PARAMETER LAB  /  参数实验', data: { label: '栏目标题' }, geometry: { x: 84, y: 62, width: 980, height: 50 } }),
            agentKit.author.text({ id: 'prediction-question', text: 'a 变大，抛物线一定变窄吗？', data: { label: '核心问题' }, geometry: { x: 84, y: 150, width: 1100, height: 118 } }),
            agentKit.author.text({ id: 'prediction-claims', text: '① a 的正负只改变开口方向\n② a 越大，图像越窄\n③ a=0 时还是二次函数', data: { label: '三个判断' }, geometry: { x: 130, y: 330, width: 950, height: 220 } }),
            agentKit.author.text({ id: 'prediction-transition', text: '不要背结论，让图像连续变化。', data: { label: '教师过渡语' }, geometry: { x: 760, y: 572, width: 410, height: 44 } }),
          ],
        }),
        agentKit.defineScene({
          id: 'experiment',
          name: '参数实验',
          data: { backgroundColor: '#071426' },
          items: [
            agentKit.author.shape({ id: 'experiment-background', data: { label: '背景', shapeType: 'rectangle', fillColor: '#071426', borderColor: '#071426' }, geometry: { x: 0, y: 0, width: 1280, height: 720 }, layer: { locked: true } }),
            agentKit.author.dynamic({
              id: 'parameter-plot',
              module: runtimeModule,
              carrier: 'runtime',
              data: {
                label: '抛物线参数运行时',
                content: runtimeContent,
                assets: { gridBackground: grid.meta.id },
                staticFallbackAssetId: fallback.meta.id,
              },
              geometry: { x: 52, y: 112, width: 1176, height: 472 },
              authoring: runtimeAuthoring(),
            }),
            agentKit.author.formula({ id: 'experiment-formula', latex: 'y=ax², a≠0', data: { label: '原生公式', accessibleText: 'y 等于 a x 平方，a 不等于零', color: '#7dd3fc', align: 'right', fontSize: 38 }, geometry: { x: 815, y: 30, width: 400, height: 68 } }),
            agentKit.author.text({ id: 'experiment-overlay-hint', text: '异号：比开口　·　同号不同 |a|：比宽窄', data: { label: '上层实验提示' }, geometry: { x: 72, y: 596, width: 850, height: 36 } }),
          ],
        }),
        agentKit.defineScene({
          id: 'summary',
          name: '总结与迁移',
          data: { backgroundColor: '#f8fafc' },
          items: [
            agentKit.author.shape({ id: 'summary-background', data: { label: '背景', shapeType: 'rectangle', fillColor: '#f8fafc', borderColor: '#f8fafc' }, geometry: { x: 0, y: 0, width: 1280, height: 720 }, layer: { locked: true } }),
            agentKit.author.text({ id: 'summary-title', text: '用准确的话收束观察', data: { label: '总结标题' }, geometry: { x: 88, y: 68, width: 920, height: 74 } }),
            agentKit.author.text({ id: 'summary-sentences', text: 'a 的符号决定 ______；\n|a| 的大小决定 ______。', data: { label: '待补结论' }, geometry: { x: 130, y: 195, width: 900, height: 155 } }),
            agentKit.author.text({ id: 'summary-precision', text: '不能只说“a 越大越窄”：宽窄比较看的是 |a|，而符号决定开口方向。', data: { label: '精确表达' }, geometry: { x: 130, y: 405, width: 960, height: 100 } }),
            agentKit.author.formula({ id: 'summary-transfer', latex: 'a=-1.6', data: { label: '迁移参数', accessibleText: 'a 等于负一点六', color: '#1d4ed8', fontSize: 48 }, geometry: { x: 830, y: 520, width: 300, height: 78 } }),
          ],
        }),
      ],
    })],
  })
  const project = structuredClone(cloneCompiled(semantic, dynamicResolver(parameterSource, component)))
  project.courseState = [{ key: 'comparisonComplete', valueType: 'boolean', defaultValue: false }]
  project.navigationGuards = [{
    id: 'complete-comparison-before-summary',
    effect: 'block',
    toLocationIds: ['parabola-slide:summary'],
    match: 'all',
    conditions: [{ type: 'compare', key: 'comparisonComplete', operator: 'eq', value: false }],
    message: '先各比较一组异号参数和同号不同绝对值参数。',
  }]
  setTextStyle(project, 'prediction-kicker', { fontSize: 20, color: '#7dd3fc', bold: true })
  setTextStyle(project, 'prediction-question', { fontSize: 56, color: '#f8fafc', bold: true })
  setTextStyle(project, 'prediction-claims', { fontSize: 34, color: '#e2e8f0', lineSpacing: 14 })
  setTextStyle(project, 'prediction-transition', { fontSize: 20, color: '#94a3b8', italic: true })
  setTextStyle(project, 'experiment-overlay-hint', { fontSize: 20, color: '#e2e8f0', bold: true })
  setTextStyle(project, 'summary-title', { fontSize: 46, color: '#172033', bold: true })
  setTextStyle(project, 'summary-sentences', { fontSize: 38, color: '#172033', lineSpacing: 14 })
  setTextStyle(project, 'summary-precision', { fontSize: 25, color: '#334155' })
  const parsed = courseProjectDocumentSchema.parse(project)
  const authoringIndex = agentKit.buildAuthoringIndex(semantic)
  assert(Object.keys(authoringIndex).some((address) => decodeURIComponent(address).includes('runtime/content/values/prompt')), 'Parabola semantic authoring index lost Runtime prompt')
  assert(Object.keys(authoringIndex).some((address) => decodeURIComponent(address).includes('runtime/assets/gridBackground/assetId')), 'Parabola semantic authoring index lost Runtime background asset')
  return {
    id: 'parabola-lab',
    project: parsed,
    assetFiles: assets.assetFiles,
    componentFiles: {},
    semanticAuthoringAddresses: Object.keys(authoringIndex).length,
  }
}

function historyBlocks(component: ComponentCapability, fallbackAssetId: string): FlowBlock[] {
  const componentReference = {
    packageId: component.source.manifest.id,
    version: component.source.manifest.version,
  }
  return [
    { id: 'history-question', type: 'heading', level: 1, text: '工业化让城市生活变得更好吗？' },
    { id: 'history-orientation', type: 'paragraph', text: '本课不要求立即选“是”或“否”，而是区分材料说了什么、能证明什么、还没有证明什么。' },
    {
      id: 'history-reading-tools',
      type: 'section',
      title: '阅读工具：四个问题',
      collapsedByDefault: false,
      blocks: [
        { id: 'history-tools-list', type: 'list', ordered: true, items: [
          { id: 'tool-author', text: '谁写的？他与事件有什么关系？' },
          { id: 'tool-time', text: '什么时候写的？是同时记录还是事后回忆？' },
          { id: 'tool-seen', text: '材料亲自看见了什么？' },
          { id: 'tool-missing', text: '它可能遗漏了谁的经验？' },
        ] },
      ],
    },
    { id: 'material-a-heading', type: 'heading', level: 2, text: '材料 A：人口与工厂数量' },
    { id: 'material-a-context', type: 'paragraph', text: '下表为某工业城市的登记数据节选。数据能显示同时变化，但不会自动证明因果。' },
    {
      id: 'material-a-table',
      type: 'table',
      caption: '1841—1871 年城市登记数据',
      columns: [
        { id: 'year', header: '年份' },
        { id: 'population', header: '人口（万）' },
        { id: 'factories', header: '登记工厂数' },
      ],
      rows: [
        { id: 'row-1841', cells: { year: '1841', population: '8.2', factories: '37' } },
        { id: 'row-1851', cells: { year: '1851', population: '12.6', factories: '61' } },
        { id: 'row-1871', cells: { year: '1871', population: '20.4', factories: '104' } },
      ],
    },
    { id: 'material-a-warning', type: 'callout', tone: 'warning', title: '证据边界', body: '人口与工厂数同时上升，能否单独证明“工厂造成了全部人口增长”？' },
    { id: 'material-b-heading', type: 'heading', level: 2, text: '材料 B：工厂主的回忆' },
    { id: 'material-b-quote', type: 'quote', text: '新的纺织厂为附近家庭带来了稳定现金收入，许多年轻人愿意来城里学手艺。', citation: '某纺织厂经营者晚年回忆录，1878 年出版' },
    { id: 'material-b-support', type: 'paragraph', text: '可支持：工厂主认为工业扩张提供了工资与学习机会。' },
    { id: 'material-b-limit', type: 'paragraph', text: '不能单独支持：所有工人的收入都稳定，或工作与生活条件都有改善。' },
    { id: 'material-c-heading', type: 'heading', level: 2, text: '材料 C：调查员记录' },
    { id: 'material-c-quote', type: 'quote', text: '我在河岸后巷的一间屋内数到十一人，其中三个孩子每日在作坊停留十小时以上。', citation: '城市卫生调查员工作记录，1850 年' },
    { id: 'material-c-support', type: 'paragraph', text: '可支持：调查员在特定社区记录了拥挤住房和童工现象。' },
    { id: 'material-c-limit', type: 'paragraph', text: '不能单独支持：这种状况代表全城每个社区或每个工人家庭。' },
    { id: 'history-divider', type: 'divider' },
    { id: 'history-sort-heading', type: 'heading', level: 2, text: '证据归类：不先设标准答案' },
    {
      id: 'history-evidence-sort',
      type: 'component',
      component: componentReference,
      staticFallbackAssetId: fallbackAssetId,
      props: {
        title: '这些证据分别能放在哪里？',
        columns: { left: '生产与机会', middle: '生活与代价', right: '仍需核实' },
        items: {
          one: '1841—1871 年人口与工厂数都上升',
          two: '工厂主说年轻人获得了工资与学技术机会',
          three: '调查员在一间屋内数到十一人',
          four: '调查记录了儿童每日长时间留在作坊',
          five: '两份口述材料的作者立场不同',
          six: '人口增长是否完全由工厂扩张造成',
        },
        completionStateKey: '',
        requiredMoves: 0,
      },
    },
    { id: 'history-conclusion-heading', type: 'heading', level: 2, text: '有限结论' },
    { id: 'history-writing-frame', type: 'callout', tone: 'conclusion', title: '写作框架', body: '从……可以看出……；但由于……，我们仍不能断定……。' },
    { id: 'history-final-hint', type: 'paragraph', text: '评价历史变化时，既要比较不同群体，也要说明证据的来源限制。' },
  ]
}

function buildHistorical(
  parameterSource: string,
  component: ComponentCapability,
): BuiltCase {
  const fallback = svgAsset(
    'history-evidence-fallback',
    'history-evidence-fallback.svg',
    fallbackSvg('证据归类讨论', '独立 HTML 保留键盘与指针互动；静态导出保留本说明', '#e7b85c'),
    { width: 1200, height: 600 },
  )
  const assets = assetMaps([fallback])
  const componentProps = {
    title: '这些证据分别能放在哪里？',
    columns: { left: '生产与机会', middle: '生活与代价', right: '仍需核实' },
    items: { one: '人口上升', two: '工资机会', three: '拥挤住房', four: '童工记录', five: '作者立场', six: '因果尚未证明' },
    completionStateKey: '',
    requiredMoves: 0,
  }
  const semantic = agentKit.defineCourseProject({
    id: 'historical-evidence',
    title: '历史证据阅读：工业城市的两种面孔',
    assets: assets.assets,
    theme: {
      fonts: [{ id: 'body', label: '正文', fontFamily: 'Noto Serif SC, Songti SC, SimSun' }],
      colors: [
        { id: 'background', label: '纸张', color: '#f7f2e8' },
        { id: 'text', label: '墨色', color: '#2f2923' },
        { id: 'accent', label: '批注', color: '#8a4b2b' },
      ],
    },
    surfaces: [agentKit.defineSurface({
      id: 'history-flow',
      kind: 'flow',
      data: { title: '工业城市证据资料册', readingWidth: 760, wideContentWidth: 1120 },
      scenes: [agentKit.defineScene({
        id: 'reading',
        name: '证据阅读',
        items: [
          agentKit.author.text({ id: 'history-semantic-start', text: '工业化让城市生活变得更好吗？' }),
          agentKit.author.dynamic({
            id: 'history-evidence-sort',
            module: componentModule,
            carrier: 'component',
            data: { props: componentProps, staticFallbackAssetId: fallback.meta.id },
            authoring: editableComponentAuthoring(),
          }),
        ],
      })],
    })],
  })
  const project = structuredClone(cloneCompiled(semantic, dynamicResolver(parameterSource, component)))
  const flow = project.surfaces[0]
  assert(flow?.type === 'flow', 'Historical Agent Kit compilation did not create Flow')
  flow.blocks = historyBlocks(component, fallback.meta.id)
  project.locations = [
    { id: 'history:intro', label: '阅读导向', kind: 'flow-block', surfaceId: flow.id, blockId: 'history-question' },
    { id: 'history:materials', label: '三份材料', kind: 'flow-block', surfaceId: flow.id, blockId: 'material-a-heading' },
    { id: 'history:sorting', label: '证据归类', kind: 'flow-block', surfaceId: flow.id, blockId: 'history-evidence-sort' },
    { id: 'history:conclusion', label: '有限结论', kind: 'flow-block', surfaceId: flow.id, blockId: 'history-conclusion-heading' },
  ]
  project.startLocationId = 'history:intro'
  const parsed = courseProjectDocumentSchema.parse(project)
  const authoringIndex = agentKit.buildAuthoringIndex(semantic)
  assert(Object.keys(authoringIndex).some((address) => decodeURIComponent(address).includes('props/items/one')), 'Historical semantic authoring index lost component item text')
  return {
    id: 'historical-evidence',
    project: parsed,
    assetFiles: assets.assetFiles,
    componentFiles: { [component.key]: component.files },
    semanticAuthoringAddresses: Object.keys(authoringIndex).length,
  }
}

function evidenceFlowBlocks(component: ComponentCapability, fallbackAssetId: string): FlowBlock[] {
  return [
    { id: 'ecosystem-flow-heading', type: 'heading', level: 1, text: '箭头究竟指向谁？' },
    { id: 'ecosystem-flow-intro', type: 'paragraph', text: '食物网中，箭头由食物指向取食者，表示物质和能量的流动方向。' },
    {
      id: 'ecosystem-flow-table',
      type: 'table',
      caption: '读箭头的三个例子',
      columns: [{ id: 'from', header: '由' }, { id: 'to', header: '指向' }, { id: 'meaning', header: '表示' }],
      rows: [
        { id: 'pond-row-1', cells: { from: '藻类', to: '浮游动物', meaning: '浮游动物摄取藻类' } },
        { id: 'pond-row-2', cells: { from: '浮游动物', to: '小鱼', meaning: '小鱼摄取浮游动物' } },
        { id: 'pond-row-3', cells: { from: '小鱼', to: '鹭', meaning: '鹭摄取小鱼' } },
      ],
    },
    { id: 'ecosystem-flow-warning', type: 'callout', tone: 'warning', title: '别把箭头读反', body: '箭头不是“谁追谁”，而是物质和能量流向谁。' },
    { id: 'ecosystem-flow-task', type: 'paragraph', text: '在进入空间食物网前，先把路径短句移到“直接影响”“间接影响”或“仍需核实”。至少移动两条后，再到地图中沿箭头验证。' },
    {
      id: 'ecosystem-path-sort',
      type: 'component',
      component: { packageId: component.source.manifest.id, version: component.source.manifest.version },
      staticFallbackAssetId: fallbackAssetId,
      props: {
        title: '先分类路径短句，再进入食物网',
        columns: { left: '直接影响', middle: '间接影响', right: '仍需核实' },
        items: {
          one: '蜻蜓幼虫减少 → 青蛙可获取的食物减少',
          two: '蜻蜓幼虫减少 → 浮游动物变化 → 小鱼变化',
          three: '小鱼变化 → 鹭可获取的食物变化',
          four: '蜻蜓幼虫减少 → 水温一定上升',
          five: '藻类 → 浮游动物 → 蜻蜓幼虫',
          six: '季节变化是否会改变所有路径强度',
        },
        completionStateKey: 'pathsExplored',
        requiredMoves: 2,
      },
    },
  ]
}

function buildEcosystem(
  parameterSource: string,
  component: ComponentCapability,
): BuiltCase {
  const pond = svgAsset('pond-observation', 'pond-observation.svg', pondSvg(), { width: 1280, height: 720 })
  const fallback = svgAsset(
    'ecosystem-evidence-fallback',
    'ecosystem-evidence-fallback.svg',
    fallbackSvg('路径短句分类', '至少选择两条路径，再到 Spatial 2D 中沿箭头验证', '#65a30d'),
    { width: 1200, height: 600 },
  )
  const assets = assetMaps([pond, fallback])
  const componentProps = {
    title: '先分类路径短句，再进入食物网',
    columns: { left: '直接影响', middle: '间接影响', right: '仍需核实' },
    items: { one: '蜻蜓幼虫→青蛙', two: '幼虫→浮游动物→小鱼', three: '小鱼→鹭', four: '幼虫→水温', five: '藻类→浮游动物→幼虫', six: '季节变量' },
    completionStateKey: 'pathsExplored',
    requiredMoves: 2,
  }
  const line = (id: string, x1: number, y1: number, x2: number, y2: number) => {
    const deltaX = x2 - x1
    const deltaY = y2 - y1
    const length = Math.hypot(deltaX, deltaY)
    return agentKit.author.shape({
      id,
      data: { label: id, shapeType: 'line', fillColor: '#86b6c2', borderColor: '#4f7f8b' },
      // V9 frames are positive rectangles. A horizontal authored line rotated
      // around its midpoint preserves direction even for upward food-web edges.
      geometry: {
        x: (x1 + x2) / 2 - length / 2,
        y: (y1 + y2) / 2 - 0.5,
        width: length,
        height: 1,
      },
      layer: {
        hitPolicy: 'pass-through',
        rotation: Math.atan2(deltaY, deltaX) * 180 / Math.PI,
      },
    })
  }
  const population = (id: string, label: string, x: number, y: number, color: string) => [
    agentKit.author.shape({ id: `${id}-node`, data: { label: `${label}节点`, shapeType: 'ellipse', fillColor: color, borderColor: '#f8fafc' }, geometry: { x, y, width: 190, height: 100 } }),
    agentKit.author.text({ id: `${id}-label`, text: label, data: { label: `${label}名称` }, geometry: { x: x + 18, y: y + 28, width: 154, height: 46 } }),
  ]
  const details = [
    agentKit.author.text({ id: 'detail-larvae', text: '蜻蜓幼虫既摄取小型动物，也是青蛙等的食物。', data: { label: '幼虫证据说明' }, geometry: { x: -95, y: 300, width: 410, height: 90 } }),
    agentKit.author.text({ id: 'detail-fish', text: '小鱼的变化可能继续传导给鹭，这是一条间接路径。', data: { label: '小鱼证据说明' }, geometry: { x: -90, y: -330, width: 420, height: 90 } }),
    agentKit.author.text({ id: 'detail-model-limit', text: '模型没有纳入季节、水温、数量变化速度等全部变量。', data: { label: '模型边界说明' }, geometry: { x: 500, y: 290, width: 430, height: 90 } }),
  ]
  const semantic = agentKit.defineCourseProject({
    id: 'ecosystem-mixed',
    title: '校园池塘食物网：从局部关系到系统变化',
    assets: assets.assets,
    theme: {
      fonts: [{ id: 'body', label: '正文', fontFamily: 'Microsoft YaHei' }],
      colors: [
        { id: 'background', label: '池塘深蓝', color: '#123e50' },
        { id: 'text', label: '浅色文字', color: '#f8fafc' },
        { id: 'accent', label: '生态绿', color: '#65a30d' },
      ],
    },
    surfaces: [
      agentKit.defineSurface({
        id: 'ecosystem-prediction', kind: 'slide', data: { title: '提出预测' }, scenes: [agentKit.defineScene({
          id: 'prediction', name: '提出预测', data: { backgroundColor: '#123e50', backgroundAssetId: pond.meta.id }, items: [
            agentKit.author.image({ id: 'pond-photo', assetId: pond.meta.id, data: { label: '校园池塘观察图' }, geometry: { x: 0, y: 0, width: 1280, height: 720 }, layer: { locked: false } }),
            agentKit.author.shape({ id: 'pond-shade', data: { label: '文字遮罩', shapeType: 'rectangle', fillColor: '#071426', borderColor: '#071426' }, geometry: { x: 0, y: 0, width: 1280, height: 720 }, layer: { opacity: 0.58, locked: true } }),
            agentKit.author.text({ id: 'pond-question', text: '蜻蜓幼虫减少，池塘里会发生什么？', data: { label: '核心预测问题' }, geometry: { x: 84, y: 84, width: 1090, height: 128 } }),
            agentKit.author.text({ id: 'pond-direct-prediction', text: '最先变化：________________', data: { label: '直接变化预测' }, geometry: { x: 118, y: 335, width: 720, height: 64 } }),
            agentKit.author.text({ id: 'pond-indirect-prediction', text: '可能的间接变化：________________', data: { label: '间接变化预测' }, geometry: { x: 118, y: 445, width: 900, height: 64 } }),
          ],
        })],
      }),
      agentKit.defineSurface({
        id: 'ecosystem-reading', kind: 'flow', data: { title: '箭头含义短讲义', readingWidth: 720, wideContentWidth: 1080 }, scenes: [agentKit.defineScene({
          id: 'reading', name: '校准箭头含义', items: [
            agentKit.author.text({ id: 'ecosystem-flow-heading', text: '箭头究竟指向谁？' }),
            agentKit.author.dynamic({
              id: 'ecosystem-path-sort', module: componentModule, carrier: 'component',
              data: { props: componentProps, staticFallbackAssetId: fallback.meta.id },
              authoring: editableComponentAuthoring(),
            }),
          ],
        })],
      }),
      agentKit.defineSurface({
        id: 'ecosystem-map', kind: 'spatial-2d', data: { title: '池塘食物网' }, scenes: [agentKit.defineScene({
          id: 'world', name: '追踪路径', items: [
            line('edge-algae-zoo', -650, -155, -450, -155),
            line('edge-algae-tadpole', -650, -155, -450, 255),
            line('edge-zoo-fish', -260, -155, -70, -105),
            line('edge-zoo-larvae', -260, -155, -70, 255),
            line('edge-tadpole-larvae', -260, 255, -70, 255),
            line('edge-larvae-frog', 120, 255, 440, 255),
            line('edge-larvae-fish', 25, 205, 25, -55),
            line('edge-fish-heron', 120, -105, 740, 5),
            line('edge-frog-heron', 630, 255, 740, 5),
            ...population('algae', '藻类', -840, -205, '#3f8f54'),
            ...population('zooplankton', '浮游动物', -450, -205, '#3d8198'),
            ...population('tadpole', '蝌蚪', -450, 205, '#77974d'),
            ...population('small-fish', '小鱼', -70, -155, '#2e7498'),
            ...population('dragonfly-larvae', '蜻蜓幼虫', -70, 205, '#9b6f3d'),
            ...population('frog', '青蛙', 440, 205, '#5b8f3f'),
            ...population('heron', '鹭', 740, -45, '#8a8f9a'),
            ...details,
          ],
        })],
      }),
      agentKit.defineSurface({
        id: 'ecosystem-revision', kind: 'slide', data: { title: '修正预测' }, scenes: [agentKit.defineScene({
          id: 'revision', name: '修正预测', data: { backgroundColor: '#eef6f3' }, items: [
            agentKit.author.shape({ id: 'revision-background', data: { label: '背景', shapeType: 'rectangle', fillColor: '#eef6f3', borderColor: '#eef6f3' }, geometry: { x: 0, y: 0, width: 1280, height: 720 }, layer: { locked: true } }),
            agentKit.author.text({ id: 'revision-title', text: '修正预测：把路径和边界都说出来', data: { label: '修正预测标题' }, geometry: { x: 86, y: 64, width: 1060, height: 82 } }),
            agentKit.author.text({ id: 'revision-initial', text: '我的初始预测：____________________________', data: { label: '初始预测回看' }, geometry: { x: 112, y: 210, width: 980, height: 68 } }),
            agentKit.author.text({ id: 'revision-final', text: '在这个模型条件下，蜻蜓幼虫减少可能先……，并可能经过……间接影响……', data: { label: '限定语解释' }, geometry: { x: 112, y: 340, width: 990, height: 160 } }),
            agentKit.author.text({ id: 'revision-limit', text: '模型没有包含季节、水温和全部竞争关系，因此这是条件性预测。', data: { label: '模型边界' }, geometry: { x: 112, y: 545, width: 990, height: 70 } }),
          ],
        })],
      }),
    ],
  })
  const project = structuredClone(cloneCompiled(semantic, dynamicResolver(parameterSource, component)))
  const reading = project.surfaces.find((surface) => surface.id === 'ecosystem-reading')
  const spatial = project.surfaces.find((surface) => surface.id === 'ecosystem-map')
  assert(reading?.type === 'flow', 'Ecosystem Agent Kit compilation did not create Flow')
  assert(spatial?.type === 'spatial-2d', 'Ecosystem Agent Kit compilation did not create Spatial')
  reading.blocks = evidenceFlowBlocks(component, fallback.meta.id)
  spatial.world.bounds = { mode: 'finite', x: -1050, y: -560, width: 2100, height: 1120 }
  spatial.world.layerItems.forEach((item, index) => {
    item.order = index * 10
    if (item.kind === 'native' && item.content.nativeType === 'shape') {
      if (item.content.data.shapeType === 'line') {
        item.content.data.style.fillOpacity = 0
        item.content.data.style.borderWidth = 5
        item.content.data.style.borderColor = '#5f8f99'
        item.content.data.style.endArrow = 'triangle'
      } else {
        item.content.data.style.borderWidth = 3
      }
    }
    if (item.kind === 'native' && item.content.nativeType === 'text') {
      const detail = item.layerItemId.startsWith('detail-')
      Object.assign(item.content.data.style, {
        fontSize: detail ? 25 : 28,
        color: detail ? '#224052' : '#f8fafc',
        bold: !detail,
        align: detail ? 'left' : 'center',
        verticalAlign: 'middle',
        backgroundColor: detail ? '#f0fdfa' : '#ffffff',
        backgroundOpacity: detail ? 0.92 : 0,
        cornerRadius: detail ? 16 : 0,
        padding: detail ? 14 : 0,
      })
    }
  })
  spatial.camera = {
    home: { x: 0, y: 0, zoom: 0.55 },
    frames: [
      { id: 'ecosystem-map:overview', name: '全池塘', x: 0, y: 0, zoom: 0.55 },
      { id: 'ecosystem-map:larvae', name: '蜻蜓幼虫邻域', x: 120, y: 170, zoom: 1.65 },
      { id: 'ecosystem-map:indirect', name: '两条间接路径', x: 260, y: 20, zoom: 1.1 },
    ],
  }
  const detailIds = spatial.world.layerItems
    .map((item) => item.layerItemId)
    .filter((id) => id.startsWith('detail-'))
  spatial.semanticZoom = [{
    id: 'hide-evidence-at-overview',
    layerItemIds: detailIds,
    minZoom: 0,
    maxZoom: 1.4,
    visible: false,
  }]
  project.courseState = [{ key: 'pathsExplored', valueType: 'boolean', defaultValue: false }]
  project.locations = [
    { id: 'ecosystem:prediction', label: '提出预测', kind: 'slide-scene', surfaceId: 'ecosystem-prediction', sceneId: 'prediction' },
    { id: 'ecosystem:reading', label: '校准箭头含义', kind: 'flow-block', surfaceId: 'ecosystem-reading', blockId: 'ecosystem-flow-heading' },
    { id: 'ecosystem:path-sort', label: '路径短句分类', kind: 'flow-block', surfaceId: 'ecosystem-reading', blockId: 'ecosystem-path-sort' },
    { id: 'ecosystem:overview', label: '全池塘', kind: 'spatial-camera', surfaceId: 'ecosystem-map', cameraFrameId: 'ecosystem-map:overview' },
    { id: 'ecosystem:larvae', label: '蜻蜓幼虫邻域', kind: 'spatial-camera', surfaceId: 'ecosystem-map', cameraFrameId: 'ecosystem-map:larvae' },
    { id: 'ecosystem:indirect', label: '两条间接路径', kind: 'spatial-camera', surfaceId: 'ecosystem-map', cameraFrameId: 'ecosystem-map:indirect' },
    { id: 'ecosystem:revision', label: '修正预测', kind: 'slide-scene', surfaceId: 'ecosystem-revision', sceneId: 'revision' },
  ]
  project.startLocationId = 'ecosystem:prediction'
  project.navigationGuards = [{
    id: 'explore-paths-before-revision',
    effect: 'block',
    toLocationIds: ['ecosystem:revision'],
    match: 'all',
    conditions: [{ type: 'compare', key: 'pathsExplored', operator: 'eq', value: false }],
    message: '先分类至少两条路径，再到食物网中完成直接与间接路径追踪。',
  }]
  project.mixedPrintPlan = {
    pageSize: 'surface-native',
    orientation: 'auto',
    entries: [
      { id: 'print:prediction', kind: 'slide-scenes', surfaceId: 'ecosystem-prediction', sceneIds: ['prediction'] },
      { id: 'print:reading', kind: 'flow-document', surfaceId: 'ecosystem-reading' },
      { id: 'print:map', kind: 'spatial-frames', surfaceId: 'ecosystem-map', cameraFrameIds: spatial.camera.frames.map((frame) => frame.id) },
      { id: 'print:revision', kind: 'slide-scenes', surfaceId: 'ecosystem-revision', sceneIds: ['revision'] },
    ],
  }
  setTextStyle(project, 'pond-question', { fontSize: 54, color: '#f8fafc', bold: true })
  setTextStyle(project, 'pond-direct-prediction', { fontSize: 30, color: '#f8fafc', bold: true })
  setTextStyle(project, 'pond-indirect-prediction', { fontSize: 30, color: '#f8fafc', bold: true })
  setTextStyle(project, 'revision-title', { fontSize: 44, color: '#164e63', bold: true })
  setTextStyle(project, 'revision-initial', { fontSize: 29, color: '#334155' })
  setTextStyle(project, 'revision-final', { fontSize: 30, color: '#172033', bold: true })
  setTextStyle(project, 'revision-limit', { fontSize: 23, color: '#475569' })
  const parsed = courseProjectDocumentSchema.parse(project)
  const authoringIndex = agentKit.buildAuthoringIndex(semantic)
  assert(Object.keys(authoringIndex).some((address) => decodeURIComponent(address).includes('props/completionStateKey')), 'Ecosystem semantic authoring index lost completion state binding')
  return {
    id: 'ecosystem-mixed',
    project: parsed,
    assetFiles: assets.assetFiles,
    componentFiles: { [component.key]: component.files },
    semanticAuthoringAddresses: Object.keys(authoringIndex).length,
  }
}

function componentsFromArchive(data: CourseProjectArchiveData): Record<string, ReturnType<typeof parseComponentPackageFiles>> {
  return Object.fromEntries(Object.entries(data.componentFiles).map(([key, files]) => [
    key,
    parseComponentPackageFiles(files),
  ]))
}

function assertOfflineClosure(html: string, id: string): void {
  assert(html.includes('window.__H5_COURSE_PAYLOAD__='), `${id}: standalone HTML has no Published Course V2 payload`)
  assert(!/<(?:script|link|img|audio|video|source)\b[^>]*(?:src|href)=["'](?:https?:)?\/\//i.test(html), `${id}: standalone HTML contains an external resource element`)
  assert(!/\b(?:fetch|WebSocket|EventSource)\s*\(\s*["']https?:\/\//i.test(html), `${id}: standalone HTML contains a direct network call`)
  assert(!/url\(\s*["']?https?:\/\//i.test(html), `${id}: standalone HTML contains a remote CSS URL`)
  assert(!html.toLocaleLowerCase().includes(root.toLocaleLowerCase()), `${id}: standalone HTML leaked a repository path`)
}

function layerMetrics(project: CourseProjectDocument): {
  slideScenes: number
  maxSlideLayers: number
  flowBlocks: number
  spatialItems: number
  maxSpatialVisibleAtFrame: number
} {
  let slideScenes = 0
  let maxSlideLayers = 0
  let flowBlocks = 0
  let spatialItems = 0
  let maxSpatialVisibleAtFrame = 0
  for (const surface of project.surfaces) {
    if (surface.type === 'slide') {
      slideScenes += surface.scenes.length
      for (const scene of surface.scenes) {
        maxSlideLayers = Math.max(
          maxSlideLayers,
          project.globalLayerItems.length + surface.surfaceLayerItems.length + scene.layerItems.length,
        )
      }
    } else if (surface.type === 'flow') {
      flowBlocks += flowBlockCount(surface.blocks)
    } else {
      spatialItems += surface.world.layerItems.length
      for (const frame of surface.camera.frames) {
        const visible = cullSpatialItems(
          surface.world.layerItems,
          spatialCameraFromPose(frame, { width: 1120, height: 760 }),
          surface.semanticZoom,
        ).length
        maxSpatialVisibleAtFrame = Math.max(maxSpatialVisibleAtFrame, visible)
      }
    }
  }
  return { slideScenes, maxSlideLayers, flowBlocks, spatialItems, maxSpatialVisibleAtFrame }
}

function assertCaseSemantics(data: CourseProjectArchiveData, id: CaseId): void {
  const { project } = data
  const productInventory = deriveCourseProjectAuthoringInventorySnapshot(project)
  assert(productInventory.projectId === project.id && productInventory.revision === project.revision, `${id}: derived authoring inventory identity is stale`)
  assert(project.globalLayerItems.some((entry) => entry.item.layerItemId === 'teacher-controller'), `${id}: teacher controller is absent`)
  const controller = project.globalLayerItems.find((entry) => entry.item.layerItemId === 'teacher-controller')!.item
  const localOrders = project.surfaces.flatMap((surface) => surface.type === 'slide'
    ? surface.scenes.flatMap((scene) => scene.layerItems.map((item) => item.order))
    : surface.type === 'spatial-2d'
      ? surface.world.layerItems.map((item) => item.order)
      : [])
  assert(localOrders.every((order) => controller.order > order), `${id}: teacher controller is not above all local layers`)

  if (id === 'parabola-lab') {
    const slide = project.surfaces[0]
    assert(slide?.type === 'slide', 'Parabola must remain a Slide course')
    const experiment = slide.scenes.find((scene) => scene.id === 'experiment')
    const runtime = experiment?.layerItems.find((item) => item.layerItemId === 'parameter-plot')
    const formula = experiment?.layerItems.find((item) => item.layerItemId === 'experiment-formula')
    assert(runtime?.kind === 'runtime' && formula, 'Parabola Runtime/formula layers are absent')
    assert(runtime.order < formula.order && formula.order < controller.order, 'Parabola Runtime must stay below formula and teacher controller')
    assert(runtime.runtime.protocol === 'surface-v1' && runtime.runtime.runtimeApiVersion === 3, 'Parabola is not using Surface Runtime API 3')
    assert(runtime.runtime.assets.gridBackground?.assetId === 'parabola-grid', 'Parabola Runtime lost editable grid background binding')
    assert(runtime.runtime.source.includes('coursewareAssetKey') && runtime.runtime.source.includes('coursewareContentKey'), 'Parabola Runtime source lost declared authoring targets')
    assert(project.courseState.some((state) => state.key === 'comparisonComplete'), 'Parabola comparison state is absent')
    assert(project.navigationGuards.some((guard) => guard.toLocationIds.includes('parabola-slide:summary')), 'Parabola summary guard is absent')
    const runtimeFields = Object.keys(productInventory.entries).map(decodeURIComponent)
    assert(runtimeFields.some((address) => address.includes('runtime/content/values/prompt')), 'Parabola product inventory lost Runtime prompt')
    assert(runtimeFields.some((address) => address.includes('runtime/assets/gridBackground/assetId')), 'Parabola product inventory lost Runtime background image')
  }

  if (id === 'historical-evidence') {
    const flow = project.surfaces[0]
    assert(flow?.type === 'flow', 'Historical case must remain Flow')
    const types = new Set(flow.blocks.flatMap((block) => block.type === 'section'
      ? [block.type, ...block.blocks.map((nested) => nested.type)]
      : [block.type]))
    for (const type of ['heading', 'paragraph', 'section', 'list', 'table', 'quote', 'callout', 'component']) {
      assert(types.has(type as FlowBlock['type']), `Historical Flow lost ${type} semantics`)
    }
    const componentFields = Object.keys(productInventory.entries).map(decodeURIComponent)
    assert(componentFields.some((address) => address.includes('props/items/one')), 'Historical product inventory lost nested component item text')
  }

  if (id === 'ecosystem-mixed') {
    assert(JSON.stringify(project.surfaces.map((surface) => surface.type)) === JSON.stringify(['slide', 'flow', 'spatial-2d', 'slide']), 'Ecosystem surface sequence changed')
    const flow = project.surfaces.find((surface) => surface.type === 'flow') as FlowSurfaceDocument
    const component = flow.blocks.find((block) => block.type === 'component')
    assert(component?.type === 'component' && component.props.completionStateKey === 'pathsExplored' && component.props.requiredMoves === 2, 'Ecosystem Flow component no longer records path exploration')
    const spatial = project.surfaces.find((surface) => surface.type === 'spatial-2d') as SpatialSurfaceDocument
    assert(spatial.camera.frames.length === 3, 'Ecosystem Spatial must retain three named camera frames')
    assert(spatial.semanticZoom.some((rule) => rule.visible === false && rule.layerItemIds.length >= 3), 'Ecosystem Spatial lost evidence semantic zoom')
    const relationLines = spatial.world.layerItems.filter((item) => (
      item.kind === 'native' && item.content.nativeType === 'shape' && item.content.data.shapeType === 'line'
    )) as Array<Extract<LayerItem, { kind: 'native' }>>
    assert(relationLines.length === 9, 'Ecosystem Spatial lost a food-web relation')
    assert(relationLines.every((item) => item.frame.width > 100 && item.frame.height === 1), 'Ecosystem relation lines do not preserve positive V9 geometry')
    assert(project.navigationGuards.some((guard) => guard.toLocationIds.includes('ecosystem:revision')), 'Ecosystem final Slide guard is absent')
    const componentFields = Object.keys(productInventory.entries).map(decodeURIComponent)
    assert(componentFields.some((address) => address.includes('props/completionStateKey')), 'Ecosystem product inventory lost completion-state component prop')
  }
}

async function verifyExports(
  data: CourseProjectArchiveData,
): Promise<{ printPages: number; docxBytes: number; pptxBytes: number }> {
  const resolveDataUrl = (assetId: string): string | undefined => {
    const meta = data.project.assets[assetId]
    const bytes = data.assetFiles[assetId]
    return meta && bytes
      ? `data:${meta.mimeType};base64,${Buffer.from(bytes).toString('base64')}`
      : undefined
  }
  const print = await buildCoursePrintArtifacts(data.project, {
    resolveAsset: resolveDataUrl,
    captureSlide: ({ scene }) => scenePrintFragment(scene),
  })
  assert(print.failures.length === 0, `Print plan failed: ${print.failures.map((failure) => failure.error.message).join('; ')}`)
  assert(print.artifact && print.artifact.pageCount > 0, 'Print plan produced no pages')
  assert(print.artifact.html.includes('data-courseware-print-document="paged"'), 'Print plan is not paged semantic HTML')

  let docxBytes = 0
  for (const surface of data.project.surfaces) {
    if (surface.type !== 'flow') continue
    const result = buildFlowDocx(surface, {
      resolveAsset(assetId) {
        const meta = data.project.assets[assetId]
        const bytes = data.assetFiles[assetId]
        return meta && bytes ? { bytes, mimeType: meta.mimeType, filename: meta.filename } : undefined
      },
      createdAt: fixedArchiveTime,
    })
    docxBytes += result.bytes.byteLength
    assert(result.bytes.byteLength > 1_000, `${surface.id}: DOCX is unexpectedly small`)
    const documentXml = new TextDecoder().decode(unzipSync(result.bytes)['word/document.xml'])
    assert(documentXml.includes('<w:document'), `${surface.id}: DOCX has no document body`)
    if (data.project.id === 'historical-evidence') {
      assert(documentXml.includes('<w:tbl>'), 'Historical DOCX lost its semantic table')
      assert(documentXml.includes('w:val="Quote"'), 'Historical DOCX lost its quote style')
      assert(documentXml.includes('w:val="Heading1"'), 'Historical DOCX lost its heading hierarchy')
      assert(result.report.some((entry) => entry.blockId === 'history-evidence-sort' && entry.disposition === 'fallback'), 'Historical DOCX did not report the component fallback')
    }
  }

  let pptxBytes = 0
  if (data.project.surfaces.some((surface) => surface.type === 'slide')) {
    const result = await buildCoursePptx(data.project, data.assetFiles)
    pptxBytes = result.bytes.byteLength
    assert(result.slideCount === data.project.surfaces
      .filter((surface) => surface.type === 'slide')
      .reduce((count, surface) => count + surface.scenes.length, 0), 'PPTX slide count differs from Slide surfaces')
    assert(result.bytes.byteLength > 10_000, 'PPTX is unexpectedly small')
    assert(result.differences.some((entry) => entry.target === 'pptx'), 'PPTX difference report is absent')
  }
  return { printPages: print.artifact.pageCount, docxBytes, pptxBytes }
}

async function reopenFromMovedPath(projectPath: string): Promise<CourseProjectArchiveData> {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-course-case-'))
  try {
    const first = path.join(temporary, 'source.h5lesson')
    const movedDirectory = path.join(temporary, '中文 移动后路径')
    const moved = path.join(movedDirectory, 'project.h5lesson')
    await mkdir(movedDirectory, { recursive: true })
    await copyFile(projectPath, first)
    await rename(first, moved)
    return openCourseProjectArchive(new Uint8Array(await readFile(moved)))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

async function verifyCase(
  built: BuiltCase,
  playerBundle: string,
): Promise<CaseMetrics> {
  const directory = path.join(caseRoot, built.id)
  const projectPath = path.join(directory, 'project.h5lesson')
  const htmlPath = path.join(directory, 'course.html')
  const archiveBytes = new Uint8Array(await readFile(projectPath))
  const html = await readFile(htmlPath, 'utf8')
  const expectedArchive = createCourseProjectArchive({
    project: built.project,
    assetFiles: built.assetFiles,
    componentFiles: built.componentFiles,
  }, { mtime: fixedArchiveTime })
  assert(
    Buffer.compare(Buffer.from(archiveBytes), Buffer.from(expectedArchive)) === 0,
    `${built.id}: project.h5lesson is stale relative to the current Agent Kit input or capability modules`,
  )
  const reopened = await reopenFromMovedPath(projectPath)
  const parsed = courseProjectDocumentSchema.parse(reopened.project)
  assert(parsed.schemaVersion === 9, `${built.id}: moved archive is not Course Project V9`)
  assertCaseSemantics(reopened, built.id)

  const components = componentsFromArchive(reopened)
  const published = buildPublishedCourseV2Payload({
    project: reopened.project,
    assetFiles: reopened.assetFiles,
    components,
  })
  publishedCourseV2Schema.parse(published)
  assert(published.sourceSchemaVersion === 9 && published.formatVersion === 2, `${built.id}: Published Course version mismatch`)
  assertOfflineClosure(html, built.id)
  const rebuiltHtml = normalizeGeneratedHtml(buildPublishedCourseStandaloneHtml({
    project: reopened.project,
    assetFiles: reopened.assetFiles,
    components,
  }, playerBundle))
  assert(rebuiltHtml === html, `${built.id}: standalone HTML is not deterministic from its moved archive`)

  const exports = await verifyExports(reopened)
  const model = layerMetrics(reopened.project)
  const metrics: CaseMetrics = {
    archiveBytes: archiveBytes.byteLength,
    standaloneHtmlBytes: Buffer.byteLength(html),
    ...model,
    ...exports,
  }
  const budget = PERFORMANCE_BUDGETS[built.id]
  assert(metrics.archiveBytes <= budget.archiveBytes, `${built.id}: archive budget exceeded (${metrics.archiveBytes} > ${budget.archiveBytes})`)
  assert(metrics.standaloneHtmlBytes <= budget.standaloneHtmlBytes, `${built.id}: HTML budget exceeded (${metrics.standaloneHtmlBytes} > ${budget.standaloneHtmlBytes})`)
  assert(metrics.maxSlideLayers <= budget.maxSlideLayers, `${built.id}: Slide layer budget exceeded`)
  assert(metrics.flowBlocks <= budget.maxFlowBlocks, `${built.id}: Flow block budget exceeded`)
  assert(metrics.spatialItems <= budget.maxSpatialItems, `${built.id}: Spatial item budget exceeded`)
  assert(metrics.maxSpatialVisibleAtFrame <= budget.maxSpatialVisibleAtFrame, `${built.id}: Spatial visible-frame budget exceeded`)
  assert(built.semanticAuthoringAddresses > 0, `${built.id}: Agent Kit produced no stable authoring addresses`)
  return metrics
}

async function writeCase(built: BuiltCase, playerBundle: string): Promise<void> {
  const directory = path.join(caseRoot, built.id)
  await mkdir(directory, { recursive: true })
  const project = courseProjectDocumentSchema.parse(built.project)
  const archive = createCourseProjectArchive({
    project,
    assetFiles: built.assetFiles,
    componentFiles: built.componentFiles,
  }, { mtime: fixedArchiveTime })
  const reopened = openCourseProjectArchive(archive)
  const components = componentsFromArchive(reopened)
  const html = normalizeGeneratedHtml(buildPublishedCourseStandaloneHtml({
    project: reopened.project,
    assetFiles: reopened.assetFiles,
    components,
  }, playerBundle))
  await writeFile(path.join(directory, 'project.h5lesson'), archive)
  await writeFile(path.join(directory, 'course.html'), html, 'utf8')
}

async function main(): Promise<void> {
  const playerBundle = await readFile(playerBundlePath, 'utf8').catch(() => '')
  assert(playerBundle.trim(), 'Course Player bundle is missing. Run npm run build:player before building course cases.')
  const component = await loadEvidenceSort()
  const parameterSource = await readFile(path.join(root, runtimeModule), 'utf8')
  assert(parameterSource.includes("coursewareAssetKey = 'gridBackground'"), 'Parameter Runtime has no editable gridBackground target')
  assert(component.source.runtimeSource.includes('courseState.set'), 'Evidence-sort component cannot report a completion state')
  const properties = new Set(component.source.manifest.editor?.properties.map((property) => property.key))
  for (const key of ['title', 'columns.left', 'columns.middle', 'columns.right', 'items.one', 'items.six', 'completionStateKey', 'requiredMoves']) {
    assert(properties.has(key), `Evidence-sort manifest does not expose ${key}`)
  }

  for (const id of Object.keys(PERFORMANCE_BUDGETS) as CaseId[]) {
    const [plan, presentation] = await Promise.all([
      readFile(path.join(caseRoot, id, '01-teaching-plan.md'), 'utf8'),
      readFile(path.join(caseRoot, id, '02-presentation-script.md'), 'utf8'),
    ])
    assert(plan.trim().startsWith('# ') && presentation.trim().startsWith('# '), `${id}: the two teacher-readable source documents are missing or empty`)
  }

  const verifyOnly = process.argv.includes('--verify-only')
  const cases = [
    buildParabola(parameterSource, component),
    buildHistorical(parameterSource, component),
    buildEcosystem(parameterSource, component),
  ]
  if (!verifyOnly) {
    for (const built of cases) await writeCase(built, playerBundle)
  }

  const report: Record<string, CaseMetrics & { schemaVersion: 9; publishedVersion: 2; authoringAddresses: number }> = {}
  for (const built of cases) {
    const metrics = await verifyCase(built, playerBundle)
    report[built.id] = {
      schemaVersion: 9,
      publishedVersion: 2,
      authoringAddresses: built.semanticAuthoringAddresses,
      ...metrics,
    }
  }
  process.stdout.write(`${JSON.stringify({ valid: true, cases: report })}\n`)
}

main().catch((cause) => {
  const error = cause instanceof Error ? cause : new Error(String(cause))
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
