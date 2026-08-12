import { describe, expect, it } from 'vitest'
import {
  collectProjectHealth,
  summarizeProjectHealth,
} from '../../src/shared/projectHealth'
import {
  createExternalComponentNode,
  createImageNode,
  createProject,
  createRectangleNode,
  createScene,
  createTextNode,
  createVideoNode,
} from '../../src/renderer/project/createProject'
import type { InteractionActionPayload } from '../../src/shared/interactionTypes'

function actionStep(id: string, action: InteractionActionPayload) {
  return {
    id,
    start: 'after-previous' as const,
    delayMs: 0,
    action,
  }
}

function codes(project: ReturnType<typeof createProject>) {
  return collectProjectHealth(project).map((diagnostic) => diagnostic.code)
}

describe('工程健康检查', () => {
  it('reports unused assets with an addressable asset location', () => {
    const project = createProject({ includeDefaultController: false })
    project.assets.unused = {
      id: 'unused', filename: 'unused.png', mimeType: 'image/png',
      kind: 'image', path: 'assets/unused.png', byteLength: 42,
    }

    expect(collectProjectHealth(project)).toContainEqual(expect.objectContaining({
      severity: 'info',
      code: 'asset-unused',
      scope: 'asset',
      path: ['assets', 'unused'],
      assetId: 'unused',
    }))
  })

  it('reports a missing asset from an explicit component image property', () => {
    const project = createProject({ includeDefaultController: false })
    const node = createExternalComponentNode({
      component: { packageId: 'com.test.image', version: '4.0.0' },
      props: { cover: 'missing-cover' },
    })
    project.scenes[0]!.nodes.push(node)
    const components = {
      recordKey: {
        manifest: {
          schemaVersion: 4 as const, runtimeApiVersion: 4 as const,
          id: 'com.test.image', name: 'Image', version: '4.0.0', entry: 'runtime.js',
          defaultSize: { width: 100, height: 100 }, minSize: { width: 10, height: 10 },
          preserveAspectRatio: false, assets: {}, defaultProps: {},
          supportedScopes: ['scene' as const], renderMode: 'dom' as const,
          editor: { properties: [{ key: 'cover', label: 'Cover', type: 'image' as const }] },
        },
        runtimeSource: '', files: {},
      },
    }

    expect(collectProjectHealth(project, components)).toContainEqual(expect.objectContaining({
      code: 'asset-reference-missing',
      severity: 'error',
      assetId: 'missing-cover',
      nodeId: node.id,
      packageId: 'com.test.image',
    }))
  })

  it('检查场景状态、节点、素材与运行时引用，并携带定位字段', () => {
    const project = createProject({
      id: 'health-invalid',
      now: '2026-01-01T00:00:00.000Z',
      includeDefaultController: false,
    })
    const scene = project.scenes[0]!
    const image = createImageNode({ id: 'missing-image', assetId: 'image-missing' })
    scene.nodes.push(image)
    scene.presentation!.thumbnailStateId = 'state-missing'
    scene.presentation!.states[0]!.nodeOverrides['node-missing'] = { visible: false }
    scene.runtime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'phaser',
      source: '',
      content: { values: {} },
      assets: { backdrop: { assetId: 'runtime-asset-missing' } },
      nodeBindings: { target: 'node-missing' },
    }

    const diagnostics = collectProjectHealth(project)
    expect(diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'thumbnail-state-reference-missing',
      'state-node-reference-missing',
      'asset-reference-missing',
      'runtime-static-fallback-missing',
      'runtime-node-reference-missing',
    ]))
    expect(diagnostics.find((item) => item.code === 'state-node-reference-missing'))
      .toMatchObject({
        severity: 'error',
        sceneId: scene.id,
        stateId: scene.presentation!.states[0]!.id,
        nodeId: 'node-missing',
        path: expect.any(Array),
      })
    expect(summarizeProjectHealth(diagnostics)).toMatchObject({
      error: expect.any(Number),
      warning: expect.any(Number),
      canExport: false,
      total: diagnostics.length,
    })
  })

  it('检查场景和全局交互的目标作用域与媒体类型', () => {
    const project = createProject({
      id: 'health-interactions',
      now: '2026-01-01T00:00:00.000Z',
      includeDefaultController: false,
    })
    const scene = project.scenes[0]!
    project.scenes.push(createScene({ id: 'second-scene', name: '第二场景' }))
    scene.presentation!.states.push({
      id: 'scene-only-state',
      name: '仅首场景',
      nodeOverrides: {},
    })
    const image = createImageNode({ id: 'image-node', assetId: 'video-asset' })
    const video = createVideoNode({ id: 'video-node', assetId: 'video-asset' })
    scene.nodes.push(image, video)
    project.assets['video-asset'] = {
      id: 'video-asset',
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      kind: 'video',
      path: 'assets/clip.mp4',
      byteLength: 10,
    }
    scene.interactions.push({
      id: 'bad-scene-rule',
      enabled: true,
      trigger: { type: 'component.event', nodeId: image.id, eventName: 'done' },
      conditions: [{ type: 'scene.in', sceneIds: ['missing-scene'] }],
      actions: [
        actionStep('bad_video_action', { type: 'video.play', nodeId: image.id }),
        actionStep('bad_scene_action', { type: 'scene.go', sceneId: 'missing-scene' }),
      ],
    })
    project.globalInteractions.push({
      id: 'bad-global-rule',
      enabled: true,
      trigger: { type: 'node.click', nodeId: video.id },
      conditions: [],
      actions: [actionStep('bad_state_action', {
        type: 'presentation.set',
        stateId: 'scene-only-state',
      })],
    })

    const diagnostics = collectProjectHealth(project)
    expect(diagnostics.filter((item) => item.code === 'interaction-node-type-mismatch'))
      .toHaveLength(2)
    expect(diagnostics.filter((item) => item.code === 'interaction-scene-reference-missing'))
      .toHaveLength(2)
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'interaction-node-reference-missing',
      ruleId: 'bad-global-rule',
      nodeId: video.id,
    }))
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'global-interaction-state-target-partial',
      severity: 'warning',
      ruleId: 'bad-global-rule',
      stateId: 'scene-only-state',
    }))
    expect(codes(project)).toContain('asset-kind-mismatch')
  })

  it('检查组件包版本、缩略图、未使用包与新版控制器跳转目标', () => {
    const project = createProject({
      id: 'health-components',
      now: '2026-01-01T00:00:00.000Z',
    })
    const component = createExternalComponentNode({
      id: 'version-missing',
      component: { packageId: 'com.example.widget', version: '2.0.0' },
    })
    project.scenes[0]!.nodes.push(component)
    project.componentPackages['com.example.widget@1.0.0'] = {
      packageId: 'com.example.widget',
      version: '1.0.0',
      name: 'Widget',
      manifestPath: 'components/widget/manifest.json',
      runtimePath: 'components/widget/runtime.js',
      contentSha256: '0'.repeat(64),
    }
    project.componentPackages['com.example.unused@1.0.0'] = {
      packageId: 'com.example.unused',
      version: '1.0.0',
      name: 'Unused',
      manifestPath: 'components/unused/manifest.json',
      runtimePath: 'components/unused/runtime.js',
      thumbnailPath: 'components/unused/thumbnail.png',
      contentSha256: '0'.repeat(64),
    }
    const controller = project.globalLayer.find(
      (item) => item.node.type === 'teacher-controller',
    )!.node
    if (controller.type !== 'teacher-controller') throw new Error('fixture')
    controller.buttons.push({
      id: 'jump-missing',
      label: '缺失页',
      visible: true,
      action: {
        type: 'scene.go',
        sceneId: project.scenes[0]!.id,
        targetStateId: 'missing-state',
      },
    })

    const diagnostics = collectProjectHealth(project)
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'component-version-missing', severity: 'error' }),
      expect.objectContaining({ code: 'component-thumbnail-missing', severity: 'warning' }),
      expect.objectContaining({ code: 'component-package-unused', severity: 'info' }),
      expect.objectContaining({
        code: 'controller-state-target-missing',
        nodeId: controller.id,
        stateId: 'missing-state',
      }),
    ]))
  })

  it('合并现有视频交互冲突诊断', () => {
    const project = createProject({
      id: 'health-video',
      now: '2026-01-01T00:00:00.000Z',
      includeDefaultController: false,
    })
    const video = createVideoNode({ id: 'video', assetId: 'clip' })
    video.clickToToggle = true
    project.scenes[0]!.nodes.push(video)
    project.scenes[0]!.interactions.push({
      id: 'video-click',
      enabled: true,
      trigger: { type: 'node.click', nodeId: video.id },
      conditions: [],
      actions: [actionStep('video_next_action', { type: 'scene.next' })],
    })
    project.assets.clip = {
      id: 'clip',
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      kind: 'video',
      path: 'assets/clip.mp4',
      byteLength: 1,
    }

    expect(collectProjectHealth(project)).toContainEqual(expect.objectContaining({
      code: 'video-click-interaction-conflict',
      severity: 'warning',
      sceneId: project.scenes[0]!.id,
      nodeId: video.id,
    }))
  })

  it('检查动画动作引用、重复 ID、终结导航与初始可见性', () => {
    const project = createProject({ includeDefaultController: false })
    const scene = project.scenes[0]!
    const node = createRectangleNode({ id: 'motion-node' })
    scene.nodes.push(node)
    scene.interactions.push(
      {
        id: 'dangling-completion',
        enabled: true,
        trigger: { type: 'animation.completed', actionId: 'missing-action' },
        conditions: [],
        actions: [actionStep('duplicate-action', {
          type: 'node.enter',
          nodeId: node.id,
          effect: 'fade',
          durationMs: 240,
          easing: 'ease-out',
        })],
      },
      {
        id: 'bad-terminal-order',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [],
        actions: [
          actionStep('duplicate-action', { type: 'scene.next' }),
          actionStep('after-navigation', {
            type: 'node.exit',
            nodeId: node.id,
            effect: 'fade',
            durationMs: 120,
            easing: 'ease-in',
          }),
        ],
      },
      {
        id: 'non-motion-source',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [],
        actions: [actionStep('ordinary-action', {
          type: 'presentation.set',
          stateId: scene.presentation!.initialStateId,
        })],
      },
      {
        id: 'invalid-completion-kind',
        enabled: true,
        trigger: { type: 'animation.completed', actionId: 'ordinary-action' },
        conditions: [],
        actions: [actionStep('valid-motion-action', {
          type: 'node.exit',
          nodeId: node.id,
          effect: 'fade',
          durationMs: 120,
          easing: 'ease-in',
        })],
      },
    )

    const diagnostics = collectProjectHealth(project)
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'interaction-action-reference-missing',
        ruleId: 'dangling-completion',
      }),
      expect.objectContaining({
        code: 'interaction-action-reference-missing',
        ruleId: 'invalid-completion-kind',
      }),
      expect.objectContaining({ code: 'interaction-action-id-duplicate' }),
      expect.objectContaining({
        code: 'interaction-navigation-not-terminal',
        ruleId: 'bad-terminal-order',
      }),
      expect.objectContaining({
        code: 'interaction-enter-target-initially-visible',
        ruleId: 'dangling-completion',
        nodeId: node.id,
      }),
    ]))
  })

  it('检查作者命令翻页笔是否有可执行规则', () => {
    const project = createProject({ includeDefaultController: false })
    project.playback.presenter = {
      enabled: true,
      strategy: 'authored-command',
      additionalBindings: [],
    }
    project.scenes[0]!.interactions.push({
      id: 'next-only',
      enabled: true,
      trigger: { type: 'presenter.command', command: 'next' },
      conditions: [],
      actions: [actionStep('next-scene', { type: 'scene.next' })],
    })

    const diagnostics = collectProjectHealth(project)
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'presenter-command-unhandled',
      severity: 'warning',
      message: expect.stringContaining('上一步'),
    }))
    expect(diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'presenter-command-unhandled',
      message: expect.stringContaining('下一步'),
    }))
  })

  it('把无法到达的初始隐藏节点纳入只读信息释放诊断', () => {
    const project = createProject({ includeDefaultController: false })
    const hidden = createTextNode({
      id: 'hidden-copy',
      name: '隐藏结论',
      playbackInitialVisibility: 'hidden',
    })
    project.scenes[0]!.nodes.push(hidden)

    expect(collectProjectHealth(project)).toContainEqual(expect.objectContaining({
      code: 'information-release-hidden-unreachable',
      severity: 'warning',
      sceneId: project.scenes[0]!.id,
      stateId: project.scenes[0]!.presentation!.initialStateId,
      nodeId: hidden.id,
    }))
  })
})
