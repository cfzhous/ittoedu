import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as Phaser from 'phaser'
import { CourseEventBus } from '@/player/CourseEventBus'
import { InteractionEngine } from '@/player/InteractionEngine'
import { NodeMotionDirector } from '@/player/NodeMotionDirector'
import type { RenderedNodeHandle } from '@/player/renderNode'
import type { NodeMotionAction } from '@/shared/interactionTypes'
import type { SceneNode } from '@/shared/projectTypes'

interface TweenConfig {
  targets: FakeRoot
  x?: number
  y?: number
  alpha?: number
  scaleX?: number
  scaleY?: number
  duration: number
  ease: string
  onComplete(): void
}

interface DelayedCall {
  delay: number
  callback(): void
  remove: ReturnType<typeof vi.fn>
}

class FakeRoot {
  active = true
  visible = true
  x = 200
  y = 130
  angle = 0
  alpha = 0.75
  scaleX = 1
  scaleY = 1
  width = 200
  height = 100
  input: { enabled: boolean } | null = { enabled: true }
  readonly list: FakeRoot[] = []

  setVisible(value: boolean): this {
    this.visible = value
    return this
  }

  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this
  }

  setAlpha(alpha: number): this {
    this.alpha = alpha
    return this
  }

  setScale(x: number, y = x): this {
    this.scaleX = x
    this.scaleY = y
    return this
  }
}

function sceneHarness(): {
  scene: Phaser.Scene
  tweens: TweenConfig[]
  delayedCalls: DelayedCall[]
  killTweensOf: ReturnType<typeof vi.fn>
} {
  const tweens: TweenConfig[] = []
  const delayedCalls: DelayedCall[] = []
  const killTweensOf = vi.fn()
  return {
    scene: {
      tweens: {
        killTweensOf,
        add: vi.fn((config: TweenConfig) => {
          tweens.push(config)
          return { stop: vi.fn() }
        }),
      },
      time: {
        delayedCall: vi.fn((delay: number, callback: () => void) => {
          const call: DelayedCall = {
            delay,
            callback,
            remove: vi.fn(),
          }
          delayedCalls.push(call)
          return call
        }),
      },
    } as unknown as Phaser.Scene,
    tweens,
    delayedCalls,
    killTweensOf,
  }
}

function node(
  playbackInitialVisibility: 'inherit' | 'hidden' = 'inherit',
): SceneNode {
  return {
    id: 'result-card',
    name: '结果卡片',
    type: 'shape',
    x: 100,
    y: 80,
    width: 200,
    height: 100,
    rotation: 0,
    opacity: 0.75,
    visible: true,
    locked: false,
    playbackInitialVisibility,
    shapeType: 'rectangle',
    style: {
      fillColor: '#ffffff',
      fillOpacity: 1,
      borderColor: '#000000',
      borderOpacity: 1,
      borderWidth: 0,
      lineStyle: 'solid',
      cornerRadius: 0,
      startArrow: 'none',
      endArrow: 'none',
    },
  }
}

function handle(root: FakeRoot, motionVisible = vi.fn()): RenderedNodeHandle {
  return {
    id: 'result-card',
    type: 'shape',
    root: root as unknown as Phaser.GameObjects.Container,
    setMotionVisible: (visible) => {
      motionVisible(visible)
      root.setVisible(visible)
    },
    update: vi.fn(),
    destroy: vi.fn(),
  }
}

function action(
  type: 'node.enter' | 'node.exit',
  effect: 'fade' | 'slide' | 'scale' | 'none' = 'fade',
): NodeMotionAction {
  if (effect === 'slide') {
    return {
      type,
      nodeId: 'result-card',
      effect,
      direction: 'left',
      durationMs: 300,
      easing: 'ease-out',
    }
  }
  return {
    type,
    nodeId: 'result-card',
    effect,
    durationMs: 300,
    easing: 'ease-out',
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('NodeMotionDirector', () => {
  it('在 capture 语义的编辑 Player 中仍可临时预览动画并恢复稳定帧', async () => {
    const { scene, tweens, delayedCalls } = sceneHarness()
    const root = new FakeRoot()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'capture',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    director.register(handle(root), node())

    expect(director.preview(action('node.enter', 'fade'))).toBe(true)
    expect(root.alpha).toBe(0)
    expect(tweens[0]).toMatchObject({ duration: 300, alpha: 0.75 })
    tweens[0]!.onComplete()
    await Promise.resolve()
    expect(root).toMatchObject({ visible: true, alpha: 0.75 })

    expect(director.preview(action('node.exit', 'fade'))).toBe(true)
    expect(tweens[1]).toMatchObject({ duration: 300, alpha: 0 })
    tweens[1]!.onComplete()
    await Promise.resolve()
    expect(root.visible).toBe(false)
    expect(delayedCalls.at(-1)?.delay).toBe(180)
    delayedCalls.at(-1)?.callback()
    expect(root).toMatchObject({ visible: true, alpha: 0.75 })
  })

  it('隐藏窗口不推进 Phaser tween 时由预览 watchdog 恢复稳定帧', async () => {
    vi.useFakeTimers()
    const { scene, tweens, killTweensOf } = sceneHarness()
    const root = new FakeRoot()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'capture',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    director.register(handle(root), node())

    expect(director.preview(action('node.enter', 'fade'))).toBe(true)
    expect(root.alpha).toBe(0)
    expect(tweens).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(801)
    expect(root).toMatchObject({ visible: true, alpha: 0.75 })
    expect(killTweensOf).toHaveBeenCalled()

    // A late Phaser callback belongs to the cancelled token and cannot move
    // the already restored authoring frame again.
    tweens[0]!.onComplete()
    await Promise.resolve()
    expect(root).toMatchObject({ visible: true, alpha: 0.75 })
  })

  it('退场 tween 完成但场景时钟不推进时仍保留停留后再恢复', async () => {
    vi.useFakeTimers()
    const { scene, tweens, delayedCalls } = sceneHarness()
    const root = new FakeRoot()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'capture',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    director.register(handle(root), node())

    expect(director.preview(action('node.exit', 'fade'))).toBe(true)
    tweens[0]!.onComplete()
    await Promise.resolve()
    expect(root.visible).toBe(false)
    expect(delayedCalls.at(-1)?.delay).toBe(180)

    await vi.advanceTimersByTimeAsync(981)
    expect(root).toMatchObject({ visible: true, alpha: 0.75 })
  })

  it('旧预览 watchdog 不会提前恢复新的同节点预览', async () => {
    vi.useFakeTimers()
    const { scene } = sceneHarness()
    const root = new FakeRoot()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'capture',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    director.register(handle(root), node())

    expect(director.preview(action('node.enter', 'fade'))).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(director.preview(action('node.enter', 'fade'))).toBe(true)

    await vi.advanceTimersByTimeAsync(701)
    expect(root.alpha).toBe(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(root.alpha).toBe(0.75)
  })

  it('注销或销毁节点会清理未完成的预览 watchdog', () => {
    vi.useFakeTimers()
    const firstHarness = sceneHarness()
    const firstRoot = new FakeRoot()
    const firstDirector = new NodeMotionDirector({
      scene: firstHarness.scene,
      scope: 'scene',
      mode: 'capture',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    firstDirector.register(handle(firstRoot), node())
    expect(firstDirector.preview(action('node.enter', 'fade'))).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    firstDirector.unregister('result-card')
    expect(vi.getTimerCount()).toBe(0)

    const secondHarness = sceneHarness()
    const secondRoot = new FakeRoot()
    const secondDirector = new NodeMotionDirector({
      scene: secondHarness.scene,
      scope: 'scene',
      mode: 'capture',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    secondDirector.register(handle(secondRoot), node())
    expect(secondDirector.preview(action('node.enter', 'fade'))).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    secondDirector.clear()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('isolates playback motion from an in-flight authored presentation frame', async () => {
    const { scene, tweens, killTweensOf } = sceneHarness()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'preview',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    const authoredRoot = new FakeRoot()
    authoredRoot.x = 410
    authoredRoot.y = 260
    authoredRoot.angle = 18
    authoredRoot.alpha = 0.42
    authoredRoot.scaleX = 1.15
    authoredRoot.scaleY = 0.92
    const motionRoot = new FakeRoot()
    motionRoot.x = 0
    motionRoot.y = 0
    motionRoot.alpha = 1
    motionRoot.scaleX = 1
    motionRoot.scaleY = 1
    const authoredEnabledChild = new FakeRoot()
    const authoredDisabledChild = new FakeRoot()
    authoredDisabledChild.input!.enabled = false
    motionRoot.list.push(authoredEnabledChild, authoredDisabledChild)
    authoredRoot.list.push(motionRoot)
    const rendered: RenderedNodeHandle = {
      id: 'result-card',
      type: 'shape',
      root: authoredRoot as unknown as Phaser.GameObjects.Container,
      motionRoot: motionRoot as unknown as Phaser.GameObjects.Container,
      update: vi.fn(),
      destroy: vi.fn(),
    }

    director.register(rendered, node())
    expect(motionRoot).toMatchObject({
      x: 0,
      y: 0,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
    })
    expect(authoredRoot).toMatchObject({
      x: 410,
      y: 260,
      angle: 18,
      alpha: 0.42,
      scaleX: 1.15,
      scaleY: 0.92,
    })

    killTweensOf.mockClear()
    const exiting = director.play(action('node.exit', 'slide'))
    expect(tweens[0]).toMatchObject({
      targets: motionRoot,
      x: -48,
      y: 0,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
    })
    expect(authoredRoot.input?.enabled).toBe(false)
    expect(authoredEnabledChild.input?.enabled).toBe(false)
    expect(authoredDisabledChild.input?.enabled).toBe(false)

    // Simulate a presentation tween advancing while playback motion is active.
    authoredRoot.x = 455
    authoredRoot.y = 292
    authoredRoot.angle = 31
    authoredRoot.alpha = 0.63
    tweens[0]!.onComplete()
    await expect(exiting).resolves.toBe(true)

    expect(authoredRoot).toMatchObject({
      x: 455,
      y: 292,
      angle: 31,
      alpha: 0.63,
      scaleX: 1.15,
      scaleY: 0.92,
      visible: true,
    })
    expect(motionRoot).toMatchObject({
      x: 0,
      y: 0,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      visible: false,
    })
    expect(authoredRoot.input?.enabled).toBe(false)

    const entering = director.play(action('node.enter', 'slide'))
    expect(motionRoot).toMatchObject({ x: -48, y: 0, visible: true })
    expect(tweens[1]).toMatchObject({
      targets: motionRoot,
      x: 0,
      y: 0,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
    })
    authoredRoot.x = 480
    authoredRoot.y = 310
    authoredRoot.angle = 45
    authoredRoot.alpha = 0.7
    tweens[1]!.onComplete()
    await expect(entering).resolves.toBe(true)

    expect(authoredRoot).toMatchObject({
      x: 480,
      y: 310,
      angle: 45,
      alpha: 0.7,
      scaleX: 1.15,
      scaleY: 0.92,
      visible: true,
    })
    expect(motionRoot).toMatchObject({
      x: 0,
      y: 0,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      visible: true,
    })
    expect(authoredRoot.input?.enabled).toBe(true)
    expect(authoredEnabledChild.input?.enabled).toBe(true)
    expect(authoredDisabledChild.input?.enabled).toBe(false)
    expect(killTweensOf).toHaveBeenCalled()
    expect(killTweensOf.mock.calls.every(([target]) => target === motionRoot)).toBe(true)
  })

  it('keeps playback-initial visibility transient and emits stable activation once', () => {
    const { scene } = sceneHarness()
    const events = new CourseEventBus()
    const activated = vi.fn()
    events.on('node:activated', activated)
    const root = new FakeRoot()
    const motionVisible = vi.fn()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'preview',
      events,
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })

    director.register(handle(root, motionVisible), node('hidden'))
    director.refreshInputStates()

    expect(root.visible).toBe(false)
    expect(root.input?.enabled).toBe(false)
    expect(motionVisible).toHaveBeenLastCalledWith(false)
    director.flushActivations()
    expect(activated).toHaveBeenCalledWith({
      scope: 'scene',
      sceneId: 'scene_one',
      nodeId: 'result-card',
    })
    director.flushActivations()
    expect(activated).toHaveBeenCalledTimes(1)
  })

  it('plays enter and exit on the host frame while keeping authored visibility unchanged', async () => {
    const { scene, tweens } = sceneHarness()
    const events = new CourseEventBus()
    const authored = node('hidden')
    const root = new FakeRoot()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'preview',
      events,
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    director.register(handle(root), authored)

    const entering = director.play(action('node.enter', 'slide'))
    expect(root.visible).toBe(true)
    expect(root.x).toBe(152)
    expect(root.input?.enabled).toBe(false)
    expect(tweens[0]).toMatchObject({
      x: 200,
      y: 130,
      duration: 300,
      ease: 'Sine.easeOut',
    })
    tweens[0]!.onComplete()
    await expect(entering).resolves.toBe(true)
    expect(root.visible).toBe(true)
    expect(root.input?.enabled).toBe(true)

    const exiting = director.play(action('node.exit'))
    expect(root.input?.enabled).toBe(false)
    expect(tweens[1]).toMatchObject({ alpha: 0 })
    tweens[1]!.onComplete()
    await expect(exiting).resolves.toBe(true)
    expect(root.visible).toBe(false)
    expect(root.alpha).toBe(0.75)
    expect(authored.visible).toBe(true)
  })

  it('replays a state-conditioned entrance from its hidden endpoint on a new activation epoch', async () => {
    vi.useFakeTimers()
    const { scene, tweens } = sceneHarness()
    const events = new CourseEventBus()
    const root = new FakeRoot()
    const rendered = handle(root)
    let stateId: string | null = 'state-a'
    const completed = vi.fn()
    events.on('animation:completed', completed)
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'preview',
      events,
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [{
        id: 'enter-on-state-b',
        name: '进入 B 时入场',
        enabled: true,
        trigger: { type: 'node.activated', nodeId: 'result-card' },
        conditions: [{ type: 'presentation.in', stateIds: ['state-b'] }],
        actions: [{
          id: 'enter-result-card',
          start: 'after-previous',
          delayMs: 40,
          action: action('node.enter', 'slide'),
        }],
      }],
      events,
      presentation: {
        current: () => stateId,
        states: () => [
          { id: 'state-a', name: '状态 A' },
          { id: 'state-b', name: '状态 B' },
        ],
        setState: () => false,
        transitionTo: () => false,
      },
      hostActions: {
        goToScene: () => false,
        nextScene: () => false,
        previousScene: () => false,
        replayScene: () => false,
        restartCourse: () => false,
      },
      executeNodeMotion: (motion, context) =>
        director.play(motion, context.signal),
    })

    director.register(rendered, node('inherit'))
    director.flushActivations()
    expect(tweens).toHaveLength(0)

    stateId = 'state-b'
    director.update(rendered, node('hidden'))
    director.beginActivationEpoch('result-card', 'scene_one')
    expect(root.visible).toBe(false)

    director.flushActivations()
    expect(root.visible).toBe(false)
    expect(tweens).toHaveLength(0)
    expect(completed).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(39)
    expect(root.visible).toBe(false)
    expect(tweens).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(root.visible).toBe(true)
    expect(root.x).toBe(152)
    expect(root.input?.enabled).toBe(false)
    expect(tweens).toHaveLength(1)
    expect(completed).not.toHaveBeenCalled()

    tweens[0]!.onComplete()
    await Promise.resolve()
    await Promise.resolve()
    expect(root.x).toBe(200)
    expect(root.visible).toBe(true)
    expect(completed).toHaveBeenCalledWith({
      scope: 'scene',
      actionId: 'enter-result-card',
      nodeId: 'result-card',
      sceneId: 'scene_one',
    })
    engine.destroy()
    vi.useRealTimers()
  })

  it('lets the latest same-node motion win and cancels the old waiter', async () => {
    const { scene, tweens } = sceneHarness()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'preview',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    const root = new FakeRoot()
    director.register(handle(root), node())

    const exiting = director.play(action('node.exit', 'slide'))
    root.x = 184
    const entering = director.play(action('node.enter', 'slide'))

    await expect(exiting).resolves.toBe(false)
    expect(root.x).toBe(184)
    expect(tweens[1]).toMatchObject({ x: 200 })
    tweens[1]!.onComplete()
    await expect(entering).resolves.toBe(true)
    expect(root.x).toBe(200)
    expect(root.visible).toBe(true)
  })

  it('keeps direct/default takeover on the current frame after an abort', async () => {
    const { scene, tweens } = sceneHarness()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'preview',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    const root = new FakeRoot()
    director.register(handle(root), node('hidden'))
    const firstRun = new AbortController()
    const first = director.play(action('node.enter'), firstRun.signal)
    root.alpha = 0.3
    firstRun.abort()
    await expect(first).resolves.toBe(false)

    const restarted = director.play(action('node.enter'))
    expect(root.alpha).toBe(0.3)
    expect(tweens).toHaveLength(2)
    tweens[1]!.onComplete()
    await expect(restarted).resolves.toBe(true)
    expect(root.alpha).toBe(0.75)
  })

  it('restarts a still-active rule entrance from its authored hidden endpoint', async () => {
    const { scene, tweens } = sceneHarness()
    const events = new CourseEventBus()
    const completed = vi.fn()
    events.on('animation:completed', completed)
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'preview',
      events,
      sceneId: 'scene_one',
      prefersReducedMotion: () => false,
    })
    const root = new FakeRoot()
    director.register(handle(root), node('hidden'))
    const engine = new InteractionEngine({
      sceneId: 'scene_one',
      rules: [{
        id: 'repeatable-enter',
        name: '可重触发入场',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'button' },
        conditions: [],
        actions: [{
          id: 'enter-result-card',
          start: 'after-previous',
          delayMs: 0,
          action: action('node.enter'),
        }],
      }],
      events,
      presentation: {
        current: () => null,
        states: () => [],
        setState: () => false,
        transitionTo: () => false,
      },
      hostActions: {
        goToScene: () => false,
        nextScene: () => false,
        previousScene: () => false,
        replayScene: () => false,
        restartCourse: () => false,
      },
      executeNodeMotion: (motion, context) => director.play(
        motion,
        context.signal,
        { restartFromBeginning: context.restartFromBeginning },
      ),
    })

    engine.dispatch({ type: 'node.click', nodeId: 'button' })
    expect(tweens).toHaveLength(1)
    expect(root.alpha).toBe(0)

    root.alpha = 0.375
    engine.dispatch({ type: 'node.click', nodeId: 'button' })

    expect(tweens).toHaveLength(2)
    expect(root.alpha).toBe(0)
    expect(tweens[1]).toMatchObject({ alpha: 0.75, duration: 300 })
    tweens[0]!.onComplete()
    await Promise.resolve()
    expect(completed).not.toHaveBeenCalled()

    tweens[1]!.onComplete()
    await vi.waitFor(() => {
      expect(completed).toHaveBeenCalledTimes(1)
    })
    expect(root.alpha).toBe(0.75)
    engine.destroy()
  })

  it('replays a completed exit when its rule is retriggered during a later delay', async () => {
    vi.useFakeTimers()
    try {
      const { scene, tweens } = sceneHarness()
      const events = new CourseEventBus()
      const completed = vi.fn()
      const audio = vi.fn()
      events.on('animation:completed', completed)
      const director = new NodeMotionDirector({
        scene,
        scope: 'scene',
        mode: 'preview',
        events,
        sceneId: 'scene_one',
        prefersReducedMotion: () => false,
      })
      const root = new FakeRoot()
      director.register(handle(root), node())
      const engine = new InteractionEngine({
        sceneId: 'scene_one',
        rules: [{
          id: 'repeatable-exit',
          name: '可重触发退场',
          enabled: true,
          trigger: { type: 'node.click', nodeId: 'button' },
          conditions: [],
          actions: [
            {
              id: 'exit-result-card',
              start: 'after-previous',
              delayMs: 0,
              action: action('node.exit'),
            },
            {
              id: 'delayed-feedback',
              start: 'after-previous',
              delayMs: 1_000,
              action: { type: 'audio.play', soundId: 'feedback' },
            },
          ],
        }],
        events,
        presentation: {
          current: () => null,
          states: () => [],
          setState: () => false,
          transitionTo: () => false,
        },
        hostActions: {
          goToScene: () => false,
          nextScene: () => false,
          previousScene: () => false,
          replayScene: () => false,
          restartCourse: () => false,
        },
        executeAudioAction: audio,
        executeNodeMotion: (motion, context) => director.play(
          motion,
          context.signal,
          { restartFromBeginning: context.restartFromBeginning },
        ),
      })

      engine.dispatch({ type: 'node.click', nodeId: 'button' })
      expect(tweens).toHaveLength(1)
      tweens[0]!.onComplete()
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(0)
      expect(root.visible).toBe(false)
      expect(completed).toHaveBeenCalledTimes(1)
      expect(audio).not.toHaveBeenCalled()

      engine.dispatch({ type: 'node.click', nodeId: 'button' })
      expect(tweens).toHaveLength(2)
      expect(root.visible).toBe(true)
      expect(root.alpha).toBe(0.75)
      expect(tweens[1]).toMatchObject({ alpha: 0, duration: 300 })
      expect(completed).toHaveBeenCalledTimes(1)

      tweens[1]!.onComplete()
      await Promise.resolve()
      await Promise.resolve()
      expect(completed).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(999)
      expect(audio).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(audio).toHaveBeenCalledTimes(1)
      engine.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves reduced-motion actions immediately but preserves visibility semantics', async () => {
    const { scene, tweens } = sceneHarness()
    const director = new NodeMotionDirector({
      scene,
      scope: 'scene',
      mode: 'preview',
      events: new CourseEventBus(),
      sceneId: 'scene_one',
      prefersReducedMotion: () => true,
    })
    const root = new FakeRoot()
    director.register(handle(root), node())

    await expect(director.play(action('node.exit', 'scale'))).resolves.toBe(true)
    expect(tweens).toHaveLength(0)
    expect(root.visible).toBe(false)

    await expect(director.play(action('node.enter', 'scale'))).resolves.toBe(true)
    expect(root.visible).toBe(true)
    expect(root.scaleX).toBe(1)
    expect(root.input?.enabled).toBe(true)
  })

  it('preserves a global exit across eligible pages and resets on reactivation', async () => {
    const { scene, tweens } = sceneHarness()
    const events = new CourseEventBus()
    const root = new FakeRoot()
    const globalNode = node('hidden')
    const rendered = handle(root)
    const director = new NodeMotionDirector({
      scene,
      scope: 'global',
      mode: 'preview',
      events,
      prefersReducedMotion: () => false,
    })
    director.register(rendered, globalNode, true, 'scene_one')
    const entering = director.play(action('node.enter'))
    tweens[0]!.onComplete()
    await entering
    const exiting = director.play(action('node.exit'))
    tweens[1]!.onComplete()
    await exiting

    director.update(rendered, globalNode, true, {
      preserveTransient: true,
      activationSceneId: 'scene_two',
    })
    expect(root.visible).toBe(false)

    director.update(rendered, globalNode, false, {
      preserveTransient: true,
      activationSceneId: 'scene_three',
    })
    director.update(rendered, globalNode, true, {
      preserveTransient: true,
      activationSceneId: 'scene_four',
    })
    expect(root.visible).toBe(false)
  })

  it('keeps an in-flight global motion alive across an ordinary page change', async () => {
    const { scene, tweens } = sceneHarness()
    const root = new FakeRoot()
    const globalNode = node()
    const rendered = handle(root)
    const director = new NodeMotionDirector({
      scene,
      scope: 'global',
      mode: 'preview',
      events: new CourseEventBus(),
      prefersReducedMotion: () => false,
    })
    director.register(rendered, globalNode, true, 'scene_one')

    const exiting = director.play(action('node.exit', 'slide'))
    director.update(rendered, globalNode, true, {
      preserveTransient: true,
      activationSceneId: 'scene_two',
    })
    let settled = false
    void exiting.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(tweens).toHaveLength(1)

    tweens[0]!.onComplete()
    await expect(exiting).resolves.toBe(true)
    expect(root.visible).toBe(false)
  })
})
