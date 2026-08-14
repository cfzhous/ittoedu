import type {
  FormulaNode,
  ImageNode,
  ShapeNode,
  ShapeType,
  TeacherControllerNode,
  TextNode,
  VideoNode,
} from '../../src/shared/projectTypes'

const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif'

type TextOptions = Partial<Omit<TextNode, 'type' | 'style'>> & {
  style?: Partial<TextNode['style']>
}

export function textNode(options: TextOptions = {}): TextNode {
  return {
    id: options.id ?? 'fixture-text',
    name: options.name ?? '文本',
    type: 'text',
    x: options.x ?? 440,
    y: options.y ?? 320,
    width: options.width ?? 400,
    height: options.height ?? 80,
    rotation: options.rotation ?? 0,
    opacity: options.opacity ?? 1,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    playbackInitialVisibility: options.playbackInitialVisibility ?? 'inherit',
    text: options.text ?? '双击编辑文字',
    runs: structuredClone(options.runs ?? []),
    style: {
      fontFamily: options.style?.fontFamily ?? FONT,
      fontSize: options.style?.fontSize ?? 42,
      color: options.style?.color ?? '#1f2937',
      bold: options.style?.bold ?? false,
      italic: options.style?.italic ?? false,
      underline: options.style?.underline ?? false,
      strike: options.style?.strike ?? false,
      emphasis: options.style?.emphasis ?? false,
      highlightColor: options.style?.highlightColor ?? null,
      align: options.style?.align ?? 'left',
      verticalAlign: options.style?.verticalAlign ?? 'top',
      writingMode: options.style?.writingMode ?? 'horizontal',
      lineSpacing: options.style?.lineSpacing ?? 6,
      letterSpacing: options.style?.letterSpacing ?? 0,
      padding: options.style?.padding ?? 0,
      overflow: options.style?.overflow ?? 'auto-height',
      backgroundColor: options.style?.backgroundColor ?? '#ffffff',
      backgroundOpacity: options.style?.backgroundOpacity ?? 0,
      cornerRadius: options.style?.cornerRadius ?? 0,
    },
  }
}

type FormulaOptions = Partial<Omit<FormulaNode, 'type' | 'style'>> & {
  style?: Partial<FormulaNode['style']>
}

export function formulaNode(options: FormulaOptions = {}): FormulaNode {
  const id = options.id ?? 'fixture-formula'
  return {
    id,
    name: options.name ?? '公式',
    type: 'formula',
    x: options.x ?? 430,
    y: options.y ?? 280,
    width: options.width ?? 420,
    height: options.height ?? 160,
    rotation: options.rotation ?? 0,
    opacity: options.opacity ?? 1,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    playbackInitialVisibility: options.playbackInitialVisibility ?? 'inherit',
    formulaId: options.formulaId ?? `formula:${id}`,
    accessibleText: options.accessibleText ?? 'x 的平方加二分之一',
    ast: structuredClone(options.ast ?? {
      type: 'script',
      base: { type: 'token', value: 'x' },
      superscript: { type: 'token', value: '2' },
    }),
    style: {
      fontSize: options.style?.fontSize ?? 48,
      color: options.style?.color ?? '#1f2937',
      align: options.style?.align ?? 'center',
    },
  }
}

type ImageOptions = Partial<Omit<ImageNode, 'type' | 'assetId'>> & {
  assetId: string
}

export function imageNode(options: ImageOptions): ImageNode {
  return {
    id: options.id ?? 'fixture-image',
    name: options.name ?? '图片',
    type: 'image',
    x: options.x ?? 480,
    y: options.y ?? 270,
    width: options.width ?? 320,
    height: options.height ?? 180,
    rotation: options.rotation ?? 0,
    opacity: options.opacity ?? 1,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    playbackInitialVisibility: options.playbackInitialVisibility ?? 'inherit',
    assetId: options.assetId,
    preserveAspectRatio: options.preserveAspectRatio ?? true,
    fit: options.fit ?? 'contain',
    crop: structuredClone(options.crop ?? { left: 0, top: 0, right: 0, bottom: 0 }),
    cropX: options.cropX ?? 0.5,
    cropY: options.cropY ?? 0.5,
    flipX: options.flipX ?? false,
    flipY: options.flipY ?? false,
    cornerRadius: options.cornerRadius ?? 0,
    feather: structuredClone(options.feather ?? { amount: 0, mode: 'rectangle' }),
    safeAreas: structuredClone(options.safeAreas ?? []),
  }
}

type VideoOptions = Partial<Omit<VideoNode, 'type' | 'assetId' | 'poster'>> & {
  assetId: string
  poster?: Partial<VideoNode['poster']>
}

export function videoNode(options: VideoOptions): VideoNode {
  return {
    id: options.id ?? 'fixture-video',
    name: options.name ?? '视频',
    type: 'video',
    x: options.x ?? 320,
    y: options.y ?? 180,
    width: options.width ?? 640,
    height: options.height ?? 360,
    rotation: options.rotation ?? 0,
    opacity: options.opacity ?? 1,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    playbackInitialVisibility: options.playbackInitialVisibility ?? 'inherit',
    assetId: options.assetId,
    fit: options.fit ?? 'contain',
    autoplay: options.autoplay ?? false,
    loop: options.loop ?? false,
    muted: options.muted ?? false,
    volume: options.volume ?? 1,
    playbackRate: options.playbackRate ?? 1,
    showControls: options.showControls ?? true,
    clickToToggle: options.clickToToggle ?? true,
    startTime: options.startTime ?? 0,
    endTime: options.endTime ?? null,
    poster: {
      mode: options.poster?.mode ?? 'video-frame',
      time: options.poster?.time ?? 0,
      ...(options.poster?.assetId ? { assetId: options.poster.assetId } : {}),
    },
    backgroundAudioMode: options.backgroundAudioMode ?? 'duck',
  }
}

type ShapeOptions = Partial<Omit<ShapeNode, 'type' | 'shapeType' | 'style'>> & {
  style?: Partial<ShapeNode['style']>
}

export function shapeNode(
  shapeType: ShapeType,
  options: ShapeOptions = {},
): ShapeNode {
  return {
    id: options.id ?? 'fixture-shape',
    name: options.name ?? '形状',
    type: 'shape',
    shapeType,
    x: options.x ?? 480,
    y: options.y ?? 270,
    width: options.width ?? 320,
    height: options.height ?? 180,
    rotation: options.rotation ?? 0,
    opacity: options.opacity ?? 1,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    playbackInitialVisibility: options.playbackInitialVisibility ?? 'inherit',
    style: {
      fillColor: options.style?.fillColor ?? '#dbeafe',
      fillOpacity: options.style?.fillOpacity ?? 1,
      borderColor: options.style?.borderColor ?? '#2563eb',
      borderOpacity: options.style?.borderOpacity ?? 1,
      borderWidth: options.style?.borderWidth ?? 0,
      lineStyle: options.style?.lineStyle ?? 'solid',
      cornerRadius: options.style?.cornerRadius ?? 0,
      startArrow: options.style?.startArrow ?? 'none',
      endArrow: options.style?.endArrow ?? 'none',
    },
  }
}

type TeacherControllerOptions = Partial<
  Omit<TeacherControllerNode, 'type' | 'buttons' | 'style'>
> & {
  buttons?: TeacherControllerNode['buttons']
  style?: Partial<TeacherControllerNode['style']>
}

export function teacherControllerNode(
  options: TeacherControllerOptions = {},
): TeacherControllerNode {
  return {
    id: options.id ?? 'fixture-teacher-controller',
    name: options.name ?? '教师控制器',
    type: 'teacher-controller',
    x: options.x ?? 190,
    y: options.y ?? 638,
    width: options.width ?? 900,
    height: options.height ?? 64,
    rotation: options.rotation ?? 0,
    opacity: options.opacity ?? 1,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    playbackInitialVisibility: options.playbackInitialVisibility ?? 'inherit',
    title: options.title ?? '教师控制台',
    showSceneProgress: options.showSceneProgress ?? true,
    compact: options.compact ?? false,
    collapsible: options.collapsible ?? true,
    defaultCollapsed: options.defaultCollapsed ?? false,
    buttons: structuredClone(options.buttons ?? [
      { id: 'previous', action: { type: 'scene.previous' }, label: '上一场景', visible: true },
      { id: 'next', action: { type: 'scene.next' }, label: '下一场景', visible: true },
      { id: 'picker', action: { type: 'scene.open-picker' }, label: '场景目录', visible: true },
      { id: 'replay', action: { type: 'scene.replay' }, label: '重播', visible: true },
      { id: 'mute', action: { type: 'audio.toggle-mute' }, label: '声音', visible: true },
    ]),
    style: {
      backgroundColor: options.style?.backgroundColor ?? '#172033',
      backgroundOpacity: options.style?.backgroundOpacity ?? 0.94,
      accentColor: options.style?.accentColor ?? '#e7b85c',
      textColor: options.style?.textColor ?? '#f8fafc',
      cornerRadius: options.style?.cornerRadius ?? 16,
    },
    includeInStaticExports: options.includeInStaticExports ?? false,
  }
}
