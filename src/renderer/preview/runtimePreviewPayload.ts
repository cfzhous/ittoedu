import type {
  ComponentPackageData,
  ExportPayload,
} from '@/shared/componentTypes'
import type { ProjectDocument } from '@/shared/projectTypes'
import { componentPackageKey } from '@/renderer/project/archivePath'
import {
  BlobUrlRegistry,
  type ObjectUrlApi,
} from '@/renderer/project/blobUrlRegistry'
import { assertV3ExportDependencies } from '@/renderer/export/v3ExportSupport'

export interface RuntimePreviewPayloadInput {
  project: ProjectDocument
  assetFiles: Readonly<Record<string, Uint8Array>>
  components: Readonly<Record<string, ComponentPackageData>>
}

export interface RuntimePreviewPayloadResources {
  payload: ExportPayload
  revoke(): void
}

const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  json: 'application/json',
  txt: 'text/plain',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
}

function inferMimeType(path: string): string {
  const cleanPath = path.split(/[?#]/, 1)[0] ?? path
  const extension = cleanPath.includes('.')
    ? (cleanPath.split('.').pop()?.toLowerCase() ?? '')
    : ''
  return MIME_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

function findComponent(
  components: Readonly<Record<string, ComponentPackageData>>,
  recordKey: string,
  packageId: string,
  version: string,
): ComponentPackageData | undefined {
  return (
    components[recordKey] ??
    components[componentPackageKey(packageId, version)] ??
    components[packageId] ??
    Object.values(components).find(
      ({ manifest }) => manifest.id === packageId && manifest.version === version,
    )
  )
}

/**
 * Builds the Player payload with object URLs instead of Base64 media. The
 * caller owns the returned resource set and must revoke it when replacing or
 * closing the preview iframe.
 */
export function createRuntimePreviewPayloadResources(
  input: RuntimePreviewPayloadInput,
  urlApi?: ObjectUrlApi,
): RuntimePreviewPayloadResources {
  const registry = new BlobUrlRegistry(urlApi)
  try {
    const payload: ExportPayload = {
      project: structuredClone(input.project),
      assets: Object.create(null) as ExportPayload['assets'],
      components: Object.create(null) as ExportPayload['components'],
    }

    for (const [recordKey, meta] of Object.entries(input.project.assets)) {
      const bytes = input.assetFiles[recordKey] ?? input.assetFiles[meta.id]
      if (!bytes) {
        throw new Error(`素材“${meta.filename}”缺少二进制数据，无法试运行`)
      }
      payload.assets[meta.id] = {
        mimeType: meta.mimeType,
        dataUrl: registry.create(
          `project:${meta.id}`,
          bytes,
          meta.mimeType,
        ),
      }
    }

    for (const [recordKey, meta] of Object.entries(input.project.componentPackages)) {
      const component = findComponent(
        input.components,
        recordKey,
        meta.packageId,
        meta.version,
      )
      if (!component) {
        throw new Error(`组件“${meta.name}”缺少包内容，无法试运行`)
      }
      if (
        component.manifest.id !== meta.packageId ||
        component.manifest.version !== meta.version
      ) {
        throw new Error(`组件“${meta.name}”的 ID 或版本与工程记录不一致`)
      }
      const assets: ExportPayload['components'][string]['assets'] = Object.create(null) as
        ExportPayload['components'][string]['assets']
      for (const [assetKey, assetPath] of Object.entries(component.manifest.assets)) {
        const bytes = component.files[assetPath]
        if (!bytes) {
          throw new Error(`组件“${meta.name}”缺少素材“${assetPath}”`)
        }
        const mimeType = inferMimeType(assetPath)
        assets[assetKey] = {
          mimeType,
          dataUrl: registry.create(
            `component:${recordKey}:${assetKey}`,
            bytes,
            mimeType,
          ),
        }
      }
      payload.components[recordKey] = {
        manifest: structuredClone(component.manifest),
        runtimeSource: component.runtimeSource,
        assets,
      }
    }

    assertV3ExportDependencies(payload)
    return {
      payload,
      revoke() {
        registry.dispose()
      },
    }
  } catch (error) {
    registry.dispose()
    throw error
  }
}
