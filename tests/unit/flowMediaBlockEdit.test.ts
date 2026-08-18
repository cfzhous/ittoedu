import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import {
  COURSE_PROJECT_SCHEMA_VERSION,
  type CourseProjectDocument,
  type FlowBlock,
  type FlowMediaBlock,
} from '@/shared/courseProjectTypes'
import { syncFlowCourseLocations } from '@/renderer/course/flowDocumentModel'
import {
  executeFlowEditorCommand,
  replaceFlowMediaBlockAsset,
  updateFlowEditorBlock,
} from '@/renderer/course/flowEditorCommands'
import {
  flowBlockTargetFromSelection,
  selectFlowEditorBlock,
} from '@/renderer/course/flowEditorSlice'

const NOW = '2026-08-18T14:31:00.000Z'

function createMediaEditProject(): CourseProjectDocument {
  const blocks: FlowBlock[] = [
    { id: 'h1', type: 'heading', level: 1, text: '媒体编辑' },
    {
      id: 'media-image',
      type: 'media',
      assetId: 'asset-image',
      mediaKind: 'image',
      altText: '示意图',
      caption: '封面图',
      layout: 'content-width',
    },
  ]
  const project: CourseProjectDocument = {
    schemaVersion: COURSE_PROJECT_SCHEMA_VERSION,
    id: 'flow-media-block-edit',
    revision: 1,
    title: 'Flow 媒体编辑',
    createdAt: NOW,
    updatedAt: NOW,
    assets: {
      'asset-image': {
        id: 'asset-image',
        filename: 'cover.png',
        mimeType: 'image/png',
        kind: 'image',
        path: 'media/cover.png',
        byteLength: 8,
        width: 64,
        height: 36,
      },
      'asset-image-2': {
        id: 'asset-image-2',
        filename: 'cover-b.png',
        mimeType: 'image/png',
        kind: 'image',
        path: 'media/cover-b.png',
        byteLength: 8,
        width: 64,
        height: 36,
      },
      'asset-audio': {
        id: 'asset-audio',
        filename: 'voice.mp3',
        mimeType: 'audio/mpeg',
        kind: 'audio',
        path: 'media/voice.mp3',
        byteLength: 8,
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
      id: 'h1',
      label: '媒体编辑',
      kind: 'flow-block',
      surfaceId: 'flow',
      blockId: 'h1',
    }],
    startLocationId: 'h1',
    surfaces: [{
      id: 'flow',
      type: 'flow',
      title: '讲义',
      layout: { readingWidth: 760, wideContentWidth: 1120 },
      surfaceLayerItems: [],
      blocks,
    }],
  }
  syncFlowCourseLocations(project, 'flow')
  return courseProjectDocumentSchema.parse(project)
}

function mediaBlock(document: CourseProjectDocument, id = 'media-image'): FlowMediaBlock {
  const surface = document.surfaces.find((candidate) => candidate.id === 'flow')
  if (!surface || surface.type !== 'flow') throw new Error('expected flow surface')
  const block = surface.blocks.find((candidate) => candidate.id === id)
  if (!block || block.type !== 'media') throw new Error(`expected media ${id}`)
  return block
}

describe('Flow media block field and asset replacement commands', () => {
  it('updates alt, caption and layout on the current media block', () => {
    const project = createMediaEditProject()
    const selection = selectFlowEditorBlock(project, 'h1', 'media-image')
    const result = updateFlowEditorBlock(
      project,
      flowBlockTargetFromSelection(project, selection),
      { altText: '新说明', caption: '新题注', layout: 'full-width' },
    )
    expect(result.ok).toBe(true)
    const next = mediaBlock(result.nextDocument!)
    expect(next.altText).toBe('新说明')
    expect(next.caption).toBe('新题注')
    expect(next.layout).toBe('full-width')
    expect(next.assetId).toBe('asset-image')
  })

  it('replaces assetId with a same-kind library asset and refuses a different kind', () => {
    const project = createMediaEditProject()
    const selection = selectFlowEditorBlock(project, 'h1', 'media-image')
    const target = flowBlockTargetFromSelection(project, selection)
    const replaced = replaceFlowMediaBlockAsset(project, target, 'asset-image-2')
    expect(replaced.ok).toBe(true)
    const next = mediaBlock(replaced.nextDocument!)
    expect(next.assetId).toBe('asset-image-2')
    expect(next.layout).toBe('content-width')
    expect(next.caption).toBe('封面图')

    const wrongKind = replaceFlowMediaBlockAsset(replaced.nextDocument!, target, 'asset-audio')
    expect(wrongKind.ok).toBe(false)
    expect(wrongKind.reason).toContain('类型')
    expect(mediaBlock(replaced.nextDocument!).assetId).toBe('asset-image-2')
  })

  it('refuses to treat a heading as a media asset replacement target', () => {
    const project = createMediaEditProject()
    const selection = selectFlowEditorBlock(project, 'h1', 'h1')
    const result = replaceFlowMediaBlockAsset(
      project,
      flowBlockTargetFromSelection(project, selection),
      'asset-image-2',
    )
    expect(result.ok).toBe(false)
    expect(result.nextDocument).toBeUndefined()
  })

  it('deletes the selected media block through the existing Flow delete command', () => {
    const project = createMediaEditProject()
    const selection = selectFlowEditorBlock(project, 'h1', 'media-image')
    const deleted = executeFlowEditorCommand(project, selection, { name: 'delete' })
    expect(deleted.ok).toBe(true)
    const surface = deleted.nextDocument!.surfaces.find((candidate) => candidate.id === 'flow')
    if (!surface || surface.type !== 'flow') throw new Error('expected flow surface')
    expect(surface.blocks.some((block) => block.id === 'media-image')).toBe(false)
    expect(surface.blocks.some((block) => block.id === 'h1')).toBe(true)
  })
})
