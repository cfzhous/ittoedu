import { describe, expect, it, vi } from 'vitest'
import type * as Phaser from 'phaser'
import { CourseEventBus } from '@/player/CourseEventBus'
import { NodeMotionDirector } from '@/player/NodeMotionDirector'
import type { RenderedNodeHandle } from '@/player/renderNode'
import {
  interactionRuleSchema,
  sceneInteractionsSchema,
} from '@/shared/interactionSchema'
import type { InteractionRule } from '@/shared/interactionTypes'
import {
  migrateProjectDocument,
  projectDocumentSchema,
  projectDocumentV6Schema,
} from '@/shared/projectSchema'
import {
  createProject,
  createRectangleNode,
  createTeacherControllerNode,
  createTextNode,
} from '@/renderer/project/createProject'
import { collectProjectHealth } from '@/shared/projectHealth'
import { materializeScene } from '@/shared/presentation'
import { createProjectArchive } from '@/renderer/project/projectArchive'
import type { SceneNode } from '@/shared/projectTypes'

function stepRule(patch: Partial<InteractionRule> = {}): InteractionRule {
  return {
    id: 'rule_one',
    enabled: true,
    trigger: { type: 'node.activated', nodeId: 'node_one' },
    conditions: [],
    actions: [{
      id: 'action_one',
      start: 'after-previous',
      delayMs: 40,
      action: {
        type: 'node.enter',
        nodeId: 'node_one',
        effect: 'slide',
        direction: 'left',
        durationMs: 320,
        easing: 'ease-out',
      },
    }],
    ...patch,
  }
}

function withoutPlayback<T extends { playbackInitialVisibility: unknown }>(
  node: T,
): Omit<T, 'playbackInitialVisibility'> {
  const { playbackInitialVisibility: _playback, ...legacy } = structuredClone(node)
  return legacy
}

function legacyV6Project(): unknown {
  const current = createProject({ includeDefaultController: false })
  const sceneNode = {
    ...withoutPlayback(createTextNode({ id: 'animated_scene', name: '场景标题' })),
    animation: { preset: 'fade', durationMs: 240, delayMs: 10 },
  }
  const overrideOnlyNode = withoutPlayback(createRectangleNode({
    id: 'override_only',
    name: '覆盖动画节点',
  }))
  const globalNode = {
    ...withoutPlayback(createRectangleNode({ id: 'animated_global', name: '全局提示' })),
    animation: { preset: 'scale', durationMs: 360, delayMs: 30 },
  }

  const defaultController = withoutPlayback(createTeacherControllerNode({
    id: 'default_controller',
  }))
  defaultController.buttons = defaultController.buttons.filter(
    (button) => button.action.type !== 'scene.open-picker',
  )
  const customController = structuredClone(defaultController)
  customController.id = 'custom_controller'
  customController.buttons[0]!.label = '返回'

  return {
    ...structuredClone(current),
    schemaVersion: 6,
    scenes: [{
      ...structuredClone(current.scenes[0]),
      nodes: [sceneNode, overrideOnlyNode],
      presentation: {
        initialStateId: 'state_a',
        thumbnailStateId: 'state_a',
        states: [
          { id: 'state_a', name: 'A', nodeOverrides: {} },
          {
            id: 'state_b',
            name: 'B',
            nodeOverrides: {
              animated_scene: {
                animation: {
                  preset: 'slide-left',
                  durationMs: 500,
                  delayMs: 20,
                },
              },
              override_only: {
                animation: { preset: 'scale', durationMs: 280, delayMs: 5 },
              },
            },
          },
          {
            id: 'state_c',
            name: 'C',
            nodeOverrides: {
              animated_scene: {
                animation: {
                  preset: 'slide-left',
                  durationMs: 500,
                  delayMs: 20,
                },
              },
              override_only: {
                animation: { preset: 'scale', durationMs: 280, delayMs: 5 },
              },
            },
          },
          {
            id: 'state_d',
            name: 'D',
            nodeOverrides: {
              animated_scene: {
                animation: { preset: 'none', durationMs: 420, delayMs: 0 },
              },
            },
          },
        ],
      },
      interactions: [{
        id: 'legacy_rule',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'animated_scene' },
        conditions: [],
        actions: [{ type: 'presentation.set', stateId: 'state_b' }],
      }],
    }],
    globalLayer: [
      {
        node: globalNode,
        layer: 'underlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
      {
        node: defaultController,
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
      {
        node: customController,
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      },
    ],
    globalInteractions: [{
      id: 'legacy_global_rule',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{ type: 'scene.next' }],
    }],
  }
}

interface MigrationTweenConfig {
  targets: MigrationMotionRoot
  x?: number
  y?: number
  alpha?: number
  scaleX?: number
  scaleY?: number
  duration: number
  ease: string
  onComplete(): void
}

class MigrationMotionRoot {
  active = true
  visible = true
  x = 0
  y = 0
  alpha = 1
  scaleX = 1
  scaleY = 1
  width = 100
  height = 100
  input: { enabled: boolean } | null = { enabled: true }
  readonly list: MigrationMotionRoot[] = []

  setVisible(value: boolean): this {
    this.visible = value
    return this
  }

  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this
  }

  setAlpha(value: number): this {
    this.alpha = value
    return this
  }

  setScale(x: number, y = x): this {
    this.scaleX = x
    this.scaleY = y
    return this
  }
}

function migratedMotionHarness(node: SceneNode) {
  const tweens: MigrationTweenConfig[] = []
  const root = new MigrationMotionRoot()
  const scene = {
    tweens: {
      killTweensOf: vi.fn(),
      add: vi.fn((config: MigrationTweenConfig) => {
        tweens.push(config)
        return { stop: vi.fn() }
      }),
    },
  } as unknown as Phaser.Scene
  const handle: RenderedNodeHandle = {
    id: node.id,
    type: node.type,
    root: root as unknown as Phaser.GameObjects.Container,
    setMotionVisible: (visible) => root.setVisible(visible),
    update: vi.fn(),
    destroy: vi.fn(),
  }
  const director = new NodeMotionDirector({
    scene,
    scope: 'scene',
    mode: 'preview',
    events: new CourseEventBus(),
    sceneId: 'scene-migrated',
    prefersReducedMotion: () => false,
  })
  return { director, handle, root, tweens }
}

describe('Project V8 text direction compatibility', () => {
  it('normalizes legacy vertical text to vertical-rl and accepts both new directions', () => {
    const legacy = structuredClone(
      createProject({ includeDefaultController: false }),
    ) as ReturnType<typeof createProject>
    const baseVertical = createTextNode({ id: 'base_vertical' })
    const stateVertical = createTextNode({ id: 'state_vertical' })
    Reflect.set(baseVertical.style, 'writingMode', 'vertical')
    legacy.scenes[0]!.nodes = [baseVertical, stateVertical]
    legacy.scenes[0]!.presentation = {
      initialStateId: 'state_one',
      states: [{
        id: 'state_one',
        name: '状态一',
        nodeOverrides: {
          state_vertical: {
            style: { writingMode: 'vertical' },
          } as never,
        },
      }],
    }

    const migrated = migrateProjectDocument(legacy)
    const migratedBase = migrated.scenes[0]!.nodes.find(
      (node) => node.id === 'base_vertical',
    )
    expect(migratedBase?.type).toBe('text')
    if (migratedBase?.type !== 'text') throw new Error('Expected text node')
    expect(migratedBase.style.writingMode).toBe('vertical-rl')
    expect(
      materializeScene(migrated.scenes[0]!, 'state_one').nodes.find(
        (node) => node.id === 'state_vertical',
      ),
    ).toMatchObject({
      style: { writingMode: 'vertical-rl' },
    })
    expect(
      migrated.scenes[0]!.presentation?.states[0]!
        .nodeOverrides.state_vertical,
    ).toMatchObject({
      style: { writingMode: 'vertical-rl' },
    })

    const modern = createProject({ includeDefaultController: false })
    modern.scenes[0]!.nodes = [
      createTextNode({ style: { writingMode: 'vertical-lr' } }),
    ]
    expect(
      projectDocumentSchema.parse(modern).scenes[0]!.nodes[0],
    ).toMatchObject({
      style: { writingMode: 'vertical-lr' },
    })
  })
})

describe('Project V8 interaction protocol', () => {
  it('accepts event-driven motion steps and completion triggers', () => {
    expect(interactionRuleSchema.parse(stepRule())).toEqual(stepRule())
    expect(interactionRuleSchema.parse(stepRule({
      trigger: { type: 'animation.completed', actionId: 'action_one' },
      actions: [{
        id: 'action_two',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'node.exit',
          nodeId: 'node_one',
          effect: 'fade',
          durationMs: 200,
          easing: 'ease-in',
        },
      }],
    })).trigger).toEqual({
      type: 'animation.completed',
      actionId: 'action_one',
    })
  })

  it('rejects invalid motion descriptors, grouping, navigation, and scope action ids', () => {
    const missingDirection = structuredClone(stepRule()) as unknown as {
      actions: Array<{ action: Record<string, unknown> }>
    }
    delete missingDirection.actions[0]!.action.direction
    expect(interactionRuleSchema.safeParse(missingDirection).success).toBe(false)

    const directionOnFade = structuredClone(stepRule()) as unknown as {
      actions: Array<{ action: Record<string, unknown> }>
    }
    directionOnFade.actions[0]!.action.effect = 'fade'
    expect(interactionRuleSchema.safeParse(directionOnFade).success).toBe(false)

    expect(interactionRuleSchema.safeParse(stepRule({
      actions: [{
        id: 'navigation',
        start: 'with-previous',
        delayMs: 0,
        action: { type: 'scene.next' },
      }],
    })).success).toBe(false)

    expect(sceneInteractionsSchema.safeParse([
      stepRule(),
      stepRule({ id: 'rule_two' }),
    ]).success).toBe(false)
  })
})

describe('archived Project V6 migration helper', () => {
  it('parses V6 independently and migrates raw actions and effective animations deterministically', () => {
    const legacy = legacyV6Project()
    expect(projectDocumentV6Schema.safeParse(legacy).success).toBe(true)
    expect(projectDocumentSchema.safeParse(legacy).success).toBe(false)

    const migrated = migrateProjectDocument(legacy)
    expect(migrated).toEqual(migrateProjectDocument(structuredClone(legacy)))
    expect(migrated.schemaVersion).toBe(8)

    const scene = migrated.scenes[0]!
    expect(scene.nodes.find((node) => node.id === 'animated_scene'))
      .toMatchObject({ playbackInitialVisibility: 'hidden' })
    expect(scene.nodes.find((node) => node.id === 'override_only'))
      .toMatchObject({ playbackInitialVisibility: 'inherit' })
    expect(scene.nodes.every((node) => !('animation' in node))).toBe(true)
    expect(scene.presentation?.states.every((state) => Object.values(
      state.nodeOverrides,
    ).every((override) => !('animation' in override)))).toBe(true)

    const visibilityByState = Object.fromEntries(
      scene.presentation!.states.map((state) => {
        const effectiveNodes = materializeScene(scene, state.id).nodes
        return [state.id, Object.fromEntries(effectiveNodes.map((node) => [
          node.id,
          node.playbackInitialVisibility,
        ]))]
      }),
    )
    expect(visibilityByState).toEqual({
      state_a: {
        animated_scene: 'hidden',
        override_only: 'inherit',
      },
      state_b: {
        animated_scene: 'hidden',
        override_only: 'hidden',
      },
      state_c: {
        animated_scene: 'hidden',
        override_only: 'hidden',
      },
      state_d: {
        animated_scene: 'inherit',
        override_only: 'inherit',
      },
    })
    expect(scene.presentation!.states.find((state) => state.id === 'state_b')!
      .nodeOverrides.override_only).toMatchObject({
      playbackInitialVisibility: 'hidden',
    })
    expect(scene.presentation!.states.find((state) => state.id === 'state_d')!
      .nodeOverrides.animated_scene).toMatchObject({
      playbackInitialVisibility: 'inherit',
    })

    const legacyRule = scene.interactions.find((rule) => rule.id === 'legacy_rule')!
    expect(legacyRule.actions).toEqual([{
      id: expect.stringMatching(/^v7_action_/),
      start: 'after-previous',
      delayMs: 0,
      action: { type: 'presentation.set', stateId: 'state_b' },
    }])

    const sceneAnimationRules = scene.interactions.filter(
      (rule) => rule.trigger.type === 'node.activated',
    )
    expect(sceneAnimationRules).toHaveLength(3)
    const slideRule = sceneAnimationRules.find((rule) => (
      rule.actions[0]?.action.type === 'node.enter' &&
      rule.actions[0].action.effect === 'slide'
    ))!
    expect(slideRule.conditions).toEqual([{
      type: 'presentation.in',
      stateIds: ['state_b', 'state_c'],
    }])
    expect(slideRule.actions[0]).toMatchObject({
      delayMs: 20,
      action: {
        type: 'node.enter',
        nodeId: 'animated_scene',
        effect: 'slide',
        direction: 'left',
        durationMs: 500,
        easing: 'ease-out',
      },
    })
    expect(sceneAnimationRules.some((rule) => rule.conditions.some(
      (condition) => condition.type === 'presentation.in' &&
        condition.stateIds.includes('state_d'),
    ))).toBe(false)

    const globalEnter = migrated.globalInteractions.find(
      (rule) => rule.trigger.type === 'node.activated',
    )!
    expect(globalEnter.actions[0]).toMatchObject({
      delayMs: 30,
      action: {
        type: 'node.enter',
        nodeId: 'animated_global',
        effect: 'scale',
        durationMs: 360,
      },
    })
    expect(migrated.globalLayer.every((item) => !('animation' in item.node))).toBe(true)
    expect(migrated.globalLayer.find((item) => item.node.id === 'animated_global')?.node)
      .toMatchObject({ playbackInitialVisibility: 'hidden' })
    expect(migrated.globalLayer.find((item) => item.node.id === 'default_controller')?.node)
      .toMatchObject({ playbackInitialVisibility: 'inherit' })
  })

  it('feeds migrated entry visibility into the runtime as a real hidden-to-visible tween', async () => {
    const migrated = migrateProjectDocument(legacyV6Project())
    const scene = migrated.scenes[0]!
    const node = materializeScene(scene, 'state_a').nodes.find(
      (candidate) => candidate.id === 'animated_scene',
    )!
    const motionStep = scene.interactions
      .flatMap((rule) => rule.actions)
      .find((step) => (
        step.action.type === 'node.enter' &&
        step.action.nodeId === node.id &&
        step.action.effect === 'fade'
      ))
    if (!motionStep || motionStep.action.type !== 'node.enter') {
      throw new Error('迁移后的入场动作缺失')
    }

    const { director, handle, root, tweens } = migratedMotionHarness(node)
    director.register(handle, node)
    expect(node.visible).toBe(true)
    expect(node.playbackInitialVisibility).toBe('hidden')
    expect(root.visible).toBe(false)

    let settled = false
    const completion = director.play(motionStep.action)
    void completion.then(() => { settled = true })
    await Promise.resolve()

    expect(settled).toBe(false)
    expect(tweens).toHaveLength(1)
    expect(tweens[0]).toMatchObject({ duration: 240, alpha: 1 })
    expect(root.visible).toBe(true)
    expect(root.alpha).toBe(0)

    tweens[0]!.onComplete()
    await expect(completion).resolves.toBe(true)
    expect(root.visible).toBe(true)
    expect(root.alpha).toBe(node.opacity)
  })

  it('adds the scene picker only to the legacy default controller signature', () => {
    const migrated = migrateProjectDocument(legacyV6Project())
    const controllers = migrated.globalLayer
      .map((item) => item.node)
      .filter((node) => node.type === 'teacher-controller')
    const defaultController = controllers.find((node) => node.id === 'default_controller')!
    const customController = controllers.find((node) => node.id === 'custom_controller')!

    expect(defaultController.buttons.map((button) => button.action.type))
      .toContain('scene.open-picker')
    expect(customController.buttons.map((button) => button.action.type))
      .not.toContain('scene.open-picker')
  })
})

describe('Project V8 motion reference validation', () => {
  it('reports and blocks missing completion actions and motion targets', () => {
    const project = createProject({ includeDefaultController: false })
    project.scenes[0]!.interactions.push({
      id: 'broken_motion',
      enabled: true,
      trigger: { type: 'animation.completed', actionId: 'missing_action' },
      conditions: [],
      actions: [{
        id: 'enter_missing_node',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'node.enter',
          nodeId: 'missing_node',
          effect: 'fade',
          durationMs: 200,
          easing: 'ease-out',
        },
      }],
    })

    const codes = collectProjectHealth(project).map((diagnostic) => diagnostic.code)
    expect(codes).toContain('interaction-action-reference-missing')
    expect(codes).toContain('interaction-node-reference-missing')
    expect(() => createProjectArchive({
      project,
      assetFiles: {},
      componentFiles: {},
    })).toThrowError(expect.objectContaining({
      title: '工程保存失败',
      message: expect.stringContaining('missing_action'),
    }))
  })

  it('warns about a direct animation completion self-loop', () => {
    const project = createProject({ includeDefaultController: false })
    const node = createRectangleNode({ id: 'motion_node' })
    project.scenes[0]!.nodes.push(node)
    project.scenes[0]!.interactions.push({
      id: 'self_loop',
      enabled: true,
      trigger: { type: 'animation.completed', actionId: 'loop_action' },
      conditions: [],
      actions: [{
        id: 'loop_action',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'node.exit',
          nodeId: node.id,
          effect: 'fade',
          durationMs: 200,
          easing: 'ease-in',
        },
      }],
    })

    expect(collectProjectHealth(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'warning',
        code: 'interaction-animation-self-loop',
      }),
    ]))
  })
})
