import { useEffect, useMemo, useState } from 'react'
import { Link2, MousePointerClick, Play, Plus, Trash2, Workflow } from 'lucide-react'
import { nanoid } from 'nanoid'
import { ensureScenePresentation } from '../../shared/presentation'
import {
  isNodeMotionAction,
  isTerminalNavigationAction,
  type AudioActionTarget,
  type InteractionAction,
  type InteractionActionStep,
  type InteractionRule,
  type InteractionTrigger,
  type MotionDirection,
  type MotionEasing,
  type MotionEffect,
} from '../../shared/interactionTypes'
import type {
  ExternalComponentNode,
  SceneDocument,
  SceneNode,
  SoundDefinition,
  VideoNode,
} from '../../shared/projectTypes'
import { requestNodeMotionPreview } from '../phaser/elementAnimationPreviewBus'

const ALL_STATES = '__all_states__'
const MULTIPLE_STATES = '__multiple_states__'
const ALL_SCENES = '__all_scenes__'
const MULTIPLE_SCENES = '__multiple_scenes__'

type ActionType = InteractionAction['type']
type AutomationTrigger = Exclude<InteractionTrigger, { type: 'node.click' }>
type AutomationTriggerType = AutomationTrigger['type']
type AutomationRule = InteractionRule & { trigger: AutomationTrigger }

interface ActionTypeOption {
  value: ActionType
  label: string
  needs?: 'state' | 'scene' | 'sound' | 'video' | 'node'
}

const ACTION_TYPE_OPTIONS: ActionTypeOption[] = [
  { value: 'node.enter', label: '元素出现（入场）', needs: 'node' },
  { value: 'node.exit', label: '元素退出（退场）', needs: 'node' },
  { value: 'presentation.set', label: '切换状态', needs: 'state' },
  { value: 'scene.go', label: '跳转场景', needs: 'scene' },
  { value: 'scene.next', label: '下一场景' },
  { value: 'scene.previous', label: '上一场景' },
  { value: 'scene.replay', label: '重播当前场景' },
  { value: 'course.restart', label: '重新开始课程' },
  { value: 'audio.play', label: '播放声音', needs: 'sound' },
  { value: 'audio.pause', label: '暂停声音' },
  { value: 'audio.resume', label: '继续声音' },
  { value: 'audio.stop', label: '停止声音' },
  { value: 'audio.toggle-mute', label: '切换静音' },
  { value: 'video.play', label: '播放视频', needs: 'video' },
  { value: 'video.pause', label: '暂停视频', needs: 'video' },
  { value: 'video.restart', label: '重播视频', needs: 'video' },
  { value: 'video.stop', label: '停止视频', needs: 'video' },
  { value: 'video.toggle', label: '切换视频播放', needs: 'video' },
  { value: 'video.seek', label: '视频跳转到时间', needs: 'video' },
]

interface AutomationTriggerOption {
  value: AutomationTriggerType
  label: string
  needs?: 'state' | 'sound' | 'video' | 'component' | 'node' | 'animation'
}

const AUTOMATION_TRIGGER_OPTIONS: AutomationTriggerOption[] = [
  { value: 'scene.enter', label: '进入场景' },
  { value: 'presentation.enter', label: '进入状态', needs: 'state' },
  { value: 'node.activated', label: '元素在稳定画面中被激活', needs: 'node' },
  { value: 'animation.completed', label: '动画动作完成', needs: 'animation' },
  { value: 'audio.ended', label: '声音播放结束', needs: 'sound' },
  { value: 'video.started', label: '视频开始播放', needs: 'video' },
  { value: 'video.paused', label: '视频暂停', needs: 'video' },
  { value: 'video.ended', label: '视频播放结束', needs: 'video' },
  { value: 'video.time', label: '视频到达时间点', needs: 'video' },
  { value: 'component.event', label: '组件发出事件', needs: 'component' },
  { value: 'runtime.event', label: '运行时发出事件' },
]

const AUDIO_CHANNELS = [
  ['music', '背景音乐'],
  ['narration', '旁白'],
  ['sfx', '音效'],
  ['ui', '界面音'],
] as const

const MOTION_EFFECTS: Array<{ value: MotionEffect; label: string }> = [
  { value: 'none', label: '立即' },
  { value: 'fade', label: '淡化' },
  { value: 'slide', label: '滑动' },
  { value: 'scale', label: '缩放' },
]

const MOTION_DIRECTIONS: Array<{ value: MotionDirection; label: string }> = [
  { value: 'left', label: '左侧' },
  { value: 'right', label: '右侧' },
  { value: 'up', label: '上方' },
  { value: 'down', label: '下方' },
]

const MOTION_EASINGS: Array<{ value: MotionEasing; label: string }> = [
  { value: 'linear', label: '线性' },
  { value: 'ease-in', label: '渐快' },
  { value: 'ease-out', label: '渐慢' },
  { value: 'ease-in-out', label: '先慢后快再慢' },
]

interface AnimationStepOption {
  id: string
  label: string
}

function createActionStep(
  action: InteractionAction,
  start: InteractionActionStep['start'] = 'after-previous',
): InteractionActionStep {
  return {
    id: `action_${nanoid()}`,
    start,
    delayMs: 0,
    action,
  }
}

function isTerminalActionStep(step: InteractionActionStep): boolean {
  return isTerminalNavigationAction(step.action)
}

export interface InteractionEditorProps {
  scene: SceneDocument
  selectedNode: SceneNode
  sourceScope?: 'scene' | 'global'
  sourceNodes?: readonly SceneNode[]
  sourceRules?: readonly InteractionRule[]
  activeStateId: string | null
  scenes: ReadonlyArray<
    Pick<SceneDocument, 'id' | 'name' | 'presentation'>
  >
  sounds: Readonly<Record<string, SoundDefinition>>
  onAddRule(rule: InteractionRule): void
  onUpdateRule(
    ruleId: string,
    patch: Partial<Omit<InteractionRule, 'id'>>,
  ): void
  onDeleteRule(ruleId: string): void
}

function sceneScope(rule: InteractionRule): string {
  const sceneIds = rule.conditions
    .filter((condition) => condition.type === 'scene.in')
    .flatMap((condition) => condition.sceneIds)
  if (sceneIds.length === 0) return ALL_SCENES
  return new Set(sceneIds).size === 1 ? sceneIds[0]! : MULTIPLE_SCENES
}

function setRuleSceneScope(
  rule: InteractionRule,
  sceneId: string,
): InteractionRule['conditions'] {
  const retained = rule.conditions.filter(
    (condition) => condition.type !== 'scene.in',
  )
  return sceneId === ALL_SCENES
    ? retained
    : [...retained, { type: 'scene.in', sceneIds: [sceneId] }]
}

function stateScope(rule: InteractionRule): string {
  const stateIds = rule.conditions
    .filter((condition) => condition.type === 'presentation.in')
    .flatMap((condition) => condition.stateIds)
  if (stateIds.length === 0) return ALL_STATES
  return new Set(stateIds).size === 1 ? stateIds[0]! : MULTIPLE_STATES
}

function setRuleStateScope(
  rule: InteractionRule,
  stateId: string,
): InteractionRule['conditions'] {
  const retained = rule.conditions.filter(
    (condition) => condition.type !== 'presentation.in',
  )
  return stateId === ALL_STATES
    ? retained
    : [...retained, { type: 'presentation.in', stateIds: [stateId] }]
}

function needsUnavailableTarget(
  option: ActionTypeOption,
  counts: {
    states: number
    scenes: number
    sounds: number
    videos: number
    nodes: number
  },
): boolean {
  switch (option.needs) {
    case 'state': return counts.states === 0
    case 'scene': return counts.scenes === 0
    case 'sound': return counts.sounds === 0
    case 'video': return counts.videos === 0
    case 'node': return counts.nodes === 0
    default: return false
  }
}

function defaultAction(
  type: ActionType,
  targets: {
    stateId?: string
    sceneId?: string
    soundId?: string
    videoId?: string
    nodeId?: string
  },
): InteractionAction {
  switch (type) {
    case 'node.enter':
      return {
        type,
        nodeId: targets.nodeId ?? '',
        effect: 'fade',
        durationMs: 320,
        easing: 'ease-out',
      }
    case 'node.exit':
      return {
        type,
        nodeId: targets.nodeId ?? '',
        effect: 'fade',
        durationMs: 240,
        easing: 'ease-in',
      }
    case 'presentation.set':
      return { type, stateId: targets.stateId ?? '' }
    case 'scene.go':
      return { type, sceneId: targets.sceneId ?? '' }
    case 'scene.next':
    case 'scene.previous':
    case 'scene.replay':
    case 'course.restart':
      return { type }
    case 'audio.play':
      return { type, soundId: targets.soundId ?? '' }
    case 'audio.pause':
    case 'audio.resume':
    case 'audio.stop':
    case 'audio.toggle-mute':
      return { type, target: { kind: 'all' } }
    case 'video.play':
    case 'video.pause':
    case 'video.restart':
    case 'video.stop':
    case 'video.toggle':
      return { type, nodeId: targets.videoId ?? '' }
    case 'video.seek':
      return { type, nodeId: targets.videoId ?? '', seconds: 0 }
  }
}

function isAutomationRule(rule: InteractionRule): rule is AutomationRule {
  return rule.trigger.type !== 'node.click'
}

function automationTriggerUnavailable(
  option: AutomationTriggerOption,
  counts: {
    states: number
    sounds: number
    videos: number
    components: number
    nodes: number
    animations: number
  },
): boolean {
  switch (option.needs) {
    case 'state': return counts.states === 0
    case 'sound': return counts.sounds === 0
    case 'video': return counts.videos === 0
    case 'component': return counts.components === 0
    case 'node': return counts.nodes === 0
    case 'animation': return counts.animations === 0
    default: return false
  }
}

function defaultAutomationTrigger(
  type: AutomationTriggerType,
  targets: {
    stateId?: string
    soundId?: string
    videoId?: string
    componentId?: string
    nodeId?: string
    actionId?: string
  },
): AutomationTrigger {
  switch (type) {
    case 'scene.enter':
      return { type }
    case 'presentation.enter':
      return { type, stateId: targets.stateId ?? '' }
    case 'node.activated':
      return { type, nodeId: targets.nodeId ?? '' }
    case 'animation.completed':
      return { type, actionId: targets.actionId ?? '' }
    case 'audio.ended':
      return { type, soundId: targets.soundId ?? '' }
    case 'video.started':
    case 'video.paused':
    case 'video.ended':
      return { type, nodeId: targets.videoId ?? '' }
    case 'video.time':
      return { type, nodeId: targets.videoId ?? '', seconds: 0 }
    case 'component.event':
      return {
        type,
        nodeId: targets.componentId ?? '',
        eventName: 'complete',
      }
    case 'runtime.event':
      return { type, scope: 'scene', eventName: 'complete' }
  }
}

function automationTriggerLabel(type: AutomationTriggerType): string {
  return AUTOMATION_TRIGGER_OPTIONS.find((option) => option.value === type)?.label ?? type
}

function missingOption(
  value: string,
  available: ReadonlySet<string>,
  label: string,
) {
  return value && !available.has(value)
    ? <option value={value}>{`${label}（已缺失）`}</option>
    : null
}

function AudioTargetFields({
  idPrefix,
  target,
  sounds,
  update,
}: {
  idPrefix: string
  target: AudioActionTarget
  sounds: SoundDefinition[]
  update(target: AudioActionTarget): void
}) {
  const soundIds = new Set(sounds.map((sound) => sound.id))
  return (
    <>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-audio-target-kind`}>声音目标范围</label>
        <select
          id={`${idPrefix}-audio-target-kind`}
          className="form-input"
          value={target.kind}
          onChange={(event) => {
            const kind = event.currentTarget.value as AudioActionTarget['kind']
            if (kind === 'all') update({ kind })
            else if (kind === 'channel') update({ kind, channel: 'music' })
            else update({ kind, soundId: sounds[0]?.id ?? '' })
          }}
        >
          <option value="all">全部声音</option>
          <option value="channel">指定声道</option>
          <option value="sound" disabled={sounds.length === 0}>指定声音</option>
        </select>
      </div>
      {target.kind === 'channel' ? (
        <div className="form-field">
          <label htmlFor={`${idPrefix}-audio-channel`}>声道</label>
          <select
            id={`${idPrefix}-audio-channel`}
            className="form-input"
            value={target.channel}
            onChange={(event) => update({
              kind: 'channel',
              channel: event.currentTarget.value as typeof target.channel,
            })}
          >
            {AUDIO_CHANNELS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      ) : null}
      {target.kind === 'sound' ? (
        <div className="form-field">
          <label htmlFor={`${idPrefix}-audio-sound`}>声音</label>
          <select
            id={`${idPrefix}-audio-sound`}
            className="form-input"
            value={target.soundId}
            onChange={(event) => update({
              kind: 'sound',
              soundId: event.currentTarget.value,
            })}
          >
            {missingOption(target.soundId, soundIds, target.soundId)}
            {sounds.map((sound) => (
              <option key={sound.id} value={sound.id}>{sound.name}</option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  )
}

function AutomationTriggerEditor({
  rule,
  states,
  sounds,
  videos,
  components,
  nodes,
  animationSteps,
  onChange,
}: {
  rule: AutomationRule
  states: Array<{ id: string; name: string }>
  sounds: SoundDefinition[]
  videos: VideoNode[]
  components: ExternalComponentNode[]
  nodes: ReadonlyArray<SceneNode>
  animationSteps: AnimationStepOption[]
  onChange(trigger: AutomationTrigger): void
}) {
  const trigger = rule.trigger
  const idPrefix = `automation-${rule.id}-trigger`
  const stateIds = new Set(states.map((state) => state.id))
  const soundIds = new Set(sounds.map((sound) => sound.id))
  const videoIds = new Set(videos.map((video) => video.id))
  const componentIds = new Set(components.map((component) => component.id))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const animationIds = new Set(animationSteps.map((step) => step.id))
  const targets = {
    stateId: states[0]?.id,
    soundId: sounds[0]?.id,
    videoId: videos[0]?.id,
    componentId: components[0]?.id,
    nodeId: nodes[0]?.id,
    actionId: animationSteps[0]?.id,
  }
  const counts = {
    states: states.length,
    sounds: sounds.length,
    videos: videos.length,
    components: components.length,
    nodes: nodes.length,
    animations: animationSteps.length,
  }

  return (
    <>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-type`}>触发方式</label>
        <select
          id={`${idPrefix}-type`}
          className="form-input"
          value={trigger.type}
          onChange={(event) => onChange(defaultAutomationTrigger(
            event.currentTarget.value as AutomationTriggerType,
            targets,
          ))}
        >
          {AUTOMATION_TRIGGER_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={automationTriggerUnavailable(option, counts)}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {trigger.type === 'presentation.enter' ? (
        <div className="form-field">
          <label htmlFor={`${idPrefix}-state`}>进入状态</label>
          <select
            id={`${idPrefix}-state`}
            className="form-input"
            value={trigger.stateId}
            onChange={(event) => onChange({
              ...trigger,
              stateId: event.currentTarget.value,
            })}
          >
            {missingOption(trigger.stateId, stateIds, trigger.stateId)}
            {states.map((state) => (
              <option key={state.id} value={state.id}>{state.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {trigger.type === 'node.activated' ? (
        <div className="form-field">
          <label htmlFor={`${idPrefix}-node`}>监听元素</label>
          <select
            id={`${idPrefix}-node`}
            className="form-input"
            value={trigger.nodeId}
            onChange={(event) => onChange({
              ...trigger,
              nodeId: event.currentTarget.value,
            })}
          >
            {missingOption(trigger.nodeId, nodeIds, trigger.nodeId)}
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>{node.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {trigger.type === 'animation.completed' ? (
        <div className="form-field">
          <label htmlFor={`${idPrefix}-animation`}>监听动画动作</label>
          <select
            id={`${idPrefix}-animation`}
            className="form-input"
            value={trigger.actionId}
            onChange={(event) => onChange({
              ...trigger,
              actionId: event.currentTarget.value,
            })}
          >
            {missingOption(trigger.actionId, animationIds, trigger.actionId)}
            {animationSteps.map((step) => (
              <option key={step.id} value={step.id}>{step.label}</option>
            ))}
          </select>
        </div>
      ) : null}

      {trigger.type === 'audio.ended' ? (
        <div className="form-field">
          <label htmlFor={`${idPrefix}-sound`}>监听声音</label>
          <select
            id={`${idPrefix}-sound`}
            className="form-input"
            value={trigger.soundId}
            onChange={(event) => onChange({
              ...trigger,
              soundId: event.currentTarget.value,
            })}
          >
            {missingOption(trigger.soundId, soundIds, trigger.soundId)}
            {sounds.map((sound) => (
              <option key={sound.id} value={sound.id}>{sound.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {(
        trigger.type === 'video.started' ||
        trigger.type === 'video.paused' ||
        trigger.type === 'video.ended' ||
        trigger.type === 'video.time'
      ) ? (
        <>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-video`}>监听视频</label>
            <select
              id={`${idPrefix}-video`}
              className="form-input"
              value={trigger.nodeId}
              onChange={(event) => onChange({
                ...trigger,
                nodeId: event.currentTarget.value,
              })}
            >
              {missingOption(trigger.nodeId, videoIds, trigger.nodeId)}
              {videos.map((video) => (
                <option key={video.id} value={video.id}>{video.name}</option>
              ))}
            </select>
          </div>
          {trigger.type === 'video.time' ? (
            <div className="form-field">
              <label htmlFor={`${idPrefix}-seconds`}>触发时间（秒）</label>
              <input
                id={`${idPrefix}-seconds`}
                className="form-input"
                type="number"
                min={0}
                max={604_800}
                step={0.1}
                value={trigger.seconds}
                onChange={(event) => onChange({
                  ...trigger,
                  seconds: Math.max(0, event.currentTarget.valueAsNumber || 0),
                })}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {trigger.type === 'component.event' ? (
        <>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-component`}>来源组件</label>
            <select
              id={`${idPrefix}-component`}
              className="form-input"
              value={trigger.nodeId}
              onChange={(event) => onChange({
                ...trigger,
                nodeId: event.currentTarget.value,
              })}
            >
              {missingOption(trigger.nodeId, componentIds, trigger.nodeId)}
              {components.map((component) => (
                <option key={component.id} value={component.id}>{component.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-event-name`}>事件名称</label>
            <input
              id={`${idPrefix}-event-name`}
              className="form-input"
              maxLength={160}
              value={trigger.eventName}
              onChange={(event) => onChange({
                ...trigger,
                eventName: event.currentTarget.value,
              })}
            />
          </div>
        </>
      ) : null}

      {trigger.type === 'runtime.event' ? (
        <>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-runtime-scope`}>运行时来源</label>
            <select
              id={`${idPrefix}-runtime-scope`}
              className="form-input"
              value={trigger.scope}
              onChange={(event) => onChange({
                ...trigger,
                scope: event.currentTarget.value as typeof trigger.scope,
              })}
            >
              <option value="scene">当前场景运行时</option>
              <option value="global">全局运行时</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-runtime-event-name`}>运行时事件名称</label>
            <input
              id={`${idPrefix}-runtime-event-name`}
              className="form-input"
              maxLength={160}
              value={trigger.eventName}
              onChange={(event) => onChange({
                ...trigger,
                eventName: event.currentTarget.value,
              })}
            />
          </div>
        </>
      ) : null}
    </>
  )
}

function ActionEditor({
  rule,
  step,
  actionIndex,
  states,
  scenes,
  sounds,
  videos,
  nodes,
  referencedByCompletion,
  onChange,
  onRemove,
}: {
  rule: InteractionRule
  step: InteractionActionStep
  actionIndex: number
  states: Array<{ id: string; name: string }>
  scenes: ReadonlyArray<
    Pick<SceneDocument, 'id' | 'name' | 'presentation'>
  >
  sounds: SoundDefinition[]
  videos: VideoNode[]
  nodes: ReadonlyArray<SceneNode>
  referencedByCompletion: boolean
  onChange(step: InteractionActionStep): void
  onRemove(): void
}) {
  const action = step.action
  const idPrefix = `interaction-${rule.id}-action-${step.id}`
  const updateAction = (nextAction: InteractionAction): void => {
    onChange({
      ...step,
      start: actionIndex === 0 || isTerminalNavigationAction(nextAction)
        ? 'after-previous'
        : step.start,
      action: nextAction,
    })
  }
  const stateIds = new Set(states.map((state) => state.id))
  const sceneIds = new Set(scenes.map((scene) => scene.id))
  const soundIds = new Set(sounds.map((sound) => sound.id))
  const videoIds = new Set(videos.map((video) => video.id))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const targets = {
    stateId: states[0]?.id,
    sceneId: scenes[0]?.id,
    soundId: sounds[0]?.id,
    videoId: videos[0]?.id,
    nodeId: nodes[0]?.id,
  }
  const counts = {
    states: states.length,
    scenes: scenes.length,
    sounds: sounds.length,
    videos: videos.length,
    nodes: nodes.length,
  }
  const targetScene = action.type === 'scene.go'
    ? scenes.find((scene) => scene.id === action.sceneId)
    : undefined
  const targetStates = targetScene?.presentation?.states ?? []
  const targetStateIds = new Set(targetStates.map((state) => state.id))

  return (
    <fieldset
      aria-label={`动作 ${actionIndex + 1}`}
      style={{ border: '1px solid var(--border-color, #d8dee9)', borderRadius: 8, padding: 10, margin: '0 0 10px' }}
    >
      <legend>{`动作 ${actionIndex + 1}`}</legend>
      <div className="coordinate-grid">
        <div className="form-field">
          <label htmlFor={`${idPrefix}-start`}>开始方式</label>
          <select
            id={`${idPrefix}-start`}
            className="form-input"
            value={actionIndex === 0 ? 'after-previous' : step.start}
            disabled={actionIndex === 0 || isTerminalNavigationAction(action)}
            onChange={(event) => onChange({
              ...step,
              start: event.currentTarget.value as InteractionActionStep['start'],
            })}
          >
            <option value="after-previous">等待上一组完成</option>
            <option value="with-previous">与上一步同时开始</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={`${idPrefix}-delay`}>局部延迟（毫秒）</label>
          <input
            id={`${idPrefix}-delay`}
            className="form-input"
            type="number"
            min={0}
            max={60_000}
            step={10}
            value={step.delayMs}
            onChange={(event) => onChange({
              ...step,
              delayMs: Math.min(
                60_000,
                Math.max(0, event.currentTarget.valueAsNumber || 0),
              ),
            })}
          />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-type`}>动作类型</label>
        <select
          id={`${idPrefix}-type`}
          className="form-input"
          value={action.type}
          onChange={(event) => updateAction(defaultAction(
            event.currentTarget.value as ActionType,
            targets,
          ))}
        >
          {ACTION_TYPE_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={
                needsUnavailableTarget(option, counts) ||
                (referencedByCompletion &&
                  option.value !== 'node.enter' && option.value !== 'node.exit') ||
                (actionIndex < rule.actions.length - 1 &&
                  isTerminalNavigationAction(defaultAction(option.value, targets)))
              }
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isNodeMotionAction(action) ? (
        <>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-node`}>目标元素</label>
            <select
              id={`${idPrefix}-node`}
              className="form-input"
              value={action.nodeId}
              onChange={(event) => updateAction({
                ...action,
                nodeId: event.currentTarget.value,
              })}
            >
              {missingOption(action.nodeId, nodeIds, action.nodeId)}
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
            </select>
          </div>
          <div className="coordinate-grid">
            <div className="form-field">
              <label htmlFor={`${idPrefix}-effect`}>效果</label>
              <select
                id={`${idPrefix}-effect`}
                className="form-input"
                value={action.effect}
                onChange={(event) => {
                  const effect = event.currentTarget.value as MotionEffect
                  updateAction(effect === 'slide'
                    ? { ...action, effect, direction: 'left' }
                    : {
                        type: action.type,
                        nodeId: action.nodeId,
                        effect,
                        durationMs: action.durationMs,
                        easing: action.easing,
                      })
                }}
              >
                {MOTION_EFFECTS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {action.effect === 'slide' ? (
              <div className="form-field">
                <label htmlFor={`${idPrefix}-direction`}>
                  {action.type === 'node.enter' ? '进入来源' : '退出方向'}
                </label>
                <select
                  id={`${idPrefix}-direction`}
                  className="form-input"
                  value={action.direction}
                  onChange={(event) => updateAction({
                    ...action,
                    direction: event.currentTarget.value as MotionDirection,
                  })}
                >
                  {MOTION_DIRECTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div className="coordinate-grid">
            <div className="form-field">
              <label htmlFor={`${idPrefix}-motion-duration`}>动画时长（毫秒）</label>
              <input
                id={`${idPrefix}-motion-duration`}
                className="form-input"
                type="number"
                min={0}
                max={10_000}
                step={10}
                disabled={action.effect === 'none'}
                value={action.effect === 'none' ? 0 : action.durationMs}
                onChange={(event) => updateAction({
                  ...action,
                  durationMs: Math.min(
                    10_000,
                    Math.max(0, event.currentTarget.valueAsNumber || 0),
                  ),
                })}
              />
            </div>
            <div className="form-field">
              <label htmlFor={`${idPrefix}-easing`}>缓动</label>
              <select
                id={`${idPrefix}-easing`}
                className="form-input"
                disabled={action.effect === 'none'}
                value={action.easing}
                onChange={(event) => updateAction({
                  ...action,
                  easing: event.currentTarget.value as MotionEasing,
                })}
              >
                {MOTION_EASINGS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="property-hint">
            动画由当前规则的事件触发；延迟只相对该事件或上一动作组，不按场景绝对时间计时。
          </p>
          <button
            type="button"
            className="secondary-button"
            aria-label={`预览动作 ${actionIndex + 1}`}
            onClick={() => requestNodeMotionPreview(action, step.delayMs)}
          >
            <Play size={13} />预览此动作
          </button>
        </>
      ) : null}

      {action.type === 'presentation.set' ? (
        <>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-state`}>目标状态</label>
            <select
              id={`${idPrefix}-state`}
              className="form-input"
              value={action.stateId}
              onChange={(event) => updateAction({
                ...action,
                stateId: event.currentTarget.value,
              })}
            >
              {missingOption(action.stateId, stateIds, action.stateId)}
              {states.map((state) => (
                <option key={state.id} value={state.id}>{state.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-duration`}>过渡时长（毫秒）</label>
            <input
              id={`${idPrefix}-duration`}
              className="form-input"
              type="number"
              min={0}
              max={10_000}
              step={10}
              value={action.transition?.duration ?? 0}
              onChange={(event) => {
                const duration = Math.min(
                  10_000,
                  Math.max(0, event.currentTarget.valueAsNumber || 0),
                )
                updateAction({
                  ...action,
                  transition: duration > 0
                    ? { ...action.transition, duration }
                    : undefined,
                })
              }}
            />
          </div>
        </>
      ) : null}

      {action.type === 'scene.go' ? (
        <>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-scene`}>目标场景</label>
            <select
              id={`${idPrefix}-scene`}
              className="form-input"
              value={action.sceneId}
              onChange={(event) => updateAction({
                type: 'scene.go',
                sceneId: event.currentTarget.value,
              })}
            >
              {missingOption(action.sceneId, sceneIds, action.sceneId)}
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>{scene.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-target-state`}>进入状态</label>
            <select
              id={`${idPrefix}-target-state`}
              className="form-input"
              value={action.targetStateId ?? ''}
              onChange={(event) => {
                const targetStateId = event.currentTarget.value
                updateAction(targetStateId
                  ? { ...action, targetStateId }
                  : { type: 'scene.go', sceneId: action.sceneId })
              }}
            >
              <option value="">场景初始状态</option>
              {action.targetStateId
                ? missingOption(
                    action.targetStateId,
                    targetStateIds,
                    action.targetStateId,
                  )
                : null}
              {targetStates.map((state) => (
                <option key={state.id} value={state.id}>{state.name}</option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      {action.type === 'audio.play' ? (
        <div className="form-field">
          <label htmlFor={`${idPrefix}-sound`}>声音</label>
          <select
            id={`${idPrefix}-sound`}
            className="form-input"
            value={action.soundId}
            onChange={(event) => updateAction({
              ...action,
              soundId: event.currentTarget.value,
            })}
          >
            {missingOption(action.soundId, soundIds, action.soundId)}
            {sounds.map((sound) => (
              <option key={sound.id} value={sound.id}>{sound.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {(
        action.type === 'audio.pause' ||
        action.type === 'audio.resume' ||
        action.type === 'audio.stop' ||
        action.type === 'audio.toggle-mute'
      ) ? (
        <AudioTargetFields
          idPrefix={idPrefix}
          target={action.target}
          sounds={sounds}
          update={(target) => updateAction({ ...action, target })}
        />
      ) : null}

      {action.type.startsWith('video.') ? (
        <>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-video`}>目标视频</label>
            <select
              id={`${idPrefix}-video`}
              className="form-input"
              value={'nodeId' in action ? action.nodeId : ''}
              onChange={(event) => {
                if ('nodeId' in action) {
                  updateAction({ ...action, nodeId: event.currentTarget.value })
                }
              }}
            >
              {'nodeId' in action
                ? missingOption(action.nodeId, videoIds, action.nodeId)
                : null}
              {videos.map((video) => (
                <option key={video.id} value={video.id}>{video.name}</option>
              ))}
            </select>
          </div>
          {action.type === 'video.seek' ? (
            <div className="form-field">
              <label htmlFor={`${idPrefix}-seconds`}>目标时间（秒）</label>
              <input
                id={`${idPrefix}-seconds`}
                className="form-input"
                type="number"
                min={0}
                max={604_800}
                step={0.1}
                value={action.seconds}
                onChange={(event) => updateAction({
                  ...action,
                  seconds: Math.max(0, event.currentTarget.valueAsNumber || 0),
                })}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        className="secondary-button secondary-button--danger"
        disabled={rule.actions.length <= 1 || referencedByCompletion}
        title={referencedByCompletion
          ? '该动作正被“动画完成”自动化引用，请先更改触发器。'
          : undefined}
        aria-label={`删除动作 ${actionIndex + 1}`}
        onClick={onRemove}
      >
        <Trash2 size={13} />删除动作
      </button>
    </fieldset>
  )
}

export function InteractionEditor({
  scene,
  selectedNode,
  sourceScope = 'scene',
  sourceNodes,
  sourceRules,
  activeStateId,
  scenes,
  sounds,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
}: InteractionEditorProps) {
  const availableNodes = sourceNodes ?? scene.nodes
  const allRules = sourceRules ?? scene.interactions
  const completionActionIds = useMemo(() => new Set(
    allRules.flatMap((rule) => rule.trigger.type === 'animation.completed'
      ? [rule.trigger.actionId]
      : []),
  ), [allRules])
  const states = useMemo(
    () => ensureScenePresentation(scene).states.map(({ id, name }) => ({ id, name })),
    [scene],
  )
  const videoNodes = useMemo(
    () => availableNodes.filter((node): node is VideoNode => node.type === 'video'),
    [availableNodes],
  )
  const soundList = useMemo(
    () => Object.values(sounds).sort((left, right) => (
      left.name.localeCompare(right.name, 'zh-CN')
    )),
    [sounds],
  )
  const rules = allRules.filter(
    (rule) => rule.trigger.type === 'node.click' &&
      rule.trigger.nodeId === selectedNode.id,
  )
  const isVideoNode = selectedNode.type === 'video'
  const videoOwnsClick = isVideoNode && (
    selectedNode.clickToToggle || selectedNode.showControls
  )
  const suggestedTargetId = states.find((state) => state.id !== activeStateId)?.id ??
    states[0]?.id ?? ''
  const [quickTargetId, setQuickTargetId] = useState(suggestedTargetId)

  useEffect(() => {
    if (!states.some((state) => state.id === quickTargetId)) {
      setQuickTargetId(suggestedTargetId)
    }
  }, [quickTargetId, states, suggestedTargetId])

  const targets = {
    stateId: states[0]?.id,
    sceneId: scenes[0]?.id,
    soundId: soundList[0]?.id,
    videoId: videoNodes[0]?.id,
    nodeId: availableNodes[0]?.id,
  }

  const addQuickStateRule = () => {
    const target = states.find((state) => state.id === quickTargetId)
    if (!target) return
    onAddRule({
      id: `interaction_${nanoid()}`,
      name: `${selectedNode.name} → ${target.name}`,
      enabled: true,
      trigger: { type: 'node.click', nodeId: selectedNode.id },
      conditions: activeStateId
        ? [
            ...(sourceScope === 'global'
              ? [{ type: 'scene.in' as const, sceneIds: [scene.id] }]
              : []),
            { type: 'presentation.in', stateIds: [activeStateId] },
          ]
        : sourceScope === 'global'
          ? [{ type: 'scene.in', sceneIds: [scene.id] }]
          : [],
      actions: [createActionStep({
        type: 'presentation.set',
        stateId: target.id,
        transition: { duration: 240 },
      })],
    })
  }

  return (
    <section className="property-section" aria-labelledby="interaction-editor-title">
      <h3 className="property-title" id="interaction-editor-title">
        <MousePointerClick size={14} />交互
      </h3>
      <p className="property-hint">
        {isVideoNode
          ? '视频表面点击默认只用于播放控制。状态、声音和场景变化请使用右侧“自动化”中的视频开始、暂停、结束或时间点触发。'
          : `为“${selectedNode.name}”配置单击后按顺序执行的动作。`}
      </p>

      {!isVideoNode ? (
        <>
          <div className="form-field">
            <label htmlFor={`interaction-${selectedNode.id}-quick-target`}>快捷连接目标状态</label>
            <select
              id={`interaction-${selectedNode.id}-quick-target`}
              className="form-input"
              value={quickTargetId}
              disabled={states.length === 0}
              onChange={(event) => setQuickTargetId(event.currentTarget.value)}
            >
              {states.map((state) => (
                <option key={state.id} value={state.id}>{state.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="secondary-button"
            style={{ width: '100%', marginBottom: 12 }}
            disabled={!quickTargetId}
            onClick={addQuickStateRule}
          >
            <Link2 size={14} />连接到状态
          </button>
        </>
      ) : (
        <p className="property-hint" data-testid="video-click-policy">
          如需点击视频区域进行导航，请在视频上方放置一个独立按钮或透明图形热点，使播放与导航拥有明确的不同元素。
        </p>
      )}

      {isVideoNode && rules.length > 0 ? (
        <p className="property-hint" role={videoOwnsClick ? 'alert' : 'status'}>
          {videoOwnsClick
            ? '该视频包含旧版点击规则，但播放点击或画布控件正在占用视频表面，规则不会接收点击。请删除规则并改用场景自动化或独立热点。'
            : '以下是旧工程保留的视频点击规则。视频关闭播放点击和画布控件时仍可兼容执行，但新工程不再创建此类规则。'}
        </p>
      ) : null}

      {rules.length === 0 ? (
        <p className="property-hint" role="status">
          {isVideoNode ? '该视频没有旧版点击规则。' : '该元素尚未配置单击交互。'}
        </p>
      ) : null}

      {rules.map((rule, ruleIndex) => {
        const scope = stateScope(rule)
        const activeSceneScope = sceneScope(rule)
        return (
          <fieldset
            key={rule.id}
            aria-label={`单击规则 ${ruleIndex + 1}`}
            style={{ border: '1px solid var(--border-color, #cbd5e1)', borderRadius: 10, padding: 10, margin: '0 0 12px' }}
          >
            <legend>{rule.name || `单击规则 ${ruleIndex + 1}`}</legend>
            <div className="toggle-row">
              <label htmlFor={`interaction-${rule.id}-enabled`}>启用规则</label>
              <input
                id={`interaction-${rule.id}-enabled`}
                type="checkbox"
                checked={rule.enabled}
                onChange={(event) => onUpdateRule(rule.id, {
                  enabled: event.currentTarget.checked,
                })}
              />
            </div>
            {sourceScope === 'global' ? (
              <div className="form-field">
                <label htmlFor={`interaction-${rule.id}-scene-scope`}>生效场景</label>
                <select
                  id={`interaction-${rule.id}-scene-scope`}
                  className="form-input"
                  value={activeSceneScope}
                  onChange={(event) => onUpdateRule(rule.id, {
                    conditions: setRuleSceneScope(rule, event.currentTarget.value),
                  })}
                >
                  <option value={ALL_SCENES}>所有场景</option>
                  {activeSceneScope === MULTIPLE_SCENES ? (
                    <option value={MULTIPLE_SCENES} disabled>多个场景（请重新选择）</option>
                  ) : null}
                  {scenes.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="form-field">
              <label htmlFor={`interaction-${rule.id}-scope`}>作用范围</label>
              <select
                id={`interaction-${rule.id}-scope`}
                className="form-input"
                value={scope}
                onChange={(event) => onUpdateRule(rule.id, {
                  conditions: setRuleStateScope(rule, event.currentTarget.value),
                })}
              >
                <option value={ALL_STATES}>所有状态</option>
                {scope === MULTIPLE_STATES ? (
                  <option value={MULTIPLE_STATES} disabled>多个状态（请重新选择）</option>
                ) : null}
                {states.map((state) => (
                  <option key={state.id} value={state.id}>{state.name}</option>
                ))}
              </select>
            </div>

            {rule.actions.map((step, actionIndex) => (
              <ActionEditor
                key={step.id}
                rule={rule}
                step={step}
                actionIndex={actionIndex}
                states={states}
                scenes={scenes}
                sounds={soundList}
                videos={videoNodes}
                nodes={availableNodes}
                referencedByCompletion={completionActionIds.has(step.id)}
                onChange={(nextStep) => onUpdateRule(rule.id, {
                  actions: rule.actions.map((item, index) => (
                    index === actionIndex ? nextStep : item
                  )),
                })}
                onRemove={() => onUpdateRule(rule.id, {
                  actions: rule.actions.filter((_, index) => index !== actionIndex),
                })}
              />
            ))}

            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                aria-label={`为规则 ${ruleIndex + 1} 添加动作`}
                onClick={() => {
                  const nextStep = createActionStep(
                    defaultAction('presentation.set', targets),
                  )
                  const terminalIndex = rule.actions.findIndex(isTerminalActionStep)
                  const actions = [...rule.actions]
                  actions.splice(
                    terminalIndex >= 0 ? terminalIndex : actions.length,
                    0,
                    nextStep,
                  )
                  onUpdateRule(rule.id, { actions })
                }}
              >
                <Plus size={13} />添加动作
              </button>
              <button
                type="button"
                className="secondary-button secondary-button--danger"
                aria-label={`删除单击规则 ${ruleIndex + 1}`}
                disabled={rule.actions.some((step) => completionActionIds.has(step.id))}
                title={rule.actions.some((step) => completionActionIds.has(step.id))
                  ? '该规则的动画正被“动画完成”自动化引用，请先更改触发器。'
                  : undefined}
                onClick={() => onDeleteRule(rule.id)}
              >
                <Trash2 size={13} />删除规则
              </button>
            </div>
          </fieldset>
        )
      })}
    </section>
  )
}

export type SceneAutomationEditorProps = Omit<
  InteractionEditorProps,
  'selectedNode'
>

export function SceneAutomationEditor({
  scene,
  sourceScope = 'scene',
  sourceNodes,
  sourceRules,
  activeStateId,
  scenes,
  sounds,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
}: SceneAutomationEditorProps) {
  const availableNodes = sourceNodes ?? scene.nodes
  const allRules = sourceRules ?? scene.interactions
  const completionActionIds = useMemo(() => new Set(
    allRules.flatMap((rule) => rule.trigger.type === 'animation.completed'
      ? [rule.trigger.actionId]
      : []),
  ), [allRules])
  const states = useMemo(
    () => ensureScenePresentation(scene).states.map(({ id, name }) => ({ id, name })),
    [scene],
  )
  const videoNodes = useMemo(
    () => availableNodes.filter((node): node is VideoNode => node.type === 'video'),
    [availableNodes],
  )
  const componentNodes = useMemo(
    () => availableNodes.filter(
      (node): node is ExternalComponentNode => node.type === 'external-component',
    ),
    [availableNodes],
  )
  const animationSteps = useMemo<AnimationStepOption[]>(() => {
    const nodeNames = new Map(availableNodes.map((node) => [node.id, node.name]))
    return allRules.flatMap((rule) =>
      rule.actions.flatMap((step) => isNodeMotionAction(step.action)
        ? [{
            id: step.id,
            label: `${rule.name || rule.id} · ${
              nodeNames.get(step.action.nodeId) ?? step.action.nodeId
            } · ${step.action.type === 'node.enter' ? '入场' : '退场'}`,
          }]
        : []),
    )
  }, [allRules, availableNodes])
  const soundList = useMemo(
    () => Object.values(sounds).sort((left, right) => (
      left.name.localeCompare(right.name, 'zh-CN')
    )),
    [sounds],
  )
  const rules = allRules.filter(isAutomationRule)
  const suggestedStateId = states.find((state) => state.id !== activeStateId)?.id ??
    states[0]?.id ?? ''
  const [newTriggerType, setNewTriggerType] = useState<AutomationTriggerType>(
    'scene.enter',
  )
  const triggerTargets = {
    stateId: states[0]?.id,
    soundId: soundList[0]?.id,
    videoId: videoNodes[0]?.id,
    componentId: componentNodes[0]?.id,
    nodeId: availableNodes[0]?.id,
    actionId: animationSteps[0]?.id,
  }
  const actionTargets = {
    stateId: suggestedStateId,
    sceneId: scenes[0]?.id,
    soundId: soundList[0]?.id,
    videoId: videoNodes[0]?.id,
    nodeId: availableNodes[0]?.id,
  }
  const triggerCounts = {
    states: states.length,
    sounds: soundList.length,
    videos: videoNodes.length,
    components: componentNodes.length,
    nodes: availableNodes.length,
    animations: animationSteps.length,
  }
  const selectedTriggerOption = AUTOMATION_TRIGGER_OPTIONS.find(
    (option) => option.value === newTriggerType,
  )!

  const addAutomationRule = () => {
    if (automationTriggerUnavailable(selectedTriggerOption, triggerCounts)) return
    const action = suggestedStateId
      ? defaultAction('presentation.set', actionTargets)
      : defaultAction('scene.next', actionTargets)
    onAddRule({
      id: `interaction_${nanoid()}`,
      name: `${automationTriggerLabel(newTriggerType)}自动化`,
      enabled: true,
      trigger: defaultAutomationTrigger(newTriggerType, triggerTargets),
      conditions: activeStateId
        ? [
            ...(sourceScope === 'global'
              ? [{ type: 'scene.in' as const, sceneIds: [scene.id] }]
              : []),
            { type: 'presentation.in', stateIds: [activeStateId] },
          ]
        : sourceScope === 'global'
          ? [{ type: 'scene.in', sceneIds: [scene.id] }]
          : [],
      actions: [createActionStep(action)],
    })
  }

  return (
    <section className="property-section" aria-labelledby={`${sourceScope}-automation-title`}>
      <h3 className="property-title" id={`${sourceScope}-automation-title`}>
        <Workflow size={14} />{sourceScope === 'global' ? '全局自动化' : '场景自动化'}
      </h3>
      <p className="property-hint">
        {sourceScope === 'global'
          ? '全局元素只创建一次；可按场景限制规则，并监听全局组件或运行时事件。'
          : '无需点击元素；当场景、状态、声音、视频、组件或运行时事件发生时执行动作。'}
      </p>
      <div className="form-field">
        <label htmlFor={`automation-${scene.id}-new-trigger`}>新增自动化触发方式</label>
        <select
          id={`automation-${scene.id}-new-trigger`}
          className="form-input"
          value={newTriggerType}
          onChange={(event) => setNewTriggerType(
            event.currentTarget.value as AutomationTriggerType,
          )}
        >
          {AUTOMATION_TRIGGER_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={automationTriggerUnavailable(option, triggerCounts)}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="secondary-button"
        style={{ width: '100%', marginBottom: 12 }}
        disabled={automationTriggerUnavailable(selectedTriggerOption, triggerCounts)}
        onClick={addAutomationRule}
      >
        <Plus size={14} />添加自动化规则
      </button>

      {rules.length === 0 ? (
        <p className="property-hint" role="status">
          {sourceScope === 'global' ? '尚未配置全局自动化规则。' : '当前场景尚未配置自动化规则。'}
        </p>
      ) : null}

      {rules.map((rule, ruleIndex) => {
        const scope = stateScope(rule)
        const activeSceneScope = sceneScope(rule)
        return (
          <fieldset
            key={rule.id}
            aria-label={`自动化规则 ${ruleIndex + 1}`}
            style={{ border: '1px solid var(--border-color, #cbd5e1)', borderRadius: 10, padding: 10, margin: '0 0 12px' }}
          >
            <legend>{rule.name || `自动化规则 ${ruleIndex + 1}`}</legend>
            <div className="toggle-row">
              <label htmlFor={`automation-${rule.id}-enabled`}>启用规则</label>
              <input
                id={`automation-${rule.id}-enabled`}
                type="checkbox"
                checked={rule.enabled}
                onChange={(event) => onUpdateRule(rule.id, {
                  enabled: event.currentTarget.checked,
                })}
              />
            </div>

            <AutomationTriggerEditor
              rule={rule}
              states={states}
              sounds={soundList}
              videos={videoNodes}
              components={componentNodes}
              nodes={availableNodes}
              animationSteps={animationSteps}
              onChange={(trigger) => onUpdateRule(rule.id, { trigger })}
            />

            {sourceScope === 'global' ? (
              <div className="form-field">
                <label htmlFor={`automation-${rule.id}-scene-scope`}>生效场景</label>
                <select
                  id={`automation-${rule.id}-scene-scope`}
                  className="form-input"
                  value={activeSceneScope}
                  onChange={(event) => onUpdateRule(rule.id, {
                    conditions: setRuleSceneScope(rule, event.currentTarget.value),
                  })}
                >
                  <option value={ALL_SCENES}>所有场景</option>
                  {activeSceneScope === MULTIPLE_SCENES ? (
                    <option value={MULTIPLE_SCENES} disabled>多个场景（请重新选择）</option>
                  ) : null}
                  {scenes.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="form-field">
              <label htmlFor={`automation-${rule.id}-scope`}>作用范围</label>
              <select
                id={`automation-${rule.id}-scope`}
                className="form-input"
                value={scope}
                onChange={(event) => onUpdateRule(rule.id, {
                  conditions: setRuleStateScope(rule, event.currentTarget.value),
                })}
              >
                <option value={ALL_STATES}>所有状态</option>
                {scope === MULTIPLE_STATES ? (
                  <option value={MULTIPLE_STATES} disabled>多个状态（请重新选择）</option>
                ) : null}
                {states.map((state) => (
                  <option key={state.id} value={state.id}>{state.name}</option>
                ))}
              </select>
            </div>

            {rule.actions.map((step, actionIndex) => (
              <ActionEditor
                key={step.id}
                rule={rule}
                step={step}
                actionIndex={actionIndex}
                states={states}
                scenes={scenes}
                sounds={soundList}
                videos={videoNodes}
                nodes={availableNodes}
                referencedByCompletion={completionActionIds.has(step.id)}
                onChange={(nextStep) => onUpdateRule(rule.id, {
                  actions: rule.actions.map((item, index) => (
                    index === actionIndex ? nextStep : item
                  )),
                })}
                onRemove={() => onUpdateRule(rule.id, {
                  actions: rule.actions.filter((_, index) => index !== actionIndex),
                })}
              />
            ))}

            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                aria-label={`为自动化规则 ${ruleIndex + 1} 添加动作`}
                onClick={() => {
                  const nextStep = createActionStep(
                    defaultAction('presentation.set', actionTargets),
                  )
                  const terminalIndex = rule.actions.findIndex(isTerminalActionStep)
                  const actions = [...rule.actions]
                  actions.splice(
                    terminalIndex >= 0 ? terminalIndex : actions.length,
                    0,
                    nextStep,
                  )
                  onUpdateRule(rule.id, { actions })
                }}
              >
                <Plus size={13} />添加动作
              </button>
              <button
                type="button"
                className="secondary-button secondary-button--danger"
                aria-label={`删除自动化规则 ${ruleIndex + 1}`}
                disabled={rule.actions.some((step) => completionActionIds.has(step.id))}
                title={rule.actions.some((step) => completionActionIds.has(step.id))
                  ? '该规则的动画正被“动画完成”自动化引用，请先更改触发器。'
                  : undefined}
                onClick={() => onDeleteRule(rule.id)}
              >
                <Trash2 size={13} />删除规则
              </button>
            </div>
          </fieldset>
        )
      })}
    </section>
  )
}
