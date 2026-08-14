import {
  assertPlainObject,
  assertStableId,
  cloneJson,
  deepFreeze,
} from './common.mjs'
import { validateCourseProject } from './semantic-sdk.mjs'

export const PRODUCT_COURSE_PROJECT_SCHEMA_VERSION = 9
export const PRODUCT_COMPILER_ID = 'courseware.agent-kit/input-to-course-project-v9@1'
const FIXED_TIMESTAMP = '2000-01-01T00:00:00.000Z'

const DEFAULT_TEXT_STYLE = Object.freeze({
  fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
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
})

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function boolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function string(value, fallback) {
  return typeof value === 'string' ? value : fallback
}

function geometry(item, fallback = { width: 400, height: 100 }) {
  const source = item.geometry ?? {}
  return {
    mode: 'absolute',
    x: finite(source.x, 0),
    y: finite(source.y, 0),
    width: Math.max(1, finite(source.width, fallback.width)),
    height: Math.max(1, finite(source.height, fallback.height)),
  }
}

function layerBase(item, order, fallback) {
  const layer = item.layer ?? {}
  return {
    layerItemId: assertStableId(item.id, 'item.id'),
    label: string(item.data?.label, item.id),
    frame: geometry(item, fallback),
    order,
    visible: boolean(layer.visible, true),
    locked: boolean(layer.locked, false),
    rotation: finite(layer.rotation, 0),
    opacity: Math.max(0, Math.min(1, finite(layer.opacity, 1))),
    hitPolicy: ['auto', 'surface', 'pass-through'].includes(layer.hitPolicy)
      ? layer.hitPolicy
      : 'auto',
    playbackInitialVisibility: layer.playbackInitialVisibility === 'hidden'
      ? 'hidden'
      : 'inherit',
  }
}

function textLayer(item, order) {
  return {
    ...layerBase(item, order, { width: 400, height: 100 }),
    kind: 'native',
    content: {
      nativeType: 'text',
      data: {
        text: string(item.data.text, ''),
        runs: [],
        style: { ...DEFAULT_TEXT_STYLE },
      },
    },
  }
}

function formulaLayer(item, order) {
  const latex = string(item.data.latex, '')
  return {
    ...layerBase(item, order, { width: 420, height: 160 }),
    kind: 'native',
    content: {
      nativeType: 'formula',
      data: {
        formulaId: string(item.data.formulaId, item.id),
        accessibleText: string(item.data.accessibleText, latex),
        // The semantic SDK does not pretend to parse LaTeX. Until a selected
        // capability supplies a FormulaAst, the exact authored string remains
        // one product token and is still editable/accessibility-visible.
        ast: cloneJson(item.data.ast ?? { type: 'token', value: latex }),
        style: {
          fontSize: Math.max(1, finite(item.data.fontSize, 48)),
          color: string(item.data.color, '#1f2937'),
          align: ['left', 'center', 'right'].includes(item.data.align)
            ? item.data.align
            : 'center',
        },
      },
    },
  }
}

function imageLayer(item, order) {
  return {
    ...layerBase(item, order, { width: 480, height: 320 }),
    kind: 'native',
    content: {
      nativeType: 'image',
      data: {
        assetId: assertStableId(item.data.assetId, `${item.id}.assetId`),
        preserveAspectRatio: true,
        fit: 'contain',
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        cropX: 0.5,
        cropY: 0.5,
        flipX: false,
        flipY: false,
        cornerRadius: 0,
        // Product V9 uses an explicit geometric feather mask. `uniform` was a
        // pre-V9 authoring value and makes an otherwise valid native image fail
        // the authority schema.
        feather: { amount: 0, mode: 'rectangle' },
        safeAreas: [],
      },
    },
  }
}

function videoLayer(item, order) {
  return {
    ...layerBase(item, order, { width: 640, height: 360 }),
    kind: 'native',
    content: {
      nativeType: 'video',
      data: {
        assetId: assertStableId(item.data.assetId, `${item.id}.assetId`),
        fit: 'contain',
        autoplay: false,
        loop: false,
        muted: false,
        volume: 1,
        playbackRate: 1,
        showControls: true,
        clickToToggle: true,
        startTime: 0,
        endTime: null,
        poster: { mode: 'video-frame', time: 0 },
        backgroundAudioMode: 'duck',
      },
    },
  }
}

function shapeLayer(item, order) {
  return {
    ...layerBase(item, order, { width: 320, height: 180 }),
    kind: 'native',
    content: {
      nativeType: 'shape',
      data: {
        shapeType: string(item.data.shapeType, 'rectangle'),
        style: {
          fillColor: string(item.data.fillColor, '#dbeafe'),
          fillOpacity: 1,
          borderColor: string(item.data.borderColor, '#2563eb'),
          borderOpacity: 1,
          borderWidth: 0,
          lineStyle: 'solid',
          cornerRadius: 0,
          startArrow: 'none',
          endArrow: 'none',
        },
      },
    },
  }
}

function resolvedDynamic(item, order, options, componentPackages) {
  if (typeof options.resolveDynamic !== 'function') {
    throw new Error(`dynamic item ${item.id} requires resolveDynamic(module,item)`)
  }
  const resolved = options.resolveDynamic(item.module, cloneJson(item))
  assertPlainObject(resolved, `resolved dynamic item ${item.id}`)
  if (resolved.kind === 'runtime') {
    assertPlainObject(resolved.runtime, `${item.id}.runtime`)
    return {
      ...layerBase(item, order, { width: 640, height: 360 }),
      kind: 'runtime',
      runtime: cloneJson(resolved.runtime),
    }
  }
  if (resolved.kind === 'component') {
    assertPlainObject(resolved.component, `${item.id}.component`)
    assertPlainObject(resolved.packageMetadata, `${item.id}.packageMetadata`)
    const packageId = assertStableId(resolved.component.packageId, `${item.id}.component.packageId`)
    if (resolved.packageMetadata.packageId !== packageId) {
      throw new Error(`dynamic item ${item.id} component metadata identity mismatch`)
    }
    componentPackages[packageId] = cloneJson(resolved.packageMetadata)
    return {
      ...layerBase(item, order, { width: 640, height: 360 }),
      kind: 'component',
      component: cloneJson(resolved.component),
      props: cloneJson(resolved.props ?? item.data.props ?? {}),
      ...(resolved.staticFallbackAssetId
        ? { staticFallbackAssetId: resolved.staticFallbackAssetId }
        : {}),
    }
  }
  throw new Error(`dynamic item ${item.id} resolver must return product kind runtime or component`)
}

function toLayer(item, order, options, componentPackages) {
  if (item.kind === 'text') return textLayer(item, order)
  if (item.kind === 'formula') return formulaLayer(item, order)
  if (item.kind === 'image') return imageLayer(item, order)
  if (item.kind === 'video') return videoLayer(item, order)
  if (item.kind === 'shape') return shapeLayer(item, order)
  return resolvedDynamic(item, order, options, componentPackages)
}

function visibility(item) {
  const candidate = item.data?.visibility
  if (candidate?.mode === 'include' || candidate?.mode === 'exclude') {
    return { mode: candidate.mode, locationIds: cloneJson(candidate.locationIds ?? []) }
  }
  return { mode: 'all', locationIds: [] }
}

function slideSurface(surface, options, componentPackages, locations) {
  const scenes = surface.scenes.map((scene) => {
    const locationId = `${surface.id}:${scene.id}`
    locations.push({
      id: locationId,
      label: scene.name,
      kind: 'slide-scene',
      surfaceId: surface.id,
      sceneId: scene.id,
    })
    return {
      id: scene.id,
      name: scene.name,
      backgroundColor: string(scene.data?.backgroundColor, '#ffffff'),
      backgroundAssetId: scene.data?.backgroundAssetId ?? null,
      layerItems: scene.items.map((item, index) => toLayer(item, index, options, componentPackages)),
      interactions: [],
    }
  })
  if (scenes.length === 0) throw new Error(`slide surface ${surface.id} requires at least one scene`)
  return {
    id: surface.id,
    title: string(surface.data?.title, surface.id),
    type: 'slide',
    surfaceLayerItems: [],
    canvas: { width: 1280, height: 720 },
    scenes,
  }
}

function flowBlock(item, options, componentPackages) {
  if (item.kind === 'text') return { id: item.id, type: 'paragraph', text: string(item.data.text, '') }
  if (item.kind === 'formula') {
    const latex = string(item.data.latex, '')
    return {
      id: item.id,
      type: 'formula',
      formulaId: string(item.data.formulaId, item.id),
      accessibleText: string(item.data.accessibleText, latex),
      ast: cloneJson(item.data.ast ?? { type: 'token', value: latex }),
    }
  }
  if (item.kind === 'image' || item.kind === 'video') {
    return {
      id: item.id,
      type: 'media',
      assetId: assertStableId(item.data.assetId, `${item.id}.assetId`),
      mediaKind: item.kind === 'image' ? 'image' : 'video',
      ...(typeof item.data.altText === 'string' ? { altText: item.data.altText } : {}),
      ...(typeof item.data.caption === 'string' ? { caption: item.data.caption } : {}),
      layout: 'content-width',
    }
  }
  if (item.kind === 'dynamic-module') {
    const layer = resolvedDynamic(item, 0, options, componentPackages)
    if (layer.kind !== 'component' || !layer.staticFallbackAssetId) {
      throw new Error(`Flow dynamic item ${item.id} must resolve to a component with staticFallbackAssetId`)
    }
    return {
      id: item.id,
      type: 'component',
      component: layer.component,
      props: layer.props,
      staticFallbackAssetId: layer.staticFallbackAssetId,
    }
  }
  throw new Error(`Flow surface cannot compile semantic ${item.kind} item ${item.id}`)
}

function flowSurface(surface, options, componentPackages, locations) {
  const items = surface.scenes.flatMap((scene) => scene.items)
  if (items.length === 0) throw new Error(`flow surface ${surface.id} requires at least one item`)
  const blocks = items.map((item) => flowBlock(item, options, componentPackages))
  for (const block of blocks) {
    locations.push({
      id: `${surface.id}:${block.id}`,
      label: block.id,
      kind: 'flow-block',
      surfaceId: surface.id,
      blockId: block.id,
    })
  }
  return {
    id: surface.id,
    title: string(surface.data?.title, surface.id),
    type: 'flow',
    surfaceLayerItems: [],
    layout: {
      readingWidth: Math.max(320, finite(surface.data?.readingWidth, 760)),
      wideContentWidth: Math.max(320, finite(surface.data?.wideContentWidth, 1120)),
    },
    blocks,
  }
}

function spatialSurface(surface, options, componentPackages, locations) {
  const items = surface.scenes.flatMap((scene) => scene.items)
  if (items.length === 0) throw new Error(`spatial surface ${surface.id} requires at least one item`)
  const cameraFrameId = `${surface.id}:home`
  locations.push({
    id: cameraFrameId,
    label: surface.id,
    kind: 'spatial-camera',
    surfaceId: surface.id,
    cameraFrameId,
  })
  return {
    id: surface.id,
    title: string(surface.data?.title, surface.id),
    type: 'spatial-2d',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'infinite' },
      layerItems: items.map((item, index) => toLayer(item, index, options, componentPackages)),
    },
    camera: {
      home: { x: 0, y: 0, zoom: 1 },
      frames: [{ id: cameraFrameId, name: surface.id, x: 0, y: 0, zoom: 1 }],
    },
    relations: [],
    semanticZoom: [],
  }
}

function teacherController(order) {
  return {
    item: {
      layerItemId: 'teacher-controller',
      label: '教师控制器',
      frame: { mode: 'absolute', x: 190, y: 638, width: 900, height: 64 },
      order,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      kind: 'native',
      content: {
        nativeType: 'teacher-controller',
        data: {
          title: '教师控制台',
          showSceneProgress: true,
          compact: false,
          collapsible: true,
          defaultCollapsed: false,
          buttons: [
            { id: 'teacher-prev', action: { type: 'scene.previous' }, label: '上一场景', visible: true },
            { id: 'teacher-next', action: { type: 'scene.next' }, label: '下一场景', visible: true },
            { id: 'teacher-picker', action: { type: 'scene.open-picker' }, label: '场景目录', visible: true },
            { id: 'teacher-replay', action: { type: 'scene.replay' }, label: '重播', visible: true },
            { id: 'teacher-restart', action: { type: 'course.restart' }, label: '重新开始', visible: false },
            { id: 'teacher-mute', action: { type: 'audio.toggle-mute' }, label: '声音', visible: true },
            { id: 'teacher-fullscreen', action: { type: 'player.fullscreen.toggle' }, label: '全屏', visible: true },
          ],
          style: {
            backgroundColor: '#172033',
            backgroundOpacity: 0.94,
            accentColor: '#e7b85c',
            textColor: '#f8fafc',
            cornerRadius: 16,
          },
          includeInStaticExports: false,
        },
      },
    },
    visibility: { mode: 'all', locationIds: [] },
  }
}

function normalizeAsset(asset, recordKey) {
  assertPlainObject(asset, `asset ${recordKey}`)
  const id = assertStableId(asset.id ?? recordKey, `asset ${recordKey}.id`)
  if (id !== recordKey) throw new Error(`asset record key ${recordKey} must equal asset.id`)
  const mimeType = string(asset.mimeType, '')
  if (!mimeType) throw new Error(`asset ${id} requires mimeType`)
  const kind = asset.kind ?? (
    mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('video/') ? 'video' : 'image'
  )
  if (!['image', 'audio', 'video'].includes(kind)) {
    throw new Error(`asset ${id} has unsupported product kind ${kind}`)
  }
  const path = string(asset.path, '')
  if (!path || /^(?:[A-Za-z]:[\\/]|[\\/]{2}|\/)/.test(path)) {
    throw new Error(`asset ${id} requires a project-relative path`)
  }
  const byteLength = asset.byteLength
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error(`asset ${id} requires a non-negative byteLength`)
  }
  return {
    id,
    filename: string(asset.filename, id),
    mimeType,
    kind,
    path,
    byteLength,
    ...(typeof asset.width === 'number' ? { width: asset.width } : {}),
    ...(typeof asset.height === 'number' ? { height: asset.height } : {}),
    ...(typeof asset.duration === 'number' ? { duration: asset.duration } : {}),
  }
}

function printPlan(surfaces) {
  if (surfaces.length < 2) return undefined
  return {
    pageSize: 'surface-native',
    orientation: 'auto',
    entries: surfaces.map((surface) => {
      if (surface.type === 'slide') return {
        id: `print:${surface.id}`,
        kind: 'slide-scenes',
        surfaceId: surface.id,
        sceneIds: surface.scenes.map((scene) => scene.id),
      }
      if (surface.type === 'flow') return {
        id: `print:${surface.id}`,
        kind: 'flow-document',
        surfaceId: surface.id,
      }
      return {
        id: `print:${surface.id}`,
        kind: 'spatial-frames',
        surfaceId: surface.id,
        cameraFrameIds: surface.camera.frames.map((frame) => frame.id),
      }
    }),
  }
}

/**
 * The only Agent Kit semantic-input -> product adapter. It returns the actual
 * CourseProject V9 document shape; callers should pass it to the product Zod
 * schema and archive writer, never to another Agent Kit-defined schema.
 */
export function compileCourseProjectV9(input, options = {}) {
  const report = validateCourseProject(input)
  if (!report.valid) throw new TypeError(report.errors.join('; '))
  const componentPackages = cloneJson(options.componentPackages ?? {})
  const locations = []
  const surfaces = input.surfaces.map((surface) => {
    if (surface.kind === 'slide') return slideSurface(surface, options, componentPackages, locations)
    if (surface.kind === 'flow') return flowSurface(surface, options, componentPackages, locations)
    return spatialSurface(surface, options, componentPackages, locations)
  })
  if (surfaces.length === 0 || locations.length === 0) {
    throw new Error('Course Project V9 requires at least one non-empty surface')
  }
  const project = {
    schemaVersion: PRODUCT_COURSE_PROJECT_SCHEMA_VERSION,
    id: input.id,
    revision: 0,
    title: input.title,
    createdAt: options.timestamp ?? FIXED_TIMESTAMP,
    updatedAt: options.timestamp ?? FIXED_TIMESTAMP,
    assets: Object.fromEntries(Object.entries(input.assets).map(([key, asset]) => [
      key,
      normalizeAsset(asset, key),
    ])),
    componentPackages,
    designTokens: {
      fonts: cloneJson(input.theme.fonts ?? [{
        id: 'body', label: '正文', fontFamily: DEFAULT_TEXT_STYLE.fontFamily,
      }]),
      colors: cloneJson(input.theme.colors ?? [
        { id: 'background', label: '背景', color: '#ffffff' },
        { id: 'text', label: '正文', color: '#1f2937' },
        { id: 'accent', label: '强调', color: '#2563eb' },
      ]),
    },
    media: {
      audio: {
        defaultMuted: false,
        masterVolume: 1,
        channelVolumes: { music: 1, narration: 1, sfx: 1, ui: 1, video: 1 },
        sounds: {},
        narrationDucking: { enabled: true, musicVolume: 0.3, fadeMs: 250 },
      },
    },
    playback: {
      controls: 'canvas',
      keyboardNavigation: true,
      presenter: { enabled: true, strategy: 'scene-navigation', additionalBindings: [] },
    },
    courseState: [],
    navigationGuards: [],
    locations,
    startLocationId: locations[0].id,
    // Use a sparse high order so the one controller remains above all normal
    // generated items while retaining one shared order fact across scopes.
    globalLayerItems: [teacherController(1_000_000)],
    globalInteractions: [],
    surfaces,
    ...(printPlan(surfaces) ? { mixedPrintPlan: printPlan(surfaces) } : {}),
  }
  return deepFreeze(project)
}
