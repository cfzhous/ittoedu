import { z } from 'zod'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_PROJECT_SCENES,
  MAX_SCENE_PRESENTATION_STATES,
  MAX_SCENE_NODES,
} from './constants'
import { SHAPE_TYPES, type ProjectDocument, type SceneNode } from './projectTypes'
import { ELEMENT_ENTRANCE_PRESETS } from './elementAnimation'
import {
  interactionRuleV6Schema,
  sceneInteractionsSchema,
} from './interactionSchema'
import type {
  InteractionActionPayload,
  InteractionActionStep,
  InteractionRule,
  InteractionRuleV6,
  MotionDirection,
} from './interactionTypes'
import {
  applySceneNodeOverride,
  createDefaultScenePresentation,
} from './presentation'
import {
  runtimeDocumentSchema,
  runtimeDocumentV1Schema,
} from './runtimeSchema'

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const finiteNumber = z.number().finite()
const positiveSize = finiteNumber.min(16)
const unitInterval = finiteNumber.min(0).max(1)

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Zod objects intentionally strip unknown fields. State overrides must instead
 * reject them, otherwise a field for another node type would survive in the
 * authored override while being invisible to schema validation.
 */
function findUnsupportedNodeOverridePath(
  baseNode: SceneNode,
  override: Record<string, unknown>,
): string | undefined {
  const visit = (
    base: unknown,
    current: unknown,
    path: string[],
  ): string | undefined => {
    if (!isPlainRecord(current) || !isPlainRecord(base)) return undefined
    // Component props are an author-defined record and may introduce keys that
    // are not present in defaultProps.
    if (baseNode.type === 'external-component' && path[0] === 'props') {
      return undefined
    }
    for (const [key, value] of Object.entries(current)) {
      // Optional V6 animation may be introduced by a named-state override even
      // when the canonical base node does not own the optional field yet.
      if (path.length === 0 && key === 'animation') continue
      if (!Object.prototype.hasOwnProperty.call(base, key)) {
        return [...path, key].join('.')
      }
      const nested = visit(base[key], value, [...path, key])
      if (nested) return nested
    }
    return undefined
  }
  return visit(baseNode, override, [])
}

function findFieldStrippedByNodeSchema(
  input: unknown,
  parsed: unknown,
  path: Array<string | number> = [],
): string | undefined {
  if (Array.isArray(input)) {
    if (!Array.isArray(parsed)) return undefined
    for (const [index, value] of input.entries()) {
      const nested = findFieldStrippedByNodeSchema(
        value,
        parsed[index],
        [...path, index],
      )
      if (nested) return nested
    }
    return undefined
  }
  if (!isPlainRecord(input) || !isPlainRecord(parsed)) return undefined
  for (const [key, value] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
      return [...path, key].join('.')
    }
    const nested = findFieldStrippedByNodeSchema(
      value,
      parsed[key],
      [...path, key],
    )
    if (nested) return nested
  }
  return undefined
}

const v1BaseNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  x: finiteNumber,
  y: finiteNumber,
  width: positiveSize,
  height: positiveSize,
  visible: z.boolean(),
})

const v1TextNodeSchema = v1BaseNodeSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  style: z.object({
    fontFamily: z.string().min(1),
    fontSize: finiteNumber.min(8).max(400),
    color: colorSchema,
    align: z.enum(['left', 'center', 'right']),
    lineSpacing: finiteNumber.min(0).max(200),
  }),
})

const v1ImageNodeSchema = v1BaseNodeSchema.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  preserveAspectRatio: z.boolean(),
})

const v1RectangleNodeSchema = v1BaseNodeSchema.extend({
  type: z.literal('rectangle'),
  style: z.object({
    fillColor: colorSchema,
    borderColor: colorSchema,
    borderWidth: finiteNumber.min(0).max(100),
    cornerRadius: finiteNumber.min(0).max(500),
  }),
})

const componentReferenceSchema = z.object({
  packageId: z.string().min(1),
  version: z.string().min(1),
})

const v1ExternalComponentNodeSchema = v1BaseNodeSchema.extend({
  type: z.literal('external-component'),
  component: componentReferenceSchema,
  props: z.record(z.string(), z.unknown()),
})

const assetMetaV4Schema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  path: z.string().min(1).refine((path) => !/^(?:[a-zA-Z]:[\\/]|[\\/]{2}|\/)/.test(path), {
    message: '素材路径必须是相对路径',
  }),
  byteLength: z.number().int().nonnegative(),
  width: finiteNumber.positive().optional(),
  height: finiteNumber.positive().optional(),
})

const assetMetaSchema = assetMetaV4Schema.extend({
  kind: z.enum(['image', 'audio', 'video']),
  duration: finiteNumber.nonnegative().optional(),
})

const embeddedComponentPackageMetaSchema = z.object({
  packageId: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  manifestPath: z.string().min(1),
  runtimePath: z.string().min(1),
  thumbnailPath: z.string().min(1).optional(),
})

export const projectDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canvas: z.object({
    width: z.literal(CANVAS_WIDTH),
    height: z.literal(CANVAS_HEIGHT),
  }),
  scenes: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    backgroundColor: colorSchema,
    nodes: z.array(z.discriminatedUnion('type', [
      v1TextNodeSchema,
      v1ImageNodeSchema,
      v1RectangleNodeSchema,
      v1ExternalComponentNodeSchema,
    ])).max(MAX_SCENE_NODES),
  })).min(1).max(MAX_PROJECT_SCENES),
  assets: z.record(z.string(), assetMetaV4Schema),
  componentPackages: z.record(z.string(), embeddedComponentPackageMetaSchema),
})

const baseNodeSchema = v1BaseNodeSchema.extend({
  rotation: finiteNumber.min(-36000).max(36000),
  opacity: unitInterval,
  locked: z.boolean(),
})

const textRunStyleSchema = z.object({
  color: colorSchema.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  highlightColor: colorSchema.nullable().optional(),
})

const textNodeV5Schema = baseNodeSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  runs: z.array(z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    style: textRunStyleSchema,
  })).max(10_000),
  style: z.object({
    fontFamily: z.string().min(1),
    fontSize: finiteNumber.min(8).max(400),
    color: colorSchema,
    bold: z.boolean(),
    italic: z.boolean(),
    underline: z.boolean(),
    strike: z.boolean(),
    highlightColor: colorSchema.nullable(),
    align: z.enum(['left', 'center', 'right']),
    verticalAlign: z.enum(['top', 'middle', 'bottom']),
    writingMode: z.enum(['horizontal', 'vertical']),
    lineSpacing: finiteNumber.min(0).max(200),
    letterSpacing: finiteNumber.min(-20).max(100),
    padding: finiteNumber.min(0).max(200),
    overflow: z.enum(['auto-height', 'fixed', 'shrink']),
    backgroundColor: colorSchema,
    backgroundOpacity: unitInterval,
    cornerRadius: finiteNumber.min(0).max(500),
  }),
}).superRefine((node, context) => {
  const characterCount = Array.from(node.text).length
  for (const [index, run] of node.runs.entries()) {
    if (run.end <= run.start || run.end > characterCount) {
      context.addIssue({
        code: 'custom',
        path: ['runs', index],
        message: '富文本范围必须位于文字内容内且结束位置大于开始位置',
      })
    }
  }
})

const imageNodeV5Schema = baseNodeSchema.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  preserveAspectRatio: z.boolean(),
  fit: z.enum(['contain', 'cover', 'stretch']),
  crop: z.object({
    left: unitInterval,
    top: unitInterval,
    right: unitInterval,
    bottom: unitInterval,
  }).default({ left: 0, top: 0, right: 0, bottom: 0 }),
  cropX: unitInterval,
  cropY: unitInterval,
  flipX: z.boolean(),
  flipY: z.boolean(),
  cornerRadius: finiteNumber.min(0).max(500),
  feather: z.object({
    amount: finiteNumber.min(0).max(100),
    mode: z.enum(['rectangle', 'ellipse']),
  }),
}).superRefine((node, context) => {
  if (node.crop.left + node.crop.right >= 0.99) {
    context.addIssue({
      code: 'custom',
      path: ['crop'],
      message: '图片左右裁剪总量必须小于 99%',
    })
  }
  if (node.crop.top + node.crop.bottom >= 0.99) {
    context.addIssue({
      code: 'custom',
      path: ['crop'],
      message: '图片上下裁剪总量必须小于 99%',
    })
  }
})

const videoNodeV5Schema = baseNodeSchema.extend({
  type: z.literal('video'),
  assetId: z.string().min(1),
  fit: z.enum(['contain', 'cover', 'stretch']),
  autoplay: z.boolean(),
  loop: z.boolean(),
  muted: z.boolean(),
  volume: unitInterval,
  playbackRate: finiteNumber.min(0.25).max(4),
  showControls: z.boolean(),
  clickToToggle: z.boolean(),
  startTime: finiteNumber.nonnegative(),
  endTime: finiteNumber.positive().nullable(),
  poster: z.object({
    mode: z.enum(['video-frame', 'image']),
    time: finiteNumber.nonnegative(),
    assetId: z.string().min(1).optional(),
  }),
  backgroundAudioMode: z.enum(['none', 'duck', 'pause', 'stop']),
}).superRefine((node, context) => {
  if (node.endTime !== null && node.endTime <= node.startTime) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: '视频结束时间必须大于开始时间',
    })
  }
  if (node.poster.mode === 'image' && !node.poster.assetId) {
    context.addIssue({
      code: 'custom',
      path: ['poster', 'assetId'],
      message: '图片封面必须引用图片素材',
    })
  }
})

const shapeNodeV5Schema = baseNodeSchema.extend({
  type: z.literal('shape'),
  shapeType: z.enum(SHAPE_TYPES),
  style: z.object({
    fillColor: colorSchema,
    fillOpacity: unitInterval,
    borderColor: colorSchema,
    borderOpacity: unitInterval,
    borderWidth: finiteNumber.min(0).max(100),
    lineStyle: z.enum(['solid', 'dashed', 'dotted']),
    cornerRadius: finiteNumber.min(0).max(500),
    startArrow: z.enum(['none', 'triangle', 'stealth', 'circle', 'diamond']),
    endArrow: z.enum(['none', 'triangle', 'stealth', 'circle', 'diamond']),
  }),
})

const externalComponentNodeV5Schema = baseNodeSchema.extend({
  type: z.literal('external-component'),
  component: componentReferenceSchema,
  props: z.record(z.string(), z.unknown()),
})

const teacherControllerNodeV5Schema = baseNodeSchema.extend({
  type: z.literal('teacher-controller'),
  title: z.string().max(80),
  showSceneProgress: z.boolean(),
  compact: z.boolean(),
  buttons: z.array(z.object({
    action: z.enum(['previous', 'next', 'replay', 'restart', 'sound', 'fullscreen']),
    label: z.string().min(1).max(20),
    visible: z.boolean(),
  })).min(1).max(6).superRefine((buttons, context) => {
    const actions = buttons.map((button) => button.action)
    if (new Set(actions).size !== actions.length) {
      context.addIssue({ code: 'custom', message: '控制器按钮动作不能重复' })
    }
  }),
  style: z.object({
    backgroundColor: colorSchema,
    backgroundOpacity: unitInterval,
    accentColor: colorSchema,
    textColor: colorSchema,
    cornerRadius: finiteNumber.min(0).max(100),
  }),
  includeInStaticExports: z.boolean(),
})

const sceneNodeV4Schema = z.discriminatedUnion('type', [
  textNodeV5Schema,
  imageNodeV5Schema,
  shapeNodeV5Schema,
  externalComponentNodeV5Schema,
])

const sceneNodeV5Schema = z.discriminatedUnion('type', [
  textNodeV5Schema,
  imageNodeV5Schema,
  videoNodeV5Schema,
  shapeNodeV5Schema,
  teacherControllerNodeV5Schema,
  externalComponentNodeV5Schema,
])

const elementEntranceAnimationSchema = z.object({
  preset: z.enum(ELEMENT_ENTRANCE_PRESETS),
  durationMs: finiteNumber.min(80).max(4_000),
  delayMs: finiteNumber.min(0).max(10_000),
}).strict()

const animationFieldsSchema = z.object({
  animation: elementEntranceAnimationSchema.optional(),
})

const playbackFieldsSchema = z.object({
  playbackInitialVisibility: z.enum(['inherit', 'hidden']),
})

const textNodeV6Schema = textNodeV5Schema.and(animationFieldsSchema)
const imageNodeV6Schema = imageNodeV5Schema.and(animationFieldsSchema)
const videoNodeV6Schema = videoNodeV5Schema.and(animationFieldsSchema)
const shapeNodeV6Schema = shapeNodeV5Schema.and(animationFieldsSchema)
const externalComponentNodeV6Schema = externalComponentNodeV5Schema.and(
  animationFieldsSchema,
)

export const textNodeSchema = textNodeV5Schema.and(playbackFieldsSchema)
export const imageNodeSchema = imageNodeV5Schema.and(playbackFieldsSchema)
export const videoNodeSchema = videoNodeV5Schema.and(playbackFieldsSchema)
export const shapeNodeSchema = shapeNodeV5Schema.and(playbackFieldsSchema)
export const externalComponentNodeSchema = externalComponentNodeV5Schema.and(
  playbackFieldsSchema,
)

const teacherControllerActionV6Schemas = [
  z.object({ type: z.literal('scene.previous') }).strict(),
  z.object({ type: z.literal('scene.next') }).strict(),
  z.object({ type: z.literal('scene.replay') }).strict(),
  z.object({ type: z.literal('course.restart') }).strict(),
  z.object({
    type: z.literal('scene.go'),
    sceneId: z.string().trim().min(1).max(200),
    targetStateId: z.string().trim().min(1).max(200).optional(),
  }).strict(),
  z.object({ type: z.literal('audio.toggle-mute') }).strict(),
  z.object({ type: z.literal('player.fullscreen.toggle') }).strict(),
] as const

const teacherControllerActionV6Schema = z.discriminatedUnion(
  'type',
  teacherControllerActionV6Schemas,
)

const teacherControllerActionSchema = z.discriminatedUnion('type', [
  ...teacherControllerActionV6Schemas,
  z.object({ type: z.literal('scene.open-picker') }).strict(),
])

const teacherControllerFieldsV6Schema = z.object({
  type: z.literal('teacher-controller'),
  title: z.string().max(80),
  showSceneProgress: z.boolean(),
  compact: z.boolean(),
  collapsible: z.boolean(),
  defaultCollapsed: z.boolean(),
  buttons: z.array(z.object({
    id: z.string().trim().min(1).max(200),
    action: teacherControllerActionV6Schema,
    label: z.string().min(1).max(20),
    visible: z.boolean(),
  }).strict()).min(1).max(12).superRefine((buttons, context) => {
    const ids = buttons.map((button) => button.id)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: '控制器按钮 ID 不能重复' })
    }
  }),
  style: z.object({
    backgroundColor: colorSchema,
    backgroundOpacity: unitInterval,
    accentColor: colorSchema,
    textColor: colorSchema,
    cornerRadius: finiteNumber.min(0).max(100),
  }),
  includeInStaticExports: z.boolean(),
})

const teacherControllerNodeV6Schema = baseNodeSchema
  .and(animationFieldsSchema)
  .and(teacherControllerFieldsV6Schema)

export const teacherControllerNodeSchema = baseNodeSchema
  .and(playbackFieldsSchema)
  .and(z.object({
    type: z.literal('teacher-controller'),
    title: z.string().max(80),
    showSceneProgress: z.boolean(),
    compact: z.boolean(),
    collapsible: z.boolean(),
    defaultCollapsed: z.boolean(),
    buttons: z.array(z.object({
      id: z.string().trim().min(1).max(200),
      action: teacherControllerActionSchema,
      label: z.string().min(1).max(20),
      visible: z.boolean(),
    }).strict()).min(1).max(12).superRefine((buttons, context) => {
      const ids = buttons.map((button) => button.id)
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: 'custom', message: '控制器按钮 ID 不能重复' })
      }
    }),
    style: z.object({
      backgroundColor: colorSchema,
      backgroundOpacity: unitInterval,
      accentColor: colorSchema,
      textColor: colorSchema,
      cornerRadius: finiteNumber.min(0).max(100),
    }),
    includeInStaticExports: z.boolean(),
  }))

const sceneNodeV6Schema = z.union([
  textNodeV6Schema,
  imageNodeV6Schema,
  videoNodeV6Schema,
  shapeNodeV6Schema,
  teacherControllerNodeV6Schema,
  externalComponentNodeV6Schema,
])

export const sceneNodeSchema = z.union([
  textNodeSchema,
  imageNodeSchema,
  videoNodeSchema,
  shapeNodeSchema,
  teacherControllerNodeSchema,
  externalComponentNodeSchema,
])

const sceneNodeOverrideSchema = z.record(z.string(), z.unknown()).superRefine(
  (override, context) => {
    if ('id' in override || 'type' in override || 'component' in override) {
      context.addIssue({
        code: 'custom',
        message: '状态覆盖不能修改节点 id、type 或组件包引用',
      })
    }
  },
)

export const scenePresentationStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  backgroundColor: colorSchema.optional(),
  backgroundAssetId: z.string().min(1).nullable().optional(),
  nodeOverrides: z.record(z.string().min(1), sceneNodeOverrideSchema),
  nodeOrder: z.array(z.string().min(1)).max(MAX_SCENE_NODES).optional(),
})

export const scenePresentationSchema = z.object({
  initialStateId: z.string().min(1),
  thumbnailStateId: z.string().min(1).optional(),
  states: z.array(scenePresentationStateSchema)
    .min(1)
    .max(MAX_SCENE_PRESENTATION_STATES),
}).superRefine((presentation, context) => {
  const stateIds = presentation.states.map((state) => state.id)
  if (new Set(stateIds).size !== stateIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['states'],
      message: '同一场景中的状态 ID 不能重复',
    })
  }
  if (!stateIds.includes(presentation.initialStateId)) {
    context.addIssue({
      code: 'custom',
      path: ['initialStateId'],
      message: '初始状态必须引用当前场景中的状态',
    })
  }
  if (
    presentation.thumbnailStateId !== undefined &&
    !stateIds.includes(presentation.thumbnailStateId)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['thumbnailStateId'],
      message: '缩略图状态必须引用当前场景中的状态',
    })
  }
})

const sceneDocumentV2Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  backgroundColor: colorSchema,
  backgroundAssetId: z.string().min(1).nullable().optional(),
  nodes: z.array(sceneNodeV4Schema).max(MAX_SCENE_NODES),
})

export const projectDocumentV2Schema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canvas: z.object({
    width: z.literal(CANVAS_WIDTH),
    height: z.literal(CANVAS_HEIGHT),
  }),
  scenes: z.array(sceneDocumentV2Schema).min(1).max(MAX_PROJECT_SCENES),
  assets: z.record(z.string(), assetMetaV4Schema),
  componentPackages: z.record(z.string(), embeddedComponentPackageMetaSchema),
})

const sceneDocumentV4Schema = sceneDocumentV2Schema.extend({
  presentation: scenePresentationSchema.optional(),
  runtime: runtimeDocumentV1Schema.optional(),
}).superRefine((scene, context) => {
  const nodeIds = scene.nodes.map((node) => node.id)
  if (new Set(nodeIds).size !== nodeIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: '同一场景中的节点 ID 不能重复',
    })
  }
  if (!scene.presentation) return
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]))
  for (const [stateIndex, state] of scene.presentation.states.entries()) {
    if (state.nodeOrder) {
      if (new Set(state.nodeOrder).size !== state.nodeOrder.length) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOrder'],
          message: '状态节点层级不能包含重复 ID',
        })
      }
      for (const nodeId of state.nodeOrder) {
        if (!nodesById.has(nodeId)) {
          context.addIssue({
            code: 'custom',
            path: ['presentation', 'states', stateIndex, 'nodeOrder'],
            message: `状态节点层级引用了不存在的节点：${nodeId}`,
          })
        }
      }
    }
    for (const [nodeId, override] of Object.entries(state.nodeOverrides)) {
      const baseNode = nodesById.get(nodeId)
      if (!baseNode) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖引用了不存在的节点：${nodeId}`,
        })
        continue
      }
      const unsupportedPath = findUnsupportedNodeOverridePath(
        baseNode as unknown as SceneNode,
        override,
      )
      if (unsupportedPath) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖包含不适用于该节点的字段：${unsupportedPath}`,
        })
        continue
      }
      const materializedNode = applySceneNodeOverride(
        baseNode as unknown as SceneNode,
        override,
      )
      const result = sceneNodeV4Schema.safeParse(materializedNode)
      if (!result.success) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖生成了无效节点：${result.error.issues[0]?.message ?? nodeId}`,
        })
      } else {
        const strippedPath = findFieldStrippedByNodeSchema(
          materializedNode,
          result.data,
        )
        if (strippedPath) {
          context.addIssue({
            code: 'custom',
            path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
            message: `状态覆盖包含未知字段：${strippedPath}`,
          })
        }
      }
    }
  }
})

const sceneDocumentV5Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  backgroundColor: colorSchema,
  backgroundAssetId: z.string().min(1).nullable().optional(),
  nodes: z.array(sceneNodeV5Schema).max(MAX_SCENE_NODES),
  presentation: scenePresentationSchema.optional(),
  runtime: runtimeDocumentV1Schema.optional(),
  interactions: z.array(interactionRuleV6Schema).max(2_000),
}).superRefine((scene, context) => {
  const nodeIds = scene.nodes.map((node) => node.id)
  if (new Set(nodeIds).size !== nodeIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: '同一场景中的节点 ID 不能重复',
    })
  }
  const ruleIds = scene.interactions.map((rule) => rule.id)
  if (new Set(ruleIds).size !== ruleIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['interactions'],
      message: '同一场景中的交互规则 ID 不能重复',
    })
  }
  if (!scene.presentation) return
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]))
  for (const [stateIndex, state] of scene.presentation.states.entries()) {
    if (state.nodeOrder) {
      if (new Set(state.nodeOrder).size !== state.nodeOrder.length) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOrder'],
          message: '状态节点层级不能包含重复 ID',
        })
      }
      for (const nodeId of state.nodeOrder) {
        if (!nodesById.has(nodeId)) {
          context.addIssue({
            code: 'custom',
            path: ['presentation', 'states', stateIndex, 'nodeOrder'],
            message: `状态节点层级引用了不存在的节点：${nodeId}`,
          })
        }
      }
    }
    for (const [nodeId, override] of Object.entries(state.nodeOverrides)) {
      const baseNode = nodesById.get(nodeId)
      if (!baseNode) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖引用了不存在的节点：${nodeId}`,
        })
        continue
      }
      const unsupportedPath = findUnsupportedNodeOverridePath(
        baseNode as unknown as SceneNode,
        override,
      )
      if (unsupportedPath) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖包含不适用于该节点的字段：${unsupportedPath}`,
        })
        continue
      }
      const materializedNode = applySceneNodeOverride(
        baseNode as unknown as SceneNode,
        override,
      )
      const result = sceneNodeV5Schema.safeParse(materializedNode)
      if (!result.success) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖生成了无效节点：${result.error.issues[0]?.message ?? nodeId}`,
        })
      } else {
        const strippedPath = findFieldStrippedByNodeSchema(materializedNode, result.data)
        if (strippedPath) {
          context.addIssue({
            code: 'custom',
            path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
            message: `状态覆盖包含未知字段：${strippedPath}`,
          })
        }
      }
    }
  }
})

export const globalLayerVisibilitySchema = z.object({
  mode: z.enum(['all', 'include', 'exclude']),
  sceneIds: z.array(z.string().min(1)).max(MAX_PROJECT_SCENES),
}).superRefine((visibility, context) => {
  if (visibility.mode !== 'all' && visibility.sceneIds.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['sceneIds'],
      message: '按场景控制全局元素时至少需要一个场景 ID',
    })
  }
  if (new Set(visibility.sceneIds).size !== visibility.sceneIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['sceneIds'],
      message: '全局元素的场景 ID 不能重复',
    })
  }
})

export const globalComponentInstanceSchema = z.object({
  node: externalComponentNodeV5Schema,
  layer: z.enum(['underlay', 'overlay']),
  visibility: globalLayerVisibilitySchema,
})

export const projectDocumentV3Schema = z.object({
  schemaVersion: z.literal(3),
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canvas: z.object({
    width: z.literal(CANVAS_WIDTH),
    height: z.literal(CANVAS_HEIGHT),
  }),
  scenes: z.array(sceneDocumentV4Schema).min(1).max(MAX_PROJECT_SCENES),
  assets: z.record(z.string(), assetMetaV4Schema),
  componentPackages: z.record(z.string(), embeddedComponentPackageMetaSchema),
  globalRuntime: runtimeDocumentV1Schema.optional(),
  globalComponents: z.array(globalComponentInstanceSchema).max(MAX_SCENE_NODES),
})

const globalLayerItemV4Schema = z.object({
  node: sceneNodeV4Schema,
  layer: z.enum(['underlay', 'overlay']),
  visibility: globalLayerVisibilitySchema,
})

export const globalLayerItemSchema = z.object({
  node: sceneNodeSchema,
  layer: z.enum(['underlay', 'overlay']),
  visibility: globalLayerVisibilitySchema,
})

export const projectDocumentV4Schema = z.object({
  schemaVersion: z.literal(4),
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canvas: z.object({
    width: z.literal(CANVAS_WIDTH),
    height: z.literal(CANVAS_HEIGHT),
  }),
  scenes: z.array(sceneDocumentV4Schema).min(1).max(MAX_PROJECT_SCENES),
  assets: z.record(z.string(), assetMetaV4Schema),
  componentPackages: z.record(z.string(), embeddedComponentPackageMetaSchema),
  globalRuntime: runtimeDocumentV1Schema.optional(),
  globalLayer: z.array(globalLayerItemV4Schema).max(MAX_SCENE_NODES),
})

const audioChannelVolumesSchema = z.object({
  music: unitInterval,
  narration: unitInterval,
  sfx: unitInterval,
  ui: unitInterval,
  video: unitInterval,
})

const projectMediaSettingsSchema = z.object({
  audio: z.object({
    defaultMuted: z.boolean(),
    masterVolume: unitInterval,
    channelVolumes: audioChannelVolumesSchema,
    sounds: z.record(z.string(), z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(120),
      assetId: z.string().min(1),
      channel: z.enum(['music', 'narration', 'sfx', 'ui']),
      defaultVolume: unitInterval,
      defaultLoop: z.boolean(),
    })),
    narrationDucking: z.object({
      enabled: z.boolean(),
      musicVolume: unitInterval,
      fadeMs: finiteNumber.min(0).max(10_000),
    }),
  }),
})

export const projectDocumentV5Schema = z.object({
  schemaVersion: z.literal(5),
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canvas: z.object({
    width: z.literal(CANVAS_WIDTH),
    height: z.literal(CANVAS_HEIGHT),
  }),
  scenes: z.array(sceneDocumentV5Schema).min(1).max(MAX_PROJECT_SCENES),
  assets: z.record(z.string(), assetMetaSchema),
  componentPackages: z.record(z.string(), embeddedComponentPackageMetaSchema),
  globalRuntime: runtimeDocumentV1Schema.optional(),
  globalLayer: z.array(z.object({
    node: sceneNodeV5Schema,
    layer: z.enum(['underlay', 'overlay']),
    visibility: globalLayerVisibilitySchema,
  })).max(MAX_SCENE_NODES),
  media: projectMediaSettingsSchema,
  playback: z.object({
    controls: z.enum(['canvas', 'footer', 'none']),
    keyboardNavigation: z.boolean(),
  }),
})

const sceneDocumentV6Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  backgroundColor: colorSchema,
  backgroundAssetId: z.string().min(1).nullable().optional(),
  nodes: z.array(sceneNodeV6Schema).max(MAX_SCENE_NODES),
  presentation: scenePresentationSchema.optional(),
  runtime: runtimeDocumentV1Schema.optional(),
  interactions: z.array(interactionRuleV6Schema).max(2_000),
}).superRefine((scene, context) => {
  const nodeIds = scene.nodes.map((node) => node.id)
  if (new Set(nodeIds).size !== nodeIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: '同一场景中的节点 ID 不能重复',
    })
  }
  const ruleIds = scene.interactions.map((rule) => rule.id)
  if (new Set(ruleIds).size !== ruleIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['interactions'],
      message: '同一场景中的交互规则 ID 不能重复',
    })
  }
  if (!scene.presentation) return
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]))
  for (const [stateIndex, state] of scene.presentation.states.entries()) {
    if (state.nodeOrder) {
      if (new Set(state.nodeOrder).size !== state.nodeOrder.length) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOrder'],
          message: '状态节点层级不能包含重复 ID',
        })
      }
      for (const nodeId of state.nodeOrder) {
        if (!nodesById.has(nodeId)) {
          context.addIssue({
            code: 'custom',
            path: ['presentation', 'states', stateIndex, 'nodeOrder'],
            message: `状态节点层级引用了不存在的节点：${nodeId}`,
          })
        }
      }
    }
    for (const [nodeId, override] of Object.entries(state.nodeOverrides)) {
      const baseNode = nodesById.get(nodeId)
      if (!baseNode) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖引用了不存在的节点：${nodeId}`,
        })
        continue
      }
      const unsupportedPath = findUnsupportedNodeOverridePath(
        baseNode as unknown as SceneNode,
        override,
      )
      if (unsupportedPath) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖包含不适用于该节点的字段：${unsupportedPath}`,
        })
        continue
      }
      const materializedNode = applySceneNodeOverride(
        baseNode as unknown as SceneNode,
        override,
      )
      const result = sceneNodeV6Schema.safeParse(materializedNode)
      if (!result.success) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖生成了无效节点：${result.error.issues[0]?.message ?? nodeId}`,
        })
      } else {
        const strippedPath = findFieldStrippedByNodeSchema(materializedNode, result.data)
        if (strippedPath) {
          context.addIssue({
            code: 'custom',
            path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
            message: `状态覆盖包含未知字段：${strippedPath}`,
          })
        }
      }
    }
  }
})

/** Strict Project V6 parser retained so V6 archives can be migrated losslessly. */
export const projectDocumentV6Schema = z.object({
  schemaVersion: z.literal(6),
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canvas: z.object({
    width: z.literal(CANVAS_WIDTH),
    height: z.literal(CANVAS_HEIGHT),
  }),
  scenes: z.array(sceneDocumentV6Schema).min(1).max(MAX_PROJECT_SCENES),
  assets: z.record(z.string(), assetMetaSchema),
  componentPackages: z.record(z.string(), embeddedComponentPackageMetaSchema),
  globalRuntime: runtimeDocumentV1Schema.optional(),
  globalLayer: z.array(z.object({
    node: sceneNodeV6Schema,
    layer: z.enum(['underlay', 'overlay']),
    visibility: globalLayerVisibilitySchema,
  })).max(MAX_SCENE_NODES),
  globalInteractions: z.array(interactionRuleV6Schema).max(2_000),
  media: projectMediaSettingsSchema,
  playback: z.object({
    controls: z.enum(['canvas', 'footer', 'none']),
    keyboardNavigation: z.boolean(),
  }),
}).superRefine((project, context) => {
  const ruleIds = project.globalInteractions.map((rule) => rule.id)
  if (new Set(ruleIds).size !== ruleIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['globalInteractions'],
      message: '全局交互规则 ID 不能重复',
    })
  }
})

export const sceneDocumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  backgroundColor: colorSchema,
  backgroundAssetId: z.string().min(1).nullable().optional(),
  nodes: z.array(sceneNodeSchema).max(MAX_SCENE_NODES),
  presentation: scenePresentationSchema.optional(),
  runtime: runtimeDocumentSchema.optional(),
  interactions: sceneInteractionsSchema,
}).superRefine((scene, context) => {
  const nodeIds = scene.nodes.map((node) => node.id)
  if (new Set(nodeIds).size !== nodeIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: '同一场景中的节点 ID 不能重复',
    })
  }
  const ruleIds = scene.interactions.map((rule) => rule.id)
  if (new Set(ruleIds).size !== ruleIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['interactions'],
      message: '同一场景中的交互规则 ID 不能重复',
    })
  }
  if (!scene.presentation) return
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]))
  for (const [stateIndex, state] of scene.presentation.states.entries()) {
    if (state.nodeOrder) {
      if (new Set(state.nodeOrder).size !== state.nodeOrder.length) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOrder'],
          message: '状态节点层级不能包含重复 ID',
        })
      }
      for (const nodeId of state.nodeOrder) {
        if (!nodesById.has(nodeId)) {
          context.addIssue({
            code: 'custom',
            path: ['presentation', 'states', stateIndex, 'nodeOrder'],
            message: `状态节点层级引用了不存在的节点：${nodeId}`,
          })
        }
      }
    }
    for (const [nodeId, override] of Object.entries(state.nodeOverrides)) {
      const baseNode = nodesById.get(nodeId)
      if (!baseNode) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖引用了不存在的节点：${nodeId}`,
        })
        continue
      }
      const unsupportedPath = findUnsupportedNodeOverridePath(baseNode, override)
      if (unsupportedPath) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖包含不适用于该节点的字段：${unsupportedPath}`,
        })
        continue
      }
      const materializedNode = applySceneNodeOverride(baseNode as SceneNode, override)
      const result = sceneNodeSchema.safeParse(materializedNode)
      if (!result.success) {
        context.addIssue({
          code: 'custom',
          path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
          message: `状态覆盖生成了无效节点：${result.error.issues[0]?.message ?? nodeId}`,
        })
      } else {
        const strippedPath = findFieldStrippedByNodeSchema(materializedNode, result.data)
        if (strippedPath) {
          context.addIssue({
            code: 'custom',
            path: ['presentation', 'states', stateIndex, 'nodeOverrides', nodeId],
            message: `状态覆盖包含未知字段：${strippedPath}`,
          })
        }
      }
    }
  }
})

export const projectDocumentSchema = z.object({
  schemaVersion: z.literal(7),
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canvas: z.object({
    width: z.literal(CANVAS_WIDTH),
    height: z.literal(CANVAS_HEIGHT),
  }),
  scenes: z.array(sceneDocumentSchema).min(1).max(MAX_PROJECT_SCENES),
  assets: z.record(z.string(), assetMetaSchema),
  componentPackages: z.record(z.string(), embeddedComponentPackageMetaSchema),
  globalRuntime: runtimeDocumentSchema.optional(),
  globalLayer: z.array(globalLayerItemSchema).max(MAX_SCENE_NODES),
  globalInteractions: sceneInteractionsSchema,
  media: projectMediaSettingsSchema,
  playback: z.object({
    controls: z.enum(['canvas', 'footer', 'none']),
    keyboardNavigation: z.boolean(),
  }),
}).superRefine((project, context) => {
  const ruleIds = project.globalInteractions.map((rule) => rule.id)
  if (new Set(ruleIds).size !== ruleIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['globalInteractions'],
      message: '全局交互规则 ID 不能重复',
    })
  }
})

type ProjectDocumentV1 = z.infer<typeof projectDocumentV1Schema>
export type ProjectDocumentV2 = z.infer<typeof projectDocumentV2Schema>
export type ProjectDocumentV3 = z.infer<typeof projectDocumentV3Schema>
export type ProjectDocumentV4 = z.infer<typeof projectDocumentV4Schema>
export type ProjectDocumentV5 = z.infer<typeof projectDocumentV5Schema>
export type ProjectDocumentV6 = z.infer<typeof projectDocumentV6Schema>

const baseV2 = <T extends ProjectDocumentV1['scenes'][number]['nodes'][number]>(node: T) => ({
  id: node.id,
  name: node.name,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
  rotation: 0,
  opacity: 1,
  visible: node.visible,
  locked: false,
})

export function migrateProjectV1ToV2(project: ProjectDocumentV1): ProjectDocumentV2 {
  return {
    ...project,
    schemaVersion: 2,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      nodes: scene.nodes.map((node) => {
        switch (node.type) {
          case 'text':
            return {
              ...baseV2(node),
              type: 'text' as const,
              text: node.text,
              runs: [],
              style: {
                ...node.style,
                bold: false,
                italic: false,
                underline: false,
                strike: false,
                highlightColor: null,
                verticalAlign: 'top' as const,
                writingMode: 'horizontal' as const,
                letterSpacing: 0,
                padding: 0,
                overflow: 'auto-height' as const,
                backgroundColor: '#ffffff',
                backgroundOpacity: 0,
                cornerRadius: 0,
              },
            }
          case 'image':
            return {
              ...baseV2(node),
              type: 'image' as const,
              assetId: node.assetId,
              preserveAspectRatio: node.preserveAspectRatio,
              fit: 'stretch' as const,
              crop: { left: 0, top: 0, right: 0, bottom: 0 },
              cropX: 0.5,
              cropY: 0.5,
              flipX: false,
              flipY: false,
              cornerRadius: 0,
              feather: { amount: 0, mode: 'rectangle' as const },
            }
          case 'rectangle':
            return {
              ...baseV2(node),
              type: 'shape' as const,
              shapeType: node.style.cornerRadius > 0
                ? ('rounded-rectangle' as const)
                : ('rectangle' as const),
              style: {
                fillColor: node.style.fillColor,
                fillOpacity: 1,
                borderColor: node.style.borderColor,
                borderOpacity: 1,
                borderWidth: node.style.borderWidth,
                lineStyle: 'solid' as const,
                cornerRadius: node.style.cornerRadius,
                startArrow: 'none' as const,
                endArrow: 'none' as const,
              },
            }
          case 'external-component':
            return {
              ...baseV2(node),
              type: 'external-component' as const,
              component: { ...node.component },
              props: structuredClone(node.props),
            }
        }
      }),
    })),
  }
}

export function migrateProjectV2ToV3(project: ProjectDocumentV2): ProjectDocumentV3 {
  return {
    ...project,
    schemaVersion: 3,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      nodes: scene.nodes.map((node) => structuredClone(node)),
      presentation: createDefaultScenePresentation(),
    })),
    globalComponents: [],
  }
}

export function migrateProjectV3ToV4(project: ProjectDocumentV3): ProjectDocumentV4 {
  const { globalComponents, ...rest } = project
  return {
    ...rest,
    schemaVersion: 4,
    globalLayer: globalComponents.map((instance) => structuredClone(instance)),
  }
}

function inferAssetKind(mimeType: string): 'image' | 'audio' | 'video' {
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'image'
}

export function migrateProjectV4ToV5(project: ProjectDocumentV4): ProjectDocumentV5 {
  return {
    ...project,
    schemaVersion: 5,
    scenes: project.scenes.map((scene) => ({
      ...structuredClone(scene),
      interactions: [],
    })),
    assets: Object.fromEntries(
      Object.entries(project.assets).map(([id, asset]) => [
        id,
        { ...structuredClone(asset), kind: inferAssetKind(asset.mimeType) },
      ]),
    ),
    globalLayer: project.globalLayer.map((item) => structuredClone(item)),
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
      controls: 'footer',
      keyboardNavigation: true,
    },
  }
}

function migrateTeacherControllerAction(
  action: z.infer<typeof teacherControllerNodeV5Schema>['buttons'][number]['action'],
): z.infer<typeof teacherControllerActionV6Schema> {
  switch (action) {
    case 'previous': return { type: 'scene.previous' }
    case 'next': return { type: 'scene.next' }
    case 'replay': return { type: 'scene.replay' }
    case 'restart': return { type: 'course.restart' }
    case 'sound': return { type: 'audio.toggle-mute' }
    case 'fullscreen': return { type: 'player.fullscreen.toggle' }
  }
}

type SceneNodeV6 = z.infer<typeof sceneNodeV6Schema>
type SceneDocumentV6 = ProjectDocumentV6['scenes'][number]
type ElementEntranceAnimationV6 = z.infer<typeof elementEntranceAnimationSchema>

function migrateSceneNodeV5ToV6(
  node: z.infer<typeof sceneNodeV5Schema>,
): SceneNodeV6 {
  if (node.type !== 'teacher-controller') {
    return structuredClone(node) as SceneNodeV6
  }
  return {
    ...structuredClone(node),
    collapsible: false,
    defaultCollapsed: false,
    buttons: node.buttons.map((button, index) => ({
      id: `${node.id}_button_${index + 1}`,
      label: button.label,
      visible: button.visible,
      action: migrateTeacherControllerAction(button.action),
    })),
  }
}

export function migrateProjectV5ToV6(project: ProjectDocumentV5): ProjectDocumentV6 {
  return {
    ...structuredClone(project),
    schemaVersion: 6,
    scenes: project.scenes.map((scene) => ({
      ...structuredClone(scene),
      nodes: scene.nodes.map(migrateSceneNodeV5ToV6),
    })),
    globalLayer: project.globalLayer.map((item) => ({
      ...structuredClone(item),
      node: migrateSceneNodeV5ToV6(item.node),
    })),
    globalInteractions: [],
  }
}

function deterministicMigrationHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

function allocateMigrationId(
  prefix: string,
  identity: string,
  used: Set<string>,
): string {
  const base = `${prefix}_${deterministicMigrationHash(identity)}`
  let id = base
  let suffix = 2
  while (used.has(id)) {
    id = `${base}_${suffix}`
    suffix += 1
  }
  used.add(id)
  return id
}

interface MigratedInteractionScope {
  scopeKey: string
  rules: InteractionRule[]
  ruleIds: Set<string>
  actionIds: Set<string>
}

function migrateInteractionScopeV6(
  rules: readonly InteractionRuleV6[],
  scopeKey: string,
): MigratedInteractionScope {
  const ruleIds = new Set(rules.map((rule) => rule.id))
  const actionIds = new Set<string>()
  const migratedRules = rules.map((rule): InteractionRule => ({
    ...structuredClone(rule),
    trigger: structuredClone(rule.trigger),
    conditions: structuredClone(rule.conditions),
    actions: rule.actions.map((action, actionIndex): InteractionActionStep => ({
      id: allocateMigrationId(
        'v7_action',
        `${scopeKey}\0${rule.id}\0${actionIndex}`,
        actionIds,
      ),
      start: 'after-previous',
      delayMs: 0,
      action: structuredClone(action) as InteractionActionPayload,
    })),
  }))
  return { scopeKey, rules: migratedRules, ruleIds, actionIds }
}

function animationKey(animation: ElementEntranceAnimationV6): string {
  return `${animation.preset}\0${animation.durationMs}\0${animation.delayMs}`
}

function legacyNodeAnimation(node: SceneNodeV6): ElementEntranceAnimationV6 | undefined {
  return node.animation
}

function legacyAnimationPlaybackVisibility(
  animation: ElementEntranceAnimationV6 | undefined,
): 'inherit' | 'hidden' {
  return animation && animation.preset !== 'none' ? 'hidden' : 'inherit'
}

function legacyAnimationAction(
  nodeId: string,
  animation: ElementEntranceAnimationV6,
): InteractionActionPayload {
  const common = {
    type: 'node.enter' as const,
    nodeId,
    durationMs: animation.durationMs,
    easing: 'ease-out' as const,
  }
  if (animation.preset.startsWith('slide-')) {
    return {
      ...common,
      effect: 'slide',
      direction: animation.preset.slice('slide-'.length) as MotionDirection,
    }
  }
  return {
    ...common,
    effect: animation.preset as 'none' | 'fade' | 'scale',
  }
}

function appendMigratedAnimationRule(
  scope: MigratedInteractionScope,
  node: SceneNodeV6,
  animation: ElementEntranceAnimationV6,
  stateIds: readonly string[] | undefined,
): void {
  if (animation.preset === 'none') return
  const identity = [
    scope.scopeKey,
    node.id,
    animationKey(animation),
    ...(stateIds ?? []),
  ].join('\0')
  const ruleId = allocateMigrationId('v7_enter_rule', identity, scope.ruleIds)
  const actionId = allocateMigrationId('v7_enter_action', identity, scope.actionIds)
  scope.rules.push({
    id: ruleId,
    name: `${node.name} · 迁移入场`.slice(0, 80),
    enabled: true,
    trigger: { type: 'node.activated', nodeId: node.id },
    conditions: stateIds
      ? [{ type: 'presentation.in', stateIds: [...stateIds] }]
      : [],
    actions: [{
      id: actionId,
      start: 'after-previous',
      delayMs: animation.delayMs,
      action: legacyAnimationAction(node.id, animation),
    }],
  })
}

function appendSceneAnimationRules(
  scene: SceneDocumentV6,
  scope: MigratedInteractionScope,
): void {
  for (const node of scene.nodes) {
    if (!scene.presentation) {
      const animation = legacyNodeAnimation(node)
      if (animation) appendMigratedAnimationRule(scope, node, animation, undefined)
      continue
    }

    const groups = new Map<string, {
      animation: ElementEntranceAnimationV6
      stateIds: string[]
    }>()
    for (const state of scene.presentation.states) {
      const effectiveNode = applySceneNodeOverride(
        node as unknown as SceneNode,
        state.nodeOverrides[node.id],
      ) as unknown as SceneNodeV6
      const animation = legacyNodeAnimation(effectiveNode)
      if (!animation || animation.preset === 'none') continue
      const key = animationKey(animation)
      const group = groups.get(key)
      if (group) {
        group.stateIds.push(state.id)
      } else {
        groups.set(key, { animation, stateIds: [state.id] })
      }
    }
    for (const group of groups.values()) {
      appendMigratedAnimationRule(scope, node, group.animation, group.stateIds)
    }
  }
}

function isLegacyDefaultTeacherController(node: SceneNodeV6): boolean {
  if (node.type !== 'teacher-controller') return false
  const expectedButtons = [
    ['scene.previous', '上一场景', true],
    ['scene.next', '下一场景', true],
    ['scene.replay', '重播', true],
    ['course.restart', '重新开始', false],
    ['audio.toggle-mute', '声音', true],
    ['player.fullscreen.toggle', '全屏', true],
  ] as const
  return node.name === '教师控制器' &&
    node.title === '教师控制台' &&
    node.showSceneProgress &&
    !node.compact &&
    !node.defaultCollapsed &&
    !node.includeInStaticExports &&
    node.animation === undefined &&
    node.style.backgroundColor === '#172033' &&
    node.style.backgroundOpacity === 0.94 &&
    node.style.accentColor === '#e7b85c' &&
    node.style.textColor === '#f8fafc' &&
    node.style.cornerRadius === 16 &&
    node.buttons.length === expectedButtons.length &&
    node.buttons.every((button, index) => {
      const expected = expectedButtons[index]!
      return button.action.type === expected[0] &&
        button.label === expected[1] &&
        button.visible === expected[2]
    })
}

function migrateSceneNodeV6ToV7(node: SceneNodeV6): SceneNode {
  const migrated = structuredClone(node) as unknown as Record<string, unknown>
  delete migrated.animation
  // A migrated node.enter must start from a transiently hidden frame. Keeping
  // the authored node visible while setting this playback-only field preserves
  // thumbnails/static exports and prevents the action from completing as a
  // no-op merely because the node was already visible.
  migrated.playbackInitialVisibility = legacyAnimationPlaybackVisibility(
    legacyNodeAnimation(node),
  )
  if (isLegacyDefaultTeacherController(node) && node.type === 'teacher-controller') {
    const buttons = structuredClone(node.buttons) as Array<{
      id: string
      action: z.infer<typeof teacherControllerActionSchema>
      label: string
      visible: boolean
    }>
    const buttonIds = new Set(buttons.map((button) => button.id))
    buttons.splice(2, 0, {
      id: allocateMigrationId('v7_picker_button', node.id, buttonIds),
      action: { type: 'scene.open-picker' },
      label: '场景目录',
      visible: true,
    })
    migrated.buttons = buttons
  }
  return migrated as unknown as SceneNode
}

function migratePresentationV6ToV7(
  presentation: SceneDocumentV6['presentation'],
  nodes: readonly SceneNodeV6[],
): SceneDocumentV6['presentation'] {
  if (!presentation) return undefined
  return {
    ...structuredClone(presentation),
    states: presentation.states.map((state) => {
      const nodeOverrides = Object.fromEntries(
        Object.entries(state.nodeOverrides).flatMap(([nodeId, override]) => {
          const migrated = structuredClone(override)
          delete migrated.animation
          return Object.keys(migrated).length > 0 ? [[nodeId, migrated]] : []
        }),
      ) as Record<string, Record<string, unknown>>

      for (const node of nodes) {
        const effectiveNode = applySceneNodeOverride(
          node as unknown as SceneNode,
          state.nodeOverrides[node.id],
        ) as unknown as SceneNodeV6
        const baseVisibility = legacyAnimationPlaybackVisibility(
          legacyNodeAnimation(node),
        )
        const stateVisibility = legacyAnimationPlaybackVisibility(
          legacyNodeAnimation(effectiveNode),
        )
        if (stateVisibility === baseVisibility) continue
        nodeOverrides[node.id] = {
          ...(nodeOverrides[node.id] ?? {}),
          playbackInitialVisibility: stateVisibility,
        }
      }

      return {
        ...structuredClone(state),
        nodeOverrides,
      }
    }),
  }
}

function migrateSceneV6ToV7(scene: SceneDocumentV6): ProjectDocument['scenes'][number] {
  const scope = migrateInteractionScopeV6(
    scene.interactions,
    `scene\0${scene.id}`,
  )
  appendSceneAnimationRules(scene, scope)
  return {
    ...structuredClone(scene),
    nodes: scene.nodes.map(migrateSceneNodeV6ToV7),
    presentation: migratePresentationV6ToV7(scene.presentation, scene.nodes),
    interactions: scope.rules,
  }
}

export function migrateProjectV6ToV7(project: ProjectDocumentV6): ProjectDocument {
  const globalScope = migrateInteractionScopeV6(
    project.globalInteractions,
    `global\0${project.id}`,
  )
  project.globalLayer.forEach((item) => {
    const animation = legacyNodeAnimation(item.node)
    if (animation) {
      appendMigratedAnimationRule(globalScope, item.node, animation, undefined)
    }
  })
  return projectDocumentSchema.parse({
    ...structuredClone(project),
    schemaVersion: 7,
    scenes: project.scenes.map(migrateSceneV6ToV7),
    globalLayer: project.globalLayer.map((item) => ({
      ...structuredClone(item),
      node: migrateSceneNodeV6ToV7(item.node),
    })),
    globalInteractions: globalScope.rules,
  })
}

export function migrateProjectDocument(value: unknown): ProjectDocument {
  const version = typeof value === 'object' && value !== null
    ? Reflect.get(value, 'schemaVersion')
    : undefined
  if (version === 1) {
    return migrateProjectV6ToV7(
      migrateProjectV5ToV6(migrateProjectV4ToV5(
        migrateProjectV3ToV4(
          migrateProjectV2ToV3(
            migrateProjectV1ToV2(projectDocumentV1Schema.parse(value)),
          ),
        ),
      )),
    )
  }
  if (version === 2) {
    return migrateProjectV6ToV7(
      migrateProjectV5ToV6(migrateProjectV4ToV5(
        migrateProjectV3ToV4(
          migrateProjectV2ToV3(projectDocumentV2Schema.parse(value)),
        ),
      )),
    )
  }
  if (version === 3) {
    return migrateProjectV6ToV7(
      migrateProjectV5ToV6(migrateProjectV4ToV5(
        migrateProjectV3ToV4(projectDocumentV3Schema.parse(value)),
      )),
    )
  }
  if (version === 4) {
    return migrateProjectV6ToV7(
      migrateProjectV5ToV6(migrateProjectV4ToV5(projectDocumentV4Schema.parse(value))),
    )
  }
  if (version === 5) {
    return migrateProjectV6ToV7(
      migrateProjectV5ToV6(projectDocumentV5Schema.parse(value)),
    )
  }
  if (version === 6) {
    return migrateProjectV6ToV7(projectDocumentV6Schema.parse(value))
  }
  return projectDocumentSchema.parse(value)
}

/** @deprecated Project V3 compatibility export. */
export const globalComponentVisibilitySchema = globalLayerVisibilitySchema

export { assetMetaSchema, embeddedComponentPackageMetaSchema }
