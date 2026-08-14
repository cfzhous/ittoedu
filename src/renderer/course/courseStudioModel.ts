import { nanoid } from 'nanoid'
import { courseProjectDocumentSchema } from '../../shared/courseProjectSchema'
import { deriveCourseProjectAuthoringInventorySnapshot } from '../../shared/courseProjectModel'
import {
  COURSE_PROJECT_SCHEMA_VERSION,
  SPATIAL_CANONICAL_VIEWPORT,
  type NativeElementContent,
  type NativeLayerItem,
  type CourseProjectDocument,
  type CourseLocation,
  type CourseSurfaceDocument,
  type FlowBlock,
  type LayerItem,
  type MixedPrintEntry,
  type ScopedLayerItem,
  type SlideSceneDocument,
  type SlidePresentationState,
  type SpatialRelation,
  type SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import type {
  AssetMeta,
  FormulaNode,
  ImageNode,
  SceneNode,
  ShapeNode,
  TeacherControllerNode,
  TextNode,
  VideoNode,
} from '../../shared/projectTypes'
import {
  isNodeMotionAction,
  isVideoInteractionAction,
  type InteractionRule,
} from '../../shared/interactionTypes'
import {
  flowBlockIdsInDocumentOrder,
  isFlowBlockMoveNoOp,
  moveFlowBlockInPlace,
  type FlowBlockMoveRequest,
} from './flow/flowBlockMove'
import { FLOW_BLOCK_LABELS } from './courseTeacherLabels'

const COURSE_CANVAS_WIDTH = 1280
const COURSE_CANVAS_HEIGHT = 720
const DEFAULT_FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", sans-serif'

export interface CourseAuthoringPatch {
  op: 'replace'
  expectedRevision: number
  authoringAddress: string
  value: unknown
  expectedValue?: unknown
}

export class CourseRevisionConflictError extends Error {
  readonly expectedRevision: number
  readonly actualRevision: number

  constructor(expectedRevision: number, actualRevision: number) {
    super(`课件已被修改：期望 revision ${expectedRevision}，当前为 ${actualRevision}`)
    this.name = 'CourseRevisionConflictError'
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

function stableId(prefix: string, preferred?: string): string {
  return preferred ?? `${prefix}-${nanoid(10)}`
}

function initialSlidePresentation(): NonNullable<SlideSceneDocument['presentation']> {
  return {
    initialStateId: 'state_initial',
    thumbnailStateId: 'state_initial',
    states: [{ id: 'state_initial', name: '初始', layerItemOverrides: {} }],
  }
}

export function createCourseProject(input: {
  id?: string
  title?: string
  now?: string
} = {}): CourseProjectDocument {
  const now = input.now ?? new Date().toISOString()
  const projectId = input.id ?? stableId('course')
  const sceneId = stableId('scene')
  const surfaceId = `slide:${projectId}`
  const controller = nativeLayerFromNode(createDefaultTeacherController(
    stableId('teacher-controller'),
  ))
  // Leave the first authoring order free so newly inserted content stays below
  // the course-wide teacher controller without a special rendering plane.
  controller.order = 1
  const project: CourseProjectDocument = {
    schemaVersion: COURSE_PROJECT_SCHEMA_VERSION,
    id: projectId,
    revision: 0,
    title: input.title ?? '未命名课程',
    createdAt: now,
    updatedAt: now,
    assets: {},
    componentPackages: {},
    designTokens: {
      fonts: [{ id: 'body', label: '正文', fontFamily: DEFAULT_FONT_FAMILY }],
      colors: [
        { id: 'background', label: '背景', color: '#ffffff' },
        { id: 'text', label: '正文', color: '#1f2937' },
        { id: 'accent', label: '强调', color: '#2563eb' },
      ],
    },
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
        narrationDucking: { enabled: true, musicVolume: 0.3, fadeMs: 250 },
      },
    },
    playback: {
      controls: 'canvas',
      keyboardNavigation: true,
      presenter: {
        enabled: true,
        strategy: 'scene-navigation',
        additionalBindings: [],
      },
    },
    courseState: [],
    navigationGuards: [],
    locations: [{
      id: sceneId,
      label: '场景 1',
      kind: 'slide-scene',
      surfaceId,
      sceneId,
    }],
    startLocationId: sceneId,
    globalLayerItems: [{
      item: controller,
      visibility: { mode: 'all', locationIds: [] },
    }],
    globalInteractions: [],
    surfaces: [{
      id: surfaceId,
      title: input.title ?? '未命名课程',
      type: 'slide',
      canvas: { width: COURSE_CANVAS_WIDTH, height: COURSE_CANVAS_HEIGHT },
      surfaceLayerItems: [],
      scenes: [{
        id: sceneId,
        name: '场景 1',
        backgroundColor: '#ffffff',
        backgroundAssetId: null,
        layerItems: [],
        presentation: initialSlidePresentation(),
        interactions: [],
      }],
    }],
  }
  return courseProjectDocumentSchema.parse(project)
}

function cloneAndCommit(
  project: CourseProjectDocument,
  mutate: (draft: CourseProjectDocument) => void,
  now = new Date().toISOString(),
): CourseProjectDocument {
  const draft = structuredClone(project)
  mutate(draft)
  draft.revision = project.revision + 1
  draft.updatedAt = now
  return courseProjectDocumentSchema.parse(draft)
}

export function updateCourseProject(
  project: CourseProjectDocument,
  mutate: (draft: CourseProjectDocument) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, mutate, now)
}

function findMutableSlideScene(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
): SlideSceneDocument {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'slide') throw new Error(`找不到 Slide 表面：${surfaceId}`)
  const scene = surface.scenes.find((candidate) => candidate.id === sceneId)
  if (!scene) throw new Error(`找不到 Slide 场景：${sceneId}`)
  return scene
}

/** Persists only the structured, author-expressible part of the inspected frame. */
export function saveSlidePresentationState(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  state: SlidePresentationState,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const scene = findMutableSlideScene(draft, surfaceId, sceneId)
    if (scene.presentation?.states.some((candidate) => candidate.id === state.id)) {
      throw new Error(`命名状态 ID 已存在：${state.id}`)
    }
    const saved = structuredClone(state)
    if (scene.presentation) scene.presentation.states.push(saved)
    else {
      scene.presentation = {
        initialStateId: saved.id,
        thumbnailStateId: saved.id,
        states: [saved],
      }
    }
  }, now)
}

export function renameSlidePresentationState(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  stateId: string,
  name: string,
  now?: string,
): CourseProjectDocument {
  const normalized = name.trim()
  if (!normalized) throw new Error('命名状态名称不能为空')
  return cloneAndCommit(project, (draft) => {
    const scene = findMutableSlideScene(draft, surfaceId, sceneId)
    const state = scene.presentation?.states.find((candidate) => candidate.id === stateId)
    if (!state) throw new Error(`找不到命名状态：${stateId}`)
    state.name = normalized
  }, now)
}

export function setInitialSlidePresentationState(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  stateId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const scene = findMutableSlideScene(draft, surfaceId, sceneId)
    if (!scene.presentation?.states.some((candidate) => candidate.id === stateId)) {
      throw new Error(`找不到命名状态：${stateId}`)
    }
    scene.presentation.initialStateId = stateId
  }, now)
}

function repairDeletedSlideStateRules(
  rules: InteractionRule[],
  sceneId: string,
  deletedStateId: string,
  fallbackStateId: string | undefined,
  repairCurrentPresentation: boolean,
): InteractionRule[] {
  return rules.flatMap((rule) => {
    if (
      repairCurrentPresentation &&
      rule.trigger.type === 'presentation.enter' &&
      rule.trigger.stateId === deletedStateId
    ) {
      if (!fallbackStateId) return []
      rule.trigger.stateId = fallbackStateId
    }
    if (repairCurrentPresentation) {
      for (const condition of rule.conditions) {
        if (condition.type !== 'presentation.in' || !condition.stateIds.includes(deletedStateId)) continue
        condition.stateIds = [...new Set(condition.stateIds.flatMap((stateId) => (
          stateId === deletedStateId ? (fallbackStateId ? [fallbackStateId] : []) : [stateId]
        )))]
        if (condition.stateIds.length === 0) return []
      }
    }
    rule.actions = rule.actions.flatMap((step) => {
      const action = step.action
      if (
        repairCurrentPresentation &&
        action.type === 'presentation.set' &&
        action.stateId === deletedStateId
      ) {
        if (!fallbackStateId) return []
        action.stateId = fallbackStateId
      }
      if (
        action.type === 'scene.go' &&
        action.sceneId === sceneId &&
        action.targetStateId === deletedStateId
      ) {
        if (fallbackStateId) action.targetStateId = fallbackStateId
        else delete action.targetStateId
      }
      return [step]
    })
    return rule.actions.length > 0 ? [rule] : []
  })
}

function ruleReferencesCurrentPresentationState(
  rule: InteractionRule,
  stateId: string,
): boolean {
  return (
    (rule.trigger.type === 'presentation.enter' && rule.trigger.stateId === stateId) ||
    rule.conditions.some((condition) => (
      condition.type === 'presentation.in' && condition.stateIds.includes(stateId)
    )) ||
    rule.actions.some(({ action }) => (
      action.type === 'presentation.set' && action.stateId === stateId
    ))
  )
}

function intersectSceneConditions(rule: InteractionRule): Set<string> | undefined {
  const sceneConditions = rule.conditions.filter((condition) => condition.type === 'scene.in')
  if (sceneConditions.length === 0) return undefined
  const intersection = new Set(sceneConditions[0]!.sceneIds)
  sceneConditions.slice(1).forEach((condition) => {
    for (const sceneId of intersection) {
      if (!condition.sceneIds.includes(sceneId)) intersection.delete(sceneId)
    }
  })
  return intersection
}

/**
 * A presentation state id is local to one Slide scene. Global interactions
 * therefore need scene-aware repair instead of a project-wide string replace.
 */
function repairDeletedGlobalSlideStateRules(
  project: CourseProjectDocument,
  sceneId: string,
  deletedStateId: string,
  fallbackStateId: string | undefined,
): void {
  const otherSceneIdsWithState = project.surfaces.flatMap((surface) => (
    surface.type === 'slide'
      ? surface.scenes.flatMap((scene) => (
          scene.id !== sceneId && scene.presentation?.states.some((state) => state.id === deletedStateId)
            ? [scene.id]
            : []
        ))
      : []
  ))
  project.globalInteractions = project.globalInteractions.flatMap((rule) => {
    // scene.go carries an explicit target scene, so this part is always safe.
    const withRepairedNavigation = repairDeletedSlideStateRules(
      [rule], sceneId, deletedStateId, fallbackStateId, false,
    )[0]
    if (!withRepairedNavigation) return []
    if (!ruleReferencesCurrentPresentationState(withRepairedNavigation, deletedStateId)) {
      return [withRepairedNavigation]
    }

    const scopedSceneIds = intersectSceneConditions(withRepairedNavigation)
    if (scopedSceneIds && !scopedSceneIds.has(sceneId)) {
      return [withRepairedNavigation]
    }
    if (scopedSceneIds?.size === 1) {
      return repairDeletedSlideStateRules(
        [withRepairedNavigation], sceneId, deletedStateId, fallbackStateId, true,
      )
    }
    if (scopedSceneIds && scopedSceneIds.size > 1) {
      withRepairedNavigation.conditions.forEach((condition) => {
        if (condition.type === 'scene.in') {
          condition.sceneIds = condition.sceneIds.filter((candidate) => candidate !== sceneId)
        }
      })
      return [withRepairedNavigation]
    }
    if (otherSceneIdsWithState.length > 0) {
      withRepairedNavigation.conditions.push({
        type: 'scene.in',
        sceneIds: [...new Set(otherSceneIdsWithState)],
      })
      return [withRepairedNavigation]
    }
    return repairDeletedSlideStateRules(
      [withRepairedNavigation], sceneId, deletedStateId, undefined, true,
    )
  })
}

export function deleteSlidePresentationState(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  stateId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const scene = findMutableSlideScene(draft, surfaceId, sceneId)
    const presentation = scene.presentation
    if (!presentation) throw new Error(`找不到命名状态：${stateId}`)
    const index = presentation.states.findIndex((candidate) => candidate.id === stateId)
    if (index < 0) throw new Error(`找不到命名状态：${stateId}`)
    presentation.states.splice(index, 1)
    const fallbackStateId = presentation.states[0]?.id
    if (presentation.states.length === 0) {
      delete scene.presentation
    } else {
      if (presentation.initialStateId === stateId) {
        presentation.initialStateId = fallbackStateId!
      }
      if (presentation.thumbnailStateId === stateId) {
        presentation.thumbnailStateId = presentation.initialStateId
      }
    }

    draft.locations.forEach((location) => {
      if (
        location.kind !== 'slide-scene' ||
        location.surfaceId !== surfaceId ||
        location.sceneId !== sceneId ||
        location.stateId !== stateId
      ) return
      if (fallbackStateId) location.stateId = fallbackStateId
      else delete location.stateId
    })
    scene.interactions = repairDeletedSlideStateRules(
      scene.interactions, sceneId, stateId, fallbackStateId, true,
    )
    repairDeletedGlobalSlideStateRules(draft, sceneId, stateId, fallbackStateId)
    draft.surfaces.forEach((surface) => {
      if (surface.type !== 'slide') return
      surface.scenes.forEach((candidate) => {
        if (candidate.id === sceneId) return
        candidate.interactions = repairDeletedSlideStateRules(
          candidate.interactions, sceneId, stateId, fallbackStateId, false,
        )
      })
    })
    allProjectLayerItems(draft).forEach((item) => {
      if (item.kind !== 'native' || item.content.nativeType !== 'teacher-controller') return
      item.content.data.buttons.forEach((button) => {
        const action = button.action
        if (
          action.type !== 'scene.go' ||
          action.sceneId !== sceneId ||
          action.targetStateId !== stateId
        ) return
        if (fallbackStateId) action.targetStateId = fallbackStateId
        else delete action.targetStateId
      })
    })
  }, now)
}

export function addCourseSurface(
  project: CourseProjectDocument,
  type: CourseSurfaceDocument['type'],
  options: { id?: string; title?: string; now?: string } = {},
): CourseProjectDocument {
  const id = stableId('surface', options.id)
  return cloneAndCommit(project, (draft) => {
    if (draft.surfaces.some((surface) => surface.id === id)) {
      throw new Error(`表面 ID 已存在：${id}`)
    }
    const ordinal = draft.surfaces.length + 1
    let surface: CourseSurfaceDocument
    if (type === 'slide') {
      const sceneId = stableId('scene')
      surface = {
        id,
        type,
        title: options.title ?? `幻灯片 ${ordinal}`,
        canvas: { width: 1280, height: 720 },
        surfaceLayerItems: [],
        scenes: [{
          id: sceneId,
          name: '第 1 幕',
          backgroundColor: '#ffffff',
          layerItems: [],
          presentation: initialSlidePresentation(),
          interactions: [],
        }],
      }
      draft.locations.push({
        id: sceneId,
        label: `${surface.title} · 第 1 幕`,
        kind: 'slide-scene',
        surfaceId: id,
        sceneId,
      })
    } else if (type === 'flow') {
      const headingId = stableId('block')
      surface = {
        id,
        type,
        title: options.title ?? `流式讲义 ${ordinal}`,
        surfaceLayerItems: [],
        layout: { readingWidth: 760, wideContentWidth: 1120 },
        blocks: [{ id: headingId, type: 'heading', level: 1, text: '新讲义' }],
      }
      draft.locations.push({
        id: headingId,
        label: surface.title,
        kind: 'flow-block',
        surfaceId: id,
        blockId: headingId,
      })
    } else {
      const cameraId = stableId('camera')
      // New Spatial work starts in the same positive-coordinate authoring area
      // as course-global layers, so the default teacher controller is visible.
      const initialCamera = {
        x: SPATIAL_CANONICAL_VIEWPORT.width / 2,
        y: SPATIAL_CANONICAL_VIEWPORT.height / 2,
        zoom: 1,
      }
      surface = {
        id,
        type,
        title: options.title ?? `空间探索 ${ordinal}`,
        surfaceLayerItems: [],
        world: { bounds: { mode: 'infinite' }, layerItems: [] },
        camera: {
          home: { ...initialCamera },
          frames: [{ id: cameraId, name: '总览', ...initialCamera }],
        },
        relations: [],
        semanticZoom: [],
      }
      draft.locations.push({
        id: cameraId,
        label: `${surface.title} · 总览`,
        kind: 'spatial-camera',
        surfaceId: id,
        cameraFrameId: cameraId,
      })
    }
    draft.surfaces.push(surface)
    if (draft.surfaces.length > 1) {
      draft.mixedPrintPlan = {
        pageSize: 'A4',
        orientation: 'auto',
        entries: draft.surfaces.map(defaultMixedPrintEntry),
      }
    }
  }, options.now)
}

/** Renames one surface and preserves any location suffix derived from its title. */
export function renameCourseSurface(
  project: CourseProjectDocument,
  surfaceId: string,
  title: string,
  now?: string,
): CourseProjectDocument {
  const nextTitle = title.trim()
  if (!nextTitle) throw new Error('内容名称不能为空')
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface) throw new Error(`找不到表面：${surfaceId}`)
    const previousTitle = surface.title
    surface.title = nextTitle
    draft.locations.forEach((location) => {
      if (location.surfaceId !== surfaceId) return
      if (location.label === previousTitle) {
        location.label = nextTitle
      } else if (location.label.startsWith(`${previousTitle} ·`)) {
        location.label = `${nextTitle}${location.label.slice(previousTitle.length)}`
      }
    })
  }, now)
}

export function deleteCourseSurface(
  project: CourseProjectDocument,
  surfaceId: string,
  now?: string,
): CourseProjectDocument {
  if (project.surfaces.length <= 1) throw new Error('课程至少需要一个表面')
  return cloneAndCommit(project, (draft) => {
    const layerItemIdsBefore = remainingLayerItemIds(draft)
    const index = draft.surfaces.findIndex((surface) => surface.id === surfaceId)
    if (index < 0) throw new Error(`找不到表面：${surfaceId}`)
    const removed = draft.surfaces[index]!
    const deletedSceneIds = new Set(
      removed.type === 'slide' ? removed.scenes.map((scene) => scene.id) : [],
    )
    const deletedLocationIds = new Set(
      draft.locations.filter((location) => location.surfaceId === surfaceId).map((location) => location.id),
    )
    draft.surfaces.splice(index, 1)
    removeDeletedLocationReferences(draft, deletedLocationIds)
    draft.locations = draft.locations.filter((location) => !deletedLocationIds.has(location.id))
    if (!draft.locations.some((location) => location.id === draft.startLocationId)) {
      draft.startLocationId = draft.locations[0]!.id
    }
    removeDeletedSceneReferences(draft, deletedSceneIds)
    repairMissingLayerItemReferences(draft, new Set(
      [...layerItemIdsBefore].filter((layerItemId) => !remainingLayerItemIds(draft).has(layerItemId)),
    ))
    if (draft.surfaces.length === 1) delete draft.mixedPrintPlan
    else if (draft.mixedPrintPlan) {
      draft.mixedPrintPlan.entries = draft.surfaces.map(defaultMixedPrintEntry)
    }
  }, now)
}

type NativeSceneNode = Exclude<SceneNode, { type: 'external-component' }>

function nativeLayerFromNode(node: NativeSceneNode): NativeLayerItem {
  const {
    id,
    name,
    type,
    x,
    y,
    width,
    height,
    rotation,
    opacity,
    visible,
    locked,
    playbackInitialVisibility,
    ...data
  } = node
  return {
    layerItemId: id,
    label: name,
    kind: 'native',
    frame: { mode: 'absolute', x, y, width, height },
    order: 0,
    visible,
    locked,
    rotation,
    opacity,
    hitPolicy: 'auto',
    playbackInitialVisibility,
    content: { nativeType: type, data } as NativeElementContent,
  }
}

function createNativeTextLayer(id: string, text: string): NativeLayerItem {
  const node: TextNode = {
    id,
    name: text || '文字',
    type: 'text',
    x: 120,
    y: 120,
    width: 400,
    height: 80,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    playbackInitialVisibility: 'inherit',
    text,
    runs: [],
    style: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 42,
      color: '#1f2937',
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      emphasis: false,
      highlightColor: null,
      align: 'left',
      verticalAlign: 'top',
      writingMode: 'horizontal',
      lineSpacing: 6,
      letterSpacing: 0,
      padding: 0,
      overflow: 'auto-height',
      backgroundColor: '#ffffff',
      backgroundOpacity: 0,
      cornerRadius: 0,
    },
  }
  return nativeLayerFromNode(node)
}

function createNativeFormulaLayer(
  id: string,
  x?: number,
  y?: number,
): NativeLayerItem {
  const width = 420
  const height = 160
  const node: FormulaNode = {
    id,
    name: '公式',
    type: 'formula',
    x: x ?? (COURSE_CANVAS_WIDTH - width) / 2,
    y: y ?? (COURSE_CANVAS_HEIGHT - height) / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    playbackInitialVisibility: 'inherit',
    formulaId: `formula:${id}`,
    accessibleText: 'x 的平方加二分之一',
    ast: {
      type: 'row',
      children: [
        {
          type: 'script',
          base: { type: 'token', value: 'x' },
          superscript: { type: 'token', value: '2' },
        },
        { type: 'operator', value: '+' },
        {
          type: 'fraction',
          numerator: { type: 'token', value: '1' },
          denominator: { type: 'token', value: '2' },
        },
      ],
    },
    style: { fontSize: 48, color: '#1f2937', align: 'center' },
  }
  return nativeLayerFromNode(node)
}

function createNativeShapeLayer(
  id: string,
  x?: number,
  y?: number,
): NativeLayerItem {
  const width = 320
  const height = 180
  const node: ShapeNode = {
    id,
    name: '圆角矩形',
    type: 'shape',
    x: x ?? (COURSE_CANVAS_WIDTH - width) / 2,
    y: y ?? (COURSE_CANVAS_HEIGHT - height) / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    playbackInitialVisibility: 'inherit',
    shapeType: 'rounded-rectangle',
    style: {
      fillColor: '#dbeafe',
      fillOpacity: 1,
      borderColor: '#2563eb',
      borderOpacity: 1,
      borderWidth: 0,
      lineStyle: 'solid',
      cornerRadius: 24,
      startArrow: 'none',
      endArrow: 'none',
    },
  }
  return nativeLayerFromNode(node)
}

function createNativeImageLayer(input: {
  id: string
  assetId: string
  width?: number
  height?: number
  x?: number
  y?: number
}): NativeLayerItem {
  const width = input.width ?? 320
  const height = input.height ?? 180
  const node: ImageNode = {
    id: input.id,
    name: '图片',
    type: 'image',
    x: input.x ?? (COURSE_CANVAS_WIDTH - width) / 2,
    y: input.y ?? (COURSE_CANVAS_HEIGHT - height) / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    playbackInitialVisibility: 'inherit',
    assetId: input.assetId,
    preserveAspectRatio: true,
    fit: 'contain',
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    cropX: 0.5,
    cropY: 0.5,
    flipX: false,
    flipY: false,
    cornerRadius: 0,
    feather: { amount: 0, mode: 'rectangle' },
    safeAreas: [],
  }
  return nativeLayerFromNode(node)
}

function createNativeVideoLayer(input: {
  id: string
  assetId: string
  width?: number
  height?: number
  x?: number
  y?: number
  fit?: VideoNode['fit']
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  volume?: number
  playbackRate?: number
  showControls?: boolean
  clickToToggle?: boolean
  startTime?: number
  endTime?: number | null
  backgroundAudioMode?: VideoNode['backgroundAudioMode']
}): NativeLayerItem {
  const width = input.width ?? 640
  const height = input.height ?? 360
  const node: VideoNode = {
    id: input.id,
    name: '视频',
    type: 'video',
    x: input.x ?? (COURSE_CANVAS_WIDTH - width) / 2,
    y: input.y ?? (COURSE_CANVAS_HEIGHT - height) / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    playbackInitialVisibility: 'inherit',
    assetId: input.assetId,
    fit: input.fit ?? 'contain',
    autoplay: input.autoplay ?? false,
    loop: input.loop ?? false,
    muted: input.muted ?? false,
    volume: input.volume ?? 1,
    playbackRate: input.playbackRate ?? 1,
    showControls: input.showControls ?? true,
    clickToToggle: input.clickToToggle ?? true,
    startTime: input.startTime ?? 0,
    endTime: input.endTime ?? null,
    poster: { mode: 'video-frame', time: 0 },
    backgroundAudioMode: input.backgroundAudioMode ?? 'duck',
  }
  return nativeLayerFromNode(node)
}

function createDefaultTeacherController(id: string): TeacherControllerNode {
  return {
    id,
    name: '教师控制器',
    type: 'teacher-controller',
    x: 190,
    y: 638,
    width: 900,
    height: 64,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    playbackInitialVisibility: 'inherit',
    title: '教师控制台',
    showSceneProgress: true,
    compact: false,
    collapsible: true,
    defaultCollapsed: false,
    buttons: [
      { id: stableId('teacher-button'), action: { type: 'scene.previous' }, label: '上一场景', visible: true },
      { id: stableId('teacher-button'), action: { type: 'scene.next' }, label: '下一场景', visible: true },
      { id: stableId('teacher-button'), action: { type: 'scene.open-picker' }, label: '课程目录', visible: true },
      { id: stableId('teacher-button'), action: { type: 'scene.replay' }, label: '重播', visible: true },
      { id: stableId('teacher-button'), action: { type: 'course.restart' }, label: '重新开始', visible: false },
      { id: stableId('teacher-button'), action: { type: 'audio.toggle-mute' }, label: '声音', visible: true },
      { id: stableId('teacher-button'), action: { type: 'player.fullscreen.toggle' }, label: '全屏', visible: true },
    ],
    style: {
      backgroundColor: '#172033',
      backgroundOpacity: 0.94,
      accentColor: '#e7b85c',
      textColor: '#f8fafc',
      cornerRadius: 16,
    },
    includeInStaticExports: false,
  }
}

/** Adds a recoverable course-wide teacher controller through the normal V9 model. */
export function addTeacherController(
  project: CourseProjectDocument,
  options: { id?: string; now?: string } = {},
): CourseProjectDocument {
  const layerItemId = stableId('teacher-controller', options.id)
  return cloneAndCommit(project, (draft) => {
    if (draft.globalLayerItems.some(({ item }) => (
      item.kind === 'native' && item.content.nativeType === 'teacher-controller'
    ))) throw new Error('课件中已经有全课程教师控制器。')
    const controller = nativeLayerFromNode(createDefaultTeacherController(layerItemId))
    controller.order = maximumProjectLayerOrder(draft) + 1
    draft.globalLayerItems.push({
      item: controller,
      visibility: { mode: 'all', locationIds: [] },
    })
    sortAllLayerLists(draft)
  }, options.now)
}

export function addSlideScene(
  project: CourseProjectDocument,
  surfaceId: string,
  options: { id?: string; name?: string; now?: string } = {},
): CourseProjectDocument {
  const sceneId = stableId('scene', options.id)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('目标不是 Slide 表面')
    if (surface.scenes.some((scene) => scene.id === sceneId)) throw new Error(`场景 ID 已存在：${sceneId}`)
    const scene: SlideSceneDocument = {
      id: sceneId,
      name: options.name ?? `第 ${surface.scenes.length + 1} 幕`,
      backgroundColor: '#ffffff',
      layerItems: [],
      presentation: initialSlidePresentation(),
      interactions: [],
    }
    surface.scenes.push(scene)
    const printEntry = draft.mixedPrintPlan?.entries.find(
      (entry): entry is Extract<MixedPrintEntry, { kind: 'slide-scenes' }> =>
        entry.kind === 'slide-scenes' && entry.surfaceId === surfaceId,
    )
    printEntry?.sceneIds.push(sceneId)
    draft.locations.push({
      id: sceneId,
      label: `${surface.title} · ${scene.name}`,
      kind: 'slide-scene',
      surfaceId,
      sceneId,
    })
  }, options.now)
}

type SlideSceneLocation = Extract<CourseLocation, { kind: 'slide-scene' }>

function slidePrintEntry(
  project: CourseProjectDocument,
  surfaceId: string,
): Extract<MixedPrintEntry, { kind: 'slide-scenes' }> | undefined {
  return project.mixedPrintPlan?.entries.find(
    (entry): entry is Extract<MixedPrintEntry, { kind: 'slide-scenes' }> =>
      entry.kind === 'slide-scenes' && entry.surfaceId === surfaceId,
  )
}

function synchronizeSlidePrintOrder(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneIds: readonly string[],
): void {
  const entry = slidePrintEntry(project, surfaceId)
  if (entry) entry.sceneIds = [...sceneIds]
}

function forEachScopedLayerItem(
  project: CourseProjectDocument,
  visit: (entry: ScopedLayerItem) => void,
): void {
  project.globalLayerItems.forEach(visit)
  project.surfaces.forEach((surface) => surface.surfaceLayerItems.forEach(visit))
}

function duplicateLocationReferences(
  project: CourseProjectDocument,
  locationIds: ReadonlyMap<string, string>,
): void {
  forEachScopedLayerItem(project, (entry) => {
    const additions = entry.visibility.locationIds
      .map((locationId) => locationIds.get(locationId))
      .filter((locationId): locationId is string => Boolean(locationId))
    entry.visibility.locationIds.push(...additions)
  })
  project.navigationGuards.forEach((guard) => {
    const duplicateReferences = (ids: string[]): string[] => {
      const additions = ids
        .map((id) => locationIds.get(id))
        .filter((id): id is string => Boolean(id))
      return [...ids, ...additions]
    }
    guard.toLocationIds = duplicateReferences(guard.toLocationIds)
    if (guard.fromLocationIds) {
      guard.fromLocationIds = duplicateReferences(guard.fromLocationIds)
    }
  })
}

function duplicateSlideInteraction(
  rule: InteractionRule,
  layerItemIds: ReadonlyMap<string, string>,
  actionIds: ReadonlyMap<string, string>,
  sourceSceneId: string,
  targetSceneId: string,
): InteractionRule {
  const copy = structuredClone(rule)
  copy.id = stableId('interaction')
  if ('nodeId' in copy.trigger) {
    copy.trigger.nodeId = layerItemIds.get(copy.trigger.nodeId) ?? copy.trigger.nodeId
  }
  if (copy.trigger.type === 'animation.completed') {
    copy.trigger.actionId = actionIds.get(copy.trigger.actionId) ?? copy.trigger.actionId
  }
  copy.conditions = copy.conditions.map((condition) => condition.type === 'scene.in'
    ? {
        ...condition,
        sceneIds: condition.sceneIds.map((sceneId) => (
          sceneId === sourceSceneId ? targetSceneId : sceneId
        )),
      }
    : condition)
  copy.actions = copy.actions.map((step) => {
    const action = step.action
    const nextId = actionIds.get(step.id)!
    if (action.type === 'scene.go' && action.sceneId === sourceSceneId) {
      return { ...step, id: nextId, action: { ...action, sceneId: targetSceneId } }
    }
    if (isVideoInteractionAction(action) || isNodeMotionAction(action)) {
      return {
        ...step,
        id: nextId,
        action: {
          ...action,
          nodeId: layerItemIds.get(action.nodeId) ?? action.nodeId,
        },
      }
    }
    return { ...step, id: nextId }
  })
  return copy
}

function duplicateSlideLayerItem(
  item: LayerItem,
  layerItemIds: ReadonlyMap<string, string>,
  sourceSceneId: string,
  targetSceneId: string,
): LayerItem {
  const copy = structuredClone(item)
  copy.layerItemId = layerItemIds.get(item.layerItemId)!
  if (copy.kind === 'runtime' && copy.runtime.nodeBindings) {
    copy.runtime.nodeBindings = Object.fromEntries(
      Object.entries(copy.runtime.nodeBindings).map(([key, layerItemId]) => [
        key,
        layerItemIds.get(layerItemId) ?? layerItemId,
      ]),
    )
  }
  if (copy.kind === 'native' && copy.content.nativeType === 'teacher-controller') {
    copy.content.data.buttons = copy.content.data.buttons.map((button) => (
      button.action.type === 'scene.go' && button.action.sceneId === sourceSceneId
        ? { ...button, action: { ...button.action, sceneId: targetSceneId } }
        : button
    ))
  }
  return copy
}

function duplicateSlidePresentation(
  presentation: SlideSceneDocument['presentation'],
  layerItemIds: ReadonlyMap<string, string>,
): SlideSceneDocument['presentation'] {
  if (!presentation) return undefined
  const copy = structuredClone(presentation)
  copy.states = copy.states.map((state) => ({
    ...state,
    layerItemOverrides: Object.fromEntries(
      Object.entries(state.layerItemOverrides).map(([layerItemId, override]) => [
        layerItemIds.get(layerItemId) ?? layerItemId,
        override,
      ]),
    ),
    ...(state.layerItemOrder
      ? {
          layerItemOrder: state.layerItemOrder.map((layerItemId) => (
            layerItemIds.get(layerItemId) ?? layerItemId
          )),
        }
      : {}),
  }))
  return copy
}

/** Duplicates one Slide scene and all authoring identities in one V9 revision. */
export function duplicateSlideScene(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  options: { id?: string; name?: string; now?: string } = {},
): CourseProjectDocument {
  const duplicateSceneId = stableId('scene', options.id)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('目标不是 Slide 表面')
    const sourceIndex = surface.scenes.findIndex((scene) => scene.id === sceneId)
    if (sourceIndex < 0) throw new Error(`找不到场景：${sceneId}`)
    if (surface.scenes.some((scene) => scene.id === duplicateSceneId)) {
      throw new Error(`场景 ID 已存在：${duplicateSceneId}`)
    }
    if (draft.locations.some((location) => location.id === duplicateSceneId)) {
      throw new Error(`位置 ID 已存在：${duplicateSceneId}`)
    }
    const source = surface.scenes[sourceIndex]!
    const layerItemIds = new Map(
      source.layerItems.map((item) => [item.layerItemId, stableId(item.kind)]),
    )
    const actionIds = new Map(
      source.interactions.flatMap((rule) => (
        rule.actions.map((step) => [step.id, stableId('action')] as const)
      )),
    )
    const duplicate: SlideSceneDocument = {
      ...structuredClone(source),
      id: duplicateSceneId,
      name: options.name?.trim() || `${source.name} 副本`,
      layerItems: source.layerItems.map((item) => duplicateSlideLayerItem(
        item,
        layerItemIds,
        source.id,
        duplicateSceneId,
      )),
      presentation: duplicateSlidePresentation(source.presentation, layerItemIds),
      interactions: source.interactions.map((rule) => duplicateSlideInteraction(
        rule,
        layerItemIds,
        actionIds,
        source.id,
        duplicateSceneId,
      )),
    }
    if (!duplicate.presentation) delete duplicate.presentation
    surface.scenes.splice(sourceIndex + 1, 0, duplicate)

    const sourceLocations = draft.locations.filter((location): location is SlideSceneLocation => (
      location.kind === 'slide-scene' &&
      location.surfaceId === surfaceId &&
      location.sceneId === sceneId
    ))
    const locationIds = new Map<string, string>()
    const duplicateLocations: SlideSceneLocation[] = sourceLocations.length > 0
      ? sourceLocations.map((location, index) => {
          const duplicateLocationId = index === 0 && !location.stateId
            ? duplicateSceneId
            : stableId('location')
          locationIds.set(location.id, duplicateLocationId)
          const stateName = location.stateId
            ? duplicate.presentation?.states.find((state) => state.id === location.stateId)?.name
            : undefined
          return {
            ...structuredClone(location),
            id: duplicateLocationId,
            label: `${surface.title} · ${duplicate.name}${stateName ? ` · ${stateName}` : ''}`,
            sceneId: duplicateSceneId,
          }
        })
      : [{
          id: duplicateSceneId,
          label: `${surface.title} · ${duplicate.name}`,
          kind: 'slide-scene',
          surfaceId,
          sceneId: duplicateSceneId,
        }]
    const sourceLocationIndexes = draft.locations
      .map((location, index) => sourceLocations.some((sourceLocation) => sourceLocation.id === location.id) ? index : -1)
      .filter((index) => index >= 0)
    const insertIndex = sourceLocationIndexes.length > 0
      ? Math.max(...sourceLocationIndexes) + 1
      : draft.locations.length
    draft.locations.splice(insertIndex, 0, ...duplicateLocations)
    duplicateLocationReferences(draft, locationIds)

    draft.globalInteractions.forEach((rule) => {
      // A single global rule cannot address both the source scene's local id
      // and the duplicate's newly generated id. Extending its scene scope
      // would make it fire against the wrong node in the duplicate.
      if (ruleReferencesLayerItem(rule, new Set(layerItemIds.keys()))) return
      rule.conditions.forEach((condition) => {
        if (
          condition.type === 'scene.in' &&
          condition.sceneIds.includes(sceneId) &&
          !condition.sceneIds.includes(duplicateSceneId)
        ) {
          condition.sceneIds.push(duplicateSceneId)
        }
      })
    })
    synchronizeSlidePrintOrder(draft, surfaceId, surface.scenes.map((scene) => scene.id))
  }, options.now)
}

function reorderSlideLocations(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneIds: readonly string[],
): void {
  const indexed: Array<{ location: SlideSceneLocation; index: number }> = []
  project.locations.forEach((location, index) => {
    if (location.kind === 'slide-scene' && location.surfaceId === surfaceId) {
      indexed.push({ location, index })
    }
  })
  const byScene = new Map<string, SlideSceneLocation[]>()
  indexed.forEach(({ location }) => {
    const entries = byScene.get(location.sceneId) ?? []
    entries.push(location)
    byScene.set(location.sceneId, entries)
  })
  const reordered = sceneIds.flatMap((id) => byScene.get(id) ?? [])
  indexed.forEach(({ index }, locationIndex) => {
    project.locations[index] = reordered[locationIndex]!
  })
}

/** Reorders a complete Slide scene permutation without changing location identities. */
export function reorderSlideScenes(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneIds: readonly string[],
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('目标不是 Slide 表面')
    const currentIds = surface.scenes.map((scene) => scene.id)
    if (
      sceneIds.length !== currentIds.length ||
      new Set(sceneIds).size !== sceneIds.length ||
      sceneIds.some((id) => !currentIds.includes(id))
    ) {
      throw new Error('场景排序必须包含当前表面的全部场景')
    }
    const scenesById = new Map(surface.scenes.map((scene) => [scene.id, scene]))
    surface.scenes = sceneIds.map((id) => scenesById.get(id)!)
    reorderSlideLocations(draft, surfaceId, sceneIds)
    synchronizeSlidePrintOrder(draft, surfaceId, sceneIds)
  }, now)
}

function removeSceneInteractionReferences(
  rules: InteractionRule[],
  sceneId: string,
): InteractionRule[] {
  return rules.filter((rule) => {
    if (rule.actions.some(({ action }) => action.type === 'scene.go' && action.sceneId === sceneId)) {
      return false
    }
    for (const condition of rule.conditions) {
      if (condition.type !== 'scene.in') continue
      condition.sceneIds = condition.sceneIds.filter((id) => id !== sceneId)
      if (condition.sceneIds.length === 0) return false
    }
    return true
  })
}

function removeDeletedSceneReferences(
  project: CourseProjectDocument,
  deletedSceneIds: ReadonlySet<string>,
): void {
  for (const sceneId of deletedSceneIds) {
    project.globalInteractions = removeSceneInteractionReferences(project.globalInteractions, sceneId)
    project.surfaces.forEach((surface) => {
      if (surface.type !== 'slide') return
      surface.scenes.forEach((scene) => {
        scene.interactions = removeSceneInteractionReferences(scene.interactions, sceneId)
      })
    })
  }
  allProjectLayerItems(project).forEach((item) => {
    if (item.kind !== 'native' || item.content.nativeType !== 'teacher-controller') return
    item.content.data.buttons = item.content.data.buttons.filter((button) => !(
      button.action.type === 'scene.go' && deletedSceneIds.has(button.action.sceneId)
    ))
    if (item.content.data.buttons.length === 0) {
      item.content.data.buttons.push({
        id: stableId('teacher-button'),
        label: '下一场景',
        visible: true,
        action: { type: 'scene.next' },
      })
    }
  })
}

function removeDeletedLocationReferences(
  project: CourseProjectDocument,
  deletedLocationIds: ReadonlySet<string>,
): void {
  const remainingLocations = project.locations.filter((location) => !deletedLocationIds.has(location.id))
  if (remainingLocations.length === 0) {
    throw new Error('删除后课程至少需要一个可进入的位置')
  }
  const deletedSurfaceIds = new Set(project.locations.flatMap((location) => (
    deletedLocationIds.has(location.id) ? [location.surfaceId] : []
  )))
  const repairEntries = (
    entries: ScopedLayerItem[],
    ownerSurfaceId?: string,
  ): ScopedLayerItem[] => entries.flatMap((entry) => {
    entry.visibility.locationIds = entry.visibility.locationIds.filter(
      (locationId) => !deletedLocationIds.has(locationId),
    )
    if (entry.visibility.mode === 'include' && entry.visibility.locationIds.length === 0) {
      const fallbackSurfaceId = ownerSurfaceId && deletedSurfaceIds.has(ownerSurfaceId)
        ? ownerSurfaceId
        : !ownerSurfaceId && deletedSurfaceIds.size === 1
          ? [...deletedSurfaceIds][0]
          : undefined
      const sameSurfaceFallback = fallbackSurfaceId
        ? remainingLocations.find((location) => location.surfaceId === fallbackSurfaceId)
        : undefined
      if (sameSurfaceFallback) {
        entry.visibility.locationIds = [sameSurfaceFallback.id]
        return [entry]
      }
      // An include-only item has no remaining authored scope. Moving it to an
      // unrelated surface would silently change the lesson, so remove it.
      return []
    }
    if (entry.visibility.mode === 'exclude' && entry.visibility.locationIds.length === 0) {
      entry.visibility = { mode: 'all', locationIds: [] }
    }
    return [entry]
  })
  project.globalLayerItems = repairEntries(project.globalLayerItems)
  project.surfaces.forEach((surface) => {
    surface.surfaceLayerItems = repairEntries(surface.surfaceLayerItems, surface.id)
  })
  project.navigationGuards = project.navigationGuards.flatMap((guard) => {
    const toLocationIds = guard.toLocationIds.filter((id) => !deletedLocationIds.has(id))
    if (toLocationIds.length === 0) return []
    if (guard.fromLocationIds) {
      const fromLocationIds = guard.fromLocationIds.filter((id) => !deletedLocationIds.has(id))
      if (fromLocationIds.length === 0) return []
      return [{ ...guard, fromLocationIds, toLocationIds }]
    }
    return [{ ...guard, toLocationIds }]
  })
}

function remainingLayerItemIds(project: CourseProjectDocument): Set<string> {
  return new Set(allProjectLayerItems(project).map((item) => item.layerItemId))
}

function ruleReferencesLayerItem(
  rule: InteractionRule,
  layerItemIds: ReadonlySet<string>,
): boolean {
  return (
    ('nodeId' in rule.trigger && layerItemIds.has(rule.trigger.nodeId)) ||
    rule.actions.some(({ action }) => 'nodeId' in action && layerItemIds.has(action.nodeId))
  )
}

function removeDeletedLayerInteractionReferences(
  rules: InteractionRule[],
  deletedLayerItemIds: ReadonlySet<string>,
): InteractionRule[] {
  const removedActionIds = new Set(rules.flatMap((rule) => (
    rule.actions.flatMap((step) => (
      'nodeId' in step.action && deletedLayerItemIds.has(step.action.nodeId)
        ? [step.id]
        : []
    ))
  )))
  return rules.flatMap((rule) => {
    if ('nodeId' in rule.trigger && deletedLayerItemIds.has(rule.trigger.nodeId)) return []
    rule.actions = rule.actions.filter((step) => {
      const removed = 'nodeId' in step.action && deletedLayerItemIds.has(step.action.nodeId)
      return !removed
    })
    if (
      rule.trigger.type === 'animation.completed' &&
      removedActionIds.has(rule.trigger.actionId)
    ) return []
    if (rule.actions.length === 0) return []
    rule.actions[0]!.start = 'after-previous'
    return [rule]
  })
}

function removeDeletedRuntimeNodeBindings(
  items: readonly LayerItem[],
  deletedLayerItemIds: ReadonlySet<string>,
): void {
  items.forEach((item) => {
    if (item.kind !== 'runtime' || !item.runtime.nodeBindings) return
    item.runtime.nodeBindings = Object.fromEntries(
      Object.entries(item.runtime.nodeBindings).filter(([, layerItemId]) => (
        !deletedLayerItemIds.has(layerItemId)
      )),
    )
    if (Object.keys(item.runtime.nodeBindings).length === 0) delete item.runtime.nodeBindings
  })
}

function repairSlidePresentationLayerReferences(
  scene: SlideSceneDocument,
  deletedLayerItemIds: ReadonlySet<string>,
): void {
  scene.presentation?.states.forEach((state) => {
    deletedLayerItemIds.forEach((layerItemId) => {
      delete state.layerItemOverrides[layerItemId]
    })
    if (state.layerItemOrder) {
      state.layerItemOrder = state.layerItemOrder.filter((layerItemId) => (
        !deletedLayerItemIds.has(layerItemId)
      ))
      if (state.layerItemOrder.length === 0) delete state.layerItemOrder
    }
  })
}

/** Repairs references whose target identity no longer exists anywhere. */
function repairMissingLayerItemReferences(
  project: CourseProjectDocument,
  deletedLayerItemIds: ReadonlySet<string>,
): void {
  const knownIds = remainingLayerItemIds(project)
  const missingIds = new Set(
    [...deletedLayerItemIds].filter((layerItemId) => !knownIds.has(layerItemId)),
  )
  if (missingIds.size === 0) return
  project.globalInteractions = removeDeletedLayerInteractionReferences(
    project.globalInteractions, missingIds,
  )
  project.surfaces.forEach((surface) => {
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene) => {
        scene.interactions = removeDeletedLayerInteractionReferences(scene.interactions, missingIds)
      })
    }
  })
  removeDeletedRuntimeNodeBindings(allProjectLayerItems(project), missingIds)
}

function repairDeletedLayerReferencesInSlideScene(
  scene: SlideSceneDocument,
  deletedLayerItemIds: ReadonlySet<string>,
): void {
  repairSlidePresentationLayerReferences(scene, deletedLayerItemIds)
  scene.interactions = removeDeletedLayerInteractionReferences(
    scene.interactions, deletedLayerItemIds,
  )
  removeDeletedRuntimeNodeBindings(scene.layerItems, deletedLayerItemIds)
}

/** Deletes a Slide scene and repairs every V9 navigation/print reference atomically. */
export function deleteSlideScene(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const layerItemIdsBefore = remainingLayerItemIds(draft)
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('目标不是 Slide 表面')
    if (surface.scenes.length <= 1) throw new Error('幻灯片至少需要一个场景')
    const sceneIndex = surface.scenes.findIndex((scene) => scene.id === sceneId)
    if (sceneIndex < 0) throw new Error(`找不到场景：${sceneId}`)
    surface.scenes.splice(sceneIndex, 1)

    const deletedLocationIndexes = draft.locations
      .map((location, index) => (
        location.kind === 'slide-scene' &&
        location.surfaceId === surfaceId &&
        location.sceneId === sceneId
          ? index
          : -1
      ))
      .filter((index) => index >= 0)
    const deletedLocationIds = new Set(
      deletedLocationIndexes.map((index) => draft.locations[index]!.id),
    )
    removeDeletedLocationReferences(draft, deletedLocationIds)
    draft.locations = draft.locations.filter((location) => !deletedLocationIds.has(location.id))
    if (deletedLocationIds.has(draft.startLocationId)) {
      const fallbackIndex = Math.min(
        deletedLocationIndexes[0] ?? 0,
        draft.locations.length - 1,
      )
      draft.startLocationId = draft.locations[fallbackIndex]!.id
    }

    removeDeletedSceneReferences(draft, new Set([sceneId]))
    const layerItemIdsAfter = remainingLayerItemIds(draft)
    repairMissingLayerItemReferences(draft, new Set(
      [...layerItemIdsBefore].filter((layerItemId) => !layerItemIdsAfter.has(layerItemId)),
    ))
    synchronizeSlidePrintOrder(draft, surfaceId, surface.scenes.map((scene) => scene.id))
  }, now)
}

export function addSlideTextLayer(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  text = '双击编辑文字',
  options: { id?: string; now?: string } = {},
): CourseProjectDocument {
  const item = createNativeTextLayer(stableId('text', options.id), text)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('目标不是 Slide 表面')
    const scene = surface.scenes.find((candidate) => candidate.id === sceneId)
    if (!scene) throw new Error(`找不到场景：${sceneId}`)
    item.order = reserveTopAuthoringOrder(draft, surface.id, scene.id)
    scene.layerItems.push(item)
    sortAllLayerLists(draft)
  }, options.now)
}

export function addSpatialTextLayer(
  project: CourseProjectDocument,
  surfaceId: string,
  text = '双击编辑文字',
  options: { id?: string; x?: number; y?: number; now?: string } = {},
): CourseProjectDocument {
  const item = createNativeTextLayer(stableId('text', options.id), text)
  item.frame.x = options.x ?? 0
  item.frame.y = options.y ?? 0
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    item.order = reserveTopAuthoringOrder(draft, surface.id)
    surface.world.layerItems.push(item)
    sortAllLayerLists(draft)
  }, options.now)
}

export function addNativeVisualLayer(
  project: CourseProjectDocument,
  input: {
    surfaceId: string
    sceneId?: string
    nativeType: 'formula' | 'shape'
    id?: string
    x?: number
    y?: number
    now?: string
  },
): CourseProjectDocument {
  const id = stableId(input.nativeType, input.id)
  const item = input.nativeType === 'formula'
    ? createNativeFormulaLayer(id, input.x, input.y)
    : createNativeShapeLayer(id, input.x, input.y)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === input.surfaceId)
    if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
    let items: LayerItem[]
    if (surface.type === 'slide') {
      const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
      if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
      items = scene.layerItems
    } else if (surface.type === 'spatial-2d') {
      items = surface.world.layerItems
    } else {
      throw new Error('Flow 公式应使用公式块，图形应使用图层表面。')
    }
    item.order = reserveTopAuthoringOrder(draft, surface.id, input.sceneId)
    items.push(item)
    sortAllLayerLists(draft)
  }, input.now)
}

export function addImageLayer(
  project: CourseProjectDocument,
  input: {
    surfaceId: string
    sceneId?: string
    assetId: string
    id?: string
    width?: number
    height?: number
    x?: number
    y?: number
    now?: string
  },
): CourseProjectDocument {
  if (!project.assets[input.assetId]) throw new Error(`找不到素材：${input.assetId}`)
  const item = createNativeImageLayer({
    id: stableId('image', input.id),
    assetId: input.assetId,
    width: input.width,
    height: input.height,
    x: input.x,
    y: input.y,
  })
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === input.surfaceId)
    if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
    let items: LayerItem[]
    if (surface.type === 'slide') {
      const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
      if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
      items = scene.layerItems
    } else if (surface.type === 'spatial-2d') {
      items = surface.world.layerItems
    } else {
      throw new Error('Flow 图片应使用媒体块')
    }
    item.order = reserveTopAuthoringOrder(draft, surface.id, input.sceneId)
    items.push(item)
    sortAllLayerLists(draft)
  }, input.now)
}

export function addVideoLayer(
  project: CourseProjectDocument,
  input: {
    surfaceId: string
    sceneId?: string
    assetId: string
    id?: string
    width?: number
    height?: number
    x?: number
    y?: number
    fit?: VideoNode['fit']
    autoplay?: boolean
    loop?: boolean
    muted?: boolean
    volume?: number
    playbackRate?: number
    showControls?: boolean
    clickToToggle?: boolean
    startTime?: number
    endTime?: number | null
    backgroundAudioMode?: VideoNode['backgroundAudioMode']
    now?: string
  },
): CourseProjectDocument {
  const asset = project.assets[input.assetId]
  if (!asset) throw new Error(`找不到素材：${input.assetId}`)
  if (asset.kind !== 'video') throw new Error(`素材不是视频：${input.assetId}`)
  const item = createNativeVideoLayer({
    id: stableId('video', input.id),
    assetId: input.assetId,
    width: input.width,
    height: input.height,
    x: input.x,
    y: input.y,
    fit: input.fit,
    autoplay: input.autoplay,
    loop: input.loop,
    muted: input.muted,
    volume: input.volume,
    playbackRate: input.playbackRate,
    showControls: input.showControls,
    clickToToggle: input.clickToToggle,
    startTime: input.startTime,
    endTime: input.endTime,
    backgroundAudioMode: input.backgroundAudioMode,
  })
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === input.surfaceId)
    if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
    let items: LayerItem[]
    if (surface.type === 'slide') {
      const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
      if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
      items = scene.layerItems
    } else if (surface.type === 'spatial-2d') {
      items = surface.world.layerItems
    } else {
      throw new Error('Flow 视频应使用媒体块')
    }
    item.order = reserveTopAuthoringOrder(draft, surface.id, input.sceneId)
    items.push(item)
    sortAllLayerLists(draft)
  }, input.now)
}

export function addComponentLayer(
  project: CourseProjectDocument,
  input: {
    surfaceId: string
    sceneId?: string
    packageId: string
    version: string
    label: string
    props: Record<string, unknown>
    staticFallbackAssetId?: string
    id?: string
    width: number
    height: number
    x?: number
    y?: number
    now?: string
  },
): CourseProjectDocument {
  const item: LayerItem = {
    layerItemId: stableId('component', input.id),
    label: input.label,
    kind: 'component',
    frame: {
      mode: 'absolute',
      x: input.x ?? 160,
      y: input.y ?? 120,
      width: input.width,
      height: input.height,
    },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: input.packageId, version: input.version },
    props: structuredClone(input.props),
    ...(input.staticFallbackAssetId ? { staticFallbackAssetId: input.staticFallbackAssetId } : {}),
  }
  return cloneAndCommit(project, (draft) => {
    const meta = Object.values(draft.componentPackages).find((candidate) => (
      candidate.packageId === input.packageId && candidate.version === input.version
    ))
    if (!meta) throw new Error(`组件包未嵌入工程：${input.packageId}@${input.version}`)
    if (input.staticFallbackAssetId && !draft.assets[input.staticFallbackAssetId]) {
      throw new Error('互动组件的静态预览素材尚未加入当前课件。')
    }
    const items = layerItemsIn(draft, input)
    item.order = reserveTopAuthoringOrder(draft, input.surfaceId, input.sceneId)
    items.push(item)
    sortAllLayerLists(draft)
  }, input.now)
}

type NewFlowBlock = FlowBlock extends infer Block
  ? Block extends FlowBlock
    ? Omit<Block, 'id'> & { id?: string }
    : never
  : never

export function addFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  block: NewFlowBlock,
  now?: string,
): CourseProjectDocument {
  const next = { ...block, id: stableId('block', block.id) } as FlowBlock
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'flow') throw new Error('目标不是 Flow 表面')
    if (surface.blocks.some((candidate) => candidate.id === next.id)) {
      throw new Error(`块 ID 已存在：${next.id}`)
    }
    surface.blocks.push(next)
    appendFlowLocations(draft, surfaceId, next)
    syncFlowBlockLocationOrder(draft, surfaceId, surface.blocks)
  }, now)
}

function flowBlockLabel(project: CourseProjectDocument, block: FlowBlock): string {
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') {
    return block.text.trim().slice(0, 48) || FLOW_BLOCK_LABELS[block.type]
  }
  if (block.type === 'callout') return block.title?.trim() || block.body.trim().slice(0, 48) || '提示'
  if (block.type === 'section') return block.title.trim() || '分节'
  if (block.type === 'media') return block.caption?.trim() || block.altText?.trim() || '媒体'
  if (block.type === 'code') return block.language ? `代码·${block.language}` : '代码'
  if (block.type === 'formula') return block.accessibleText.trim() || '公式'
  if (block.type === 'component') {
    const componentName = Object.values(project.componentPackages).find((candidate) => (
      candidate.packageId === block.component.packageId && candidate.version === block.component.version
    ))?.name
    return componentName?.trim() || FLOW_BLOCK_LABELS.component
  }
  if (block.type === 'list') return block.items[0]?.text.trim().slice(0, 48) || '列表'
  if (block.type === 'table') return block.caption?.trim() || '表格'
  return '分隔线'
}

function appendFlowLocations(
  project: CourseProjectDocument,
  surfaceId: string,
  block: FlowBlock,
): void {
  project.locations.push({
    id: block.id,
    label: flowBlockLabel(project, block),
    kind: 'flow-block',
    surfaceId,
    blockId: block.id,
  })
  if (block.type === 'section') {
    block.blocks.forEach((child) => appendFlowLocations(project, surfaceId, child))
  }
}

function flowBlockIds(block: FlowBlock): string[] {
  return [block.id, ...(block.type === 'section' ? block.blocks.flatMap(flowBlockIds) : [])]
}

function flowSurfaceIn(
  project: CourseProjectDocument,
  surfaceId: string,
): Extract<CourseSurfaceDocument, { type: 'flow' }> {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'flow') throw new Error('目标不是 Flow 表面')
  return surface
}

export function updateFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  update: (block: FlowBlock) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = flowSurfaceIn(draft, surfaceId)
    const block = surface.blocks.find((candidate) => candidate.id === blockId)
    if (!block) throw new Error(`找不到 Flow 块：${blockId}`)
    update(block)
    const location = draft.locations.find(
      (candidate) => candidate.kind === 'flow-block' && candidate.surfaceId === surfaceId && candidate.blockId === blockId,
    )
    if (location) location.label = flowBlockLabel(draft, block)
  }, now)
}

interface FlowBlockLocation {
  blocks: FlowBlock[]
  index: number
  block: FlowBlock
}

function findFlowBlockRecursive(blocks: FlowBlock[], blockId: string): FlowBlockLocation | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!
    if (block.id === blockId) return { blocks, index, block }
    if (block.type === 'section') {
      const nested = findFlowBlockRecursive(block.blocks, blockId)
      if (nested) return nested
    }
  }
  return null
}

export function updateNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  update: (block: FlowBlock) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    update(found.block)
    const location = draft.locations.find((candidate) => (
      candidate.kind === 'flow-block' && candidate.surfaceId === surfaceId && candidate.blockId === blockId
    ))
    if (location) location.label = flowBlockLabel(draft, found.block)
  }, now)
}

function assertAssetMatchesKind(asset: AssetMeta, expectedKind: AssetMeta['kind']): void {
  if (
    asset.kind !== expectedKind ||
    !asset.mimeType.toLocaleLowerCase('en-US').startsWith(`${expectedKind}/`)
  ) {
    throw new Error(`所选素材不是${expectedKind === 'image' ? '图片' : expectedKind === 'audio' ? '音频' : '视频'}。`)
  }
}

/** Adds the replacement bytes metadata and changes one Flow media reference in one revision. */
export function replaceFlowMediaAsset(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  asset: AssetMeta,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found || found.block.type !== 'media') throw new Error('所选内容已不是媒体，请重新选择。')
    assertAssetMatchesKind(asset, found.block.mediaKind)
    draft.assets[asset.id] = structuredClone(asset)
    found.block.assetId = asset.id
  }, now)
}

/** Replaces a Flow component, its defaults and its print fallback atomically. */
export function replaceFlowComponentBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  input: {
    packageId: string
    version: string
    props: Record<string, unknown>
    staticFallbackAsset: AssetMeta
  },
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const component = draft.componentPackages[input.packageId]
    if (!component || component.version !== input.version) {
      throw new Error('替换用的互动组件尚未导入当前课件。')
    }
    assertAssetMatchesKind(input.staticFallbackAsset, 'image')
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found || found.block.type !== 'component') throw new Error('所选内容已不是互动组件，请重新选择。')
    draft.assets[input.staticFallbackAsset.id] = structuredClone(input.staticFallbackAsset)
    found.block.component = { packageId: input.packageId, version: input.version }
    found.block.props = structuredClone(input.props)
    found.block.staticFallbackAssetId = input.staticFallbackAsset.id
    const location = draft.locations.find((candidate) => (
      candidate.kind === 'flow-block' && candidate.surfaceId === surfaceId && candidate.blockId === blockId
    ))
    if (location) location.label = flowBlockLabel(draft, found.block)
  }, now)
}

/** Changes only the static print fallback while keeping the live component. */
export function replaceFlowComponentFallback(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  asset: AssetMeta,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    assertAssetMatchesKind(asset, 'image')
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found || found.block.type !== 'component') throw new Error('所选内容已不是互动组件，请重新选择。')
    draft.assets[asset.id] = structuredClone(asset)
    found.block.staticFallbackAssetId = asset.id
  }, now)
}

export function insertNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  sectionId: string,
  block: NewFlowBlock,
  now?: string,
): CourseProjectDocument {
  const next = { ...block, id: stableId('block', block.id) } as FlowBlock
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, sectionId)
    if (!found || found.block.type !== 'section') throw new Error(`找不到 Flow 分节：${sectionId}`)
    if (findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, next.id)) throw new Error(`Flow 块 ID 已存在：${next.id}`)
    found.block.blocks.push(next)
    appendFlowLocations(draft, surfaceId, next)
    syncFlowBlockLocationOrder(draft, surfaceId, flowSurfaceIn(draft, surfaceId).blocks)
  }, now)
}

export function deleteNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    const deletedIds = new Set(flowBlockIds(found.block))
    const deletedLocationIds = new Set(draft.locations.flatMap((location) => (
      location.kind === 'flow-block' &&
      location.surfaceId === surfaceId &&
      deletedIds.has(location.blockId)
        ? [location.id]
        : []
    )))
    found.blocks.splice(found.index, 1)
    removeDeletedLocationReferences(draft, deletedLocationIds)
    draft.locations = draft.locations.filter((location) => !deletedLocationIds.has(location.id))
    if (!draft.locations.some((location) => location.id === draft.startLocationId)) {
      draft.startLocationId = draft.locations[0]!.id
    }
    syncFlowBlockLocationOrder(draft, surfaceId, flowSurfaceIn(draft, surfaceId).blocks)
  }, now)
}

export function reorderNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  toIndex: number,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    const [block] = found.blocks.splice(found.index, 1)
    found.blocks.splice(Math.max(0, Math.min(toIndex, found.blocks.length)), 0, block!)
    syncFlowBlockLocationOrder(draft, surfaceId, flowSurfaceIn(draft, surfaceId).blocks)
  }, now)
}

export function duplicateNestedFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const found = findFlowBlockRecursive(flowSurfaceIn(draft, surfaceId).blocks, blockId)
    if (!found) throw new Error(`找不到 Flow 块：${blockId}`)
    const duplicate = regenerateFlowIdentities(found.block)
    found.blocks.splice(found.index + 1, 0, duplicate)
    appendFlowLocations(draft, surfaceId, duplicate)
    syncFlowBlockLocationOrder(draft, surfaceId, flowSurfaceIn(draft, surfaceId).blocks)
  }, now)
}

export function addSpatialSemanticZoomRule(
  project: CourseProjectDocument,
  surfaceId: string,
  input: {
    id?: string
    layerItemIds: string[]
    minZoom: number
    maxZoom: number
    visible?: boolean
    now?: string
  },
): CourseProjectDocument {
  const id = stableId('semantic-zoom', input.id)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    if (input.minZoom < 0 || input.maxZoom <= input.minZoom) throw new Error('语义缩放范围无效')
    const worldIds = new Set(surface.world.layerItems.map((item) => item.layerItemId))
    if (input.layerItemIds.length === 0 || input.layerItemIds.some((itemId) => !worldIds.has(itemId))) {
      throw new Error('语义缩放规则必须引用已存在的世界图层')
    }
    surface.semanticZoom.push({
      id,
      layerItemIds: [...new Set(input.layerItemIds)],
      minZoom: input.minZoom,
      maxZoom: input.maxZoom,
      visible: input.visible ?? true,
    })
  }, input.now)
}

export function updateSpatialSemanticZoomRule(
  project: CourseProjectDocument,
  surfaceId: string,
  ruleId: string,
  update: (rule: SpatialSurfaceDocument['semanticZoom'][number]) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    const rule = surface.semanticZoom.find((candidate) => candidate.id === ruleId)
    if (!rule) throw new Error(`找不到语义缩放规则：${ruleId}`)
    update(rule)
  }, now)
}

export function deleteSpatialSemanticZoomRule(
  project: CourseProjectDocument,
  surfaceId: string,
  ruleId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    const index = surface.semanticZoom.findIndex((candidate) => candidate.id === ruleId)
    if (index < 0) throw new Error(`找不到语义缩放规则：${ruleId}`)
    surface.semanticZoom.splice(index, 1)
  }, now)
}

function spatialItemCenter(item: LayerItem): { x: number; y: number } {
  return {
    x: item.frame.x + item.frame.width / 2,
    y: item.frame.y + item.frame.height / 2,
  }
}

function synchronizeSpatialRelations(surface: SpatialSurfaceDocument): void {
  const byId = new Map(surface.world.layerItems.map((item) => [item.layerItemId, item]))
  surface.relations.forEach((relation) => {
    const source = byId.get(relation.sourceLayerItemId)
    const target = byId.get(relation.targetLayerItemId)
    const line = byId.get(relation.lineLayerItemId)
    if (!source || !target || !line) return
    const start = spatialItemCenter(source)
    const end = spatialItemCenter(target)
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    const distance = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y))
    line.frame = {
      mode: 'absolute',
      x: midpoint.x - distance / 2,
      y: midpoint.y - 2,
      width: distance,
      height: 4,
    }
    line.rotation = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI
    if (relation.labelLayerItemId) {
      const label = byId.get(relation.labelLayerItemId)
      if (label) {
        label.frame.x = midpoint.x - label.frame.width / 2
        label.frame.y = midpoint.y - label.frame.height / 2 - 18
      }
    }
  })
}

function synchronizeAllSpatialRelations(project: CourseProjectDocument): void {
  project.surfaces.forEach((surface) => {
    if (surface.type === 'spatial-2d') synchronizeSpatialRelations(surface)
  })
}

export function addSpatialRelation(
  project: CourseProjectDocument,
  surfaceId: string,
  input: {
    sourceLayerItemId: string
    targetLayerItemId: string
    name?: string
    id?: string
    lineLayerItemId?: string
    labelLayerItemId?: string
    showLabel?: boolean
    now?: string
  },
): CourseProjectDocument {
  if (input.sourceLayerItemId === input.targetLayerItemId) throw new Error('请选择两个不同的节点')
  const relationId = stableId('relation', input.id)
  const lineId = stableId('relation-line', input.lineLayerItemId)
  const labelId = input.showLabel === false ? undefined : stableId('relation-label', input.labelLayerItemId)
  const name = input.name?.trim() || '关系'
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是空间画布')
    const worldIds = new Set(surface.world.layerItems.map((item) => item.layerItemId))
    if (!worldIds.has(input.sourceLayerItemId) || !worldIds.has(input.targetLayerItemId)) {
      throw new Error('连线只能连接当前空间画布中的节点')
    }
    if (surface.relations.some((relation) => relation.id === relationId)) {
      throw new Error(`关系 ID 已存在：${relationId}`)
    }
    shiftProjectLayerOrders(draft, 0, 1)
    const line = createNativeShapeLayer(lineId, 0, 0)
    line.label = `关系线：${name}`
    line.order = 0
    line.frame.width = 100
    line.frame.height = 4
    if (line.content.nativeType !== 'shape') throw new Error('无法创建关系线')
    line.content.data.shapeType = 'line'
    line.content.data.style.fillOpacity = 0
    line.content.data.style.borderColor = '#5b8d99'
    line.content.data.style.borderOpacity = 1
    line.content.data.style.borderWidth = 4
    line.content.data.style.startArrow = 'none'
    line.content.data.style.endArrow = 'triangle'
    surface.world.layerItems.push(line)

    let label: NativeLayerItem | undefined
    if (labelId) {
      label = createNativeTextLayer(labelId, name)
      label.label = `关系标签：${name}`
      label.frame.width = 220
      label.frame.height = 44
      label.order = reserveTopAuthoringOrder(draft, surface.id)
      if (label.content.nativeType === 'text') {
        label.content.data.style.fontSize = 24
        label.content.data.style.align = 'center'
        label.content.data.style.verticalAlign = 'middle'
        label.content.data.style.padding = 4
        label.content.data.style.backgroundColor = '#ffffff'
        label.content.data.style.backgroundOpacity = 0.88
        label.content.data.style.cornerRadius = 8
      }
      surface.world.layerItems.push(label)
    }
    const relation: SpatialRelation = {
      id: relationId,
      name,
      sourceLayerItemId: input.sourceLayerItemId,
      targetLayerItemId: input.targetLayerItemId,
      lineLayerItemId: line.layerItemId,
      ...(label ? { labelLayerItemId: label.layerItemId } : {}),
    }
    surface.relations.push(relation)
    synchronizeSpatialRelations(surface)
    sortAllLayerLists(draft)
  }, input.now)
}

export function updateSpatialRelation(
  project: CourseProjectDocument,
  surfaceId: string,
  relationId: string,
  update: (relation: SpatialRelation) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是空间画布')
    const relation = surface.relations.find((candidate) => candidate.id === relationId)
    if (!relation) throw new Error(`找不到关系：${relationId}`)
    update(relation)
    relation.name = relation.name.trim() || '关系'
    if (relation.sourceLayerItemId === relation.targetLayerItemId) throw new Error('关系的两个端点不能相同')
    const byId = new Map(surface.world.layerItems.map((item) => [item.layerItemId, item]))
    if (!byId.has(relation.sourceLayerItemId) || !byId.has(relation.targetLayerItemId)) {
      throw new Error('关系端点已失效，请重新选择')
    }
    const label = relation.labelLayerItemId ? byId.get(relation.labelLayerItemId) : undefined
    if (label?.kind === 'native' && label.content.nativeType === 'text') {
      label.label = `关系标签：${relation.name}`
      label.content.data.text = relation.name
    }
    const line = byId.get(relation.lineLayerItemId)
    if (line) line.label = `关系线：${relation.name}`
    synchronizeSpatialRelations(surface)
  }, now)
}

function removeSpatialRelationVisuals(surface: SpatialSurfaceDocument, relation: SpatialRelation): void {
  const removeIds = new Set([relation.lineLayerItemId, relation.labelLayerItemId].filter((id): id is string => Boolean(id)))
  surface.world.layerItems = surface.world.layerItems.filter((item) => !removeIds.has(item.layerItemId))
  surface.semanticZoom = surface.semanticZoom.flatMap((rule) => {
    const layerItemIds = rule.layerItemIds.filter((itemId) => !removeIds.has(itemId))
    return layerItemIds.length > 0 ? [{ ...rule, layerItemIds }] : []
  })
}

export function deleteSpatialRelation(
  project: CourseProjectDocument,
  surfaceId: string,
  relationId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是空间画布')
    const index = surface.relations.findIndex((candidate) => candidate.id === relationId)
    if (index < 0) throw new Error(`找不到关系：${relationId}`)
    removeSpatialRelationVisuals(surface, surface.relations[index]!)
    surface.relations.splice(index, 1)
    sortAllLayerLists(draft)
  }, now)
}

function repairSpatialRelationsAfterLayerDelete(
  surface: SpatialSurfaceDocument,
  deletedLayerItemId: string,
): Set<string> {
  const removedIds = new Set([deletedLayerItemId])
  surface.relations = surface.relations.flatMap((relation) => {
    if (relation.labelLayerItemId === deletedLayerItemId) {
      const { labelLayerItemId: _removed, ...withoutLabel } = relation
      return [withoutLabel]
    }
    if (
      relation.sourceLayerItemId !== deletedLayerItemId &&
      relation.targetLayerItemId !== deletedLayerItemId &&
      relation.lineLayerItemId !== deletedLayerItemId
    ) return [relation]
    removedIds.add(relation.lineLayerItemId)
    if (relation.labelLayerItemId) removedIds.add(relation.labelLayerItemId)
    return []
  })
  surface.world.layerItems = surface.world.layerItems.filter((item) => !removedIds.has(item.layerItemId))
  surface.semanticZoom = surface.semanticZoom.flatMap((rule) => {
    const layerItemIds = rule.layerItemIds.filter((itemId) => !removedIds.has(itemId))
    return layerItemIds.length > 0 ? [{ ...rule, layerItemIds }] : []
  })
  return removedIds
}

export function reorderFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  toIndex: number,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const blocks = flowSurfaceIn(draft, surfaceId).blocks
    const index = blocks.findIndex((candidate) => candidate.id === blockId)
    if (index < 0) throw new Error(`找不到 Flow 块：${blockId}`)
    const [block] = blocks.splice(index, 1)
    blocks.splice(Math.max(0, Math.min(toIndex, blocks.length)), 0, block!)
    syncFlowBlockLocationOrder(draft, surfaceId, blocks)
  }, now)
}

function syncFlowBlockLocationOrder(
  project: CourseProjectDocument,
  surfaceId: string,
  blocks: readonly FlowBlock[],
): void {
  const slots: number[] = []
  const locations: Array<Extract<CourseLocation, { kind: 'flow-block' }>> = []
  project.locations.forEach((location, index) => {
    if (location.kind !== 'flow-block' || location.surfaceId !== surfaceId) return
    slots.push(index)
    locations.push(location)
  })
  const rankByBlockId = new Map(
    flowBlockIdsInDocumentOrder(blocks).map((blockId, index) => [blockId, index]),
  )
  locations.sort((left, right) => (
    (rankByBlockId.get(left.blockId) ?? Number.MAX_SAFE_INTEGER) -
    (rankByBlockId.get(right.blockId) ?? Number.MAX_SAFE_INTEGER)
  ))
  slots.forEach((slot, index) => { project.locations[slot] = locations[index]! })
}

/**
 * Moves one semantic Flow block across the document tree in one V9 revision.
 * The request never addresses DOM nodes or serialized JSON.
 */
export function moveFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  request: FlowBlockMoveRequest,
  now?: string,
): CourseProjectDocument {
  const currentSurface = flowSurfaceIn(project, surfaceId)
  if (isFlowBlockMoveNoOp(currentSurface.blocks, request)) return project
  return cloneAndCommit(project, (draft) => {
    const surface = flowSurfaceIn(draft, surfaceId)
    moveFlowBlockInPlace(surface.blocks, request)
    syncFlowBlockLocationOrder(draft, surfaceId, surface.blocks)
  }, now)
}

function regenerateFlowIdentities(block: FlowBlock): FlowBlock {
  const next = structuredClone(block)
  next.id = stableId('block')
  if (next.type === 'list') {
    next.items = next.items.map((item) => ({ ...item, id: stableId('list-item') }))
  } else if (next.type === 'section') {
    next.blocks = next.blocks.map(regenerateFlowIdentities)
  }
  return next
}

export function duplicateFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const blocks = flowSurfaceIn(draft, surfaceId).blocks
    const index = blocks.findIndex((candidate) => candidate.id === blockId)
    if (index < 0) throw new Error(`找不到 Flow 块：${blockId}`)
    const duplicate = regenerateFlowIdentities(blocks[index]!)
    blocks.splice(index + 1, 0, duplicate)
    appendFlowLocations(draft, surfaceId, duplicate)
    syncFlowBlockLocationOrder(draft, surfaceId, blocks)
  }, now)
}

export function deleteFlowBlock(
  project: CourseProjectDocument,
  surfaceId: string,
  blockId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const layerItemIdsBefore = remainingLayerItemIds(draft)
    const blocks = flowSurfaceIn(draft, surfaceId).blocks
    const index = blocks.findIndex((candidate) => candidate.id === blockId)
    if (index < 0) throw new Error(`找不到 Flow 块：${blockId}`)
    const deletedIds = new Set(flowBlockIds(blocks[index]!))
    const deletedLocationIds = new Set(draft.locations.flatMap((location) => (
      location.kind === 'flow-block' &&
      location.surfaceId === surfaceId &&
      deletedIds.has(location.blockId)
        ? [location.id]
        : []
    )))
    blocks.splice(index, 1)
    removeDeletedLocationReferences(draft, deletedLocationIds)
    draft.locations = draft.locations.filter((location) => !deletedLocationIds.has(location.id))
    if (!draft.locations.some((location) => location.id === draft.startLocationId)) {
      draft.startLocationId = draft.locations[0]!.id
    }
    const layerItemIdsAfter = remainingLayerItemIds(draft)
    repairMissingLayerItemReferences(draft, new Set(
      [...layerItemIdsBefore].filter((layerItemId) => !layerItemIdsAfter.has(layerItemId)),
    ))
    syncFlowBlockLocationOrder(draft, surfaceId, blocks)
  }, now)
}

function layerItemsIn(
  project: CourseProjectDocument,
  input: { surfaceId: string; sceneId?: string },
): LayerItem[] {
  const surface = project.surfaces.find((candidate) => candidate.id === input.surfaceId)
  if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
  if (surface.type === 'slide') {
    const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
    if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
    return scene.layerItems
  }
  if (surface.type === 'spatial-2d') return surface.world.layerItems
  throw new Error('Flow 语义内容请使用内容块；绝对图层必须明确使用 surface 或 global scope')
}

export type CourseLayerSource = 'scene' | 'world' | 'surface' | 'global'

export interface CourseLayerItemLocation {
  surfaceId: string
  sceneId?: string
  layerItemId: string
  source?: CourseLayerSource
}

interface MutableLayerCollection {
  scoped: boolean
  entries: LayerItem[] | ScopedLayerItem[]
}

function mutableLayerCollectionIn(
  project: CourseProjectDocument,
  input: Pick<CourseLayerItemLocation, 'surfaceId' | 'sceneId' | 'source'>,
): MutableLayerCollection {
  if (input.source === 'global') {
    return { scoped: true, entries: project.globalLayerItems }
  }
  const surface = project.surfaces.find((candidate) => candidate.id === input.surfaceId)
  if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
  if (input.source === 'surface') {
    return { scoped: true, entries: surface.surfaceLayerItems }
  }
  if (surface.type === 'slide') {
    const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
    if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
    return { scoped: false, entries: scene.layerItems }
  }
  if (surface.type === 'spatial-2d' && (input.source === undefined || input.source === 'world')) {
    return { scoped: false, entries: surface.world.layerItems }
  }
  throw new Error('Flow 绝对图层必须明确使用 surface 或 global scope')
}

function collectionItems(collection: MutableLayerCollection): LayerItem[] {
  return collection.scoped
    ? (collection.entries as ScopedLayerItem[]).map((entry) => entry.item)
    : collection.entries as LayerItem[]
}

function collectionDelete(collection: MutableLayerCollection, index: number): void {
  collection.entries.splice(index, 1)
}

function collectionInsert(
  collection: MutableLayerCollection,
  index: number,
  item: LayerItem,
  visibility?: ScopedLayerItem['visibility'],
): void {
  if (collection.scoped) {
    ;(collection.entries as ScopedLayerItem[]).splice(index, 0, {
      item,
      visibility: visibility ?? { mode: 'all', locationIds: [] },
    })
  } else {
    ;(collection.entries as LayerItem[]).splice(index, 0, item)
  }
}

export function updateLayerItem(
  project: CourseProjectDocument,
  input: CourseLayerItemLocation,
  update: (item: LayerItem) => void,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const item = collectionItems(mutableLayerCollectionIn(draft, input))
      .find((candidate) => candidate.layerItemId === input.layerItemId)
    if (!item) throw new Error(`找不到图层：${input.layerItemId}`)
    update(item)
    synchronizeAllSpatialRelations(draft)
  }, now)
}

export interface CourseLayerItemBatchUpdate extends CourseLayerItemLocation {
  update(item: LayerItem): void
}

/**
 * Applies one authoring gesture to any number of V9 layer items as a single
 * project revision. Multi-select transforms must not create one undo step per
 * item or temporarily expose a half-transformed project to the renderer.
 */
export function updateLayerItems(
  project: CourseProjectDocument,
  updates: readonly CourseLayerItemBatchUpdate[],
  now?: string,
): CourseProjectDocument {
  if (updates.length === 0) return project
  return cloneAndCommit(project, (draft) => {
    const seen = new Set<string>()
    for (const input of updates) {
      if (seen.has(input.layerItemId)) throw new Error(`重复的图层更新：${input.layerItemId}`)
      seen.add(input.layerItemId)
      const item = collectionItems(mutableLayerCollectionIn(draft, input))
        .find((candidate) => candidate.layerItemId === input.layerItemId)
      if (!item) throw new Error(`找不到图层：${input.layerItemId}`)
      input.update(item)
    }
    synchronizeAllSpatialRelations(draft)
  }, now)
}

export function deleteLayerItem(
  project: CourseProjectDocument,
  input: CourseLayerItemLocation,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === input.surfaceId)
    if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
    const collection = mutableLayerCollectionIn(draft, input)
    const items = collectionItems(collection)
    const index = items.findIndex((candidate) => candidate.layerItemId === input.layerItemId)
    if (index < 0) throw new Error(`找不到图层：${input.layerItemId}`)
    collectionDelete(collection, index)
    let deletedLayerItemIds = new Set([input.layerItemId])
    if (
      surface.type === 'spatial-2d' &&
      (input.source === undefined || input.source === 'world')
    ) {
      deletedLayerItemIds = repairSpatialRelationsAfterLayerDelete(
        surface, input.layerItemId,
      )
    }

    if (input.source === 'global') {
      draft.globalInteractions = removeDeletedLayerInteractionReferences(
        draft.globalInteractions, deletedLayerItemIds,
      )
      draft.surfaces.forEach((candidate) => {
        if (candidate.type !== 'slide') return
        candidate.scenes.forEach((scene) => {
          repairDeletedLayerReferencesInSlideScene(scene, deletedLayerItemIds)
        })
      })
      removeDeletedRuntimeNodeBindings(allProjectLayerItems(draft), deletedLayerItemIds)
    } else if (input.source === 'surface') {
      removeDeletedRuntimeNodeBindings(
        surface.surfaceLayerItems.map((entry) => entry.item), deletedLayerItemIds,
      )
      if (surface.type === 'slide') {
        surface.scenes.forEach((scene) => {
          repairDeletedLayerReferencesInSlideScene(scene, deletedLayerItemIds)
        })
      } else if (surface.type === 'spatial-2d') {
        removeDeletedRuntimeNodeBindings(surface.world.layerItems, deletedLayerItemIds)
      }
    } else if (surface.type === 'slide') {
      const scene = surface.scenes.find((candidate) => candidate.id === input.sceneId)
      if (!scene) throw new Error(`找不到场景：${input.sceneId ?? ''}`)
      repairDeletedLayerReferencesInSlideScene(scene, deletedLayerItemIds)
      removeDeletedRuntimeNodeBindings(
        surface.surfaceLayerItems.map((entry) => entry.item), deletedLayerItemIds,
      )
    } else if (surface.type === 'spatial-2d') {
      removeDeletedRuntimeNodeBindings(surface.world.layerItems, deletedLayerItemIds)
      removeDeletedRuntimeNodeBindings(
        surface.surfaceLayerItems.map((entry) => entry.item), deletedLayerItemIds,
      )
    }
    repairMissingLayerItemReferences(draft, deletedLayerItemIds)
    sortAllLayerLists(draft)
  }, now)
}

export function duplicateLayerItem(
  project: CourseProjectDocument,
  input: CourseLayerItemLocation,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const collection = mutableLayerCollectionIn(draft, input)
    const items = collectionItems(collection)
    const index = items.findIndex((candidate) => candidate.layerItemId === input.layerItemId)
    if (index < 0) throw new Error(`找不到图层：${input.layerItemId}`)
    const duplicate = structuredClone(items[index]!)
    duplicate.layerItemId = stableId(duplicate.kind)
    duplicate.label = `${duplicate.label} 副本`
    duplicate.frame.x += 24
    duplicate.frame.y += 24
    const desiredOrder = items[index]!.order + 1
    shiftProjectLayerOrders(draft, desiredOrder, 1)
    duplicate.order = desiredOrder
    const originalVisibility = collection.scoped
      ? (collection.entries as ScopedLayerItem[])[index]?.visibility
      : undefined
    collectionInsert(collection, index + 1, duplicate, originalVisibility && structuredClone(originalVisibility))
    sortAllLayerLists(draft)
  }, now)
}

export function addSpatialCameraFrame(
  project: CourseProjectDocument,
  surfaceId: string,
  pose: { x: number; y: number; zoom: number },
  options: { id?: string; name?: string; now?: string } = {},
): CourseProjectDocument {
  const frameId = stableId('camera', options.id)
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
    const frame = {
      id: frameId,
      name: options.name ?? `镜头 ${surface.camera.frames.length + 1}`,
      x: pose.x,
      y: pose.y,
      zoom: pose.zoom,
    }
    surface.camera.frames.push(frame)
    draft.locations.push({
      id: frameId,
      label: `${surface.title} · ${frame.name}`,
      kind: 'spatial-camera',
      surfaceId,
      cameraFrameId: frameId,
    })
    const printEntry = draft.mixedPrintPlan?.entries.find(
      (entry): entry is Extract<MixedPrintEntry, { kind: 'spatial-frames' }> =>
        entry.kind === 'spatial-frames' && entry.surfaceId === surfaceId,
    )
    printEntry?.cameraFrameIds.push(frameId)
  }, options.now)
}

export function setSpatialHomeCamera(
  project: CourseProjectDocument,
  surfaceId: string,
  pose: { x: number; y: number; zoom: number },
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是空间画布')
    if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !Number.isFinite(pose.zoom) || pose.zoom <= 0) {
      throw new Error('首页镜头无效')
    }
    surface.camera.home = structuredClone(pose)
  }, now)
}

export function renameSpatialCameraFrame(
  project: CourseProjectDocument,
  surfaceId: string,
  frameId: string,
  name: string,
  now?: string,
): CourseProjectDocument {
  const nextName = name.trim()
  if (!nextName) throw new Error('镜头名称不能为空')
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是空间画布')
    const frame = surface.camera.frames.find((candidate) => candidate.id === frameId)
    if (!frame) throw new Error(`找不到镜头：${frameId}`)
    frame.name = nextName
    draft.locations.forEach((location) => {
      if (
        location.kind === 'spatial-camera' &&
        location.surfaceId === surfaceId &&
        location.cameraFrameId === frameId
      ) location.label = `${surface.title} · ${nextName}`
    })
  }, now)
}

function reorderSpatialLocations(
  project: CourseProjectDocument,
  surfaceId: string,
  frameIds: readonly string[],
): void {
  const indexed = project.locations
    .map((location, index) => ({ location, index }))
    .filter((entry): entry is {
      location: Extract<CourseLocation, { kind: 'spatial-camera' }>
      index: number
    } => entry.location.kind === 'spatial-camera' && entry.location.surfaceId === surfaceId)
  const byFrame = new Map<string, Array<Extract<CourseLocation, { kind: 'spatial-camera' }>>>()
  for (const { location } of indexed) {
    const group = byFrame.get(location.cameraFrameId) ?? []
    group.push(location)
    byFrame.set(location.cameraFrameId, group)
  }
  const reordered = frameIds.flatMap((frameId) => byFrame.get(frameId) ?? [])
  if (reordered.length !== indexed.length) {
    throw new Error('镜头路径与课程位置不一致，无法安全排序')
  }
  indexed.forEach(({ index }, locationIndex) => {
    project.locations[index] = reordered[locationIndex]!
  })
}

export function reorderSpatialCameraFrames(
  project: CourseProjectDocument,
  surfaceId: string,
  frameIds: readonly string[],
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是空间画布')
    const currentIds = surface.camera.frames.map((frame) => frame.id)
    if (
      frameIds.length !== currentIds.length ||
      new Set(frameIds).size !== frameIds.length ||
      frameIds.some((id) => !currentIds.includes(id))
    ) throw new Error('镜头路径排序必须包含全部镜头')
    const byId = new Map(surface.camera.frames.map((frame) => [frame.id, frame]))
    surface.camera.frames = frameIds.map((id) => byId.get(id)!)
    reorderSpatialLocations(draft, surfaceId, frameIds)
    const printEntry = draft.mixedPrintPlan?.entries.find(
      (entry): entry is Extract<MixedPrintEntry, { kind: 'spatial-frames' }> => (
        entry.kind === 'spatial-frames' && entry.surfaceId === surfaceId
      ),
    )
    if (printEntry) printEntry.cameraFrameIds = [...frameIds]
  }, now)
}

export function deleteSpatialCameraFrame(
  project: CourseProjectDocument,
  surfaceId: string,
  frameId: string,
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const layerItemIdsBefore = remainingLayerItemIds(draft)
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是空间画布')
    if (surface.camera.frames.length <= 1) throw new Error('教学路径至少保留一个镜头')
    const frameIndex = surface.camera.frames.findIndex((candidate) => candidate.id === frameId)
    if (frameIndex < 0) throw new Error(`找不到镜头：${frameId}`)
    surface.camera.frames.splice(frameIndex, 1)
    const deletedLocationIds = new Set(draft.locations
      .filter((location) => (
        location.kind === 'spatial-camera' &&
        location.surfaceId === surfaceId &&
        location.cameraFrameId === frameId
      ))
      .map((location) => location.id))
    removeDeletedLocationReferences(draft, deletedLocationIds)
    draft.locations = draft.locations.filter((location) => !deletedLocationIds.has(location.id))
    if (deletedLocationIds.has(draft.startLocationId)) draft.startLocationId = draft.locations[0]!.id
    const layerItemIdsAfter = remainingLayerItemIds(draft)
    repairMissingLayerItemReferences(draft, new Set(
      [...layerItemIdsBefore].filter((layerItemId) => !layerItemIdsAfter.has(layerItemId)),
    ))
    const printEntry = draft.mixedPrintPlan?.entries.find(
      (entry): entry is Extract<MixedPrintEntry, { kind: 'spatial-frames' }> => (
        entry.kind === 'spatial-frames' && entry.surfaceId === surfaceId
      ),
    )
    if (printEntry) printEntry.cameraFrameIds = printEntry.cameraFrameIds.filter((id) => id !== frameId)
  }, now)
}

function defaultMixedPrintEntry(surface: CourseSurfaceDocument): MixedPrintEntry {
  if (surface.type === 'slide') {
    return {
      id: `print:${surface.id}`,
      kind: 'slide-scenes',
      surfaceId: surface.id,
      sceneIds: surface.scenes.map((scene) => scene.id),
    }
  }
  if (surface.type === 'flow') {
    return { id: `print:${surface.id}`, kind: 'flow-document', surfaceId: surface.id }
  }
  return {
    id: `print:${surface.id}`,
    kind: 'spatial-frames',
    surfaceId: surface.id,
    cameraFrameIds: surface.camera.frames.map((frame) => frame.id),
  }
}

export function reorderLayerItem(
  project: CourseProjectDocument,
  input: CourseLayerItemLocation & { toIndex: number },
  now?: string,
): CourseProjectDocument {
  return cloneAndCommit(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === input.surfaceId)
    if (!surface) throw new Error(`找不到表面：${input.surfaceId}`)
    const items = collectionItems(mutableLayerCollectionIn(draft, input))
    const item = items.find((candidate) => candidate.layerItemId === input.layerItemId)
    if (!item) throw new Error(`找不到图层：${input.layerItemId}`)
    const localItems = surface.type === 'slide'
      ? surface.scenes.find((scene) => scene.id === input.sceneId)?.layerItems ?? []
      : surface.type === 'spatial-2d'
        ? surface.world.layerItems
        : []
    const effective = [
      ...draft.globalLayerItems.map((entry) => entry.item),
      ...surface.surfaceLayerItems.map((entry) => entry.item),
      ...localItems,
    ]
      .filter((candidate) => candidate.layerItemId !== item.layerItemId)
      .sort((left, right) => left.order - right.order || left.layerItemId.localeCompare(right.layerItemId))
    const destination = Math.max(0, Math.min(input.toIndex, effective.length))
    const desiredOrder = effective[destination]?.order ?? (maximumProjectLayerOrder(draft) + 1)
    shiftProjectLayerOrders(draft, desiredOrder, 1, item.layerItemId)
    item.order = desiredOrder
    sortAllLayerLists(draft)
  }, now)
}

function allProjectLayerItems(project: CourseProjectDocument): LayerItem[] {
  const items = [
    ...project.globalLayerItems.map((entry) => entry.item),
  ]
  project.surfaces.forEach((surface) => {
    items.push(...surface.surfaceLayerItems.map((entry) => entry.item))
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene) => items.push(...scene.layerItems))
    } else if (surface.type === 'spatial-2d') {
      items.push(...surface.world.layerItems)
    }
  })
  return items
}

function maximumProjectLayerOrder(project: CourseProjectDocument): number {
  return Math.max(-1, ...allProjectLayerItems(project).map((item) => item.order))
}

function shiftProjectLayerOrders(
  project: CourseProjectDocument,
  fromInclusive: number,
  delta: number,
  exceptLayerItemId?: string,
): void {
  allProjectLayerItems(project).forEach((item) => {
    if (item.layerItemId !== exceptLayerItemId && item.order >= fromInclusive) {
      item.order += delta
    }
  })
}

function sortAllLayerLists(project: CourseProjectDocument): void {
  const sort = <T extends LayerItem>(items: T[]) => items.sort((left, right) =>
    left.order - right.order || left.layerItemId.localeCompare(right.layerItemId),
  )
  project.globalLayerItems.sort((left, right) =>
    left.item.order - right.item.order || left.item.layerItemId.localeCompare(right.item.layerItemId),
  )
  project.surfaces.forEach((surface) => {
    surface.surfaceLayerItems.sort((left, right) =>
      left.item.order - right.item.order || left.item.layerItemId.localeCompare(right.item.layerItemId),
    )
    if (surface.type === 'slide') surface.scenes.forEach((scene) => sort(scene.layerItems))
    else if (surface.type === 'spatial-2d') sort(surface.world.layerItems)
  })
}

function reserveTopAuthoringOrder(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId?: string,
): number {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface) throw new Error(`找不到表面：${surfaceId}`)
  const localItems = surface.type === 'slide'
    ? surface.scenes.find((scene) => scene.id === sceneId)?.layerItems ?? []
    : surface.type === 'spatial-2d'
      ? surface.world.layerItems
      : []
  const effective = [
    ...project.globalLayerItems.map((entry) => entry.item),
    ...surface.surfaceLayerItems.map((entry) => entry.item),
    ...localItems,
  ]
  const controllerOrder = Math.min(
    Number.POSITIVE_INFINITY,
    ...effective
      .filter((item) => item.kind === 'native' && item.content.nativeType === 'teacher-controller')
      .map((item) => item.order),
  )
  const order = Number.isFinite(controllerOrder)
    ? controllerOrder
    : Math.max(-1, ...effective.map((item) => item.order)) + 1
  shiftProjectLayerOrders(project, order, 1)
  return order
}

function decodePointerSegment(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}

function resolvePointer(document: unknown, pointer: string): { parent: Record<string, unknown> | unknown[]; key: string } {
  if (!pointer.startsWith('/') || pointer === '/') throw new Error('无效的作者路径')
  const segments = pointer.slice(1).split('/').map(decodePointerSegment)
  if (segments.some((segment) => ['__proto__', 'prototype', 'constructor'].includes(segment))) {
    throw new Error('作者路径包含不允许的字段')
  }
  let current = document as Record<string, unknown> | unknown[]
  for (const segment of segments.slice(0, -1)) {
    if (current === null || typeof current !== 'object' || !(segment in current)) {
      throw new Error('作者目标已失效')
    }
    current = (current as Record<string, unknown>)[segment] as Record<string, unknown> | unknown[]
  }
  const key = segments.at(-1)!
  if (current === null || typeof current !== 'object' || !(key in current)) {
    throw new Error('作者字段已失效')
  }
  return { parent: current, key }
}

function canonical(value: unknown): string {
  return JSON.stringify(value)
}

/** Revision-protected Project transaction used by both the editor and AI bridge. */
export function applyCourseAuthoringPatch(
  project: CourseProjectDocument,
  patch: CourseAuthoringPatch,
  now?: string,
): CourseProjectDocument {
  if (patch.op !== 'replace') throw new Error('仅支持 replace Patch')
  if (patch.expectedRevision !== project.revision) {
    throw new CourseRevisionConflictError(patch.expectedRevision, project.revision)
  }
  const inventory = deriveCourseProjectAuthoringInventorySnapshot(project)
  const entry = inventory.entries[patch.authoringAddress]
  if (!entry) throw new Error('作者地址不属于当前工程或已失效')
  return cloneAndCommit(project, (draft) => {
    const { parent, key } = resolvePointer(draft, entry.jsonPointer)
    const record = parent as Record<string, unknown>
    if ('expectedValue' in patch && canonical(record[key]) !== canonical(patch.expectedValue)) {
      throw new Error('目标字段在点选后已被修改')
    }
    record[key] = structuredClone(patch.value)
  }, now)
}

export interface CourseHistoryState {
  present: CourseProjectDocument
  past: CourseProjectDocument[]
  future: CourseProjectDocument[]
}

export function createCourseHistory(project: CourseProjectDocument): CourseHistoryState {
  return { present: project, past: [], future: [] }
}

export function commitCourseHistory(
  history: CourseHistoryState,
  next: CourseProjectDocument,
  limit = 100,
): CourseHistoryState {
  return {
    present: next,
    past: [...history.past, history.present].slice(-limit),
    future: [],
  }
}

export function undoCourseHistory(history: CourseHistoryState): CourseHistoryState {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    present: previous,
    past: history.past.slice(0, -1),
    future: [history.present, ...history.future],
  }
}

export function redoCourseHistory(history: CourseHistoryState): CourseHistoryState {
  const next = history.future[0]
  if (!next) return history
  return {
    present: next,
    past: [...history.past, history.present],
    future: history.future.slice(1),
  }
}
