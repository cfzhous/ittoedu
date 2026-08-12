import type {
  ComponentPackageData,
  ExportPayload,
} from '@/shared/componentTypes'
import type { ProjectDocument } from '@/shared/projectTypes'
import { componentPackageKey } from '@/renderer/project/archivePath'
import { assertExportPayloadDependencies } from '@/renderer/export/exportPayloadSupport'

export const SANDBOX_ASSET_PLACEHOLDER_PREFIX =
  'courseware-preview-asset:' as const

export interface RuntimePreviewAssetTransfer {
  placeholder: `${typeof SANDBOX_ASSET_PLACEHOLDER_PREFIX}${number}`
  mimeType: string
  bytes: ArrayBuffer
}

export interface RuntimePreviewPayloadInput {
  project: ProjectDocument
  assetFiles: Readonly<Record<string, Uint8Array>>
  components: Readonly<Record<string, ComponentPackageData>>
}

export interface RuntimePreviewPayloadResources {
  payload: ExportPayload
  assetTransfers: RuntimePreviewAssetTransfer[]
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
 * Sandboxed preview iframes have an opaque origin and cannot consume Blob URLs
 * created by the editor window. Always transfer bytes plus placeholder URLs;
 * the iframe materializes them as same-context Blob URLs without Base64 growth.
 */
export function createRuntimePreviewPayloadResources(
  input: RuntimePreviewPayloadInput,
): RuntimePreviewPayloadResources {
  const assetTransfers: RuntimePreviewAssetTransfer[] = []
  const createAssetUrl = (
    bytes: Uint8Array,
    mimeType: string,
  ): string => {
    const placeholder = `${SANDBOX_ASSET_PLACEHOLDER_PREFIX}${assetTransfers.length}` as const
    assetTransfers.push({
      placeholder,
      mimeType,
      bytes: Uint8Array.from(bytes).buffer,
    })
    return placeholder
  }
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
        dataUrl: createAssetUrl(
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
          dataUrl: createAssetUrl(
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

    assertExportPayloadDependencies(payload)
    return {
      payload,
      assetTransfers,
      revoke() {},
    }
  } catch (error) {
    throw error
  }
}
