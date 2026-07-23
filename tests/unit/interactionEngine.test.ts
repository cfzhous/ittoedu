import { describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import {
  InteractionEngine,
  type InteractionBindableRoot,
} from '@/player/InteractionEngine'
import type {
  InteractionAction,
  InteractionRule,
} from '@/shared/interactionTypes'
import type {
  RuntimeHostActions,
  RuntimePresentationApi,
} from '@/shared/runtimeTypes'

class FakeRoot implements InteractionBindableRoot {
  active = true
  visible = true
  input: { enabled?: boolean; cursor?: string } | null
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  constructor(cursor?: string) {
    this.input = cursor === undefined ? null : { enabled: true, cursor }
  }

  setInteractive(config?: { cursor?: string }): this {
    this.input ??= { enabled: true }
    if (config?.cursor) this.input.cursor = config.cursor
    return this
  }

  on(eventName: string, listener: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(eventName) ?? new Set()
    listeners.add(listener)
    this.listeners.set(eventName, listeners)
    return this
  }

  off(eventName: string, listener: (...args: unknown[]) => void): this {
    this.listeners.get(eventName)?.delete(listener)
    return this
  }

  emit(eventName: string): void {
    for (const listener of [...(this.listeners.get(eventName) ?? [])]) listener()
  }
}

function hostActions(): Readonly<RuntimeHostActions> {
  return {
    goToScene: vi.fn(() => true),
    nextScene: vi.fn(() => true),
    previousScene: vi.fn(() => true),
    replayScene: vi.fn(() => true),
    restartCourse: vi.fn(() => true),
  }
}

function presentationHarness(
  events: CourseEventBus,
  initialState = 'question',
): { api: RuntimePresentationApi; current(): string } {
  let currentState = initialState
  const apply = (stateId: string) => {
    if (currentState === stateId) return false
    const fromStateId = currentState
    currentState = stateId
    events.emit('presentation:change', {
      sceneId: 'scene_one',
      fromStateId,
      stateId,
    })
    return true
  }
  return {
    api: {
      current: () => currentState,
      states: () => [
        { id: 'question', name: '题目' },
        { id: 'feedback', name: '反馈' },
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      setState: apply,
      transitionTo: (stateId) => apply(stateId),
    },
    current: () => currentState,
  }
}

function clickRule(
  id: string,
  actions: InteractionAction[],
  stateIds: string[] = [],
): InteractionRule {
  return {
    id,
    enabled: true,
    trigger: { type: 'node.click', nodeId: 'button' },
    conditions: stateIds.length > 0
      ? [{ type: 'presentation.in', stateIds }]
      : [],
    actions: actionSteps(id, actions),
  }
}

function actionSteps(id: string, actions: InteractionAction[]): InteractionRule['actions'] {
  return actions.map((action, index) => ({
    id: `${id}_step_${index + 1}`,
    start: 'after-previous',
    delayMs: 0,
    action,
  }))
}

describe('InteractionEngine', () => {
  it('uses the trigger-time state snapshot and preserves rule/action order', async () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const order: string[] = []
    const rules: InteractionRule[] = [
      clickRule('first', [
        { type: 'audio.play', soundId: 'click' },
        { type: 'presentation.set', stateId: 'feedback' },
      ], ['question']),
      clickRule('second', [
        { type: 'video.play', nodeId: 'video' },
      ], ['question']),
      {
        id: 'feedback-enter',
        enabled: true,
        trigger: { type: 'presentation.enter', stateId: 'feedback' },
        conditions: [{ type: 'presentation.in', stateIds: ['feedback'] }],
        actions: actionSteps('feedback-enter', [
          { type: 'audio.play', soundId: 'feedback' },
        ]),
      },
    ]
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules,
      events,
      presentation: presentation.api,
      hostActions: hostActions(),
      executeAudioAction: (action) => {
        order.push('soundId' in action ? action.soundId : action.type)
      },
      executeVideoAction: (action) => { order.push(action.type) },
    })
    const root = new FakeRoot()
    engine.bindNodeHandles([{ id: 'button', root }])

    root.emit('pointerup')

    await vi.waitFor(() => {
      expect(presentation.current()).toBe('feedback')
      expect(order).toEqual(['click', 'video.play', 'feedback'])
    })
    engine.destroy()
  })

  it('forwards host navigation and media actions through injected callbacks', async () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const actions = hostActions()
    const audio = vi.fn()
    const video = vi.fn()
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [
        {
          id: 'component-complete',
          enabled: true,
          trigger: {
            type: 'component.event',
            nodeId: 'quiz',
            eventName: 'complete',
          },
          conditions: [],
          actions: actionSteps('component-complete', [
            {
              type: 'audio.stop',
              target: { kind: 'channel', channel: 'music' },
            },
            { type: 'video.restart', nodeId: 'explanation' },
            {
              type: 'scene.go',
              sceneId: 'scene_two',
              targetStateId: 'state_result',
            },
          ]),
        },
      ],
      events,
      presentation: presentation.api,
      hostActions: actions,
      executeAudioAction: audio,
      executeVideoAction: video,
    })

    events.emit('component:event', {
      scope: 'global',
      instanceId: 'quiz',
      eventName: 'complete',
    })
    expect(audio).not.toHaveBeenCalled()

    events.emit('component:event', {
      scope: 'scene',
      instanceId: 'quiz',
      eventName: 'complete',
    })
    await vi.waitFor(() => {
      expect(audio).toHaveBeenCalledWith(expect.objectContaining({
        type: 'audio.stop',
      }))
      expect(video).toHaveBeenCalledWith({
        type: 'video.restart',
        nodeId: 'explanation',
      })
      expect(actions.goToScene).toHaveBeenCalledWith(
        'scene_two',
        'state_result',
      )
    })
    engine.destroy()
  })

  it('routes runtime events by explicit scene/global source without same-name crosstalk', () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const audio = vi.fn()
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [
        {
          id: 'scene-runtime-complete',
          enabled: true,
          trigger: {
            type: 'runtime.event',
            scope: 'scene',
            eventName: 'complete',
          },
          conditions: [],
          actions: actionSteps('scene-runtime-complete', [
            { type: 'audio.play', soundId: 'scene-sound' },
          ]),
        },
        {
          id: 'global-runtime-complete',
          enabled: true,
          trigger: {
            type: 'runtime.event',
            scope: 'global',
            eventName: 'complete',
          },
          conditions: [],
          actions: actionSteps('global-runtime-complete', [
            { type: 'audio.play', soundId: 'global-sound' },
          ]),
        },
      ],
      events,
      presentation: presentation.api,
      hostActions: hostActions(),
      executeAudioAction: audio,
    })

    events.emit('runtime:event', {
      scope: 'scene',
      sceneId: 'scene_two',
      eventName: 'complete',
    })
    expect(audio).not.toHaveBeenCalled()

    events.emit('runtime:event', {
      scope: 'global',
      eventName: 'complete',
    })
    expect(audio).toHaveBeenLastCalledWith({
      type: 'audio.play',
      soundId: 'global-sound',
    })

    events.emit('runtime:event', {
      scope: 'scene',
      sceneId: 'scene_one',
      eventName: 'complete',
    })
    expect(audio).toHaveBeenLastCalledWith({
      type: 'audio.play',
      soundId: 'scene-sound',
    })
    expect(audio).toHaveBeenCalledTimes(2)
    engine.destroy()
  })

  it('keeps global bindings alive while scene.in follows the active scene', () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const actions = hostActions()
    let currentSceneId = 'scene_one'
    const engine = new InteractionEngine({
      scope: 'global',
      sceneId: '',
      currentSceneId: () => currentSceneId,
      rules: [
        {
          id: 'global-scene-button',
          enabled: true,
          trigger: { type: 'node.click', nodeId: 'global-button' },
          conditions: [{ type: 'scene.in', sceneIds: ['scene_two'] }],
          actions: actionSteps('global-scene-button', [{
            type: 'scene.go',
            sceneId: 'scene_result',
            targetStateId: 'summary',
          }]),
        },
        {
          id: 'global-component',
          enabled: true,
          trigger: {
            type: 'component.event',
            nodeId: 'global-widget',
            eventName: 'complete',
          },
          conditions: [],
          actions: actionSteps('global-component', [{ type: 'scene.next' }]),
        },
      ],
      events,
      presentation: presentation.api,
      hostActions: actions,
    })
    const root = new FakeRoot()
    engine.bindNodeHandles([{ id: 'global-button', root }])

    root.emit('pointerup')
    expect(actions.goToScene).not.toHaveBeenCalled()

    currentSceneId = 'scene_two'
    events.emit('scene:enter', { sceneId: 'scene_two' })
    root.emit('pointerup')
    expect(actions.goToScene).toHaveBeenCalledWith('scene_result', 'summary')

    events.emit('component:event', {
      scope: 'scene',
      sceneId: 'scene_two',
      instanceId: 'global-widget',
      eventName: 'complete',
    })
    expect(actions.nextScene).not.toHaveBeenCalled()
    events.emit('component:event', {
      scope: 'global',
      instanceId: 'global-widget',
      eventName: 'complete',
    })
    expect(actions.nextScene).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('evaluates a persistent global motion completion in the scene active when it finishes', async () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    let currentSceneId = 'scene_one'
    let finishMotion: ((completed: boolean) => void) | undefined
    const audio = vi.fn()
    const engine = new InteractionEngine({
      scope: 'global',
      sceneId: '',
      currentSceneId: () => currentSceneId,
      rules: [
        {
          id: 'global-exit',
          enabled: true,
          trigger: { type: 'node.click', nodeId: 'global-button' },
          conditions: [],
          actions: [{
            id: 'global-exit-step',
            start: 'after-previous',
            delayMs: 0,
            action: {
              type: 'node.exit',
              nodeId: 'global-card',
              effect: 'fade',
              durationMs: 300,
              easing: 'ease-out',
            },
          }],
        },
        {
          id: 'after-global-exit',
          enabled: true,
          trigger: {
            type: 'animation.completed',
            actionId: 'global-exit-step',
          },
          conditions: [{ type: 'scene.in', sceneIds: ['scene_two'] }],
          actions: actionSteps('after-global-exit', [
            { type: 'audio.play', soundId: 'finished-in-scene-two' },
          ]),
        },
      ],
      events,
      presentation: presentation.api,
      hostActions: hostActions(),
      executeAudioAction: audio,
      executeNodeMotion: () => new Promise((resolve) => {
        finishMotion = resolve
      }),
    })
    const root = new FakeRoot()
    engine.bindNodeHandles([{ id: 'global-button', root }])

    root.emit('pointerup')
    expect(finishMotion).toBeTypeOf('function')
    currentSceneId = 'scene_two'
    finishMotion?.(true)

    await vi.waitFor(() => {
      expect(audio).toHaveBeenCalledWith({
        type: 'audio.play',
        soundId: 'finished-in-scene-two',
      })
    })
    engine.destroy()
  })

  it('cancels a delayed global scene-conditioned action after navigation', async () => {
    vi.useFakeTimers()
    try {
      const events = new CourseEventBus()
      const presentation = presentationHarness(events)
      let currentSceneId = 'scene_one'
      const audio = vi.fn()
      const engine = new InteractionEngine({
        scope: 'global',
        sceneId: '',
        currentSceneId: () => currentSceneId,
        rules: [{
          id: 'scene-one-delayed-audio',
          enabled: true,
          trigger: { type: 'node.click', nodeId: 'global-button' },
          conditions: [{ type: 'scene.in', sceneIds: ['scene_one'] }],
          actions: [{
            id: 'delayed-audio',
            start: 'after-previous',
            delayMs: 300,
            action: { type: 'audio.play', soundId: 'scene-one-only' },
          }],
        }],
        events,
        presentation: presentation.api,
        hostActions: hostActions(),
        executeAudioAction: audio,
      })
      const root = new FakeRoot()
      engine.bindNodeHandles([{ id: 'global-button', root }])

      root.emit('pointerup')
      currentSceneId = 'scene_two'
      events.emit('scene:enter', { sceneId: 'scene_two' })
      await vi.advanceTimersByTimeAsync(300)

      expect(audio).not.toHaveBeenCalled()
      engine.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('filters scene-qualified media events and handles direct media dispatch', () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const audio = vi.fn()
    const video = vi.fn()
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [
        {
          id: 'narration-ended',
          enabled: true,
          trigger: { type: 'audio.ended', soundId: 'narration' },
          conditions: [],
          actions: actionSteps('narration-ended', [
            { type: 'audio.play', soundId: 'music' },
          ]),
        },
        {
          id: 'video-cue',
          enabled: true,
          trigger: { type: 'video.time', nodeId: 'video', seconds: 12 },
          conditions: [],
          actions: actionSteps('video-cue', [
            { type: 'video.pause', nodeId: 'video' },
          ]),
        },
      ],
      events,
      presentation: presentation.api,
      hostActions: hostActions(),
      executeAudioAction: audio,
      executeVideoAction: video,
    })

    events.emit('audio:ended', {
      sceneId: 'scene_two',
      soundId: 'narration',
    })
    expect(audio).not.toHaveBeenCalled()

    events.emit('audio:ended', {
      sceneId: 'scene_one',
      soundId: 'narration',
    })
    engine.dispatch({ type: 'video.time', nodeId: 'video', seconds: 12 })
    expect(audio).toHaveBeenCalledTimes(1)
    expect(video).toHaveBeenCalledWith({
      type: 'video.pause',
      nodeId: 'video',
    })
    engine.destroy()
  })

  it('fires video time rules when a playhead crosses thresholds and rearms after rewind', () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const video = vi.fn()
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [
        {
          id: 'cue-ten',
          enabled: true,
          trigger: { type: 'video.time', nodeId: 'video', seconds: 10 },
          conditions: [],
          actions: actionSteps('cue-ten', [
            { type: 'video.pause', nodeId: 'video' },
          ]),
        },
        {
          id: 'cue-twelve',
          enabled: true,
          trigger: { type: 'video.time', nodeId: 'video', seconds: 12 },
          conditions: [],
          actions: actionSteps('cue-twelve', [
            { type: 'video.seek', nodeId: 'video', seconds: 18 },
          ]),
        },
      ],
      events,
      presentation: presentation.api,
      hostActions: hostActions(),
      executeVideoAction: video,
    })

    engine.dispatch({ type: 'video.time', nodeId: 'video', seconds: 9.82 })
    expect(video).not.toHaveBeenCalled()
    engine.dispatch({ type: 'video.time', nodeId: 'video', seconds: 10.16 })
    engine.dispatch({ type: 'video.time', nodeId: 'video', seconds: 10.74 })
    expect(video).toHaveBeenCalledTimes(1)
    engine.dispatch({ type: 'video.time', nodeId: 'video', seconds: 12.4 })
    expect(video).toHaveBeenCalledTimes(2)

    engine.dispatch({ type: 'video.time', nodeId: 'video', seconds: 3 })
    engine.dispatch({ type: 'video.time', nodeId: 'video', seconds: 10.01 })
    expect(video).toHaveBeenCalledTimes(3)
    expect(video).toHaveBeenLastCalledWith({
      type: 'video.pause',
      nodeId: 'video',
    })
    engine.destroy()
  })

  it('keeps unrelated pointer listeners and restores an existing cursor', () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const root = new FakeRoot('crosshair')
    const existing = vi.fn()
    root.on('pointerup', existing)
    const actions = hostActions()
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [clickRule('next', [{ type: 'scene.next' }])],
      events,
      presentation: presentation.api,
      hostActions: actions,
    })

    engine.bindNodeHandles([{ id: 'button', root }])
    engine.bindNodeHandles([{ id: 'button', root }])
    expect(root.input?.cursor).toBe('pointer')
    root.emit('pointerup')
    expect(existing).toHaveBeenCalledTimes(1)
    expect(actions.nextScene).toHaveBeenCalledTimes(1)

    engine.destroy()
    expect(root.input?.cursor).toBe('crosshair')
    root.emit('pointerup')
    expect(existing).toHaveBeenCalledTimes(2)
    expect(actions.nextScene).toHaveBeenCalledTimes(1)
    expect(events.listenerCount()).toBe(0)
  })

  it('runs with-previous steps in parallel, awaits motion, and emits completion by step id', async () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const audioOrder: string[] = []
    const motionOrder: string[] = []
    const resolveMotion: Array<(completed: boolean) => void> = []
    const rules: InteractionRule[] = [
      {
        id: 'reveal-result',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'button' },
        conditions: [],
        actions: [
          {
            id: 'hide-prompt',
            start: 'after-previous',
            delayMs: 0,
            action: {
              type: 'node.exit',
              nodeId: 'prompt',
              effect: 'fade',
              durationMs: 240,
              easing: 'ease-out',
            },
          },
          {
            id: 'parallel-sound',
            start: 'with-previous',
            delayMs: 0,
            action: { type: 'audio.play', soundId: 'transition' },
          },
          {
            id: 'show-result',
            start: 'after-previous',
            delayMs: 0,
            action: {
              type: 'node.enter',
              nodeId: 'result',
              effect: 'scale',
              durationMs: 320,
              easing: 'ease-out',
            },
          },
        ],
      },
      {
        id: 'after-prompt-hidden',
        enabled: true,
        trigger: { type: 'animation.completed', actionId: 'hide-prompt' },
        conditions: [],
        actions: actionSteps('after-prompt-hidden', [
          { type: 'audio.play', soundId: 'prompt-hidden' },
        ]),
      },
    ]
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules,
      events,
      presentation: presentation.api,
      hostActions: hostActions(),
      executeAudioAction: (action) => {
        if ('soundId' in action) audioOrder.push(action.soundId)
      },
      executeNodeMotion: (action) => {
        motionOrder.push(action.nodeId)
        return new Promise((resolve) => resolveMotion.push(resolve))
      },
    })
    const root = new FakeRoot()
    engine.bindNodeHandles([{ id: 'button', root }])

    root.emit('pointerup')
    expect(motionOrder).toEqual(['prompt'])
    expect(audioOrder).toEqual(['transition'])

    resolveMotion.shift()?.(true)
    await vi.waitFor(() => {
      expect(audioOrder).toEqual(['transition', 'prompt-hidden'])
      expect(motionOrder).toEqual(['prompt', 'result'])
    })
    resolveMotion.shift()?.(true)
    await Promise.resolve()
    engine.destroy()
  })

  it('restarts a retriggered rule, aborts its old motion, and suppresses stale completion', async () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const after = vi.fn()
    const completions = vi.fn()
    events.on('animation:completed', completions)
    const pending: Array<(completed: boolean) => void> = []
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [
        {
          id: 'repeatable-exit',
          enabled: true,
          trigger: { type: 'node.click', nodeId: 'button' },
          conditions: [],
          actions: [
            {
              id: 'exit-card',
              start: 'after-previous',
              delayMs: 0,
              action: {
                type: 'node.exit',
                nodeId: 'card',
                effect: 'fade',
                durationMs: 300,
                easing: 'ease-out',
              },
            },
            {
              id: 'after-exit',
              start: 'after-previous',
              delayMs: 0,
              action: { type: 'audio.play', soundId: 'after' },
            },
          ],
        },
      ],
      events,
      presentation: presentation.api,
      hostActions: hostActions(),
      executeAudioAction: after,
      executeNodeMotion: (_action, context) => new Promise((resolve) => {
        pending.push(resolve)
        context.signal.addEventListener('abort', () => resolve(false), { once: true })
      }),
    })
    const root = new FakeRoot()
    engine.bindNodeHandles([{ id: 'button', root }])

    root.emit('pointerup')
    root.emit('pointerup')
    expect(pending).toHaveLength(2)
    pending[0]?.(true)
    await Promise.resolve()
    expect(completions).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()

    pending[1]?.(true)
    await vi.waitFor(() => {
      expect(completions).toHaveBeenCalledTimes(1)
      expect(after).toHaveBeenCalledWith({ type: 'audio.play', soundId: 'after' })
    })
    engine.destroy()
  })

  it('applies step delay relative to the group and cancels a stale delayed run', async () => {
    vi.useFakeTimers()
    try {
      const events = new CourseEventBus()
      const presentation = presentationHarness(events)
      const audio = vi.fn()
      const engine = new InteractionEngine({
        sceneId: 'scene_one',
        rules: [
          {
            id: 'delayed-feedback',
            enabled: true,
            trigger: { type: 'node.click', nodeId: 'button' },
            conditions: [],
            actions: [
              {
                id: 'delayed-sound',
                start: 'after-previous',
                delayMs: 100,
                action: { type: 'audio.play', soundId: 'feedback' },
              },
            ],
          },
        ],
        events,
        presentation: presentation.api,
        hostActions: hostActions(),
        executeAudioAction: audio,
      })
      const root = new FakeRoot()
      engine.bindNodeHandles([{ id: 'button', root }])

      root.emit('pointerup')
      await vi.advanceTimersByTimeAsync(50)
      root.emit('pointerup')
      await vi.advanceTimersByTimeAsync(50)
      expect(audio).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(50)
      expect(audio).toHaveBeenCalledTimes(1)
      engine.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('routes node activation by scope and scene without treating node.enter as activation', () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events)
    const audio = vi.fn()
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [
        {
          id: 'activated',
          enabled: true,
          trigger: { type: 'node.activated', nodeId: 'card' },
          conditions: [],
          actions: actionSteps('activated', [
            { type: 'audio.play', soundId: 'activated' },
          ]),
        },
      ],
      events,
      presentation: presentation.api,
      hostActions: hostActions(),
      executeAudioAction: audio,
    })

    events.emit('node:activated', {
      scope: 'global',
      sceneId: 'scene_one',
      nodeId: 'card',
    })
    events.emit('node:activated', {
      scope: 'scene',
      sceneId: 'scene_two',
      nodeId: 'card',
    })
    expect(audio).not.toHaveBeenCalled()
    events.emit('node:activated', {
      scope: 'scene',
      sceneId: 'scene_one',
      nodeId: 'card',
    })
    expect(audio).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('stops cyclic presentation-enter chains at the configured limit', () => {
    const events = new CourseEventBus()
    const presentation = presentationHarness(events, 'a')
    const errors = vi.fn()
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [
        {
          id: 'a-to-b',
          enabled: true,
          trigger: { type: 'presentation.enter', stateId: 'a' },
          conditions: [],
          actions: actionSteps('a-to-b', [
            { type: 'presentation.set', stateId: 'b' },
          ]),
        },
        {
          id: 'b-to-a',
          enabled: true,
          trigger: { type: 'presentation.enter', stateId: 'b' },
          conditions: [],
          actions: actionSteps('b-to-a', [
            { type: 'presentation.set', stateId: 'a' },
          ]),
        },
      ],
      events,
      presentation: presentation.api,
      hostActions: hostActions(),
      maxChainDepth: 4,
      onError: errors,
    })

    engine.dispatch({ type: 'presentation.enter', stateId: 'a' }, 'a')

    expect(errors).toHaveBeenCalledTimes(1)
    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('4') }),
      { phase: 'chain-limit' },
    )
    engine.destroy()
  })
})
