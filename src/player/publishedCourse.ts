import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
  LayerItem,
  ScopedLayerItem,
} from '../shared/courseProjectTypes'
import { publishedCourseV2Schema } from '../shared/publishedCourseSchema'
import {
  PUBLISHED_COURSE_FORMAT,
  PUBLISHED_COURSE_VERSION,
  type PublishedCourseSurface,
  type PublishedCourseV2Payload,
  type PublishedLayerItem,
  type PublishedScopedLayerItem,
} from '../shared/publishedCourseTypes'

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/\s/g, '')
  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error('Published executable contains invalid Base64 data')
  }
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function decodePublishedCourseCode(
  encoded: { encoding: 'base64-utf16le'; data: string },
  label = 'Published executable',
): string {
  if (encoded.encoding !== 'base64-utf16le') {
    throw new Error(`${label} uses an unsupported encoding`)
  }
  const bytes = base64ToBytes(encoded.data)
  if (bytes.byteLength % 2 !== 0) throw new Error(`${label} has an invalid UTF-16LE byte length`)
  const codeUnits = new Uint16Array(bytes.byteLength / 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < codeUnits.length; index += 1) {
    codeUnits[index] = view.getUint16(index * 2, true)
  }
  const chunkSize = 16_384
  let result = ''
  for (let offset = 0; offset < codeUnits.length; offset += chunkSize) {
    result += String.fromCharCode(...codeUnits.subarray(offset, offset + chunkSize))
  }
  return result
}

export function isPublishedCourseV2Payload(value: unknown): value is PublishedCourseV2Payload {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<PublishedCourseV2Payload>
  return candidate.format === PUBLISHED_COURSE_FORMAT &&
    candidate.formatVersion === PUBLISHED_COURSE_VERSION
}

function restoreLayerItem(item: PublishedLayerItem): LayerItem {
  if (item.kind === 'native') {
    return {
      ...structuredClone(item),
      label: item.layerItemId,
      locked: false,
    }
  }
  if (item.kind === 'component') {
    return {
      ...structuredClone(item),
      label: item.layerItemId,
      locked: false,
    }
  }
  const { code, ...runtime } = item.runtime
  return {
    ...structuredClone(item),
    label: item.layerItemId,
    locked: false,
    kind: 'runtime',
    runtime: {
      ...structuredClone(runtime),
      source: decodePublishedCourseCode(code, `Runtime ${item.layerItemId}`),
    },
  }
}

function restoreScoped(entry: PublishedScopedLayerItem): ScopedLayerItem {
  return {
    item: restoreLayerItem(entry.item),
    visibility: structuredClone(entry.visibility),
  }
}

function restoreSurface(surface: PublishedCourseSurface): CourseSurfaceDocument {
  const base = {
    id: surface.id,
    title: surface.title,
    surfaceLayerItems: surface.surfaceLayerItems.map(restoreScoped),
  }
  if (surface.type === 'slide') {
    return {
      ...base,
      type: 'slide',
      canvas: structuredClone(surface.canvas),
      scenes: surface.scenes.map((scene) => ({
        ...structuredClone(scene),
        layerItems: scene.layerItems.map(restoreLayerItem),
        presentation: scene.presentation
          ? {
              initialStateId: scene.presentation.initialStateId,
              states: structuredClone(scene.presentation.states),
            }
          : undefined,
      })),
    }
  }
  if (surface.type === 'flow') {
    return {
      ...base,
      type: 'flow',
      layout: structuredClone(surface.layout),
      blocks: structuredClone(surface.blocks),
    }
  }
  return {
    ...base,
    type: 'spatial-2d',
    world: {
      bounds: structuredClone(surface.world.bounds),
      layerItems: surface.world.layerItems.map(restoreLayerItem),
    },
    camera: structuredClone(surface.camera),
    semanticZoom: structuredClone(surface.semanticZoom),
  }
}

/**
 * Hydrates only the fields Surface Hosts need. This is never an authoring
 * migration: revision/timestamps and embedded-package paths are synthetic and
 * the result must not be offered for saving as a CourseProject.
 */
export function publishedCourseToPlayerDocument(
  value: PublishedCourseV2Payload,
): CourseProjectDocument {
  const published = publishedCourseV2Schema.parse(value)
  const timestamp = '2000-01-01T00:00:00.000Z'
  return {
    schemaVersion: 9,
    id: published.courseId,
    revision: 0,
    title: published.title,
    createdAt: timestamp,
    updatedAt: timestamp,
    assets: Object.fromEntries(Object.entries(published.assets).map(([id, asset]) => [id, {
      id,
      filename: `${id}.published`,
      mimeType: asset.mimeType,
      kind: asset.mimeType.startsWith('audio/')
        ? 'audio'
        : asset.mimeType.startsWith('video/')
          ? 'video'
          : 'image',
      path: `published-assets/${id}`,
      byteLength: 0,
    }])),
    componentPackages: Object.fromEntries(Object.entries(published.components).map(([key, component]) => [component.id, {
      packageId: component.id,
      version: component.version,
      name: component.name,
      manifestPath: `published-components/${key}/manifest.json`,
      runtimePath: `published-components/${key}/runtime.js`,
      contentSha256: component.contentSha256,
    }])),
    designTokens: structuredClone(published.designTokens),
    media: structuredClone(published.media),
    playback: structuredClone(published.playback),
    courseState: structuredClone(published.courseState),
    navigationGuards: structuredClone(published.navigationGuards),
    locations: structuredClone(published.locations),
    startLocationId: published.startLocationId,
    globalLayerItems: published.globalLayerItems.map(restoreScoped),
    globalInteractions: structuredClone(published.globalInteractions),
    surfaces: published.surfaces.map(restoreSurface),
    ...(published.mixedPrintPlan
      ? { mixedPrintPlan: structuredClone(published.mixedPrintPlan) }
      : {}),
  }
}
