import { nanoid } from 'nanoid'
import { useEffect, useMemo, useState } from 'react'
import {
  isTerminalNavigationAction,
  type InteractionActionPayload,
  type InteractionActionStep,
  type InteractionCondition,
  type InteractionRule,
  type InteractionTrigger,
  type MotionDirection,
  type MotionEasing,
  type MotionEffect,
} from '../../shared/interactionTypes'
import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
  LayerItem,
  NativeElementContent,
  SlideSceneDocument,
  SlideSurfaceDocument,
} from '../../shared/courseProjectTypes'
import type { SoundDefinition } from '../../shared/projectTypes'

type SupportedTriggerType =
  | 'scene.enter'
  | 'presentation.enter'
  | 'node.click'
  | 'component.event'
  | 'runtime.event'
  | 'audio.ended'
  | 'video.started'
  | 'video.paused'
  | 'video.ended'
  | 'video.time'
  | 'node.activated'
  | 'animation.completed'
  | 'presenter.command'

type SupportedActionType =
  | 'node.enter'
  | 'node.exit'
  | 'presentation.set'
  | 'scene.go'
  | 'scene.previous'
  | 'scene.next'
  | 'scene.replay'
  | 'video.play'
  | 'video.pause'
  | 'video.restart'
  | 'video.stop'
  | 'video.toggle'
  | 'video.seek'
  | 'course.restart'
  | 'audio.play'
  | 'audio.pause'
  | 'audio.resume'
  | 'audio.stop'
  | 'audio.toggle-mute'

export interface V9InteractionLayerEntry {
  item: LayerItem
  source: 'scene' | 'world' | 'surface' | 'global'
}

export interface V9InteractionEditorProps {
  project: CourseProjectDocument
  surface: SlideSurfaceDocument
  scene: SlideSceneDocument
  layerEntries: readonly V9InteractionLayerEntry[]
  selectedLayerItemId: string | null
  disabled?: boolean
  onCommit(rules: InteractionRule[], message: string): void
}

export interface V9GlobalInteractionEditorProps {
  project: CourseProjectDocument
  activeSurface: CourseSurfaceDocument
  activeScene?: SlideSceneDocument
  layerEntries: readonly V9InteractionLayerEntry[]
  selectedLayerItemId: string | null
  disabled?: boolean
  onCommit(rules: InteractionRule[], message: string): void
}

interface SceneTarget {
  id: string
  label: string
}

interface EditorContext {
  selectedLayer: LayerItem | undefined
  layers: LayerItem[]
  videos: NativeVideoLayerItem[]
  playableEndedVideos: NativeVideoLayerItem[]
  states: NonNullable<SlideSceneDocument['presentation']>['states']
  scenes: SceneTarget[]
  sounds: SoundDefinition[]
  components: LayerItem[]
  runtimes: LayerItem[]
  actionTargets: Array<{ id: string; label: string }>
  ruleScope: 'scene' | 'global'
  hasPrevious: boolean
  hasNext: boolean
}

const SUPPORTED_TRIGGER_TYPES = new Set<InteractionTrigger['type']>([
  'scene.enter',
  'presentation.enter',
  'node.click',
  'component.event',
  'runtime.event',
  'audio.ended',
  'video.started',
  'video.paused',
  'video.ended',
  'video.time',
  'node.activated',
  'animation.completed',
  'presenter.command',
])

const SUPPORTED_ACTION_TYPES = new Set<InteractionActionPayload['type']>([
  'node.enter',
  'node.exit',
  'presentation.set',
  'scene.go',
  'scene.previous',
  'scene.next',
  'scene.replay',
  'video.play',
  'video.pause',
  'video.restart',
  'video.stop',
  'video.toggle',
  'video.seek',
  'course.restart',
  'audio.play',
  'audio.pause',
  'audio.resume',
  'audio.stop',
  'audio.toggle-mute',
])

const TRIGGER_OPTIONS: Array<{
  type: SupportedTriggerType
  label: string
  description: string
}> = [
  { type: 'scene.enter', label: '进入幻灯片场景时', description: '幻灯片场景开始呈现后执行。' },
  { type: 'presentation.enter', label: '进入保存画面时', description: '幻灯片切换到指定的保存画面后执行。' },
  { type: 'node.click', label: '点击所选图层时', description: '把当前画布选择记为稳定点击目标。' },
  { type: 'component.event', label: '互动组件发出消息时', description: '指定互动组件发出约定消息后执行。' },
  { type: 'runtime.event', label: '动态内容发出消息时', description: '动态内容发出约定消息后执行。' },
  { type: 'audio.ended', label: '声音播放结束时', description: '所选课程声音自然播放结束后执行。' },
  { type: 'video.started', label: '视频开始播放时', description: '指定视频开始播放后执行。' },
  { type: 'video.paused', label: '视频暂停时', description: '指定视频暂停后执行。' },
  { type: 'video.ended', label: '视频播放结束时', description: '仅适用于不会循环播放的原生视频。' },
  { type: 'video.time', label: '视频播放到指定时间时', description: '视频到达指定秒数后执行。' },
  { type: 'node.activated', label: '图层完成出现时', description: '指定图层完成出现动作后执行。' },
  { type: 'animation.completed', label: '指定动作完成时', description: '另一条互动中的指定动作完成后执行。' },
  { type: 'presenter.command', label: '教师发出翻页指令时', description: '教师按下向前或向后翻页后执行。' },
]

const COMMON_TRIGGER_TYPES = new Set<SupportedTriggerType>([
  'scene.enter',
  'node.click',
  'audio.ended',
  'video.ended',
  'video.time',
])

const ACTION_OPTIONS: Array<{
  type: SupportedActionType
  label: string
}> = [
  { type: 'node.enter', label: '显示图层' },
  { type: 'node.exit', label: '隐藏图层' },
  { type: 'presentation.set', label: '切换命名复核画面' },
  { type: 'scene.previous', label: '返回上一个课程位置' },
  { type: 'scene.next', label: '进入下一个课程位置' },
  { type: 'scene.replay', label: '重新播放当前位置' },
  { type: 'scene.go', label: '前往指定幻灯片场景' },
  { type: 'video.play', label: '播放视频' },
  { type: 'video.pause', label: '暂停视频' },
  { type: 'video.restart', label: '从头重播视频' },
  { type: 'video.stop', label: '停止视频' },
  { type: 'video.toggle', label: '播放或暂停视频' },
  { type: 'video.seek', label: '跳到视频指定时间' },
  { type: 'audio.play', label: '播放课程声音' },
  { type: 'audio.pause', label: '暂停课程声音' },
  { type: 'audio.resume', label: '继续课程声音' },
  { type: 'audio.stop', label: '停止课程声音' },
  { type: 'audio.toggle-mute', label: '静音或恢复课程声音' },
  { type: 'course.restart', label: '从头开始课程' },
]

const MOTION_EFFECTS: Array<{ value: MotionEffect; label: string }> = [
  { value: 'none', label: '立即' },
  { value: 'fade', label: '淡化' },
  { value: 'scale', label: '缩放' },
  { value: 'slide', label: '滑入或滑出' },
]

const MOTION_DIRECTIONS: Array<{ value: MotionDirection; label: string }> = [
  { value: 'left', label: '从左侧' },
  { value: 'right', label: '从右侧' },
  { value: 'up', label: '从上方' },
  { value: 'down', label: '从下方' },
]

const MOTION_EASINGS: Array<{ value: MotionEasing; label: string }> = [
  { value: 'linear', label: '匀速' },
  { value: 'ease-in', label: '逐渐加快' },
  { value: 'ease-out', label: '逐渐减慢' },
  { value: 'ease-in-out', label: '平滑加减速' },
]

const AUDIO_CHANNEL_LABELS: Record<SoundDefinition['channel'], string> = {
  music: '全部背景音乐',
  narration: '全部讲解与旁白',
  sfx: '全部互动音效',
  ui: '全部界面提示',
}

type NativeVideoLayerItem = Extract<LayerItem, { kind: 'native' }> & {
  content: Extract<NativeElementContent, { nativeType: 'video' }>
}

function isNativeVideo(item: LayerItem): item is NativeVideoLayerItem {
  return item.kind === 'native' && item.content.nativeType === 'video'
}

function actionTargetsForRules(rules: readonly InteractionRule[]): Array<{ id: string; label: string }> {
  return rules.flatMap((rule, ruleIndex) => rule.actions.map((step, stepIndex) => ({
    id: step.id,
    label: `${rule.name ?? `互动 ${ruleIndex + 1}`} · 第 ${stepIndex + 1} 步`,
  })))
}

function triggerUnavailableReason(
  type: SupportedTriggerType,
  context: EditorContext,
): string | undefined {
  if (type === 'node.click') {
    if (!context.selectedLayer) return '请先在画布或图层面板中选择一个图层。'
    if (context.selectedLayer.hitPolicy === 'pass-through') return '所选图层当前允许点击穿透，不能作为点击目标。'
  }
  if (type === 'presentation.enter' && context.states.length === 0) {
    return '当前课程还没有可定位的保存画面。'
  }
  if (type === 'component.event' && context.components.length === 0) {
    return '当前画布没有可定位的互动组件。'
  }
  if (type === 'runtime.event' && context.runtimes.length === 0) {
    return '当前画布没有可发送消息的动态内容。'
  }
  if (type === 'audio.ended' && context.sounds.length === 0) {
    return '请先在“课程声音”中导入声音。'
  }
  if ((type === 'video.started' || type === 'video.paused') && context.videos.length === 0) {
    return '当前画布没有可定位的原生视频。'
  }
  if (type === 'video.ended' && context.playableEndedVideos.length === 0) {
    return context.videos.length > 0
      ? '当前原生视频都设置为循环播放，不会自然产生“播放结束”。'
      : '当前场景没有可定位的原生视频。'
  }
  if (type === 'video.time' && context.videos.length === 0) {
    return '当前场景没有可定位的原生视频。'
  }
  if (type === 'node.activated' && context.layers.length === 0) {
    return '当前画布没有可定位的图层。'
  }
  if (type === 'animation.completed' && context.actionTargets.length === 0) {
    return '请先创建至少一条包含动作的互动。'
  }
  return undefined
}

function actionUnavailableReason(
  type: SupportedActionType,
  context: EditorContext,
): string | undefined {
  if (type === 'node.enter' || type === 'node.exit') {
    return context.layers.length === 0 ? '当前场景没有可定位的图层。' : undefined
  }
  if (type === 'presentation.set') {
    return context.states.length === 0 ? '当前场景还没有命名复核画面。' : undefined
  }
  if (type === 'scene.go') {
    return context.scenes.length === 0 ? '课程中没有可定位的幻灯片场景。' : undefined
  }
  if (type === 'scene.previous') {
    return context.hasPrevious ? undefined : '当前位置前面没有可导航内容。'
  }
  if (type === 'scene.next') {
    return context.hasNext ? undefined : '当前位置后面没有可导航内容。'
  }
  if (
    type === 'video.play' || type === 'video.pause' || type === 'video.restart' ||
    type === 'video.stop' || type === 'video.toggle' || type === 'video.seek'
  ) {
    return context.videos.length === 0 ? '当前场景没有可定位的原生视频。' : undefined
  }
  if (
    type === 'audio.play' || type === 'audio.pause' || type === 'audio.resume' ||
    type === 'audio.stop' || type === 'audio.toggle-mute'
  ) {
    return context.sounds.length === 0 ? '请先导入课程声音。' : undefined
  }
  return undefined
}

function defaultMotionAction(
  type: 'node.enter' | 'node.exit',
  nodeId: string,
): InteractionActionPayload {
  return {
    type,
    nodeId,
    effect: 'fade',
    durationMs: type === 'node.enter' ? 320 : 240,
    easing: type === 'node.enter' ? 'ease-out' : 'ease-in',
  }
}

function defaultAction(
  type: SupportedActionType,
  context: EditorContext,
  preferredVideoId?: string,
): InteractionActionPayload | null {
  if (actionUnavailableReason(type, context)) return null
  const preferredLayer = context.selectedLayer ?? context.layers[0]
  const video = context.videos.find((candidate) => candidate.layerItemId === preferredVideoId)
    ?? context.videos.find((candidate) => candidate.layerItemId === context.selectedLayer?.layerItemId)
    ?? context.videos[0]
  const sound = context.sounds[0]
  switch (type) {
    case 'node.enter': return preferredLayer ? defaultMotionAction(type, preferredLayer.layerItemId) : null
    case 'node.exit': return preferredLayer ? defaultMotionAction(type, preferredLayer.layerItemId) : null
    case 'presentation.set': return context.states[0] ? { type, stateId: context.states[0].id } : null
    case 'scene.go': return context.scenes[0] ? { type, sceneId: context.scenes[0].id } : null
    case 'scene.previous': return { type }
    case 'scene.next': return { type }
    case 'scene.replay': return { type }
    case 'video.play': return video ? { type, nodeId: video.layerItemId } : null
    case 'video.pause': return video ? { type, nodeId: video.layerItemId } : null
    case 'video.restart': return video ? { type, nodeId: video.layerItemId } : null
    case 'video.stop': return video ? { type, nodeId: video.layerItemId } : null
    case 'video.toggle': return video ? { type, nodeId: video.layerItemId } : null
    case 'video.seek': return video ? { type, nodeId: video.layerItemId, seconds: 5 } : null
    case 'audio.play': return sound ? { type, soundId: sound.id } : null
    case 'audio.pause': return sound ? { type, target: { kind: 'sound', soundId: sound.id } } : null
    case 'audio.resume': return sound ? { type, target: { kind: 'sound', soundId: sound.id } } : null
    case 'audio.stop': return sound ? { type, target: { kind: 'sound', soundId: sound.id } } : null
    case 'audio.toggle-mute': return sound ? { type, target: { kind: 'sound', soundId: sound.id } } : null
    case 'course.restart': return { type }
  }
}

function defaultActionForTrigger(
  trigger: InteractionTrigger,
  context: EditorContext,
): InteractionActionPayload | null {
  if (trigger.type === 'node.click' && context.selectedLayer) {
    return defaultMotionAction('node.exit', context.selectedLayer.layerItemId)
  }
  if (trigger.type === 'node.activated') {
    return defaultMotionAction('node.exit', trigger.nodeId)
  }
  if (trigger.type === 'video.time') {
    return defaultAction('video.pause', context, trigger.nodeId)
  }
  if (trigger.type === 'video.ended') {
    return defaultAction('scene.next', context)
      ?? defaultAction('video.restart', context, trigger.nodeId)
  }
  if (trigger.type === 'audio.ended') {
    return defaultAction('scene.next', context)
      ?? defaultAction('node.enter', context)
  }
  return defaultAction('node.enter', context)
    ?? defaultAction('presentation.set', context)
    ?? defaultAction('video.play', context)
    ?? defaultAction('scene.next', context)
    ?? defaultAction('scene.previous', context)
    ?? defaultAction('course.restart', context)
}

function createTrigger(
  type: SupportedTriggerType,
  context: EditorContext,
): InteractionTrigger | null {
  if (triggerUnavailableReason(type, context)) return null
  if (type === 'scene.enter') return { type }
  if (type === 'presentation.enter') {
    return context.states[0] ? { type, stateId: context.states[0].id } : null
  }
  if (type === 'node.click') {
    return context.selectedLayer ? { type, nodeId: context.selectedLayer.layerItemId } : null
  }
  if (type === 'component.event') {
    const component = context.components.find((item) => item.layerItemId === context.selectedLayer?.layerItemId)
      ?? context.components[0]
    return component ? { type, nodeId: component.layerItemId, eventName: '完成' } : null
  }
  if (type === 'runtime.event') {
    return { type, scope: context.ruleScope, eventName: '完成' }
  }
  if (type === 'audio.ended') {
    return context.sounds[0] ? { type, soundId: context.sounds[0].id } : null
  }
  if (type === 'node.activated') {
    const layer = context.selectedLayer ?? context.layers[0]
    return layer ? { type, nodeId: layer.layerItemId } : null
  }
  if (type === 'animation.completed') {
    return context.actionTargets[0] ? { type, actionId: context.actionTargets[0].id } : null
  }
  if (type === 'presenter.command') return { type, command: 'next' }
  const video = type === 'video.ended'
    ? context.playableEndedVideos[0]
    : context.videos.find((candidate) => candidate.layerItemId === context.selectedLayer?.layerItemId)
      ?? context.videos[0]
  if (!video) return null
  if (type === 'video.time') return { type, nodeId: video.layerItemId, seconds: 5 }
  if (type === 'video.started') return { type, nodeId: video.layerItemId }
  if (type === 'video.paused') return { type, nodeId: video.layerItemId }
  return { type: 'video.ended', nodeId: video.layerItemId }
}

function actionStep(action: InteractionActionPayload): InteractionActionStep {
  return {
    id: `action-${nanoid(10)}`,
    start: 'after-previous',
    delayMs: 0,
    action,
  }
}

function createRule(
  type: SupportedTriggerType,
  context: EditorContext,
): InteractionRule | null {
  const trigger = createTrigger(type, context)
  if (!trigger) return null
  const action = defaultActionForTrigger(trigger, context)
  if (!action) return null
  const label = TRIGGER_OPTIONS.find((candidate) => candidate.type === type)?.label ?? '新互动'
  return {
    id: `interaction-${nanoid(10)}`,
    name: label,
    enabled: true,
    trigger,
    conditions: [],
    actions: [actionStep(action)],
  }
}

function TriggerCreationGrid({
  context,
  rules,
  disabled,
  courseWide = false,
  onCommit,
}: {
  context: EditorContext
  rules: readonly InteractionRule[]
  disabled?: boolean
  courseWide?: boolean
  onCommit(rules: InteractionRule[], message: string): void
}) {
  const renderOption = (option: typeof TRIGGER_OPTIONS[number]) => {
    const reason = triggerUnavailableReason(option.type, context)
    const probe = reason ? null : createTrigger(option.type, context)
    const action = probe ? defaultActionForTrigger(probe, context) : null
    const disabledReason = reason ?? (!action ? '当前没有可用于首个动作的目标。' : undefined)
    return (
      <div className="v9-interaction-create__option" key={option.type}>
        <button
          type="button"
          disabled={disabled || Boolean(disabledReason)}
          aria-label={`${courseWide ? '添加课程互动' : '添加'}：${option.label}`}
          onClick={() => {
            const rule = createRule(option.type, context)
            if (rule) onCommit(
              [...rules, rule],
              `已添加${courseWide ? '课程' : ''}互动“${option.label}”`,
            )
          }}
        >{option.label}</button>
        <span>{disabledReason ?? option.description}</span>
      </div>
    )
  }
  const common = TRIGGER_OPTIONS.filter((option) => COMMON_TRIGGER_TYPES.has(option.type))
  const advanced = TRIGGER_OPTIONS.filter((option) => !COMMON_TRIGGER_TYPES.has(option.type))
  return (
    <>
      <div className="v9-interaction-create" role="group" aria-label={courseWide ? '添加贯穿课程的互动' : '添加互动规则'}>
        {common.map(renderOption)}
      </div>
      <details className="v9-interaction-create-more">
        <summary>更多触发时机</summary>
        <div className="v9-interaction-create">{advanced.map(renderOption)}</div>
      </details>
    </>
  )
}

function triggerSummary(trigger: InteractionTrigger, context: EditorContext): string {
  const layerName = (id: string) => context.layers.find((item) => item.layerItemId === id)?.label ?? '已失效图层'
  const soundName = (id: string) => context.sounds.find((sound) => sound.id === id)?.name ?? '已失效声音'
  switch (trigger.type) {
    case 'scene.enter': return '进入幻灯片场景时'
    case 'presentation.enter': return `进入保存画面“${context.states.find((state) => state.id === trigger.stateId)?.name ?? '已失效画面'}”时`
    case 'node.click': return `点击“${layerName(trigger.nodeId)}”时`
    case 'component.event': return `“${layerName(trigger.nodeId)}”发出“${trigger.eventName}”时`
    case 'runtime.event': return `动态内容发出“${trigger.eventName}”时`
    case 'audio.ended': return `“${soundName(trigger.soundId)}”播放结束时`
    case 'video.started': return `“${layerName(trigger.nodeId)}”开始播放时`
    case 'video.paused': return `“${layerName(trigger.nodeId)}”暂停时`
    case 'video.ended': return `“${layerName(trigger.nodeId)}”播放结束时`
    case 'video.time': return `“${layerName(trigger.nodeId)}”播放到 ${trigger.seconds} 秒时`
    case 'node.activated': return `“${layerName(trigger.nodeId)}”完成出现时`
    case 'animation.completed': return `“${context.actionTargets.find((target) => target.id === trigger.actionId)?.label ?? '已失效动作'}”完成时`
    case 'presenter.command': return `教师发出“${trigger.command === 'next' ? '向后翻页' : '向前翻页'}”指令时`
  }
}

function selectedOrMissingOption(
  value: string,
  values: readonly { id: string; label: string }[],
): React.ReactNode {
  return value && !values.some((candidate) => candidate.id === value)
    ? <option value={value}>原目标已不存在</option>
    : null
}

function CommitTextInput({
  value,
  disabled,
  ariaLabel,
  onCommit,
}: {
  value: string
  disabled?: boolean
  ariaLabel: string
  onCommit(value: string): void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const finish = () => {
    const next = draft.trim()
    if (next && next !== value) onCommit(next)
    else setDraft(value)
  }
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={draft}
      maxLength={80}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function CommitNumberInput({
  value,
  min,
  max,
  step,
  disabled,
  ariaLabel,
  onCommit,
}: {
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  ariaLabel: string
  onCommit(value: number): void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const finish = () => {
    const parsed = Number(draft)
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value
    if (next !== value) onCommit(next)
    setDraft(String(next))
  }
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(String(value))
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function targetOptions(items: readonly LayerItem[]): Array<{ id: string; label: string }> {
  return items.map((item) => ({ id: item.layerItemId, label: item.label }))
}

function TriggerFields({
  trigger,
  context,
  disabled,
  onChange,
}: {
  trigger: InteractionTrigger
  context: EditorContext
  disabled?: boolean
  onChange(trigger: InteractionTrigger): void
}) {
  const supported = SUPPORTED_TRIGGER_TYPES.has(trigger.type)
  const layers = targetOptions(context.layers)
  const videos = targetOptions(context.videos)
  const endedVideos = targetOptions(context.playableEndedVideos)
  const sounds = context.sounds.map((sound) => ({ id: sound.id, label: sound.name }))
  const components = targetOptions(context.components)
  return (
    <div className="v9-interaction-trigger-fields">
      <label>
        <span>触发时机</span>
        <select
          aria-label="触发时机"
          value={supported ? trigger.type : '__professional__'}
          disabled={disabled}
          onChange={(event) => {
            const next = createTrigger(event.currentTarget.value as SupportedTriggerType, context)
            if (next) onChange(next)
          }}
        >
          {!supported && <option value="__professional__">其他已保存的专业触发方式</option>}
          {TRIGGER_OPTIONS.map((option) => {
            const reason = triggerUnavailableReason(option.type, context)
            return (
              <option key={option.type} value={option.type} disabled={Boolean(reason)}>
                {option.label}{reason ? `（${reason}）` : ''}
              </option>
            )
          })}
        </select>
      </label>
      {trigger.type === 'presentation.enter' && (
        <label>
          <span>保存画面</span>
          <select
            aria-label="触发保存画面"
            value={trigger.stateId}
            disabled={disabled}
            onChange={(event) => onChange({ type: 'presentation.enter', stateId: event.currentTarget.value })}
          >
            {selectedOrMissingOption(trigger.stateId, context.states.map((state) => ({ id: state.id, label: state.name })))}
            {context.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
          </select>
        </label>
      )}
      {trigger.type === 'node.click' && (
        <label>
          <span>点击图层</span>
          <select
            aria-label="点击图层"
            value={trigger.nodeId}
            disabled={disabled}
            onChange={(event) => onChange({ type: 'node.click', nodeId: event.currentTarget.value })}
          >
            {selectedOrMissingOption(trigger.nodeId, layers)}
            {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}
          </select>
        </label>
      )}
      {trigger.type === 'audio.ended' && (
        <label>
          <span>课程声音</span>
          <select
            aria-label="触发声音"
            value={trigger.soundId}
            disabled={disabled}
            onChange={(event) => onChange({
              type: 'audio.ended',
              soundId: event.currentTarget.value,
            })}
          >
            {selectedOrMissingOption(trigger.soundId, sounds)}
            {sounds.map((sound) => <option key={sound.id} value={sound.id}>{sound.label}</option>)}
          </select>
        </label>
      )}
      {trigger.type === 'component.event' && (
        <>
          <label>
            <span>互动组件</span>
            <select
              aria-label="发出消息的互动组件"
              value={trigger.nodeId}
              disabled={disabled}
              onChange={(event) => onChange({ ...trigger, nodeId: event.currentTarget.value })}
            >
              {selectedOrMissingOption(trigger.nodeId, components)}
              {components.map((component) => <option key={component.id} value={component.id}>{component.label}</option>)}
            </select>
          </label>
          <label>
            <span>消息名称</span>
            <CommitTextInput
              ariaLabel="互动组件消息名称"
              value={trigger.eventName}
              disabled={disabled}
              onCommit={(eventName) => onChange({ ...trigger, eventName })}
            />
          </label>
        </>
      )}
      {trigger.type === 'runtime.event' && (
        <>
          <label>
            <span>消息范围</span>
            <select
              aria-label="动态内容消息范围"
              value={trigger.scope}
              disabled={disabled}
              onChange={(event) => onChange({ ...trigger, scope: event.currentTarget.value as 'scene' | 'global' })}
            >
              <option value="scene">当前幻灯片场景</option>
              <option value="global">整个课程</option>
            </select>
          </label>
          <label>
            <span>消息名称</span>
            <CommitTextInput
              ariaLabel="动态内容消息名称"
              value={trigger.eventName}
              disabled={disabled}
              onCommit={(eventName) => onChange({ ...trigger, eventName })}
            />
          </label>
        </>
      )}
      {(
        trigger.type === 'video.started' || trigger.type === 'video.paused' ||
        trigger.type === 'video.ended' || trigger.type === 'video.time'
      ) && (
        <label>
          <span>视频</span>
          <select
            aria-label="触发视频"
            value={trigger.nodeId}
            disabled={disabled}
            onChange={(event) => onChange({ ...trigger, nodeId: event.currentTarget.value })}
          >
            {selectedOrMissingOption(trigger.nodeId, trigger.type === 'video.ended' ? endedVideos : videos)}
            {(trigger.type === 'video.ended' ? context.playableEndedVideos : context.videos).map((video) => (
              <option key={video.layerItemId} value={video.layerItemId}>{video.label}</option>
            ))}
          </select>
        </label>
      )}
      {trigger.type === 'video.time' && (
        <label>
          <span>到达时间（秒）</span>
          <CommitNumberInput
            ariaLabel="触发时间（秒）"
            value={trigger.seconds}
            min={0}
            max={604800}
            step={0.1}
            disabled={disabled}
            onCommit={(seconds) => onChange({ ...trigger, seconds })}
          />
        </label>
      )}
      {trigger.type === 'node.activated' && (
        <label>
          <span>完成出现的图层</span>
          <select
            aria-label="完成出现的图层"
            value={trigger.nodeId}
            disabled={disabled}
            onChange={(event) => onChange({ ...trigger, nodeId: event.currentTarget.value })}
          >
            {selectedOrMissingOption(trigger.nodeId, layers)}
            {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}
          </select>
        </label>
      )}
      {trigger.type === 'animation.completed' && (
        <label>
          <span>完成的动作</span>
          <select
            aria-label="完成后触发的动作"
            value={trigger.actionId}
            disabled={disabled}
            onChange={(event) => onChange({ ...trigger, actionId: event.currentTarget.value })}
          >
            {selectedOrMissingOption(trigger.actionId, context.actionTargets)}
            {context.actionTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
        </label>
      )}
      {trigger.type === 'presenter.command' && (
        <label>
          <span>翻页方向</span>
          <select
            aria-label="教师翻页方向"
            value={trigger.command}
            disabled={disabled}
            onChange={(event) => onChange({ type: 'presenter.command', command: event.currentTarget.value as 'next' | 'previous' })}
          >
            <option value="next">向后翻页</option>
            <option value="previous">向前翻页</option>
          </select>
        </label>
      )}
    </div>
  )
}

function actionIsSupported(action: InteractionActionPayload): action is InteractionActionPayload & { type: SupportedActionType } {
  return SUPPORTED_ACTION_TYPES.has(action.type)
}

function ActionFields({
  action,
  context,
  disabled,
  onChange,
}: {
  action: InteractionActionPayload
  context: EditorContext
  disabled?: boolean
  onChange(action: InteractionActionPayload): void
}) {
  const layers = targetOptions(context.layers)
  const videos = targetOptions(context.videos)
  const sounds = context.sounds.map((sound) => ({ id: sound.id, label: sound.name }))
  if (action.type === 'node.enter' || action.type === 'node.exit') {
    return (
      <div className="v9-interaction-action-fields">
        <label>
          <span>目标图层</span>
          <select
            aria-label="动作目标图层"
            value={action.nodeId}
            disabled={disabled}
            onChange={(event) => onChange({ ...action, nodeId: event.currentTarget.value })}
          >
            {selectedOrMissingOption(action.nodeId, layers)}
            {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}
          </select>
        </label>
        <label>
          <span>呈现效果</span>
          <select
            aria-label="呈现效果"
            value={action.effect}
            disabled={disabled}
            onChange={(event) => {
              const effect = event.currentTarget.value as MotionEffect
              const { direction: _direction, ...base } = action
              onChange(effect === 'slide'
                ? { ...base, effect, direction: 'left' }
                : { ...base, effect })
            }}
          >
            {MOTION_EFFECTS.map((effect) => <option key={effect.value} value={effect.value}>{effect.label}</option>)}
          </select>
        </label>
        {action.effect === 'slide' && (
          <label>
            <span>移动方向</span>
            <select
              aria-label="移动方向"
              value={action.direction}
              disabled={disabled}
              onChange={(event) => onChange({ ...action, direction: event.currentTarget.value as MotionDirection })}
            >
              {MOTION_DIRECTIONS.map((direction) => <option key={direction.value} value={direction.value}>{direction.label}</option>)}
            </select>
          </label>
        )}
        <label>
          <span>动画时长（秒）</span>
          <CommitNumberInput
            ariaLabel="动画时长（秒）"
            value={action.durationMs / 1000}
            min={0}
            max={60}
            step={0.1}
            disabled={disabled || action.effect === 'none'}
            onCommit={(seconds) => onChange({ ...action, durationMs: seconds * 1000 })}
          />
        </label>
        <label>
          <span>速度变化</span>
          <select
            aria-label="速度变化"
            value={action.easing}
            disabled={disabled || action.effect === 'none'}
            onChange={(event) => onChange({ ...action, easing: event.currentTarget.value as MotionEasing })}
          >
            {MOTION_EASINGS.map((easing) => <option key={easing.value} value={easing.value}>{easing.label}</option>)}
          </select>
        </label>
      </div>
    )
  }
  if (action.type === 'presentation.set') {
    const states = context.states.map((state) => ({ id: state.id, label: state.name }))
    return (
      <label className="v9-interaction-action-target">
        <span>复核画面</span>
        <select
          aria-label="目标复核画面"
          value={action.stateId}
          disabled={disabled}
          onChange={(event) => onChange({ type: 'presentation.set', stateId: event.currentTarget.value })}
        >
          {selectedOrMissingOption(action.stateId, states)}
          {states.map((state) => <option key={state.id} value={state.id}>{state.label}</option>)}
        </select>
      </label>
    )
  }
  if (action.type === 'scene.go') {
    return (
      <label className="v9-interaction-action-target">
        <span>目标场景</span>
        <select
          aria-label="目标场景"
          value={action.sceneId}
          disabled={disabled}
          onChange={(event) => onChange({ type: 'scene.go', sceneId: event.currentTarget.value })}
        >
          {selectedOrMissingOption(action.sceneId, context.scenes)}
          {context.scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.label}</option>)}
        </select>
      </label>
    )
  }
  if (
    action.type === 'video.play' || action.type === 'video.pause' ||
    action.type === 'video.restart' || action.type === 'video.stop' ||
    action.type === 'video.toggle' || action.type === 'video.seek'
  ) {
    return (
      <div className="v9-interaction-action-fields">
        <label className="v9-interaction-action-target">
          <span>目标视频</span>
          <select
            aria-label="动作目标视频"
            value={action.nodeId}
            disabled={disabled}
            onChange={(event) => onChange({ ...action, nodeId: event.currentTarget.value })}
          >
            {selectedOrMissingOption(action.nodeId, videos)}
            {videos.map((video) => <option key={video.id} value={video.id}>{video.label}</option>)}
          </select>
        </label>
        {action.type === 'video.seek' && (
          <label>
            <span>跳到时间（秒）</span>
            <CommitNumberInput
              ariaLabel="视频跳到时间（秒）"
              value={action.seconds}
              min={0}
              max={604800}
              step={0.1}
              disabled={disabled}
              onCommit={(seconds) => onChange({ ...action, seconds })}
            />
          </label>
        )}
      </div>
    )
  }
  if (action.type === 'audio.play') {
    const sound = context.sounds.find((candidate) => candidate.id === action.soundId)
    return (
      <div className="v9-interaction-action-fields">
        <label className="v9-interaction-action-target">
          <span>课程声音</span>
          <select
            aria-label="动作目标声音"
            value={action.soundId}
            disabled={disabled}
            onChange={(event) => onChange({ ...action, soundId: event.currentTarget.value })}
          >
            {selectedOrMissingOption(action.soundId, sounds)}
            {sounds.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
          </select>
        </label>
        <label>
          <span>音量</span>
          <CommitNumberInput
            ariaLabel="播放声音音量"
            value={action.volume ?? sound?.defaultVolume ?? 1}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            onCommit={(volume) => onChange({ ...action, volume })}
          />
        </label>
        <label>
          <span>播放方式</span>
          <select
            aria-label="声音是否循环"
            value={(action.loop ?? sound?.defaultLoop ?? false) ? 'loop' : 'once'}
            disabled={disabled}
            onChange={(event) => onChange({ ...action, loop: event.currentTarget.value === 'loop' })}
          >
            <option value="once">播放一次</option>
            <option value="loop">循环播放</option>
          </select>
        </label>
        <label>
          <span>淡入时间（秒）</span>
          <CommitNumberInput
            ariaLabel="声音淡入时间（秒）"
            value={(action.fadeInMs ?? 0) / 1000}
            min={0}
            max={60}
            step={0.1}
            disabled={disabled}
            onCommit={(seconds) => onChange({ ...action, fadeInMs: seconds * 1000 })}
          />
        </label>
        <label>
          <span>切换内容后</span>
          <select
            aria-label="声音持续范围"
            value={action.lifetime ?? 'scene'}
            disabled={disabled}
            onChange={(event) => onChange({ ...action, lifetime: event.currentTarget.value as 'scene' | 'course' })}
          >
            <option value="scene">停止播放</option>
            <option value="course">继续播放</option>
          </select>
        </label>
        <label>
          <span>已经在播放时</span>
          <select
            aria-label="声音重复触发方式"
            value={action.ifPlaying ?? 'restart'}
            disabled={disabled}
            onChange={(event) => onChange({ ...action, ifPlaying: event.currentTarget.value as 'restart' | 'continue' | 'ignore' })}
          >
            <option value="restart">从头播放</option>
            <option value="continue">继续当前播放</option>
            <option value="ignore">不重复触发</option>
          </select>
        </label>
      </div>
    )
  }
  if (
    action.type === 'audio.pause' || action.type === 'audio.resume' ||
    action.type === 'audio.stop' || action.type === 'audio.toggle-mute'
  ) {
    const targetValue = action.target.kind === 'sound'
      ? `sound:${action.target.soundId}`
      : action.target.kind === 'channel'
        ? `channel:${action.target.channel}`
        : 'all'
    const targetSoundId = action.target.kind === 'sound' ? action.target.soundId : null
    const missingSoundId = targetSoundId && !sounds.some(({ id }) => id === targetSoundId)
      ? targetSoundId
      : null
    return (
      <div className="v9-interaction-action-fields">
        <label className="v9-interaction-action-target">
          <span>声音范围</span>
          <select
            aria-label="动作声音范围"
            value={targetValue}
            disabled={disabled}
            onChange={(event) => {
              const value = event.currentTarget.value
              if (value === 'all') onChange({ ...action, target: { kind: 'all' } })
              else if (value.startsWith('channel:')) onChange({
                ...action,
                target: {
                  kind: 'channel',
                  channel: value.slice('channel:'.length) as SoundDefinition['channel'],
                },
              })
              else onChange({
                ...action,
                target: { kind: 'sound', soundId: value.slice('sound:'.length) },
              })
            }}
          >
            {missingSoundId && (
              <option value={targetValue}>原声音已不存在</option>
            )}
            {sounds.map((sound) => (
              <option key={sound.id} value={`sound:${sound.id}`}>{sound.label}</option>
            ))}
            {Object.entries(AUDIO_CHANNEL_LABELS).map(([channel, label]) => (
              <option key={channel} value={`channel:${channel}`}>{label}</option>
            ))}
            <option value="all">全部课程声音</option>
          </select>
        </label>
        {action.type !== 'audio.toggle-mute' && (
          <label>
            <span>{action.type === 'audio.resume' ? '淡入时间（秒）' : '淡出时间（秒）'}</span>
            <CommitNumberInput
              ariaLabel={action.type === 'audio.resume' ? '声音淡入时间（秒）' : '声音淡出时间（秒）'}
              value={(action.type === 'audio.resume' ? action.fadeInMs ?? 0 : action.fadeOutMs ?? 0) / 1000}
              min={0}
              max={60}
              step={0.1}
              disabled={disabled}
              onCommit={(seconds) => onChange(action.type === 'audio.resume'
                ? { ...action, fadeInMs: seconds * 1000 }
                : { ...action, fadeOutMs: seconds * 1000 })}
            />
          </label>
        )}
      </div>
    )
  }
  return null
}

function ruleWithActions(rule: InteractionRule, actions: InteractionActionStep[]): InteractionRule {
  const next = actions.map((step, index) => ({
    ...step,
    start: index === 0 || isTerminalNavigationAction(step.action)
      ? 'after-previous' as const
      : step.start,
  }))
  return { ...rule, actions: next }
}

function RuleConditions({
  rule,
  context,
  disabled,
  onChange,
}: {
  rule: InteractionRule
  context: EditorContext
  disabled?: boolean
  onChange(rule: InteractionRule, message: string): void
}) {
  const presentationStates = context.states.map((state) => ({ id: state.id, label: state.name }))
  const choices = (condition: InteractionCondition) => condition.type === 'scene.in'
    ? context.scenes
    : presentationStates
  const selectedIds = (condition: InteractionCondition) => condition.type === 'scene.in'
    ? condition.sceneIds
    : condition.stateIds
  const replaceCondition = (index: number, condition: InteractionCondition) => {
    onChange({
      ...rule,
      conditions: rule.conditions.map((candidate, candidateIndex) => candidateIndex === index ? condition : candidate),
    }, '已更新课程互动的生效范围')
  }
  const toggle = (condition: InteractionCondition, id: string, checked: boolean): InteractionCondition => {
    const ids = selectedIds(condition)
    const next = checked ? [...ids, id] : ids.filter((candidate) => candidate !== id)
    if (next.length === 0) return condition
    return condition.type === 'scene.in'
      ? { type: 'scene.in', sceneIds: next }
      : { type: 'presentation.in', stateIds: next }
  }
  return (
    <section className="v9-interaction-conditions" aria-label="生效范围">
      <div className="v9-interaction-actions__heading">
        <div>
          <h4>仅在这些情况下生效</h4>
          <p className="v9-interaction-note">添加多项时，需要每一项都满足。不添加则在整个课程中生效。</p>
        </div>
        <div>
          <button
            type="button"
            disabled={disabled || context.scenes.length === 0}
            onClick={() => onChange({
              ...rule,
              conditions: [...rule.conditions, { type: 'scene.in', sceneIds: [context.scenes[0]!.id] }],
            }, '已添加场景范围')}
          >限定幻灯片场景</button>
          <button
            type="button"
            disabled={disabled || presentationStates.length === 0}
            onClick={() => onChange({
              ...rule,
              conditions: [...rule.conditions, { type: 'presentation.in', stateIds: [presentationStates[0]!.id] }],
            }, '已添加保存画面范围')}
          >限定保存画面</button>
        </div>
      </div>
      {rule.conditions.length === 0 ? (
        <p className="v9-interaction-empty">未限定生效范围。</p>
      ) : rule.conditions.map((condition, index) => (
        <fieldset className="v9-interaction-condition" key={`${condition.type}-${index}`}>
          <legend>{condition.type === 'scene.in' ? '适用的幻灯片场景' : '适用的保存画面'}</legend>
          <div className="v9-interaction-condition__choices">
            {choices(condition).map((choice) => {
              const checked = selectedIds(condition).includes(choice.id)
              return (
                <label key={choice.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || (checked && selectedIds(condition).length === 1)}
                    onChange={(event) => replaceCondition(index, toggle(condition, choice.id, event.currentTarget.checked))}
                  />
                  <span>{choice.label}</span>
                </label>
              )
            })}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({
              ...rule,
              conditions: rule.conditions.filter((_, candidateIndex) => candidateIndex !== index),
            }, '已移除生效范围')}
          >移除此项</button>
        </fieldset>
      ))}
    </section>
  )
}

function actionTypeUnavailableReason(
  type: SupportedActionType,
  rule: InteractionRule,
  stepIndex: number,
  context: EditorContext,
): string | undefined {
  const ordinaryReason = actionUnavailableReason(type, context)
  if (ordinaryReason) return ordinaryReason
  const candidate = defaultAction(type, context)
  if (!candidate || !isTerminalNavigationAction(candidate)) return undefined
  const hasOtherTerminal = rule.actions.some((step, index) => (
    index !== stepIndex && isTerminalNavigationAction(step.action)
  ))
  return hasOtherTerminal ? '一条规则只能有一个最终跳转或重启动作。' : undefined
}

function RuleCard({
  rule,
  ruleIndex,
  context,
  disabled,
  showConditions = false,
  onChange,
  onDelete,
}: {
  rule: InteractionRule
  ruleIndex: number
  context: EditorContext
  disabled?: boolean
  showConditions?: boolean
  onChange(rule: InteractionRule, message: string): void
  onDelete(): void
}) {
  const updateAction = (index: number, action: InteractionActionPayload) => {
    const actions = rule.actions.map((step, stepIndex) => stepIndex === index ? { ...step, action } : step)
    if (isTerminalNavigationAction(action) && index !== actions.length - 1) {
      const [terminal] = actions.splice(index, 1)
      actions.push({ ...terminal!, start: 'after-previous' })
    }
    onChange(ruleWithActions(rule, actions), '已更新互动动作')
  }
  const changeActionType = (index: number, type: SupportedActionType) => {
    if (actionTypeUnavailableReason(type, rule, index, context)) return
    const action = defaultAction(type, context)
    if (action) updateAction(index, action)
  }
  const addAction = () => {
    const preferredTypes: SupportedActionType[] = [
      'node.enter',
      'video.play',
      'audio.play',
      'presentation.set',
      'scene.next',
      'scene.previous',
      'course.restart',
    ]
    const type = preferredTypes.find((candidate) => !actionTypeUnavailableReason(
      candidate,
      rule,
      -1,
      context,
    ))
    if (!type) return
    const action = defaultAction(type, context)
    if (!action) return
    const actions = [...rule.actions]
    const terminalIndex = actions.findIndex((step) => isTerminalNavigationAction(step.action))
    actions.splice(terminalIndex >= 0 ? terminalIndex : actions.length, 0, actionStep(action))
    onChange(ruleWithActions(rule, actions), '已添加互动动作')
  }
  const canAddAction = ACTION_OPTIONS.some(({ type }) => !actionTypeUnavailableReason(type, rule, -1, context))

  return (
    <article className="v9-interaction-rule" aria-label={`互动规则：${rule.name ?? `规则 ${ruleIndex + 1}`}`}>
      <header className="v9-interaction-rule__header">
        <label className="v9-interaction-rule__enabled">
          <input
            type="checkbox"
            checked={rule.enabled}
            disabled={disabled}
            onChange={(event) => onChange({ ...rule, enabled: event.currentTarget.checked }, event.currentTarget.checked ? '已启用互动' : '已停用互动')}
          />
          <span>{rule.enabled ? '已启用' : '已停用'}</span>
        </label>
        <CommitTextInput
          ariaLabel={`互动名称 ${ruleIndex + 1}`}
          value={rule.name ?? `互动 ${ruleIndex + 1}`}
          disabled={disabled}
          onCommit={(name) => onChange({ ...rule, name }, '已重命名互动')}
        />
        <button type="button" className="is-danger" disabled={disabled} onClick={onDelete}>删除规则</button>
      </header>
      <p className="v9-interaction-rule__summary">{triggerSummary(rule.trigger, context)}</p>
      <TriggerFields
        trigger={rule.trigger}
        context={context}
        disabled={disabled}
        onChange={(trigger) => onChange({ ...rule, trigger }, '已更新触发时机')}
      />
      {showConditions && (
        <RuleConditions rule={rule} context={context} disabled={disabled} onChange={onChange} />
      )}
      <div className="v9-interaction-actions">
        <div className="v9-interaction-actions__heading">
          <h4>依次执行</h4>
          <button type="button" disabled={disabled || !canAddAction} onClick={addAction}>添加动作</button>
        </div>
        {!canAddAction && <p className="v9-interaction-note">请先选择图层、添加视频或增加可导航位置，再继续添加动作。</p>}
        {rule.actions.map((step, index) => {
          const supported = actionIsSupported(step.action)
          const terminal = isTerminalNavigationAction(step.action)
          const previousIsTerminal = index > 0 && isTerminalNavigationAction(rule.actions[index - 1]!.action)
          const nextIsTerminal = index < rule.actions.length - 1 && isTerminalNavigationAction(rule.actions[index + 1]!.action)
          return (
            <section className="v9-interaction-action" key={step.id} aria-label={`动作 ${index + 1}`}>
              <div className="v9-interaction-action__toolbar">
                <strong>第 {index + 1} 步</strong>
                <button
                  type="button"
                  aria-label={`上移动作 ${index + 1}`}
                  disabled={disabled || index === 0 || terminal || previousIsTerminal}
                  onClick={() => {
                    const actions = [...rule.actions]
                    ;[actions[index - 1], actions[index]] = [actions[index]!, actions[index - 1]!]
                    onChange(ruleWithActions(rule, actions), '已调整动作顺序')
                  }}
                >上移</button>
                <button
                  type="button"
                  aria-label={`下移动作 ${index + 1}`}
                  disabled={disabled || index === rule.actions.length - 1 || terminal || nextIsTerminal}
                  onClick={() => {
                    const actions = [...rule.actions]
                    ;[actions[index], actions[index + 1]] = [actions[index + 1]!, actions[index]!]
                    onChange(ruleWithActions(rule, actions), '已调整动作顺序')
                  }}
                >下移</button>
                <button
                  type="button"
                  aria-label={`删除动作 ${index + 1}`}
                  disabled={disabled || rule.actions.length <= 1}
                  onClick={() => onChange(
                    ruleWithActions(rule, rule.actions.filter((_, stepIndex) => stepIndex !== index)),
                    '已删除互动动作',
                  )}
                >移除</button>
              </div>
              <label>
                <span>要做什么</span>
                <select
                  aria-label={`动作 ${index + 1} 类型`}
                  value={supported ? step.action.type : '__professional__'}
                  disabled={disabled}
                  onChange={(event) => changeActionType(index, event.currentTarget.value as SupportedActionType)}
                >
                  {!supported && <option value="__professional__">其他已保存的专业动作</option>}
                  {ACTION_OPTIONS.map((option) => {
                    const reason = actionTypeUnavailableReason(option.type, rule, index, context)
                    return (
                      <option key={option.type} value={option.type} disabled={Boolean(reason)}>
                        {option.label}{reason ? `（${reason}）` : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
              <ActionFields action={step.action} context={context} disabled={disabled} onChange={(action) => updateAction(index, action)} />
              <div className="v9-interaction-action__timing">
                {index > 0 && !terminal && (
                  <label>
                    <span>与前一步的关系</span>
                    <select
                      aria-label={`动作 ${index + 1} 接续方式`}
                      value={step.start}
                      disabled={disabled}
                      onChange={(event) => {
                        const actions = rule.actions.map((candidate, stepIndex) => stepIndex === index
                          ? { ...candidate, start: event.currentTarget.value as InteractionActionStep['start'] }
                          : candidate)
                        onChange(ruleWithActions(rule, actions), '已更新动作接续方式')
                      }}
                    >
                      <option value="after-previous">等待前一步完成</option>
                      <option value="with-previous">与前一步同时开始</option>
                    </select>
                  </label>
                )}
                <label>
                  <span>开始前等待（秒）</span>
                  <CommitNumberInput
                    ariaLabel={`动作 ${index + 1} 延时（秒）`}
                    value={step.delayMs / 1000}
                    min={0}
                    max={60}
                    step={0.1}
                    disabled={disabled}
                    onCommit={(seconds) => {
                      const actions = rule.actions.map((candidate, stepIndex) => stepIndex === index
                        ? { ...candidate, delayMs: seconds * 1000 }
                        : candidate)
                      onChange(ruleWithActions(rule, actions), '已更新动作延时')
                    }}
                  />
                </label>
              </div>
            </section>
          )
        })}
      </div>
    </article>
  )
}

export function V9InteractionEditor({
  project,
  surface,
  scene,
  layerEntries,
  selectedLayerItemId,
  disabled,
  onCommit,
}: V9InteractionEditorProps) {
  const context = useMemo<EditorContext>(() => {
    const layers = layerEntries.map((entry) => entry.item)
    const videos = layers.filter(isNativeVideo)
    const currentSceneIndex = surface.scenes.findIndex((candidate) => candidate.id === scene.id)
    const scenes = project.surfaces.flatMap((candidate) => candidate.type === 'slide'
      ? candidate.scenes.map((target) => ({
          id: target.id,
          label: `${candidate.title} · ${target.name}`,
        }))
      : [])
    return {
      selectedLayer: layers.find((item) => item.layerItemId === selectedLayerItemId),
      layers,
      videos,
      playableEndedVideos: videos.filter((item) => !item.content.data.loop),
      states: scene.presentation?.states ?? [],
      scenes,
      sounds: Object.values(project.media.audio.sounds),
      components: layerEntries
        .filter((entry) => entry.source !== 'global' && entry.item.kind === 'component')
        .map((entry) => entry.item),
      runtimes: layers.filter((item) => item.kind === 'runtime'),
      actionTargets: actionTargetsForRules(scene.interactions),
      ruleScope: 'scene',
      hasPrevious: currentSceneIndex > 0,
      hasNext: currentSceneIndex >= 0 && currentSceneIndex < surface.scenes.length - 1,
    }
  }, [layerEntries, project.media.audio.sounds, project.surfaces, scene.id, scene.interactions, scene.presentation?.states, selectedLayerItemId, surface.scenes])

  const commitRule = (ruleId: string, nextRule: InteractionRule, message: string) => {
    onCommit(scene.interactions.map((rule) => rule.id === ruleId ? nextRule : rule), message)
  }

  return (
    <section className="v9-interaction-editor course-properties" aria-label="互动编排">
      <h3>触发与动作</h3>
      <p className="course-empty">先决定何时触发，再按顺序安排画面、视频或导航动作。所有选择都会保存为当前场景的一次可撤销修改。</p>
      <TriggerCreationGrid
        context={context}
        rules={scene.interactions}
        disabled={disabled}
        onCommit={onCommit}
      />
      {scene.interactions.length === 0 ? (
        <p className="v9-interaction-empty">当前场景还没有互动规则。选择上方一种触发时机即可开始。</p>
      ) : (
        <div className="v9-interaction-rule-list">
          {scene.interactions.map((rule, index) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              ruleIndex={index}
              context={context}
              disabled={disabled}
              onChange={(nextRule, message) => commitRule(rule.id, nextRule, message)}
              onDelete={() => onCommit(
                scene.interactions.filter((candidate) => candidate.id !== rule.id),
                `已删除互动“${rule.name ?? `规则 ${index + 1}`}”`,
              )}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Course-wide rules use the same structured trigger/action cards as scene
 * rules. The active surface only supplies authoring candidates; the rules stay
 * alive while the player moves between surfaces.
 */
export function V9GlobalInteractionEditor({
  project,
  activeSurface,
  activeScene,
  layerEntries,
  selectedLayerItemId,
  disabled,
  onCommit,
}: V9GlobalInteractionEditorProps) {
  const context = useMemo<EditorContext>(() => {
    const layers = layerEntries.map((entry) => entry.item)
    const videos = layers.filter(isNativeVideo)
    const scenes = project.surfaces.flatMap((candidate) => candidate.type === 'slide'
      ? candidate.scenes.map((target) => ({ id: target.id, label: `${candidate.title} · ${target.name}` }))
      : [])
    const currentLocationIndex = project.locations.findIndex((location) => {
      if (location.surfaceId !== activeSurface.id) return false
      return location.kind !== 'slide-scene' || location.sceneId === activeScene?.id
    })
    return {
      selectedLayer: layers.find((item) => item.layerItemId === selectedLayerItemId),
      layers,
      videos,
      playableEndedVideos: videos.filter((item) => !item.content.data.loop),
      states: project.surfaces.flatMap((surface) => surface.type === 'slide'
        ? surface.scenes.flatMap((scene) => (scene.presentation?.states ?? []).map((state) => ({
            ...state,
            name: `${surface.title} · ${scene.name} · ${state.name}`,
          })))
        : []),
      scenes,
      sounds: Object.values(project.media.audio.sounds),
      components: layerEntries
        .filter((entry) => entry.source === 'global' && entry.item.kind === 'component')
        .map((entry) => entry.item),
      runtimes: layers.filter((item) => item.kind === 'runtime'),
      actionTargets: actionTargetsForRules(project.globalInteractions),
      ruleScope: 'global',
      hasPrevious: currentLocationIndex > 0,
      hasNext: currentLocationIndex >= 0 && currentLocationIndex < project.locations.length - 1,
    }
  }, [activeScene, activeSurface.id, layerEntries, project.globalInteractions, project.locations, project.media.audio.sounds, project.surfaces, selectedLayerItemId])

  const commitRule = (ruleId: string, nextRule: InteractionRule, message: string) => {
    onCommit(project.globalInteractions.map((rule) => rule.id === ruleId ? nextRule : rule), message)
  }

  return (
    <section className="v9-interaction-editor course-properties course-logic-section" aria-label="课程级互动">
      <h3>贯穿课程的互动</h3>
      <p className="course-empty">这里的规则会跟随课程切换内容，可从幻灯片、讲义或空间画布入口继续编排。</p>
      <p className="v9-interaction-note">若动作引用了某一页独有的图层，请在规则中限定适用的幻灯片场景。直接指定目标目前只支持幻灯片场景；讲义与空间画布可用前后位置、重播或从头开始。</p>
      <TriggerCreationGrid
        context={context}
        rules={project.globalInteractions}
        disabled={disabled}
        courseWide
        onCommit={onCommit}
      />
      {project.globalInteractions.length === 0 ? (
        <p className="v9-interaction-empty">当前还没有贯穿课程的互动规则。</p>
      ) : (
        <div className="v9-interaction-rule-list">
          {project.globalInteractions.map((rule, index) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              ruleIndex={index}
              context={context}
              disabled={disabled}
              showConditions
              onChange={(nextRule, message) => commitRule(rule.id, nextRule, message)}
              onDelete={() => onCommit(
                project.globalInteractions.filter((candidate) => candidate.id !== rule.id),
                `已删除课程互动“${rule.name ?? `规则 ${index + 1}`}”`,
              )}
            />
          ))}
        </div>
      )}
    </section>
  )
}
