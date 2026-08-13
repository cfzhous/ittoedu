import { describe, expect, it } from 'vitest'
import {
  applySceneNodeOverride,
  createDefaultScenePresentation,
  deriveSceneNodeOverride,
  ensureScenePresentation,
  materializeScene,
  resolveSceneEntryStateId,
  rewritePresentationNodeIds,
  stateReferencesAsset,
} from '@/shared/presentation'
import { projectDocumentSchema } from '@/shared/projectSchema'
import {
  createExternalComponentNode,
  createProject,
  createRectangleNode,
  createTextNode,
} from '@/renderer/project/createProject'

describe('scene presentation materialization', () => {
  it('resolves valid entry states and safely falls back without materializing base', () => {
    const scene = createProject().scenes[0]!
    scene.presentation = {
      initialStateId: 'question',
      states: [
        { id: 'question', name: '题目', nodeOverrides: {} },
        { id: 'result', name: '结果', nodeOverrides: {} },
      ],
    }

    expect(resolveSceneEntryStateId(scene, 'result')).toBe('result')
    expect(resolveSceneEntryStateId(scene, 'missing')).toBe('question')
    expect(resolveSceneEntryStateId(scene)).toBe('question')
  })

  it('deep-merges state fields and derives a minimal reversible override', () => {
    const base = createTextNode({
      id: 'title',
      text: '基础标题',
      x: 40,
      style: { color: '#111827', fontSize: 40 },
    })
    const effective = applySceneNodeOverride(base, {
      x: 320,
      text: '答错提示',
      style: { color: '#ef4444' },
    })

    expect(effective).toMatchObject({
      id: 'title',
      type: 'text',
      x: 320,
      text: '答错提示',
      style: { color: '#ef4444', fontSize: 40 },
    })
    const override = deriveSceneNodeOverride(base, effective)
    expect(override).toEqual({
      x: 320,
      text: '答错提示',
      style: { color: '#ef4444' },
    })
    expect(applySceneNodeOverride(base, override)).toEqual(effective)
  })

  it('keeps playback initial hiding separate from stable state visibility', () => {
    const base = createRectangleNode({
      id: 'feedback',
      visible: false,
      playbackInitialVisibility: 'hidden',
    })
    const effective = applySceneNodeOverride(base, { visible: true })

    expect(base).toMatchObject({
      visible: false,
      playbackInitialVisibility: 'hidden',
    })
    expect(effective).toMatchObject({
      visible: true,
      playbackInitialVisibility: 'hidden',
    })
    expect(deriveSceneNodeOverride(base, effective)).toEqual({ visible: true })

    const project = createProject({ includeDefaultController: false, controls: 'none' })
    const scene = project.scenes[0]!
    scene.nodes = [base]
    scene.presentation!.states[0]!.nodeOverrides[base.id] = { visible: true }
    expect(materializeScene(scene).nodes[0]).toMatchObject({
      visible: true,
      playbackInitialVisibility: 'hidden',
    })
    expect(projectDocumentSchema.parse(project).scenes[0]!.nodes[0])
      .toMatchObject({ playbackInitialVisibility: 'hidden' })
  })

  it('materializes initial and explicit states without mutating the base scene', () => {
    const project = createProject({ idFactory: () => 'fixed' })
    const scene = project.scenes[0]!
    const node = createTextNode({ id: 'title', text: '基础', x: 20 })
    scene.nodes.push(node)
    scene.presentation = {
      initialStateId: 'question',
      thumbnailStateId: 'correct',
      states: [
        {
          id: 'question',
          name: '题目',
          nodeOverrides: { title: { text: '请选择答案' } },
        },
        {
          id: 'correct',
          name: '正确',
          backgroundColor: '#ecfdf5',
          nodeOverrides: { title: { text: '回答正确', x: 500 } },
        },
      ],
    }

    expect(materializeScene(scene).nodes[0]).toMatchObject({ text: '请选择答案', x: 20 })
    expect(materializeScene(scene, 'correct')).toMatchObject({
      backgroundColor: '#ecfdf5',
      nodes: [{ text: '回答正确', x: 500 }],
    })
    expect(scene.nodes[0]).toMatchObject({ text: '基础', x: 20 })
  })

  it('uses the initial state when the optional thumbnail state is absent or invalid', () => {
    const scene = createProject().scenes[0]!
    scene.presentation = {
      initialStateId: 'correct',
      states: [
        { id: 'question', name: '题目', nodeOverrides: {} },
        { id: 'correct', name: '正确', nodeOverrides: {} },
      ],
    }

    expect(ensureScenePresentation(scene).thumbnailStateId).toBe('correct')
    scene.presentation.thumbnailStateId = 'missing'
    expect(ensureScenePresentation(scene).thumbnailStateId).toBe('correct')
  })

  it('keeps component package identity out of authored state diffs', () => {
    const base = createExternalComponentNode({
      id: 'quiz',
      name: '互动题',
      component: { packageId: 'com.example.quiz', version: '1.0.0' },
      props: { content: { title: '基础题目' } },
      x: 100,
    })
    const effective = {
      ...structuredClone(base),
      x: 300,
      component: { packageId: 'malicious.swap', version: '9.9.9' },
      props: { content: { title: '状态题目' }, mode: 'result' },
    }

    const override = deriveSceneNodeOverride(base, effective)
    expect(override).toEqual({
      x: 300,
      props: { content: { title: '状态题目' }, mode: 'result' },
    })
    expect(applySceneNodeOverride(base, {
      ...override,
      component: effective.component,
    } as never)).toMatchObject({
      type: 'external-component',
      component: base.component,
    })

    const unsafeProps = JSON.parse(
      '{"__proto__":{"polluted":true}}',
    ) as Record<string, unknown>
    const applied = applySceneNodeOverride(base, {
      props: unsafeProps,
    })
    expect(applied).toMatchObject({ type: 'external-component' })
    if (applied.type !== 'external-component') throw new Error('组件类型丢失')
    expect(Object.getPrototypeOf(applied.props)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(applied.props, '__proto__')).toBe(true)
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it('applies partial node order deterministically and rewrites it with override ids', () => {
    const scene = createProject().scenes[0]!
    scene.nodes = [
      createTextNode({ id: 'a' }),
      createRectangleNode({ id: 'b' }),
      createTextNode({ id: 'c' }),
    ]
    scene.presentation = {
      initialStateId: 'ordered',
      states: [{
        id: 'ordered',
        name: '排序',
        nodeOverrides: { a: { x: 99 } },
        nodeOrder: ['c', 'a'],
      }],
    }

    expect(materializeScene(scene).nodes.map((node) => node.id)).toEqual([
      'c',
      'a',
      'b',
    ])
    expect(scene.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c'])

    const rewritten = rewritePresentationNodeIds(
      scene.presentation,
      new Map([['a', 'a2'], ['b', 'b2'], ['c', 'c2']]),
    )
    expect(rewritten.states[0]).toMatchObject({
      nodeOverrides: { a2: { x: 99 } },
      nodeOrder: ['c2', 'a2'],
    })
  })

  it('detects state-level background and image asset references', () => {
    expect(stateReferencesAsset({
      id: 'result',
      name: '结果',
      backgroundAssetId: 'background',
      nodeOverrides: { image: { assetId: 'answer-image' } },
    }, 'background')).toBe(true)
    expect(stateReferencesAsset({
      id: 'result',
      name: '结果',
      nodeOverrides: { image: { assetId: 'answer-image' } },
    }, 'answer-image')).toBe(true)
  })
})

describe('presentation schema compatibility', () => {
  it('keeps legacy V4 payloads valid without rewriting them at parse time', () => {
    const project = createProject()
    delete project.scenes[0]!.presentation
    const parsed = projectDocumentSchema.parse(project)
    expect(parsed.scenes[0]!.presentation).toBeUndefined()
    expect(materializeScene(parsed.scenes[0]!)).toMatchObject({ nodes: [] })
  })

  it('rejects dangling node overrides and protected identity fields', () => {
    const project = createProject()
    const scene = project.scenes[0]!
    scene.nodes.push(createTextNode({ id: 'title' }))
    scene.presentation = createDefaultScenePresentation()
    scene.presentation.states[0]!.nodeOverrides = {
      missing: { x: 100 },
      title: { id: 'replacement' } as never,
    }

    const result = projectDocumentSchema.safeParse(project)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join('\n')).toContain(
        '状态覆盖',
      )
    }
  })

  it('rejects duplicate node ids and fields belonging to another node type', () => {
    const project = createProject()
    const scene = project.scenes[0]!
    scene.nodes = [
      createTextNode({ id: 'duplicate' }),
      createRectangleNode({ id: 'duplicate' }),
    ]
    scene.presentation = createDefaultScenePresentation()
    scene.presentation.states[0]!.nodeOverrides = {
      duplicate: { assetId: 'wrong-node-field' } as never,
    }

    const result = projectDocumentSchema.safeParse(project)
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join('\n')
      expect(messages).toContain('节点 ID 不能重复')
      expect(messages).toContain('不适用于该节点的字段')
    }
  })

  it('rejects initial and thumbnail references outside the scene state list', () => {
    const project = createProject()
    project.scenes[0]!.presentation = {
      initialStateId: 'missing-initial',
      thumbnailStateId: 'missing-thumbnail',
      states: [{ id: 'only-state', name: '唯一状态', nodeOverrides: {} }],
    }

    const result = projectDocumentSchema.safeParse(project)
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join('\n')
      expect(messages).toContain('初始状态必须引用')
      expect(messages).toContain('缩略图状态必须引用')
    }
  })

  it('rejects unknown fields nested inside replacement arrays', () => {
    const project = createProject()
    const scene = project.scenes[0]!
    scene.nodes = [createTextNode({ id: 'title', text: '文字' })]
    scene.presentation = createDefaultScenePresentation()
    scene.presentation.states[0]!.nodeOverrides = {
      title: {
        runs: [{
          start: 0,
          end: 1,
          style: { bold: true },
          unknownField: true,
        }],
      } as never,
    }

    const result = projectDocumentSchema.safeParse(project)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join('\n'))
        .toContain('未知字段')
    }
  })
})
