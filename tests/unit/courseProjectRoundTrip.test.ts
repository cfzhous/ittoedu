import { describe, expect, it } from 'vitest'
import { makeAuthoringAddress } from '@/shared/authoringAddress'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  NativeLayerItem,
  ScopedLayerItem,
} from '@/shared/courseProjectTypes'
import { publishedCourseV2Schema } from '@/shared/publishedCourseSchema'
import { buildPublishedCourseV2Payload } from '@/renderer/export/course'
import {
  createCourseProjectArchive,
  detectCourseProjectArchiveFormat,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'

const NOW = '2026-08-17T13:00:00.000Z'
const ASSET_BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

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
    label: layerItemId,
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

function nativeImage(layerItemId: string, order: number, assetId: string): NativeLayerItem {
  return {
    layerItemId,
    label: layerItemId,
    frame: { mode: 'absolute', x: 80, y: 160, width: 320, height: 180 },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    kind: 'native',
    content: {
      nativeType: 'image',
      data: {
        assetId,
        preserveAspectRatio: true,
        fit: 'contain',
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        cropX: 0.5,
        cropY: 0.5,
        flipX: false,
        flipY: false,
        cornerRadius: 0,
        feather: { amount: 0, mode: 'rectangle' },
        safeAreas: [],
      },
    },
  }
}

function scoped(item: NativeLayerItem): ScopedLayerItem {
  return {
    item,
    visibility: { mode: 'all', locationIds: [] },
  }
}

function minimalV9Project(): CourseProjectDocument {
  return {
    schemaVersion: 9,
    id: 'r1z-round-trip',
    revision: 1,
    title: 'R1-Z 最小协议',
    createdAt: NOW,
    updatedAt: NOW,
    assets: {
      badge: {
        id: 'badge',
        filename: 'badge.png',
        mimeType: 'image/png',
        kind: 'image',
        path: 'assets/badge.bin',
        byteLength: ASSET_BYTES.byteLength,
        width: 2,
        height: 2,
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
        layerItems: [
          nativeText('slide-title', 1, '可编辑标题'),
          nativeImage('slide-badge', 2, 'badge'),
        ],
        interactions: [],
      }],
    }],
  }
}

describe('Course Project V9 protocol round-trip', () => {
  it('validates, archives, reopens and publishes a minimal Slide project', () => {
    const project = courseProjectDocumentSchema.parse(minimalV9Project())
    expect(project.schemaVersion).toBe(9)
    expect(project.surfaces).toHaveLength(1)
    expect(project.locations).toHaveLength(1)
    expect(project.globalLayerItems[0]?.item.layerItemId).toBe('global-banner')
    expect(project.assets.badge?.id).toBe('badge')

    const archiveBytes = createCourseProjectArchive({
      project,
      assetFiles: { badge: ASSET_BYTES },
      componentFiles: {},
    }, { mtime: NOW })
    expect(detectCourseProjectArchiveFormat(archiveBytes)).toMatchObject({
      kind: 'v9',
      identity: { schemaVersion: 9, projectId: 'r1z-round-trip', title: 'R1-Z 最小协议' },
    })

    const reopened = openCourseProjectArchive(archiveBytes)
    const reparsed = courseProjectDocumentSchema.parse(reopened.project)
    expect(reparsed).toEqual(project)
    expect([...reopened.assetFiles.badge!]).toEqual([...ASSET_BYTES])

    const titleAddress = makeAuthoringAddress({
      projectId: reparsed.id,
      scope: 'scene',
      surfaceId: 'surface-slide',
      sceneId: 'scene-1',
      carrier: 'native',
      layerItemId: 'slide-title',
      field: 'content.data.text',
    })
    expect(titleAddress).toBe(
      'courseware://authoring/r1z-round-trip/scene/surface-slide/scene-1/native/slide-title?field=content.data.text',
    )
    expect(titleAddress).not.toMatch(/hit/i)

    const published = buildPublishedCourseV2Payload({
      project: reparsed,
      assetFiles: reopened.assetFiles,
      components: {},
    })
    expect(publishedCourseV2Schema.parse(published)).toEqual(published)
    expect(published.format).toBe('h5course-published')
    expect(published.formatVersion).toBe(2)
    expect(published.sourceSchemaVersion).toBe(9)
    expect(published.courseId).toBe('r1z-round-trip')
    expect(published.locations.map((location) => location.id)).toEqual(['location-scene-1'])
    expect(published.globalLayerItems.map((entry) => entry.item.layerItemId)).toEqual(['global-banner'])
    const slide = published.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide surface')
    expect(slide.scenes[0]?.layerItems.map((item) => item.layerItemId)).toEqual([
      'slide-title',
      'slide-badge',
    ])
    expect(Object.keys(published.assets)).toEqual(['badge'])
    expect(published.assets.badge?.mimeType).toBe('image/png')
    expect(published.assets.badge?.url.startsWith('data:image/png;base64,')).toBe(true)
  })
})
