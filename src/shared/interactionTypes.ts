import type { RuntimePresentationTransition } from './runtimeTypes'

/** Defensive authoring limits; these are not normal courseware targets. */
export const MAX_SCENE_INTERACTIONS = 1_000
export const MAX_INTERACTION_CONDITIONS = 16
export const MAX_INTERACTION_ACTIONS = 32

export type AudioChannel = 'music' | 'narration' | 'sfx' | 'ui'

/** Project V6 trigger family retained exclusively for migration/parsing. */
export type InteractionTriggerV6 =
  | { type: 'node.click'; nodeId: string }
  | { type: 'scene.enter' }
  | { type: 'presentation.enter'; stateId: string }
  | { type: 'component.event'; nodeId: string; eventName: string }
  | {
      type: 'runtime.event'
      scope: 'scene' | 'global'
      eventName: string
    }
  | { type: 'audio.ended'; soundId: string }
  | { type: 'video.started'; nodeId: string }
  | { type: 'video.paused'; nodeId: string }
  | { type: 'video.ended'; nodeId: string }
  | { type: 'video.time'; nodeId: string; seconds: number }

export type InteractionTrigger = InteractionTriggerV6
  | { type: 'node.activated'; nodeId: string }
  | { type: 'animation.completed'; actionId: string }
  | { type: 'presenter.command'; command: 'next' | 'previous' }

/** Different conditions are ANDed. State ids inside one condition are ORed. */
export type InteractionCondition =
  | {
      type: 'presentation.in'
      stateIds: string[]
    }
  | {
      type: 'scene.in'
      sceneIds: string[]
    }

export type AudioActionTarget =
  | { kind: 'sound'; soundId: string }
  | { kind: 'channel'; channel: AudioChannel }
  | { kind: 'all' }

export interface AudioPlayAction {
  type: 'audio.play'
  soundId: string
  volume?: number
  loop?: boolean
  fadeInMs?: number
  lifetime?: 'scene' | 'course'
  ifPlaying?: 'restart' | 'continue' | 'ignore'
}

export interface AudioPauseAction {
  type: 'audio.pause'
  target: AudioActionTarget
  fadeOutMs?: number
}

export interface AudioResumeAction {
  type: 'audio.resume'
  target: AudioActionTarget
  fadeInMs?: number
}

export interface AudioStopAction {
  type: 'audio.stop'
  target: AudioActionTarget
  fadeOutMs?: number
}

export interface AudioToggleMuteAction {
  type: 'audio.toggle-mute'
  target: AudioActionTarget
}

export type AudioInteractionAction =
  | AudioPlayAction
  | AudioPauseAction
  | AudioResumeAction
  | AudioStopAction
  | AudioToggleMuteAction

export type VideoInteractionAction =
  | { type: 'video.play'; nodeId: string }
  | { type: 'video.pause'; nodeId: string }
  | { type: 'video.restart'; nodeId: string }
  | { type: 'video.stop'; nodeId: string }
  | { type: 'video.toggle'; nodeId: string }
  | { type: 'video.seek'; nodeId: string; seconds: number }

export type MotionEffect = 'none' | 'fade' | 'slide' | 'scale'
export type MotionDirection = 'left' | 'right' | 'up' | 'down'
export type MotionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

interface NodeMotionActionBase {
  nodeId: string
  durationMs: number
  easing: MotionEasing
}

type NodeMotionDescriptor =
  | { effect: 'slide'; direction: MotionDirection }
  | { effect: Exclude<MotionEffect, 'slide'>; direction?: never }

/** A host-level entrance/exit action. Timing lives on its enclosing step. */
export type NodeMotionAction = (
  | { type: 'node.enter' }
  | { type: 'node.exit' }
) & NodeMotionActionBase & NodeMotionDescriptor

/** Payload family used by both sequential and parallel Project V8 action steps. */
export type InteractionActionPayload =
  | {
      type: 'presentation.set'
      stateId: string
      transition?: RuntimePresentationTransition
    }
  | {
      type: 'scene.go'
      sceneId: string
      /** Omit to enter the target scene's authored initial state. */
      targetStateId?: string
    }
  | { type: 'scene.next' }
  | { type: 'scene.previous' }
  | { type: 'scene.replay' }
  | { type: 'course.restart' }
  | AudioInteractionAction
  | VideoInteractionAction
  | NodeMotionAction

/** Compatibility name: in V7 an InteractionAction is the step payload. */
export type InteractionAction = InteractionActionPayload

/** Project V6 had raw payload arrays and did not contain node motion actions. */
export type InteractionActionV6 = Exclude<InteractionActionPayload, NodeMotionAction>

export interface InteractionActionStep {
  /** Stable within one scene/global interaction scope; completion triggers reference it. */
  id: string
  start: 'after-previous' | 'with-previous'
  /** Relative to the triggering event or previous completed action group. */
  delayMs: number
  action: InteractionActionPayload
}

export interface InteractionRuleV6 {
  id: string
  name?: string
  enabled: boolean
  trigger: InteractionTriggerV6
  conditions: InteractionCondition[]
  actions: InteractionActionV6[]
}

export interface InteractionRule {
  id: string
  name?: string
  enabled: boolean
  trigger: InteractionTrigger
  conditions: InteractionCondition[]
  /** Steps execute as sequential/parallel groups. Terminal navigation owns the last group. */
  actions: InteractionActionStep[]
}

export type TerminalNavigationAction = Extract<
  InteractionActionPayload,
  {
    type:
      | 'scene.go'
      | 'scene.next'
      | 'scene.previous'
      | 'scene.replay'
      | 'course.restart'
  }
>

const terminalNavigationTypes = new Set<InteractionActionPayload['type']>([
  'scene.go',
  'scene.next',
  'scene.previous',
  'scene.replay',
  'course.restart',
])

export function isTerminalNavigationAction(
  action: InteractionActionPayload,
): action is TerminalNavigationAction {
  return terminalNavigationTypes.has(action.type)
}

export function isAudioInteractionAction(
  action: InteractionActionPayload,
): action is AudioInteractionAction {
  return action.type.startsWith('audio.')
}

export function isVideoInteractionAction(
  action: InteractionActionPayload,
): action is VideoInteractionAction {
  return action.type.startsWith('video.')
}

export function isNodeMotionAction(
  action: InteractionActionPayload,
): action is NodeMotionAction {
  return action.type === 'node.enter' || action.type === 'node.exit'
}
