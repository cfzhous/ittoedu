import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { COURSE_PROJECT_SCHEMA_VERSION } from '@/shared/courseProjectTypes'
import type { NativeLayerItem, ScopedLayerItem } from '@/shared/courseProjectTypes'
import {
  createSlideAuthoringBackend,
  openSlideAuthoringSession,
} from '@/renderer/course/slideAuthoringBackend'
import {
  selectSlideAuthoringSnapshot,
  selectSlideBackendKind,
  selectSlideCandidateBackend,
  selectSlideCandidateDocument,
  useEditorStore,
} from '@/renderer/store/editorStore'
import {
  SLIDE_BACKEND_NOT_CANDIDATE,
  V8_SLIDE_BACKEND,
  executeSlideCandidateCommand,
  getSlideBackendKind,
  isV9SlideCandidateBackend,
} from '@/renderer/store/slideBackendPort'

/**
 * Proves store backend exclusivity and the R3-CUT default V9 candidate.
 * Does not prove Workspace, ScenePanel, Player, or any V9 UI capability.
 */
const NOW = '2026-08-17T14:00:00.000Z'

function textStyle() {
  return {
    fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
    fontSize: 24,
    color: '#172033',
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    emphasis: false,
    highlightColor: null,
    align: 'left' as const,
    verticalAlign: 'top' as const,
    writingMode: 'horizontal' as const,
    lineSpacing: 1.3,
    letterSpacing: 0,
    padding: 4,
    overflow: 'fixed' as const,
    backgroundColor: '#ffffff',
    backgroundOpacity: 0,
    cornerRadius: 0,
  }
}

function nativeText(layerItemId: string, order: number, text: string): NativeLayerItem {
  return {
    layerItemId,
    label: text,
    frame: { mode: 'absolute', x: 40, y: 40, width: 220, height: 80 },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    kind: 'native',
    content: {
      nativeType: 'text',
      data: { text, runs: [], style: textStyle() },
    },
  }
}

function scoped(item: NativeLayerItem): ScopedLayerItem {
  return {
    item,
    visibility: { mode: 'all', locationIds: [] },
  }
}

function v9CandidateFixture() {
  return courseProjectDocumentSchema.parse({
    schemaVersion: COURSE_PROJECT_SCHEMA_VERSION,
    id: 'r2-seam-slide-candidate',
    revision: 1,
    title: 'R2-SEAM candidate',
    createdAt: NOW,
    updatedAt: NOW,
    assets: {},
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
    globalLayerItems: [scoped(nativeText('global-banner', 50, '全局条'))],
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
        layerItems: [nativeText('slide-title', 1, '可编辑标题')],
        interactions: [],
      }],
    }],
  })
}

function makeCandidateBackend() {
  return createSlideAuthoringBackend(openSlideAuthoringSession(v9CandidateFixture()))
}

beforeEach(() => {
  useEditorStore.getState().clearV9SlideCandidateBackend()
  useEditorStore.getState().createNewProject()
})

afterEach(() => {
  useEditorStore.getState().clearV9SlideCandidateBackend()
})

describe('V9 slide backend selection seam', () => {
  it('defaults to the V9 slide candidate backend', () => {
    const state = useEditorStore.getState()
    expect(selectSlideBackendKind(state)).toBe('v9-slide-candidate')
    expect(getSlideBackendKind(state.slideBackend)).toBe('v9-slide-candidate')
    expect(isV9SlideCandidateBackend(state.slideBackend)).toBe(true)
    expect(selectSlideCandidateBackend(state)).not.toBeNull()
    expect(selectSlideAuthoringSnapshot(state)).not.toBeNull()
    expect(selectSlideCandidateDocument(state)?.schemaVersion).toBe(COURSE_PROJECT_SCHEMA_VERSION)
    expect(state.project.schemaVersion).toBe(8)

    const documentBefore = selectSlideCandidateDocument(useEditorStore.getState())
    const revisionBefore = documentBefore?.revision ?? 0
    const scenesBefore = documentBefore?.surfaces
      .flatMap((surface) => surface.type === 'slide' ? surface.scenes : [])
      .length ?? 0
    const added = useEditorStore.getState().runSlideCandidateCommand((candidate) =>
      candidate.addScene({
        now: NOW,
        expectedRevision: candidate.getSnapshot().revision,
      }),
    )
    expect(added.ok).toBe(true)
    expect(added.historyEntry).toBe(true)
    const documentAfter = selectSlideCandidateDocument(useEditorStore.getState())
    expect(documentAfter?.schemaVersion).toBe(9)
    expect(documentAfter?.revision).toBe(revisionBefore + 1)
    expect(documentAfter?.surfaces.flatMap((surface) => (
      surface.type === 'slide' ? surface.scenes : []
    ))).toHaveLength(scenesBefore + 1)
  })

  it('injects one V9 candidate and writes only the candidate document', () => {
    const source = v9CandidateFixture()
    const backend = createSlideAuthoringBackend(openSlideAuthoringSession(source))

    useEditorStore.getState().injectV9SlideCandidateBackend(backend)

    const injected = useEditorStore.getState()
    expect(selectSlideBackendKind(injected)).toBe('v9-slide-candidate')
    expect(selectSlideCandidateBackend(injected)).toBe(backend)
    expect(selectSlideAuthoringSnapshot(injected)).toEqual(backend.getSnapshot())
    expect(selectSlideCandidateDocument(injected)?.schemaVersion).toBe(9)
    expect(selectSlideCandidateDocument(injected)?.id).toBe('r2-seam-slide-candidate')
    expect(injected.project.schemaVersion).toBe(8)

    const added = injected.runSlideCandidateCommand((candidate) =>
      candidate.addScene({
        now: NOW,
        expectedRevision: candidate.getSnapshot().revision,
      }),
    )
    expect(added.ok).toBe(true)
    expect(added.historyEntry).toBe(true)

    const afterCandidateWrite = useEditorStore.getState()
    expect(selectSlideBackendKind(afterCandidateWrite)).toBe('v9-slide-candidate')
    expect(selectSlideAuthoringSnapshot(afterCandidateWrite)?.revision).toBe(2)
    expect(selectSlideCandidateDocument(afterCandidateWrite)?.schemaVersion).toBe(9)
    expect(selectSlideCandidateDocument(afterCandidateWrite)?.revision).toBe(2)
    const writtenSurface = selectSlideCandidateDocument(afterCandidateWrite)?.surfaces[0]
    expect(
      writtenSurface && writtenSurface.type === 'slide' ? writtenSurface.scenes : [],
    ).toHaveLength(2)
    expect(source.revision).toBe(1)
    expect(source.surfaces[0] && source.surfaces[0].type === 'slide'
      ? source.surfaces[0].scenes
      : []).toHaveLength(1)
  })

  it('clears onto an explicit V8 backend, then createNewProject restores V9 writes', () => {
    const backend = makeCandidateBackend()
    useEditorStore.getState().injectV9SlideCandidateBackend(backend)
    expect(selectSlideBackendKind(useEditorStore.getState())).toBe('v9-slide-candidate')

    useEditorStore.getState().clearV9SlideCandidateBackend()

    const cleared = useEditorStore.getState()
    expect(selectSlideBackendKind(cleared)).toBe('v8')
    expect(selectSlideCandidateBackend(cleared)).toBeNull()
    expect(selectSlideAuthoringSnapshot(cleared)).toBeNull()
    expect(selectSlideCandidateDocument(cleared)).toBeNull()
    expect(cleared.slideBackend).toBe(V8_SLIDE_BACKEND)
    expect(
      executeSlideCandidateCommand(cleared.slideBackend, (candidate) => candidate.addScene()),
    ).toMatchObject({
      ok: false,
      reason: SLIDE_BACKEND_NOT_CANDIDATE,
      historyEntry: false,
    })

    cleared.createNewProject()
    const restored = useEditorStore.getState()
    expect(selectSlideBackendKind(restored)).toBe('v9-slide-candidate')
    expect(selectSlideCandidateDocument(restored)?.schemaVersion).toBe(9)
    expect(restored.errorMessage).toBeNull()

    const revisionBefore = selectSlideAuthoringSnapshot(restored)?.revision ?? 0
    const added = restored.runSlideCandidateCommand((candidate) =>
      candidate.addScene({
        now: NOW,
        expectedRevision: candidate.getSnapshot().revision,
      }),
    )
    expect(added.ok).toBe(true)
    expect(selectSlideAuthoringSnapshot(useEditorStore.getState())?.revision).toBe(revisionBefore + 1)
    expect(selectSlideCandidateDocument(useEditorStore.getState())?.schemaVersion).toBe(9)
  })
})
