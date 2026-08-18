import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { COURSE_PROJECT_SCHEMA_VERSION } from '@/shared/courseProjectTypes'
import { stageResizeHandleWorldPoint } from '@/renderer/authoring/stageViewportTransform'
import {
  addSlideImageLayer,
  addSlideRuntimeLayer,
} from '@/renderer/course/v9SlideContentCommands'
import {
  createSlideCandidateBackend,
  openSlideAuthoringSession,
} from '@/renderer/course/v9SlideVerticalSlice'
import { onElementAnimationPreviewRequested } from '@/renderer/phaser/elementAnimationPreviewBus'
import {
  selectEditingNodes,
  selectSlideAuthoringSnapshot,
  selectSlideBackendKind,
  selectSlideCandidateBackend,
  selectSlideCandidateDocument,
  useEditorStore,
} from '@/renderer/store/editorStore'
import { ElementsTab } from '@/renderer/ui/ElementsTab'
import { NodesTab } from '@/renderer/ui/NodesTab'
import { PropertiesTab } from '@/renderer/ui/PropertiesTab'
import { ScenePanel } from '@/renderer/ui/ScenePanel'
import {
  createSlideWorkspaceAuthoringController,
  listSlideWorkspaceHitTargets,
} from '@/renderer/ui/workspaceSlideAuthoring'
import { hitTestV9SlideLayerItems } from '@/renderer/phaser/v9SlideHitAdapter'

/**
 * Proves R2-Z wiring: same V8 UI components against the R3-CUT default V9 Slide candidate.
 * Does not prove MediaTab, global/controller, Player, or a live Electron window.
 */
const NOW = '2026-08-17T14:30:00.000Z'
const VIEW = {
  viewport: { x: 0, y: 0, width: 1280, height: 720 },
  zoom: 1,
  pan: { x: 0, y: 0 },
}

function v9EmptySlideFixture() {
  return courseProjectDocumentSchema.parse({
    schemaVersion: COURSE_PROJECT_SCHEMA_VERSION,
    id: 'r2z-slide-product',
    revision: 1,
    title: 'R2-Z candidate',
    createdAt: NOW,
    updatedAt: NOW,
    assets: {
      'asset-photo': {
        id: 'asset-photo',
        filename: 'photo.png',
        mimeType: 'image/png',
        kind: 'image',
        path: 'assets/photo.png',
        byteLength: 8,
        width: 800,
        height: 600,
      },
    },
    componentPackages: {},
    designTokens: {
      fonts: [{
        id: 'body',
        label: '正文',
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
      }],
      colors: [
        { id: 'background', label: '背景', color: '#ffffff' },
        { id: 'text', label: '正文', color: '#1f2937' },
      ],
    },
    media: {
      audio: {
        defaultMuted: false,
        masterVolume: 1,
        channelVolumes: { music: 1, narration: 1, sfx: 1, ui: 1, video: 1 },
        sounds: {},
        narrationDucking: { enabled: true, musicVolume: 0.3, fadeMs: 250 },
      },
    },
    playback: {
      controls: 'none',
      keyboardNavigation: true,
      presenter: { enabled: true, strategy: 'scene-navigation', additionalBindings: [] },
    },
    courseState: [],
    navigationGuards: [],
    globalLayerItems: [],
    globalInteractions: [],
    locations: [{
      id: 'location-scene-1',
      label: '场景 1',
      kind: 'slide-scene',
      surfaceId: 'surface-slide',
      sceneId: 'scene-1',
    }],
    startLocationId: 'location-scene-1',
    surfaces: [{
      id: 'surface-slide',
      title: '演示',
      type: 'slide',
      canvas: { width: 1280, height: 720 },
      surfaceLayerItems: [],
      scenes: [{
        id: 'scene-1',
        name: '场景 1',
        backgroundColor: '#ffffff',
        layerItems: [],
        interactions: [],
      }],
    }],
  })
}

function injectCandidate() {
  const backend = createSlideCandidateBackend(
    openSlideAuthoringSession(v9EmptySlideFixture()),
  )
  useEditorStore.getState().injectV9SlideCandidateBackend(backend)
  return backend
}

function nativeFrame(layerItemId: string) {
  const document = selectSlideCandidateDocument(useEditorStore.getState())
  const surface = document?.surfaces.find((candidate) => candidate.type === 'slide')
  if (!surface || surface.type !== 'slide') throw new Error('expected slide surface')
  const item = surface.scenes[0]?.layerItems.find((candidate) => candidate.layerItemId === layerItemId)
  if (!item || item.kind !== 'native') throw new Error(`expected native ${layerItemId}`)
  return item.frame
}

beforeEach(() => {
  useEditorStore.getState().clearV9SlideCandidateBackend()
  useEditorStore.getState().createNewProject()
})

afterEach(() => {
  cleanup()
  useEditorStore.getState().clearV9SlideCandidateBackend()
})

function slideSceneLayerItems() {
  const document = selectSlideCandidateDocument(useEditorStore.getState())
  const surface = document?.surfaces.find((candidate) => candidate.type === 'slide')
  if (!surface || surface.type !== 'slide') return []
  return surface.scenes[0]?.layerItems ?? []
}

describe('V9 slide product integration on the real V8 UI', () => {
  it('defaults to the V9 slide candidate backend and writes inserted text into the candidate document', () => {
    expect(selectSlideBackendKind(useEditorStore.getState())).toBe('v9-slide-candidate')
    expect(selectSlideCandidateBackend(useEditorStore.getState())).not.toBeNull()
    expect(selectSlideAuthoringSnapshot(useEditorStore.getState())).not.toBeNull()
    expect(selectSlideCandidateDocument(useEditorStore.getState())?.schemaVersion).toBe(
      COURSE_PROJECT_SCHEMA_VERSION,
    )

    const revisionBefore = selectSlideAuthoringSnapshot(useEditorStore.getState())?.revision ?? 0
    const nodesBefore = selectEditingNodes(useEditorStore.getState()).length
    render(<ElementsTab onAddImage={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: '文本' }))
    expect(selectEditingNodes(useEditorStore.getState())).toHaveLength(nodesBefore + 1)
    expect(selectEditingNodes(useEditorStore.getState()).at(-1)?.type).toBe('text')
    expect(selectSlideAuthoringSnapshot(useEditorStore.getState())?.revision).toBe(revisionBefore + 1)
    expect(slideSceneLayerItems().some((item) => (
      item.kind === 'native' && item.content.nativeType === 'text'
    ))).toBe(true)
  })

  it('notifies Zustand after a successful candidate command', () => {
    injectCandidate()
    let notifications = 0
    const unsubscribe = useEditorStore.subscribe(() => {
      notifications += 1
    })
    render(<ElementsTab onAddImage={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: '文本' }))
    unsubscribe()
    expect(notifications).toBeGreaterThan(0)
    expect(selectSlideAuthoringSnapshot(useEditorStore.getState())?.revision).toBe(2)
    expect(selectSlideCandidateDocument(useEditorStore.getState())?.schemaVersion).toBe(9)
    expect(slideSceneLayerItems().some((item) => (
      item.kind === 'native' && item.content.nativeType === 'text'
    ))).toBe(true)
  })

  it('inserts two staggered texts, west-resizes, applies selection bold, then undoes', () => {
    injectCandidate()
    render(<ScenePanel />)
    render(<ElementsTab onAddImage={() => undefined} />)

    fireEvent.click(screen.getByTestId('add-text'))
    fireEvent.click(screen.getByTestId('add-text'))

    const nodes = selectEditingNodes(useEditorStore.getState())
    expect(nodes).toHaveLength(2)
    expect(nodes.every((node) => node.type === 'text')).toBe(true)
    const ordered = [...nodes].sort((left, right) => left.x - right.x || left.y - right.y)
    expect(ordered[1]?.x).toBe((ordered[0]?.x ?? 0) + 20)
    expect(ordered[1]?.y).toBe(ordered[0]?.y)
    expect(selectSlideCandidateDocument(useEditorStore.getState())?.schemaVersion).toBe(9)
    expect(slideSceneLayerItems().filter((item) => (
      item.kind === 'native' && item.content.nativeType === 'text'
    ))).toHaveLength(2)

    const firstId = ordered[0]!.id
    const secondId = ordered[1]!.id
    const startFrame = nativeFrame(firstId)

    useEditorStore.getState().setActiveTab('layers')
    render(<NodesTab />)
    const firstRow = screen.getByTestId(`node-item-${firstId}`).querySelector('.node-name')
    expect(firstRow).toBeTruthy()
    fireEvent.click(firstRow!, { detail: 0 })

    expect(useEditorStore.getState().selectedNodeId).toBe(firstId)

    const controller = createSlideWorkspaceAuthoringController()
    controller.selectFromLayerIds([firstId], VIEW)
    const west = stageResizeHandleWorldPoint(
      {
        x: startFrame.x,
        y: startFrame.y,
        width: startFrame.width,
        height: startFrame.height,
      },
      'w',
    )
    const down = controller.pointerDown({ x: west.x, y: west.y }, VIEW)
    expect(down.kind).toBe('v9-slide-candidate')
    const revisionAfterDown = selectSlideAuthoringSnapshot(useEditorStore.getState())?.revision
    controller.pointerMove({ x: west.x - 40, y: west.y }, VIEW)
    expect(selectSlideAuthoringSnapshot(useEditorStore.getState())?.revision).toBe(revisionAfterDown)
    const up = controller.pointerUp({ x: west.x - 40, y: west.y }, VIEW)
    expect(up.kind).toBe('v9-slide-candidate')
    if (up.kind !== 'v9-slide-candidate') throw new Error('expected v9-slide-candidate')
    expect(up.command?.ok).toBe(true)
    expect(up.command?.historyEntry).toBe(true)
    expect(nativeFrame(firstId)).toMatchObject({
      x: startFrame.x - 40,
      width: startFrame.width + 40,
      y: startFrame.y,
      height: startFrame.height,
    })

    render(<PropertiesTab onReplaceImage={() => undefined} />)
    const textarea = screen.getByRole('textbox', { name: '文字内容' }) as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(0, 2)
    fireEvent.mouseDown(screen.getByRole('button', { name: '加粗' }))
    fireEvent.click(screen.getByRole('button', { name: '加粗' }))

    const textNode = selectEditingNodes(useEditorStore.getState()).find((node) => node.id === firstId)
    expect(textNode?.type).toBe('text')
    if (textNode?.type !== 'text') throw new Error('expected text')
    expect(textNode.runs.some((run) => run.start === 0 && run.end === 2 && run.style.bold === true)).toBe(true)

    const revisionAfterBold = selectSlideAuthoringSnapshot(useEditorStore.getState())?.revision
    useEditorStore.getState().undo()
    expect(selectSlideAuthoringSnapshot(useEditorStore.getState())?.revision).toBe((revisionAfterBold ?? 1) - 1)
    const undone = selectEditingNodes(useEditorStore.getState()).find((node) => node.id === firstId)
    expect(undone?.type).toBe('text')
    if (undone?.type !== 'text') throw new Error('expected text')
    expect(undone.runs.some((run) => run.style.bold === true)).toBe(false)
    expect(selectEditingNodes(useEditorStore.getState()).map((node) => node.id)).toEqual(
      expect.arrayContaining([firstId, secondId]),
    )
    expect(selectSlideCandidateDocument(useEditorStore.getState())?.schemaVersion).toBe(9)
    expect(slideSceneLayerItems().map((item) => item.layerItemId)).toEqual(
      expect.arrayContaining([firstId, secondId]),
    )
  })

  it('writes inserted image/runtime into the candidate session and hits them with the existing adapter', () => {
    injectCandidate()
    const image = useEditorStore.getState().applySlideCandidateCommand((session) =>
      addSlideImageLayer(session, { assetId: 'asset-photo' }, {
        expectedRevision: session.history.present.revision,
      }),
    )
    expect(image.ok).toBe(true)
    const imageId = image.selection?.selectionIds[0]
    expect(imageId).toBeTruthy()

    const runtime = useEditorStore.getState().applySlideCandidateCommand((session) =>
      addSlideRuntimeLayer(session, {}, {
        expectedRevision: session.history.present.revision,
      }),
    )
    expect(runtime.ok).toBe(true)
    const runtimeId = runtime.selection?.selectionIds[0]
    expect(runtimeId).toBeTruthy()

    const targets = listSlideWorkspaceHitTargets()
    expect(targets.map((target) => target.layerItemId)).toEqual(
      expect.arrayContaining([imageId, runtimeId]),
    )
    const imageTarget = targets.find((target) => target.layerItemId === imageId)!
    const runtimeTarget = targets.find((target) => target.layerItemId === runtimeId)!
    expect(hitTestV9SlideLayerItems(targets, {
      x: imageTarget.bounds.x + 8,
      y: imageTarget.bounds.y + 8,
    })?.layerItemId).toBe(imageId)
    expect(hitTestV9SlideLayerItems(targets, {
      x: runtimeTarget.bounds.x + 8,
      y: runtimeTarget.bounds.y + 8,
    })?.layerItemId).toBe(runtimeId)

    const controller = createSlideWorkspaceAuthoringController()
    const selected = controller.selectFromLayerIds([imageId!], VIEW)
    expect(selected.kind).toBe('v9-slide-candidate')
    if (selected.kind !== 'v9-slide-candidate') throw new Error('expected v9-slide-candidate')
    expect(selected.targets?.[0]?.layerItemId).toBe(imageId)
    expect(JSON.stringify(selected.targets?.[0])).not.toMatch(/hitId/)
  })

  it('previews simple entrance animation through the existing motion bus and ignores Delete while editing text', () => {
    injectCandidate()
    render(<ElementsTab onAddImage={() => undefined} />)
    fireEvent.click(screen.getByTestId('add-text'))
    const nodeId = selectEditingNodes(useEditorStore.getState())[0]!.id
    useEditorStore.getState().selectNode(nodeId)
    useEditorStore.getState().setEditorMode('simple')

    const previews: Array<{ actionType: string }> = []
    const stop = onElementAnimationPreviewRequested((request) => {
      previews.push({ actionType: request.action.type })
    })
    useEditorStore.getState().setSimpleEntranceAnimation(nodeId, {
      effect: 'slide',
      direction: 'left',
      durationMs: 420,
      delayMs: 80,
    })
    expect(previews).toEqual([])
    render(<PropertiesTab onReplaceImage={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    stop()
    expect(previews).toEqual([{ actionType: 'node.enter' }])

    useEditorStore.getState().beginTextEdit(nodeId, 'canvas')
    const layerCount = selectEditingNodes(useEditorStore.getState()).length
    useEditorStore.getState().deleteSelectedNodes()
    expect(selectEditingNodes(useEditorStore.getState())).toHaveLength(layerCount)
    expect(useEditorStore.getState().errorMessage).toMatch(/文字|Delete|文本/)
  })
})
