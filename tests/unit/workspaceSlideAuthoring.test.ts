import { describe, expect, it, vi } from 'vitest'
import {
  WORKSPACE_SLIDE_PREVIEW_STATE_ID,
  createWorkspaceSlidePreviewProject,
  resolveWorkspaceSlideAuthoringInput,
  workspaceAuthoringActionAllowed,
  workspaceCanvasLabel,
  workspaceTransformAllowed,
  workspaceSelectionAllowed,
  workspaceTextEditTargetNode,
  workspaceSlidePreviewAssetFiles,
  workspaceSlideCarrierScope,
  workspaceSlidePreviewGenerationIdentity,
  workspaceSlidePreviewSceneId,
  workspaceSlidePreviewStateId,
  workspacePreviewNodeWithTransform,
  type WorkspaceSlideAuthoringInput,
} from '@/renderer/ui/workspaceSlideAuthoring'
import {
  createProject,
  createScene,
  createShapeNode,
  createTeacherControllerNode,
  createTextNode,
} from '@/renderer/project/createProject'
import type { ExternalComponentNode, SceneDocument } from '@/shared/projectTypes'
import { projectDocumentSchema } from '@/shared/projectSchema'

function input(
  name: string,
  nodes: SceneDocument['nodes'] = [],
): {
  value: WorkspaceSlideAuthoringInput
  onSelectionChange: ReturnType<typeof vi.fn>
  onTransformEnd: ReturnType<typeof vi.fn>
} {
  const onSelectionChange = vi.fn(() => true)
  const onTransformEnd = vi.fn(() => true)
  const document: SceneDocument = {
    id: `scene-${name}`,
    name,
    backgroundColor: '#ffffff',
    nodes,
    interactions: [],
  }
  const resourceDefaults = createProject({
    includeDefaultController: false,
    controls: 'none',
  })
  const value = Object.freeze({
    sessionId: `session-${name}`,
    document,
    previewDocument: document,
    componentPackages: {},
    previewResources: {
      assets: {},
      assetFiles: {},
      componentPackages: {},
      designTokens: resourceDefaults.designTokens,
      media: resourceDefaults.media,
    },
    selectedNodeIds: Object.freeze([`node-${name}`]),
    sceneName: name,
    stateName: '基础',
    editingScope: 'scene' as const,
    unsupportedActionReason: 'V9 Player 尚未接入',
    onSelectionChange,
    onTransformEnd,
    onTextEditCommit: vi.fn(() => true),
  })
  return { value, onSelectionChange, onTransformEnd }
}

function transform(nodeId: string, x: number, y: number) {
  return { nodeId, x, y, width: 200, height: 80, rotation: 0 }
}

describe('Workspace Slide authoring input boundary', () => {
  it('uses the complete V8 fallback when no input is injected', () => {
    const fallback = input('fallback')
    const before = JSON.stringify(fallback.value)
    const resolved = resolveWorkspaceSlideAuthoringInput(fallback.value, undefined)

    expect(resolved).toBe(fallback.value)
    resolved.onSelectionChange({ nodeIds: ['node-a'], additive: true })
    resolved.onTransformEnd({ nodes: [transform('node-a', 10, 20)] })
    expect(fallback.onSelectionChange).toHaveBeenCalledWith({
      nodeIds: ['node-a'],
      additive: true,
    })
    expect(fallback.onTransformEnd).toHaveBeenCalledWith({
      nodes: [transform('node-a', 10, 20)],
    })
    expect(JSON.stringify(fallback.value)).toBe(before)
  })

  it('selects only the complete injected backend without merging callbacks', () => {
    const fallback = input('fallback')
    const injected = input('injected')
    const fallbackBefore = JSON.stringify(fallback.value)
    const injectedBefore = JSON.stringify(injected.value)
    const resolved = resolveWorkspaceSlideAuthoringInput(fallback.value, injected.value)

    expect(resolved).toBe(injected.value)
    expect(resolved.document).toBe(injected.value.document)
    expect(resolved.componentPackages).toBe(injected.value.componentPackages)
    expect(resolved.selectedNodeIds).toBe(injected.value.selectedNodeIds)

    resolved.onSelectionChange({ nodeIds: ['node-injected'], additive: false })
    resolved.onTransformEnd({ nodes: [transform('node-injected', 30, 40)] })
    expect(injected.onSelectionChange).toHaveBeenCalledTimes(1)
    expect(injected.onTransformEnd).toHaveBeenCalledTimes(1)
    expect(fallback.onSelectionChange).not.toHaveBeenCalled()
    expect(fallback.onTransformEnd).not.toHaveBeenCalled()
    expect(JSON.stringify(fallback.value)).toBe(fallbackBefore)
    expect(JSON.stringify(injected.value)).toBe(injectedBefore)
  })

  it('uses injected scene/state/scope labels and gates run explicitly', () => {
    const injected = input('V9 真实场景')
    const sceneInput: WorkspaceSlideAuthoringInput = {
      ...injected.value,
      stateName: '反馈态',
    }
    const globalInput: WorkspaceSlideAuthoringInput = {
      ...sceneInput,
      editingScope: 'global',
      document: { ...sceneInput.document, nodes: [] },
    }
    const surfaceInput: WorkspaceSlideAuthoringInput = {
      ...sceneInput,
      editingScope: 'surface',
      document: { ...sceneInput.document, nodes: [] },
    }

    expect(workspaceCanvasLabel(sceneInput)).toBe('V9 真实场景 · 反馈态')
    expect(workspaceCanvasLabel(globalInput)).toBe('全局层 · 0 个元素')
    expect(workspaceCanvasLabel(surfaceInput)).toBe('当前内容共用 · 0 个元素')
    expect(workspaceAuthoringActionAllowed(
      sceneInput,
      'run-current-location',
    )).toBe(false)
    expect(workspaceAuthoringActionAllowed(
      undefined,
      'run-current-location',
    )).toBe(true)
    expect(workspaceSlideCarrierScope(sceneInput, 'scene')).toBe('scene')
    expect(workspaceSlideCarrierScope(globalInput, 'global')).toBe('scene')
    expect(workspaceSlideCarrierScope(surfaceInput, 'surface')).toBe('scene')
    expect(workspaceSlideCarrierScope(undefined, 'global')).toBe('global')
  })

  it('keeps unsupported injected events away from V8 project/history', () => {
    const injected = input('injected', [
      createTextNode({
        id: 'v9-text',
        text: 'V9',
        x: 20,
        y: 30,
      }),
      createTextNode({
        id: 'v9-text-2',
        text: 'V9 second',
        x: 220,
        y: 130,
      }),
    ])
    const v8 = {
      project: { title: 'V8 untouched' },
      history: [] as string[],
    }
    const before = structuredClone(v8)
    const legacyMutation = (action: string) => {
      v8.project.title = action
      v8.history.push(action)
    }
    const unsupported = [
      'formula-edit',
      'drop',
      'animation-preview',
      'ai-reference',
    ] as const

    for (const action of unsupported) {
      if (workspaceAuthoringActionAllowed(injected.value, action)) {
        legacyMutation(action)
      }
    }
    // Canvas text editing is the one V9-served legacy entry: the gate opens
    // and the transaction goes through the seam, never the V8 project.
    expect(workspaceAuthoringActionAllowed(injected.value, 'text-edit')).toBe(true)
    injected.value.onTextEditCommit({
      nodeId: 'v9-text',
      text: 'V9 富文本',
      runs: [{ start: 0, end: 2, style: { bold: true } }],
    })
    expect(v8).toEqual(before)
    expect(workspaceSelectionAllowed(injected.value, {
      nodeIds: ['v9-text', 'another'],
      additive: true,
    })).toBe(false)
    expect(workspaceTransformAllowed(injected.value, {
      nodes: [
        transform('v9-text', 40, 50),
        transform('another', 60, 70),
      ],
    })).toBe(false)
    expect(v8).toEqual(before)

    expect(workspaceSelectionAllowed(injected.value, {
      nodeIds: ['v9-text'],
      additive: false,
    })).toBe(true)
    expect(workspaceTransformAllowed(injected.value, {
      nodes: [transform('v9-text', 40, 50)],
    })).toBe(true)
    expect(workspaceSelectionAllowed(injected.value, {
      nodeIds: ['v9-text', 'v9-text-2'],
      additive: false,
    })).toBe(true)
    expect(workspaceTransformAllowed(injected.value, {
      nodes: [
        transform('v9-text', 40, 50),
        transform('v9-text-2', 240, 150),
      ],
    })).toBe(true)
    expect(workspaceSelectionAllowed(injected.value, {
      nodeIds: ['missing'],
      additive: false,
    })).toBe(false)
    expect(workspaceTransformAllowed(injected.value, {
      nodes: [transform('v9-text', Number.NaN, 50)],
    })).toBe(false)
    const locked: WorkspaceSlideAuthoringInput = {
      ...injected.value,
      document: {
        ...injected.value.document,
        nodes: injected.value.document.nodes.map((node) => ({
          ...node,
          locked: true,
        })),
      },
    }
    expect(workspaceSelectionAllowed(locked, {
      nodeIds: ['v9-text'],
      additive: false,
    })).toBe(true)
    expect(workspaceTransformAllowed(locked, {
      nodes: [transform('v9-text', 40, 50)],
    })).toBe(false)
  })

  it('leaves every legacy event capability and callback available', () => {
    const fallback = input('fallback')
    const history: string[] = []
    const actions = [
      'text-edit',
      'formula-edit',
      'drop',
      'runtime-edit',
      'component-edit',
      'animation-preview',
      'ai-reference',
    ] as const
    for (const action of actions) {
      if (workspaceAuthoringActionAllowed(undefined, action)) {
        history.push(action)
      }
    }
    expect(history).toEqual(actions)
    expect(workspaceSelectionAllowed(undefined, {
      nodeIds: ['a', 'b'],
      additive: true,
    })).toBe(true)
    expect(workspaceTransformAllowed(undefined, {
      nodes: [
        transform('a', 1, 2),
        transform('b', 3, 4),
      ],
    })).toBe(true)
    fallback.value.onTransformEnd({ nodes: [transform('a', 1, 2)] })
    expect(fallback.onTransformEnd).toHaveBeenCalledTimes(1)
  })

  it('opens a V9 text session only for a visible unlocked text target', () => {
    const injected = input('injected', [
      createTextNode({
        id: 'v9-text',
        text: 'V9',
        x: 20,
        y: 30,
      }),
      createTextNode({
        id: 'v9-hidden',
        text: 'hidden',
        x: 220,
        y: 30,
        visible: false,
      }),
      createTextNode({
        id: 'v9-locked',
        text: 'locked',
        x: 420,
        y: 30,
        locked: true,
      }),
    ])
    const document = injected.value.document
    const nonText: WorkspaceSlideAuthoringInput = {
      ...injected.value,
      document: {
        ...document,
        nodes: [
          ...document.nodes.slice(0, 1),
          createShapeNode('rectangle', {
            id: 'shape-a',
            x: 0,
            y: 0,
          }),
        ],
      },
    }

    expect(workspaceTextEditTargetNode(injected.value, 'v9-text')?.id).toBe('v9-text')
    expect(workspaceTextEditTargetNode(injected.value, 'v9-text')?.type).toBe('text')
    expect(workspaceTextEditTargetNode(injected.value, 'v9-hidden')).toBeNull()
    expect(workspaceTextEditTargetNode(injected.value, 'v9-locked')).toBeNull()
    expect(workspaceTextEditTargetNode(injected.value, 'missing')).toBeNull()
    expect(workspaceTextEditTargetNode(nonText, 'shape-a')).toBeNull()
  })

  it('forwards one completed text transaction through the seam callback', () => {
    const injected = input('injected', [createTextNode({
      id: 'v9-text',
      text: '旧文字',
      x: 20,
      y: 30,
    })])
    const event = {
      nodeId: 'v9-text',
      text: '新文字',
      runs: [{ start: 0, end: 2, style: { bold: true } }],
    }
    expect(injected.value.onTextEditCommit(event)).toBe(true)
    expect(injected.value.onTextEditCommit).toHaveBeenCalledTimes(1)
    expect(injected.value.onTextEditCommit).toHaveBeenCalledWith(event)
  })

  it('allows Runtime/Component canvas edits in the injected backend without touching V8', () => {
    const injected = input('injected')
    const v8 = {
      project: { title: 'V8 untouched' },
      history: [] as string[],
    }
    const before = structuredClone(v8)
    const legacyMutation = (action: string) => {
      v8.project.title = action
      v8.history.push(action)
    }
    const unsupported = [
      'formula-edit',
      'drop',
      'animation-preview',
      'ai-reference',
    ] as const
    for (const action of unsupported) {
      if (workspaceAuthoringActionAllowed(injected.value, action)) {
        legacyMutation(action)
      }
    }
    // Canvas text editing is served by the V9 seam; Runtime/Component author
    // targets follow the same unified-layer path and are allowed. None of
    // them ever routes to the V8 project from this seam.
    expect(workspaceAuthoringActionAllowed(injected.value, 'text-edit')).toBe(true)
    expect(workspaceAuthoringActionAllowed(
      injected.value,
      'runtime-edit',
    )).toBe(true)
    expect(workspaceAuthoringActionAllowed(
      injected.value,
      'component-edit',
    )).toBe(true)
    expect(v8).toEqual(before)
  })

  it('selects and transforms injected component layers like native layers', () => {
    const base = input('injected', [
      createTextNode({ id: 'v9-text', text: 'V9', x: 20, y: 30 }),
    ])
    const injected: WorkspaceSlideAuthoringInput = {
      ...base.value,
      document: {
        ...base.value.document,
        nodes: [
          ...base.value.document.nodes,
          {
            id: 'v9-component',
            type: 'external-component',
            name: '组件',
            x: 320,
            y: 180,
            width: 400,
            height: 260,
            rotation: 0,
            visible: true,
            locked: false,
            opacity: 1,
            playbackInitialVisibility: 'inherit',
            component: { packageId: 'example.card', version: '1.0.0' },
            props: { title: '标题' },
          },
        ],
      },
    }
    expect(workspaceSelectionAllowed(injected, {
      nodeIds: ['v9-component'],
      additive: false,
    })).toBe(true)
    expect(workspaceTransformAllowed(injected, {
      nodes: [transform('v9-component', 40, 50)],
    })).toBe(true)
    expect(workspaceTransformAllowed(injected, {
      nodes: [transform('v9-component', 40, 50), transform('v9-text', 1, 2)],
    })).toBe(true)
  })

  it('carries the projected runtime and global component layers into the carrier', () => {
    const base = input('carrier-dynamic', [createTextNode({
      id: 'v9-text',
      text: 'V9',
      x: 20,
      y: 30,
    })])
    const componentNode: ExternalComponentNode = {
      id: 'v9-component',
      type: 'external-component',
      name: '组件',
      x: 320,
      y: 180,
      width: 400,
      height: 260,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      playbackInitialVisibility: 'inherit',
      component: { packageId: 'example.card', version: '1.0.0' },
      props: { title: '标题' },
    }
    const injected: WorkspaceSlideAuthoringInput = {
      ...base.value,
      previewDocument: {
        ...base.value.previewDocument,
        runtime: {
          runtimeApiVersion: 2,
          enabled: true,
          renderMode: 'dom',
          source: 'CoursewareRuntime.define({ runtimeApiVersion: 2, create() { return { destroy() {} } } })',
          content: { values: { title: '动态标题' } },
          assets: {},
        },
      },
      globalRuntime: {
        runtimeApiVersion: 2,
        enabled: true,
        renderMode: 'dom',
        source: 'CoursewareRuntime.define({ runtimeApiVersion: 2, create() { return { destroy() {} } } })',
        content: { values: { globalTitle: '全局' } },
        assets: {},
      },
      globalCarrierLayerItems: [{
        node: componentNode,
        layer: 'overlay',
      }],
    }
    const legacy = createProject({ includeDefaultController: false, controls: 'none' })
    const preview = createWorkspaceSlidePreviewProject(
      legacy,
      legacy.scenes[0]!.id,
      injected,
    )

    expect(preview.scenes[0]!.runtime?.content.values.title).toBe('动态标题')
    expect(preview.scenes[0]!.nodes.map((node) => node.id)).toEqual(['v9-text'])
    expect(preview.globalRuntime?.content.values.globalTitle).toBe('全局')
    expect(preview.globalLayer).toEqual([{
      node: componentNode,
      layer: 'overlay',
      visibility: { mode: 'all', sceneIds: [] },
    }])
    expect(projectDocumentSchema.parse(preview)).toEqual(preview)
    expect(legacy).not.toHaveProperty('globalRuntime')
  })

  it('keeps preview generation stable for frame/name changes and invalidates real boundaries', () => {
    const injected = input('injected', [createTextNode({
      id: 'v9-text',
      text: 'V9',
      x: 20,
      y: 30,
    })])
    const initial = workspaceSlidePreviewGenerationIdentity(injected.value)
    const moved = workspaceSlidePreviewGenerationIdentity({
      ...injected.value,
      sceneName: '重命名不重建',
      document: {
        ...injected.value.document,
        name: '重命名不重建',
        nodes: injected.value.document.nodes.map((node) => ({
          ...node,
          x: node.x + 100,
          y: node.y + 50,
        })),
      },
    })
    expect(moved.structuralKey).toBe(initial.structuralKey)
    expect(moved.resourceKey).toBe(initial.resourceKey)
    expect(moved.assetFiles).toBe(initial.assetFiles)

    const reopened = workspaceSlidePreviewGenerationIdentity({
      ...injected.value,
      sessionId: 'new-session-same-scene-id',
    })
    expect(reopened.sessionId).not.toBe(initial.sessionId)

    const proxyChanged = workspaceSlidePreviewGenerationIdentity({
      ...injected.value,
      document: {
        ...injected.value.document,
        nodes: [
          ...injected.value.document.nodes,
          createTextNode({ id: 'v9-text-2', text: 'new' }),
        ],
      },
    })
    expect(proxyChanged.structuralKey).toBe(initial.structuralKey)
    const structurallyChanged = workspaceSlidePreviewGenerationIdentity({
      ...injected.value,
      previewDocument: {
        ...injected.value.previewDocument,
        nodes: [
          ...injected.value.previewDocument.nodes,
          createTextNode({ id: 'v9-text-2', text: 'new' }),
        ],
      },
    })
    expect(structurallyChanged.structuralKey).not.toBe(initial.structuralKey)

    const resourceChanged = workspaceSlidePreviewGenerationIdentity({
      ...injected.value,
      previewResources: {
        ...injected.value.previewResources,
        designTokens: {
          ...injected.value.previewResources.designTokens,
          colors: [{ id: 'accent', label: '强调', color: '#ff0000' }],
        },
      },
    })
    expect(resourceChanged.resourceKey).not.toBe(initial.resourceKey)
  })

  it('uses one carrier scene/state context only for injected preview', () => {
    const injected = input('injected')
    const legacyFiles = { legacy: new Uint8Array([9]) }
    expect(workspaceSlidePreviewSceneId(injected.value, 'legacy-scene')).toBe(
      injected.value.document.id,
    )
    expect(workspaceSlidePreviewStateId(injected.value, null)).toBe(
      WORKSPACE_SLIDE_PREVIEW_STATE_ID,
    )
    expect(workspaceSlidePreviewSceneId(undefined, 'legacy-scene')).toBe(
      'legacy-scene',
    )
    expect(workspaceSlidePreviewStateId(undefined, null)).toBeNull()
    expect(workspaceSlidePreviewAssetFiles(
      injected.value,
      legacyFiles,
    )).toBe(injected.value.previewResources.assetFiles)
    expect(workspaceSlidePreviewAssetFiles(undefined, legacyFiles)).toBe(
      legacyFiles,
    )
  })

  it('builds a sanitized single-scene carrier without hidden V8 content', () => {
    const project = createProject({
      id: 'v8-shell-project',
      now: '2026-08-15T03:00:00.000Z',
    })
    const sceneId = project.scenes[0]!.id
    project.scenes.push(createScene({ id: 'v8-hidden-scene', name: 'V8 hidden' }))
    project.assets['v8-hidden-asset'] = {
      id: 'v8-hidden-asset',
      filename: 'hidden.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/hidden.png',
      byteLength: 99,
    }
    project.componentPackages['v8-hidden-component'] = {
      packageId: 'v8-hidden-component',
      version: '1.0.0',
      name: 'V8 hidden',
      manifestPath: 'components/v8/manifest.json',
      runtimePath: 'components/v8/runtime.js',
      contentSha256: '0'.repeat(64),
    }
    project.globalInteractions = [{
      id: 'v8-hidden-rule',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [],
    }]
    project.globalRuntime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: 'CoursewareRuntime.define({ create(){} })',
      content: { values: {} },
      assets: {},
    }
    const text = createTextNode({
      id: 'v9-text',
      text: 'V9 可见文字',
      x: 440,
      y: 320,
    })
    const injected = input('injected', [text])
    const v9Asset = {
      id: 'v9-asset',
      filename: 'v9.png',
      mimeType: 'image/png',
      kind: 'image' as const,
      path: 'assets/v9.png',
      byteLength: 3,
    }
    const v9Bytes = new Uint8Array([1, 2, 3])
    const v9Component = {
      packageId: 'v9-component',
      version: '1.0.0',
      name: 'V9 component',
      manifestPath: 'components/v9/manifest.json',
      runtimePath: 'components/v9/runtime.js',
      contentSha256: '1'.repeat(64),
    }
    const sanitizedInput: WorkspaceSlideAuthoringInput = {
      ...injected.value,
      stateName: '反馈态',
      previewResources: {
        ...injected.value.previewResources,
        assets: { [v9Asset.id]: v9Asset },
        assetFiles: { [v9Asset.id]: v9Bytes },
        componentPackages: { 'v9-component': v9Component },
        designTokens: {
          fonts: [{ id: 'v9-font', label: 'V9', fontFamily: 'sans-serif' }],
          colors: [{ id: 'v9-color', label: 'V9', color: '#123456' }],
        },
        media: {
          ...injected.value.previewResources.media,
          audio: {
            ...injected.value.previewResources.media.audio,
            defaultMuted: true,
          },
        },
      },
    }
    const before = structuredClone(project)

    const preview = createWorkspaceSlidePreviewProject(
      project,
      sceneId,
      sanitizedInput,
    )

    expect(preview).not.toBe(project)
    expect(preview.id).toBe(`workspace-preview-${sanitizedInput.sessionId}`)
    expect(preview.id).not.toContain(project.id)
    expect(preview.title).toBe(sanitizedInput.sceneName)
    expect(preview.scenes).toHaveLength(1)
    expect(preview.scenes[0]).toMatchObject({
      id: sanitizedInput.document.id,
      nodes: [{ id: 'v9-text', text: 'V9 可见文字', x: 440, y: 320 }],
      presentation: {
        initialStateId: WORKSPACE_SLIDE_PREVIEW_STATE_ID,
        thumbnailStateId: WORKSPACE_SLIDE_PREVIEW_STATE_ID,
        states: [{
          id: WORKSPACE_SLIDE_PREVIEW_STATE_ID,
          name: '反馈态',
          nodeOverrides: {},
        }],
      },
    })
    expect(preview.scenes[0]!.nodes[0]).not.toBe(text)
    expect(preview.scenes[0]).not.toHaveProperty('runtime')
    expect(preview.globalLayer).toEqual([])
    expect(preview.globalInteractions).toEqual([])
    expect(preview).not.toHaveProperty('globalRuntime')
    expect(preview.assets).toEqual({ 'v9-asset': v9Asset })
    expect(preview.assets).not.toHaveProperty('v8-hidden-asset')
    expect(preview.componentPackages).toEqual({
      'v9-component': v9Component,
    })
    expect(preview.componentPackages).not.toHaveProperty(
      'v8-hidden-component',
    )
    expect(preview.designTokens).toEqual(
      sanitizedInput.previewResources.designTokens,
    )
    expect(preview.media).toEqual(sanitizedInput.previewResources.media)
    expect(preview.playback).toEqual({
      controls: 'none',
      keyboardNavigation: false,
      presenter: {
        enabled: false,
        strategy: 'scene-navigation',
        additionalBindings: [],
      },
    })
    expect(projectDocumentSchema.parse(preview)).toEqual(preview)
    expect(project).toEqual(before)
    expect(createWorkspaceSlidePreviewProject(project, sceneId, undefined)).toBe(project)
  })

  it('keeps scope proxies separate from the ordered read-only Player composition', () => {
    const sceneText = createTextNode({ id: 'scene-text', text: '场景文字', x: 80, y: 90 })
    const controller = createTeacherControllerNode({
      id: 'global-controller',
      x: 190,
      y: 638,
    })
    const base = input('split-carrier', [sceneText])
    const injected: WorkspaceSlideAuthoringInput = {
      ...base.value,
      editingScope: 'global',
      document: {
        ...base.value.document,
        nodes: [controller],
      },
      previewDocument: {
        ...base.value.previewDocument,
        nodes: [sceneText, controller],
      },
      selectedNodeIds: [controller.id],
    }
    const legacy = createProject({ includeDefaultController: false, controls: 'none' })
    const preview = createWorkspaceSlidePreviewProject(
      legacy,
      legacy.scenes[0]!.id,
      injected,
    )

    expect(workspaceSelectionAllowed(injected, {
      nodeIds: [controller.id],
      additive: false,
    })).toBe(true)
    expect(workspaceSelectionAllowed(injected, {
      nodeIds: [sceneText.id],
      additive: false,
    })).toBe(false)
    expect(preview.scenes[0]!.nodes.map((node) => node.id)).toEqual([
      sceneText.id,
      controller.id,
    ])
    expect(preview.globalLayer).toEqual([])
  })

  it('uses preview visibility for Player transform and restore patches', () => {
    const authorNode = createTextNode({
      id: 'scoped-out-text',
      text: '作者可见',
      x: 80,
      y: 90,
      visible: true,
    })
    const previewNode = { ...authorNode, visible: false }
    const base = input('scoped-out-preview', [authorNode])
    const injected: WorkspaceSlideAuthoringInput = {
      ...base.value,
      editingScope: 'surface',
      previewDocument: {
        ...base.value.previewDocument,
        nodes: [previewNode],
      },
    }

    expect(workspacePreviewNodeWithTransform(injected, authorNode.id)).toEqual(previewNode)
    expect(workspacePreviewNodeWithTransform(injected, authorNode.id, {
      x: 240,
      y: 180,
      width: 320,
      height: 120,
      rotation: 8,
    })).toMatchObject({
      id: authorNode.id,
      visible: false,
      x: 240,
      y: 180,
      width: 320,
      height: 120,
      rotation: 8,
    })
    expect(workspacePreviewNodeWithTransform(injected, 'missing-node')).toBeNull()
    expect(authorNode.visible).toBe(true)
  })
})
